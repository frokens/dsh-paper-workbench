import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importDocument, paperView, propose, decide, exportParagraphs } from '../src/model.ts';

function engine(request) {
  const child = spawnSync(resolve('runtime/osx-arm64/paper-docx'), { input: JSON.stringify(request), encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (child.error) throw child.error;
  const response = JSON.parse(child.stdout);
  if (!response.ok || child.status !== 0) throw new Error(response.error ?? child.stderr);
  return response.result;
}

const directory = resolve(process.argv[3] ?? '.local/word');
await mkdir(directory, { recursive: true });
const fixture = engine({ action: 'fixture' });
const source = engine({ action: 'inspect', base64: fixture.base64 });
const document = importDocument(source.blocks);
let paper = { id: 'synthetic', name: 'baseline.docx', revision: 0, document, baseline: document, sourceBase64: source.normalizedBase64,
  originalBase64: fixture.base64, warnings: source.warnings, candidates: [], decisions: [] };
const block = paperView(paper).blocks[1], quote = 'The worker executes the operation.', from = block.text.lastIndexOf(quote);
paper = propose(paper, { action: 'propose', requestId: 'word-smoke', selection: { ...block.selection, quote, from, to: from + quote.length }, replacement: 'The executor runs the operation.', reason: 'Clarify the actor of execution.' });
paper = decide(paper, paper.candidates[0].id, 'accepted');
const tracked = engine({ action: 'export', base64: paper.sourceBase64, tracked: true, paragraphs: exportParagraphs(paper) });
const clean = engine({ action: 'export', base64: paper.sourceBase64, tracked: false, paragraphs: exportParagraphs(paper) });
if (process.argv[2] === 'prepare') {
  await writeFile(resolve(directory, 'baseline.docx'), Buffer.from(fixture.base64, 'base64'), { flag: 'wx' });
  await writeFile(resolve(directory, 'tracked.docx'), Buffer.from(tracked.base64, 'base64'), { flag: 'wx' });
  await writeFile(resolve(directory, 'clean.docx'), Buffer.from(clean.base64, 'base64'), { flag: 'wx' });
  console.log('Synthetic baseline, tracked and clean DOCX prepared. Open only these test files in Word.');
} else if (process.argv[2] === 'verify') {
  for (const [name, expected] of [['word-accepted.docx', paperView(paper).blocks[1].text], ['word-rejected.docx', block.text]]) {
    const imported = engine({ action: 'inspect', base64: (await readFile(resolve(directory, name))).toString('base64') });
    if (imported.hasRevisions || imported.blocks[1].text !== expected) throw new Error(`Word round trip mismatch: ${name}`);
  }
  console.log('Word accepted/rejected copies reimport to the exact target/baseline. This does not establish who performed the client operations.');
} else {
  throw new Error('Choose prepare or verify. Perform acceptance/rejection in real Microsoft Word between these steps.');
}
