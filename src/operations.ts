import { randomUUID } from 'node:crypto';
import { Schema, Node as PMNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { diffWordsWithSpace } from 'diff';
import type { Operation, Selection } from './contracts.js';

export const documentSchema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    paragraph: { group: 'block', content: 'text*', attrs: { id: {}, sourceIndex: { default: null }, heading: { default: null } } },
    opaque: { group: 'block', atom: true, attrs: { id: {}, sourceIndex: {}, text: {}, reason: {} } },
    text: { group: 'inline' },
  },
  marks: {
    bold: {}, italic: {},
    nativeFormat: { attrs: { sourceIndex: {}, offset: {} } },
  },
});

export type ImportedBlock = { sourceIndex: number; text: string; editable: boolean; style: string | null; runs: { text: string; bold: boolean; italic: boolean }[]; reason: string | null };
export function textDiff(before: string, after: string) {
  return diffWordsWithSpace(before, after).map(part => ({ kind: part.added ? 'insert' as const : part.removed ? 'delete' as const : 'equal' as const, text: part.value }));
}

export function documentFromImport(blocks: ImportedBlock[]) {
  if (!blocks.length) throw new Error('The DOCX has no supported body blocks.');
  return documentSchema.node('doc', null, blocks.map(block => {
    const attrs = { id: randomUUID(), sourceIndex: block.sourceIndex };
    if (!block.editable) return documentSchema.node('opaque', { ...attrs, text: block.text, reason: block.reason });
    let offset = 0;
    const content = block.runs.flatMap(run => {
      const sourceOffset = offset; offset += run.text.length;
      return run.text ? [documentSchema.text(run.text, [
        ...(run.bold ? [documentSchema.marks.bold.create()] : []), ...(run.italic ? [documentSchema.marks.italic.create()] : []),
        documentSchema.marks.nativeFormat.create({ sourceIndex: block.sourceIndex, offset: sourceOffset }),
      ])] : [];
    });
    return documentSchema.node('paragraph', { ...attrs, heading: block.style && /^(Title|Heading[1-6])$/i.test(block.style) ? block.style : null }, content);
  }));
}

export function findDocumentBlock(doc: PMNode, id: string) {
  let found: { node: PMNode; position: number } | undefined;
  doc.forEach((node, position) => { if (node.attrs.id === id) found = { node, position }; });
  if (!found) throw new Error('The selected block no longer exists. Read the paper again.');
  return { ...found, doc };
}

export function validateDocumentRange(doc: PMNode, selection: Selection) {
  const block = findDocumentBlock(doc, selection.blockId);
  if (block.node.type.name !== 'paragraph') throw new Error('This block is preserved read only.');
  if (selection.from < 0 || selection.to < selection.from || selection.to > block.node.content.size || block.node.textContent.slice(selection.from, selection.to) !== selection.quote)
    throw new Error('The selected range does not match the exact source text.');
  return block;
}

export function transformOperation(doc: PMNode, operation: Operation, parts?: ReturnType<typeof textDiff>) {
  const block = validateDocumentRange(doc, operation.selection);
  const { node, position } = block;
  const transform = new Transform(doc);
  if (operation.kind === 'split') {
    if (operation.selection.from !== operation.selection.to) throw new Error('Choose a cursor position for the paragraph split.');
    return transform.split(position + 1 + operation.selection.from, 1, [{ type: documentSchema.nodes.paragraph,
      attrs: { id: randomUUID(), sourceIndex: null, heading: null } }]);
  }
  if (operation.kind === 'merge') {
    const next = validateDocumentRange(doc, operation.next);
    if (position + node.nodeSize !== next.position) throw new Error('Only adjacent editable paragraphs can be merged.');
    if (operation.selection.from !== 0 || operation.selection.to !== node.content.size || operation.next.from !== 0 || operation.next.to !== next.node.content.size)
      throw new Error('Read both complete paragraphs before merging.');
    if (operation.separator) transform.insert(position + 1 + node.content.size, documentSchema.text(operation.separator, node.resolve(node.content.size).marks()));
    return transform.join(position + node.nodeSize + operation.separator.length);
  }
  let cursor = position + 1 + operation.selection.from, sourceOffset = operation.selection.from;
  let deletedStart: number | undefined;
  for (const part of parts ?? textDiff(operation.selection.quote, operation.replacement)) {
    if (part.kind === 'equal') { cursor += part.text.length; sourceOffset += part.text.length; deletedStart = undefined; }
    else if (part.kind === 'delete') {
      deletedStart = sourceOffset; transform.delete(cursor, cursor + part.text.length); sourceOffset += part.text.length;
    } else {
      const offset = deletedStart ?? sourceOffset;
      const marks = node.nodeAt(offset)?.marks ?? node.resolve(offset).marks();
      transform.insert(cursor, documentSchema.text(part.text, marks)); cursor += part.text.length;
    }
  }
  return transform;
}

export function bindNativeFormats(doc: PMNode, blocks: ImportedBlock[]) {
  const transform = new Transform(doc);
  doc.forEach((node, position) => {
    if (node.type.name !== 'paragraph') return;
    const source = blocks.find(block => block.sourceIndex === node.attrs.sourceIndex);
    if (!source?.editable || source.text !== node.textContent) throw new Error('The stored baseline does not match its original DOCX.');
    let offset = 0;
    for (const run of source.runs) {
      if (run.text) transform.addMark(position + 1 + offset, position + 1 + offset + run.text.length,
        documentSchema.marks.nativeFormat.create({ sourceIndex: source.sourceIndex, offset }));
      offset += run.text.length;
    }
  });
  return transform.doc;
}
