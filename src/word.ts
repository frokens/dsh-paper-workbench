import { Mark, type Node as PMNode } from "prosemirror-model";
import { Mapping, Step, Transform } from "prosemirror-transform";
import { documentAt, documentMapping, mapSelection, needsExplicitRestore, schema, type Paper } from "./model.js";
import type { Selection } from "./contracts.js";

export type ParagraphSource = { blockId: string; sourceIndex: number | null; heading: string | null };
type StyleSource = { sourceIndex: number; offset: number } | null;
type Change = "equal" | "delete" | "insert";
export type WordEvent =
  | { kind: "text"; change: Change; text: string; styleFrom: StyleSource }
  | { kind: "paragraph"; change: Change; before: ParagraphSource | null; after: ParagraphSource | null }
  | { kind: "opaque"; sourceIndex: number };
type Paragraph = { node: PMNode; from: number; to: number; properties: ParagraphSource };
type Region = { paragraphs: Paragraph[]; opaqueAfter?: PMNode };
type Token =
  | { kind: "text"; from: number; to: number; node: PMNode; styleFrom: StyleSource }
  | { kind: "paragraph"; from: number; to: number; properties: ParagraphSource };

function regions(document: PMNode) {
  const result: Region[] = [{ paragraphs: [] }];
  document.forEach((node, position) => {
    const region = result.at(-1)!;
    if (node.type.name === "opaque") {
      region.opaqueAfter = node;
      result.push({ paragraphs: [] });
    } else if (node.type.name === "paragraph") {
      region.paragraphs.push({ node, from: position + 1, to: position + 1 + node.content.size,
        properties: { blockId: node.attrs.id, sourceIndex: node.attrs.sourceIndex, heading: node.attrs.heading } });
    } else throw new Error("The Word projection has an unsupported primary block.");
  });
  return result;
}

function tokens(region: Region): Token[] {
  const result: Token[] = [];
  region.paragraphs.forEach((paragraph, index) => {
    paragraph.node.forEach((node, offset) => {
      const native = node.marks.find(mark => mark.type === schema.marks.nativeFormat);
      result.push({ kind: "text", from: paragraph.from + offset, to: paragraph.from + offset + node.nodeSize, node,
        styleFrom: native ? { sourceIndex: native.attrs.sourceIndex, offset: native.attrs.offset } : null });
    });
    const next = region.paragraphs[index + 1];
    if (next) result.push({ kind: "paragraph", from: paragraph.to, to: next.from, properties: paragraph.properties });
  });
  return result;
}

function textIsUnchanged(document: PMNode, token: Extract<Token, { kind: "text" }>, from: number, to: number, oldFrom: number, oldTo: number) {
  if (!document.resolve(from).sameParent(document.resolve(to))
    || document.resolve(from).parent.type.name !== "paragraph"
    || document.textBetween(from, to) !== token.node.text!.slice(oldFrom - token.from, oldTo - token.from)) return false;
  let same = true;
  document.nodesBetween(from, to, node => {
    if (node.isText && !Mark.sameSet(node.marks, token.node.marks)) same = false;
  });
  return same;
}

