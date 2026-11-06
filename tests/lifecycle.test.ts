import { test } from "node:test";
import assert from "node:assert/strict";
import { Node as PMNode } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import {
  proposeRequest,
  type Operation,
  type Selection,
} from "../src/contracts.js";
import { paperSchema, legacyPaperSchema } from "../src/records.js";
import {
  schema,
  importDocument,
  createPaper,
  paperView,
  projectCandidates,
  documentAt,
  mapSelection,
  propose,
  decide,
  decideMany,
  previewAcceptance,
  undoDecision,
  restoreRevision,
  compareRevision,
  requestTranslation,
  completeTranslation,
  cancelTranslation,
  correctTranslation,
  addFeedback,
  createBatch,
  migratePaper,
  exportParagraphs,
  deliveryPrompt,
  markDelivery,
  type Paper,
} from "../src/model.js";

function initial(texts = ["X X alpha beta.", "Keep the confirmed sentence."]) {
  const blocks = texts.map((text, sourceIndex) => ({
    sourceIndex,
    text,
    editable: true,
    style: null,
    runs: [
      { text: text.slice(0, 2), bold: true, italic: false },
      { text: text.slice(2), bold: false, italic: false },
    ],
    reason: null,
  }));
  return {
    blocks,
    paper: createPaper({
      id: "paper",
      name: "synthetic.docx",
      document: importDocument(blocks),
      originalBase64: "",
      sourceBase64: "",
      warnings: [],
    }),
  };
}
function selection(
  paper: Paper,
  block = 0,
  from?: number,
  to?: number,
): Selection {
  const source = paperView(paper).blocks[block].selection;
  return from === undefined
    ? source
    : { ...source, from, to: to!, quote: source.quote.slice(from, to) };
}
function proposal(paper: Paper, operations: Operation[], extra: object = {}) {
  return propose(
    paper,
    proposeRequest.parse({
      action: "propose",
      requestId: `request-${paper.candidates.length}`,
      reason: "Synthetic test change.",
      operations,
      ...extra,
    }),
  );
}
function replace(paper: Paper, source: Selection, replacement: string) {
  return proposal(paper, [{ kind: "replace", selection: source, replacement }]);
}
function acceptLast(paper: Paper) {
  return decide(paper, paper.candidates.at(-1)!.id, "accepted");
}
const text = (paper: Paper, block = 0) => paperView(paper).blocks[block].text;

