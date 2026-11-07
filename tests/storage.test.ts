import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import {
  Storage,
  type KvUnit,
  type StorageBackend,
} from "@deepseek-ai/dsh-storage";
import { JsonStorageBackend } from "@deepseek-ai/dsh-storage-json";
import { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import { PaperWorkbench, paperDomainSpec } from "../src/host.js";
import { createPaper, importDocument, paperView, propose, decide, type Paper } from "../src/model.js";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { isJsonValue } from "@deepseek-ai/dsh-util-values";
import type { SubagentActivationSpec, SubagentResult } from "@deepseek-ai/dsh-subagent";
import { prepareReading } from "../src/reading.js";
import { recordDocumentDelivery } from "../src/delivery.js";
import { proposeRequest, readingRequest } from "../src/contracts.js";
import { PDFDocument } from "pdf-lib";
import type { OfficeToPdfRequest } from "@deepseek-ai/dsh-office-to-pdf";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import type { SubprocessHandle } from "@deepseek-ai/dsh-subprocess";

function fixture() {
  return createPaper({
    id: "paper",
    name: "synthetic.docx",
    originalBase64: "",
    sourceBase64: "",
    warnings: [],
    document: importDocument([
      {
        sourceIndex: 0,
        text: "Keep the confirmed sentence.",
        editable: true,
        style: null,
        runs: [
          { text: "Keep the confirmed sentence.", bold: false, italic: false },
        ],
        reason: null,
      },
    ]),
  });
}
async function open(root: string) {
  const ctx = new Context();
  new LocalFileSystem(ctx, { cwd: root, diffBasisMaxBytes: 10 * 1024 * 1024 });
  const boundary = { openTurnStartSeq: 0, lastTurn: 1 };
  const directions = ["Preserve the confirmed source and propose the requested local clarification."];
  const parent = { id: "task", session: { id: "task" } } as unknown as Agent;
  ctx.provide("agents", { turnBoundaryOf: () => boundary });
  ctx.provide("workingDirectory", { ensure: async (_agent: Agent, signal?: AbortSignal) => { signal?.throwIfAborted(); return root; } });
  ctx.provide("sessionQuery", { observeSession: async () => ({
    events: directions.map((text, index) => ({ seq: boundary.openTurnStartSeq + index, type: "user/message", data: { content: [{ type: "text", text }] } })),
    [Symbol.dispose]() {},
  }) });
  new Storage(ctx);
  const backend = new JsonStorageBackend(root);
  let fail = false,
    gate: Promise<void> | undefined,
    entering: (() => void) | undefined;
  const faultBackend: StorageBackend = {
    close: () => backend.close(),
    kv: {
      open: async (descriptor) => {
        const unit = await backend.kv.open(descriptor);
        return new Proxy(unit, {
          get(target, property) {
            if (property === "putRecord")
              return async (...args: Parameters<KvUnit["putRecord"]>) => {
                entering?.();
                if (gate) await gate;
                if (fail) throw new Error("Injected durable write failure.");
                return target.putRecord(...args);
              };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    },
  };
  ctx.storage.backend.register("test", faultBackend);
  const facility = new DomainFacility(ctx, { backend: "test" });
  const domain = await facility.open(paperDomainSpec);
  const service = new PaperWorkbench(
    ctx,
    domain.table("papers"),
    domain.table("bindings"),
  );
  await service.initialize();
  const calls: object[] = [];
  let sendFailure = false;
  ctx.provide("sessionController", {
    prompt: async (request: object) => {
      calls.push(request);
      if (sendFailure) throw new Error("Injected reply loss after enqueue.");
      return { accepted: true };
    },
  });
  const invoke = (request: object, signal = new AbortController().signal) =>
    service.handle(request, "task", !["create", "import", "link", "propose", "request_translation", "cancel_translation", "import_return", "compare_return", "propose_return", "copy_return_comments"].includes((request as { action: string }).action), signal, parent) as Promise<{
      paper: ReturnType<typeof import("../src/model.js").paperView>;
    }>;
  return {
    ctx,
    domain,
    service,
    parent, boundary, directions,
    invoke,
    calls,
    setFailure(value: boolean) {
      fail = value;
    },
    setSendFailure(value: boolean) {
      sendFailure = value;
    },
    hold() {
      let release!: () => void, entered!: () => void;
      gate = new Promise<void>((r) => {
        release = r;
      });
      const started = new Promise<void>((r) => {
        entered = r;
      });
      entering = entered;
      return {
        started,
        release() {
          gate = undefined;
          entering = undefined;
          release();
        },
      };
    },
    async close() {
      await service.close();
      await domain.close();
      await backend.close();
    },
  };
}
async function seed(host: Awaited<ReturnType<typeof open>>) {
  const paper = fixture();
  await host.domain.table("papers").put(paper.id, paper);
  await host.domain.table("bindings").put("task", { paperId: paper.id });
  return paper;
}

test("explicit primary language survives real Host create, bilingual export, DOCX intake, linking and same-data reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-language-"));
  let host = await open(root), runtime = host.ctx.plugin(LocalSubprocessRuntime);
  await runtime;
  try {
    let view = await host.invoke({ action: "create", requestId: "chinese-draft", name: "Chinese primary.docx", brief: "保留职责。", primaryLanguage: "zh" });
    const id = view.paper.id;
    assert.equal(view.paper.primaryLanguage, "zh"); assert.equal(view.paper.translationLanguage, "en");
    view = await host.invoke({ action: "propose", requestId: "source", reason: "Supplied synthetic roles.",
      operations: [{ kind: "replace", selection: view.paper.blocks[0].selection, replacement: "规划器选择，执行者执行。" }] });
    view = await host.invoke({ action: "decide", candidateIds: [view.paper.candidates[0].id], decision: "accepted", expectedRevision: 0 });
    view = await host.invoke({ action: "request_translation", requestId: "en", sources: [view.paper.blocks[0].selection], replaces: [] });
    await host.service.handle({ action: "complete_translation", jobId: view.paper.translationJobs[0].id,
      groups: [{ sourceIndexes: [0], text: "The planner selects; the worker executes." }] }, "task", false, new AbortController().signal);
    const output = await host.service.handle({ action: "export", requestId: "bilingual-en", variant: "bilingual", format: "docx",
      includeReasons: false, expectedRevision: 1, baselineRevision: 0 }, "task", true, new AbortController().signal) as { base64: string };
    const inspected = await host.service.engine({ action: "inspect", base64: output.base64 }, new AbortController().signal) as {
      blocks: { text: string; runs: { nativeFormat: string }[] }[] };
    assert.deepEqual(inspected.blocks.map(block => block.text), ["规划器选择，执行者执行。", "The planner selects; the worker executes."]);
    assert.match(inspected.blocks[1].runs[0].nativeFormat, /w:val="en-US"/);
    const clean = await host.service.handle({ action: "export", requestId: "clean-zh", variant: "clean", format: "docx",
      includeReasons: false, expectedRevision: 1, baselineRevision: 0 }, "task", true, new AbortController().signal) as { base64: string };
    const sourcePath = join(root, "primary.docx"); await writeFile(sourcePath, Buffer.from(clean.base64, "base64"));
    view = await host.invoke({ action: "import", requestId: "chinese-file", name: "Returned primary.docx", format: "docx", path: sourcePath, primaryLanguage: "zh" });
    assert.notEqual(view.paper.id, id); assert.equal(view.paper.primaryLanguage, "zh");
    assert.equal(view.paper.blocks[0].text, "规划器选择，执行者执行。");
    view = await host.invoke({ action: "link", paperId: id, primaryLanguage: "en" });
    assert.equal(view.paper.primaryLanguage, "zh", "Linking cannot overwrite the existing Paper's language choice.");
    await host.close(); await runtime.dispose();
    host = await open(root); runtime = host.ctx.plugin(LocalSubprocessRuntime); await runtime;
    view = await host.invoke({ action: "read" });
    assert.equal(view.paper.id, id); assert.equal(view.paper.primaryLanguage, "zh"); assert.equal(view.paper.translationLanguage, "en");
    assert.equal(view.paper.blocks[0].text, "规划器选择，执行者执行。");
  } finally { await host.close(); await runtime.dispose(); await rm(root, { recursive: true }); }
});
function storedPaper(host: Awaited<ReturnType<typeof open>>) {
  const paper = host.domain.table("papers").get("paper");
  assert.ok(paper && "history" in paper);
  return paper;
}
const readingInput = { action: "read_independently", requestId: "reading", candidateIds: [], goal: "Check the confirmed source.", evidence: "Synthetic facts only." };
async function seedWriting(host: Awaited<ReturnType<typeof open>>) {
  let paper = await seed(host);
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "write", reason: "Clarify the supplied statement.",
    operations: [{ kind: "replace", selection: paperView(paper).blocks[0].selection, replacement: "Keep the confirmed sentence exactly." }] }),
    { sessionId: "task", turn: host.boundary.lastTurn, turnStartSeq: host.boundary.openTurnStartSeq });
  await host.domain.table("papers").put(paper.id, paper);
  return paper;
}
function waitForReading(host: Awaited<ReturnType<typeof open>>, status: string) {
  if (storedPaper(host).readings.some(reading => reading.status === status)) return Promise.resolve();
  return new Promise<void>(resolve => { const off = host.ctx.on("domain/changed", () => {
    if (storedPaper(host).readings.some(reading => reading.status === status)) { off(); resolve(); }
  }); });
}
const readingResult: SubagentResult = {
  stopReason: "completed", output: [],
  structured: { interpretation: { problem: "A confirmed statement", mechanism: "Keep it intact", feedbackRole: "Clarification" }, findings: [], limits: ["Synthetic source only"] },
};

