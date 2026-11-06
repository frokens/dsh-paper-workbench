import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaper, importDocument, paperView, propose, decide, decideMany, addFeedback, documentAt, schema } from "../src/model.js";
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
