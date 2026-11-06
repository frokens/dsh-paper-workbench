import { diffChars } from "diff";
import type { z } from "zod";
import { documentAt, mapSelection, propose, type Paper } from "./model.js";
import { documentReturnSchema, type ReturnedBlock } from "./records.js";
import { proposeRequest, type Selection, type returnMappingsSchema, type proposeReturnRequest } from "./contracts.js";

type Mappings = z.infer<typeof returnMappingsSchema>;
export function recordDocumentReturn(paper: Paper, raw: unknown): Paper {
  const returned = documentReturnSchema.parse(raw);
  const delivery = paper.documentDeliveries.find(item => item.id === returned.deliveryId);
  if (!delivery || delivery.format !== "docx" || delivery.variant === "bilingual")
    throw new Error("Choose an English clean or tracked DOCX delivery for return comparison.");
  const previous = paper.documentReturns.find(item => item.id === returned.id);
  if (previous) {
    if (previous.deliveryId !== returned.deliveryId || previous.originalBase64 !== returned.originalBase64
      || previous.name !== returned.name || previous.revisionMode !== returned.revisionMode)
      throw new Error("This return identity was already used for a different file or revision choice.");
    return paper;
  }
  return { ...paper, documentReturns: [...paper.documentReturns, returned] };
}

function textChanges(before: string, after: string) {
  const changes: { from: number; to: number; before: string; after: string }[] = [];
  let position = 0, pending: typeof changes[number] | undefined;
  if (before === after) return changes;
  if (before.length + after.length > 200000) return undefined;
  const parts = diffChars(before, after, { timeout: 200, maxEditLength: 20000 });
  if (!parts) return undefined;
  for (const part of parts) {
    if (!part.added && !part.removed) {
      if (pending) { changes.push(pending); pending = undefined; }
      position += part.value.length;
    } else {
      pending ??= { from: position, to: position, before: "", after: "" };
      if (part.removed) { pending.before += part.value; position += part.value.length; pending.to = position; }
      else pending.after += part.value;
    }
  }
  if (pending) changes.push(pending);
  return changes;
}