test("document delivery is durable before download and retries return the original receipt after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-document-delivery-"));
  let host = await open(root);
  const request = { action: "export", requestId: "delivery", variant: "tracked", format: "docx", includeReasons: false,
    expectedRevision: 0, baselineRevision: 0 };
  try {
    const paper = await seed(host);
    let calls = 0;
    host.service.engine = async raw => {
      calls++;
      assert.equal((raw as { delivery: { id: string } }).delivery.id, request.requestId);
      return { base64: "ZmlsZQ==", anchors: [{ blockId: paperView(paper).blocks[0].id, nativeId: "00000001" }] };
    };
    const output = await host.service.handle(request, "task", true, new AbortController().signal);
    assert.equal(isJsonValue(output), true);
    assert.equal(storedPaper(host).documentDeliveries[0].base64, "ZmlsZQ==");
    assert.equal(calls, 1);
    assert.deepEqual(await host.service.handle(request, "task", true, new AbortController().signal), output);
    assert.equal(calls, 1);
    const view = await host.invoke({ action: "read" });
    assert.equal("base64" in view.paper.documentDeliveries[0], false);
    await host.close(); host = await open(root);
    host.service.engine = async () => { throw new Error("A retry must not regenerate immutable output."); };
    assert.deepEqual(await host.service.handle(request, "task", true, new AbortController().signal), output);
    assert.deepEqual(await host.service.handle({ action: "download_delivery", deliveryId: "delivery" }, "task", true, new AbortController().signal), output);
    await assert.rejects(host.service.handle({ ...request, includeReasons: true }, "task", true, new AbortController().signal), /different content/);
    await assert.rejects(host.service.handle(request, "task", false, new AbortController().signal));
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("PDF delivery defers DOCX generation to shared admission and never persists cancelled or failed output", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-document-pdf-")), host = await open(root);
  try {
    const paper = await seed(host);
    const source = await PDFDocument.create(); source.addPage().drawText("A reading copy.");
    const sharedPdf = await source.save(), before = sharedPdf.slice();
    let admitted = false, cancelled = false, engineCalls = 0, captured: OfficeToPdfRequest | undefined;
    host.service.engine = async raw => {
      engineCalls++; assert.equal(admitted, true);
      assert.ok((raw as { maxOutputBytes: number }).maxOutputBytes <= 1025);
      return { base64: "ZmlsZQ==", anchors: [{ blockId: paperView(paper).blocks[0].id, nativeId: "00000001" }] };
    };
    host.ctx.provide("officeToPdf", {
      convert: async (request: OfficeToPdfRequest, signal: AbortSignal) => {
        captured = request;
        if (cancelled) return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        assert.equal(engineCalls, 0);
        assert.equal(request.source.bytes, undefined);
        admitted = true;
        const input = await request.source.read(signal, 1024);
        assert.equal(input.version, request.source.version);
        return { pdf: sharedPdf, missingFonts: [], cacheKey: "cache", generation: "provider" };
      },
    });
    const request = { action: "export", requestId: "pdf", variant: "clean", format: "pdf", includeReasons: false,
      expectedRevision: 0, baselineRevision: 0 };
    await host.service.handle(request, "task", true, new AbortController().signal);
    assert.equal(engineCalls, 1);
    assert.ok(captured?.source.key.includes(paper.id));
    const version = JSON.parse(captured!.source.version);
    assert.equal(version.revision, 0); assert.equal(version.baselineRevision, 0); assert.equal(version.variant, "clean");
    assert.deepEqual(sharedPdf, before);
    const saved = storedPaper(host).documentDeliveries[0];
    assert.equal(saved.format, "pdf"); assert.equal(saved.sourceDocxBase64, "ZmlsZQ==");
    assert.equal((await PDFDocument.load(Buffer.from(saved.base64, "base64"), { updateMetadata: false })).context.trailerInfo.Info, undefined);
    cancelled = true;
    const controller = new AbortController();
    const pending = host.service.handle({ ...request, requestId: "cancelled" }, "task", true, controller.signal);
    controller.abort(new Error("Cancelled before source admission."));
    await assert.rejects(pending, /Cancelled/);
    assert.equal(engineCalls, 1);
    assert.equal(storedPaper(host).documentDeliveries.length, 1);
    await assert.rejects(host.service.handle({ ...request, requestId: "stale", baselineRevision: 1 }, "task", true, new AbortController().signal), /baseline changed/);
    assert.equal(storedPaper(host).documentDeliveries.length, 1);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("Markdown intake uses the real managed subprocess and SDK, retains original resources and joins cancellation before shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-markdown-")), host = await open(root);
  const runtime = host.ctx.plugin(LocalSubprocessRuntime);
  await runtime;
  const handles: SubprocessHandle[] = [];
  const spawn = host.ctx.subprocess.spawn.bind(host.ctx.subprocess);
  host.ctx.subprocess.spawn = spec => { const handle = spawn(spec); handles.push(handle); return handle; };
  try {
    const source = "# Method\n\nThe result remains unverified. 中文原稿。\n";
    const resource = { path: "refs/source.bib", base64: Buffer.from("@misc{unused, title={A supplied resource}}\n").toString("base64") };
    await writeFile(join(root, "source.md"), source); await writeFile(join(root, "source.bib"), Buffer.from(resource.base64, "base64"));
    const imported = await host.invoke({ action: "import", requestId: "markdown-file", format: "markdown", name: "source.md", path: "source.md", resources: [{ path: resource.path, sourcePath: "source.bib" }] });
    assert.equal(imported.paper.sourceFormat, "markdown");
    assert.deepEqual(imported.paper.sourceResources, [{ path: resource.path }]);
    assert.ok(imported.paper.blocks.some(block => block.text.includes("中文原稿")));
    const stored = host.domain.table("papers").get(imported.paper.id);
    assert.ok(stored && "history" in stored);
    assert.equal(Buffer.from(stored.originalBase64, "base64").toString("utf8"), source);
    assert.deepEqual(stored.sourceResources, [resource]);
    assert.equal(handles.length, 3, "One Markdown process and two SDK boundaries use the same DSH subprocess service.");
    assert.deepEqual(await host.service.handle({ action: "download_source", resourcePath: resource.path }, "task", true, new AbortController().signal), { base64: resource.base64, name: "source.bib" });
    await writeFile(join(root, "cancelled.md"), "# Cancelled\n\n" + "Data. ".repeat(100000));
    const pending = host.service.handle({ action: "import", requestId: "cancelled-file", format: "markdown", name: "cancelled.md", path: "cancelled.md", resources: [] }, "task", false, new AbortController().signal, host.parent);
    await new Promise(resolve => setTimeout(resolve, 20));
    const rejected = assert.rejects(pending);
    await host.service.close(); await rejected;
    assert.equal(host.domain.table("bindings").get("task")?.paperId, imported.paper.id);
    assert.equal([...host.domain.table("papers").entries()].length, 1);
    assert.ok((await Promise.all(handles.map(handle => handle.waitForExit()))).every(Boolean));
  } finally { await host.close(); await runtime.dispose(); await rm(root, { recursive: true }); }
});

