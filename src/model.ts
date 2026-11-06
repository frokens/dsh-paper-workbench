import { randomUUID } from 'node:crypto';
import { Schema, Node as PMNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { diffWordsWithSpace } from 'diff';
import { z } from 'zod';
import { selectionSchema, type Selection, type proposeRequest } from './contracts.js';

export const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    paragraph: { group: 'block', content: 'text*', attrs: { id: {}, sourceIndex: {}, heading: { default: null } } },
    opaque: { group: 'block', atom: true, attrs: { id: {}, sourceIndex: {}, text: {}, reason: {} } },
    text: { group: 'inline' },
  },
  marks: { bold: {}, italic: {} },
});

export const candidateSchema = z.object({
  id: z.string(), requestId: z.string(), selection: selectionSchema, replacement: z.string(), reason: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']), diff: z.array(z.object({ kind: z.enum(['equal', 'delete', 'insert']), text: z.string() })),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const paperSchema = z.object({
  id: z.string(), name: z.string(), revision: z.number().int().nonnegative(),
  document: z.json(), baseline: z.json(), originalBase64: z.string(), sourceBase64: z.string(),
  warnings: z.array(z.string()), candidates: z.array(candidateSchema),
  decisions: z.array(z.object({ candidateId: z.string(), decision: z.enum(['accepted', 'rejected']), revision: z.number() })),
});
export type Paper = z.infer<typeof paperSchema>;
export type ImportedBlock = { sourceIndex: number; text: string; editable: boolean; style: string | null; runs: { text: string; bold: boolean; italic: boolean }[]; reason: string | null };

export function importDocument(blocks: ImportedBlock[]) {
  if (!blocks.length) throw new Error('The DOCX has no supported body blocks.');
  return schema.node('doc', null, blocks.map(block => {
    const attrs = { id: randomUUID(), sourceIndex: block.sourceIndex };
    if (!block.editable) return schema.node('opaque', { ...attrs, text: block.text, reason: block.reason });
    return schema.node('paragraph', { ...attrs, heading: block.style && /^(Title|Heading[1-6])$/i.test(block.style) ? block.style : null }, block.runs.filter(r => r.text).map(run => schema.text(run.text, [
      ...(run.bold ? [schema.marks.bold.create()] : []), ...(run.italic ? [schema.marks.italic.create()] : []),
    ])));
  })).toJSON();
}

export function realDiff(before: string, after: string) {
  return diffWordsWithSpace(before, after).map(part => ({ kind: part.added ? 'insert' as const : part.removed ? 'delete' as const : 'equal' as const, text: part.value }));
}

export function findBlock(paper: Paper, id: string) {
  const doc = PMNode.fromJSON(schema, paper.document);
  let found: { node: PMNode; position: number } | undefined;
  doc.forEach((node, position) => { if (node.attrs.id === id) found = { node, position }; });
  if (!found) throw new Error('The selected block no longer exists. Read the paper again.');
  return { ...found, doc };
}

export function validateSelection(paper: Paper, selection: Selection) {
  if (selection.paperId !== paper.id || selection.revision !== paper.revision) throw new Error('The paper changed. Read and select the current text again.');
  const block = findBlock(paper, selection.blockId);
  if (block.node.type.name !== 'paragraph') throw new Error('This block is preserved read only.');
  const text = block.node.textContent;
  if (selection.to < selection.from || selection.to > text.length || text.slice(selection.from, selection.to) !== selection.quote)
    throw new Error('The selected range does not match the exact source text.');
  return block;
}