/** E is the immutable delivered body. B only defines the Word rejection projection. */
export function compareReturn(paper: Paper, returnId: string, mappings: Mappings = [], deliveredBlocks?: ReturnedBlock[]) {
  const returned = paper.documentReturns.find(item => item.id === returnId);
  if (!returned) throw new Error("The returned file was not found.");
  const delivery = paper.documentDeliveries.find(item => item.id === returned.deliveryId)!;
  const delivered = documentAt(paper, delivery.revision), current = documentAt(paper, paper.revision);
  const source = new Map<string, { text: string; selection: Selection }>();
  delivered.forEach(node => {
    if (node.type.name === "paragraph") source.set(node.attrs.id, { text: node.textContent,
      selection: { paperId: paper.id, revision: delivery.revision, blockId: node.attrs.id, from: 0, to: node.content.size, quote: node.textContent } });
  });
  if (new Set(mappings.map(item => item.sourceIndex)).size !== mappings.length
    || new Set(mappings.map(item => item.blockId)).size !== mappings.length
    || mappings.some(item => !source.has(item.blockId) || !returned.blocks.some(block => block.sourceIndex === item.sourceIndex && block.editable)))
    throw new Error("Manual alignment must select distinct returned and delivered editable paragraphs.");
  const markerMismatch = returned.deliveryMarkers.length > 1 || returned.deliveryMarkers.some(marker => marker.id !== delivery.id || marker.paperId !== paper.id);
  const warnings = [...returned.warnings];
  if (!returned.deliveryMarkers.length) warnings.push("The return has no delivery marker. Verify the selected delivered file and each paragraph alignment.");
  if (markerMismatch) warnings.push("The return's delivery marker does not match this paper and delivered file. Choose the correct delivery before proposing changes.");
  const counts = new Map<string, number>();
  for (const block of returned.blocks) if (block.nativeId) counts.set(block.nativeId, (counts.get(block.nativeId) ?? 0) + 1);
  const aligned = new Map<number, string>(), used = new Set<string>();
  for (const block of returned.blocks) {
    const manual = mappings.find(item => item.sourceIndex === block.sourceIndex);
    const native = block.nativeId && counts.get(block.nativeId) === 1 ? delivery.anchors.find(anchor => anchor.nativeId === block.nativeId) : undefined;
    const id = manual?.blockId ?? (native && !mappings.some(item => item.blockId === native.blockId) ? native.blockId : undefined);
    if (id && block.editable && !used.has(id)) { aligned.set(block.sourceIndex, id); used.add(id); }
  }
  // IDs are checked evidence. Missing/duplicate IDs never trigger text-based relocation.
  const unmapped = returned.blocks.filter(block => block.editable && !aligned.has(block.sourceIndex)).map(block => ({ sourceIndex: block.sourceIndex, text: block.text,
    diagnostic: block.nativeId && (counts.get(block.nativeId) ?? 0) > 1 ? "Duplicate native paragraph identifier; verify a manual alignment." : "Missing or changed native paragraph identifier; verify a manual alignment." }));
  const missing = [...source].filter(([id]) => !used.has(id)).map(([id, block]) => ({ blockId: id, text: block.text }));
  const sourceOrder = [...source.keys()], alignedOrder = [...aligned.values()].map(id => sourceOrder.indexOf(id));
  const orderChanged = alignedOrder.some((position, index) => index > 0 && position <= alignedOrder[index - 1]);
  if (orderChanged) warnings.push("The returned paragraph order differs. Text candidates retain the current order; review the returned DOCX for moved paragraphs.");
  const objects = [...delivered.content.content].filter(node => node.type.name === "opaque").map(node => node.attrs.text);
  if (JSON.stringify(objects) !== JSON.stringify(returned.blocks.filter(block => !block.editable).map(block => block.text)))
    warnings.push("Read-only objects differ or require review. They remain in the original returned DOCX; text proposals keep the current source objects.");
  if (unmapped.length || missing.length) warnings.push("Some paragraph boundaries or identifiers changed. Unaligned additions, removals, splits and merges need explicit review; they are not applied as text replacements.");
  const changes: { id: string; blockId: string; returnedIndex: number; source: Selection; current?: Selection; before: string; after: string;
    status: "ready" | "conflict" | "already_applied" | "wrong_delivery"; diagnostic?: string }[] = [];
  const formatChanges: { blockId: string; diagnostic: string }[] = [];
  const unCompared: { blockId: string; returnedIndex: number; diagnostic: string }[] = [];
  const deadline = performance.now() + 2000;
  for (const block of returned.blocks) {
    const blockId = aligned.get(block.sourceIndex), original = blockId ? source.get(blockId) : undefined;
    if (!original || !blockId) continue;
    const currentNode = [...current.content.content].find(node => node.attrs.id === blockId && node.type.name === "paragraph");
    const expected = deliveredBlocks?.find(item => item.nativeId === delivery.anchors.find(anchor => anchor.blockId === blockId)?.nativeId);
    if (expected && (expected.paragraphFormat !== block.paragraphFormat
      || block.runs.some(run => !expected.runs.some(original => original.nativeFormat === run.nativeFormat))))
      formatChanges.push({ blockId, diagnostic: "The returned native formatting differs. Text candidates retain the current source formatting; inspect the original returned DOCX for those format changes." });
    const parts = performance.now() < deadline ? textChanges(original.text, block.text) : undefined;
    if (!parts) { unCompared.push({ blockId, returnedIndex: block.sourceIndex, diagnostic: "This paragraph exceeds the bounded automatic text comparison. Review or narrow it explicitly; no candidate was created." }); continue; }
    parts.forEach((part, index) => {
      const selection = { ...original.selection, from: part.from, to: part.to, quote: part.before };
      const change: typeof changes[number] = { id: `${blockId}:${index}`, blockId, returnedIndex: block.sourceIndex,
        source: selection, before: part.before, after: part.after, status: "ready" };
      if (markerMismatch) change.status = "wrong_delivery";
      else if (currentNode?.textContent === block.text) change.status = "already_applied";
      else {
        try { change.current = mapSelection(paper, selection); }
        catch (error) { change.status = "conflict"; change.diagnostic = error instanceof Error ? error.message : String(error); }
      }
      changes.push(change);
    });
  }
  return { returnId, deliveryId: delivery.id, deliveredRevision: delivery.revision, baselineRevision: delivery.baselineRevision,
    currentRevision: paper.revision, markerMismatch, orderChanged, mappings, warnings: [...new Set(warnings)], changes, formatChanges, unCompared, unmapped, missing,
    sourceParagraphs: [...source].map(([blockId, block]) => ({ blockId, text: block.text })),
    returnedParagraphs: returned.blocks.filter(block => block.editable).map(block => ({ sourceIndex: block.sourceIndex, text: block.text, blockId: aligned.get(block.sourceIndex) ?? null })),
    comments: returned.nativeComments.map(comment => ({ ...comment, locations: comment.ranges.map(range => ({ ...range,
      quote: returned.blocks.find(block => block.sourceIndex === range.sourceIndex)?.text.slice(range.from, range.to) ?? "" })) })),
  };
}

export function proposeReturnChanges(paper: Paper, request: z.infer<typeof proposeReturnRequest>): Paper {
  const provenance = { returnId: request.returnId, changeIds: [...new Set(request.changeIds)].sort(),
    mappings: [...request.mappings].sort((a, b) => a.sourceIndex - b.sourceIndex), sourceRevision: request.expectedRevision };
  const previous = paper.candidates.find(candidate => candidate.requestId === request.requestId);
  if (previous) {
    if (JSON.stringify(previous.returnedFrom) !== JSON.stringify(provenance)) throw new Error("This proposal request identity was already used for different return changes.");
    return paper;
  }
  if (request.expectedRevision !== paper.revision) throw new Error("The current paper changed. Compare the returned file again.");
  const comparison = compareReturn(paper, request.returnId, request.mappings);
  const changes = provenance.changeIds.map(id => comparison.changes.find(change => change.id === id));
  if (changes.some(change => !change || change.status !== "ready" || !change.current))
    throw new Error("Only exact, conflict-free returned text changes can become candidates. Resolve missing anchors, changed boundaries or concurrent edits first.");
  const next = propose(paper, proposeRequest.parse({ action: "propose", requestId: request.requestId,
    reason: `Selected text changes from the returned Word file, compared with delivered revision ${comparison.deliveredRevision}. Current source formatting is retained.`,
    operations: changes.map(change => ({ kind: "replace", selection: change!.current, replacement: change!.after })) }));
  return { ...next, candidates: next.candidates.map(candidate => candidate.requestId === request.requestId ? { ...candidate, returnedFrom: provenance } : candidate) };
}
