import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaper, importDocument, paperView, propose, saveFeedback, deleteFeedback, createBatch, resolveFeedback, decideMany, feedbackLocation, correctTranslation, undoDecision, restoreRevision, projectCandidates, type Paper } from "../src/model.js";
import { proposeRequest, readingRequest, uiRequest } from "../src/contracts.js";
import { paperSchema } from "../src/records.js";
import { prepareReading, readingPacket } from "../src/reading.js";
import { wordComments } from "../src/word.js";
import { recordDocumentDelivery } from "../src/delivery.js";

function initial(texts = [""]) {
  return createPaper({ id: "paper", name: "Synthetic", sourceBase64: "", originalBase64: "", warnings: [],
    document: importDocument(texts.map((text, sourceIndex) => ({ text, sourceIndex, editable: true, style: null, reason: null,
      runs: text ? [{ text, bold: false, italic: false }] : [] }))) });
}
function draft() {
  const paper = initial();
  return propose(paper, proposeRequest.parse({ action: "propose", requestId: "draft", reason: "Keep the supplied evidence strength.",
    operations: [{ kind: "fill_draft", selection: paperView(paper).blocks[0].selection, paragraphs: ["Echo result remains unverified.", "Echo result remains unverified."] }],
    translations: [0, 1].map(index => ({ operationIndexes: [0], paragraphIndexes: [index], text: "回显结果仍未经验证。" })) }));
}
function sourceTarget(paper: Paper, paragraphIndex = 1, from = 5, to = 11) {
  const selection = paperView(paper).candidates.at(-1)!.content!.sourceBlocks[paragraphIndex].selection;
  return { kind: "candidate_source" as const, selection: { ...selection, from, to, quote: selection.quote.slice(from, to) } };
}
function translationTarget(paper: Paper, translationIndex = 1) {
  return { kind: "candidate_translation" as const, selection: paperView(paper).candidates.at(-1)!.content!.translations[translationIndex].selection };
}
function annotated() {
  let paper = draft();
  paper = saveFeedback(paper, { id: "english", expectedVersion: 0, target: sourceTarget(paper), comment: "Clarify this result." });
  paper = saveFeedback(paper, { id: "chinese", expectedVersion: 0, target: translationTarget(paper), comment: "保留未经验证的含义。" });
  return paper;
}

test("a real UI submit request preserves batch versions and identity through the current storage schema", () => {
  const paper = annotated(), sessionId = "ordinary-task";
  const feedbackVersions = paper.feedback.map(({ id, version }) => ({ id, version }));
  const request = uiRequest.parse({ action: "submit_batch", requestId: "batch-from-ui", direction: "Keep the submitted evidence limits.",
    feedbackIds: paper.feedback.map(item => item.id), feedbackVersions });
  assert.ok(request.action === "submit_batch");
  const created = createBatch(paper, request, sessionId);
  const reopened = paperSchema.parse(JSON.parse(JSON.stringify(created)));
  assert.deepEqual(reopened.batches, created.batches);
  assert.equal("action" in created.batches[0], false);
  assert.deepEqual(reopened.batches[0].feedbackVersions, feedbackVersions);
  assert.equal(reopened.batches[0].direction, request.direction);
  assert.equal(reopened.batches[0].revision, paper.revision);
  assert.equal(reopened.batches[0].sessionId, sessionId);
  assert.strictEqual(createBatch(created, request, sessionId), created);
  assert.strictEqual(createBatch(reopened, request, sessionId), reopened);
  assert.throws(() => createBatch(reopened, { ...request, feedbackVersions: feedbackVersions.map(item => ({ ...item, version: item.version + 1 })) }, sessionId), /identity was already used/);
  const older = structuredClone(reopened);
  delete older.batches[0].feedbackVersions;
  const { feedbackVersions: _, ...olderRequest } = request;
  assert.strictEqual(createBatch(older, olderRequest, sessionId), older);
  assert.deepEqual(paperSchema.parse(JSON.parse(JSON.stringify(older))).batches, older.batches);
});