test("production native reading uses the DSH fresh/caller seam, validates structured capture and returns lossless JSON without changing the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seedWriting(host);
    const before = JSON.stringify(storedPaper(host).document), calls: SubagentActivationSpec[] = [];
    let disposed = false;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      calls.push(spec);
      return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => { disposed = true; } };
    } });
    const parent = { id: "task", hiddenParentReasoning: "PRIVATE_PARENT_REASONING" } as unknown as Agent;
    await host.service.completeWritingTurn(parent, 1, new AbortController().signal);
    const result = await host.invoke({ action: "read" });
    assert.equal(isJsonValue(result), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, "spawn");
    assert.equal(calls[0].delivery, "caller");
    assert.strictEqual(calls[0].request.parent, parent);
    assert.equal(calls[0].request.agentPreset, undefined);
    assert.ok(calls[0].request.outputSchema);
    assert.ok(!JSON.stringify(calls[0].request.prompt).includes("PRIVATE_PARENT_REASONING"));
    assert.equal(storedPaper(host).readings[0].status, "completed");
    assert.equal(JSON.stringify(storedPaper(host).document), before);
    assert.equal(disposed, true);
    await host.service.completeWritingTurn(parent, 1, new AbortController().signal);
    assert.equal(calls.length, 1, "An identical completed retry cannot start another chargeable child.");
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("only the exact owned child reads its frozen packet through the production Host; parent edits and ordinary task semantics remain separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    let paper = await seed(host);
    paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "p", operations: [{ kind: "replace", selection: paperView(paper).blocks[0].selection, replacement: "Keep the confirmed sentence exactly." }], reason: "Clarify the preservation requirement." }));
    const prepared = prepareReading(paper, readingRequest.parse({ ...readingInput, candidateIds: "all" }), "task");
    await host.domain.table("papers").put("paper", prepared.paper);
    const childId = prepared.reading.childId;
    const read = (id: string, human = false) => host.service.handle({ action: "read" }, id, human, new AbortController().signal, { id } as Agent) as Promise<{ paper: null | ReturnType<typeof paperView>; available: object[]; reading?: ReturnType<typeof import("../src/reading.js").readingPacket> }>;
    const initial = await read(childId);
    assert.equal(isJsonValue(initial), true);
    assert.equal(initial.paper, null);
    assert.deepEqual(initial.available, []);
    assert.equal(initial.reading?.childSessionId, childId);
    assert.equal(initial.reading?.parentSessionId, "task");
    assert.equal(initial.reading?.baselineBlocks[0].text, "Keep the confirmed sentence.");
    assert.equal(initial.reading?.candidateBlocks[0].text, "Keep the confirmed sentence exactly.");
    const later = decide(prepared.paper, paper.candidates[0].id, "accepted");
    await host.domain.table("papers").put("paper", later);
    await host.domain.table("bindings").put(childId, { paperId: "paper" });
    assert.deepEqual(await read(childId, true), initial, "Even a binding cannot turn an owned frozen reader into the live author body.");
    assert.equal((await read("task")).paper?.revision, 1);
    const unrelated = await read("ordinary-unlinked");
    assert.equal(unrelated.paper, null);
    assert.equal(unrelated.reading, undefined);
    assert.equal(unrelated.available.length, 1);
    const before = JSON.stringify(storedPaper(host));
    for (const [human, command] of [
      [false, { action: "create", requestId: "forbidden", name: "Forbidden", brief: "" }],
      [false, { action: "import", requestId: "forbidden-file", path: "unread.docx" }],
      [false, { action: "link", paperId: "paper" }],
      [true, { action: "save_feedback", id: randomUUID(), expectedVersion: 0, target: { kind: "source", selections: [paperView(later).blocks[0].selection] }, comment: "Forbidden mutation" }],
    ] as const)
      await assert.rejects(host.service.handle(command, childId, human, new AbortController().signal, { id: childId } as Agent), /frozen material read only/);
    assert.equal(JSON.stringify(storedPaper(host)), before);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("reading cancellation targets its owned activation and retains a late completion as evidence without publishing a verdict", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seedWriting(host);
    let finish!: (result: SubagentResult) => void, disposed = false;
    const result = new Promise<SubagentResult>(resolve => { finish = resolve; });
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => ({ childId: spec.childId, result, dispose: async () => { disposed = true; } }) });
    const pending = host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    await waitForReading(host, "running");
    const id = storedPaper(host).readings[0].id;
    assert.equal(storedPaper(host).readings[0].status, "running");
    await host.invoke({ action: "cancel_reading", readingId: id });
    assert.equal(disposed, true);
    const terminal = new Promise<void>(resolve => {
      const off = host.ctx.on("domain/changed", () => {
        if (storedPaper(host).readings[0].terminal) { off(); resolve(); }
      });
    });
    finish(readingResult);
    await terminal;
    await pending;
    assert.equal(storedPaper(host).readings[0].status, "cancelled");
    assert.equal(storedPaper(host).readings[0].output, undefined);
    assert.ok(storedPaper(host).readings[0].terminal);
    assert.equal(isJsonValue(await host.invoke({ action: "read" })), true);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("a child failure is a durable reading failure, never a completed quality verdict", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seedWriting(host);
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => ({ childId: spec.childId, result: Promise.resolve({ stopReason: "error", output: [], diagnostic: "Evidence could not be read." }), dispose: async () => {} }) });
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    assert.equal(storedPaper(host).readings[0].status, "failed");
    assert.equal(storedPaper(host).readings[0].output, undefined);
    assert.match(storedPaper(host).readings[0].diagnostic!, /Evidence/);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("cancelling the native reading caller disposes only its owned child and records cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seedWriting(host);
    let finish!: (result: SubagentResult) => void, admitted!: () => void, disposed = false;
    const result = new Promise<SubagentResult>(resolve => { finish = resolve; });
    const started = new Promise<void>(resolve => { admitted = resolve; });
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      admitted();
      return { childId: spec.childId, result, dispose: async () => { disposed = true; finish({ stopReason: "aborted", output: [] }); } };
    } });
    const signal = new AbortController();
    const pending = host.service.completeWritingTurn(host.parent, 1, signal.signal);
    await started;
    signal.abort();
    await pending;
    assert.equal(disposed, true);
    assert.equal(storedPaper(host).readings[0].status, "cancelled");
    assert.equal(storedPaper(host).readings[0].output, undefined);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("same-data restart marks an unfinished reading interrupted without starting another child or discarding its original material", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-"));
  let host = await open(root);
  try {
    await seed(host);
    const prepared = prepareReading(storedPaper(host), readingRequest.parse(readingInput), "task");
    await host.domain.table("papers").put("paper", prepared.paper);
    const material = JSON.stringify(prepared.reading.material);
    await host.close();
    host = await open(root);
    const restored = storedPaper(host).readings[0];
    assert.equal(restored.status, "interrupted");
    assert.equal(JSON.stringify(restored.material), material);
    assert.equal(restored.childId, prepared.reading.childId);
    assert.equal(restored.output, undefined);
    assert.equal(isJsonValue(await host.invoke({ action: "read" })), true);
    const childRead = await host.service.handle({ action: "read" }, restored.childId, false, new AbortController().signal) as { reading: { readingId: string; baselineBlocks: { text: string }[] } };
    assert.equal(childRead.reading.readingId, restored.id);
    assert.equal(childRead.reading.baselineBlocks[0].text, "Keep the confirmed sentence.");
    assert.equal(isJsonValue(childRead), true);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("failed durable reading admission cannot start a child", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seedWriting(host);
    let starts = 0;
    host.ctx.provide("subagents", { startActivation: async () => { starts++; throw new Error("Must not start"); } });
    host.setFailure(true);
    await assert.rejects(host.service.completeWritingTurn(host.parent, 1, new AbortController().signal), /Injected durable write failure/);
    assert.equal(starts, 0);
    assert.equal(storedPaper(host).readings.length, 0);
  } finally { host.setFailure(false); await host.close(); await rm(root, { recursive: true }); }
});