export function propose(paper: Paper, request: z.infer<typeof proposeRequest>): Paper {
  const previous = paper.candidates.find(c => c.requestId === request.requestId);
  if (previous) {
    if (JSON.stringify({ selection: previous.selection, replacement: previous.replacement, reason: previous.reason }) !== JSON.stringify({ selection: request.selection, replacement: request.replacement, reason: request.reason }))
      throw new Error('The request identity was already used for a different proposal.');
    return paper;
  }
  validateSelection(paper, request.selection);
  if (request.selection.quote === request.replacement) throw new Error('The proposal contains no change.');
  return { ...paper, candidates: [...paper.candidates, {
    id: randomUUID(), requestId: request.requestId, selection: request.selection, replacement: request.replacement,
    reason: request.reason, status: 'pending', diff: realDiff(request.selection.quote, request.replacement),
  }] };
}

export function decide(paper: Paper, candidateId: string, decision: 'accepted' | 'rejected'): Paper {
  const candidate = paper.candidates.find(c => c.id === candidateId);
  if (!candidate) throw new Error('The proposal was not found.');
  if (candidate.status === decision) return paper;
  if (candidate.status !== 'pending') throw new Error('This proposal already has a different decision.');
  let document = paper.document;
  let revision = paper.revision;
  if (decision === 'accepted') {
    const { doc, node, position } = validateSelection(paper, candidate.selection);
    let cursor = position + 1 + candidate.selection.from;
    let sourceOffset = candidate.selection.from;
    let deletedStart: number | undefined;
    const transform = new Transform(doc);
    for (const part of candidate.diff) {
      if (part.kind === 'equal') { cursor += part.text.length; sourceOffset += part.text.length; deletedStart = undefined; }
      else if (part.kind === 'delete') {
        deletedStart = sourceOffset;
        transform.delete(cursor, cursor + part.text.length);
        sourceOffset += part.text.length;
      } else {
        const styleOffset = deletedStart ?? sourceOffset;
        const marks = node.nodeAt(styleOffset)?.marks ?? node.resolve(styleOffset).marks();
        transform.insert(cursor, schema.text(part.text, marks));
        cursor += part.text.length;
      }
    }
    document = transform.doc.toJSON();
    revision++;
  }
  return { ...paper, document, revision, candidates: paper.candidates.map(c => c.id === candidateId ? { ...c, status: decision } : c),
    decisions: [...paper.decisions, { candidateId, decision, revision }] };
}

export function paperView(paper: Paper) {
  const doc = PMNode.fromJSON(schema, paper.document);
  const blocks: { id: string; text: string; editable: boolean; heading: string | null; selection: Selection; runs: { text: string; marks: string[] }[]; reason: string | null }[] = [];
  doc.forEach(node => {
    const text = node.type.name === 'opaque' ? node.attrs.text as string : node.textContent;
    const runs: { text: string; marks: string[] }[] = [];
    node.forEach(child => runs.push({ text: child.text ?? '', marks: child.marks.map(m => m.type.name) }));
    blocks.push({ id: node.attrs.id, text, editable: node.type.name === 'paragraph', heading: node.attrs.heading ?? null,
      selection: { paperId: paper.id, revision: paper.revision, blockId: node.attrs.id, from: 0, to: text.length, quote: text }, runs, reason: node.attrs.reason ?? null });
  });
  return { id: paper.id, name: paper.name, revision: paper.revision, warnings: paper.warnings, blocks, candidates: paper.candidates, decisions: paper.decisions };
}

export function exportParagraphs(paper: Paper) {
  const baseline = PMNode.fromJSON(schema, paper.baseline), doc = PMNode.fromJSON(schema, paper.document);
  const paragraphs: { sourceIndex: number; before: string; segments: ReturnType<typeof realDiff> }[] = [];
  doc.forEach(node => {
    if (node.type.name !== 'paragraph') return;
    let original: PMNode | undefined;
    baseline.forEach(n => { if (n.attrs.id === node.attrs.id) original = n; });
    if (!original) throw new Error('The export is missing its immutable source mapping.');
    if (original.textContent !== node.textContent) paragraphs.push({ sourceIndex: node.attrs.sourceIndex, before: original.textContent, segments: realDiff(original.textContent, node.textContent) });
  });
  return paragraphs;
}
