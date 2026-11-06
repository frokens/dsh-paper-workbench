import * as React from "react";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  Selection,
  UiRequest,
  translationSelectionSchema,
} from "./contracts.js";
import type { z } from "zod";
import type { paperView, previewAcceptance, compareRevision } from "./model.js";
import { remoteInfo } from "./remote.js";
import type { readingPacket, readingViews } from "./reading.js";

type PaperView = ReturnType<typeof paperView> & { readings: ReturnType<typeof readingViews> };
type View = {
  paper: PaperView | null;
  available: { id: string; name: string }[];
  reading?: ReturnType<typeof readingPacket>;
};
type Reply = View & {
  base64?: string;
  name?: string;
  preview?: ReturnType<typeof previewAcceptance>;
  comparison?: ReturnType<typeof compareRevision>;
};
type Picked =
  | { kind: "source"; value: Selection }
  | { kind: "translation"; value: z.infer<typeof translationSelectionSchema> };
type Props = {
  sessionId: SessionId;
  call: (
    sessionId: SessionId,
    request: object,
    signal: AbortSignal,
  ) => Promise<Reply>;
  observe: (sessionId: SessionId, signal: AbortSignal) => AsyncIterable<View>;
  t: (key: string) => string;
};
export const inject = ["sidebarRightTabs", "slots", "locale", "remote"];
const id = "dsh-paper-workbench";
const en = {
  title: "Paper workbench",
  description: "Read, annotate and decide paper revisions in this task",
  refresh: "Refresh",
  loading: "Connecting…",
  live: "Saved changes are live",
  offline: "Connection ended. Refresh to reconnect.",
  empty: "No paper is linked to this task.",
  scope: "Import a DOCX or link an existing paper in this conversation.",
  upload: "Import DOCX",
  link: "Link paper",
  choose: "Choose a paper",
  revisionMode: "Existing Word revisions",
  requireChoice: "Ask before resolving",
  acceptExisting: "Accept existing revisions",
  rejectExisting: "Reject existing revisions",
  reading: "Reading",
  proposals: "Changes",
  feedback: "Feedback",
  history: "History",
  select:
    "Select source or Chinese text to annotate it. Click a source cursor to split a paragraph.",
  source: "Source",
  translation: "Chinese projection",
  selected: "Selected text",
  replacement: "Replacement",
  reason: "Reason",
  propose: "Save candidate",
  comment: "Content feedback",
  saveFeedback: "Save feedback",
  correction: "Correct translation wording only",
  content: "Suggest a content change",
  correct: "Save translation correction",
  translationScope:
    "Content feedback refers to the whole aligned source group shown below; it does not infer a word-for-word alignment.",
  readyTranslation: "Prepare translation for this paragraph",
  translateAll: "Prepare translation for current body",
  jobs: "Translation requests",
  send: "Send to current Agent (uses model)",
  sent: "Sent to current Agent",
  ready: "Ready to send",
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  undone: "Undone",
  completed: "Completed",
  cancelled: "Cancelled",
  superseded: "Superseded",
  stale: "Source changed",
  current: "Current",
  preview: "Review acceptance scope",
  previewAll: "Review all pending",
  previewSelected: "Review selected",
  acceptScope: "Accept displayed scope",
  rejectSelected: "Reject selected",
  rejectAll: "Reject all pending",
  reject: "Reject",
  dependencies: "Required groups included",
  conflicts: "Needs new selection",
  noChanges: "No candidates yet.",
  independent: "Independent reading checks a supplied candidate combination; the user still decides.",
  readings: "Independent reading",
  createDraft: "Start from research materials",
  draftName: "Draft name",
  brief: "Writing goal and research material references",
  saveDraft: "Create draft and save writing goal",
  readingGoal: "Reading goal",
  readingEvidence: "Evidence and context for the independent reader",
  readAll: "Read all pending candidates (uses model)",
  readSelected: "Read selected candidates (uses model)",
  readCurrent: "Read current accepted body (uses model)",
  recheck: "Recheck current body (uses model)",
  noReadings: "No independent reading has been requested.",
  readingLimit: "A fresh session isolates conversation history; it does not guarantee factual correctness.",
  partialReading: "The current accepted combination differs from this reading. Its historical findings remain available; the new combination needs a recheck.",
  combinationChanged: "The pending combination no longer matches the reviewed material.",
  interpretation: "Reader interpretation",
  evidenceLimits: "Evidence limits",
  readingSource: "Independent session source",
  readingScope: "Reviewed candidate groups",
  bodyOnlyReading: "This reading covers the accepted body without pending candidates.",
  frozenReading: "Frozen reading material",
  frozenReadingScope: "This session reads the saved candidate combination. Make paper decisions in the writing task.",
  baselineBody: "Baseline body",
  candidateBody: "Proposed body",
  submittedDirections: "Submitted user directions",
  draftParagraphs: "Draft paragraphs",
  unfinishedReading: "This reading has no completed valid result yet.",
  bilingualChanged: "The following Chinese input changed and needs a bilingual recheck; unchanged source evidence is retained.",
  sourceEvidenceRetained: "The source-language body still matches the completed reading. This does not cover changed Chinese wording.",
  queued: "Queued",
  running: "Reading in progress",
  failed: "Failed",
  interrupted: "Interrupted; explicit restart required",
  undo: "Undo decision",
  revision: "Revision",
  baseline:
    "Word revisions compare the accepted body with the imported baseline. Workbench acceptance keeps that comparison.",
  exportTracked: "Export tracked DOCX",
  exportClean: "Export clean DOCX",
  unsupported: "Preserved read only",
  cancel: "Cancel request",
  busy: "Saving…",
  locate: "Locate source",
  draft: "Unsubmitted feedback",
  batch: "Save feedback batch",
  direction: "Direction for this batch",
  batches: "Submitted batches",
  linkedFeedback: "Linked feedback",
  compare: "Compare with current body",
  restore: "Restore this reviewed revision",
  noDifference:
    "No visible body differences. Restoring this version also restores its comparison with the original.",
  formatChanged: "Formatting or structure changed",
  split: "Propose paragraph split",
  merge: "Propose merge with next paragraph",
  structural: "Paragraph operation",
  exactRange:
    "Choose text within one editable source paragraph or one translation group.",
  changed:
    "The paper changed. Select the current text again; your draft is retained.",
  noTranslation: "No current Chinese projection for this source.",
  copiedScope: "This scope is atomic; necessary dependencies are included.",
  restoreBeforeExport:
    "An earlier restoration needs its intended comparison restored before Word export. Choose that historical version in History and restore it explicitly; the existing records are retained.",
};
const zh: typeof en = {
  title: "论文工作台",
  description: "在当前任务阅读、批注和审阅论文修改",
  refresh: "刷新",
  loading: "连接中…",
  live: "已保存的修改实时同步",
  offline: "连接已结束，请刷新重连。",
  empty: "当前任务尚未关联论文。",
  scope: "在当前对话中导入 DOCX 或关联已有论文。",
  upload: "导入 DOCX",
  link: "关联论文",
  choose: "选择论文",
  revisionMode: "原有 Word 修订",
  requireChoice: "处理前询问",
  acceptExisting: "接受原有修订",
  rejectExisting: "拒绝原有修订",
  reading: "阅读",
  proposals: "候选修改",
  feedback: "反馈",
  history: "历史",
  select: "选择原文或中文译文添加批注；点击原文中的位置可提出拆段。",
  source: "主语言正文",
  translation: "中文译文",
  selected: "所选文字",
  replacement: "替换内容",
  reason: "修改理由",
  propose: "保存候选",
  comment: "正文内容反馈",
  saveFeedback: "保存反馈",
  correction: "只纠正译文措辞",
  content: "提出正文内容修改",
  correct: "保存译文纠正",
  translationScope: "内容反馈关联下方整个原文句群，不推断逐字对应。",
  readyTranslation: "准备本段翻译",
  translateAll: "准备当前正文翻译",
  jobs: "翻译请求",
  send: "发送到当前 Agent（调用模型）",
  sent: "已发送到当前 Agent",
  ready: "待发送",
  pending: "待处理",
  accepted: "已接受",
  rejected: "已拒绝",
  undone: "已撤销",
  completed: "已完成",
  cancelled: "已取消",
  superseded: "已被替代",
  stale: "来源已变化",
  current: "当前有效",
  preview: "审阅接受范围",
  previewAll: "审阅全部待处理",
  previewSelected: "审阅所选",
  acceptScope: "接受所示范围",
  rejectSelected: "拒绝所选",
  rejectAll: "拒绝全部待处理",
  reject: "拒绝",
  dependencies: "同时包含必要依赖组",
  conflicts: "需要重新定位",
  noChanges: "尚无候选修改。",
  independent: "独立审读针对准确候选组合；是否接受仍由用户决定。",
  readings: "独立审读",
  createDraft: "从研究材料开始",
  draftName: "稿件名称",
  brief: "写作目标与研究材料位置",
  saveDraft: "创建稿件并保存写作目标",
  readingGoal: "审读目标",
  readingEvidence: "提供给独立读者的事实依据与上下文",
  readAll: "审读全部待处理候选（调用模型）",
  readSelected: "审读所选候选（调用模型）",
  readCurrent: "审读当前已接收正文（调用模型）",
  recheck: "复核当前正文组合（调用模型）",
  noReadings: "尚未请求独立审读。",
  readingLimit: "新会话隔离写作者对话；不保证事实一定正确。",
  partialReading: "当前已接收组合与本次审读材料不同。原意见保留，新组合需要复核。",
  combinationChanged: "待处理候选组合已不同于原审读材料。",
  interpretation: "读者理解",
  evidenceLimits: "证据限制",
  readingSource: "独立会话来源",
  readingScope: "本次覆盖的候选组",
  bodyOnlyReading: "本次仅审读已接收正文，不含待处理候选。",
  frozenReading: "冻结审读材料",
  frozenReadingScope: "此会话只读已保存的候选组合。请在写作任务中决定是否接受修改。",
  baselineBody: "基准正文",
  candidateBody: "候选正文",
  submittedDirections: "用户已提交方向",
  draftParagraphs: "首稿段落",
  unfinishedReading: "本次审读尚无已完成的有效结果。",
  bilingualChanged: "下列中文输入已变，需要复核双语含义；未受影响的原文证据仍保留。",
  sourceEvidenceRetained: "主语言正文仍与已完成审读一致；此结论不覆盖改变后的中文措辞。",
  queued: "等待启动",
  running: "正在审读",
  failed: "审读失败",
  interrupted: "已中断，需要明确重新启动",
  undo: "撤销决定",
  revision: "正文版本",
  baseline:
    "Word 修订比较已接受正文与导入基准。在工作台接受后，导出仍保留差异。",
  exportTracked: "导出修订 DOCX",
  exportClean: "导出干净 DOCX",
  unsupported: "原样保留且只读",
  cancel: "取消本次请求",
  busy: "保存中…",
  locate: "定位原文",
  draft: "待提交反馈",
  batch: "保存反馈批次",
  direction: "本批整体方向",
  batches: "已提交批次",
  linkedFeedback: "关联反馈",
  compare: "与当前正文比较",
  restore: "恢复到已审阅的此版本",
  noDifference: "正文内容没有可见差异；仍可恢复此版本对应的原稿修订关系。",
  formatChanged: "格式或结构发生变化",
  split: "提出拆段候选",
  merge: "提出与下一段合并",
  structural: "段落操作",
  exactRange: "请在同一可编辑原文段落或一个译文句群中选择文字。",
  changed: "正文已更新，请重新选择当前文字；草稿仍保留。",
  noTranslation: "此原文尚无当前有效的中文译文。",
  copiedScope: "所示范围将整体处理，已包含必要依赖。",
  restoreBeforeExport:
    "较早的恢复记录缺少准确的 Word 修订来源。请在历史中选择原本要恢复的版本并明确恢复后再导出；已有记录仍会保留。",
};
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    paperWorkbench: keyof typeof en;
  }
}

