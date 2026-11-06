import { wordProjection, wordReasons, wordComments } from "../src/word.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  importDocument,
  createPaper,
  propose as proposeGroup,
  decide,
  paperView,
  undoDecision,
  restoreRevision,
  documentAt,
  importWordComments,
  type Paper,
} from "../src/model.js";
import { proposeRequest, type Selection, type Operation } from "../src/contracts.js";
import { bilingualProjection } from "../src/delivery.js";
import { requestTranslation, completeTranslation } from "../src/model.js";

function propose(
  paper: Paper,
  request: {
    action: "propose";
    requestId: string;
    selection: Selection;
    replacement: string;
    reason: string;
  },
) {
  return proposeGroup(
    paper,
    proposeRequest.parse({
      action: "propose",
      requestId: request.requestId,
      reason: request.reason,
      operations: [
        {
          kind: "replace",
          selection: request.selection,
          replacement: request.replacement,
        },
      ],
    }),
  );
}

function engine(request: object) {
  const process = spawnSync("runtime/osx-arm64/paper-docx", {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(process.error, undefined);
  const result = JSON.parse(process.stdout);
  assert.equal(result.ok, true, result.error);
  assert.equal(process.status, 0);
  return result.result;
}

const fixture = engine({ action: "fixture" });
const imported = engine({ action: "inspect", base64: fixture.base64 });
test("SDK-created blank drafts enter the same exact proposal, decision and native Word projection", () => {
  const created = engine({ action: "create" });
  const source = engine({ action: "inspect", base64: created.base64 });
  assert.equal(source.blocks.length, 1);
  assert.equal(source.blocks[0].text, "");
  assert.equal(source.blocks[0].editable, true);
  let paper = createPaper({ id: "draft", name: "Draft.docx", brief: "Use supplied evidence.", originalBase64: created.base64, sourceBase64: source.normalizedBase64, document: importDocument(source.blocks), warnings: source.warnings });
  paper = propose(paper, { action: "propose", requestId: "draft", selection: paperView(paper).blocks[0].selection, replacement: "The result remains unverified.", reason: "Draft from the stated evidence." });
  paper = decide(paper, paper.candidates[0].id, "accepted");
  const exported = engine({ action: "export", base64: paper.sourceBase64, tracked: true, flow: wordProjection(paper).flow });
  assert.equal(engine({ action: "inspect", base64: exported.base64, revisionMode: "accept" }).blocks[0].text, "The result remains unverified.");
  assert.equal(engine({ action: "inspect", base64: exported.base64, revisionMode: "reject" }).blocks[0].text, "");
});
function initial(): Paper {
  const document = importDocument(imported.blocks);
  return createPaper({
    id: "paper",
    name: "synthetic.docx",
    document,
    sourceBase64: imported.normalizedBase64,
    originalBase64: fixture.base64,
    warnings: imported.warnings,
  });
}
function request(paper: Paper) {
  const block = paperView(paper).blocks[1];
  const quote = "The worker executes the operation.";
  const from = block.text.lastIndexOf(quote);
  return {
    action: "propose" as const,
    requestId: "proposal",
    selection: { ...block.selection, from, to: from + quote.length, quote },
    replacement: "The executor runs the operation.",
    reason: "Clarify execution ownership.",
  };
}

function acceptOperations(paper: Paper, operations: Operation[]) {
  const proposed = proposeGroup(paper, proposeRequest.parse({ action: "propose", requestId: `structure-${paper.candidates.length}`,
    reason: "Verify exact native paragraph-mark and format projections.", operations }));
  return decide(proposed, proposed.candidates.at(-1)!.id, "accepted");
}

function assertWordProjection(paper: Paper, baseline = 0, revision = paper.revision) {
  const expected = (at: number) => [...documentAt(paper, at).content.content].map(node => ({ text: node.textContent, style: node.attrs.heading }));
  const inspected = (base64: string, revisionMode?: "accept" | "reject") => engine({ action: "inspect", base64, revisionMode });
  const blocks = (value: ReturnType<typeof inspected>) => value.blocks.map((block: { text: string; style: string | null }) => ({ text: block.text, style: block.style }));
  const projection = wordProjection(paper, baseline, revision);
  const clean = engine({ action: "export", base64: paper.sourceBase64, tracked: false, ...projection });
  assert.deepEqual(blocks(inspected(clean.base64)), expected(revision));
  assert.equal(inspected(clean.base64).hasRevisions, false);
  const tracked = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...projection });
  assert.deepEqual(blocks(inspected(tracked.base64, "accept")), expected(revision));
  assert.deepEqual(blocks(inspected(tracked.base64, "reject")), expected(baseline));
  return tracked;
}

