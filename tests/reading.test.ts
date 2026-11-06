import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaper, importDocument, paperView, propose, decide, decideMany, addFeedback, documentAt, schema, requestTranslation, completeTranslation, correctTranslation } from "../src/model.js";
import { proposeRequest, readingRequest } from "../src/contracts.js";
import { paperSchema } from "../src/records.js";
import { prepareReading, readingBlocks, readingViews, updateReading, validateReadingOutput } from "../src/reading.js";
import { Node as PMNode } from "prosemirror-model";

function fixture() {
  return createPaper({ id: "paper", name: "Synthetic", brief: "Keep decision and execution distinct.", originalBase64: "original", sourceBase64: "source", warnings: [], document: importDocument(["The model decides.", "The worker executes.", "The result is unverified."].map((text, sourceIndex) => ({ sourceIndex, text, editable: true, style: null, runs: [{ text, bold: false, italic: false }], reason: null }))) });
}
function replace(paper: ReturnType<typeof fixture>, index: number, text: string) {
  return propose(paper, proposeRequest.parse({ action: "propose", requestId: `p${paper.candidates.length}`, operations: [{ kind: "replace", selection: paperView(paper).blocks[index].selection, replacement: text }], reason: "Clarify roles." }));
}
const request = readingRequest.parse({ action: "read_independently", requestId: "r", candidateIds: "all", goal: "Check roles and evidence.", evidence: "Synthetic experiment: no verified result was supplied." });
function completed(prepared: ReturnType<typeof prepareReading>) {
  return updateReading(prepared.paper, prepared.reading.id, { status: "completed", output: { interpretation: { problem: "Roles and evidence", mechanism: "Selection precedes execution", feedbackRole: "Preserve conditions" }, findings: [], limits: ["Synthetic evidence only"] } });
}

test("reading material uses the actual candidate projection, full surrounding source and linked feedback without mutating the primary body", () => {
  let paper = fixture();
  paper = addFeedback(paper, { requestId: "f", target: { kind: "source", selections: [paperView(paper).blocks[0].selection] }, comment: "Clarify who makes the decision." });
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "p", operations: [{ kind: "replace", selection: paperView(paper).blocks[0].selection, replacement: "The model proposes the next action." }], reason: "Clarify decision ownership.", feedbackIds: [paper.feedback[0].id] }));
  const before = JSON.stringify(paper), prepared = prepareReading(paper, request, "task");
  const accepted = decideMany(paper, prepared.reading.candidateIds, "accepted", 0);
  assert.ok(PMNode.fromJSON(schema, prepared.reading.material.candidateDocument).eq(documentAt(accepted, 1)));
  assert.deepEqual(prepared.reading.material.feedback, paper.feedback);
  assert.equal(readingBlocks(prepared.reading.material.baselineDocument).length, 3);
  assert.equal(readingBlocks(prepared.reading.material.candidateDocument)[2].text, "The result is unverified.");
  assert.equal(JSON.stringify(paper), before);
  assert.strictEqual(prepared.paper.document, paper.document);
});

test("partial acceptance retains evidence for the original full combination while requiring a check of the new accepted body", () => {
  let paper = replace(replace(fixture(), 0, "The model selects an action."), 1, "The worker performs that action.");
  const prepared = prepareReading(paper, request, "task");
  paper = updateReading(prepared.paper, prepared.reading.id, { status: "completed", output: { interpretation: { problem: "Roles", mechanism: "A decision is executed.", feedbackRole: "Clarifies roles." }, findings: [], limits: [] } });
  assert.equal(readingViews(paper)[0].combinationMatches, true);
  assert.equal(readingViews(paper)[0].currentBodyReviewed, true);
  paper = decide(paper, paper.candidates[0].id, "accepted");
  assert.equal(readingViews(paper)[0].combinationMatches, true);
  assert.equal(readingViews(paper)[0].currentBodyReviewed, false);
  const retained = JSON.stringify(paper.readings[0]);
  paper = decide(paper, paper.candidates[1].id, "accepted");
  assert.equal(readingViews(paper)[0].currentBodyReviewed, true);
  assert.equal(JSON.stringify(paper.readings[0]), retained);
  paper = replace(paper, 2, "A result has now been verified.");
  paper = decide(paper, paper.candidates.at(-1)!.id, "accepted");
  assert.equal(readingViews(paper)[0].combinationMatches, false);
  assert.equal(readingViews(paper)[0].currentBodyReviewed, false);
  assert.equal(paper.readings.length, 1, "Context changes do not automatically run another reader.");
});