test("a multi-paragraph first draft stays one pending group, then persists actual paragraph identities and scoped Chinese through decisions and restoration", () => {
  let { paper } = initial([""]);
  const empty = paper.document, firstId = selection(paper).blockId;
  const paragraphs = ["The Planner selects an action.", "The Worker executes that action.", "The result remains unverified."];
  paper = proposal(paper, [{ kind: "fill_draft", selection: selection(paper), paragraphs }], {
    translations: [
      { operationIndexes: [0], paragraphIndexes: [0], text: "规划者选择操作。" },
      { operationIndexes: [0], paragraphIndexes: [1, 2], text: "执行者执行该操作。结果仍未经验证。" },
    ],
  });
  assert.deepEqual(paper.document, empty);
  assert.equal(paper.revision, 0);
  assert.equal(paper.candidates[0].status, "pending");
  assert.deepEqual(paper.candidates[0].diffs[0], [{ kind: "insert", text: paragraphs.join("\n") }]);
  const projected = projectCandidates(paper, "all");
  assert.deepEqual(PMNode.fromJSON(schema, projected.document).content.content.map(node => node.textContent), paragraphs);
  assert.deepEqual(projected.translations.map(translation => translation.mappedSources.map(source => source.quote)), [[paragraphs[0]], paragraphs.slice(1)]);
  paper = paperSchema.parse(JSON.parse(JSON.stringify(paper)));
  assert.deepEqual(previewAcceptance(paper, "all").conflicts, []);
  paper = acceptLast(paper);
  const accepted = paper, ids = paperView(paper).blocks.map(block => block.id), decisionId = paper.decisions[0].id;
  assert.equal(ids[0], firstId);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(paperView(paper).blocks.map(block => block.text), paragraphs);
  assert.deepEqual(paperView(paper).translations.map(translation => translation.mappedSources.map(source => source.blockId)), [[ids[0]], ids.slice(1)]);
  paper = paperSchema.parse(JSON.parse(JSON.stringify(paper)));
  assert.deepEqual([...documentAt(paper, 1).content.content].map(node => node.attrs.id), ids);
  assert.throws(() => exportParagraphs(paper), /splits and merges/);
  paper = restoreRevision(paper, 0, 1);
  assert.deepEqual(paper.document, empty);
  assert.ok(paperView(paper).translations.every(translation => translation.state === "stale"));
  paper = restoreRevision(paper, 1, 2);
  assert.deepEqual(paperView(paper).blocks.map(block => block.id), ids);
  assert.deepEqual(paper.translations, accepted.translations, "Body restoration does not rewrite the retained Chinese input.");
  assert.ok(paperView(paper).translations.every(translation => translation.state === "stale"), "The existing exact-range protection requires explicit translation renewal after intervening source changes, even when text is restored.");
  paper = requestTranslation(paper, { requestId: "restored-zh", sources: paperView(paper).blocks.map(block => block.selection), replaces: paper.translations.map(translation => translation.id) }, "task");
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[0].id, groups: [{ sourceIndexes: [0], text: "规划者选择操作。" }, { sourceIndexes: [1, 2], text: "执行者执行该操作。结果仍未经验证。" }] });
  assert.deepEqual(paperView(paper).translations.filter(translation => translation.state === "current").map(translation => translation.mappedSources.map(source => source.blockId)), [[ids[0]], ids.slice(1)]);
  paper = undoDecision(accepted, decisionId, 1);
  assert.deepEqual(paper.document, empty);
  assert.ok(paperView(paper).translations.every(translation => translation.state === "superseded"));
  assert.equal(paper.candidates[0].status, "undone");
});

test("fill_draft bounds and Chinese scopes preserve existing exact selections and conflicts", () => {
  let { paper } = initial([""]);
  const fill: Operation = { kind: "fill_draft", selection: selection(paper), paragraphs: ["First.", "Second."] };
  const command = { action: "propose", requestId: "draft", operations: [fill], reason: "Write the supplied mechanism." };
  for (const paragraphs of [["One only."], ["First.\nSecond.", "Third."], [" ", "Second."], Array.from({ length: 101 }, () => "Paragraph.")])
    assert.equal(proposeRequest.safeParse({ ...command, operations: [{ ...fill, paragraphs }] }).success, false);
  assert.equal(proposeRequest.safeParse({ ...command, operations: [{ ...fill, paragraphs: Array.from({ length: 41 }, () => "x".repeat(100000)) }] }).success, false);
  assert.throws(() => proposal(paper, [fill], { translations: [{ operationIndexes: [0], paragraphIndexes: [2], text: "不存在的段落" }] }), /real paragraphs/);
  assert.throws(() => proposal(paper, [fill], { translations: [{ operationIndexes: [0], paragraphIndexes: [0, 0], text: "重复范围" }] }), /real paragraphs/);
  const whole = proposal(paper, [fill], { translations: [{ operationIndexes: [0], text: "第一段。第二段。" }] });
  assert.deepEqual(projectCandidates(whole, "all").translations[0].mappedSources.map(source => source.quote), fill.paragraphs);
  const existing = initial(["Confirmed text."]).paper;
  assert.throws(() => proposal(existing, [{ ...fill, selection: selection(existing) }]), /single empty paragraph/);
  const multiple = initial(["", ""]).paper;
  assert.throws(() => proposal(multiple, [{ ...fill, selection: selection(multiple) }]), /single empty paragraph/);
  paper = proposal(paper, [fill]);
  paper = replace(paper, selection(paper), "An independent pending edit.");
  assert.equal(previewAcceptance(paper, "all").conflicts.length, 1);
  const unchanged = paper.document;
  assert.throws(() => decideMany(paper, paper.candidates.map(candidate => candidate.id), "accepted", 0), /overlaps/);
  assert.deepEqual(paper.document, unchanged);
  paper = decide(paper, paper.candidates[1].id, "accepted");
  assert.throws(() => decide(paper, paper.candidates[0].id, "accepted"), /overlaps/);
});