test("a rejected DSH cleanup retains valid results and a diagnostic, clears owned handles, and retries without another child or native error", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seedWriting(host);
    let starts = 0, disposals = 0;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      starts++;
      return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => { disposals++; throw new Error("ACTIVATION_TEARDOWN_FAILED: representative cleanup rejection"); } };
    } });
    for (let i = 0; i < 2; i++) {
      await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
      const response = await host.invoke({ action: "read" });
      assert.equal(isJsonValue(response), true);
      assert.equal(storedPaper(host).readings[0].status, "completed");
      assert.ok(storedPaper(host).readings[0].output);
      assert.match(storedPaper(host).readings[0].diagnostic!, /ACTIVATION_TEARDOWN_FAILED/);
      assert.equal((host.service as unknown as { readingRuns: Map<string, unknown> }).readingRuns.size, 0);
    }
    assert.equal(starts, 1);
    assert.equal(disposals, 1, "The plugin does not introduce cleanup retries or reopen a chargeable reader.");
    assert.equal((host.service as unknown as { requests: Set<unknown> }).requests.size, 0);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("actual DSH domain and JSON backend preserve aggregate and events on a failed Host decision, then reopen the same durable state", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-storage-"));
  let host = await open(root);
  try {
    await seed(host);
    const initial = await host.invoke({ action: "read" });
    const proposal = await host.invoke({
      action: "propose",
      requestId: "change",
      operations: [
        {
          kind: "replace",
          selection: initial.paper.blocks[0].selection,
          replacement: "Keep the exact confirmed sentence.",
        },
      ],
      reason: "Add a qualifier.",
    });
    const bytes = await readFile(join(root, "paper_workbench.json"));
    let changes = 0;
    const dispose = host.ctx.on("domain/changed", () => {
      changes++;
    });
    host.setFailure(true);
    await assert.rejects(
      host.invoke({
        action: "decide",
        candidateIds: [proposal.paper.candidates[0].id],
        decision: "accepted",
        expectedRevision: 0,
      }),
      /Injected durable write failure/,
    );
    assert.equal(changes, 0);
    assert.equal((await host.invoke({ action: "read" })).paper.revision, 0);
    assert.deepEqual(await readFile(join(root, "paper_workbench.json")), bytes);
    dispose();
    host.setFailure(false);
    await host.invoke({
      action: "decide",
      candidateIds: [proposal.paper.candidates[0].id],
      decision: "accepted",
      expectedRevision: 0,
    });
    await host.close();
    host = await open(root);
    const restored = await host.invoke({ action: "read" });
    assert.equal(restored.paper.revision, 1);
    assert.equal(restored.paper.decisions.length, 1);
    assert.equal(
      restored.paper.blocks[0].text,
      "Keep the exact confirmed sentence.",
    );
    await host.invoke({
      action: "undo",
      decisionId: restored.paper.decisions[0].id,
      expectedRevision: 1,
    });
    assert.equal(
      (await host.invoke({ action: "read" })).paper.blocks[0].text,
      initial.paper.blocks[0].text,
    );
  } finally {
    await host.close();
    await rm(root, { recursive: true });
  }
});

