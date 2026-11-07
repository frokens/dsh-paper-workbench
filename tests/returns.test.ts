import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createPaper, importDocument, paperView, propose, decide, decideMany, mapSelection, type Paper } from "../src/model.js";
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
function editRange(paper: Paper, from: number, to: number, replacement: string) {
  const source = paperView(paper).blocks[0].selection;
  const next = propose(paper, proposeRequest.parse({ action: "propose", requestId: crypto.randomUUID(), reason: "Synthetic exact source edit.",
    operations: [{ kind: "replace", selection: { ...source, from, to, quote: source.quote.slice(from, to) }, replacement }] }));
  return decide(next, next.candidates.at(-1)!.id, "accepted");
}
function deliver(paper: Paper) {
  const output = engine({ action: "export", base64: paper.sourceBase64, tracked: false, ...wordProjection(paper), delivery: { id: "delivery", paperId: paper.id } });
  return { output, paper: recordDocumentDelivery(paper, { id: "delivery", revision: paper.revision, baselineRevision: 0, variant: "clean", format: "docx", includeReasons: false,
    name: "delivered.docx", base64: output.base64, bytes: Buffer.byteLength(output.base64, "base64"), anchors: output.anchors, translations: [], warnings: [] }) };
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

test("repeated returned wording cannot choose a different occurrence for text or comment provenance, with either equal or different native formats", () => {
  for (const formatted of [false, true]) {
    const created = engine(formatted ? { action: "fixture", fixture: "repeated-format" } : { action: "create", paragraphs: ["X X"] });
    const { paper, output } = deliver(from(created.base64));
    const remote = editRange(paper, 0, 2, ""), id = paperView(paper).blocks[0].id;
    const file = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id },
      comments: [{ blockIds: [id], selections: [{ blockId: id, from: 0, to: 1 }], text: "Keep the actual surviving occurrence." }] });
    const current = returned(editRange(paper, 0, 1, "Y"), file.base64);
    const comparison = compareReturn(current, "return", [], engine({ action: "inspect", base64: output.base64 }).blocks);
    assert.deepEqual(comparison.changes, []);
    assert.match(comparison.unCompared[0].diagnostic, /more than one possible source alignment/);
    assert.equal(comparison.comments[0].state, "unresolved");
    assert.deepEqual(comparison.comments[0].sources, []);
    assert.throws(() => proposeReturnChanges(current, proposeReturnRequest.parse({ action: "propose_return", requestId: "ambiguous",
      returnId: "return", expectedRevision: current.revision, mappings: [], changeIds: [`${id}:0`], textOnly: true })), /conflict-free/);
    const noContinuation = returned(paper, file.base64);
    assert.equal(compareReturn(noContinuation, "return").comments[0].state, "unresolved", "The repeated comment cannot silently attach to the first E occurrence either.");
    assert.throws(() => copyReturnComments(noContinuation, copyReturnCommentsRequest.parse({ action: "copy_return_comments", requestId: "ambiguous-copy", returnId: "return",
      commentIds: [comparison.comments[0].id], mappings: [], expectedRevision: 0, textOnly: true })), /exact current source/);
    assert.equal(paperView(current).blocks[0].text, "Y X");
    assert.equal(current.candidates.some(candidate => candidate.returnedFrom), false);
    const sameText = returned(editRange(paper, 1, 3, ""), file.base64);
    assert.equal(paperView(sameText).blocks[0].text, "X");
    const sameComparison = compareReturn(sameText, "return");
    assert.equal(sameComparison.comments[0].state, "unresolved", "P and R retain different original occurrences even when their current text matches.");
    assert.deepEqual(sameComparison.comments[0].sources, []);
    assert.throws(() => copyReturnComments(sameText, copyReturnCommentsRequest.parse({ action: "copy_return_comments", requestId: "equal-text-copy", returnId: "return",
      commentIds: [sameComparison.comments[0].id], mappings: [], expectedRevision: sameText.revision, textOnly: true })), /exact current source/);
  }
});

