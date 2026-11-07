import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function convert(markdown: string, resources: { path: string; base64: string }[] = []) {
  const result = spawnSync(process.execPath, ["dist/markdown.mjs"], { input: JSON.stringify({ base64: Buffer.from(markdown).toString("base64"), resources }),
    encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  return { status: result.status, ...JSON.parse(result.stdout) };
}
function inspect(base64: string) {
  const normalized = spawnSync("runtime/osx-arm64/paper-docx", { input: JSON.stringify({ action: "normalize", base64, generatedFonts: true }),
    encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  const result = JSON.parse(normalized.stdout);
  assert.equal(result.ok, true, result.error);
  const inspected = spawnSync("runtime/osx-arm64/paper-docx", { input: JSON.stringify({ action: "inspect", base64: result.result.base64 }),
    encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  const source = JSON.parse(inspected.stdout);
  assert.equal(source.ok, true, source.error);
  return source.result;
}

test("the packaged Markdown process preserves text and native rich objects in one normalized Word source", () => {
  const result = convert("# Method\n\nA **confirmed** sentence with 中文.\n\n- First item\n- Second item\n\n| Role | Action |\n| --- | --- |\n| Planner | Select |\n\nAn equation $x^2+1$ and a note.[^note]\n\n[^note]: A source note.\n");
  assert.equal(result.ok, true, result.error); assert.equal(result.status, 0); assert.equal(result.result.version, "3.10");
  const source = inspect(result.result.base64);
  assert.ok(source.blocks.some((block: { text: string }) => block.text.includes("中文")));
  assert.ok(source.blocks.some((block: { editable: boolean }) => !block.editable), "The table/equation/note remain read-only native objects, not lost plaintext.");
  assert.equal(source.hasRevisions, false);
});

test("structured resource targets preserve nested Unicode images and bibliography without Host path access", () => {
  const result = convert("---\nbibliography: refs/references.bib\n---\n\n# Supplied material\n\nA synthetic citation [@fixture].\n\n![A supplied asset](figures/图%201.png)\n", [
    { path: "figures/图 1.png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=" },
    { path: "refs/references.bib", base64: Buffer.from("@misc{fixture, author={Example, Ada}, title={Synthetic reference}, year={2024}}\n").toString("base64") },
  ]);
  assert.equal(result.ok, true, result.error);
  const source = inspect(result.result.base64);
  assert.ok(source.blocks.some((block: { text: string }) => /Example, Ada\. 2024\. Synthetic Reference\./.test(block.text)),
    "The default CSL style formats the supplied title in title case; it must retain the actual author, year and title.");
  assert.ok(source.blocks.some((block: { editable: boolean }) => !block.editable));
});

test("missing resources, duplicate paths and unsupported external images fail explicitly instead of becoming broken imports", () => {
  const source = "# Source\n\n![Required](../../not-supplied.png)\n";
  const missing = convert(source);
  assert.equal(missing.ok, false); assert.match(missing.error, /Supply the image resource/);
  const duplicate = convert("# Source", [{ path: "a.bib", base64: "" }, { path: "a.bib", base64: "" }]);
  assert.equal(duplicate.ok, false); assert.match(duplicate.error, /duplicate paths/);
  const external = convert("![Required](https://example.invalid/required.png)");
  assert.equal(external.ok, false); assert.match(external.error, /Supply the image resource/);
});
