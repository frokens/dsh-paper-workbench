import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { importDocument, propose, decide, paperView, exportParagraphs, type Paper } from '../src/model.js';

function engine(request: object) {
  const process = spawnSync('runtime/osx-arm64/paper-docx', { input: JSON.stringify(request), encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(process.error, undefined);
  const result = JSON.parse(process.stdout);
  assert.equal(result.ok, true, result.error);
  assert.equal(process.status, 0);
  return result.result;
}

const fixture = engine({ action: 'fixture' });
const imported = engine({ action: 'inspect', base64: fixture.base64 });
function initial(): Paper {
  const document = importDocument(imported.blocks);
  return { id: 'paper', name: 'synthetic.docx', revision: 0, document, baseline: document,
    sourceBase64: imported.normalizedBase64, originalBase64: fixture.base64, warnings: imported.warnings, candidates: [], decisions: [] };
}
function request(paper: Paper) {
  const block = paperView(paper).blocks[1];
  const quote = 'The worker executes the operation.';
  const from = block.text.lastIndexOf(quote);
  return { action: 'propose' as const, requestId: 'proposal', selection: { ...block.selection, from, to: from + quote.length, quote }, replacement: 'The executor runs the operation.', reason: 'Clarify execution ownership.' };
}

test('an exact selection changes the second repeated sentence and preserves other paragraphs and emphasis', () => {
  const paper = initial(), proposed = propose(paper, request(paper));
  assert.deepEqual(proposed.document, paper.document);
  const accepted = decide(proposed, proposed.candidates[0].id, 'accepted');
  assert.equal(paperView(accepted).blocks[1].text, 'The worker executes the operation. The model proposes a change. The executor runs the operation.');
  assert.deepEqual(paperView(accepted).blocks[2], { ...paperView(paper).blocks[2], selection: { ...paperView(paper).blocks[2].selection, revision: 1 } });
  assert.deepEqual(accepted.baseline, paper.baseline);
});

test('proposal and decision retries are idempotent, and identities cannot be reused for different input', () => {
  let paper = initial(); const r = request(paper);
  paper = propose(paper, r);
  assert.equal(propose(paper, r), paper);
  assert.throws(() => propose(paper, { ...r, replacement: 'Other text.' }), /different proposal/);
  const accepted = decide(paper, paper.candidates[0].id, 'accepted');
  assert.equal(decide(accepted, paper.candidates[0].id, 'accepted'), accepted);
  assert.equal(accepted.decisions.length, 1);
});

test('mismatched and stale selections fail without changing accepted text', () => {
  const paper = initial(), r = request(paper);
  assert.throws(() => propose(paper, { ...r, selection: { ...r.selection, from: 0, to: 4 } }), /does not match/);
  const proposed = propose(paper, r);
  assert.throws(() => decide({ ...proposed, revision: 1 }, proposed.candidates[0].id, 'accepted'), /paper changed/);
  assert.equal(paperView(proposed).blocks[1].text, imported.blocks[1].text);
});

test('rejecting a proposal records the decision and leaves the exact original document', () => {
  const paper = initial(), proposed = propose(paper, request(paper));
  const rejected = decide(proposed, proposed.candidates[0].id, 'rejected');
  assert.deepEqual(rejected.document, paper.document);
  assert.equal(rejected.revision, 0);
  assert.equal(rejected.decisions[0].decision, 'rejected');
});

test('a tracked DOCX still contains native revisions after workbench acceptance, with SDK schema validation', () => {
  const source = initial(), proposed = propose(source, request(source));
  const paper = decide(proposed, proposed.candidates[0].id, 'accepted');
  const exported = engine({ action: 'export', base64: paper.sourceBase64, tracked: true, paragraphs: exportParagraphs(paper) });
  assert.equal(engine({ action: 'inspect', base64: exported.base64 }).hasRevisions, true);
  const accepted = engine({ action: 'inspect', base64: exported.base64, revisionMode: 'accept' });
  const rejected = engine({ action: 'inspect', base64: exported.base64, revisionMode: 'reject' });
  assert.equal(accepted.blocks[1].text, paperView(paper).blocks[1].text);
  assert.equal(rejected.blocks[1].text, paperView(source).blocks[1].text);
  assert.equal(accepted.blocks[2].runs[0].bold, true);
  assert.match(exported.validation, /passed/);
});

test('clean DOCX exports the accepted body without native revisions', () => {
  const source = initial(), proposed = propose(source, request(source));
  const paper = decide(proposed, proposed.candidates[0].id, 'accepted');
  const exported = engine({ action: 'export', base64: paper.sourceBase64, tracked: false, paragraphs: exportParagraphs(paper) });
  const clean = engine({ action: 'inspect', base64: exported.base64 });
  assert.equal(clean.hasRevisions, false);
  assert.equal(clean.blocks[1].text, paperView(paper).blocks[1].text);
});

test('mixed-format replacements preserve unchanged emphasis and inherit the removed text style at boundaries', () => {
  const source = initial(), block = paperView(source).blocks[3];
  const proposed = propose(source, { action: 'propose', requestId: 'formatted', selection: block.selection, replacement: 'A planner proposes a change.', reason: 'Check exact style inheritance.' });
  const paper = decide(proposed, proposed.candidates[0].id, 'accepted');
  const runs = paperView(paper).blocks[3].runs;
  assert.equal(runs.map(r => r.text).join(''), 'A planner proposes a change.');
  const styled = runs.flatMap(r => [...r.text].map(char => ({ char, bold: r.marks.includes('bold') })));
  assert.equal(styled.filter(c => c.bold).map(c => c.char).join(''), 'planner');
  const exported = engine({ action: 'export', base64: paper.sourceBase64, tracked: false, paragraphs: exportParagraphs(paper) });
  const formatted = engine({ action: 'inspect', base64: exported.base64 });
  assert.equal(formatted.blocks[3].runs.filter((r: { bold: boolean }) => r.bold).map((r: { text: string }) => r.text).join(''), 'planner');
});