test("pending bilingual comments use exact result indexes, CAS and one frozen batch without accepting the draft", () => {
  let paper = annotated();
  const originalTarget = structuredClone(paper.feedback[0].target);
  assert.equal(paper.revision, 0); assert.equal(paperView(paper).blocks[0].text, "");
  assert.ok(paperView(paper).feedback.every(item => item.state === "current" && !item.sources.length));
  assert.equal(saveFeedback(paper, { id: "english", expectedVersion: 0, target: originalTarget, comment: "Clarify this result." }), paper);
  assert.throws(() => saveFeedback(paper, { id: "english", expectedVersion: 7, target: originalTarget, comment: "Stale edit." }), /changed elsewhere/);
  paper = saveFeedback(paper, { id: "reply", replyTo: "english", expectedVersion: 0, target: originalTarget, comment: "Keep the condition." });
  paper = resolveFeedback(paper, "english", 1, true); paper = resolveFeedback(paper, "english", 2, false);
  const direction = "修正概念，保留证据限度。";
  paper = createBatch(paper, { requestId: "batch", feedbackIds: paper.feedback.map(item => item.id), feedbackVersions: paper.feedback.map(({ id, version }) => ({ id, version })), direction }, "ordinary-task");
  const batch = structuredClone(paper.batches[0]);
  assert.equal(batch.direction, direction); assert.deepEqual(batch.feedbackVersions, [{ id: "english", version: 3 }, { id: "chinese", version: 1 }, { id: "reply", version: 1 }]);
  assert.throws(() => saveFeedback(paper, { id: "english", expectedVersion: 3, target: originalTarget, comment: "Rewrite submitted input." }), /already part of submitted work/);
  const originalCandidate = structuredClone(paper.candidates[0]);
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "revision", revises: [originalCandidate.id], reason: "Clarify the supplied mechanism.", feedbackIds: paper.feedback.map(item => item.id),
    operations: [{ kind: "fill_draft", selection: paperView(paper).blocks[0].selection, paragraphs: ["The design separates interpretation from authority.", "Echo result remains unverified."] }],
    translations: [{ operationIndexes: [0], paragraphIndexes: [0], text: "该设计区分解释与权威。" }, { operationIndexes: [0], paragraphIndexes: [1], text: "回显结果仍未经验证。" }] }));
  assert.deepEqual(paper.feedback[0].target, originalTarget); assert.deepEqual(paper.batches[0], batch);
  assert.ok(paperView(paper).feedback.every(item => item.state === "historical"));
  assert.throws(() => createBatch(paper, { requestId: "old-range", feedbackIds: ["english"], feedbackVersions: [{ id: "english", version: 3 }], direction: "" }, "ordinary-task"), /no longer pending/);
  const prepared = prepareReading(paper, readingRequest.parse({ action: "read_independently", requestId: "new-reading", candidateIds: "all", goal: direction, evidence: "Synthetic material." }), "ordinary-task");
  const packet = readingPacket(prepared.paper, prepared.reading);
  assert.deepEqual(packet.candidateIds, [paper.candidates.at(-1)!.id]);
  assert.deepEqual(packet.feedbackCandidates, [originalCandidate]);
  assert.deepEqual(packet.feedback[0].target, originalTarget); assert.equal(packet.directions[0].direction, direction);
  const restored = paperSchema.parse(JSON.parse(JSON.stringify(prepared.paper)));
  assert.deepEqual(readingPacket(restored, restored.readings[0]), packet);
  assert.equal(restored.revision, 0); assert.deepEqual(restored.decisions, []);
});