test("empty-to-three-paragraph native revisions reject to one empty paragraph and survive inverse history", () => {
  const source = engine({ action: "create" });
  const imported = engine({ action: "inspect", base64: source.base64 });
  const blank = createPaper({ id: "blank", name: "blank.docx", originalBase64: source.base64,
    sourceBase64: imported.normalizedBase64, document: importDocument(imported.blocks), warnings: [] });
  let paper = acceptOperations(blank, [{ kind: "fill_draft", selection: paperView(blank).blocks[0].selection,
    paragraphs: ["The Planner selects an action.", "执行者执行该操作。", "The result remains unverified."] }]);
  assertWordProjection(paper);
  const accepted = paper;
  paper = undoDecision(paper, paper.decisions[0].id, 1);
  assert.equal(engine({ action: "inspect", base64: assertWordProjection(paper).base64 }).hasRevisions, false);
  paper = restoreRevision(paper, 1, 2);
  assertWordProjection(paper);
  assertWordProjection(paper, 1);
  assertWordProjection(accepted, 0, 0);
});

test("split and merge preserve heading properties in both native projections, including nonzero baselines", () => {
  const source = initial(), first = paperView(source).blocks[0].selection;
  let paper = acceptOperations(source, [{ kind: "split", selection: { ...first, from: 12, to: 12, quote: "" } }]);
  assertWordProjection(paper);
  const split = paper;
  const blocks = paperView(paper).blocks;
  paper = acceptOperations(paper, [{ kind: "merge", selection: blocks[0].selection, next: blocks[1].selection, separator: " " }]);
  assertWordProjection(paper);
  assertWordProjection(paper, 1);
  assertWordProjection(paper, 0, 1);
  const originalBlocks = paperView(source).blocks;
  const merged = acceptOperations(source, [{ kind: "merge", selection: originalBlocks[0].selection, next: originalBlocks[1].selection, separator: " " }]);
  assertWordProjection(merged);
  const restored = restoreRevision(merged, 0, 1);
  assertWordProjection(restored);
  assertWordProjection(restored, 1);
  assertWordProjection(restoreRevision(restored, 1, 2), 0);
  assert.deepEqual(documentAt(split, 0).toJSON(), source.document);
});

test("complete custom paragraph and run formats survive replacements and structural projection", () => {
  const source = formattedSource("custom-format"), original = engine({ action: "inspect", base64: source.sourceBase64 });
  const paper = acceptRange(source, 0, 8, "Teacher");
  const exported = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...wordProjection(paper) });
  for (const revisionMode of ["accept", "reject"]) {
    const result = engine({ action: "inspect", base64: exported.base64, revisionMode });
    assert.equal(result.blocks[0].style, "CustomBody");
    assert.equal(result.blocks[0].paragraphFormat, original.blocks[0].paragraphFormat);
    assert.ok(result.blocks[0].runs.every((run: { nativeFormat: string }) => run.nativeFormat === original.blocks[0].runs[0].nativeFormat));
  }
  const block = paperView(source).blocks[0].selection;
  const split = acceptOperations(source, [{ kind: "split", selection: { ...block, from: 8, to: 8, quote: "" } }]);
  const output = engine({ action: "export", base64: split.sourceBase64, tracked: true, ...wordProjection(split) });
  const accepted = engine({ action: "inspect", base64: output.base64, revisionMode: "accept" });
  const rejected = engine({ action: "inspect", base64: output.base64, revisionMode: "reject" });
  assert.equal(accepted.blocks[0].paragraphFormat, original.blocks[0].paragraphFormat);
  assert.equal(accepted.blocks[1].paragraphFormat, original.blocks[0].paragraphFormat,
    "A new block identity retains its full custom paragraph format source; headings still use the explicit normal-paragraph rule.");
  assert.equal(rejected.blocks[0].paragraphFormat, original.blocks[0].paragraphFormat);
});

