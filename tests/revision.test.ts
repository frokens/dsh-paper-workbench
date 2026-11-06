import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  importDocument,
  createPaper,
  propose as proposeGroup,
  decide,
  paperView,
  exportParagraphs,
  undoDecision,
  restoreRevision,
  type Paper,
} from "../src/model.js";
import { proposeRequest, type Selection } from "../src/contracts.js";

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
    paragraphs: exportParagraphs(paper),
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
    paragraphs: exportParagraphs(paper),
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
    paragraphs: exportParagraphs(paper),
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
  const paragraphs = exportParagraphs(paper);
  assert.deepEqual(paragraphs[0].segments, [
    { kind: "delete", text: "X " },
    { kind: "equal", text: "X" },
  ]);
  for (const tracked of [false, true]) {
    const exported = engine({
      action: "export",
      base64: paper.sourceBase64,
      tracked,
      paragraphs,
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
      paragraphs: exportParagraphs(paper),
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
      paragraphs: exportParagraphs(paper),
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
    paragraphs: exportParagraphs(paper),
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
  const normalizeColor = [
    {
      sourceIndex: 0,
      before: "X X",
      segments: [
        { kind: "delete", text: "X " },
        { kind: "insert", text: "X ", styleFrom: 2 },
        { kind: "equal", text: "X" },
      ],
    },
  ];
  const tracked = engine({
    action: "export",
    base64: paper.sourceBase64,
    tracked: true,
    paragraphs: exportParagraphs(paper),
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
      paragraphs: normalizeColor,
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
    paragraphs: exportParagraphs(paper),
  });
  const unchanged = engine({
    action: "export",
    base64: clean.base64,
    tracked: true,
    paragraphs: normalizeColor,
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
    paragraphs: exportParagraphs(paper),
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
    paragraphs: exportParagraphs(paper),
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

test("paragraph-mark revisions are refused before import, including explicit acceptance and rejection", () => {
  const fixture = engine({ action: "fixture", fixture: "paragraph-mark" });
  for (const revisionMode of [undefined, "accept", "reject"])
    assert.throws(
      () => engine({ action: "inspect", base64: fixture.base64, revisionMode }),
      /structural or formatting revisions.*Word/,
    );
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
      paragraphs: exportParagraphs(restored),
    });
    assert.equal(
      engine({ action: "inspect", base64: exported.base64 }).hasRevisions,
      false,
    );
    const normalize = [
      {
        sourceIndex: 0,
        before: "X X",
        segments: [
          { kind: "delete", text: "X " },
          { kind: "insert", text: "X ", styleFrom: 2 },
          { kind: "equal", text: "X" },
        ],
      },
    ];
    const recolored = engine({
      action: "export",
      base64: exported.base64,
      tracked: true,
      paragraphs: normalize,
    });
    assert.equal(
      engine({ action: "inspect", base64: recolored.base64 }).hasRevisions,
      true,
      "The restored first run is red, so normalizing it to the default style must be a change.",
    );
  }
});