test("actual acceptance records exact second-duplicate and translation anchors; later changes use existing mapping and version rules", () => {
  let paper = annotated();
  const originalTargets = structuredClone(paper.feedback.map(item => item.target));
  paper = decideMany(paper, [paper.candidates[0].id], "accepted", 0);
  const view = paperView(paper), second = view.blocks[1];
  assert.deepEqual(paper.feedback.map(item => item.target), originalTargets);
  assert.equal(paper.feedback[0].acceptedAnchor?.kind, "source");
  assert.equal(view.feedback[0].sources[0].blockId, second.id); assert.equal(view.feedback[0].sources[0].from, 5);
  assert.equal(view.feedback[0].sources[0].quote, "result");
  assert.equal(view.feedback[1].effectiveTarget.kind, "translation"); assert.equal(view.feedback[1].sources[0].blockId, second.id);
  const comments = wordComments(paper, 0, 1, true);
  assert.deepEqual(comments.comments.find(item => item.text === "Clarify this result.")!.selections, [{ blockId: second.id, from: 5, to: 11 }]);
  assert.match(comments.warnings.join("\n"), /complete aligned primary-source group/);
  assert.deepEqual(comments.commentWarningIds, ["chinese"]);
  const translation = paper.translations[1];
  let corrected = correctTranslation(paper, { translationId: translation.id, version: 1, from: 0, to: translation.text.length, quote: translation.text }, "不同措辞。");
  corrected = correctTranslation(corrected, { translationId: translation.id, version: 2, from: 0, to: 5, quote: "不同措辞。" }, translation.text);
  assert.equal(feedbackLocation(corrected, corrected.feedback[1]).state, "stale", "Identical text at a later translation version cannot renew an old anchor.");
  assert.equal(feedbackLocation(corrected, corrected.feedback[0]).state, "current");
  const undone = undoDecision(paper, paper.decisions[0].id, 1);
  assert.notEqual(feedbackLocation(undone, undone.feedback[0]).state, "current");
  const restored = restoreRevision(undone, 1, undone.revision);
  assert.equal(paperView(restored).blocks[1].text, second.text);
  assert.notEqual(feedbackLocation(restored, restored.feedback[0]).state, "current");
  const historical = wordComments(restored, 0, restored.revision, true);
  assert.match(historical.warnings.join("\n"), /english.*historical proposal range/);
  assert.deepEqual(historical.commentWarningIds, ["english", "chinese"]);
});

test("candidate anchors validate their actual source basis, operation, paragraph, translation index and exact quote", () => {
  const paper = draft(), target = sourceTarget(paper);
  for (const selection of [{ ...target.selection, sourceRevision: 1 }, { ...target.selection, operationIndex: 9 }, { ...target.selection, paragraphIndex: 9 }, { ...target.selection, quote: "different" }])
    assert.throws(() => saveFeedback(paper, { id: "bad", expectedVersion: 0, target: { ...target, selection }, comment: "Cannot guess an anchor." }), /source behind|exact result/);
  const translation = translationTarget(paper);
  assert.throws(() => saveFeedback(paper, { id: "bad-translation", expectedVersion: 0, target: { ...translation, selection: { ...translation.selection, translationIndex: 9 } }, comment: "Cannot guess a group." }), /exact result/);
  const withComments = annotated();
  assert.throws(() => propose(withComments, proposeRequest.parse({ action: "propose", requestId: "missing-revision-link", reason: "Cannot treat a proposed quote as committed source.", feedbackIds: ["english"],
    operations: [{ kind: "fill_draft", selection: paperView(withComments).blocks[0].selection, paragraphs: ["One.", "Two."] }] })), /must revise its exact pending group/);
});

test("split and merge comment ranges come from the actual operation result and accepted structural IDs", () => {
  for (const kind of ["split", "merge"] as const) {
    let paper = initial(kind === "split" ? ["First. Second."] : ["First.", "Second."]);
    const selections = paperView(paper).blocks.map(block => block.selection);
    paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: kind, reason: "Preserve actual paragraph boundaries.", operations: [kind === "split"
      ? { kind, selection: { ...selections[0], from: 7, to: 7, quote: "" } }
      : { kind, selection: selections[0], next: selections[1], separator: " " }] }));
    const blocks = paperView(paper).candidates[0].content!.sourceBlocks;
    const projection = projectCandidates(paper, "all").document as { content: { content: { text: string }[] }[] };
    assert.deepEqual(blocks.map(block => block.text), projection.content.map(block => block.content.map(run => run.text).join("")));
    const selected = blocks.at(-1)!.selection;
    paper = saveFeedback(paper, { id: kind, expectedVersion: 0, target: { kind: "candidate_source", selection: selected }, comment: "Check this exact resulting paragraph." });
    paper = decideMany(paper, [paper.candidates[0].id], "accepted", 0);
    const location = feedbackLocation(paper, paper.feedback[0]);
    assert.equal(location.state, "current"); assert.equal(location.sources[0].blockId, paperView(paper).blocks.at(-1)!.id);
    assert.equal(location.sources[0].quote, selected.quote);
  }
});

