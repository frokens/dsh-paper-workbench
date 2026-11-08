import { diffArrays, wordsWithSpaceDiff } from "diff";
import { Mapping, Step } from "prosemirror-transform";
import type { z } from "zod";
import { documentAt, mapSelection, mapRange, acceptedOperationSteps, propose, addFeedback, isPendingCandidate, candidateLineage, type Paper } from "./model.js";
import { findDocumentBlock } from "./operations.js";
import { documentReturnSchema, type ReturnedBlock } from "./records.js";
import { proposeRequest, type Selection, type returnMappingsSchema, type proposeReturnRequest, type copyReturnCommentsRequest } from "./contracts.js";

type Mappings = z.infer<typeof returnMappingsSchema>;
export function recordDocumentReturn(paper: Paper, raw: unknown): Paper {
  const returned = documentReturnSchema.parse(raw);
  const delivery = paper.documentDeliveries.find(item => item.id === returned.deliveryId);
  if (!delivery || delivery.format !== "docx" || delivery.variant === "bilingual")
    throw new Error("Choose a primary-language clean or tracked DOCX delivery for return comparison.");
  const previous = paper.documentReturns.find(item => item.id === returned.id);
  if (previous) {
    if (previous.deliveryId !== returned.deliveryId || previous.originalBase64 !== returned.originalBase64
      || previous.name !== returned.name || previous.revisionMode !== returned.revisionMode)
      throw new Error("This return identity was already used for a different file or revision choice.");
    return paper;
  }
  return { ...paper, documentReturns: [...paper.documentReturns, returned] };
}

type SpanPair = { from: number; to: number; returnedFrom: number; returnedTo: number };
type TextComparison = { equal: SpanPair[]; changes: (SpanPair & { before: string; after: string })[]; problem?: string };