test("unrelated changes map an exact repeated range without replacing the first occurrence", () => {
  let { paper } = initial();
  const second = selection(paper, 0, 2, 3),
    first = selection(paper, 0, 0, 1);
  paper = replace(paper, second, "second");
  const secondId = paper.candidates.at(-1)!.id;
  paper = replace(paper, first, "first");
  paper = acceptLast(paper);
  assert.equal(mapSelection(paper, second).from, 6);
  paper = decide(paper, secondId, "accepted");
  assert.equal(text(paper), "first second alpha beta.");
  assert.equal(paper.revision, 2);
});

test("all-preview exposes conflicts and dependencies; each actual scope commits atomically", () => {
  let { paper } = initial();
  paper = replace(paper, selection(paper, 0, 0, 1), "first");
  const first = paper.candidates.at(-1)!.id;
  paper = replace(paper, selection(paper, 0, 0, 1), "conflicting");
  const conflicting = paper.candidates.at(-1)!.id;
  paper = proposal(
    paper,
    [
      {
        kind: "replace",
        selection: selection(paper, 1),
        replacement: "The confirmed sentence remains.",
      },
    ],
    { dependsOn: [first] },
  );
  const dependent = paper.candidates.at(-1)!.id;
  const scope = previewAcceptance(paper, [dependent]);
  assert.deepEqual(scope.candidateIds, [first, dependent]);
  assert.deepEqual(scope.includedDependencies, [first]);
  assert.throws(
    () => decideMany(paper, [first, conflicting], "accepted", 0),
    /overlaps/,
  );
  assert.equal(paper.revision, 0);
  assert.equal(text(paper), "X X alpha beta.");
  const all = previewAcceptance(paper, "all");
  assert.deepEqual(all.candidateIds, [first, dependent]);
  assert.equal(all.conflicts[0].candidateId, conflicting);
  paper = decideMany(paper, all.candidateIds, "accepted", all.revision);
  assert.equal(paper.revision, 1);
  assert.equal(paper.history.length, 1);
  assert.equal(
    paper.candidates.find((c) => c.id === conflicting)!.status,
    "pending",
  );
  assert.equal(paper.decisions.at(-1)!.candidateIds.length, 2);
  paper = undoDecision(paper, paper.decisions.at(-1)!.id, 1);
  assert.equal(text(paper), "X X alpha beta.");
  assert.equal(text(paper, 1), "Keep the confirmed sentence.");
});

test("partial acceptance rebases dependencies and prevents undoing an accepted prerequisite first", () => {
  let { paper } = initial();
  paper = replace(paper, selection(paper, 0, 0, 1), "first");
  const first = paper.candidates.at(-1)!.id;
  paper = proposal(
    paper,
    [
      {
        kind: "replace",
        selection: selection(paper, 1, 0, 4),
        replacement: "Retain",
      },
    ],
    { dependsOn: [first] },
  );
  const dependent = paper.candidates.at(-1)!.id;
  paper = decide(paper, first, "accepted");
  const firstDecision = paper.decisions.at(-1)!.id;
  paper = decide(paper, dependent, "accepted");
  const dependentDecision = paper.decisions.at(-1)!.id;
  assert.throws(() => undoDecision(paper, firstDecision, 2), /dependent/);
  paper = undoDecision(paper, dependentDecision, 2);
  paper = undoDecision(paper, firstDecision, 3);
  assert.equal(text(paper), "X X alpha beta.");
  assert.equal(paper.revision, 4);
});

