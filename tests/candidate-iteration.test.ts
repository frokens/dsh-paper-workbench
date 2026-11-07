import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaper, importDocument, paperView, propose, decideMany, projectCandidates, previewAcceptance, addFeedback } from "../src/model.js";
import { paperSchema } from "../src/records.js";
import { proposeRequest, readingRequest, proposeReturnRequest } from "../src/contracts.js";
import { prepareReading, readingPacket, readingViews, updateReading } from "../src/reading.js";
import { proposeReturnChanges } from "../src/returns.js";

function initial(texts = [""]) {
  return createPaper({ id: "paper", name: "Synthetic method", originalBase64: "", sourceBase64: "", warnings: [],
    document: importDocument(texts.map((text, sourceIndex) => ({ sourceIndex, text, editable: true, style: null, reason: null,
      runs: text ? [{ text, bold: false, italic: false }] : [] }))) });
}
function draftRequest(paper: ReturnType<typeof initial>, paragraphs: string[], extra: object = {}) {
  return proposeRequest.parse({ action: "propose", requestId: `draft-${paper.candidates.length}`, reason: "Clarify the supplied method without strengthening evidence.",
    operations: [{ kind: "fill_draft", selection: paperView(paper).blocks[0].selection, paragraphs }],
    translations: paragraphs.map((_, index) => ({ operationIndexes: [0], paragraphIndexes: [index], text: `译文 ${index}` })), ...extra });
}
function change(paper: ReturnType<typeof initial>, quote: string, replacement: string, extra: object = {}) {
  const source = paperView(paper).blocks[0].selection, from = source.quote.indexOf(quote);
  return propose(paper, proposeRequest.parse({ action: "propose", requestId: `p-${paper.candidates.length}`, reason: "Synthetic scoped change.",
    operations: [{ kind: "replace", selection: { ...source, from, to: from + quote.length, quote }, replacement }], ...extra }));
}
function completed(paper: ReturnType<typeof initial>, requestId: string, turn: number) {
  const prepared = prepareReading(paper, readingRequest.parse({ action: "read_independently", requestId, candidateIds: "all", goal: "Check the supplied method.", evidence: "Synthetic source only." }),
    "task", { turn, turnStartSeq: turn * 10 });
  return updateReading(prepared.paper, prepared.reading.id, { status: "completed", output: {
    interpretation: { problem: "A supplied method", mechanism: "Evidence before claims", feedbackRole: "A specific revision" }, findings: [], limits: ["Synthetic evidence"] } });
}