test("unchanged returned comments follow their actual delivered occurrence after equal-text local edits", () => {
  const { paper } = deliver(from(engine({ action: "fixture", fixture: "repeated-format" }).base64));
  const id = paperView(paper).blocks[0].id;
  const file = engine({ action: "export", base64: paper.sourceBase64, tracked: false, ...wordProjection(paper), delivery: { id: "delivery", paperId: paper.id },
    comments: [
      { blockIds: [id], selections: [{ blockId: id, from: 0, to: 1 }], text: "Original first occurrence." },
      { blockIds: [id], selections: [{ blockId: id, from: 2, to: 3 }], text: "Original second occurrence." },
    ] });
  const current = returned(editRange(editRange(paper, 0, 2, ""), 1, 1, " X"), file.base64);
  assert.equal(paperView(current).blocks[0].text, "X X");
  const comparison = compareReturn(current, "return"), first = comparison.comments.find(item => item.text === "Original first occurrence.")!,
    second = comparison.comments.find(item => item.text === "Original second occurrence.")!;
  assert.equal(first.state, "unresolved", "Re-entering identical text does not restore the removed original source.");
  assert.deepEqual(first.sources, []);
  assert.equal(second.state, "ready");
  assert.deepEqual(second.sources.map(item => [item.from, item.to, item.quote]), [[0, 1, "X"]], "The actual surviving occurrence moved to the first position.");
  const copy = (commentId: string) => copyReturnCommentsRequest.parse({ action: "copy_return_comments", requestId: `copy-${commentId}`, returnId: "return",
    mappings: [], commentIds: [commentId], expectedRevision: current.revision, textOnly: true });
  assert.throws(() => copyReturnComments(current, copy(first.id)), /exact current source/);
  const copied = copyReturnComments(current, copy(second.id));
  assert.equal(copied.feedback.length, 1);
  assert.deepEqual(copied.feedback[0].target, { kind: "source", selections: second.sources });
});

test("new returned comment wording requires its actual acceptance and keeps exact scope across local work and later source loss", () => {
  const { paper } = deliver(from(engine({ action: "create", paragraphs: ["alpha keeps omega."] }).base64));
  const remote = editRange(paper, 0, "alpha keeps omega.".length, "gamma keeps delta."), id = paperView(remote).blocks[0].id;
  const file = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id },
    comments: [
      { blockIds: [id], selections: [{ blockId: id, from: 0, to: 5 }], text: "New first word." },
      { blockIds: [id], selections: [{ blockId: id, from: 12, to: 17 }], text: "New last word." },
      { blockIds: [id], selections: [{ blockId: id, from: 0, to: 18 }], text: "Complete returned scope." },
    ] });
  const manual = returned(editRange(paper, 0, 18, "gamma keeps delta."), file.base64);
  assert.ok(compareReturn(manual, "return").comments.every(item => item.state === "unresolved"), "Equal P/R wording alone does not establish the returned source.");
  let current = returned(editRange(paper, 0, 0, "Local "), file.base64);
  current = proposeReturnChanges(current, proposal(current));
  assert.equal(current.candidates.at(-1)!.operations.length, 2);
  current = decide(current, current.candidates.at(-1)!.id, "accepted");
  let comments = compareReturn(current, "return").comments;
  assert.ok(comments.every(item => item.state === "ready"));
  assert.deepEqual(comments.find(item => item.text === "New first word.")!.sources.map(item => [item.from, item.to, item.quote]), [[6, 11, "gamma"]]);
  assert.deepEqual(comments.find(item => item.text === "Complete returned scope.")!.sources.map(item => [item.from, item.to, item.quote]), [[6, 24, "gamma keeps delta."]]);
  const acceptedScope = comments.find(item => item.text === "New first word.")!.sources[0];
  current = editRange(editRange(current, 6, 11, ""), 6, 6, "gamma");
  assert.equal(paperView(current).blocks[0].text, "Local gamma keeps delta.");
  assert.throws(() => mapSelection(current, acceptedScope), /intervening edit|removed/);
  comments = compareReturn(current, "return").comments;
  assert.equal(comments.find(item => item.text === "New first word.")!.state, "unresolved");
  assert.equal(comments.find(item => item.text === "Complete returned scope.")!.state, "unresolved");
  assert.equal(comments.find(item => item.text === "New last word.")!.state, "ready", "The unrelated accepted returned source still survives.");
});