test("a semantic group maps several source operations in the same paragraph and computes the real diff", () => {
  let { paper } = initial();
  paper = proposal(paper, [
    {
      kind: "replace",
      selection: selection(paper, 0, 0, 1),
      replacement: "longer",
    },
    {
      kind: "replace",
      selection: selection(paper, 0, 10, 14),
      replacement: "gamma",
    },
  ]);
  assert.deepEqual(paper.candidates[0].diffs[1], [
    { kind: "delete", text: "beta" },
    { kind: "insert", text: "gamma" },
  ]);
  paper = acceptLast(paper);
  assert.equal(text(paper), "longer X alpha gamma.");
  assert.equal(paper.history[0].steps.length, 4);
});

test("split persists the actual paragraph identity in steps, maps a pending range, and survives reload/undo/restore", () => {
  let { paper } = initial();
  const original = paper.document;
  const beta = selection(paper, 0, 10, 14);
  paper = replace(paper, beta, "gamma");
  const edit = paper.candidates.at(-1)!.id;
  paper = proposal(paper, [
    { kind: "split", selection: selection(paper, 0, 4, 4) },
  ]);
  paper = acceptLast(paper);
  const splitDecision = paper.decisions.at(-1)!.id,
    newId = paperView(paper).blocks[1].id;
  assert.notEqual(newId, paperView(paper).blocks[0].id);
  assert.equal(mapSelection(paper, beta).blockId, newId);
  assert.equal(
    documentAt(paperSchema.parse(JSON.parse(JSON.stringify(paper))), 1).child(1)
      .attrs.id,
    newId,
  );
  assert.throws(() => exportParagraphs(paper), /splits and merges/);
  paper = decide(paper, edit, "accepted");
  assert.equal(text(paper, 1), "alpha gamma.");
  paper = undoDecision(paper, paper.decisions.at(-1)!.id, 2);
  paper = undoDecision(paper, splitDecision, 3);
  assert.deepEqual(paper.document, original);
  paper = restoreRevision(paper, 1, 4);
  assert.equal(paperView(paper).blocks[1].id, newId);
});

test("merge retains the first persistent block and maps source feedback from the second", () => {
  let { paper } = initial(["First.", "Second."]);
  const firstId = selection(paper).blockId,
    second = selection(paper, 1);
  paper = addFeedback(paper, {
    requestId: "feedback",
    target: { kind: "source", selections: [second] },
    comment: "Keep this sentence.",
  });
  paper = proposal(paper, [
    {
      kind: "merge",
      selection: selection(paper),
      next: second,
      separator: " ",
    },
  ]);
  paper = acceptLast(paper);
  assert.equal(paperView(paper).blocks[0].id, firstId);
  assert.equal(text(paper), "First. Second.");
  assert.equal(paperView(paper).feedback[0].sources[0].blockId, firstId);
  assert.equal(paperView(paper).feedback[0].sources[0].from, 7);
  paper = undoDecision(paper, paper.decisions.at(-1)!.id, 1);
  assert.equal(paperView(paper).blocks[1].id, second.blockId);
});

test("undo preserves later unrelated edits and exact original marks; overlapping undo fails", () => {
  let { paper } = initial();
  const baseline = PMNode.fromJSON(schema, paper.baseline);
  paper = acceptLast(replace(paper, selection(paper, 0, 0, 1), "bold"));
  const undo = paper.decisions.at(-1)!.id;
  paper = acceptLast(
    replace(paper, selection(paper, 1), "Later unrelated edit."),
  );
  paper = undoDecision(paper, undo, 2);
  assert.ok(
    PMNode.fromJSON(schema, paper.document).child(0).eq(baseline.child(0)),
  );
  assert.equal(text(paper, 1), "Later unrelated edit.");
  paper = acceptLast(replace(paper, selection(paper, 0, 0, 1), "replacement"));
  const blocked = paper.decisions.at(-1)!.id;
  paper = acceptLast(replace(paper, selection(paper, 0, 0, 11), "overlap"));
  assert.throws(() => undoDecision(paper, blocked, paper.revision), /overlaps/);
});