/** Project actual journal relationships into Word text and paragraph-mark changes. */
export function wordProjection(paper: Paper, baselineRevision = 0, revision = paper.revision) {
  const target = documentAt(paper, revision);
  const scoped = revision === paper.revision ? paper : {
    ...paper, revision, document: target.toJSON(), history: paper.history.slice(0, revision),
  };
  if (needsExplicitRestore(scoped, baselineRevision))
    throw new Error("An earlier restoration has no precise Word comparison. Restore its intended historical revision explicitly; existing records are retained.");
  const baseline = documentAt(scoped, baselineRevision), mapping = documentMapping(scoped, baselineRevision);
  const before = regions(baseline), after = regions(target);
  if (before.length !== after.length || before.some((region, index) =>
    !!region.opaqueAfter !== !!after[index].opaqueAfter
      || (region.opaqueAfter && !region.opaqueAfter.eq(after[index].opaqueAfter!))))
    throw new Error("A preserved object or its order changed unexpectedly.");

  const cuts = new Set<number>(), cumulative = new Mapping();
  for (let index = mapping.from; index < mapping.to; index++) {
    const map = mapping.maps[index], inverse = cumulative.invert();
    map.forEach((from, to) => { cuts.add(inverse.map(from, 1)); cuts.add(inverse.map(to, -1)); });
    const mirror = mapping.getMirror(index);
    cumulative.appendMap(map, mirror !== undefined && mirror < index ? mirror : undefined);
  }
  const flow: WordEvent[] = [];
  function text(change: Change, value: string, styleFrom: StyleSource) {
    if (!value) return;
    const previous = flow.at(-1);
    if (previous?.kind === "text" && previous.change === change
      && JSON.stringify(previous.styleFrom) === JSON.stringify(styleFrom)) previous.text += value;
    else flow.push({ kind: "text", change, text: value, styleFrom });
  }
  function range(items: Token[], from: number, to: number, change: "delete" | "insert") {
    for (const item of items) {
      const start = Math.max(from, item.from), end = Math.min(to, item.to);
      if (start >= end) continue;
      if (item.kind === "text") text(change, item.node.text!.slice(start - item.from, end - item.from), item.styleFrom);
      else {
        if (start !== item.from || end !== item.to) throw new Error("The Word projection cut an unsupported paragraph boundary.");
        flow.push({ kind: "paragraph", change,
          before: change === "delete" ? item.properties : null, after: change === "insert" ? item.properties : null });
      }
    }
  }
  before.forEach((region, regionIndex) => {
    const current = after[regionIndex], oldTokens = tokens(region), newTokens = tokens(current);
    if (!!region.paragraphs.length !== !!current.paragraphs.length)
      throw new Error("A Word block region was removed or created without its required paragraph boundary.");
    if (region.paragraphs.length) {
      let oldCursor = region.paragraphs[0].from, newCursor = current.paragraphs[0].from;
      function gap(oldEnd: number, newEnd: number) {
        if (oldEnd < oldCursor || newEnd < newCursor) throw new Error("The Word journal projection is out of order.");
        range(oldTokens, oldCursor, oldEnd, "delete");
        range(newTokens, newCursor, newEnd, "insert");
      }
      for (const token of oldTokens) {
        const points = token.kind === "text"
          ? [token.from, ...[...cuts].filter(point => point > token.from && point < token.to).sort((a, b) => a - b), token.to]
          : [token.from, token.to];
        for (let index = 1; index < points.length; index++) {
          const oldFrom = points[index - 1], oldTo = points[index], from = mapping.mapResult(oldFrom, 1), to = mapping.mapResult(oldTo, -1);
          if (from.deleted || to.deleted || to.pos - from.pos !== oldTo - oldFrom) continue;
          if (token.kind === "text") {
            if (!textIsUnchanged(target, token, from.pos, to.pos, oldFrom, oldTo)) continue;
            gap(oldFrom, from.pos);
            text("equal", token.node.text!.slice(oldFrom - token.from, oldTo - token.from), token.styleFrom);
          } else {
            const matched = newTokens.find(item => item.kind === "paragraph" && item.from === from.pos && item.to === to.pos);
            if (!matched || matched.kind !== "paragraph") continue;
            gap(oldFrom, from.pos);
            flow.push({ kind: "paragraph", change: "equal", before: token.properties, after: matched.properties });
          }
          oldCursor = oldTo; newCursor = to.pos;
        }
      }
      gap(region.paragraphs.at(-1)!.to, current.paragraphs.at(-1)!.to);
      // Word requires a final paragraph mark, including after a full empty-node
      // replacement. Only internal boundaries represent inserted/deleted marks.
      flow.push({ kind: "paragraph", change: "equal", before: region.paragraphs.at(-1)!.properties, after: current.paragraphs.at(-1)!.properties });
    }
    if (region.opaqueAfter) flow.push({ kind: "opaque", sourceIndex: region.opaqueAfter.attrs.sourceIndex });
  });
  return { baselineRevision, revision, flow };
}

