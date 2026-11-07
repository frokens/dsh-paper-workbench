import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPaper, importDocument, paperView, saveFeedback, deleteFeedback, resolveFeedback, createBatch, propose, decide } from "../src/model.js";
import { agentRequest, uiRequest, proposeRequest } from "../src/contracts.js";

function fixture() {
  const text = "The Planner proposes an action.";
  return createPaper({ id: "comments", name: "synthetic.docx", originalBase64: "", sourceBase64: "", warnings: [],
    document: importDocument([{ sourceIndex: 0, text, editable: true, style: null, runs: [{ text, bold: false, italic: false }], reason: null }]) });
}

test("autosaved comment identity and version prevent late overwrites while exact retries are idempotent", () => {
  const original = fixture(), request = { id: randomUUID(), expectedVersion: 0,
    target: { kind: "source" as const, selections: [paperView(original).blocks[0].selection] }, comment: "Clarify the action." };
  const first = saveFeedback(original, request);
  assert.equal(first.feedback[0].version, 1); assert.equal(first.feedback[0].id, request.id);
  assert.strictEqual(saveFeedback(first, request), first);
  const edit = { ...request, expectedVersion: 1, comment: "Clarify the action owner." }, second = saveFeedback(first, edit);
  assert.equal(second.feedback[0].version, 2); assert.equal(first.feedback[0].comment, request.comment);
  assert.strictEqual(saveFeedback(second, edit), second);
  assert.throws(() => saveFeedback(second, { ...request, expectedVersion: 1, comment: "A stale concurrent edit." }), /changed elsewhere/);
  assert.throws(() => saveFeedback(second, { ...edit, expectedVersion: 2, target: { kind: "source", selections: [{ ...request.target.selections[0], from: 0, to: 3, quote: "The" }] } }), /original anchor/);
  assert.strictEqual(second.document, original.document); assert.equal(second.revision, 0); assert.equal(second.batches.length, 0);
});

test("submitted feedback remains evidence; replies and resolution reuse the original discussion without accepting source changes", () => {
  let paper = fixture();
  const root = { id: randomUUID(), expectedVersion: 0, target: { kind: "source" as const, selections: [paperView(paper).blocks[0].selection] }, comment: "Keep the intended meaning." };
  paper = saveFeedback(paper, root);
  assert.equal(paperView(paper).feedback[0].submitted, false);
  paper = createBatch(paper, { requestId: "round", feedbackIds: [root.id], feedbackVersions: [{ id: root.id, version: 1 }], direction: "A synthetic clarification." }, "task");
  const submitted = paper;
  assert.equal(paperView(paper).feedback[0].submitted, true);
  assert.throws(() => saveFeedback(paper, { ...root, expectedVersion: 1, comment: "Replace earlier evidence." }), /submitted work/);
  assert.throws(() => deleteFeedback(paper, root.id, 1), /submitted work/);
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "change", reason: "A controlled source change.",
    operations: [{ kind: "replace", selection: paperView(paper).blocks[0].selection, replacement: "The Planner chooses an action." }] }));
  paper = decide(paper, paper.candidates[0].id, "accepted");
  const reply = { id: randomUUID(), expectedVersion: 0, target: root.target, replyTo: root.id, comment: "The earlier comment remains available." };
  paper = saveFeedback(paper, reply);
  assert.equal(paper.feedback[1].replyTo, root.id); assert.deepEqual(paper.feedback[1].target, root.target);
  assert.equal(paperView(paper).feedback[1].state, "stale", "A reply preserves the historical anchor rather than guessing a new range.");
  const before = JSON.stringify(paper.document), resolved = resolveFeedback(paper, root.id, 1, true);
  assert.equal(resolved.feedback[0].resolved, true); assert.equal(JSON.stringify(resolved.document), before);
  assert.strictEqual(resolveFeedback(resolved, root.id, 1, true), resolved);
  const reopened = resolveFeedback(resolved, root.id, 2, false);
  assert.equal(reopened.feedback[0].resolved, false); assert.equal(reopened.feedback[0].version, 3);
  assert.equal(submitted.feedback[0].resolved, false); assert.equal(submitted.revision, 0);
});

test("draft deletion respects versions and reply ownership", () => {
  const source = fixture(), root = { id: randomUUID(), expectedVersion: 0, target: { kind: "source" as const, selections: [paperView(source).blocks[0].selection] }, comment: "A draft comment." };
  const first = saveFeedback(source, root);
  assert.throws(() => deleteFeedback(first, root.id, 2), /changed/);
  const replied = saveFeedback(first, { id: randomUUID(), expectedVersion: 0, target: root.target, replyTo: root.id, comment: "A reply." });
  assert.throws(() => deleteFeedback(replied, root.id, 1), /replies/);
  assert.throws(() => saveFeedback(first, { id: randomUUID(), expectedVersion: 0, target: root.target, replyTo: "absent", comment: "Unowned reply." }), /original discussion/);
  const removed = deleteFeedback(first, root.id, 1);
  assert.equal(removed.feedback.length, 0); assert.strictEqual(deleteFeedback(removed, root.id, 1), removed);
});