function compareText(before: string, after: string, deadline: number): TextComparison {
  if (before === after) return { equal: [{ from: 0, to: before.length, returnedFrom: 0, returnedTo: after.length }], changes: [] };
  const limited = () => ({ equal: [], changes: [], problem: "This paragraph exceeds the bounded source comparison. Select a smaller exact current range and review the original return." });
  if (before.length + after.length > 200000 || performance.now() >= deadline) return limited();
  const tokens = (text: string) => {
    let offset = 0;
    return wordsWithSpaceDiff.tokenize(text).flatMap(value => {
      const from = offset; offset += value.length;
      return value.trim() ? [{ text: value, from, to: offset }] : [];
    });
  };
  const a = tokens(before), b = tokens(after), width = b.length + 1;
  // jsdiff owns tokenization and the edit script. This bounded table checks the
  // missing provenance property: whether every optimal content-token matching
  // uses exactly the same source pairs. Edit ordering alone is not ambiguity.
  if ((a.length + 1) * width > 4_000_000) return limited();
  const parts = diffArrays(a.map(item => item.text), b.map(item => item.text),
    { timeout: Math.max(1, deadline - performance.now()), maxEditLength: 20000 });
  if (!parts || performance.now() >= deadline) return limited();
  const matched: { old: number; returned: number }[] = [], canonical = new Int32Array(b.length).fill(-1);
  let old = 0, returned = 0;
  for (const part of parts) {
    if (part.added) returned += part.value.length;
    else if (part.removed) old += part.value.length;
    else for (let index = 0; index < part.value.length; index++) {
      canonical[returned] = old; matched.push({ old: old++, returned: returned++ });
    }
  }
  // The cell bound limits min(a.length,b.length) below 2000, so UInt16 is exact.
  const prefix = new Uint16Array((a.length + 1) * width);
  for (let i = 0; i < a.length; i++) {
    if (performance.now() >= deadline) return limited();
    for (let j = 0; j < b.length; j++)
      prefix[(i + 1) * width + j + 1] = a[i].text === b[j].text ? prefix[i * width + j] + 1
        : Math.max(prefix[i * width + j + 1], prefix[(i + 1) * width + j]);
  }
  const longest = prefix[a.length * width + b.length];
  if (longest !== matched.length) return limited();
  let next = new Uint16Array(width), row = new Uint16Array(width);
  for (let i = a.length - 1; i >= 0; i--) {
    if (performance.now() >= deadline) return limited();
    row[b.length] = 0;
    for (let j = b.length - 1; j >= 0; j--) {
      const same = a[i].text === b[j].text;
      if (same && prefix[i * width + j] + 1 + next[j + 1] === longest && canonical[j] !== i)
        return { equal: [], changes: [], problem: "Repeated wording has more than one possible source alignment. Verify an exact current text range manually; no returned change or old-source comment was relocated automatically." };
      row[j] = same ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
    [next, row] = [row, next];
  }
  const result: TextComparison = { equal: [], changes: [] };
  function span(from: number, to: number, returnedFrom: number, returnedTo: number) {
    const pair = { from, to, returnedFrom, returnedTo }, oldText = before.slice(from, to), newText = after.slice(returnedFrom, returnedTo);
    if (oldText !== newText) result.changes.push({ ...pair, before: oldText, after: newText });
    else {
      const previous = result.equal.at(-1);
      if (previous?.to === from && previous.returnedTo === returnedFrom) { previous.to = to; previous.returnedTo = returnedTo; }
      else result.equal.push(pair);
    }
  }
  let from = 0, returnedFrom = 0;
  for (const pair of matched) {
    const left = a[pair.old], right = b[pair.returned];
    // Whitespace and rewritten wording form a complete gap between proven
    // content anchors; sliding spaces are never used as source identity.
    span(from, left.from, returnedFrom, right.from);
    span(left.from, left.to, right.from, right.to);
    from = left.to; returnedFrom = right.to;
  }
  span(from, before.length, returnedFrom, after.length);
  return result;
}

function nativeFormats(block: ReturnedBlock, from: number, to: number) {
  let position = 0;
  return block.runs.flatMap(run => {
    const start = position; position += run.text.length;
    const length = Math.min(to, position) - Math.max(from, start);
    return length > 0 ? [{ length, properties: run.nativeFormat }] : [];
  });
}

function nativeFormattingDiffers(before: ReturnedBlock, after: ReturnedBlock, comparison: TextComparison) {
  if (before.paragraphFormat !== after.paragraphFormat) return true;
  for (const pair of comparison.equal) {
    const a = nativeFormats(before, pair.from, pair.to), b = nativeFormats(after, pair.returnedFrom, pair.returnedTo);
    let i = 0, j = 0, left = 0, right = 0;
    while (i < a.length && j < b.length) {
      if (a[i].properties !== b[j].properties) return true;
      const length = Math.min(a[i].length - left, b[j].length - right);
      left += length; right += length;
      if (left === a[i].length) { i++; left = 0; }
      if (right === b[j].length) { j++; right = 0; }
    }
    if (i !== a.length || j !== b.length) return true;
  }
  for (const change of comparison.changes) {
    if (!change.before.trim() || !change.after.trim()) continue;
    const sequence = (block: ReturnedBlock, from: number, to: number) => nativeFormats(block, from, to)
      .map(item => item.properties).filter((value, index, values) => index === 0 || value !== values[index - 1]);
    if (JSON.stringify(sequence(before, change.from, change.to)) !== JSON.stringify(sequence(after, change.returnedFrom, change.returnedTo))) return true;
  }
  return false;
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
  const comparisons = new Map<number, TextComparison>();
  const acceptedRanges = new Map<string, Selection[]>();
  const acceptedSteps = new Map<number, ReturnType<typeof acceptedOperationSteps>>();
  const returnAlignments = new Map<string, TextComparison>();
  const stepsAt = (revision: number) => {
    let chunks = acceptedSteps.get(revision);
    if (!chunks) { chunks = acceptedOperationSteps(paper, revision, deadline); acceptedSteps.set(revision, chunks); }
    return chunks;
  };
  const returnOwned = (chunk: ReturnType<typeof acceptedOperationSteps>[number]) => {
    const candidate = paper.candidates.find(item => item.id === chunk.candidateId)!;
    return candidate.returnedFrom?.returnId === returnId && candidate.operations[chunk.operationIndex].kind === "replace";
  };
  function acceptedReturnRange(block: ReturnedBlock, original: Selection, returnedFrom: number, returnedTo: number) {
    const key = `${block.sourceIndex}:${returnedFrom}:${returnedTo}`, cached = acceptedRanges.get(key);
    if (cached) return cached;
    const source = findDocumentBlock(delivered, original.blockId), ranges: Selection[] = [];
    for (const entry of paper.history.slice(delivery.revision)) {
      if (performance.now() >= deadline) throw new Error("This comment exceeds the bounded source comparison. Verify its current range manually.");
      if (entry.kind !== "accept" || !entry.candidateIds.some(id => paper.candidates.find(item => item.id === id)?.returnedFrom?.returnId === returnId)) continue;
      const chunks = stepsAt(entry.revision), mapping = new Mapping(chunks.flatMap(chunk => chunk.steps.map(step => step.getMap())));
      const target = documentAt(paper, entry.revision), paragraphs: { node: typeof target; start: number; end: number }[] = [];
      target.forEach((node, position) => { if (node.type.name === "paragraph") paragraphs.push({ node, start: position + 1, end: position + 1 + node.content.size }); });
      const possible = new Set<string>();
      for (const chunk of chunks.filter(returnOwned)) {
        if (!chunk.steps.length) continue;
        const written = mapRange(chunk.from, chunk.to, mapping.slice(chunk.startStep, chunk.endStep), true);
        const final = mapRange(written.from, written.to, mapping.slice(chunk.endStep), true);
        paragraphs.filter(item => final.from <= item.end && final.to >= item.start).forEach(item => possible.add(item.node.attrs.id));
      }
      // Paragraphs come from actual operation results, never a global text search.
      for (const paragraph of paragraphs.filter(item => possible.has(item.node.attrs.id))) {
        const alignmentKey = `${entry.revision}:${block.sourceIndex}:${paragraph.node.attrs.id}`;
        let alignment = returnAlignments.get(alignmentKey);
        if (!alignment) { alignment = compareText(block.text, paragraph.node.textContent, Math.min(deadline, performance.now() + 200)); returnAlignments.set(alignmentKey, alignment); }
        if (alignment.problem) continue;
        const pairs = alignment.equal.filter(pair => returnedFrom >= pair.from && returnedTo <= pair.to)
          .map(pair => ({ from: pair.returnedFrom + returnedFrom - pair.from, to: pair.returnedFrom + returnedTo - pair.from }));
        const distinct = pairs.filter((pair, index) => pairs.findIndex(other => other.from === pair.from && other.to === pair.to) === index);
        if (distinct.length !== 1) continue;
        let from = paragraph.start + distinct[0].from, to = paragraph.start + distinct[0].to, usedReturn = false;
        try {
          // Pull the exact accepted scope back through actual history. Only this
          // return's verified replacement Steps may establish new wording; all
          // local edits remain strict, including same-commit edits and deletions.
          for (const previous of paper.history.slice(delivery.revision, entry.revision).reverse()) {
            const actual = previous.kind === "accept" ? stepsAt(previous.revision).flatMap(chunk => chunk.steps.map(step => ({ step, owned: returnOwned(chunk) })))
              : previous.steps.map(json => ({ step: Step.fromJSON(delivered.type.schema, json), owned: false }));
            for (const { step, owned } of actual.reverse()) {
              if (performance.now() >= deadline) throw new Error("This comment exceeds the bounded source comparison.");
              const inverse = step.getMap().invert();
              if (owned) inverse.forEach((start, end) => { usedReturn ||= start <= to && end >= from; });
              ({ from, to } = mapRange(from, to, new Mapping([inverse]), owned));
            }
          }
          if (usedReturn && from >= source.position + 1 && to <= source.position + 1 + source.node.content.size)
            ranges.push({ paperId: paper.id, revision: entry.revision, blockId: paragraph.node.attrs.id,
              ...distinct[0], quote: block.text.slice(returnedFrom, returnedTo) });
        } catch { /* An unrelated intervening edit cannot establish a returned source. */ }
      }
    }
    acceptedRanges.set(key, ranges);
    return ranges;
  }
  for (const block of returned.blocks) {
    const blockId = aligned.get(block.sourceIndex), original = blockId ? source.get(blockId) : undefined;
    if (!original || !blockId) continue;
    const currentNode = [...current.content.content].find(node => node.attrs.id === blockId && node.type.name === "paragraph");
    const comparison = compareText(original.text, block.text, Math.min(deadline, performance.now() + 200));
    comparisons.set(block.sourceIndex, comparison);
    const expected = deliveredBlocks?.find(item => item.nativeId === delivery.anchors.find(anchor => anchor.blockId === blockId)?.nativeId);
    if (expected && nativeFormattingDiffers(expected, block, comparison))
      formatChanges.push({ blockId, diagnostic: "The returned native formatting differs. Text candidates retain the current source formatting; inspect the original returned DOCX for those format changes." });
    if (comparison.problem) { unCompared.push({ blockId, returnedIndex: block.sourceIndex, diagnostic: comparison.problem }); continue; }
    comparison.changes.forEach((part, index) => {
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
  const comments = returned.nativeComments.map(comment => {
    const locations = comment.ranges.map(range => ({ ...range,
      quote: returned.blocks.find(block => block.sourceIndex === range.sourceIndex)?.text.slice(range.from, range.to) ?? "" }));
    const copied = paper.feedback.some(feedback => feedback.returnComment?.returnId === returnId && feedback.returnComment.commentId === comment.id);
    const sources: Selection[] = [];
    let diagnostic: string | undefined;
    try {
      if (markerMismatch) throw new Error("Choose the correct delivered file before copying its comments.");
      if (!comment.editable || !comment.text.trim() || !comment.ranges.length || comment.ranges.length > 100)
        throw new Error("This comment has no supported text range to copy. Inspect the original returned DOCX.");
      for (const range of comment.ranges) {
        const block = returned.blocks.find(item => item.sourceIndex === range.sourceIndex), blockId = aligned.get(range.sourceIndex);
        const original = blockId ? source.get(blockId) : undefined;
        if (!block || !blockId || !original || range.from > range.to || range.to > block.text.length)
          throw new Error("Verify this comment's returned paragraph alignment first.");
        const comparison = comparisons.get(block.sourceIndex) ?? compareText(original.text, block.text, Math.min(deadline, performance.now() + 200));
        if (comparison.problem) throw new Error(comparison.problem);
        const parts = [...comparison.equal.map(pair => ({ ...pair, changeIndex: -1 })),
          ...comparison.changes.map((pair, changeIndex) => ({ ...pair, changeIndex }))]
          .filter(pair => range.from === range.to ? range.from >= pair.returnedFrom && range.to <= pair.returnedTo
            : range.from < pair.returnedTo && range.to > pair.returnedFrom)
          .sort((a, b) => a.returnedFrom - b.returnedFrom);
        const resolved: Selection[] = [];
        let cursor = range.from;
        for (const part of parts) {
          if (performance.now() >= deadline) throw new Error("This comment exceeds the bounded source comparison. Verify its current range manually.");
          const from = Math.max(range.from, part.returnedFrom), to = Math.min(range.to, part.returnedTo);
          if (from !== cursor) throw new Error("This comment has no continuous exact current source range. Review its returned text and alignment.");
          if (part.changeIndex < 0) {
            const start = part.from + from - part.returnedFrom, end = part.from + to - part.returnedFrom;
            resolved.push(mapSelection(paper, { ...original.selection, from: start, to: end, quote: original.text.slice(start, end) }));
          } else {
            const accepted = acceptedReturnRange(block, original.selection, from, to);
            const targets: Selection[] = [];
            for (const selection of accepted) {
              try {
                targets.push(mapSelection(paper, selection));
              } catch { /* The accepted wording was subsequently changed or removed. */ }
            }
            const distinct = targets.filter((item, index) => targets.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index);
            if (distinct.length !== 1) throw new Error("This comment's returned wording has no unique surviving accepted source. Accept the return change or verify its current range manually.");
            resolved.push(distinct[0]);
          }
          cursor = to;
        }
        if (!resolved.length || cursor !== range.to || resolved.some((selection, index) => index > 0
          && (selection.blockId !== resolved[0].blockId || selection.from !== resolved[index - 1].to)))
          throw new Error("This comment has no continuous exact current source range. Review its returned text and alignment.");
        const selection = { ...resolved[0], to: resolved.at(-1)!.to, quote: resolved.map(item => item.quote).join("") };
        if (selection.quote !== block.text.slice(range.from, range.to)) throw new Error("The returned comment scope no longer matches its exact source text.");
        sources.push(selection);
      }
    } catch (error) { diagnostic = error instanceof Error ? error.message : String(error); }
    return { ...comment, locations, sources: diagnostic ? [] : sources,
      state: copied ? "copied" as const : diagnostic ? "unresolved" as const : "ready" as const,
      ...(diagnostic ? { diagnostic } : {}) };
  });
  return { returnId, deliveryId: delivery.id, deliveredRevision: delivery.revision, baselineRevision: delivery.baselineRevision,
    currentRevision: paper.revision, markerMismatch, orderChanged, mappings, warnings: [...new Set(warnings)], changes, formatChanges, unCompared, unmapped, missing,
    sourceParagraphs: [...source].map(([blockId, block]) => ({ blockId, text: block.text })),
    returnedParagraphs: returned.blocks.filter(block => block.editable).map(block => ({ sourceIndex: block.sourceIndex, text: block.text, blockId: aligned.get(block.sourceIndex) ?? null })),
    comments,
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
  const containsSelectedReturn = (candidate: Paper["candidates"][number]) => candidateLineage(paper, [candidate.id]).some(item =>
    item.returnedFrom?.returnId === request.returnId && item.returnedFrom.changeIds.some(id => provenance.changeIds.includes(id)));
  if (paper.candidates.some(candidate => isPendingCandidate(paper, candidate) && containsSelectedReturn(candidate)))
    throw new Error("Some selected return changes already have a pending candidate. Review that candidate first.");
  const comparison = compareReturn(paper, request.returnId, request.mappings);
  const changes = provenance.changeIds.map(id => comparison.changes.find(change => change.id === id));
  if (changes.some(change => !change || change.status !== "ready" || !change.current))
    throw new Error("Only exact, conflict-free returned text changes can become candidates. Resolve missing anchors, changed boundaries or concurrent edits first.");
  const next = propose(paper, proposeRequest.parse({ action: "propose", requestId: request.requestId,
    reason: `Selected text changes from the returned Word file, compared with delivered revision ${comparison.deliveredRevision}. Current source formatting is retained.`,
    operations: changes.map(change => ({ kind: "replace", selection: change!.current, replacement: change!.after })) }));
  return { ...next, candidates: next.candidates.map(candidate => candidate.requestId === request.requestId ? { ...candidate, returnedFrom: provenance } : candidate) };
}

export function copyReturnComments(paper: Paper, request: z.infer<typeof copyReturnCommentsRequest>): Paper {
  const ids = [...new Set(request.commentIds)];
  const copied = (id: string) => paper.feedback.some(feedback => feedback.returnComment?.returnId === request.returnId && feedback.returnComment.commentId === id);
  if (ids.every(copied)) return paper;
  if (paper.revision !== request.expectedRevision) throw new Error("The current paper changed. Review the returned comment locations again.");
  const comparison = compareReturn(paper, request.returnId, request.mappings);
  let next = paper;
  for (const id of ids) {
    if (copied(id)) continue;
    const comment = comparison.comments.find(item => item.id === id);
    if (!comment || comment.state !== "ready") throw new Error("Only returned comment text with an exact current source range can be copied to feedback.");
    const requestId = `return:${request.requestId}:${id}`;
    if (next.feedback.some(item => item.requestId === requestId)) throw new Error("This feedback request identity was already used.");
    next = addFeedback(next, { requestId, target: { kind: "source", selections: comment.sources }, comment: comment.text });
    next = { ...next, feedback: next.feedback.map(item => item.requestId === requestId
      ? { ...item, returnComment: { returnId: request.returnId, commentId: id } } : item) };
  }
  return next;
}