test("reading retries retain the original material and candidate binding after changes; a focused recheck is a separate retained record", () => {
  let paper = replace(fixture(), 0, "The model selects an action.");
  const prepared = prepareReading(paper, request, "task");
  paper = decide(prepared.paper, paper.candidates[0].id, "accepted");
  assert.strictEqual(prepareReading(paper, request, "task").reading, prepared.reading);
  assert.throws(() => prepareReading(paper, { ...request, goal: "Different" }, "task"), /different independent reading/);
  const recheck = prepareReading(paper, { ...request, requestId: "recheck", candidateIds: [], replaces: prepared.reading.id }, "task");
  assert.equal(recheck.paper.readings.length, 2);
  assert.equal(recheck.reading.sourceRevision, 1);
  assert.equal(recheck.reading.replaces, prepared.reading.id);
  assert.deepEqual(recheck.paper.readings[0], prepared.reading);
});

test("reader findings must quote real reviewed content and candidates; compatible old B papers receive empty reading state", () => {
  const old = fixture(), { readings: _readings, brief: _brief, ...storedB } = old;
  const paper = paperSchema.parse(storedB);
  assert.deepEqual(paper.readings, []);
  assert.ok(PMNode.fromJSON(schema, paper.document).eq(PMNode.fromJSON(schema, old.document)));
  const reading = prepareReading(paper, { ...request, candidateIds: [] }, "task").reading;
  const output = { interpretation: { problem: "Roles", mechanism: "Decision and execution", feedbackRole: "Local clarification" }, findings: [{ kind: "question", locations: [{ version: "baseline", blockId: paperView(paper).blocks[2].id, quote: "unverified" }], candidateIds: [], issue: "No verification result", impact: "Cannot claim validation", evidence: "No experiment supplied", suggestion: "Keep the limit explicit" }], limits: ["Synthetic evidence only"] };
  assert.equal(validateReadingOutput(reading, output).findings.length, 1);
  assert.throws(() => validateReadingOutput(reading, { ...output, findings: [{ ...output.findings[0], locations: [] }] }), /needs a location/);
  assert.throws(() => validateReadingOutput(reading, { ...output, findings: [{ ...output.findings[0], candidateIds: ["unknown"] }] }), /outside its reviewed scope/);
  assert.throws(() => validateReadingOutput(reading, { ...output, findings: [{ ...output.findings[0], locations: [{ ...output.findings[0].locations[0], quote: "verified result" }] }] }), /does not locate/);
});

test("unfinished and failed reading states never certify a reviewed current body or combination", () => {
  const prepared = prepareReading(fixture(), { ...request, candidateIds: [] }, "task");
  for (const status of ["queued", "running", "failed", "cancelled", "interrupted", "completed"] as const) {
    const view = readingViews(updateReading(prepared.paper, prepared.reading.id, { status }))[0];
    assert.equal(view.currentBodyReviewed, false, status);
    assert.equal(view.currentSourceReviewed, false, status);
    assert.equal(view.combinationMatches, false, status);
  }
  const view = readingViews(completed(prepared))[0];
  assert.equal(view.currentBodyReviewed, true);
  assert.equal(view.combinationMatches, true);
});

