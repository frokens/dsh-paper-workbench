import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { connectPaperClient } from "../scripts/dsh-test-client.mjs";
import { remoteInfo } from "../src/remote.ts";

function engine(request) {
  const child = spawnSync("runtime/osx-arm64/paper-docx", {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.ifError(child.error);
  const response = JSON.parse(child.stdout);
  assert.equal(response.ok, true, response.error);
  return response.result;
}

test(
  "installed DSH Host shares durable actions and the formal stream without adding command messages to ordinary chat",
  { timeout: 30000 },
  async (t) => {
    const client = await connectPaperClient(remoteInfo),
      rpc = client.rpc;
    t.after(() => client.close());
    await mkdir(".local/test-workspace", { recursive: true });
    const created = await rpc("session/create", {
      request: { cwd: resolve(".local/test-workspace") },
    });
    const agentId = created.sessionId;
    const action = async (request) => {
      const result = await client.paper.userAction(
        agentId,
        request,
        AbortSignal.timeout(15000),
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    const cancellation = new AbortController(),
      stream = client.paper
        .observe(agentId, cancellation.signal)
        [Symbol.asyncIterator]();
    t.after(async () => {
      cancellation.abort();
      await stream.return?.();
    });
    async function observed(predicate) {
      for (let i = 0; i < 40; i++) {
        const frame = await stream.next();
        assert.equal(frame.done, false);
        if (predicate(frame.value)) return frame.value;
      }
      throw new Error("Expected committed stream state was not observed.");
    }
    const before = await rpc("session/events", {
      request: {
        address: { kind: "session", sessionId: agentId },
        maxMessages: 20,
      },
    });
    assert.equal((await action({ action: "read" })).paper, null);
    await observed((value) => value.paper === null);
    const fixture = engine({ action: "fixture" });
    const imported = await action({
      action: "import",
      name: "Host integration.docx",
      base64: fixture.base64,
    });
    await observed((value) => value.paper?.id === imported.paper.id);
    const block = imported.paper.blocks[1],
      quote = "The worker executes the operation.",
      from = block.text.lastIndexOf(quote);
    const request = {
      action: "propose",
      requestId: crypto.randomUUID(),
      operations: [
        {
          kind: "replace",
          selection: {
            ...block.selection,
            quote,
            from,
            to: from + quote.length,
          },
          replacement: "The executor runs the operation.",
        },
      ],
      reason: "Clarify execution ownership.",
    };
    const proposed = await action(request);
    assert.equal(proposed.paper.revision, 0);
    assert.equal(proposed.paper.candidates[0].status, "pending");
    await assert.rejects(
      action({
        ...request,
        requestId: crypto.randomUUID(),
        operations: [
          {
            ...request.operations[0],
            selection: {
              ...request.operations[0].selection,
              quote: "wrong source",
            },
          },
        ],
      }),
      /does not match/,
    );
    const accepted = await action({
      action: "decide",
      candidateIds: [proposed.paper.candidates[0].id],
      decision: "accepted",
      expectedRevision: 0,
    });
    assert.equal(accepted.paper.revision, 1);
    await observed((value) => value.paper?.revision === 1);
    cancellation.abort();
    await stream.return();
    const exported = await action({ action: "export", tracked: true });
    const final = engine({
      action: "inspect",
      base64: exported.base64,
      revisionMode: "accept",
    });
    const original = engine({
      action: "inspect",
      base64: exported.base64,
      revisionMode: "reject",
    });
    assert.equal(final.blocks[1].text, accepted.paper.blocks[1].text);
    assert.equal(original.blocks[1].text, block.text);
    const reread = await action({ action: "read" });
    assert.equal(reread.paper.decisions.length, 1);
    const structural = engine({ action: "fixture", fixture: "paragraph-mark" });
    for (const revisionMode of [undefined, "accept", "reject"])
      await assert.rejects(
        action({
          action: "import",
          name: "Unsupported revisions.docx",
          base64: structural.base64,
          revisionMode,
        }),
        /structural or formatting revisions.*Word/,
      );
    assert.equal(
      (await action({ action: "read" })).paper.id,
      reread.paper.id,
      "Failed imports must preserve the linked paper.",
    );
    const repeated = engine({ action: "fixture", fixture: "repeated-format" });
    const duplicate = await action({
      action: "import",
      name: "Repeated source.docx",
      base64: repeated.base64,
    });
    const exact = duplicate.paper.blocks[0].selection;
    const deletion = await action({
      action: "propose",
      requestId: crypto.randomUUID(),
      operations: [
        {
          kind: "replace",
          selection: { ...exact, from: 0, to: 2, quote: "X " },
          replacement: "",
        },
      ],
      reason: "Delete the selected first duplicate only.",
    });
    await action({
      action: "decide",
      candidateIds: [deletion.paper.candidates[0].id],
      decision: "accepted",
      expectedRevision: 0,
    });
    for (const tracked of [false, true]) {
      const download = await action({ action: "export", tracked });
      const final = engine({
        action: "inspect",
        base64: download.base64,
        ...(tracked ? { revisionMode: "accept" } : {}),
      });
      assert.equal(final.blocks[0].text, "X");
      assert.equal(
        final.blocks[0].runs.some((r) => r.bold),
        false,
      );
    }
    const colored = engine({ action: "fixture", fixture: "repeated-color" });
    let color = await action({
      action: "import",
      name: "Native color.docx",
      base64: colored.base64,
    });
    for (const [from, to, replacement] of [
      [0, 2, ""],
      [0, 0, "X "],
    ]) {
      const selection = color.paper.blocks[0].selection;
      const candidate = await action({
        action: "propose",
        requestId: crypto.randomUUID(),
        operations: [
          {
            kind: "replace",
            selection: {
              ...selection,
              from,
              to,
              quote: selection.quote.slice(from, to),
            },
            replacement,
          },
        ],
        reason: "Retain the actual native style source.",
      });
      color = await action({
        action: "decide",
        candidateIds: [candidate.paper.candidates.at(-1).id],
        decision: "accepted",
        expectedRevision: color.paper.revision,
      });
    }
    const colorExport = await action({ action: "export", tracked: true });
    assert.equal(
      engine({ action: "inspect", base64: colorExport.base64 }).hasRevisions,
      true,
      "Native color changes remain visible even when displayed text and marks match.",
    );
    let structure = await action({
      action: "import",
      name: "Structure mapping.docx",
      base64: fixture.base64,
    });
    async function proposeOperation(operation, reason) {
      return action({
        action: "propose",
        requestId: crypto.randomUUID(),
        operations: [operation],
        reason,
      });
    }
    async function accept(candidate) {
      return action({
        action: "decide",
        candidateIds: [candidate.paper.candidates.at(-1).id],
        decision: "accepted",
        expectedRevision: candidate.paper.revision,
      });
    }
    structure = await accept(
      await proposeOperation(
        {
          kind: "replace",
          selection: structure.paper.blocks[3].selection,
          replacement: "alpha beta",
        },
        "Prepare synthetic structure.",
      ),
    );
    const selectedBeta = {
      ...structure.paper.blocks[3].selection,
      from: 6,
      to: 10,
      quote: "beta",
    };
    const pending = await proposeOperation(
      { kind: "replace", selection: selectedBeta, replacement: "gamma" },
      "Pending right-hand phrase.",
    );
    structure = await accept(
      await proposeOperation(
        { kind: "split", selection: { ...selectedBeta, to: 6, quote: "" } },
        "Split before beta.",
      ),
    );
    const rightId = structure.paper.blocks[4].id;
    assert.equal(
      structure.paper.candidates.find(
        (c) => c.id === pending.paper.candidates.at(-1).id,
      ).currentSelections[0].blockId,
      rightId,
    );
    structure = await accept(
      await proposeOperation(
        {
          kind: "merge",
          selection: structure.paper.blocks[3].selection,
          next: structure.paper.blocks[4].selection,
          separator: "",
        },
        "Merge the synthetic paragraphs.",
      ),
    );
    const compared = await action({ action: "compare", revision: 2 });
    assert.equal(
      compared.comparison.blocks.find((block) => block.id === rightId).removed,
      true,
    );
    const draft = await action({ action: "create", name: "Material draft.docx", brief: "Use the synthetic evidence; preserve the unverified condition." });
    assert.equal(draft.paper.blocks.length, 1);
    assert.equal(draft.paper.blocks[0].text, "");
    assert.equal(draft.paper.feedback.length, 1);
    assert.equal(draft.paper.batches.length, 0, "Saving a writing goal must not submit a batch or call a model.");
    const written = await accept(await proposeOperation({ kind: "replace", selection: draft.paper.blocks[0].selection, replacement: "The result remains unverified." }, "Use only the supplied facts."));
    const draftedExport = await action({ action: "export", tracked: true });
    assert.equal(engine({ action: "inspect", base64: draftedExport.base64, revisionMode: "accept" }).blocks[0].text, written.paper.blocks[0].text);
    const after = await rpc("session/events", {
      request: {
        address: { kind: "session", sessionId: agentId },
        maxMessages: 20,
      },
    });
    assert.equal(
      after.cursor,
      before.cursor,
      "Sidebar data operations must not write internal payloads into chat.",
    );
    console.log(
      "Validated the installed Host/Remote stream, exact proposals/decisions, native DOCX regressions, split target/merge comparison, a real blank draft using the same lifecycle, and unchanged chat cursor; no model call.",
    );
  },
);