test("cancellation at the queued Host update slot preserves saved feedback and rejects the cancelled change", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-storage-"));
  const host = await open(root);
  try {
    await seed(host);
    const initial = await host.invoke({ action: "read" });
    const proposed = await host.invoke({
      action: "propose",
      requestId: "change",
      operations: [
        {
          kind: "replace",
          selection: initial.paper.blocks[0].selection,
          replacement: "Accepted content.",
        },
      ],
      reason: "Synthetic content.",
    });
    const hold = host.hold();
    const accepting = host.invoke({
      action: "decide",
      candidateIds: [proposed.paper.candidates[0].id],
      decision: "accepted",
      expectedRevision: 0,
    });
    await hold.started;
    const cancellation = new AbortController();
    const cancelled = host.invoke(
      {
        action: "save_feedback", id: randomUUID(), expectedVersion: 0,
        target: {
          kind: "source",
          selections: [initial.paper.blocks[0].selection],
        },
        comment: "Must not be saved.",
      },
      cancellation.signal,
    );
    const cancellationResult = assert.rejects(cancelled, /abort/i);
    await Promise.resolve();
    cancellation.abort();
    hold.release();
    await accepting;
    await cancellationResult;
    const current = await host.invoke({ action: "read" });
    assert.equal(current.paper.revision, 1);
    assert.equal(current.paper.feedback.length, 0);
    const note = {
      action: "save_feedback", id: randomUUID(), expectedVersion: 0,
      target: {
        kind: "source",
        selections: [current.paper.blocks[0].selection],
      },
      comment: "Keep this saved feedback.",
    };
    await host.invoke(note);
    const preAborted = AbortSignal.abort();
    await assert.rejects(
      host.invoke({ ...note, requestId: "not-saved" }, preAborted),
      /abort/i,
    );
    assert.equal(
      (await host.invoke({ action: "read" })).paper.feedback.length,
      1,
    );
  } finally {
    await host.close();
    await rm(root, { recursive: true });
  }
});

test("the production observation owner emits committed state and releases on cancellation; concurrent acceptance cannot overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-storage-"));
  const host = await open(root);
  try {
    await seed(host);
    const cancel = new AbortController();
    const stream = host.service.observe(
      { id: "task" as SessionId } as Agent,
      cancel.signal,
    );
    const initial = (await stream.next()).value!;
    assert.equal(initial.paper!.revision, 0);
    const proposed = await host.invoke({
      action: "propose",
      requestId: "one",
      operations: [
        {
          kind: "replace",
          selection: initial.paper!.blocks[0].selection,
          replacement: "First choice.",
        },
      ],
      reason: "First choice.",
    });
    assert.equal((await stream.next()).value!.paper!.candidates.length, 1);
    const second = await host.invoke({
      action: "propose",
      requestId: "two",
      operations: [
        {
          kind: "replace",
          selection: initial.paper!.blocks[0].selection,
          replacement: "Second choice.",
        },
      ],
      reason: "Second choice.",
    });
    const results = await Promise.allSettled([
      host.invoke({
        action: "decide",
        candidateIds: [proposed.paper.candidates[0].id],
        decision: "accepted",
        expectedRevision: 0,
      }),
      host.invoke({
        action: "decide",
        candidateIds: [second.paper.candidates[1].id],
        decision: "accepted",
        expectedRevision: 0,
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await host.invoke({ action: "read" })).paper.blocks[0].text,
      "First choice.",
    );
    await stream.next();
    const waiting = stream.next();
    cancel.abort();
    assert.equal((await waiting).done, true);
  } finally {
    await host.close();
    await rm(root, { recursive: true });
  }
});

test("one comment submission preserves its batch and native prompt identity after reply loss", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-storage-")), host = await open(root);
  try {
    await seed(host);
    const initial = await host.invoke({ action: "read" });
    const feedback = await host.invoke({ action: "save_feedback", id: randomUUID(), expectedVersion: 0,
      target: { kind: "source", selections: [initial.paper.blocks[0].selection] }, comment: "Preserve confirmed wording." });
    assert.equal(host.calls.length, 0, "Autosaving a comment cannot send a model prompt.");
    const request = { action: "submit_batch", requestId: "batch", feedbackIds: [feedback.paper.feedback[0].id],
      feedbackVersions: [{ id: feedback.paper.feedback[0].id, version: feedback.paper.feedback[0].version }], direction: "Minimal necessary change." };
    host.setSendFailure(true);
    await assert.rejects(host.invoke(request), /reply loss/);
    const failed = await host.invoke({ action: "read" }), id = failed.paper.batches[0].id;
    assert.equal(failed.paper.batches.length, 1); assert.equal(failed.paper.batches[0].delivery, "ready");
    assert.match(failed.paper.batches[0].error!, /reply loss/);
    await host.invoke({ action: "resolve_feedback", id: feedback.paper.feedback[0].id, expectedVersion: feedback.paper.feedback[0].version, resolved: true });
    host.setSendFailure(false);
    const retried = await host.invoke(request);
    assert.equal(retried.paper.batches.length, 1); assert.equal(retried.paper.batches[0].id, id);
    assert.equal(retried.paper.batches[0].delivery, "sent"); assert.equal(Object.hasOwn(retried.paper.batches[0], "error"), false);
    assert.equal(isJsonValue(retried), true); assert.equal(host.calls.length, 2);
    assert.deepEqual(host.calls[0], host.calls[1]);
    await host.invoke(request); assert.equal(host.calls.length, 2);
    assert.match(failed.paper.batches[0].error!, /reply loss/, "Earlier failed values remain immutable.");
    await assert.rejects(host.invoke({ action: "send", kind: "batch", id }));
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("the ordinary Agent prepares and completes translations in its existing turn without a second Send", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-storage-")),
    host = await open(root);
  try {
    await seed(host);
    const initial = await host.invoke({ action: "read" });
    const prepared = await host.invoke({
      action: "request_translation",
      requestId: "translation",
      sources: [initial.paper.blocks[0].selection],
      replaces: [],
    });
    const id = prepared.paper.translationJobs[0].id;
    const sent = prepared;
    assert.equal(host.calls.length, 0);
    assert.equal(isJsonValue(sent), true);
    assert.equal(Object.hasOwn(sent.paper.translationJobs[0], "error"), false);
    const signal = new AbortController().signal;
    assert.equal(
      isJsonValue(
        await host.service.handle({ action: "read" }, "task", false, signal),
      ),
      true,
    );
    const completed = await host.service.handle(
      {
        action: "complete_translation",
        jobId: id,
        groups: [{ sourceIndexes: [0], text: "保留已确认的句子。" }],
      },
      "task",
      false,
      signal,
    );
    assert.equal(isJsonValue(completed), true);
    const current = await host.invoke({ action: "read" });
    assert.equal(current.paper.translationJobs[0].status, "completed");
    assert.deepEqual(current.paper.blocks, initial.paper.blocks);
  } finally {
    await host.close();
    await rm(root, { recursive: true });
  }
});

test("shared font configuration refuses active paper writes and its owning configuration action can finish across Paper close", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-font-reload-")), host = await open(root);
  try {
    await seed(host);
    const original = await host.invoke({ action: "read" });
    const entry = { options: { name: "@deepseek-ai/dsh-office-to-pdf", config: { timeoutMs: 60000, fontDirectories: ["/Existing"] } }, fiber: { state: 2 } };
    let edits = 0;
    host.ctx.provide("configEditor", { entries: () => [entry], edit: async (_entry: unknown, change: (current: object) => object) => {
      const next = change(entry.options.config);
      // Dependency reload closes Paper while ConfigEditor is still applying.
      await host.service.close();
      entry.options.config = next as typeof entry.options.config; edits++;
    } } as never);
    const held = host.hold();
    const saving = host.invoke({ action: "save_feedback", id: randomUUID(), expectedVersion: 0, target: { kind: "source", selections: [original.paper.blocks[0].selection] }, comment: "Keep this durable feedback." });
    await held.started;
    const request = { action: "configure_pdf_fonts", directories: ["/System/Library/Fonts", "/Library/Fonts"], expectedDirectories: ["/Existing"], sharedPreviews: true };
    await assert.rejects(host.invoke(request), /Finish or cancel active paper/);
    assert.equal(edits, 0);
    held.release(); await saving;
    const configured = await host.service.handle(request, "task", true, AbortSignal.timeout(2000)) as { pdfFonts: { directories: string[] } };
    assert.deepEqual(configured.pdfFonts.directories, request.directories); assert.equal(edits, 1);
    const saved = host.domain.table("papers").get("paper");
    assert.ok(saved && "feedback" in saved); assert.equal(saved.feedback.length, 1);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("an admitted global font edit prevents new paper mutations while its existing owner applies the configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-font-admission-")), host = await open(root);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await seed(host);
    const entry = { options: { name: "@deepseek-ai/dsh-office-to-pdf", config: { fontDirectories: ["/Existing"] } }, fiber: { state: 2 } };
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    host.ctx.provide("configEditor", { entries: () => [entry], edit: async (_entry: unknown, change: (current: object) => object) => {
      const next = change(entry.options.config); entered(); await gate; entry.options.config = next as typeof entry.options.config;
    } } as never);
    const applying = host.invoke({ action: "configure_pdf_fonts", directories: ["/Library/Fonts"], expectedDirectories: ["/Existing"], sharedPreviews: true });
    await started;
    const current = await host.invoke({ action: "read" });
    await assert.rejects(host.invoke({ action: "save_feedback", id: randomUUID(), expectedVersion: 0, target: { kind: "source", selections: [current.paper.blocks[0].selection] }, comment: "Not admitted during reload." }), /settings are being applied/);
    release(); await applying;
    assert.deepEqual((await host.invoke({ action: "read" })).paper.feedback, []);
  } finally { release(); await host.close(); await rm(root, { recursive: true }); }
});