test("reject undo reopens the candidate, and restoring a compared revision appends history", () => {
  let { paper } = initial();
  paper = replace(paper, selection(paper), "New text.");
  paper = decide(paper, paper.candidates[0].id, "rejected");
  assert.equal(paper.revision, 0);
  paper = undoDecision(paper, paper.decisions[0].id, 0);
  assert.equal(paper.candidates[0].status, "pending");
  paper = acceptLast(paper);
  const accepted = paper.document;
  assert.equal(compareRevision(paper, 0).blocks.length, 1);
  paper = restoreRevision(paper, 0, 1);
  assert.deepEqual(paper.document, paper.baseline);
  assert.equal(paper.candidates[0].status, "accepted");
  assert.equal(paper.history.at(-1)!.kind, "restore");
  paper = restoreRevision(paper, 1, 2);
  assert.deepEqual(paper.document, accepted);
});

function translated() {
  let { paper } = initial();
  paper = requestTranslation(
    paper,
    {
      requestId: "translation",
      sources: [selection(paper), selection(paper, 1)],
      replaces: [],
    },
    "task",
  );
  paper = completeTranslation(paper, {
    action: "complete_translation",
    jobId: paper.translationJobs[0].id,
    groups: [
      { sourceIndexes: [0, 1], text: "两段合为一句。" },
      { sourceIndexes: [1], text: "第二段的另一种表达。" },
    ],
  });
  return paper;
}
test("many-to-many Chinese groups remain a projection, and correction changes only that translation version", () => {
  let paper = translated();
  const body = paper.document,
    translation = paper.translations[0];
  const target = {
    translationId: translation.id,
    version: 1,
    from: 0,
    to: 2,
    quote: "两段",
  };
  paper = correctTranslation(paper, target, "两个原文段落");
  assert.deepEqual(paper.document, body);
  assert.equal(paper.revision, 0);
  assert.equal(paper.translations[0].version, 2);
  assert.throws(() => correctTranslation(paper, target, "迟到纠正"), /changed/);
  assert.equal(paper.translations[0].corrections[0].before, translation.text);
});

test("late translation, superseded work and cancelled work cannot overwrite current or corrected projections", () => {
  let paper = translated(),
    id = paper.translations[0].id;
  paper = requestTranslation(
    paper,
    {
      requestId: "refresh",
      sources: [selection(paper), selection(paper, 1)],
      replaces: [id],
    },
    "task",
  );
  const job = paper.translationJobs.at(-1)!.id;
  paper = correctTranslation(
    paper,
    { translationId: id, version: 1, from: 0, to: 2, quote: "两段" },
    "纠正",
  );
  paper = completeTranslation(paper, {
    action: "complete_translation",
    jobId: job,
    groups: [{ sourceIndexes: [0, 1], text: "旧结果。" }],
  });
  assert.equal(paper.translationJobs.at(-1)!.status, "stale");
  assert.equal(paper.translations[0].text, "纠正合为一句。");
  paper = requestTranslation(
    paper,
    { requestId: "before-edit", sources: [selection(paper)], replaces: [] },
    "task",
  );
  const late = paper.translationJobs.at(-1)!.id;
  paper = acceptLast(
    replace(paper, selection(paper, 1), "Unrelated source change."),
  );
  paper = completeTranslation(paper, {
    action: "complete_translation",
    jobId: late,
    groups: [{ sourceIndexes: [0], text: "迟到结果。" }],
  });
  assert.equal(paper.translationJobs.at(-1)!.status, "stale");
  paper = requestTranslation(
    paper,
    { requestId: "old", sources: [selection(paper)], replaces: [] },
    "task",
  );
  const superseded = paper.translationJobs.at(-1)!.id;
  paper = requestTranslation(
    paper,
    { requestId: "new", sources: [selection(paper)], replaces: [] },
    "task",
  );
  assert.throws(
    () =>
      completeTranslation(paper, {
        action: "complete_translation",
        jobId: superseded,
        groups: [{ sourceIndexes: [0], text: "旧的。" }],
      }),
    /superseded/,
  );
  const cancelled = paper.translationJobs.at(-1)!.id;
  paper = cancelTranslation(paper, cancelled);
  assert.throws(
    () =>
      completeTranslation(paper, {
        action: "complete_translation",
        jobId: cancelled,
        groups: [{ sourceIndexes: [0], text: "取消。" }],
      }),
    /cancelled/,
  );
});