test("grouped acceptance locates the return operation after boundary edits and unrelated multi-Step structural operations", () => {
  const { paper } = deliver(from(engine({ action: "create", paragraphs: ["alpha keeps omega.", "Left side right side.", "Third stays."] }).base64));
  const remote = editRange(paper, 0, 5, "gamma"), id = paperView(remote).blocks[0].id;
  const raw = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id },
    comments: [{ blockIds: [id], selections: [{ blockId: id, from: 0, to: 5 }], text: "Accepted new word." }] });
  for (const structure of ["split", "merge"] as const) {
    let current = returned(paper, raw.base64);
    const blocks = paperView(current).blocks;
    const prefix = () => {
      current = propose(current, proposeRequest.parse({ action: "propose", requestId: "prefix", reason: "Keep unrelated local prefix and structural work.",
        operations: [{ kind: "replace", selection: { ...blocks[0].selection, from: 0, to: 0, quote: "" }, replacement: "Local " },
          { kind: "replace", selection: { ...blocks[0].selection, from: 12, to: 17, quote: "omega" }, replacement: "pending" },
          structure === "split" ? { kind: "split", selection: { ...blocks[1].selection, from: 9, to: 9, quote: "" } }
            : { kind: "merge", selection: blocks[1].selection, next: blocks[2].selection, separator: " / " }] }));
    };
    prefix();
    current = proposeReturnChanges(current, proposal(current));
    current = decideMany(current, current.candidates.filter(item => item.status === "pending").map(item => item.id), "accepted", current.revision);
    assert.equal(current.history.length, 1);
    assert.equal(paperView(current).blocks[0].text, "Local gamma keeps pending.");
    const comment = compareReturn(current, "return").comments[0];
    assert.equal(comment.state, "ready", `${structure}: ${comment.diagnostic}`);
    assert.deepEqual(comment.sources.map(item => [item.from, item.to, item.quote]), [[6, 11, "gamma"]]);
    assert.equal(paperView(current).blocks.length, structure === "split" ? 4 : 2);
  }
});

test("saved granular return operations establish the current returned scope without assuming matching diff indexes", () => {
  const { paper } = deliver(from(engine({ action: "create", paragraphs: ["The Planner proposes an action."] }).base64));
  const remote = editRange(paper, 0, paperView(paper).blocks[0].text.length, "The Planner chooses a safe action."), id = paperView(remote).blocks[0].id;
  const raw = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id },
    comments: [{ blockIds: [id], selections: [{ blockId: id, from: 22, to: 26 }], text: "Explain the safety condition." }] });
  for (const separate of [false, true]) {
    let current = returned(paper, raw.base64);
    const s = paperView(current).blocks[0].selection;
    const operations = [[12, 14, "ch"], [15, 16, ""], [22, 23, ""], [24, 24, "s"], [25, 25, "fe a"]].map(([from, to, replacement]) =>
      ({ kind: "replace" as const, selection: { ...s, from: Number(from), to: Number(to), quote: s.quote.slice(Number(from), Number(to)) }, replacement: String(replacement) }));
    for (const [index, group] of (separate ? operations.map(operation => [operation]) : [operations]).entries()) {
      current = propose(current, proposeRequest.parse({ action: "propose", requestId: `saved-${index}`, reason: "Recorded granular return operations.", operations: group }));
      const candidate = current.candidates.at(-1)!;
      current = { ...current, candidates: current.candidates.map(item => item.id === candidate.id ? { ...item,
        returnedFrom: { returnId: "return", sourceRevision: 0, mappings: [], changeIds: group.map((_, operationIndex) => `${id}:${separate ? index : operationIndex}`) } } : item) };
    }
    for (const candidate of current.candidates) current = decide(current, candidate.id, "accepted");
    assert.equal(paperView(current).blocks[0].text, "The Planner chooses a safe action.");
    const comment = compareReturn(current, "return").comments[0];
    assert.equal(comment.state, "ready", comment.diagnostic);
    assert.deepEqual(comment.sources.map(item => [item.from, item.to, item.quote]), [[22, 26, "safe"]]);
  }
});

test("accepting another return change cannot establish manually typed identical wording", () => {
  const { paper } = deliver(from(engine({ action: "create", paragraphs: ["alpha keeps omega."] }).base64));
  const remote = editRange(paper, 0, 18, "gamma keeps delta."), id = paperView(remote).blocks[0].id;
  const raw = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id },
    comments: [{ blockIds: [id], selections: [{ blockId: id, from: 0, to: 5 }], text: "First returned word." },
      { blockIds: [id], selections: [{ blockId: id, from: 12, to: 17 }], text: "Last returned word." }] });
  let current = returned(editRange(paper, 0, 5, "gamma"), raw.base64);
  const comparison = compareReturn(current, "return"), ready = comparison.changes.filter(item => item.status === "ready");
  assert.equal(ready.length, 1);
  current = proposeReturnChanges(current, proposeReturnRequest.parse({ action: "propose_return", requestId: "partial-return", returnId: "return",
    mappings: [], changeIds: ready.map(item => item.id), expectedRevision: current.revision, textOnly: true }));
  current = decide(current, current.candidates.at(-1)!.id, "accepted");
  assert.equal(paperView(current).blocks[0].text, "gamma keeps delta.");
  const comments = compareReturn(current, "return").comments;
  assert.equal(comments.find(item => item.text === "First returned word.")!.state, "unresolved");
  assert.equal(comments.find(item => item.text === "Last returned word.")!.state, "ready");
});