test("actual accepted reasons become native comments, with checked paragraph IDs and exact source feedback on reimport", () => {
  const source = initial(), paper = acceptWorker(source, "executor", false);
  const reasons = wordReasons(paper, 0);
  assert.equal(reasons.reasons.length, 1);
  assert.equal(reasons.reasons[0].text, paper.candidates[0].reason);
  assert.equal(reasons.reasons[0].selections[0].quote, "executor");
  const projected = wordComments(paper, 0, 1, true);
  assert.deepEqual(projected.warnings, []);
  const exported = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...wordProjection(paper), comments: projected.comments });
  assert.equal(exported.anchors.length, 4);
  assert.equal(new Set(exported.anchors.map((anchor: { nativeId: string }) => anchor.nativeId)).size, 4);
  assert.ok(exported.anchors.every((anchor: { nativeId: string }) => parseInt(anchor.nativeId, 16) > 0 && parseInt(anchor.nativeId, 16) < 0x80000000));
  const returned = engine({ action: "inspect", base64: exported.base64, revisionMode: "accept" });
  assert.equal(returned.nativeComments.length, 1);
  assert.equal(returned.nativeComments[0].text, paper.candidates[0].reason);
  assert.equal(returned.nativeComments[0].editable, true);
  assert.equal(returned.blocks[1].editable, true);
  const reimported = importWordComments(createPaper({ id: "returned", name: "returned.docx", originalBase64: exported.base64,
    sourceBase64: returned.normalizedBase64, document: importDocument(returned.blocks), warnings: returned.warnings }), returned.nativeComments);
  assert.equal(reimported.feedback[0].wordCommentId, returned.nativeComments[0].id);
  assert.equal(reimported.feedback[0].target.kind, "source");
  const reexported = engine({ action: "export", base64: reimported.sourceBase64, tracked: false,
    ...wordProjection(reimported), comments: wordComments(reimported, 0, 0, false).comments });
  assert.equal(engine({ action: "inspect", base64: reexported.base64 }).nativeComments[0].text, paper.candidates[0].reason);
  const undone = undoDecision(paper, paper.decisions[0].id, 1);
  assert.deepEqual(wordReasons(undone, 0).reasons, []);
});

test("original comments remain linked through accepted feedback and ambiguous native anchors stay read only", () => {
  const fixture = engine({ action: "fixture", fixture: "comments" });
  const imported = engine({ action: "inspect", base64: fixture.base64 });
  let paper = importWordComments(createPaper({ id: "commented", name: "commented.docx", originalBase64: fixture.base64,
    sourceBase64: imported.normalizedBase64, document: importDocument(imported.blocks), warnings: imported.warnings }), imported.nativeComments);
  assert.equal(paper.feedback.length, 1);
  const block = paperView(paper).blocks[0];
  const proposed = proposeGroup(paper, proposeRequest.parse({ action: "propose", requestId: "comment-change",
    operations: [{ kind: "replace", selection: block.selection, replacement: "Feedback supports local revision." }],
    reason: "Clarify the mechanism.", feedbackIds: [paper.feedback[0].id] }));
  paper = decide(proposed, proposed.candidates[0].id, "accepted");
  const output = engine({ action: "export", base64: paper.sourceBase64, tracked: true,
    ...wordProjection(paper), comments: wordComments(paper, 0, 1, true).comments });
  const accepted = engine({ action: "inspect", base64: output.base64, revisionMode: "accept" });
  assert.deepEqual(accepted.nativeComments.map((comment: { text: string }) => comment.text), ["Preserve the confirmed meaning.", "Clarify the mechanism."]);
  assert.ok(accepted.nativeComments.every((comment: { editable: boolean }) => comment.editable));
  const unlinked = { ...paper, candidates: paper.candidates.map(candidate => ({ ...candidate, feedbackIds: [] })) };
  assert.throws(() => wordComments(unlinked, 0, 1, false), /original Word comment overlaps/);
  const duplicate = engine({ action: "fixture", fixture: "duplicate-comment-anchors" });
  const refused = engine({ action: "inspect", base64: duplicate.base64 });
  assert.equal(refused.nativeComments[0].editable, false);
  assert.equal(refused.blocks[0].editable, false);
});

test("an unchanged original native comment retains its exact phrase through unrelated edits and both tracked projections", () => {
  const source = initial(), block = paperView(source).blocks[1], quote = "The model proposes a change.";
  const from = block.text.indexOf(quote), to = from + quote.length;
  const supplied = engine({ action: "export", base64: source.sourceBase64, tracked: false, ...wordProjection(source),
    comments: [{ blockIds: [block.id], selections: [{ blockId: block.id, from, to }], text: "Preserve this exact claim." }] });
  const inspected = engine({ action: "inspect", base64: supplied.base64 });
  let paper = importWordComments(createPaper({ id: "precise", name: "precise.docx", originalBase64: supplied.base64,
    sourceBase64: inspected.normalizedBase64, document: importDocument(inspected.blocks), warnings: inspected.warnings }), inspected.nativeComments);
  const selected = paperView(paper).blocks[1].selection;
  paper = acceptOperations(paper, [{ kind: "replace", selection: { ...selected, from: 4, to: 10, quote: "worker" }, replacement: "executor" }]);
  const comments = wordComments(paper, 0, paper.revision, false);
  assert.deepEqual(comments.warnings, []);
  const output = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...wordProjection(paper), comments: comments.comments });
  for (const revisionMode of ["accept", "reject"]) {
    const projected = engine({ action: "inspect", base64: output.base64, revisionMode });
    const comment = projected.nativeComments[0], range = comment.ranges[0];
    assert.equal(comment.text, "Preserve this exact claim.");
    assert.equal(comment.editable, true);
    assert.equal(projected.blocks[range.sourceIndex].text.slice(range.from, range.to), quote);
  }
});