test("a completed writing turn aggregates its complete candidate combination and deduplicates stop-hook reentry", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-auto-round-")), host = await open(root);
  try {
    await seed(host);
    const source = (await host.invoke({ action: "read" })).paper.blocks[0].selection;
    const add = (quote: string, replacement: string) => host.invoke({ action: "propose", requestId: randomUUID(), reason: "A scoped synthetic change.",
      operations: [{ kind: "replace", selection: { ...source, from: source.quote.indexOf(quote), to: source.quote.indexOf(quote) + quote.length, quote }, replacement }] });
    const calls: SubagentActivationSpec[] = [];
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      calls.push(spec); return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => {} };
    } });
    await add("Keep", "Retain"); await add("confirmed", "supplied");
    assert.equal(calls.length, 0, "Individual propose calls cannot start a premature reader.");
    const signal = new AbortController().signal;
    await Promise.all([host.service.completeWritingTurn(host.parent, 1, signal), host.service.completeWritingTurn(host.parent, 1, signal)]);
    assert.equal(calls.length, 1); assert.equal(storedPaper(host).readings.length, 1);
    assert.equal(storedPaper(host).readings[0].candidateIds.length, 2);
    assert.equal(storedPaper(host).readings[0].automatic?.turnStartSeq, 0);
    await host.service.completeWritingTurn(host.parent, 1, signal);
    assert.equal(calls.length, 1);
    await add("sentence", "statement");
    await host.service.completeWritingTurn(host.parent, 1, signal);
    assert.equal(calls.length, 2); assert.equal(storedPaper(host).readings[1].candidateIds.length, 3);
    assert.equal(storedPaper(host).readings[1].replaces, storedPaper(host).readings[0].id);
    await host.service.completeWritingTurn({ id: storedPaper(host).readings[1].childId } as Agent, 1, signal);
    assert.equal(calls.length, 2, "An owned reader cannot recursively start a paper reader.");
    host.boundary.lastTurn = 2; host.boundary.openTurnStartSeq = 100;
    await host.service.completeWritingTurn(host.parent, 2, signal);
    assert.equal(calls.length, 2, "A later ordinary answer without new writing cannot review the old round again.");
    assert.equal(storedPaper(host).revision, 0); assert.equal(storedPaper(host).decisions.length, 0);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("pending draft revision is durable, refuses a late old acceptance and triggers only the new turn's fresh combination", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-pending-revision-"));
  let host = await open(root);
  try {
    const document = importDocument([{ sourceIndex: 0, text: "", editable: true, style: null, reason: null, runs: [] }]);
    const blank = { ...fixture(), document, baseline: document };
    await host.domain.table("papers").put(blank.id, blank);
    await host.domain.table("bindings").put("task", { paperId: blank.id });
    const starts: SubagentActivationSpec[] = [];
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      starts.push(spec); return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => {} };
    } });
    const selection = (await host.invoke({ action: "read" })).paper.blocks[0].selection;
    let view = await host.invoke({ action: "propose", requestId: "first-draft", reason: "A supplied method draft.",
      operations: [{ kind: "fill_draft", selection, paragraphs: ["The design guarantees clarity.", "The human decides."] }],
      translations: [{ operationIndexes: [0], paragraphIndexes: [0], text: "该设计保证清晰。" }, { operationIndexes: [0], paragraphIndexes: [1], text: "人类决定。" }] });
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    const originalCandidate = structuredClone(storedPaper(host).candidates[0]), originalReading = structuredClone(storedPaper(host).readings[0]);
    host.boundary.lastTurn = 2; host.boundary.openTurnStartSeq = 100;
    const revision = { action: "propose", requestId: "corrected-draft", revises: [originalCandidate.id], reason: "State the mechanism without an unmeasured effect.",
      operations: [{ kind: "fill_draft", selection, paragraphs: ["The design separates interpretation from authority.", "The human decides."] }],
      translations: [{ operationIndexes: [0], paragraphIndexes: [0], text: "该设计区分解释与权威。" }, { operationIndexes: [0], paragraphIndexes: [1], text: "人类决定。" }] };
    host.setFailure(true);
    await assert.rejects(host.invoke(revision), /Injected durable write failure/);
    host.setFailure(false);
    assert.deepEqual(storedPaper(host).candidates, [originalCandidate]);
    const held = host.hold(), saving = host.invoke(revision);
    await held.started;
    const late = assert.rejects(host.invoke({ action: "decide", candidateIds: [originalCandidate.id], decision: "accepted", expectedRevision: 0 }), /revised/);
    held.release(); view = await saving; await late;
    await host.invoke(revision);
    assert.equal(starts.length, 1, "Revision propose calls do not start premature readers.");
    await Promise.all([host.service.completeWritingTurn(host.parent, 2, new AbortController().signal), host.service.completeWritingTurn(host.parent, 2, new AbortController().signal)]);
    assert.equal(starts.length, 2); assert.notEqual(starts[0].childId, starts[1].childId);
    const latestId = view.paper.candidates.at(-1)!.id;
    assert.deepEqual(storedPaper(host).readings[1].candidateIds, [latestId]);
    assert.deepEqual(storedPaper(host).candidates[0], originalCandidate); assert.deepEqual(JSON.parse(JSON.stringify(storedPaper(host).readings[0])), originalReading);
    assert.equal(storedPaper(host).revision, 0); assert.deepEqual(storedPaper(host).history, []); assert.deepEqual(storedPaper(host).decisions, []);
    await host.close(); host = await open(root);
    view = await host.invoke({ action: "read" });
    assert.equal(view.paper.candidates[0].status, "superseded"); assert.equal(view.paper.candidates[1].status, "pending");
    assert.deepEqual(storedPaper(host).candidates[0], originalCandidate); assert.deepEqual(JSON.parse(JSON.stringify(storedPaper(host).readings[0])), originalReading);
    await assert.rejects(host.invoke({ action: "decide", candidateIds: [originalCandidate.id], decision: "accepted", expectedRevision: 0 }), /revised/);
    assert.equal(storedPaper(host).readings.length, 2); assert.equal(storedPaper(host).revision, 0);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("new user directions in the same native writing turn create one replacement reading even when candidates stay unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-auto-steering-")), host = await open(root);
  try {
    await seedWriting(host);
    let starts = 0;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      starts++; return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => {} };
    } });
    const signal = new AbortController().signal;
    await host.service.completeWritingTurn(host.parent, 1, signal);
    const first = storedPaper(host).readings[0], original = JSON.stringify(first);
    assert.equal(starts, 1);
    const added = "Also check whether this clarification contradicts the abstract's stronger claim.";
    host.directions.push(added);
    await Promise.all([host.service.completeWritingTurn(host.parent, 1, signal), host.service.completeWritingTurn(host.parent, 1, signal)]);
    const readings = storedPaper(host).readings;
    assert.equal(starts, 2); assert.equal(readings.length, 2);
    assert.deepEqual(readings[1].candidateIds, first.candidateIds);
    assert.equal(readings[1].sourceRevision, first.sourceRevision);
    assert.equal(readings[1].replaces, first.id); assert.ok(readings[1].goal.includes(added));
    assert.ok(readings[1].goal.includes(host.directions[0]));
    assert.equal(JSON.stringify(readings[0]), original, "The earlier reading keeps its original frozen inputs and result.");
    await host.service.completeWritingTurn(host.parent, 1, signal);
    assert.equal(starts, 2, "The same actual directions and candidate combination stay idempotent.");
    host.boundary.lastTurn = 2; host.boundary.openTurnStartSeq = 100; host.directions.push("An unrelated later question.");
    await host.service.completeWritingTurn(host.parent, 2, signal);
    assert.equal(starts, 2, "A later turn with no paper candidate cannot start a reader.");
    assert.equal(storedPaper(host).revision, 0); assert.equal(storedPaper(host).decisions.length, 0);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("first-draft candidates trigger one automatic reader while unrelated and translation-only turns do not", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-auto-draft-")), host = await open(root);
  try {
    let starts = 0;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      starts++; return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => {} };
    } });
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    assert.equal(starts, 0);
    const translated = await seed(host);
    const prepared = await host.invoke({ action: "request_translation", requestId: "translation-only", sources: [paperView(translated).blocks[0].selection], replaces: [] });
    await host.service.handle({ action: "complete_translation", jobId: prepared.paper.translationJobs[0].id,
      groups: [{ sourceIndexes: [0], text: "保留已确认的句子。" }] }, "task", false, new AbortController().signal, host.parent);
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    assert.equal(starts, 0, "Completing a translation job without content candidates cannot start a scientific reader.");
    const paper = fixture();
    paper.document = importDocument([{ sourceIndex: 0, text: "", editable: true, style: null, runs: [], reason: null }]); paper.baseline = paper.document;
    await host.domain.table("papers").put(paper.id, paper); await host.domain.table("bindings").put("task", { paperId: paper.id });
    await host.invoke({ action: "propose", requestId: "first-draft", reason: "Two supplied synthetic statements.",
      operations: [{ kind: "fill_draft", selection: paperView(paper).blocks[0].selection, paragraphs: ["The planner proposes.", "The result remains unverified."] }],
      translations: [{ operationIndexes: [0], paragraphIndexes: [0], text: "规划器提出建议。" }, { operationIndexes: [0], paragraphIndexes: [1], text: "结果仍未经验证。" }] });
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    assert.equal(starts, 1); assert.equal(storedPaper(host).readings[0].material.candidateTranslations.filter(item => item.jobId.startsWith("candidate:")).length, 2);
    await host.service.completeWritingTurn({ id: "unrelated" } as Agent, 1, new AbortController().signal);
    assert.equal(starts, 1);
    host.boundary.lastTurn = 2; host.boundary.openTurnStartSeq = 100;
    await host.service.completeWritingTurn(host.parent, 2, new AbortController().signal);
    assert.equal(starts, 1);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("unprojectable automatic combinations record failure without manufacturing a child packet or retry loop", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-auto-conflict-")), host = await open(root);
  try {
    await seedWriting(host);
    const source = paperView(storedPaper(host)).blocks[0].selection;
    await host.invoke({ action: "propose", requestId: "alternative", reason: "An overlapping alternative.", operations: [{ kind: "replace", selection: source, replacement: "A different statement." }] });
    let starts = 0; host.ctx.provide("subagents", { startActivation: async () => { starts++; throw new Error("Must not start."); } });
    for (let attempt = 0; attempt < 2; attempt++) await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    const reading = storedPaper(host).readings[0];
    assert.equal(starts, 0); assert.equal(storedPaper(host).readings.length, 1);
    assert.equal(reading.status, "failed"); assert.equal(reading.projectionUnavailable, true); assert.equal(reading.output, undefined);
    await assert.rejects(host.service.handle({ action: "read" }, reading.childId, false, new AbortController().signal), /no reader packet/);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("failed automatic readers require a scoped explicit retry without user-supplied goal or evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-auto-retry-")), host = await open(root);
  try {
    await seedWriting(host);
    let starts = 0;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      starts++;
      if (starts === 1) throw new Error("Representative startup failure.");
      return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => {} };
    } });
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal);
    const failed = storedPaper(host).readings[0]; assert.equal(failed.status, "failed");
    await host.service.completeWritingTurn(host.parent, 1, new AbortController().signal); assert.equal(starts, 1);
    await host.invoke({ action: "retry_reading", requestId: "scoped-retry", readingId: failed.id });
    await waitForReading(host, "completed");
    const retried = storedPaper(host).readings[1];
    assert.equal(retried.goal, failed.goal); assert.equal(retried.evidence, failed.evidence); assert.equal(retried.replaces, failed.id);
    assert.equal(starts, 2); assert.equal(storedPaper(host).candidates[0].status, "pending");
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("file-reference intake uses the bounded DSH filesystem and reconciles concurrent and durable retries", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-file-intake-")), host = await open(root);
  try {
    const bytes = Buffer.from("A controlled Host intake fixture; document inspection is stubbed in this test.");
    await writeFile(join(root, "source.docx"), bytes);
    const text = "The Planner proposes an action."; let inspections = 0;
    host.service.engine = async () => { inspections++; return { hasRevisions: false, normalizedBase64: bytes.toString("base64"), warnings: [], nativeComments: [],
      blocks: [{ sourceIndex: 0, text, editable: true, style: null, runs: [{ text, bold: false, italic: false }], reason: null }] }; };
    const request = { action: "import", requestId: "native-path", path: "source.docx" };
    const [first, concurrent] = await Promise.all([host.invoke(request), host.invoke(request)]);
    assert.equal(first.paper.id, concurrent.paper.id); assert.equal(inspections, 1); assert.equal(host.domain.table("papers").size, 1);
    assert.equal((await host.invoke(request)).paper.id, first.paper.id); assert.equal(inspections, 1);
    const stored = host.domain.table("papers").get(first.paper.id); assert.ok(stored && "history" in stored);
    assert.equal(stored.originalBase64, bytes.toString("base64")); assert.equal(stored.creation?.requestId, request.requestId);
    assert.equal(stored.translationJobs.length, 1); assert.equal(stored.translationJobs[0].sources[0].quote, text);
    assert.equal(host.calls.length, 0, "The ordinary Agent receives prepared translations in the current turn, without a second prompt Send.");
    await assert.rejects(host.invoke({ ...request, primaryLanguage: "zh" }), /different source or projection/);
    await writeFile(join(root, "oversize.docx"), Buffer.alloc(16 * 1024 * 1024 + 1));
    await assert.rejects(host.invoke({ action: "import", requestId: "oversize", path: "oversize.docx" }), { code: "FS_TOO_LARGE" });
    assert.equal(inspections, 1); assert.equal(host.domain.table("papers").size, 1);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

for (const stage of ["file", "engine"] as const) test(`late ${stage} intake cannot overwrite a later user-selected Paper and its saved original reconciles on retry`, async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-file-late-")), host = await open(root);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await seed(host); const other = { ...fixture(), id: "other" }; await host.domain.table("papers").put(other.id, other);
    const bytes = Buffer.from("A controlled late-import fixture."); await writeFile(join(root, "late.docx"), bytes);
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); let inspections = 0;
    const ensure = host.ctx.workingDirectory.ensure.bind(host.ctx.workingDirectory);
    host.ctx.workingDirectory.ensure = async (agent, signal) => { if (stage === "file") { entered(); await gate; } return ensure(agent, signal); };
    host.service.engine = async () => { inspections++; if (stage === "engine") { entered(); await gate; } const text = "A newly imported document.";
      return { hasRevisions: false, normalizedBase64: bytes.toString("base64"), warnings: [], nativeComments: [],
        blocks: [{ sourceIndex: 0, text, editable: true, style: null, runs: [{ text, bold: false, italic: false }], reason: null }] }; };
    const request = { action: "import", requestId: "late", path: "late.docx" }, pending = host.invoke(request);
    const rejected = assert.rejects(pending, /associated with another paper/);
    await started;
    await assert.rejects(host.invoke({ action: "create", requestId: "late", name: "A competing request.docx", brief: "" }), /different input/);
    await host.invoke({ action: "link", paperId: other.id }); release(); await rejected;
    assert.equal(host.domain.table("bindings").get("task")?.paperId, other.id);
    const saved = [...host.domain.table("papers").entries()].map(([, paper]) => paper).find(paper => "creation" in paper && paper.creation?.requestId === "late");
    assert.ok(saved); assert.equal(saved.originalBase64, bytes.toString("base64"));
    await assert.rejects(host.invoke(request), /associated with another paper/);
    assert.equal(inspections, 1); assert.equal(host.domain.table("papers").size, 3);
  } finally { release(); await host.close(); await rm(root, { recursive: true }); }
});