test("a pending first draft is revised without accepting it; both comparison baselines and frozen reading survive", () => {
  const paragraphs = ["The design guarantees better understanding.", "The human decides.", "The program applies the decision."];
  const blank = initial();
  let paper = propose(blank, draftRequest(blank, paragraphs), { sessionId: "task", turn: 1, turnStartSeq: 10 });
  paper = completed(paper, "first-reading", 1);
  const oldCandidate = structuredClone(paper.candidates[0]), oldReading = structuredClone(paper.readings[0]);
  const oldPacket = readingPacket(paper, oldReading), source = structuredClone(paper.document);
  const revisedParagraphs = ["The design separates interpretation from authority.", ...paragraphs.slice(1)];
  const request = draftRequest(paper, revisedParagraphs, { revises: [oldCandidate.id] });
  let revised = propose(paper, request, { sessionId: "task", turn: 2, turnStartSeq: 20 });
  const latest = revised.candidates.at(-1)!;
  assert.strictEqual(revised.document, paper.document);
  assert.deepEqual(JSON.parse(JSON.stringify(revised.document)), source); assert.equal(revised.revision, 0);
  assert.deepEqual(revised.history, []); assert.deepEqual(revised.decisions, []);
  assert.deepEqual(revised.candidates[0], oldCandidate); assert.deepEqual(JSON.parse(JSON.stringify(revised.readings[0])), oldReading);
  assert.deepEqual(readingPacket(revised, revised.readings[0]), oldPacket);
  assert.deepEqual(latest.translations.slice(1), oldCandidate.translations.slice(1));
  assert.deepEqual(latest.operations[0].kind === "fill_draft" && latest.operations[0].paragraphs.slice(1), paragraphs.slice(1));
  assert.equal(latest.proposalDiff!.filter(part => part.kind !== "insert").map(part => part.text).join(""), paragraphs.join("\n"));
  assert.equal(latest.proposalDiff!.filter(part => part.kind !== "delete").map(part => part.text).join(""), revisedParagraphs.join("\n"));
  assert.equal(latest.diffs[0].filter(part => part.kind !== "delete").map(part => part.text).join(""), revisedParagraphs.join("\n"));
  assert.equal(paperView(revised).candidates[0].status, "superseded");
  assert.deepEqual(projectCandidates(revised, "all").candidateIds, [latest.id]);
  assert.throws(() => decideMany(revised, [oldCandidate.id], "accepted", 0), /revised/);
  assert.equal(propose(revised, request), revised, "Exact replay must not reactivate or duplicate the old candidate.");
  assert.throws(() => propose(revised, { ...request, requestId: "concurrent-replacement" }), /no longer pending/);
  revised = paperSchema.parse(JSON.parse(JSON.stringify(revised)));
  assert.deepEqual(revised.candidates[0], oldCandidate); assert.deepEqual(JSON.parse(JSON.stringify(revised.readings[0])), oldReading);
  assert.throws(() => decideMany(revised, [oldCandidate.id], "accepted", 0), /revised/);
  revised = completed(revised, "second-reading", 2);
  assert.equal(readingViews(revised)[0].combinationMatches, false);
  assert.equal(readingViews(revised)[1].combinationMatches, true);
  assert.deepEqual(revised.readings[1].candidateIds, [latest.id]);
  assert.deepEqual(readingPacket(revised, revised.readings[0]), oldPacket);
  const accepted = decideMany(revised, [latest.id], "accepted", 0);
  assert.deepEqual(paperView(accepted).blocks.map(block => block.text), revisedParagraphs);
  assert.equal(accepted.revision, 1); assert.equal(accepted.translations.length, 3);
  assert.deepEqual(accepted.candidates[0], oldCandidate);
});

test("revising a proposal keeps affected dependencies explicit and leaves unrelated proposals intact", () => {
  let paper = change(initial(["Alpha beta gamma."]), "Alpha", "First");
  const first = paper.candidates[0].id;
  paper = change(paper, "beta", "second", { dependsOn: [first] });
  const second = paper.candidates[1].id;
  assert.throws(() => change(paper, "Alpha", "Start", { revises: [first] }), /active proposal depends/);
  assert.throws(() => change(paper, "beta", "next", { revises: [second] }), /Retain the required pending dependency/);
  const revisedSecond = change(paper, "beta", "next", { revises: [second], dependsOn: [first] });
  assert.deepEqual(previewAcceptance(revisedSecond, "all").candidateIds, [first, revisedSecond.candidates.at(-1)!.id]);
  assert.throws(() => change(revisedSecond, "gamma", "last", { dependsOn: [second] }), /revised proposal cannot remain a dependency/);
  const grouped = propose(paper, proposeRequest.parse({ action: "propose", requestId: "explicit-group", reason: "Keep the two required edits together.",
    revises: [first, second], operations: [
      { kind: "replace", selection: { ...paperView(paper).blocks[0].selection, from: 0, to: 5, quote: "Alpha" }, replacement: "Start" },
      { kind: "replace", selection: { ...paperView(paper).blocks[0].selection, from: 6, to: 10, quote: "beta" }, replacement: "next" },
    ] }));
  assert.equal(paperView(grouped).candidates.filter(candidate => candidate.status === "pending").length, 1);
  let unrelated = change(initial(["Alpha beta gamma."]), "Alpha", "First");
  unrelated = change(unrelated, "gamma", "last");
  const untouched = structuredClone(unrelated.candidates[1]);
  unrelated = change(unrelated, "Alpha", "Start", { revises: [unrelated.candidates[0].id] });
  assert.deepEqual(unrelated.candidates[1], untouched);
  assert.equal(previewAcceptance(unrelated, "all").candidateIds.length, 2);
});