test("unresolved revisions in preserved Word stories are refused instead of pretending that a body-only choice resolved them", () => {
  for (const variant of ["header-revision", "footnote-revision"]) {
    const original = engine({ action: "fixture", fixture: variant });
    for (const revisionMode of [undefined, "accept", "reject"]) {
      assert.throws(() => engine({ action: "inspect", base64: original.base64, revisionMode }), /outside the supported primary body/);
    }
  }
});

test("functional delivery markers survive accept and reject projection and are replaced by a later actual delivery", () => {
  const paper = acceptWorker(initial(), "executor", false);
  const first = engine({ action: "export", base64: paper.sourceBase64, tracked: true,
    ...wordProjection(paper), delivery: { id: "delivery-one", paperId: paper.id } });
  for (const revisionMode of ["accept", "reject"]) {
    const returned = engine({ action: "inspect", base64: first.base64, revisionMode });
    assert.deepEqual(returned.deliveryMarkers, [{ id: "delivery-one", paperId: paper.id }]);
  }
  const imported = engine({ action: "inspect", base64: first.base64, revisionMode: "accept" });
  const source = createPaper({ id: paper.id, name: "next.docx", originalBase64: first.base64,
    sourceBase64: imported.normalizedBase64, document: importDocument(imported.blocks), warnings: imported.warnings });
  const next = engine({ action: "export", base64: source.sourceBase64, tracked: false,
    ...wordProjection(source), delivery: { id: "delivery-two", paperId: source.id } });
  assert.deepEqual(engine({ action: "inspect", base64: next.base64 }).deliveryMarkers, [{ id: "delivery-two", paperId: paper.id }]);
  assert.equal(source.originalBase64, first.base64);
});

test("a bilingual DOCX inserts one current Chinese group after its complete English group without changing the primary body", () => {
  const created = engine({ action: "create", paragraphs: ["The Planner selects an action.", "The Worker executes the action."] });
  const imported = engine({ action: "inspect", base64: created.base64 });
  let paper = createPaper({ id: "bilingual", name: "bilingual.docx", originalBase64: created.base64,
    sourceBase64: imported.normalizedBase64, document: importDocument(imported.blocks), warnings: imported.warnings });
  const primary = paper.document;
  paper = requestTranslation(paper, { requestId: "translate", sources: paperView(paper).blocks.map(block => block.selection), replaces: [] }, "task");
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[0].id,
    groups: [{ sourceIndexes: [0, 1], text: "规划者选择操作，执行者执行该操作。" }] });
  const output = engine({ action: "export", base64: paper.sourceBase64, tracked: false,
    ...wordProjection(paper), bilingual: bilingualProjection(paper).groups });
  const result = engine({ action: "inspect", base64: output.base64 });
  assert.deepEqual(result.blocks.map((block: { text: string }) => block.text), ["The Planner selects an action.", "The Worker executes the action.", "规划者选择操作，执行者执行该操作。"]);
  assert.equal(result.hasRevisions, false);
  assert.equal(output.anchors.length, 2);
  assert.match(result.blocks[2].runs[0].nativeFormat, /Songti SC/);
  assert.deepEqual(paper.document, primary);
});

test("an exact selection changes the second repeated sentence and preserves other paragraphs and emphasis", () => {
  const paper = initial(),
    proposed = propose(paper, request(paper));
  assert.deepEqual(proposed.document, paper.document);
  const accepted = decide(proposed, proposed.candidates[0].id, "accepted");
  assert.equal(
    paperView(accepted).blocks[1].text,
    "The worker executes the operation. The model proposes a change. The executor runs the operation.",
  );
  assert.deepEqual(paperView(accepted).blocks[2], {
    ...paperView(paper).blocks[2],
    selection: { ...paperView(paper).blocks[2].selection, revision: 1 },
  });
  assert.deepEqual(accepted.baseline, paper.baseline);
});

test("proposal and decision retries are idempotent, and identities cannot be reused for different input", () => {
  let paper = initial();
  const r = request(paper);
  paper = propose(paper, r);
  assert.equal(propose(paper, r), paper);
  assert.throws(
    () => propose(paper, { ...r, replacement: "Other text." }),
    /different proposal/,
  );
  const accepted = decide(paper, paper.candidates[0].id, "accepted");
  assert.equal(decide(accepted, paper.candidates[0].id, "accepted"), accepted);
  assert.equal(accepted.decisions.length, 1);
});