test("translation stays valid across unrelated mapped edits, but changed source is marked stale", () => {
  let { paper } = initial();
  paper = requestTranslation(
    paper,
    { requestId: "one", sources: [selection(paper, 1)], replaces: [] },
    "task",
  );
  const completion = {
    action: "complete_translation" as const,
    jobId: paper.translationJobs[0].id,
    groups: [{ sourceIndexes: [0], text: "保留确认句。" }],
  };
  paper = completeTranslation(paper, completion);
  assert.equal(completeTranslation(paper, completion), paper);
  paper = acceptLast(replace(paper, selection(paper, 0, 0, 1), "Earlier edit"));
  assert.equal(paperView(paper).translations[0].state, "current");
  assert.equal(paperView(paper).translations[0].mappedSources[0].revision, 1);
  paper = acceptLast(replace(paper, selection(paper, 1, 0, 4), "Retain"));
  assert.equal(paperView(paper).translations[0].state, "stale");
});

test("Chinese content feedback binds the whole aligned source and needs a paired candidate projection", () => {
  let paper = translated(),
    tr = paper.translations[0];
  paper = addFeedback(paper, {
    requestId: "chinese-feedback",
    target: {
      kind: "translation",
      selection: {
        translationId: tr.id,
        version: 1,
        from: 0,
        to: 2,
        quote: "两段",
      },
    },
    comment: "只改第一处 X 的表述。",
  });
  assert.equal(paperView(paper).feedback[0].sources.length, 2);
  const operation: Operation = {
    kind: "replace",
    selection: selection(paper, 0, 0, 1),
    replacement: "First",
  };
  assert.throws(
    () => proposal(paper, [operation], { feedbackIds: [paper.feedback[0].id] }),
    /corresponding candidate translation/,
  );
  paper = proposal(paper, [operation], {
    feedbackIds: [paper.feedback[0].id],
    translations: [{ operationIndexes: [0], text: "第一处" }],
  });
  paper = acceptLast(paper);
  assert.equal(paper.translations.at(-1)!.sources[0].quote, "First");
  assert.equal(paper.translations.at(-1)!.sources[0].revision, 1);
  assert.equal(paperView(paper).translations.at(-1)!.state, "current");
});

test("feedback batches and stable delivery identities survive restart; saving and sending are separate", () => {
  let { paper } = initial();
  const feedback = {
    requestId: "note",
    target: { kind: "source" as const, selections: [selection(paper)] },
    comment: "Preserve the second X.",
  };
  paper = addFeedback(paper, feedback);
  assert.equal(addFeedback(paper, feedback), paper);
  const batch = {
    requestId: "batch",
    feedbackIds: [paper.feedback[0].id],
    direction: "Only change the first occurrence.",
  };
  paper = createBatch(paper, batch, "task");
  assert.equal(createBatch(paper, batch, "task"), paper);
  const prompt = deliveryPrompt(paper, "batch", paper.batches[0].id, "task");
  paper = markDelivery(
    paper,
    "batch",
    paper.batches[0].id,
    "Temporary send failure.",
  );
  assert.equal(
    deliveryPrompt(paper, "batch", paper.batches[0].id, "task"),
    prompt,
  );
  paper = paperSchema.parse(JSON.parse(JSON.stringify(paper)));
  assert.equal(paper.batches[0].delivery, "ready");
  assert.equal(text(paper), "X X alpha beta.");
  assert.throws(
    () => deliveryPrompt(paper, "batch", paper.batches[0].id, "another-task"),
    /does not belong/,
  );
});