test("a round freezes the versions actually read and rejects a concurrent edit or resolution before sending", () => {
  const source = fixture(), comment = { id: randomUUID(), expectedVersion: 0,
    target: { kind: "source" as const, selections: [paperView(source).blocks[0].selection] }, comment: "Clarify the owner." };
  const saved = saveFeedback(source, comment), request = { requestId: "round", feedbackIds: [comment.id],
    feedbackVersions: [{ id: comment.id, version: 1 }], direction: "" };
  const edited = saveFeedback(saved, { ...comment, expectedVersion: 1, comment: "Clarify the owner and feedback path." });
  assert.throws(() => createBatch(edited, request, "task"), /changed or was resolved/);
  assert.throws(() => createBatch(saved, { ...request, feedbackVersions: undefined }, "task"), /saved comments and their versions/);
  assert.throws(() => createBatch(saved, { ...request, feedbackIds: [comment.id, comment.id],
    feedbackVersions: [{ id: comment.id, version: 1 }, { id: "unselected", version: 1 }] }, "task"), /saved comments and their versions/);
  const resolved = resolveFeedback(saved, comment.id, 1, true);
  assert.throws(() => createBatch(resolved, { ...request, feedbackVersions: [{ id: comment.id, version: 2 }] }, "task"), /changed or was resolved/);
  const submitted = createBatch(saved, request, "task"), resolvedAfterSubmit = resolveFeedback(submitted, comment.id, 1, true);
  assert.deepEqual(submitted.batches[0].feedbackVersions, request.feedbackVersions);
  assert.strictEqual(createBatch(resolvedAfterSubmit, request, "task"), resolvedAfterSubmit,
    "A delivery retry preserves its frozen input even after the discussion is resolved.");
  const legacy = { ...submitted, batches: submitted.batches.map(({ feedbackVersions: _versions, ...batch }) => batch) };
  assert.strictEqual(createBatch(legacy, { requestId: request.requestId, feedbackIds: request.feedbackIds, direction: "" }, "task"), legacy,
    "Existing saved receipts remain retryable without inventing their historical versions.");
});

test("native Agent input uses file references while user decisions and review starts stay out of its public contract", () => {
  const selection = paperView(fixture()).blocks[0].selection;
  assert.equal(agentRequest.safeParse({ action: "import", requestId: "file", path: "input.docx" }).success, true);
  assert.equal(agentRequest.safeParse({ action: "import_return", requestId: "return", path: "mentor.docx" }).success, true);
  assert.equal(agentRequest.safeParse({ action: "import", requestId: "blob", name: "input.docx", base64: "ZmlsZQ==" }).success, false);
  for (const request of [
    { action: "decide", candidateIds: ["candidate"], decision: "accepted", expectedRevision: 0 },
    { action: "undo", decisionId: "decision", expectedRevision: 0 },
    { action: "restore", revision: 0, expectedRevision: 0 },
    { action: "save_feedback", id: randomUUID(), expectedVersion: 0, target: { kind: "source", selections: [selection] }, comment: "A comment." },
    { action: "submit_batch", requestId: "round", feedbackIds: ["comment"], feedbackVersions: [{ id: "comment", version: 1 }], direction: "A direction." },
    { action: "read_independently", requestId: "reader", candidateIds: [], goal: "A goal.", evidence: "" },
  ]) assert.equal(agentRequest.safeParse(request).success, false);
  for (const request of [
    { action: "create", requestId: "draft", name: "Draft.docx", brief: "" },
    { action: "import", requestId: "file", name: "Input.docx", base64: "ZmlsZQ==", format: "docx" },
    { action: "import_return", requestId: "return", deliveryId: "delivery", name: "Return.docx", base64: "ZmlsZQ==" },
    { action: "link", paperId: "paper" },
    { action: "propose", requestId: "candidate", operations: [{ kind: "replace", selection, replacement: "A replacement." }], reason: "A reason." },
    { action: "read_independently", requestId: "reader", candidateIds: [], goal: "A goal.", evidence: "" },
    { action: "request_translation", requestId: "translation", sources: [selection], replaces: [] },
    { action: "cancel_translation", jobId: "job" },
    { action: "send", kind: "batch", id: "batch" },
  ]) assert.equal(uiRequest.safeParse(request).success, false);
});