test("mismatched and stale selections fail without changing accepted text", () => {
  const paper = initial(),
    r = request(paper);
  assert.throws(
    () =>
      propose(paper, { ...r, selection: { ...r.selection, from: 0, to: 4 } }),
    /does not match/,
  );
  const proposed = propose(paper, r);
  assert.throws(
    () =>
      decide(
        { ...proposed, revision: 1 },
        proposed.candidates[0].id,
        "accepted",
      ),
    /paper changed/,
  );
  assert.equal(paperView(proposed).blocks[1].text, imported.blocks[1].text);
});

test("rejecting a proposal records the decision and leaves the exact original document", () => {
  const paper = initial(),
    proposed = propose(paper, request(paper));
  const rejected = decide(proposed, proposed.candidates[0].id, "rejected");
  assert.deepEqual(rejected.document, paper.document);
  assert.equal(rejected.revision, 0);
  assert.equal(rejected.decisions[0].decision, "rejected");
});

test("a tracked DOCX still contains native revisions after workbench acceptance, with SDK schema validation", () => {
  const source = initial(),
    proposed = propose(source, request(source));
  const paper = decide(proposed, proposed.candidates[0].id, "accepted");
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow: wordProjection(paper).flow,
  });
  assert.equal(
    engine({ action: "inspect", base64: exported.base64 }).hasRevisions,
    true,
  );
  const accepted = engine({
    action: "inspect",
    base64: exported.base64,
    revisionMode: "accept",
  });
  const rejected = engine({
    action: "inspect",
    base64: exported.base64,
    revisionMode: "reject",
  });
  assert.equal(accepted.blocks[1].text, paperView(paper).blocks[1].text);
  assert.equal(rejected.blocks[1].text, paperView(source).blocks[1].text);
  assert.equal(accepted.blocks[2].runs[0].bold, true);
  assert.match(exported.validation, /passed/);
});

test("clean DOCX exports the accepted body without native revisions", () => {
  const source = initial(),
    proposed = propose(source, request(source));
  const paper = decide(proposed, proposed.candidates[0].id, "accepted");
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: false,
    flow: wordProjection(paper).flow,
  });
  const clean = engine({ action: "inspect", base64: exported.base64 });
  assert.equal(clean.hasRevisions, false);
  assert.equal(clean.blocks[1].text, paperView(paper).blocks[1].text);
});

test("mixed-format replacements preserve unchanged emphasis and inherit the removed text style at boundaries", () => {
  const source = initial(),
    block = paperView(source).blocks[3];
  const proposed = propose(source, {
    action: "propose",
    requestId: "formatted",
    selection: block.selection,
    replacement: "A planner proposes a change.",
    reason: "Check exact style inheritance.",
  });
  const paper = decide(proposed, proposed.candidates[0].id, "accepted");
  const runs = paperView(paper).blocks[3].runs;
  assert.equal(
    runs.map((r) => r.text).join(""),
    "A planner proposes a change.",
  );
  const styled = runs.flatMap((r) =>
    [...r.text].map((char) => ({ char, bold: r.marks.includes("bold") })),
  );
  assert.equal(
    styled
      .filter((c) => c.bold)
      .map((c) => c.char)
      .join(""),
    "planner",
  );
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: false,
    flow: wordProjection(paper).flow,
  });
  const formatted = engine({ action: "inspect", base64: exported.base64 });
  assert.equal(
    formatted.blocks[3].runs
      .filter((r: { bold: boolean }) => r.bold)
      .map((r: { text: string }) => r.text)
      .join(""),
    "planner",
  );
});

function formattedSource(variant = "repeated-format"): Paper {
  const fixture = engine({ action: "fixture", fixture: variant });
  const imported = engine({ action: "inspect", base64: fixture.base64 });
  const document = importDocument(imported.blocks);
  return createPaper({
    id: "repeated",
    name: "repeated.docx",
    document,
    sourceBase64: imported.normalizedBase64,
    originalBase64: fixture.base64,
    warnings: imported.warnings,
  });
}

function normalColorFlow(base64: string) {
  const source = engine({ action: "inspect", base64 });
  const paper = createPaper({ id: "color", name: "color.docx", document: importDocument(source.blocks),
    originalBase64: base64, sourceBase64: source.normalizedBase64, warnings: source.warnings });
  return wordProjection(paper).flow.flatMap((event, index) => index === 0 && event.kind === "text"
    ? [{ ...event, change: "delete" as const }, { ...event, change: "insert" as const, styleFrom: { sourceIndex: 0, offset: 2 } }]
    : [event]);
}