test("candidate revision retains linked feedback and refuses projected locations as accepted-source selections", () => {
  let paper = initial(["Alpha beta."]);
  paper = addFeedback(paper, { requestId: "feedback", target: { kind: "source", selections: [paperView(paper).blocks[0].selection] }, comment: "Clarify the actor." });
  paper = change(paper, "Alpha", "First", { feedbackIds: [paper.feedback[0].id] });
  assert.throws(() => change(paper, "Alpha", "Start", { revises: [paper.candidates[0].id] }), /Retain.*linked feedback/);
  const blank = initial(), drafted = propose(blank, draftRequest(blank, ["First paragraph.", "Second paragraph."]));
  const projected = projectCandidates(drafted, "all").document as { content: { attrs: { id: string } }[] };
  assert.throws(() => propose(drafted, proposeRequest.parse({ action: "propose", requestId: "projected-location", reason: "Invalid projected anchor.", revises: [drafted.candidates[0].id],
    operations: [{ kind: "replace", selection: { paperId: blank.id, revision: 0, blockId: projected.content[1].attrs.id, from: 0, to: 17, quote: "Second paragraph." }, replacement: "Changed paragraph." }] })), /block|paragraph|found/i);
});

test("an active revision retains its returned-change origin for duplicate proposal protection", () => {
  let paper = change(initial(["Alpha beta."]), "Alpha", "First");
  paper.candidates[0] = { ...paper.candidates[0], returnedFrom: { returnId: "return", changeIds: ["change"], mappings: [], sourceRevision: 0 } };
  paper = change(paper, "Alpha", "Start", { revises: [paper.candidates[0].id] });
  assert.throws(() => proposeReturnChanges(paper, proposeReturnRequest.parse({ action: "propose_return", requestId: "duplicate-return", returnId: "return",
    changeIds: ["change"], mappings: [], expectedRevision: 0, textOnly: true })), /already have a pending candidate/);
});

test("a fresh exact source can revise an older conflicting proposal without claiming an unavailable historical comparison", () => {
  let paper = change(initial(["Alpha beta."]), "Alpha", "First");
  const original = structuredClone(paper.candidates[0]);
  paper = change(paper, "Alpha", "Human");
  paper = decideMany(paper, [paper.candidates[1].id], "accepted", 0);
  assert.equal(paperView(paper).blocks[0].text, "Human beta.");
  assert.match(paperView(paper).candidates[0].conflict!, /overlaps/);
  const revised = change(paper, "Human", "Revised", { revises: [original.id] });
  const latest = revised.candidates.at(-1)!;
  assert.deepEqual(revised.candidates[0], original);
  assert.equal(paperView(revised).blocks[0].text, "Human beta.");
  assert.equal(revised.revision, 1);
  assert.equal(latest.proposalDiff, undefined);
  assert.match(latest.proposalComparisonIssue!, /earlier proposal.*current projection/);
  assert.deepEqual(latest.diffs[0], [{ kind: "delete", text: "Human" }, { kind: "insert", text: "Revised" }]);
  const selection = paperView(paper).blocks[0].selection;
  assert.throws(() => propose(paper, proposeRequest.parse({ action: "propose", requestId: "bad-new-source", revises: [original.id], reason: "Invalid exact source.",
    operations: [{ kind: "replace", selection: { ...selection, quote: "Alpha beta." }, replacement: "Unverified replacement." }] })), /exact source|selected range/);
});