test("dependent candidate comments use the real combined result and actual acceptance IDs", () => {
  let paper = initial(["Alpha.", "Beta."]);
  const source = paperView(paper).blocks.map(block => block.selection);
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "prerequisite", reason: "First role.",
    operations: [{ kind: "replace", selection: source[0], replacement: "First." }] }));
  const prerequisite = paper.candidates[0].id;
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "dependent", dependsOn: [prerequisite], reason: "Second role.",
    operations: [{ kind: "replace", selection: source[1], replacement: "Second." }] }));
  const dependent = paper.candidates[1].id, selection = paperView(paper).candidates[1].content!.sourceBlocks[0].selection;
  assert.equal(selection.quote, "Second."); assert.equal("blockId" in selection, false);
  paper = saveFeedback(paper, { id: "dependent-note", expectedVersion: 0, target: { kind: "candidate_source", selection }, comment: "Check the second role." });
  paper = decideMany(paper, [dependent], "accepted", 0);
  assert.deepEqual(paper.decisions[0].candidateIds, [prerequisite, dependent]);
  assert.equal(feedbackLocation(paper, paper.feedback[0]).sources[0].blockId, paperView(paper).blocks[1].id);
});

test("an otherwise valid combined acceptance preserves an unprovable old scope as historical even when its quote survives", () => {
  let paper = initial(["Alpha beta."]);
  const source = paperView(paper).blocks[0].selection;
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "first-word", reason: "First word only.",
    operations: [{ kind: "replace", selection: source, replacement: "First beta." }] }));
  const target = sourceTarget(paper, 0, 0, 5);
  paper = saveFeedback(paper, { id: "surviving-quote", expectedVersion: 0, target, comment: "Read this in its proposed context." });
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "second-word", reason: "Second word only.",
    operations: [{ kind: "replace", selection: { ...source, from: 6, to: 10, quote: "beta" }, replacement: "Human" }] }));
  paper = decideMany(paper, paper.candidates.map(candidate => candidate.id), "accepted", 0);
  assert.equal(paperView(paper).blocks[0].text, "First Human.");
  assert.equal(paper.feedback[0].acceptedAnchor, undefined);
  assert.deepEqual(paper.feedback[0].target, target);
  assert.equal(feedbackLocation(paper, paper.feedback[0]).state, "historical");
  assert.deepEqual(wordComments(paper, 0, 1, false).commentWarningIds, ["surviving-quote"]);
});

test("delivery warnings retain locatable immutable feedback references after reopening", () => {
  let paper = annotated();
  paper = decideMany(paper, [paper.candidates[0].id], "accepted", 0);
  const comments = wordComments(paper, 0, 1, false);
  paper = recordDocumentDelivery(paper, { id: "delivery", revision: 1, baselineRevision: 0, variant: "tracked", format: "docx", includeReasons: false,
    name: "candidate-comments.docx", base64: "ZmlsZQ==", bytes: 4, warnings: comments.warnings, commentWarningIds: comments.commentWarningIds,
    translations: [], anchors: paperView(paper).blocks.map((block, index) => ({ blockId: block.id, nativeId: (index + 1).toString(16).padStart(8, "0").toUpperCase() })) });
  const reopened = paperSchema.parse(JSON.parse(JSON.stringify(paper)));
  assert.throws(() => recordDocumentDelivery(reopened, { ...paper.documentDeliveries[0], id: "invalid-warning", commentWarningIds: ["missing"] }), /retained original comment/);
  assert.deepEqual(paperView(reopened).documentDeliveries[0].commentWarningIds, ["chinese"]);
  assert.equal(paperView(reopened).feedback.find(item => item.id === "chinese")!.submitted, true);
  assert.throws(() => deleteFeedback(reopened, "chinese", 1), /already part of submitted work/);
  assert.throws(() => saveFeedback(reopened, { id: "chinese", expectedVersion: 1, target: reopened.feedback[1].target, comment: "Change delivered evidence." }), /already part of submitted work/);
});