function acceptRange(
  paper: Paper,
  from: number,
  to: number,
  replacement: string,
): Paper {
  const block = paperView(paper).blocks[0];
  const proposed = propose(paper, {
    action: "propose",
    requestId: `edit-${paper.revision}`,
    selection: {
      ...block.selection,
      from,
      to,
      quote: block.text.slice(from, to),
    },
    replacement,
    reason: "Check exact edit provenance.",
  });
  return decide(proposed, proposed.candidates.at(-1)!.id, "accepted");
}

test("deleting the first formatted duplicate preserves the second source run and exact native deletion range", () => {
  const source = formattedSource(),
    paper = acceptRange(source, 0, 2, "");
  assert.deepEqual(paperView(paper).blocks[0].runs, [{ text: "X", marks: [] }]);
  const flow = wordProjection(paper).flow;
  assert.deepEqual(flow.slice(0, 2), [
    { kind: "text", change: "delete", text: "X ", styleFrom: { sourceIndex: 0, offset: 0 } },
    { kind: "text", change: "equal", text: "X", styleFrom: { sourceIndex: 0, offset: 2 } },
  ]);
  for (const tracked of [false, true]) {
    const exported = engine({
      action: "export",
      base64: paper.sourceBase64,
      tracked,
      flow,
    });
    const final = engine({
      action: "inspect",
      base64: exported.base64,
      ...(tracked ? { revisionMode: "accept" } : {}),
    });
    assert.equal(final.blocks[0].text, "X");
    assert.equal(
      final.blocks[0].runs.some((r: { bold: boolean }) => r.bold),
      false,
    );
    if (tracked) {
      const rejected = engine({
        action: "inspect",
        base64: exported.base64,
        revisionMode: "reject",
      });
      assert.equal(rejected.blocks[0].text, "X X");
      assert.deepEqual(
        styledCharacters(rejected.blocks[0].runs),
        styledCharacters(importedRuns(source)),
      );
    }
  }
});

function importedRuns(paper: Paper) {
  return engine({ action: "inspect", base64: paper.sourceBase64 }).blocks[0]
    .runs;
}
function styledCharacters(
  runs: { text: string; bold: boolean; italic: boolean }[],
) {
  return runs.flatMap((run) =>
    [...run.text].map((text) => ({ text, bold: run.bold, italic: run.italic })),
  );
}

test("first-duplicate replacement and later edits retain their actual run styles across clean and tracked exports", () => {
  const source = formattedSource();
  let paper = acceptRange(source, 0, 1, "Z");
  paper = acceptRange(paper, 2, 3, "Y");
  paper = acceptRange(paper, 0, 1, "Q");
  for (const tracked of [false, true]) {
    const exported = engine({
      action: "export",
      base64: paper.sourceBase64,
      tracked,
      flow: wordProjection(paper).flow,
    });
    const final = engine({
      action: "inspect",
      base64: exported.base64,
      ...(tracked ? { revisionMode: "accept" } : {}),
    });
    assert.equal(final.blocks[0].text, "Q Y");
    assert.equal(
      final.blocks[0].runs
        .filter((r: { bold: boolean }) => r.bold)
        .map((r: { text: string }) => r.text)
        .join(""),
      "Q ",
    );
    if (tracked)
      assert.deepEqual(
        styledCharacters(
          engine({
            action: "inspect",
            base64: exported.base64,
            revisionMode: "reject",
          }).blocks[0].runs,
        ),
        styledCharacters(importedRuns(source)),
      );
  }
});

test("same final text with a different surviving style still exports the actual delete and insertion", () => {
  const source = formattedSource();
  let paper = acceptRange(source, 0, 2, "");
  paper = acceptRange(paper, 0, 0, "X ");
  assert.equal(
    paperView(paper).blocks[0].text,
    paperView(source).blocks[0].text,
  );
  assert.equal(
    paperView(paper).blocks[0].runs.some((r) => r.marks.includes("bold")),
    false,
  );
  for (const tracked of [false, true]) {
    const exported = engine({
      action: "export",
      base64: paper.sourceBase64,
      tracked,
      flow: wordProjection(paper).flow,
    });
    const final = engine({
      action: "inspect",
      base64: exported.base64,
      ...(tracked ? { revisionMode: "accept" } : {}),
    });
    assert.equal(final.blocks[0].text, "X X");
    assert.equal(
      final.blocks[0].runs.some((r: { bold: boolean }) => r.bold),
      false,
    );
    if (tracked)
      assert.deepEqual(
        styledCharacters(
          engine({
            action: "inspect",
            base64: exported.base64,
            revisionMode: "reject",
          }).blocks[0].runs,
        ),
        styledCharacters(importedRuns(source)),
      );
  }
});