test("native formats are compared at their actual text spans, detecting removal and reassignment while ignoring equivalent run boundaries", () => {
  const created = engine({ action: "fixture", fixture: "repeated-format" });
  const { paper, output } = deliver(from(created.base64)), expected = engine({ action: "inspect", base64: output.base64 }).blocks;
  const plain = editRange(editRange(paper, 0, 2, ""), 1, 1, " X");
  assert.equal(paperView(plain).blocks[0].text, "X X");
  const plainFile = engine({ action: "export", base64: plain.sourceBase64, tracked: false, ...wordProjection(plain), delivery: { id: "delivery", paperId: paper.id } });
  const comparison = compareReturn(returned(paper, plainFile.base64), "return", [], expected);
  assert.deepEqual(comparison.changes, []);
  assert.equal(comparison.formatChanges.length, 1, "Removing a format already present elsewhere is still a real format change.");
  const projection = wordProjection(paper);
  const swapped = projection.flow.map(event => event.kind === "text" && event.styleFrom?.sourceIndex === 0
    ? { ...event, styleFrom: { sourceIndex: 0, offset: event.styleFrom.offset === 0 ? 2 : 0 } } : event);
  const swapFile = engine({ action: "export", base64: paper.sourceBase64, tracked: false, flow: swapped, delivery: { id: "delivery", paperId: paper.id } });
  assert.equal(compareReturn(returned(paper, swapFile.base64), "return", [], expected).formatChanges.length, 1, "The same set of formats assigned to different spans is reported.");
  const split = projection.flow.flatMap(event => event.kind === "text" && event.text.length > 1
    ? [{ ...event, text: event.text.slice(0, 1) }, { ...event, text: event.text.slice(1), styleFrom: event.styleFrom && { ...event.styleFrom, offset: event.styleFrom.offset + 1 } }] : [event]);
  const splitFile = engine({ action: "export", base64: paper.sourceBase64, tracked: false, flow: split, delivery: { id: "delivery", paperId: paper.id } });
  assert.deepEqual(compareReturn(returned(paper, splitFile.base64), "return", [], expected).formatChanges, [], "Equivalent native properties survive a different run segmentation without a false warning.");
  assert.deepEqual(compareReturn(returned(paper, output.base64), "return", [], expected).formatChanges, []);
});

test("known paragraph boundaries and unique content gaps preserve exact Unicode and whitespace without treating edit ordering as ambiguous", () => {
  for (const [before, after] of [["alpha beta", "gamma delta"], ["", "🧪 New result."], ["😀 alpha\u00a0 beta!", "😀 gamma\u00a0 beta!"]]) {
    const created = engine({ action: "create", paragraphs: [before] }), { paper, output } = deliver(from(created.base64));
    const remote = editRange(paper, 0, before.length, after);
    const raw = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id } });
    const current = returned(paper, raw.base64), comparison = compareReturn(current, "return", [], engine({ action: "inspect", base64: output.base64 }).blocks);
    assert.deepEqual(comparison.unCompared, []);
    assert.ok(comparison.changes.length > 0 && comparison.changes.every(change => change.status === "ready"));
    assert.deepEqual(comparison.formatChanges, []);
    const pending = proposeReturnChanges(current, proposal(current));
    assert.equal(paperView(decide(pending, pending.candidates.at(-1)!.id, "accepted")).blocks[0].text, after);
  }
});

test("an over-limit paragraph is explicit and does not prevent an unrelated paragraph from being compared", () => {
  const long = Array.from({ length: 2200 }, (_, index) => `term${index}`).join(" ");
  const { paper } = deliver(from(engine({ action: "create", paragraphs: [long, "The result remains unverified."] }).base64));
  const remote = change(change(paper, 0, `${long} added`), 1, "The outcome remains unverified.");
  const raw = engine({ action: "export", base64: remote.sourceBase64, tracked: false, ...wordProjection(remote), delivery: { id: "delivery", paperId: paper.id } });
  const comparison = compareReturn(returned(paper, raw.base64), "return");
  assert.equal(comparison.unCompared.length, 1);
  assert.match(comparison.unCompared[0].diagnostic, /bounded source comparison/);
  assert.ok(comparison.changes.length && comparison.changes.every(change => change.blockId === paperView(paper).blocks[1].id && change.status === "ready"));
});
