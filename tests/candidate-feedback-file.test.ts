import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createPaper, importDocument, paperView, propose, saveFeedback, decideMany } from "../src/model.js";
import { proposeRequest } from "../src/contracts.js";
import { wordComments, wordProjection } from "../src/word.js";

function engine(request: object) {
  const child = spawnSync("runtime/osx-arm64/paper-docx", { input: JSON.stringify(request), encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0);
  const result = JSON.parse(child.stdout); assert.equal(result.ok, true, result.error);
  return result.result;
}

test("new candidate comment targets reach actual SDK DOCX comments with exact accepted ranges and blank optional metadata", async () => {
  const original = engine({ action: "create" }), source = engine({ action: "inspect", base64: original.base64 });
  let paper = createPaper({ id: "file-case", name: "Synthetic.docx", originalBase64: original.base64, sourceBase64: source.normalizedBase64,
    document: importDocument(source.blocks), warnings: source.warnings });
  const empty = paperView(paper).blocks[0].selection;
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "earlier", reason: "Earlier synthetic draft.",
    operations: [{ kind: "fill_draft", selection: empty, paragraphs: ["An earlier premise.", "A separate paragraph."] }] }));
  paper = saveFeedback(paper, { id: "historical-note", expectedVersion: 0, target: { kind: "candidate_source", selection: paperView(paper).candidates[0].content!.sourceBlocks[0].selection }, comment: "This note belongs to the earlier draft." });
  paper = propose(paper, proposeRequest.parse({ action: "propose", requestId: "current", revises: [paper.candidates[0].id], feedbackIds: ["historical-note"], reason: "Retain the result's unverified status.",
    operations: [{ kind: "fill_draft", selection: empty, paragraphs: ["Echo result remains unverified.", "Echo result remains unverified."] }],
    translations: [0, 1].map(index => ({ operationIndexes: [0], paragraphIndexes: [index], text: "回显结果仍未经验证。" })) }));
  const current = paperView(paper).candidates[1], selection = current.content!.sourceBlocks[1].selection;
  paper = saveFeedback(paper, { id: "source-note", expectedVersion: 0, target: { kind: "candidate_source", selection: { ...selection, from: 5, to: 11, quote: "result" } }, comment: "Clarify this exact result." });
  paper = saveFeedback(paper, { id: "translation-note", expectedVersion: 0, target: { kind: "candidate_translation", selection: current.content!.translations[1].selection }, comment: "保留未经验证的含义。" });
  paper = decideMany(paper, [current.id], "accepted", 0);
  const comments = wordComments(paper, 0, 1, true), projection = wordProjection(paper);
  const exported = engine({ action: "export", base64: paper.sourceBase64, tracked: true, ...projection, comments: comments.comments });
  const inspected = engine({ action: "inspect", base64: exported.base64, revisionMode: "accept" });
  const evidence = process.env.DSH_CANDIDATE_FEEDBACK_EVIDENCE;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, "original.docx"), Buffer.from(original.base64, "base64"));
    await writeFile(join(evidence, "candidate-feedback.docx"), Buffer.from(exported.base64, "base64"));
    await writeFile(join(evidence, "actual-file-record.json"), JSON.stringify({ comments, inspected, sha256: createHash("sha256").update(Buffer.from(exported.base64, "base64")).digest("hex") }, null, 2) + "\n");
  }
  assert.deepEqual(inspected.blocks.map((block: { text: string }) => block.text), ["Echo result remains unverified.", "Echo result remains unverified."]);
  const sourceComment = inspected.nativeComments.find((comment: { text: string }) => comment.text === "Clarify this exact result.");
  assert.ok(sourceComment); assert.deepEqual(sourceComment.ranges, [{ sourceIndex: 1, from: 5, to: 11 }]);
  const chineseComment = inspected.nativeComments.find((comment: { text: string }) => comment.text.includes("保留未经验证的含义。"));
  assert.ok(chineseComment); assert.deepEqual(chineseComment.ranges, [{ sourceIndex: 1, from: 0, to: 31 }]);
  assert.match(chineseComment.text, /回显结果仍未经验证。/);
  assert.ok(comments.warnings.some(warning => warning.includes("historical-note") && warning.includes("historical proposal range")));
  assert.equal(inspected.nativeComments.some((comment: { text: string }) => comment.text === "This note belongs to the earlier draft."), false);
  const metadata = spawnSync("python3", ["-c", `import sys,json,base64,zipfile,io,xml.etree.ElementTree as E
fields={'creator','lastModifiedBy','title','subject','description','keywords','category','contentStatus','lastPrinted','created','modified','Application','Company','Manager','AppVersion'}
found=[]
for n,b in enumerate(json.load(sys.stdin)):
 with zipfile.ZipFile(io.BytesIO(base64.b64decode(b))) as z:
  for p in ['docProps/core.xml','docProps/app.xml','docProps/custom.xml']:
   if p not in z.namelist(): continue
   for x in E.fromstring(z.read(p)).iter():
    if x.tag.rsplit('}',1)[-1] in fields and (x.text or '').strip(): found.append([n,p,x.tag,x.text])
print(json.dumps(found))`], { input: JSON.stringify([original.base64, exported.base64]), encoding: "utf8" });
  assert.equal(metadata.status, 0, metadata.stderr); assert.deepEqual(JSON.parse(metadata.stdout), []);
});