test("restoring the exact baseline text and marks leaves the original paragraph untouched on export", () => {
  const source = formattedSource();
  let paper = acceptRange(source, 0, 1, "Z");
  paper = acceptRange(paper, 0, 1, "X");
  assert.deepEqual(paper.document, source.document);
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow: wordProjection(paper).flow,
  });
  const final = engine({ action: "inspect", base64: exported.base64 });
  assert.equal(final.hasRevisions, false);
  assert.deepEqual(
    styledCharacters(final.blocks[0].runs),
    styledCharacters(importedRuns(source)),
  );
  assert.equal(paper.decisions.length, 2);
});

test("native color changes are preserved when text and displayed marks match the baseline", () => {
  const source = formattedSource("repeated-color");
  let paper = acceptRange(source, 0, 2, "");
  paper = acceptRange(paper, 0, 0, "X ");
  assert.deepEqual(
    paperView(paper)
      .blocks[0].runs.map((r) => ({ text: r.text, marks: r.marks }))
      .flatMap((r) => [...r.text].map((text) => ({ text, marks: r.marks }))),
    paperView(source).blocks[0].runs.flatMap((r) =>
      [...r.text].map((text) => ({ text, marks: r.marks })),
    ),
    "The displayed marks do not encode native color.",
  );
  const tracked = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow: wordProjection(paper).flow,
  });
  assert.equal(
    engine({ action: "inspect", base64: tracked.base64 }).hasRevisions,
    true,
    "The native color change must not be skipped.",
  );
  for (const revisionMode of ["accept", "reject"]) {
    const settled = engine({
      action: "inspect",
      base64: tracked.base64,
      revisionMode,
    });
    assert.equal(settled.blocks[0].text, "X X");
    const recolored = engine({
      action: "export",
      base64: settled.normalizedBase64,
      tracked: true,
      flow: normalColorFlow(settled.normalizedBase64),
    });
    assert.equal(
      engine({ action: "inspect", base64: recolored.base64 }).hasRevisions,
      revisionMode === "reject",
      "Accepted runs already use the default color; rejected runs retain the original red color.",
    );
  }
  const clean = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: false,
    flow: wordProjection(paper).flow,
  });
  const unchanged = engine({
    action: "export",
    base64: clean.base64,
    tracked: true,
    flow: normalColorFlow(clean.base64),
  });
  assert.equal(
    engine({ action: "inspect", base64: unchanged.base64 }).hasRevisions,
    false,
    "The clean output already has the intended native color.",
  );
});

test("typing after clearing a paragraph uses its default style rather than a deleted run style", () => {
  const source = formattedSource();
  let paper = acceptRange(source, 0, 3, "");
  paper = acceptRange(paper, 0, 0, "Fresh");
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow: wordProjection(paper).flow,
  });
  const final = engine({
    action: "inspect",
    base64: exported.base64,
    revisionMode: "accept",
  });
  assert.equal(final.blocks[0].text, "Fresh");
  assert.equal(
    final.blocks[0].runs.some((r: { bold: boolean }) => r.bold),
    false,
  );
  assert.deepEqual(
    styledCharacters(
      engine({
        action: "inspect",
        base64: exported.base64,
        revisionMode: "reject",
      }).blocks[0].runs,
    ),
    styledCharacters(importedRuns(source)),
  );
});

test("edits inside an earlier insertion and across its source boundary retain the correct style", () => {
  const source = formattedSource();
  let paper = acceptRange(source, 0, 1, "Long");
  paper = acceptRange(paper, 1, 3, "oo");
  paper = acceptRange(paper, 2, 6, "text");
  assert.equal(paperView(paper).blocks[0].text, "Lotext");
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow: wordProjection(paper).flow,
  });
  const final = engine({
    action: "inspect",
    base64: exported.base64,
    revisionMode: "accept",
  });
  assert.equal(final.blocks[0].text, "Lotext");
  assert.equal(
    final.blocks[0].runs.every((r: { bold: boolean }) => r.bold),
    true,
  );
  assert.deepEqual(
    styledCharacters(
      engine({
        action: "inspect",
        base64: exported.base64,
        revisionMode: "reject",
      }).blocks[0].runs,
    ),
    styledCharacters(importedRuns(source)),
  );
});

test("paragraph-mark revisions require an explicit projection and preserve their join semantics", () => {
  const fixture = engine({ action: "fixture", fixture: "paragraph-mark" });
  assert.equal(engine({ action: "inspect", base64: fixture.base64 }).hasRevisions, true);
  const accepted = engine({ action: "inspect", base64: fixture.base64, revisionMode: "accept" });
  const rejected = engine({ action: "inspect", base64: fixture.base64, revisionMode: "reject" });
  assert.equal(accepted.blocks.length, 4);
  assert.equal(rejected.blocks.length, 3);
  assert.equal(rejected.blocks[0].text, accepted.blocks[0].text + accepted.blocks[1].text);
  assert.equal(engine({ action: "inspect", base64: accepted.normalizedBase64 }).hasRevisions, false);
});

