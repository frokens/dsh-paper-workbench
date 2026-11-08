import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequest, proposeRequest, readingRequest, translationLanguageFor } from "../src/contracts.js";
import { paperSchema } from "../src/records.js";
import { createPaper, importDocument, paperView, requestTranslation, completeTranslation, correctTranslation,
  addFeedback, createBatch, deliveryPrompt, propose, decide } from "../src/model.js";
import { prepareReading, readingPacket } from "../src/reading.js";
import { bilingualProjection } from "../src/delivery.js";
import { wordProjection } from "../src/word.js";

function engine(input: object) {
  const child = spawnSync("runtime/osx-arm64/paper-docx", { input: JSON.stringify(input), encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.ifError(child.error);
  const response = JSON.parse(child.stdout);
  assert.equal(response.ok, true, response.error);
  return response.result;
}

test("Chinese primary and English projection share the existing feedback, candidate, frozen-reader and Word lifecycle", () => {
  const input = createRequest.parse({ action: "create", requestId: "chinese-draft", name: "中文论文", brief: "保留选择和执行的职责区别。", primaryLanguage: "zh" });
  const original = engine({ action: "create", paragraphs: ["规划器选择操作，执行者执行。"] });
  const imported = engine({ action: "inspect", base64: original.base64 });
  let paper = createPaper({ id: "zh-paper", name: input.name, brief: input.brief, primaryLanguage: input.primaryLanguage,
    originalBase64: original.base64, sourceBase64: imported.normalizedBase64,
    document: importDocument(imported.blocks), warnings: imported.warnings });
  const body = paper.document;
  assert.equal(paperView(paper).primaryLanguage, "zh");
  assert.equal(paperView(paper).translationLanguage, "en");
  paper = requestTranslation(paper, { requestId: "translation", sources: [paperView(paper).blocks[0].selection], replaces: [] }, "task");
  assert.equal(paperView(paper).translationLanguage, "en");
  assert.equal(paper.translationJobs[0].sources[0].quote, paperView(paper).blocks[0].text);
  paper = completeTranslation(paper, { action: "complete_translation", jobId: paper.translationJobs[0].id,
    groups: [{ sourceIndexes: [0], text: "The planner selects an action. The worker executes." }] });
  const translated = paper.translations[0];
  paper = correctTranslation(paper, { translationId: translated.id, version: 1,
    from: 0, to: translated.text.length, quote: translated.text }, "The planner selects an action; the worker executes it.");
  assert.deepEqual(paper.document, body);
  const corrected = paper.translations[0];
  paper = addFeedback(paper, { requestId: "feedback", target: { kind: "translation", selection: { translationId: corrected.id,
    version: corrected.version, from: 0, to: corrected.text.length, quote: corrected.text } }, comment: "Clarify proposal and reporting; keep the condition." });
  paper = createBatch(paper, { requestId: "batch", feedbackIds: [paper.feedback[0].id],
    feedbackVersions: [{ id: paper.feedback[0].id, version: paper.feedback[0].version }], direction: "依据材料澄清职责，不改变主语言。" }, "task");
  assert.match(deliveryPrompt(paper, paper.batches[0].id, "task"), /primary body is Chinese and its projection is English/);
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "candidate", reason: "区分提出与执行并保留反馈用途。",
    operations: [{ kind: "replace", selection: paperView(paper).blocks[0].selection, replacement: "规划器提出候选操作，执行者执行并回报结果。" }],
    feedbackIds: [paper.feedback[0].id], translations: [{ operationIndexes: [0], text: "The planner proposes a candidate action; the worker executes it and reports the result." }] }));
  assert.deepEqual(paper.document, body);
  const prepared = prepareReading(paper, readingRequest.parse({ action: "read_independently", requestId: "reading", candidateIds: "all",
    goal: "核对中英文职责和反馈含义。", evidence: "Synthetic supplied roles only." }), "task");
  const packet = readingPacket(paper, prepared.reading);
  assert.equal(prepared.reading.material.primaryLanguage, "zh");
  assert.equal(packet.primaryLanguage, "zh"); assert.equal(packet.translationLanguage, "en");
  assert.deepEqual(packet.candidateTranslations.filter(item => item.state === "current").map(item => item.text), [paper.candidates[0].translations[0].text]);
  paper = decide(prepared.paper, paper.candidates[0].id, "accepted");
  const projection = bilingualProjection(paper);
  const output = engine({ action: "export", base64: paper.sourceBase64, tracked: false, ...wordProjection(paper),
    bilingual: projection.groups, translationLanguage: translationLanguageFor(paper.primaryLanguage) });
  const exported = engine({ action: "inspect", base64: output.base64 });
  assert.deepEqual(exported.blocks.map((block: { text: string }) => block.text), [paperView(paper).blocks[0].text, projection.groups[0].text]);
  assert.match(exported.blocks[1].runs[0].nativeFormat, /w:val="en-US"/);
  assert.equal(exported.hasRevisions, false);
  assert.equal(paper.primaryLanguage, "zh");
});

test("existing English records and frozen reading packets retain their default without changing content or history", () => {
  const input = createRequest.parse({ action: "create", requestId: "default-draft", name: "Default", brief: "" });
  assert.equal(input.primaryLanguage, "en");
  assert.equal(createRequest.safeParse({ ...input, primaryLanguage: "fr" }).success, false);
  const paper = createPaper({ id: "old", name: input.name, originalBase64: "", sourceBase64: "", warnings: [],
    document: importDocument([{ sourceIndex: 0, text: "Keep this condition.", editable: true, style: null,
      runs: [{ text: "Keep this condition.", bold: false, italic: false }], reason: null }]) });
  const prepared = prepareReading(paper, readingRequest.parse({ action: "read_independently", requestId: "old-reading", candidateIds: [], goal: "Check the condition.", evidence: "" }), "task");
  const old = JSON.parse(JSON.stringify(prepared.paper)); delete old.primaryLanguage; delete old.readings[0].material.primaryLanguage;
  const restored = paperSchema.parse(old);
  assert.equal(restored.primaryLanguage, "en");
  assert.equal(readingPacket(restored, restored.readings[0]).translationLanguage, "zh");
  assert.deepEqual(restored.document, old.document); assert.deepEqual(restored.history, old.history);
  assert.deepEqual(restored.readings[0].material.candidateDocument, old.readings[0].material.candidateDocument);
});
