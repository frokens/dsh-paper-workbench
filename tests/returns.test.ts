import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createPaper, importDocument, paperView, propose, decide, type Paper } from "../src/model.js";
import { proposeRequest, proposeReturnRequest, copyReturnCommentsRequest } from "../src/contracts.js";
import { wordProjection, wordComments } from "../src/word.js";
import { recordDocumentDelivery } from "../src/delivery.js";
import { recordDocumentReturn, compareReturn, proposeReturnChanges, copyReturnComments } from "../src/returns.js";

function engine(input: object) {
  const child = spawnSync("runtime/osx-arm64/paper-docx", { input: JSON.stringify(input), encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(child.error, undefined);
  const result = JSON.parse(child.stdout);
  assert.equal(result.ok, true, result.error);
  return result.result;
}
function from(base64: string) {
  const source = engine({ action: "inspect", base64 });
  return createPaper({ id: "paper", name: "paper.docx", originalBase64: base64, sourceBase64: source.normalizedBase64,
    document: importDocument(source.blocks), warnings: source.warnings });
}
function change(paper: Paper, index: number, replacement: string) {
  const next = propose(paper, proposeRequest.parse({ action: "propose", requestId: `change-${paper.revision}`, reason: "Clarify the supplied wording.",
    operations: [{ kind: "replace", selection: paperView(paper).blocks[index].selection, replacement }] }));
  return decide(next, next.candidates.at(-1)!.id, "accepted");
}
function fixture() {
  const created = engine({ action: "create", paragraphs: ["The Planner selects an action.", "The result remains unverified."] });
  const original = from(created.base64);
  let paper = change(original, 0, "The Planner proposes an action.");
  const output = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...wordProjection(paper), delivery: { id: "delivery", paperId: paper.id } });
  paper = recordDocumentDelivery(paper, { id: "delivery", revision: 1, baselineRevision: 0, variant: "tracked", format: "docx", includeReasons: false,
    name: "tracked.docx", base64: output.base64, bytes: Buffer.byteLength(output.base64, "base64"), anchors: output.anchors, translations: [], warnings: [] });
  return { paper, original, output };
}
function returned(paper: Paper, base64: string, mode?: "accept" | "reject", id = "return") {
  const projection = engine({ action: "inspect", base64, revisionMode: mode });
  return recordDocumentReturn(paper, { id, deliveryId: "delivery", name: "returned.docx", originalBase64: base64,
    revisionMode: mode ?? "none", blocks: projection.blocks, nativeComments: projection.nativeComments,
    warnings: projection.warnings, deliveryMarkers: projection.deliveryMarkers });
}
function proposal(paper: Paper, id = "return", mappings: { sourceIndex: number; blockId: string }[] = []) {
  const comparison = compareReturn(paper, id, mappings);
  return proposeReturnRequest.parse({ action: "propose_return", requestId: "return-proposal", returnId: id, mappings,
    expectedRevision: paper.revision, textOnly: true, changeIds: comparison.changes.map(change => change.id) });
}

test("SDK return projections compare against actual delivered E, never repropose B-to-E changes or overwrite continued P", () => {
  const { paper, original, output } = fixture();
  const acceptedReturn = returned(paper, output.base64, "accept");
  assert.deepEqual(compareReturn(acceptedReturn, "return").changes, [], "The already delivered B-to-E change is not proposed again.");
  let current = change(paper, 1, "The result is still unverified.");
  current = returned(current, output.base64, "reject");
  const comparison = compareReturn(current, "return");
  assert.equal(comparison.baselineRevision, 0); assert.equal(comparison.deliveredRevision, 1); assert.equal(comparison.currentRevision, 2);
  assert.ok(comparison.changes.length > 0 && comparison.changes.every(change => change.status === "ready"));
  const request = proposal(current), before = current.document;
  const candidate = proposeReturnChanges(current, request);
  assert.deepEqual(candidate.document, before);
  assert.equal(candidate.candidates.at(-1)!.returnedFrom?.returnId, "return");
  const applied = decide(candidate, candidate.candidates.at(-1)!.id, "accepted");
  assert.equal(paperView(applied).blocks[0].text, paperView(original).blocks[0].text, "Rejecting delivered Word changes creates a real proposal back to B.");
  assert.equal(paperView(applied).blocks[1].text, "The result is still unverified.", "The unrelated local continuation remains intact.");
  assert.equal(proposeReturnChanges(applied, request), applied, "A repeated return request is idempotent after acceptance.");
  assert.ok(compareReturn(applied, "return").changes.every(change => change.status === "already_applied"));
  assert.equal(applied.documentReturns[0].originalBase64, output.base64);
  assert.equal(applied.documentDeliveries[0].revision, 1);
});