test("journal undo and restore export the complete original native style with no false revisions", () => {
  const source = formattedSource("repeated-color");
  let paper = acceptRange(source, 0, 2, "");
  const decision = paper.decisions.at(-1)!.id;
  paper = undoDecision(paper, decision, paper.revision);
  assert.deepEqual(paper.document, source.document);
  for (const restored of [
    paper,
    restoreRevision(acceptRange(source, 0, 3, "Changed"), 0, 1),
  ]) {
    const exported = engine({
      action: "export",
      base64: restored.sourceBase64,
      tracked: true,
      flow: wordProjection(restored).flow,
    });
    assert.equal(
      engine({ action: "inspect", base64: exported.base64 }).hasRevisions,
      false,
    );
    const recolored = engine({
      action: "export",
      base64: exported.base64,
      tracked: true,
      flow: normalColorFlow(exported.base64),
    });
    assert.equal(
      engine({ action: "inspect", base64: recolored.base64 }).hasRevisions,
      true,
      "The restored first run is red, so normalizing it to the default style must be a change.",
    );
  }
});

function acceptWorker(paper: Paper, replacement: string, last: boolean) {
  const block = paperView(paper).blocks[1],
    from = last
      ? block.text.lastIndexOf("worker")
      : block.text.indexOf("worker");
  const candidate = propose(paper, {
    action: "propose",
    requestId: `worker-${paper.revision}`,
    selection: { ...block.selection, from, to: from + 6, quote: "worker" },
    replacement,
    reason: "Change only this executing party.",
  });
  return decide(candidate, candidate.candidates.at(-1)!.id, "accepted");
}
test("undoing the first same-paragraph edit exports only the surviving last edit as native revisions", () => {
  const source = initial();
  let paper = acceptWorker(source, "executor", false);
  const first = paper.decisions[0].id;
  paper = acceptWorker(paper, "operator", true);
  paper = undoDecision(paper, first, 2);
  const flow = wordProjection(paper).flow;
  assert.deepEqual(
    flow.filter(event => event.kind !== "opaque" && event.change !== "equal"),
    [
      { kind: "text", change: "delete", text: "worker", styleFrom: { sourceIndex: 1, offset: 0 } },
      { kind: "text", change: "insert", text: "operator", styleFrom: { sourceIndex: 1, offset: 0 } },
    ],
  );
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow,
  });
  assert.equal(
    engine({
      action: "inspect",
      base64: exported.base64,
      revisionMode: "accept",
    }).blocks[1].text,
    paperView(paper).blocks[1].text,
  );
  assert.equal(
    engine({
      action: "inspect",
      base64: exported.base64,
      revisionMode: "reject",
    }).blocks[1].text,
    paperView(source).blocks[1].text,
  );
  const retained = {
    ...paper,
    history: paper.history.map(({ inverseOf, ...entry }) => entry),
  };
  assert.deepEqual(
    wordProjection(retained).flow,
    flow,
    "Earlier installed undo records use their explicit undoOf decision relation.",
  );
});

test("restoring an accepted revision preserves its original local Word range across undo and later restores", () => {
  const source = initial(),
    accepted = acceptWorker(source, "executor", false);
  const expected = wordProjection(accepted).flow.filter(event => event.kind !== "opaque" && event.change !== "equal");
  let paper = undoDecision(accepted, accepted.decisions[0].id, 1);
  paper = restoreRevision(paper, 1, 2);
  assert.deepEqual(paper.document, accepted.document);
  assert.deepEqual(
    wordProjection(paper).flow.filter(event => event.kind !== "opaque" && event.change !== "equal"),
    expected,
  );
  paper = restoreRevision(paper, 0, 3);
  paper = restoreRevision(paper, 1, 4);
  const flow = wordProjection(paper).flow;
  assert.deepEqual(
    flow.filter(event => event.kind !== "opaque" && event.change !== "equal"),
    expected,
  );
  const exported = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    flow,
  });
  assert.equal(
    engine({
      action: "inspect",
      base64: exported.base64,
      revisionMode: "accept",
    }).blocks[1].text,
    paperView(accepted).blocks[1].text,
  );
  assert.equal(
    engine({
      action: "inspect",
      base64: exported.base64,
      revisionMode: "reject",
    }).blocks[1].text,
    paperView(source).blocks[1].text,
  );
});