test("Chinese-only correction invalidates its bilingual input while retaining unchanged source and other translation evidence", () => {
  let paper = fixture();
  paper = requestTranslation(paper, { requestId: "zh", sources: [paperView(paper).blocks[0].selection, paperView(paper).blocks[2].selection], replaces: [] }, "task");
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[0].id, groups: [{ sourceIndexes: [0], text: "模型作出决定。" }, { sourceIndexes: [1], text: "该结果尚未经验证。" }] });
  const prepared = prepareReading(paper, { ...request, candidateIds: [] }, "task");
  paper = completed(prepared);
  const old = JSON.stringify(paper.readings[0]), translation = paper.translations[1], unaffected = JSON.stringify(paper.translations[0]);
  paper = correctTranslation(paper, { translationId: translation.id, version: 1, from: 0, to: translation.text.length, quote: translation.text }, "该结果已经验证。");
  const view = readingViews(paper)[0];
  assert.equal(view.currentSourceReviewed, true);
  assert.equal(view.sourceCombinationMatches, true);
  assert.equal(view.currentBodyReviewed, false);
  assert.equal(view.combinationMatches, false);
  assert.equal(view.bilingualChanges.length, 1);
  assert.deepEqual(view.bilingualChanges[0].sourceBlockIds, [paperView(paper).blocks[2].id]);
  assert.equal(view.bilingualChanges[0].beforeVersion, 1);
  assert.equal(view.bilingualChanges[0].afterVersion, 2);
  assert.equal(JSON.stringify(paper.translations[0]), unaffected);
  assert.equal(JSON.stringify(paper.readings[0]), old);
  const changed = paper.translations[1];
  paper = correctTranslation(paper, { translationId: changed.id, version: 2, from: 0, to: changed.text.length, quote: changed.text }, translation.text);
  assert.equal(readingViews(paper)[0].currentBodyReviewed, false, "A later correction version is not silently certified by an earlier version's reading.");
});

test("replacing a translation at the same source revision requires a bilingual recheck without invalidating source evidence", () => {
  let paper = fixture();
  paper = requestTranslation(paper, { requestId: "old", sources: [paperView(paper).blocks[2].selection], replaces: [] }, "task");
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[0].id, groups: [{ sourceIndexes: [0], text: "该结果尚未经验证。" }] });
  const prepared = prepareReading(paper, { ...request, candidateIds: [] }, "task");
  paper = completed(prepared);
  paper = requestTranslation(paper, { requestId: "new", sources: [paperView(paper).blocks[2].selection], replaces: [paper.translations[0].id] }, "task");
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[1].id, groups: [{ sourceIndexes: [0], text: "该结果已经验证。" }] });
  const view = readingViews(paper)[0];
  assert.equal(paper.revision, 0);
  assert.equal(view.currentSourceReviewed, true);
  assert.equal(view.currentBodyReviewed, false);
  assert.equal(view.combinationMatches, false);
  assert.ok(view.bilingualChanges.some(change => change.afterText === "该结果已经验证。"));
});

test("reviewed candidate Chinese remains applicable after actual acceptance creates new projection identities, then its correction affects that Chinese scope", () => {
  let paper = fixture();
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "candidate-zh", operations: [{ kind: "replace", selection: paperView(paper).blocks[0].selection, replacement: "The model selects the next action." }], reason: "Clarify selection.", translations: [{ operationIndexes: [0], text: "模型选择下一步操作。" }] }));
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "worker-zh", operations: [{ kind: "replace", selection: paperView(paper).blocks[1].selection, replacement: "The worker executes the selected action." }], reason: "Clarify execution.", translations: [{ operationIndexes: [0], text: "工作单元执行所选操作。" }] }));
  const prepared = prepareReading(paper, request, "task");
  paper = completed(prepared);
  assert.equal(readingViews(paper)[0].combinationMatches, true);
  paper = decide(paper, paper.candidates[0].id, "accepted");
  assert.equal(readingViews(paper)[0].combinationMatches, true, "The original bilingual combination survives partial acceptance and projection identity changes.");
  assert.equal(readingViews(paper)[0].currentBodyReviewed, false);
  paper = decide(paper, paper.candidates[1].id, "accepted");
  const original = readingViews(paper)[0];
  assert.notEqual(paper.translations[0].id, prepared.reading.material.candidateTranslations[0].id);
  assert.equal(original.combinationMatches, true);
  assert.equal(original.currentBodyReviewed, true);
  assert.equal(original.bilingualChanges.length, 0);
  const translation = paper.translations[0];
  paper = correctTranslation(paper, { translationId: translation.id, version: 1, from: 0, to: translation.text.length, quote: translation.text }, "工作单元选择下一步操作。");
  const changed = readingViews(paper)[0];
  assert.equal(changed.currentSourceReviewed, true);
  assert.equal(changed.combinationMatches, false);
  assert.equal(changed.currentBodyReviewed, false);
  assert.equal(changed.bilingualChanges.length, 1);
  assert.deepEqual(changed.bilingualChanges[0].candidateIds, [paper.candidates[0].id]);
});
