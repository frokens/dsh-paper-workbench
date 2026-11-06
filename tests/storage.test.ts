import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { createPaper, importDocument, type Paper } from "../src/model.js";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { isJsonValue } from "@deepseek-ai/dsh-util-values";
import type { SubagentActivationSpec, SubagentResult } from "@deepseek-ai/dsh-subagent";
import { prepareReading } from "../src/reading.js";
import { readingRequest } from "../src/contracts.js";

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
    service.handle(request, "task", true, signal) as Promise<{
      paper: ReturnType<typeof import("../src/model.js").paperView>;
    }>;
  return {
    ctx,
    domain,
    service,
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
function storedPaper(host: Awaited<ReturnType<typeof open>>) {
  const paper = host.domain.table("papers").get("paper");
  assert.ok(paper && "history" in paper);
  return paper;
}
const readingCommand = { action: "read_independently", requestId: "reading", candidateIds: [], goal: "Check the confirmed source.", evidence: "Synthetic facts only." };
const readingResult: SubagentResult = {
  stopReason: "completed", output: [],
  structured: { interpretation: { problem: "A confirmed statement", mechanism: "Keep it intact", feedbackRole: "Clarification" }, findings: [], limits: ["Synthetic source only"] },
};

test("production native reading uses the DSH fresh/caller seam, validates structured capture and returns lossless JSON without changing the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seed(host);
    const before = JSON.stringify(storedPaper(host).document), calls: SubagentActivationSpec[] = [];
    let disposed = false;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      calls.push(spec);
      return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => { disposed = true; } };
    } });
    const parent = { id: "task", hiddenParentReasoning: "PRIVATE_PARENT_REASONING" } as unknown as Agent;
    const result = await host.service.handle(readingCommand, "task", false, new AbortController().signal, parent);
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
    await host.service.handle(readingCommand, "task", false, new AbortController().signal, parent);
    assert.equal(calls.length, 1, "An identical completed retry cannot start another chargeable child.");
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("reading cancellation targets its owned activation and retains a late completion as evidence without publishing a verdict", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seed(host);
    let finish!: (result: SubagentResult) => void, disposed = false;
    const result = new Promise<SubagentResult>(resolve => { finish = resolve; });
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => ({ childId: spec.childId, result, dispose: async () => { disposed = true; } }) });
    await host.service.handle(readingCommand, "task", true, new AbortController().signal, { id: "task" } as Agent);
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
    assert.equal(storedPaper(host).readings[0].status, "cancelled");
    assert.equal(storedPaper(host).readings[0].output, undefined);
    assert.ok(storedPaper(host).readings[0].terminal);
    assert.equal(isJsonValue(await host.invoke({ action: "read" })), true);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("a child failure is a durable reading failure, never a completed quality verdict", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seed(host);
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => ({ childId: spec.childId, result: Promise.resolve({ stopReason: "error", output: [], diagnostic: "Evidence could not be read." }), dispose: async () => {} }) });
    await host.service.handle(readingCommand, "task", false, new AbortController().signal, { id: "task" } as Agent);
    assert.equal(storedPaper(host).readings[0].status, "failed");
    assert.equal(storedPaper(host).readings[0].output, undefined);
    assert.match(storedPaper(host).readings[0].diagnostic!, /Evidence/);
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("cancelling the native reading caller disposes only its owned child and records cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seed(host);
    let finish!: (result: SubagentResult) => void, admitted!: () => void, disposed = false;
    const result = new Promise<SubagentResult>(resolve => { finish = resolve; });
    const started = new Promise<void>(resolve => { admitted = resolve; });
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      admitted();
      return { childId: spec.childId, result, dispose: async () => { disposed = true; finish({ stopReason: "aborted", output: [] }); } };
    } });
    const signal = new AbortController();
    const pending = host.service.handle(readingCommand, "task", false, signal.signal, { id: "task" } as Agent);
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
    const prepared = prepareReading(storedPaper(host), readingRequest.parse(readingCommand), "task");
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
  } finally { await host.close(); await rm(root, { recursive: true }); }
});

