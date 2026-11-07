import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDict, PDFDocument, PDFName, PDFStream, PDFString } from "pdf-lib";
import { createPaper, importDocument, paperView, propose, decide, requestTranslation, completeTranslation } from "../src/model.js";
import { proposeRequest } from "../src/contracts.js";
import { bilingualProjection, existingDelivery, recordDocumentDelivery, selectComparison } from "../src/delivery.js";
import { cleanPdf } from "../src/pdf.js";
import type { DocumentDelivery } from "../src/records.js";

function fixture() {
  return createPaper({ id: "paper", name: "paper.docx", originalBase64: "", sourceBase64: "", warnings: [],
    document: importDocument(["The Planner selects an action.", "The Worker executes the action."].map((text, sourceIndex) => ({
      sourceIndex, text, editable: true, style: null, reason: null, runs: [{ text, bold: false, italic: false }],
    }))) });
}
function change(paper: ReturnType<typeof fixture>, index = 0) {
  const next = propose(paper, proposeRequest.parse({ action: "propose", requestId: `change-${paper.revision}`, reason: "Clarify the role.",
    operations: [{ kind: "replace", selection: paperView(paper).blocks[index].selection, replacement: `Changed paragraph ${paper.revision}.` }] }));
  return decide(next, next.candidates.at(-1)!.id, "accepted");
}

test("immutable delivery metadata binds comparison B and actual body E separately across further editing and retries", () => {
  const source = fixture();
  let paper = change(source);
  const receipt: DocumentDelivery = { id: "delivery", revision: 1, baselineRevision: 0, variant: "tracked", format: "docx", includeReasons: true,
    name: "paper-tracked.docx", base64: "ZmlsZQ==", bytes: 4, warnings: [], translations: [],
    anchors: paperView(paper).blocks.map((block, index) => ({ blockId: block.id, nativeId: (index + 1).toString(16).padStart(8, "0").toUpperCase() })) };
  paper = recordDocumentDelivery(paper, receipt);
  assert.deepEqual(paper.document, change(source).document);
  paper = selectComparison(change(paper, 1), 1, 2);
  assert.equal(paper.revision, 2);
  assert.equal(paper.comparisonRevision, 1);
  assert.equal(paper.documentDeliveries[0].revision, 1);
  assert.equal(paper.documentDeliveries[0].baselineRevision, 0);
  const request = { action: "export" as const, requestId: "delivery", expectedRevision: 1, baselineRevision: 0,
    variant: "tracked" as const, format: "docx" as const, includeReasons: true };
  assert.deepEqual(existingDelivery(paper, request), receipt);
  assert.equal(recordDocumentDelivery(paper, receipt), paper);
  assert.throws(() => existingDelivery(paper, { ...request, baselineRevision: 1 }), /different content/);
  assert.throws(() => selectComparison(paper, 0, 1), /paper changed/);
  const view = paperView(paper);
  assert.equal("base64" in view.documentDeliveries[0], false);
  assert.equal("sourceDocxBase64" in view.documentDeliveries[0], false);
  assert.equal("anchors" in view.documentDeliveries[0], false);
  assert.equal(source.documentDeliveries.length, 0);
});

test("bilingual delivery requires complete current paragraph groups and preserves many-to-many alignment", () => {
  let paper = fixture();
  const document = paper.document;
  paper = requestTranslation(paper, { requestId: "translate", sources: paperView(paper).blocks.map(block => block.selection), replaces: [] }, "task");
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[0].id,
    groups: [{ sourceIndexes: [0, 1], text: "规划者选择操作，执行者执行该操作。" }] });
  const projected = bilingualProjection(paper);
  assert.deepEqual(projected.groups, [{ blockIds: paperView(paper).blocks.map(block => block.id), text: "规划者选择操作，执行者执行该操作。" }]);
  assert.deepEqual(paper.document, document);
  assert.throws(() => bilingualProjection(change(paper)), /current translation/);
  assert.throws(() => bilingualProjection(fixture()), /current translation/);
});

test("PDF delivery removes actual Info and XMP after serialization without changing converter-owned input", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage(); page.drawText("A preserved reading copy.");
  const metadata = document.context.register(document.context.stream('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>', { Type: "Metadata", Subtype: "XML" }));
  document.catalog.set(PDFName.of("Metadata"), metadata);
  page.node.set(PDFName.of("Metadata"), metadata);
  const note = document.context.register(document.context.obj({ Type: "Annot", Subtype: "Text", Rect: [20, 20, 40, 40],
    T: PDFString.of("Optional metadata"), M: PDFString.of("D:20000101000000Z"), CreationDate: PDFString.of("D:20000101000000Z"),
    Contents: PDFString.of("A reviewer comment.") }));
  page.node.set(PDFName.of("Annots"), document.context.obj([note]));
  const original = await document.save(), snapshot = original.slice();
  assert.ok((await PDFDocument.load(original, { updateMetadata: false })).context.trailerInfo.Info);
  const cleaned = await cleanPdf(original, new AbortController().signal);
  assert.deepEqual(original, snapshot);
  assert.equal(cleaned.pages, 1);
  const actual = await PDFDocument.load(cleaned.bytes, { updateMetadata: false });
  assert.equal(actual.context.trailerInfo.Info, undefined);
  assert.equal(actual.catalog.has(PDFName.of("Metadata")), false);
  for (const [, object] of actual.context.enumerateIndirectObjects()) {
    const dictionary = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : undefined;
    assert.equal(dictionary?.has(PDFName.of("Metadata")) ?? false, false);
    assert.notEqual(dictionary?.get(PDFName.of("Type")), PDFName.of("Metadata"));
    if (dictionary?.get(PDFName.of("Subtype")) === PDFName.of("Text")) {
      assert.equal(dictionary.has(PDFName.of("T")), false); assert.equal(dictionary.has(PDFName.of("M")), false);
      assert.equal(dictionary.has(PDFName.of("CreationDate")), false);
      assert.equal((dictionary.get(PDFName.of("Contents")) as PDFString).decodeText(), "A reviewer comment.");
    }
  }
});
