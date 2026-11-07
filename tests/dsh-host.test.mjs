import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { connectPaperClient } from "../scripts/dsh-test-client.mjs";
import { remoteInfo } from "../src/remote.ts";

test("installed transport preserves an ordinary unlinked task and excludes removed sidebar input commands", { timeout: 30000 }, async (t) => {
  // This explicit disposable-host smoke has no model call. The ordinary Agent
  // import/writing/automatic-reader flow needs its separate real-model check.
  const client = await connectPaperClient(remoteInfo), rpc = client.rpc;
  t.after(() => client.close());
  const workspace = resolve(process.env.DSH_TEST_WORKSPACE ?? ".local/test-workspace");
  await mkdir(workspace, { recursive: true });
  const { sessionId } = await rpc("session/create", { request: { cwd: workspace } });
  const action = async request => {
    const response = await client.paper.userAction(sessionId, request, AbortSignal.timeout(15000));
    if (!response.ok) throw new Error(response.error.message);
    return response.value;
  };
  assert.equal((await action({ action: "read" })).paper, null);
  const cancellation = new AbortController();
  const stream = client.paper.observe(sessionId, cancellation.signal)[Symbol.asyncIterator]();
  t.after(async () => { cancellation.abort(); await stream.return?.(); });
  const initial = await stream.next(); assert.equal(initial.done, false); assert.equal(initial.value.paper, null);
  const before = await rpc("session/events", { request: { address: { kind: "session", sessionId }, maxMessages: 20 } });
  for (const command of [
    { action: "create", requestId: "removed-create", name: "Not a sidebar entry.docx", brief: "" },
    { action: "import", requestId: "removed-import", path: "not-read.docx" },
    { action: "import_return", requestId: "removed-return", path: "not-read.docx" },
    { action: "link", paperId: "not-linked" },
    { action: "propose", requestId: "removed-propose", reason: "Not a human input form.", operations: [] },
    { action: "read_independently", requestId: "removed-reading", candidateIds: [], goal: "", evidence: "" },
    { action: "send", kind: "batch", id: "not-sent" },
  ]) await assert.rejects(action(command));
  assert.equal((await action({ action: "read" })).paper, null);
  const state = await rpc("session/state", { request: { sessionId } });
  assert.equal(state.running, false);
  const after = await rpc("session/events", { request: { address: { kind: "session", sessionId }, maxMessages: 20 } });
  assert.equal(after.cursor, before.cursor, "Observation and rejected human inputs do not add chat/model work.");
});