test("failed durable reading admission cannot start a child", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seed(host);
    let starts = 0;
    host.ctx.provide("subagents", { startActivation: async () => { starts++; throw new Error("Must not start"); } });
    host.setFailure(true);
    await assert.rejects(host.service.handle(readingCommand, "task", true, new AbortController().signal, { id: "task" } as Agent), /Injected durable write failure/);
    assert.equal(starts, 0);
    assert.equal(storedPaper(host).readings.length, 0);
  } finally { host.setFailure(false); await host.close(); await rm(root, { recursive: true }); }
});

test("a rejected DSH cleanup retains valid results and a diagnostic, clears owned handles, and retries without another child or native error", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-reading-")), host = await open(root);
  try {
    await seed(host);
    let starts = 0, disposals = 0;
    host.ctx.provide("subagents", { startActivation: async (spec: SubagentActivationSpec) => {
      starts++;
      return { childId: spec.childId, result: Promise.resolve(readingResult), dispose: async () => { disposals++; throw new Error("ACTIVATION_TEARDOWN_FAILED: representative cleanup rejection"); } };
    } });
    for (let i = 0; i < 2; i++) {
      const response = await host.service.handle(readingCommand, "task", false, new AbortController().signal, { id: "task" } as Agent);
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
        action: "feedback",
        requestId: "cancelled",
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
      action: "feedback",
      requestId: "saved",
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

test("fault-injected prompt reply loss retains a retryable batch and uses the same native prompt identity and content", async () => {
  const root = await mkdtemp(join(tmpdir(), "paper-storage-"));
  const host = await open(root);
  try {
    await seed(host);
    const initial = await host.invoke({ action: "read" });
    const feedback = await host.invoke({
      action: "feedback",
      requestId: "note",
      target: {
        kind: "source",
        selections: [initial.paper.blocks[0].selection],
      },
      comment: "Preserve confirmed wording.",
    });
    const batch = await host.invoke({
      action: "submit_batch",
      requestId: "batch",
      feedbackIds: [feedback.paper.feedback[0].id],
      direction: "Minimal necessary change.",
    });
    const id = batch.paper.batches[0].id;
    assert.equal(
      host.calls.length,
      0,
      "Saving data alone must never call the model.",
    );
    host.setSendFailure(true);
    await assert.rejects(
      host.invoke({ action: "send", kind: "batch", id }),
      /reply loss/,
    );
    assert.equal(
      (await host.invoke({ action: "read" })).paper.batches[0].delivery,
      "ready",
    );
    const failed = await host.invoke({ action: "read" });
    assert.equal(isJsonValue(failed), true);
    host.setSendFailure(false);
    await host.invoke({ action: "send", kind: "batch", id });
    const nativeRead = await host.service.handle(
      { action: "read" },
      "task",
      false,
      new AbortController().signal,
    );
    assert.equal(
      isJsonValue(nativeRead),
      true,
      "The actual native tool return must be lossless before any Remote serialization.",
    );
    assert.equal(
      Object.hasOwn(
        (await host.invoke({ action: "read" })).paper.batches[0],
        "error",
      ),
      false,
    );
    assert.match(
      failed.paper.batches[0].error!,
      /reply loss/,
      "The previously returned failed state is not mutated.",
    );
    assert.deepEqual(host.calls[0], host.calls[1]);
    assert.equal(host.calls.length, 2);
    await host.invoke({ action: "send", kind: "batch", id });
    assert.equal(host.calls.length, 2);
  } finally {
    await host.close();
    await rm(root, { recursive: true });
  }
});

test("translation send, native read and native completion return lossless JSON to the DSH tool consumer", async () => {
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
    const sent = await host.invoke({ action: "send", kind: "translation", id });
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