test("the installed aggregate upgrades in place by replaying decisions and binding original run references", () => {
  const { paper: source, blocks } = initial();
  const withoutFormats = (doc: PMNode) =>
    new Transform(doc).removeMark(
      0,
      doc.content.size,
      schema.marks.nativeFormat,
    ).doc;
  let paper = acceptLast(replace(source, selection(source, 0, 2, 3), "second"));
  const legacy = legacyPaperSchema.parse({
    ...paper,
    baseline: withoutFormats(documentAt(source, 0)).toJSON(),
    document: withoutFormats(documentAt(paper, 1)).toJSON(),
    candidates: paper.candidates.map((c) => ({
      id: c.id,
      requestId: c.requestId,
      selection: c.operations[0].selection,
      replacement: (c.operations[0] as Extract<Operation, { kind: "replace" }>)
        .replacement,
      reason: c.reason,
      status: c.status,
      diff: c.diffs[0],
    })),
    decisions: paper.decisions.map((d) => ({
      candidateId: d.candidateIds[0],
      decision: d.decision,
      revision: d.revision,
    })),
  });
  const upgraded = migratePaper(legacy, blocks);
  assert.deepEqual(upgraded.document, paper.document);
  assert.equal(upgraded.candidates[0].id, legacy.candidates[0].id);
  assert.equal(upgraded.originalBase64, source.originalBase64);
  assert.equal(upgraded.history.length, 1);
  paper = undoDecision(upgraded, upgraded.decisions[0].id, 1);
  assert.deepEqual(paper.document, source.document);
});

test("history comparison records a removed merge paragraph and a split paragraph that exits on restore", () => {
  let { paper } = initial(["First paragraph.", "Second paragraph."]);
  const second = selection(paper, 1);
  paper = acceptLast(
    proposal(paper, [
      {
        kind: "merge",
        selection: selection(paper),
        next: second,
        separator: " ",
      },
    ]),
  );
  assert.equal(
    compareRevision(paper, 0).blocks.find(
      (block) => block.id === second.blockId,
    )!.removed,
    true,
  );
  paper = restoreRevision(paper, 0, 1);
  paper = acceptLast(
    proposal(paper, [{ kind: "split", selection: selection(paper, 0, 6, 6) }]),
  );
  const addedId = paperView(paper).blocks[1].id;
  assert.equal(
    compareRevision(paper, 0).blocks.find((block) => block.id === addedId)!
      .added,
    true,
  );
  paper = restoreRevision(paper, 0, 3);
  assert.equal(
    compareRevision(paper, 3).blocks.find((block) => block.id === addedId)!
      .removed,
    true,
  );
});

test("the candidate view exposes the current exact target after split without rewriting its source operation", () => {
  let { paper } = initial(["alpha beta", "Keep this paragraph."]);
  const source = selection(paper, 0, 6, 10);
  paper = replace(paper, source, "gamma");
  const id = paper.candidates.at(-1)!.id;
  paper = acceptLast(
    proposal(paper, [{ kind: "split", selection: selection(paper, 0, 6, 6) }]),
  );
  const candidate = paperView(paper).candidates.find(
    (candidate) => candidate.id === id,
  )!;
  assert.equal(candidate.conflict, null);
  assert.equal(candidate.operations[0].selection.blockId, source.blockId);
  assert.equal(
    candidate.currentSelections[0].blockId,
    paperView(paper).blocks[1].id,
  );
  assert.equal(candidate.currentSelections[0].quote, "beta");
  assert.equal(candidate.currentSelections[0].revision, paper.revision);
});