test("conversation return references identify actual delivery markers and require explicit ambiguity/revision choices", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-return-reference-")), host = await open(root);
  try {
    let paper = await seed(host);
    const deliveryBytes = Buffer.from("A controlled delivered-file fixture.").toString("base64"), returnBytes = Buffer.from("A controlled returned-file fixture.");
    paper = recordDocumentDelivery(paper, { id: "delivered", revision: 0, baselineRevision: 0, variant: "clean", format: "docx", includeReasons: false,
      name: "delivered.docx", base64: deliveryBytes, bytes: Buffer.from(deliveryBytes, "base64").length, warnings: [],
      translations: [],
      anchors: [{ blockId: paperView(paper).blocks[0].id, nativeId: "00000001" }] });
    await host.domain.table("papers").put(paper.id, paper); await writeFile(join(root, "mentor.docx"), returnBytes);
    const matching = [{ id: "delivered", paperId: paper.id }]; let markers: { id: string; paperId: string }[] = matching, hasRevisions = false;
    // The real file service and return owner are exercised; Word inspection is
    // explicitly stubbed, so this is not a native Word return acceptance claim.
    host.service.engine = async raw => {
      const expected = (raw as { base64: string }).base64 === deliveryBytes;
      const text = "Keep the confirmed sentence.";
      return { hasRevisions: expected ? false : hasRevisions, deliveryMarkers: expected ? matching : markers, warnings: [], nativeComments: [],
        blocks: [{ sourceIndex: 0, nativeId: "00000001", text, editable: true, style: null, paragraphFormat: "",
          runs: [{ text, bold: false, italic: false, nativeFormat: "" }], reason: null }] };
    };
    const request = { action: "import_return", requestId: "marked-return", path: "mentor.docx" };
    await host.invoke(request);
    assert.equal(storedPaper(host).documentReturns[0].deliveryId, "delivered");
    assert.equal(storedPaper(host).documentReturns[0].originalBase64, returnBytes.toString("base64"));
    markers = [];
    await assert.rejects(host.invoke({ ...request, requestId: "no-marker" }), /no unique matching delivery/);
    await host.invoke({ ...request, requestId: "chosen-baseline", deliveryId: "delivered" });
    markers = [{ id: "other", paperId: paper.id }];
    await assert.rejects(host.invoke({ ...request, requestId: "wrong-marker", deliveryId: "delivered" }), /no unique matching delivery/);
    markers = [...matching, ...matching];
    await assert.rejects(host.invoke({ ...request, requestId: "ambiguous" }), /does not uniquely identify/);
    markers = [{ id: "delivered", paperId: "another-paper" }];
    await assert.rejects(host.invoke({ ...request, requestId: "foreign-paper" }), /does not uniquely identify/);
    markers = matching; hasRevisions = true;
    await assert.rejects(host.invoke({ ...request, requestId: "unresolved" }), /user's accept\/reject choice/);
    await host.invoke({ ...request, requestId: "chosen-revisions", revisionMode: "reject" });
    assert.equal(storedPaper(host).documentReturns.at(-1)!.revisionMode, "reject");
    assert.equal(storedPaper(host).documentReturns.length, 3);
    assert.equal(storedPaper(host).revision, 0); assert.equal(storedPaper(host).candidates.length, 0); assert.equal(storedPaper(host).decisions.length, 0);
    assert.equal(host.calls.length, 0);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});
