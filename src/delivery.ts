import type { z } from "zod";
import type { documentExportRequest } from "./contracts.js";
import { documentAt, translationViews, type Paper } from "./model.js";
import { documentDeliverySchema, type DocumentDelivery } from "./records.js";

export function selectComparison(paper: Paper, revision: number, expectedRevision: number): Paper {
  if (paper.revision !== expectedRevision) throw new Error("The paper changed. Review the comparison baseline again.");
  documentAt(paper, revision);
  return { ...paper, comparisonRevision: revision };
}

export function bilingualProjection(paper: Paper) {
  const source = [...documentAt(paper, paper.revision).content.content];
  const blocks = source.filter(node => node.type.name === "paragraph");
  const current = translationViews(paper).filter(translation => translation.state === "current");
  const covered = new Set<string>();
  const bilingual = current.map(translation => {
    const sources = translation.mappedSources;
    const indexes = sources.map(selection => source.findIndex(node => node.attrs.id === selection.blockId));
    if (!sources.length || indexes.some((index, position) => index < 0 || position > 0 && index !== indexes[position - 1] + 1)
      || sources.some((selection, index) => selection.from !== 0 || selection.to !== source[indexes[index]].content.size
        || covered.has(selection.blockId)))
      throw new Error("A bilingual working copy needs current, complete, consecutive paragraph groups without overlapping translations. Refresh the full source translation first.");
    sources.forEach(selection => covered.add(selection.blockId));
    return { blockIds: sources.map(selection => selection.blockId), text: translation.text,
      id: translation.id, version: translation.version, order: indexes[0] };
  }).sort((a, b) => a.order - b.order);
  if (covered.size !== blocks.length || !blocks.length)
    throw new Error("A bilingual working copy needs a current translation of every editable source paragraph. Refresh missing or stale Chinese first.");
  return {
    groups: bilingual.map(({ blockIds, text }) => ({ blockIds, text })),
    translations: bilingual.map(({ id, version }) => ({ id, version })),
  };
}

export function existingDelivery(paper: Paper, request: z.infer<typeof documentExportRequest>) {
  const delivery = paper.documentDeliveries.find(item => item.id === request.requestId);
  if (delivery && (delivery.revision !== request.expectedRevision || delivery.baselineRevision !== request.baselineRevision || delivery.variant !== request.variant
    || delivery.format !== request.format || delivery.includeReasons !== request.includeReasons))
    throw new Error("This delivery request identity was already used for different content or options.");
  return delivery;
}

/** Append an immutable output receipt while keeping the current paper authoritative. */
export function recordDocumentDelivery(paper: Paper, raw: DocumentDelivery): Paper {
  const delivery = documentDeliverySchema.parse(raw);
  documentAt(paper, delivery.revision); documentAt(paper, delivery.baselineRevision);
  if (delivery.baselineRevision > delivery.revision) throw new Error("The comparison baseline is later than the delivered body.");
  if (delivery.format === "docx") {
    const expected = [...documentAt(paper, delivery.revision).content.content].filter(node => node.type.name === "paragraph").map(node => node.attrs.id);
    if (JSON.stringify(delivery.anchors.map(anchor => anchor.blockId)) !== JSON.stringify(expected)
      || new Set(delivery.anchors.map(anchor => anchor.nativeId)).size !== expected.length
      || delivery.anchors.some(anchor => !/^[0-7][0-9A-F]{7}$/.test(anchor.nativeId) || anchor.nativeId === "00000000"))
      throw new Error("The delivered paragraph anchors do not match the exact working body.");
  }
  const previous = existingDelivery(paper, { action: "export", requestId: delivery.id, expectedRevision: delivery.revision,
    baselineRevision: delivery.baselineRevision,
    variant: delivery.variant, format: delivery.format, includeReasons: delivery.includeReasons });
  if (previous) return paper;
  return { ...paper, documentDeliveries: [...paper.documentDeliveries, delivery] };
}