test("explicit restoration recovers the selected edit relationship from older full-document restore records", () => {
  const { paper: original } = initial();
  const accepted = acceptLast(
    replace(original, selection(original, 0, 0, 1), "First"),
  );
  const undone = undoDecision(accepted, accepted.decisions[0].id, 1);
  const before = documentAt(undone, 2),
    oldRestore = new Transform(before).replaceWith(
      0,
      before.content.size,
      documentAt(accepted, 1).content,
    );
  const older: Paper = {
    ...undone,
    revision: 3,
    document: oldRestore.doc.toJSON(),
    history: [
      ...undone.history.map(({ inverseOf, ...entry }) => entry),
      {
        revision: 3,
        kind: "restore",
        candidateIds: [],
        steps: oldRestore.steps.map((step) => step.toJSON()),
        inverseSteps: oldRestore.steps
          .map((step, index) => step.invert(oldRestore.docs[index]).toJSON())
          .reverse(),
      },
    ],
  };
  const repaired = restoreRevision(older, 1, 3);
  assert.equal(paperView(older).wordExportNeedsRestore, true);
  assert.throws(() => exportParagraphs(older), /restore it explicitly/);
  assert.equal(paperView(repaired).wordExportNeedsRestore, false);
  assert.deepEqual(repaired.document, accepted.document);
  assert.equal(repaired.revision, 4);
  assert.deepEqual(
    exportParagraphs(repaired)
      .flatMap((p) => p.segments)
      .filter((s) => s.kind !== "equal"),
    exportParagraphs(accepted)
      .flatMap((p) => p.segments)
      .filter((s) => s.kind !== "equal"),
  );
  assert.equal(
    older.history[2].inverseOf,
    undefined,
    "Historical records are retained without inventing their original target.",
  );
});

test("alternating restores retain only one net edit per transition and append linear step history", () => {
  let { paper } = initial(["A"]);
  paper = acceptLast(replace(paper, selection(paper), "B"));
  const primitiveSteps = paper.history[0].steps.length;
  for (let i = 0; i < 100; i++) {
    const target = i % 2 === 0 ? 0 : 1;
    paper = restoreRevision(paper, target, paper.revision);
    assert.ok(documentAt(paper, paper.revision).eq(documentAt(paper, target)));
    assert.equal(paper.history.at(-1)!.steps.length, primitiveSteps);
    assert.equal(
      paper.history.reduce((count, entry) => count + entry.steps.length, 0),
      primitiveSteps * (i + 2),
    );
  }
});

test("net restoration rebases active inverses across cancelled prefix edits and overlapping later edits", () => {
  let { paper } = initial(["First.", "Second."]);
  paper = acceptLast(
    replace(paper, selection(paper), "Longer first paragraph."),
  );
  const first = paper.decisions[0].id;
  paper = acceptLast(replace(paper, selection(paper, 1), "Later second."));
  paper = undoDecision(paper, first, 2);
  const expected = [0, 1, 2, 3].map((revision) => documentAt(paper, revision));
  const edits = paper.history
    .slice(0, 2)
    .reduce((count, entry) => count + entry.steps.length, 0);
  for (const target of [1, 0, 2, 3, 1, 3, 0]) {
    paper = restoreRevision(paper, target, paper.revision);
    assert.ok(documentAt(paper, paper.revision).eq(expected[target]));
    assert.ok(paper.history.at(-1)!.steps.length <= edits);
  }
  ({ paper } = initial(["A"]));
  paper = acceptLast(replace(paper, selection(paper), "BBBB"));
  paper = acceptLast(replace(paper, selection(paper, 0, 0, 2), "CC"));
  const overlap = [0, 1, 2].map((revision) => documentAt(paper, revision));
  for (const target of [0, 2, 1, 0, 1, 2]) {
    paper = restoreRevision(paper, target, paper.revision);
    assert.ok(documentAt(paper, paper.revision).eq(overlap[target]));
  }
});