/** Read reason scopes from committed steps; never replay proposals with fresh IDs. */
export function wordReasons(paper: Paper, baselineRevision: number, revision = paper.revision) {
  const target = documentAt(paper, revision);
  const scoped = { ...paper, revision, document: target.toJSON(), history: paper.history.slice(0, revision) };
  const changed = new Set<string>();
  let dirty = false;
  for (const event of wordProjection(scoped, baselineRevision).flow) {
    if (event.kind === "opaque") { dirty = false; continue; }
    if (event.kind === "text") { dirty ||= event.change !== "equal"; continue; }
    if (event.change === "delete") { dirty = true; continue; }
    dirty ||= event.change === "insert" || JSON.stringify(event.before) !== JSON.stringify(event.after);
    if (dirty) changed.add(event.after!.blockId);
    dirty = false;
  }
  const reasons: { decisionId: string; blockId: string; selections: Selection[]; text: string; feedbackIds: string[] }[] = [];
  const warnings: string[] = [];
  for (const entry of scoped.history.slice(baselineRevision)) {
    const candidates = entry.candidateIds.map(id => paper.candidates.find(candidate => candidate.id === id)).filter(candidate => !!candidate);
    const decision = paper.decisions.find(item => entry.kind === "accept" ? item.editRevision === entry.revision
      : item.decision === "undone" && item.revision === entry.revision);
    const text = entry.kind === "restore" ? `Historical body restored, recorded as revision ${entry.revision}.`
      : `${entry.kind === "undo" ? "Undo the earlier decision. " : ""}${[...new Set(candidates.map(candidate => candidate.reason))].join("\n\n")}`;
    const feedbackIds = [...new Set(candidates.flatMap(candidate => candidate.feedbackIds))];
    const transform = new Transform(documentAt(scoped, entry.revision - 1));
    for (const json of entry.steps) transform.step(Step.fromJSON(schema, json));
    const selections: Selection[] = [];
    for (let index = 0; index < transform.steps.length; index++) {
      const old = transform.docs[index], after = transform.docs[index + 1] ?? transform.doc;
      transform.steps[index].getMap().forEach((from, to, newFrom, newTo) => {
        const structural = !old.resolve(from).sameParent(old.resolve(to))
          || !after.resolve(newFrom).sameParent(after.resolve(newTo))
          || old.resolve(from).parent.type.name !== "paragraph" || after.resolve(newFrom).parent.type.name !== "paragraph";
        const suffix = transform.mapping.slice(index + 1);
        const start = suffix.map(newFrom, -1), end = suffix.map(newTo, 1);
        transform.doc.forEach((node, position) => {
          if (node.type.name !== "paragraph") return;
          const textStart = position + 1, textEnd = textStart + node.content.size;
          if (end < textStart || start > textEnd) return;
          const source: Selection = { paperId: paper.id, revision: entry.revision, blockId: node.attrs.id,
            from: structural ? 0 : Math.max(start, textStart) - textStart,
            to: structural ? node.content.size : Math.min(end, textEnd) - textStart,
            quote: "" };
          source.quote = node.textContent.slice(source.from, source.to);
          try {
            const mapped = mapSelection(scoped, source);
            if (changed.has(mapped.blockId) && !selections.some(item => JSON.stringify(item) === JSON.stringify(mapped))) selections.push(mapped);
          } catch {
            warnings.push(`The reason at revision ${entry.revision} overlaps a later change. Review its location before adding it to Word.`);
          }
        });
      });
    }
    for (const blockId of new Set(selections.map(selection => selection.blockId)))
      reasons.push({ decisionId: decision?.id ?? `restore:${entry.revision}`, blockId,
        selections: selections.filter(selection => selection.blockId === blockId), text, feedbackIds });
  }
  return { reasons, warnings: [...new Set(warnings)] };
}

export function wordComments(paper: Paper, baselineRevision: number, revision: number, includeReasons: boolean) {
  const scoped = { ...paper, revision, document: documentAt(paper, revision).toJSON(), history: paper.history.slice(0, revision) };
  const { reasons, warnings } = includeReasons ? wordReasons(scoped, baselineRevision) : { reasons: [], warnings: [] };
  const comments: { blockIds: string[]; text?: string; nativeId?: string }[] = includeReasons
    ? reasons.map(reason => ({ blockIds: [reason.blockId], text: reason.text })) : [];
  const native = paper.feedback.filter(item => item.wordCommentId !== undefined);
  const linked = native.length ? wordReasons(scoped, 0).reasons : [];
  const order = new Map<string, number>();
  documentAt(scoped, revision).forEach((node, position) => order.set(node.attrs.id, position));
  for (const feedback of native) {
    if (feedback.target.kind !== "source") throw new Error("A native Word comment must retain source feedback.");
    const blockIds = new Set<string>();
    for (const selection of feedback.target.selections) {
      try { blockIds.add(mapSelection(scoped, selection).blockId); }
      catch {
        const transferred = linked.filter(reason => reason.feedbackIds.includes(feedback.id));
        if (!transferred.length) throw new Error("An original Word comment overlaps an edit without a linked accepted reason. Link that feedback to the change or review its location before export; the original file is retained.");
        transferred.forEach(reason => blockIds.add(reason.blockId));
      }
    }
    comments.push({ nativeId: feedback.wordCommentId, blockIds: [...blockIds].sort((a, b) => order.get(a)! - order.get(b)!) });
  }
  return { comments, warnings: includeReasons ? warnings : [] };
}