function download(base64: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Diff({ parts }: { parts: { kind: string; text: string }[] }) {
  return (
    <div className="pw-diff">
      {parts.map((part, i) =>
        part.kind === "insert" ? (
          <ins key={i}>{part.text}</ins>
        ) : part.kind === "delete" ? (
          <del key={i}>{part.text}</del>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}
function FrozenReading({ packet, t }: { packet: ReturnType<typeof readingPacket>; t: Props["t"] }) {
  return <article className="pw-review">
    <h2>{t("frozenReading")}</h2>
    <p>{t("frozenReadingScope")}</p>
    <p className="pw-muted">{t("revision")} {packet.sourceRevision}</p>
    <h3>{t("readingGoal")}</h3><p>{packet.goal}</p>
    <h3>{t("brief")}</h3><p>{packet.brief}</p>
    <h3>{t("readingEvidence")}</h3><p>{packet.evidence}</p>
    {!!packet.directions.length && <><h3>{t("submittedDirections")}</h3>{packet.directions.map(direction =>
      <blockquote key={direction.batchId}><small>{t("revision")} {direction.revision}</small><p>{direction.direction}</p></blockquote>,
    )}</>}
    {!!packet.feedback.length && <><h3>{t("linkedFeedback")}</h3>{packet.feedback.map(feedback =>
      <blockquote key={feedback.id}>{feedback.comment}</blockquote>,
    )}</>}
    {packet.warnings.map((warning, index) => <p className="pw-muted" key={index}>{warning}</p>)}
    <details><summary>{t("baselineBody")}</summary>{packet.baselineBlocks.map(block =>
      <p className="pw-source" key={block.id}>{block.text}</p>,
    )}</details>
    <h3>{t("candidateBody")}</h3>
    {packet.candidateBlocks.map(block => <div key={block.id} className="pw-pair">
      <p className="pw-source">{block.text}</p>
      <div>{packet.candidateTranslations.filter(translation => translation.state === "current"
        && translation.mappedSources[0]?.blockId === block.id).map(translation =>
        <blockquote key={translation.id}>{translation.text}</blockquote>,
      )}</div>
    </div>)}
  </article>;
}
function Workbench({ sessionId, call, observe, t }: Props) {
  const [view, setView] = React.useState<View>();
  const [error, setError] = React.useState(""),
    [busy, setBusy] = React.useState(false),
    [connected, setConnected] = React.useState(false),
    [refresh, setRefresh] = React.useState(0);
  const [tab, setTab] = React.useState("reading"),
    [picked, setPicked] = React.useState<Picked>(),
    [replacement, setReplacement] = React.useState(""),
    [reason, setReason] = React.useState(""),
    [comment, setComment] = React.useState("");
  const [intent, setIntent] = React.useState("content"),
    [mode, setMode] = React.useState(""),
    [linked, setLinked] = React.useState(""),
    [direction, setDirection] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]),
    [preview, setPreview] = React.useState<Reply["preview"]>(),
    [comparison, setComparison] = React.useState<Reply["comparison"]>(),
    [compareAt, setCompareAt] = React.useState(0);
  const [newName, setNewName] = React.useState("New draft.docx"),
    [newBrief, setNewBrief] = React.useState(""),
    [readingGoal, setReadingGoal] = React.useState(""),
    [readingEvidence, setReadingEvidence] = React.useState("");
  const controller = React.useRef<AbortController | undefined>(undefined),
    body = React.useRef<HTMLDivElement>(null);
  const paper = view?.paper;
  React.useEffect(() => {
    const stream = new AbortController();
    setConnected(false);
    setError("");
    void (async () => {
      try {
        for await (const state of observe(sessionId, stream.signal)) {
          if (stream.signal.aborted) break;
          setView(state);
          setConnected(true);
        }
        if (!stream.signal.aborted) setConnected(false);
      } catch (e) {
        if (!stream.signal.aborted) {
          setConnected(false);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => stream.abort();
  }, [sessionId, observe, refresh]);
  React.useEffect(() => {
    setView(undefined);
    setPicked(undefined);
    setSelected([]);
    setPreview(undefined);
    setComparison(undefined);
    setReadingGoal("");
    setReadingEvidence("");
    return () => controller.current?.abort();
  }, [sessionId]);
  const previous = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const version = paper ? `${paper.id}:${paper.revision}` : undefined;
    if (previous.current && previous.current !== version) {
      setPicked(undefined);
      setPreview(undefined);
      setComparison(undefined);
    }
    previous.current = version;
  }, [paper?.id, paper?.revision]);

  async function run(request: object): Promise<Reply | undefined> {
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const response = await call(sessionId, request, active.signal);
      if (active.signal.aborted) return;
      if (response.base64) download(response.base64, response.name!);
      if (response.preview) setPreview(response.preview);
      if (response.comparison) setComparison(response.comparison);
      return response;
    } catch (e) {
      if (!active.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (controller.current === active) setBusy(false);
    }
  }
  async function requestReading(candidateIds: string[] | "all", replaces?: string) {
    if (!paper) return;
    const earlier = paper.readings.find(reading => reading.id === replaces);
    await run({ action: "read_independently", requestId: crypto.randomUUID(), candidateIds,
      goal: readingGoal.trim() || earlier?.goal || paper.brief || "Assess the supplied paper's argument, feedback intent, evidence and bilingual meaning.",
      evidence: readingEvidence.trim() ? readingEvidence : earlier?.evidence ?? "", ...(replaces ? { replaces } : {}) });
    setTab("readings");
  }
  function capture(event: React.SyntheticEvent<HTMLDivElement>) {
    const selectedText = window.getSelection();
    if (!selectedText || !paper || !selectedText.rangeCount) return;
    const range = selectedText.getRangeAt(0),
      start =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
    const end =
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? (range.endContainer as Element)
        : range.endContainer.parentElement;
    const element = start?.closest("[data-paper-block],[data-translation]");
    if (!element || !event.currentTarget.contains(element)) return;
    if (element !== end?.closest("[data-paper-block],[data-translation]")) {
      setError(t("exactRange"));
      return;
    }
    const prefix = document.createRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(range.startContainer, range.startOffset);
    const from = prefix.toString().length,
      quote = range.toString();
    const blockId = element.getAttribute("data-paper-block");
    if (blockId) {
      const block = paper.blocks.find((b) => b.id === blockId);
      if (
        !block?.editable ||
        block.text.slice(from, from + quote.length) !== quote
      ) {
        setError(t("exactRange"));
        return;
      }
      setPicked({
        kind: "source",
        value: { ...block.selection, from, to: from + quote.length, quote },
      });
    } else {
      const translation = paper.translations.find(
        (tr) => tr.id === element.getAttribute("data-translation"),
      );
      if (
        !translation ||
        translation.state !== "current" ||
        translation.text.slice(from, from + quote.length) !== quote
      ) {
        setError(t("changed"));
        return;
      }
      setPicked({
        kind: "translation",
        value: {
          translationId: translation.id,
          version: translation.version,
          from,
          to: from + quote.length,
          quote,
        },
      });
    }
    setReplacement(quote);
    setError("");
  }
  async function upload(file: File) {
    if (file.size > 16 * 1024 * 1024) {
      setError("DOCX exceeds 16 MiB.");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await run({
      action: "import",
      name: file.name,
      base64: btoa(binary),
      ...(mode ? { revisionMode: mode } : {}),
    });
  }
  function locate(ids: string[]) {
    setTab("reading");
    requestAnimationFrame(() => {
      const element = [
        ...(body.current?.querySelectorAll<HTMLElement>("[data-source-card]") ??
          []),
      ].find((el) => ids.includes(el.dataset.sourceCard!));
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus();
    });
  }
  const pending = paper?.candidates.filter((c) => c.status === "pending") ?? [];
  const draft =
    paper?.feedback.filter(
      (f) => !paper.batches.some((batch) => batch.feedbackIds.includes(f.id)),
    ) ?? [];
  const translationPicked =
    picked?.kind === "translation"
      ? paper?.translations.find((tr) => tr.id === picked.value.translationId)
      : undefined;
  const selectedSource =
    picked?.kind === "source"
      ? paper?.blocks.find((block) => block.id === picked.value.blockId)
      : undefined;
  const nextBlock =
    selectedSource && paper?.blocks[paper.blocks.indexOf(selectedSource) + 1];
  async function saveProposal(kind: "replace" | "split" | "merge") {
    if (picked?.kind !== "source" || !paper) return;
    const operation =
      kind === "replace"
        ? { kind, selection: picked.value, replacement }
        : kind === "split"
          ? { kind, selection: picked.value }
          : {
              kind,
              selection: selectedSource!.selection,
              next: nextBlock!.selection,
              separator: " ",
            };
    if (
      await run({
        action: "propose",
        requestId: crypto.randomUUID(),
        operations: [operation],
        reason,
      })
    ) {
      setPicked(undefined);
      setReason("");
      setTab("proposals");
    }
  }
  function requestTranslation(sources: Selection[]) {
    return run({
      action: "request_translation",
      requestId: crypto.randomUUID(),
      sources,
      replaces:
        paper?.translations
          .filter(
            (tr) =>
              !tr.replacedBy &&
              tr.sources.every((source) =>
                sources.some(
                  (s) =>
                    s.blockId === source.blockId &&
                    s.from <= source.from &&
                    s.to >= source.to,
                ),
              ),
          )
          .map((tr) => tr.id) ?? [],
    });
  }
  return (
    <section className="paper-workbench" aria-label={t("title")}>
      <style>{`.paper-workbench{height:100%;display:flex;flex-direction:column;box-sizing:border-box;color:inherit;font:14px/1.6 inherit;--pw-line:color-mix(in srgb,currentColor 15%,transparent);--pw-soft:color-mix(in srgb,currentColor 4%,transparent)}.paper-workbench *{box-sizing:border-box}.paper-workbench button,.paper-workbench select,.paper-workbench textarea{font:inherit;color:inherit;border:1px solid var(--pw-line);border-radius:7px;background:transparent;padding:6px 10px;max-width:100%}.paper-workbench button{cursor:pointer}.paper-workbench button:disabled{opacity:.45;cursor:default}.paper-workbench button:focus-visible,.paper-workbench textarea:focus-visible,.paper-workbench select:focus-visible,.paper-workbench article:focus-visible{outline:2px solid #688bb8;outline-offset:2px}.paper-workbench .pw-head{padding:14px 16px 8px;border-bottom:1px solid var(--pw-line)}.paper-workbench .pw-scroll{overflow:auto;flex:1;padding:8px 16px 24px}.paper-workbench .pw-actions{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:10px 0}.paper-workbench .pw-tabs button[aria-selected=true]{background:var(--pw-soft);font-weight:600}.paper-workbench label{display:block;margin:9px 0}.paper-workbench textarea{display:block;width:100%;min-height:76px}.paper-workbench article{border:1px solid var(--pw-line);border-radius:9px;padding:12px;margin:12px 0}.paper-workbench .pw-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:18px}.paper-workbench .pw-source{font:16px/1.8 Georgia,'Times New Roman',serif;white-space:pre-wrap}.paper-workbench .pw-chinese,.paper-workbench .pw-diff{white-space:pre-wrap;overflow-wrap:anywhere}.paper-workbench .pw-muted{opacity:.65;font-size:12px}.paper-workbench .pw-error{border:1px solid #ad5858;border-radius:8px;padding:10px;white-space:pre-wrap}.paper-workbench .pw-review{border:1px solid #688bb8;padding:12px;border-radius:9px;background:var(--pw-soft)}.paper-workbench ins{background:#66b88922;text-decoration:underline;text-decoration-thickness:2px}.paper-workbench del{background:#ce686822;text-decoration:line-through}.paper-workbench blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #8296b4;white-space:pre-wrap}.paper-workbench h2{font-size:17px;margin:4px 0}.paper-workbench h3{font-size:14px;margin:10px 0}.paper-workbench .pw-primary{border-color:#688bb8;font-weight:600}.paper-workbench .pw-tag{display:inline-block;border:1px solid var(--pw-line);border-radius:4px;padding:0 5px;font-size:11px;margin-right:5px}.paper-workbench .pw-stale{opacity:.65}.paper-workbench summary{cursor:pointer}`}</style>
      <header className="pw-head">
        <h2>{paper?.name ?? view?.reading?.paper.name ?? t("title")}</h2>
        <div className="pw-actions">
          <span className="pw-muted" role="status">
            {view ? (connected ? t("live") : t("offline")) : t("loading")}
            {paper ? ` · ${t("revision")} ${paper.revision}` : ""}
          </span>
          <button disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
            {t("refresh")}
          </button>
          {busy && (
            <>
              <span role="status">{t("busy")}</span>
              <button onClick={() => controller.current?.abort()}>
                {t("cancel")}
              </button>
            </>
          )}
        </div>
        {paper && (
          <nav className="pw-actions pw-tabs" aria-label={t("title")}>
            {["reading", "proposals", "feedback", "readings", "history"].map((key) => (
              <button
                key={key}
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {t(key)}
                {key === "proposals"
                  ? ` ${pending.length}`
                  : key === "feedback"
                    ? ` ${draft.length}`
                    : ""}
              </button>
            ))}
          </nav>
        )}
      </header>
      <div className="pw-scroll" ref={body}>
        {error && (
          <p role="alert" className="pw-error">
            {error}
          </p>
        )}
        {view?.reading && <FrozenReading packet={view.reading} t={t} />}
        {!paper && view && !view.reading && (
          <>
            <h2>{t("empty")}</h2>
            <p>{t("scope")}</p>
          </>
        )}
        {!view?.reading && <details open={!paper}>
          <summary>
            {t("upload")} / {t("link")} / {t("createDraft")}
          </summary>
          <label>{t("draftName")}<input aria-label={t("draftName")} value={newName} onChange={e => setNewName(e.target.value)} /></label>
          <label>{t("brief")}<textarea value={newBrief} onChange={e => setNewBrief(e.target.value)} /></label>
          <button disabled={busy || !newName.trim()} onClick={() => void (async () => {
            if (await run({ action: "create", name: newName.trim(), brief: newBrief })) setTab("feedback");
          })()}>{t("saveDraft")}</button>
          <label>
            {t("revisionMode")}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">{t("requireChoice")}</option>
              <option value="accept">{t("acceptExisting")}</option>
              <option value="reject">{t("rejectExisting")}</option>
            </select>
          </label>
          <label>
            {t("upload")}
            <input
              type="file"
              aria-label={t("upload")}
              accept=".docx"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
          {!!view?.available.length && (
            <div className="pw-actions">
              <select
                aria-label={t("link")}
                value={linked}
                onChange={(e) => setLinked(e.target.value)}
              >
                <option value="">{t("choose")}</option>
                {view.available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!linked || busy}
                onClick={() => void run({ action: "link", paperId: linked })}
              >
                {t("link")}
              </button>
            </div>
          )}
        </details>}
        {paper && (
          <>
            {paper.warnings.map((warning, i) => (
              <p className="pw-muted" key={i}>
                {warning}
              </p>
            ))}
            {paper.wordExportNeedsRestore && (
              <p className="pw-error">
                {t("restoreBeforeExport")}{" "}
                <button onClick={() => setTab("history")}>
                  {t("history")}
                </button>
              </p>
            )}
            {tab === "reading" && (
              <>
                <p className="pw-muted">{t("select")}</p>
                <button
                  disabled={
                    busy || paper.blocks.filter((b) => b.editable).length > 100
                  }
                  onClick={() =>
                    void requestTranslation(
                      paper.blocks
                        .filter((b) => b.editable)
                        .map((b) => b.selection),
                    )
                  }
                >
                  {t("translateAll")}
                </button>
                <div onMouseUp={capture} onKeyUp={capture}>
                  {paper.blocks.map((block) => (
                    <article
                      key={block.id}
                      data-source-card={block.id}
                      tabIndex={-1}
                    >
                      <div className="pw-pair">
                        <div>
                          <span className="pw-muted">{t("source")}</span>
                          <div
                            className="pw-source"
                            data-paper-block={block.id}
                            style={
                              block.heading ? { fontWeight: 600 } : undefined
                            }
                          >
                            {block.editable
                              ? block.runs.map((run, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      fontWeight: run.marks.includes("bold")
                                        ? 700
                                        : undefined,
                                      fontStyle: run.marks.includes("italic")
                                        ? "italic"
                                        : undefined,
                                    }}
                                  >
                                    {run.text}
                                  </span>
                                ))
                              : block.text}
                          </div>
                          {!block.editable && (
                            <small>
                              {t("unsupported")}: {block.reason}
                            </small>
                          )}
                          {block.editable && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void requestTranslation([block.selection])
                              }
                            >
                              {t("readyTranslation")}
                            </button>
                          )}
                        </div>
                        <div>
                          <span className="pw-muted">{t("translation")}</span>
                          {paper.translations
                            .filter(
                              (tr) =>
                                tr.state !== "superseded" &&
                                (tr.state === "current"
                                  ? tr.mappedSources[0]
                                  : tr.sources[0]
                                )?.blockId === block.id,
                            )
                            .map((tr) => (
                              <div
                                key={tr.id}
                                className={
                                  tr.state === "stale" ? "pw-stale" : ""
                                }
                              >
                                <span className="pw-tag">{t(tr.state)}</span>
                                <div
                                  className="pw-chinese"
                                  data-translation={tr.id}
                                >
                                  {tr.text}
                                </div>
                                <div className="pw-actions">
                                  <button
                                    onClick={() =>
                                      locate(
                                        (tr.state === "current"
                                          ? tr.mappedSources
                                          : tr.sources
                                        ).map((s) => s.blockId),
                                      )
                                    }
                                  >
                                    {t("locate")} · {tr.sources.length}
                                  </button>
                                </div>
                              </div>
                            ))}
                          {!paper.translations.some(
                            (tr) =>
                              tr.state === "current" &&
                              tr.mappedSources.some(
                                (s) => s.blockId === block.id,
                              ),
                          ) && <p className="pw-muted">{t("noTranslation")}</p>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {picked && (
                  <article className="pw-review">
                    <h3>{t("selected")}</h3>
                    <blockquote>{picked.value.quote || "│"}</blockquote>
                    {picked.kind === "translation" && (
                      <>
                        <div className="pw-actions">
                          <button
                            aria-pressed={intent === "content"}
                            onClick={() => setIntent("content")}
                          >
                            {t("content")}
                          </button>
                          <button
                            aria-pressed={intent === "correction"}
                            onClick={() => setIntent("correction")}
                          >
                            {t("correction")}
                          </button>
                        </div>
                        {intent === "content" && (
                          <>
                            <p className="pw-muted">{t("translationScope")}</p>
                            {translationPicked?.mappedSources.map(
                              (source, i) => (
                                <blockquote key={i}>{source.quote}</blockquote>
                              ),
                            )}
                          </>
                        )}
                      </>
                    )}
                    {(picked.kind === "source" || intent === "content") && (
                      <>
                        <label>
                          {t("comment")}
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                        </label>
                        <button
                          disabled={busy || !comment.trim()}
                          onClick={() =>
                            void (async () => {
                              if (
                                await run({
                                  action: "feedback",
                                  requestId: crypto.randomUUID(),
                                  target:
                                    picked.kind === "source"
                                      ? {
                                          kind: "source",
                                          selections: [picked.value],
                                        }
                                      : {
                                          kind: "translation",
                                          selection: picked.value,
                                        },
                                  comment,
                                })
                              ) {
                                setPicked(undefined);
                                setComment("");
                              }
                            })()
                          }
                        >
                          {t("saveFeedback")}
                        </button>
                      </>
                    )}
                    {(picked.kind === "source" || intent === "correction") && (
                      <>
                        <label>
                          {t("replacement")}
                          <textarea
                            value={replacement}
                            onChange={(e) => setReplacement(e.target.value)}
                          />
                        </label>
                        {picked.kind === "translation" ? (
                          <button
                            disabled={
                              busy || replacement === picked.value.quote
                            }
                            onClick={() =>
                              void (async () => {
                                if (
                                  await run({
                                    action: "correct_translation",
                                    selection: picked.value,
                                    replacement,
                                  })
                                )
                                  setPicked(undefined);
                              })()
                            }
                          >
                            {t("correct")}
                          </button>
                        ) : (
                          <>
                            <label>
                              {t("reason")}
                              <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                              />
                            </label>
                            <div className="pw-actions">
                              <button
                                disabled={
                                  busy ||
                                  !reason.trim() ||
                                  replacement === picked.value.quote
                                }
                                onClick={() => void saveProposal("replace")}
                              >
                                {t("propose")}
                              </button>
                              {picked.value.from === picked.value.to && (
                                <button
                                  disabled={busy || !reason.trim()}
                                  onClick={() => void saveProposal("split")}
                                >
                                  {t("split")}
                                </button>
                              )}
                              {nextBlock?.editable && (
                                <button
                                  disabled={busy || !reason.trim()}
                                  onClick={() => void saveProposal("merge")}
                                >
                                  {t("merge")}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </article>
                )}
                <h3>{t("jobs")}</h3>
                {paper.translationJobs.map((job) => (
                  <article key={job.id}>
                    <span className="pw-tag">{t(job.status)}</span>
                    <span>
                      {t("revision")} {job.sourceRevision} ·{" "}
                      {job.sources.length}
                    </span>
                    {job.error && <p className="pw-error">{job.error}</p>}
                    <div className="pw-actions">
                      {job.status === "pending" && (
                        <>
                          <button
                            disabled={busy || job.delivery === "sent"}
                            onClick={() =>
                              void run({
                                action: "send",
                                kind: "translation",
                                id: job.id,
                              })
                            }
                          >
                            {t(job.delivery === "sent" ? "sent" : "send")}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run({
                                action: "cancel_translation",
                                jobId: job.id,
                              })
                            }
                          >
                            {t("cancel")}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </>
            )}
            {tab === "proposals" && (
              <>
                <p className="pw-muted">{t("independent")}</p>
                <button onClick={() => setTab("readings")}>{t("readings")}</button>
                <div className="pw-actions">
                  <button
                    disabled={busy || !pending.length}
                    onClick={() =>
                      void run({ action: "preview", candidateIds: "all" })
                    }
                  >
                    {t("previewAll")}
                  </button>
                  <button
                    disabled={busy || !selected.length}
                    onClick={() =>
                      void run({ action: "preview", candidateIds: selected })
                    }
                  >
                    {t("previewSelected")}
                  </button>
                  <button
                    disabled={busy || !selected.length}
                    onClick={() =>
                      void run({
                        action: "decide",
                        candidateIds: selected,
                        decision: "rejected",
                        expectedRevision: paper.revision,
                      })
                    }
                  >
                    {t("rejectSelected")}
                  </button>
                  <button
                    disabled={busy || !pending.length}
                    onClick={() =>
                      void run({
                        action: "decide",
                        candidateIds: pending.map((c) => c.id),
                        decision: "rejected",
                        expectedRevision: paper.revision,
                      })
                    }
                  >
                    {t("rejectAll")}
                  </button>
                </div>
                {preview && (
                  <article className="pw-review">
                    <h3>{t("preview")}</h3>
                    <p>{t("copiedScope")}</p>
                    {preview.candidateIds.map((candidateId) => (
                      <p key={candidateId}>
                        {
                          paper.candidates.find((c) => c.id === candidateId)
                            ?.reason
                        }
                      </p>
                    ))}
                    {!!preview.includedDependencies.length && (
                      <p>
                        {t("dependencies")}:{" "}
                        {preview.includedDependencies.length}
                      </p>
                    )}
                    {preview.conflicts.map((conflict) => (
                      <p className="pw-error" key={conflict.candidateId}>
                        {t("conflicts")}:{" "}
                        {
                          paper.candidates.find(
                            (c) => c.id === conflict.candidateId,
                          )?.reason
                        }{" "}
                        — {conflict.message}
                      </p>
                    ))}
                    <button
                      className="pw-primary"
                      disabled={
                        busy ||
                        !preview.candidateIds.length ||
                        preview.revision !== paper.revision
                      }
                      onClick={() =>
                        void (async () => {
                          if (
                            await run({
                              action: "decide",
                              candidateIds: preview.candidateIds,
                              decision: "accepted",
                              expectedRevision: preview.revision,
                            })
                          ) {
                            setPreview(undefined);
                            setSelected([]);
                          }
                        })()
                      }
                    >
                      {t("acceptScope")} · {preview.candidateIds.length}
                    </button>
                  </article>
                )}
                {!paper.candidates.length && <p>{t("noChanges")}</p>}
                {paper.candidates.map((candidate) => (
                  <article key={candidate.id} data-candidate={candidate.id}>
                    <div className="pw-actions">
                      {candidate.status === "pending" && (
                        <input
                          type="checkbox"
                          aria-label={candidate.reason}
                          checked={selected.includes(candidate.id)}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked
                                ? [...ids, candidate.id]
                                : ids.filter((id) => id !== candidate.id),
                            )
                          }
                        />
                      )}
                      <span className="pw-tag">{t(candidate.status)}</span>
                      <strong>{candidate.reason}</strong>
                    </div>
                    {candidate.operations.map((operation, i) => (
                      <div key={i}>
                        <span className="pw-muted">
                          {operation.kind === "fill_draft"
                            ? `${t("draftParagraphs")}: ${operation.paragraphs.length}`
                            : operation.kind === "replace"
                            ? t("source")
                            : t("structural")}{" "}
                          · {t("revision")} {operation.selection.revision}
                        </span>
                        <Diff parts={candidate.diffs[i]} />
                      </div>
                    ))}
                    {candidate.translations.map((tr, i) => (
                      <blockquote key={i}>{tr.paragraphIndexes && <small>{t("draftParagraphs")}: {tr.paragraphIndexes.map(index => index + 1).join(", ")}</small>}<p>{tr.text}</p></blockquote>
                    ))}
                    {!!candidate.feedbackIds.length && (
                      <p className="pw-muted">
                        {t("linkedFeedback")}:{" "}
                        {candidate.feedbackIds
                          .map(
                            (id) =>
                              paper.feedback.find((f) => f.id === id)?.comment,
                          )
                          .join(" · ")}
                      </p>
                    )}
                    {candidate.conflict && (
                      <p className="pw-error">{candidate.conflict}</p>
                    )}
                    <div className="pw-actions">
                      <button
                        disabled={!candidate.currentSelections.length}
                        onClick={() =>
                          locate(
                            candidate.currentSelections.map(
                              (selection) => selection.blockId,
                            ),
                          )
                        }
                      >
                        {t("locate")}
                      </button>
                      {candidate.status === "pending" && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run({
                                action: "preview",
                                candidateIds: [candidate.id],
                              })
                            }
                          >
                            {t("preview")}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run({
                                action: "decide",
                                candidateIds: [candidate.id],
                                decision: "rejected",
                                expectedRevision: paper.revision,
                              })
                            }
                          >
                            {t("reject")}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </>
            )}
            {tab === "feedback" && (
              <>
                <h3>{t("draft")}</h3>
                {paper.feedback.map((feedback) => (
                  <article key={feedback.id}>
                    <span className="pw-tag">{t(feedback.state)}</span>
                    <blockquote>
                      {feedback.target.kind === "source"
                        ? feedback.target.selections
                            .map((s) => s.quote)
                            .join("\n")
                        : feedback.target.selection.quote}
                    </blockquote>
                    <p>{feedback.comment}</p>
                    <button
                      onClick={() =>
                        locate(feedback.sources.map((s) => s.blockId))
                      }
                    >
                      {t("locate")}
                    </button>
                  </article>
                ))}
                <label>
                  {t("direction")}
                  <textarea
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !draft.some((f) => f.state === "current")}
                  onClick={() =>
                    void run({
                      action: "submit_batch",
                      requestId: crypto.randomUUID(),
                      feedbackIds: draft
                        .filter((f) => f.state === "current")
                        .map((f) => f.id),
                      direction,
                    })
                  }
                >
                  {t("batch")} ·{" "}
                  {draft.filter((f) => f.state === "current").length}
                </button>
                <h3>{t("batches")}</h3>
                {paper.batches.map((batch) => (
                  <article key={batch.id}>
                    <span className="pw-tag">
                      {t(batch.delivery === "sent" ? "sent" : "ready")}
                    </span>
                    <p>{batch.direction}</p>
                    {batch.feedbackIds.map((id) => (
                      <p key={id}>
                        {paper.feedback.find((f) => f.id === id)?.comment}
                      </p>
                    ))}
                    {batch.error && <p className="pw-error">{batch.error}</p>}
                    <button
                      disabled={busy || batch.delivery === "sent"}
                      onClick={() =>
                        void run({
                          action: "send",
                          kind: "batch",
                          id: batch.id,
                        })
                      }
                    >
                      {t(batch.delivery === "sent" ? "sent" : "send")}
                    </button>
                  </article>
                ))}
              </>
            )}
            {tab === "readings" && (
              <>
                <p className="pw-muted">{t("readingLimit")}</p>
                <label>{t("readingGoal")}<textarea value={readingGoal} onChange={e => setReadingGoal(e.target.value)} placeholder={paper.brief} /></label>
                <label>{t("readingEvidence")}<textarea value={readingEvidence} onChange={e => setReadingEvidence(e.target.value)} /></label>
                <div className="pw-actions">
                  <button disabled={busy || !pending.length} onClick={() => void requestReading("all")}>{t("readAll")}</button>
                  <button disabled={busy || !selected.length} onClick={() => void requestReading(selected)}>{t("readSelected")}</button>
                  <button disabled={busy} onClick={() => void requestReading([])}>{t("readCurrent")}</button>
                </div>
                {!paper.readings.length && <p>{t("noReadings")}</p>}
                {paper.readings.map(reading => <article key={reading.id}>
                  <div className="pw-actions"><span className="pw-tag">{t(reading.status)}</span><span>{t("revision")} {reading.sourceRevision}</span></div>
                  <p>{reading.goal}</p>
                  {reading.candidateIds.length ? <details><summary>{t("readingScope")} · {reading.candidateIds.length}</summary>{reading.candidateIds.map(id => <p key={id}>{paper.candidates.find(candidate => candidate.id === id)?.reason}</p>)}</details> : <p className="pw-muted">{t("bodyOnlyReading")}</p>}
                  {reading.diagnostic && <p role="alert" className="pw-error">{reading.diagnostic}</p>}
                  {(reading.status !== "completed" || !reading.output) && <p className="pw-muted">{t("unfinishedReading")}</p>}
                  {reading.status === "completed" && reading.output && !reading.sourceCombinationMatches && <p className="pw-muted">{t("combinationChanged")}</p>}
                  {reading.status === "completed" && reading.output && !reading.currentSourceReviewed && <p className="pw-muted">{t("partialReading")}</p>}
                  {reading.currentSourceReviewed && !reading.currentBodyReviewed && <p className="pw-muted">{t("sourceEvidenceRetained")}</p>}
                  {!!reading.bilingualChanges.length && <section><p>{t("bilingualChanged")}</p>{reading.bilingualChanges.map(change => <div key={change.key}>
                    <blockquote>{change.beforeText ?? ""} → {change.afterText ?? ""}</blockquote>
                    {!!change.sourceBlockIds.length && <button onClick={() => locate(change.sourceBlockIds)}>{t("locate")}</button>}
                  </div>)}</section>}
                  {reading.output && <>
                    <h3>{t("interpretation")}</h3>
                    <p>{reading.output.interpretation.problem}</p><p>{reading.output.interpretation.mechanism}</p><p>{reading.output.interpretation.feedbackRole}</p>
                    {reading.findings.map((finding, index) => <section key={index}>
                      <h3>{finding.issue}</h3>
                      {finding.locations.map((location, i) => <blockquote key={i}>{location.quote}</blockquote>)}
                      <p>{finding.impact}</p><p>{finding.evidence}</p><p>{finding.suggestion}</p>
                      {finding.sources.length > 0 && <button onClick={() => locate(finding.sources.map(s => s.blockId))}>{t("locate")}</button>}
                      {!finding.sources.length && !!finding.currentCandidateIds.length && <button onClick={() => {
                        setTab("proposals");
                        requestAnimationFrame(() => body.current?.querySelector(`[data-candidate="${CSS.escape(finding.currentCandidateIds[0])}"]`)?.scrollIntoView({ block: "center" }));
                      }}>{t("proposals")}</button>}
                    </section>)}
                    {!!reading.output.limits.length && <><h3>{t("evidenceLimits")}</h3>{reading.output.limits.map((limit, i) => <p key={i}>{limit}</p>)}</>}
                  </>}
                  <details><summary>{t("readingSource")}</summary><code>{reading.childId}</code></details>
                  <div className="pw-actions">
                    {(reading.status === "queued" || reading.status === "running") && <button onClick={() => void run({ action: "cancel_reading", readingId: reading.id })}>{t("cancel")}</button>}
                    {reading.status !== "queued" && reading.status !== "running" && <button disabled={busy} onClick={() => void requestReading([], reading.id)}>{t("recheck")}</button>}
                  </div>
                </article>)}
              </>
            )}
            {tab === "history" && (
              <>
                <div className="pw-actions">
                  <select
                    aria-label={t("revision")}
                    value={compareAt}
                    onChange={(e) => setCompareAt(Number(e.target.value))}
                  >
                    {Array.from({ length: paper.revision + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {t("revision")} {i}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run({ action: "compare", revision: compareAt })
                    }
                  >
                    {t("compare")}
                  </button>
                </div>
                {comparison && (
                  <article className="pw-review">
                    <h3>
                      {t("revision")} {comparison.revision} →{" "}
                      {comparison.currentRevision}
                    </h3>
                    {!comparison.blocks.length && <p>{t("noDifference")}</p>}
                    {comparison.blocks.map((block) => (
                      <div key={block.id}>
                        <Diff parts={block.diff} />
                        {block.formatChanged && <p>{t("formatChanged")}</p>}
                      </div>
                    ))}
                    <button
                      disabled={
                        busy ||
                        comparison.revision === paper.revision ||
                        comparison.currentRevision !== paper.revision
                      }
                      onClick={() =>
                        void run({
                          action: "restore",
                          revision: comparison.revision,
                          expectedRevision: comparison.currentRevision,
                        })
                      }
                    >
                      {t("restore")}
                    </button>
                  </article>
                )}
                {paper.decisions.map((decision) => (
                  <article key={decision.id}>
                    <span className="pw-tag">{t(decision.decision)}</span>
                    <span>
                      {t("revision")} {decision.revision}
                    </span>
                    {decision.candidateIds.map((id) => (
                      <p key={id}>
                        {paper.candidates.find((c) => c.id === id)?.reason}
                      </p>
                    ))}
                    {decision.decision !== "undone" &&
                      !paper.decisions.some(
                        (d) => d.undoOf === decision.id,
                      ) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run({
                              action: "undo",
                              decisionId: decision.id,
                              expectedRevision: paper.revision,
                            })
                          }
                        >
                          {t("undo")}
                        </button>
                      )}
                  </article>
                ))}
              </>
            )}
            <details>
              <summary>
                {t("exportTracked")} / {t("exportClean")}
              </summary>
              <p className="pw-muted">{t("baseline")}</p>
              <div className="pw-actions">
                <button
                  disabled={busy || paper.wordExportNeedsRestore}
                  onClick={() => void run({ action: "export", tracked: true })}
                >
                  {t("exportTracked")}
                </button>
                <button
                  disabled={busy || paper.wordExportNeedsRestore}
                  onClick={() => void run({ action: "export", tracked: false })}
                >
                  {t("exportClean")}
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

export async function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register("paperWorkbench", { en, zh }));
  const t = ctx.locale.bind("paperWorkbench");
  const disposeRemote = await ctx.remote.$mount(remoteInfo);
  ctx.effect(() => disposeRemote);
  ctx.inject(["remote", "remote.paperWorkbench"], (scope) => {
    scope.effect(() =>
      scope.sidebarRightTabs.register({
        id,
        kind: "paper-workbench",
        title: () => t("title"),
        guide: [
          {
            id: "open",
            order: 35,
            title: () => t("title"),
            description: () => t("description"),
            icon: () => <span aria-hidden="true">▤</span>,
          },
        ],
      }),
    );
    async function call(
      sessionId: SessionId,
      request: object,
      signal: AbortSignal,
    ): Promise<Reply> {
      const result = await scope.remote.paperWorkbench.userAction(
        sessionId,
        request as UiRequest,
        signal,
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.value as Reply;
    }
    async function* observe(sessionId: SessionId, signal: AbortSignal) {
      for await (const state of scope.remote.paperWorkbench.observe(
        sessionId,
        signal,
      ))
        yield state as View;
    }
    scope.effect(() =>
      scope.slots.inject("sidebar.right.pane.tab", () =>
        scope.slots.register(
          {
            name: "sidebar.right.pane.tab",
            key: id,
            inject: () => ({ call, observe, t }),
          },
          Workbench,
        ),
      ),
    );
  });
}