test("overlapping local continuation is a conflict and a wrong delivery marker cannot create candidates", () => {
  const { paper, output } = fixture();
  const current = returned(change(paper, 0, "The Planner recommends an action."), output.base64, "reject");
  assert.ok(compareReturn(current, "return").changes.every(change => change.status === "conflict"));
  assert.throws(() => proposeReturnChanges(current, proposal(current)), /conflict-free/);
  const wrong = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...wordProjection(paper), delivery: { id: "different", paperId: "different-paper" } });
  const mismatched = returned(paper, wrong.base64, "reject");
  assert.equal(compareReturn(mismatched, "return").markerMismatch, true);
  assert.throws(() => proposeReturnChanges(mismatched, proposal(mismatched)), /conflict-free/);
});

test("a third-party re-export with changed native IDs requires explicit paragraph alignment", () => {
  const { paper, output } = fixture();
  const rejected = engine({ action: "inspect", base64: output.base64, revisionMode: "reject" });
  const remade = from(rejected.normalizedBase64);
  const thirdParty = engine({ action: "export", base64: remade.sourceBase64, tracked: false, ...wordProjection(remade) });
  const current = returned(paper, thirdParty.base64);
  const automatic = compareReturn(current, "return");
  assert.equal(automatic.unmapped.length, 2); assert.equal(automatic.changes.length, 0);
  assert.ok(automatic.warnings.some(warning => warning.includes("no delivery marker")));
  const mappings = current.documentReturns[0].blocks.map((block, index) => ({ sourceIndex: block.sourceIndex, blockId: paperView(paper).blocks[index].id }));
  assert.ok(compareReturn(current, "return", mappings).changes.every(change => change.status === "ready"));
  const proposed = proposeReturnChanges(current, proposal(current, "return", mappings));
  assert.deepEqual(proposed.candidates.at(-1)!.returnedFrom?.mappings, mappings);
  assert.throws(() => compareReturn(current, "return", [{ ...mappings[0] }, { ...mappings[0], sourceIndex: 1 }]), /distinct/);
});

test("returned comment text enters existing feedback only at an exact current source range and survives native tracked projections", () => {
  const { paper } = fixture();
  const remote = change(paper, 0, "The Planner chooses the action.");
  const block = paperView(remote).blocks[0], from = block.text.indexOf("chooses"), to = from + "chooses".length;
  const output = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote),
    delivery: { id: "delivery", paperId: paper.id }, comments: [{ blockIds: [block.id], selections: [{ blockId: block.id, from, to }], text: "Clarify the action owner." }] });
  let current = returned(change(paper, 1, "The result is still unverified."), output.base64);
  const originalReturn = current.documentReturns[0];
  let comparison = compareReturn(current, "return");
  assert.equal(comparison.comments[0].state, "unresolved");
  assert.equal(comparison.comments[0].locations[0].quote, "chooses");
  const copy = () => copyReturnCommentsRequest.parse({ action: "copy_return_comments", requestId: "copy-comment", returnId: "return",
    mappings: [], commentIds: [comparison.comments[0].id], expectedRevision: current.revision, textOnly: true });
  assert.throws(() => copyReturnComments(current, copy()), /exact current source/);
  const request = proposal(current);
  current = proposeReturnChanges(current, request);
  assert.throws(() => proposeReturnChanges(current, { ...request, requestId: "duplicate-pending" }), /pending candidate/);
  current = decide(current, current.candidates.at(-1)!.id, "accepted");
  comparison = compareReturn(current, "return");
  assert.equal(comparison.comments[0].state, "ready");
  assert.equal(comparison.comments[0].sources[0].quote, "chooses");
  const beforeBody = current.document, copyRequest = copy();
  current = copyReturnComments(current, copyRequest);
  assert.deepEqual(current.document, beforeBody);
  assert.equal(paperView(current).blocks[1].text, "The result is still unverified.");
  assert.deepEqual(current.feedback[0].returnComment, { returnId: "return", commentId: comparison.comments[0].id });
  assert.equal(current.feedback[0].target.kind, "source");
  assert.equal(copyReturnComments(current, copyRequest), current);
  assert.equal(compareReturn(current, "return").comments[0].state, "copied");
  assert.deepEqual(current.documentReturns[0], originalReturn);
  const exported = engine({ action: "export", base64: current.sourceBase64, tracked: true, ...wordProjection(current),
    comments: wordComments(current, 0, current.revision, false).comments });
  for (const revisionMode of ["accept", "reject"]) {
    const inspected = engine({ action: "inspect", base64: exported.base64, revisionMode });
    assert.equal(inspected.nativeComments.length, 1);
    assert.equal(inspected.nativeComments[0].text, "Clarify the action owner.");
    assert.equal(inspected.nativeComments[0].editable, true);
    if (revisionMode === "accept") {
      const range = inspected.nativeComments[0].ranges[0];
      assert.equal(inspected.blocks[range.sourceIndex].text.slice(range.from, range.to), "chooses");
    }
  }
});
