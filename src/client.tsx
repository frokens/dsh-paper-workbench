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
import type { compareReturn } from "./returns.js";
import type { OfficeFontSettings } from "./office-fonts.js";

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
  returnComparison?: ReturnType<typeof compareReturn>;
  pdfFonts?: OfficeFontSettings;
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
  t: (key: keyof typeof en) => string;
};
export const inject = ["sidebarRightTabs", "slots", "locale", "remote"];
const id = "dsh-paper-workbench";
const en = {
  chatDocumentInput: "Attach a document in the main conversation, mention @file, give a path/link, or ask the ordinary Agent to start a draft. The document opens here automatically.",
  translationInConversation: "No current translation is available yet. Ask the ordinary Agent in the main conversation to continue or refresh it.",
  selectForComment: "Select source or translated text, then add a comment. Comments save automatically; submit the round when ready.",
  addComment: "Add comment",
  emptyComment: "A saved comment cannot be blank. Delete it or continue typing.",
  replyPlaceholder: "Reply to this comment",
  saving: "Saving…",
  saved: "Saved",
  notSaved: "Not saved",
  deleteComment: "Delete",
  retrySave: "Retry save",
  reloadComment: "Load saved comment",
  submittedComment: "Submitted",
  resolvedComment: "Resolved discussion",
  resolveComment: "Resolve",
  reopenComment: "Reopen",
  replyComment: "Reply",
  submitRound: "Submit this round of comments",
  submittingRound: "Submitting…",
  retryRound: "Retry this comment submission",
  automaticReading: "Independent reading",
  automaticReadingNotice: "The system starts a fresh independent reader after the writing round completes. Read its findings and limits before deciding.",
  retryReading: "Retry stopped reading",
  commentsInDocument: "Comments and replies stay next to their source. Locate a discussion to continue there.",
  returnInConversation: "Attach a mentor return in the main conversation. The ordinary Agent checks its delivery and compares it with this paper.",
  compareOriginal: "Compare with original",
  useComparisonBaseline: "Use this version for Word comparison",
  clearSelection: "Clear selection",
  exportVariant: "Document version",
  exportFormat: "File format",
  title: "Paper workbench",
  description: "Read, annotate and decide paper revisions in this task",
  refresh: "Refresh",
  loading: "Connecting…",
  live: "Saved changes are live",
  offline: "Connection ended. Refresh to reconnect.",
  empty: "No paper is linked to this task.",
  scope: "Import DOCX or Markdown, or link an existing paper in this conversation.",
  originalSource: "Download original source",
  reading: "Reading",
  proposals: "Changes",
  feedback: "Feedback",
  history: "History",
  source: "Source",
  translation: "Translation",
  language_en: "English",
  language_zh: "Chinese",
  comment: "Content feedback",
  correction: "Correct translation wording only",
  correct: "Save translation correction",
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
  noChanges: "No candidates yet.",
  readings: "Independent reading",
  brief: "Writing goal and research material references",
  readingGoal: "Reading goal",
  readingEvidence: "Evidence and context for the independent reader",
  noReadings: "The system has not started a paper reading yet.",
  bilingualChanged: "Changed translation wording needs a bilingual recheck; the earlier result retains its original scope.",
  sourceEvidenceRetained: "The primary body still matches this reading. Changed translation wording is outside its reviewed scope.",
  restoreBeforeExport: "An earlier restoration needs its intended Word comparison restored. In History, restore the intended revision, even if its visible text is identical; existing records are retained.",
  combinationChanged: "The pending combination no longer matches the reviewed material.",
  interpretation: "Reader interpretation",
  evidenceLimits: "Evidence limits",
  readingSource: "Independent session source",
  frozenReading: "Frozen reading material",
  frozenReadingScope: "This session reads the saved candidate combination. Make paper decisions in the writing task.",
  baselineBody: "Baseline body",
  candidateBody: "Proposed body",
  submittedDirections: "Submitted user directions",
  queued: "Queued",
  running: "Reading in progress",
  failed: "Failed",
  interrupted: "Interrupted; explicit restart required",
  undo: "Undo decision",
  revision: "Revision",
  cleanCopy: "Clean",
  trackedCopy: "Native revisions",
  bilingualCopy: "Bilingual working copy",
  exportFile: "Export file",
  pdfCopy: "PDF is a static reading copy. Use DOCX to accept or reject native Word revisions.",
  pdfFonts: "PDF font settings",
  fontAutomatic: "Automatic font discovery",
  fontFolders: "Font folders (one absolute path per line)",
  fontShared: "These folders apply to all Office PDF previews in this DSH profile. A folder list replaces automatic Office font discovery; missing fonts may be substituted. Fallback preferences and other settings are kept.",
  fontNotes: "Saving rewrites the Office configuration block. Comments inside that settings block may be lost. Closing this form without applying keeps the current settings.",
  fontApply: "Apply shared font settings",
  fontReadAgain: "Applying starts a shared settings save. If the request is cancelled or the connection reloads, read the current settings to confirm the result.",
  unsupported: "Preserved read only",
  cancel: "Cancel request",
  locate: "Locate source",
  linkedFeedback: "Linked feedback",
  compare: "Compare with current body",
  restore: "Restore this reviewed revision",
  exactRange:
    "Choose text within one editable source paragraph or one translation group.",
  changed:
    "The paper changed. Select the current text again; your draft is retained.",
  copiedScope: "This scope is atomic; necessary dependencies are included.",
  accept: "Accepted changes",
};
const zh: typeof en = {
  chatDocumentInput: "请在主对话框上传文档、@文件、提供路径或链接，或直接告诉当前 Agent 从头写作。文档会自动在此打开。",
  translationInConversation: "译文尚未完成或已过期，可在主对话请当前 Agent 继续或刷新。",
  selectForComment: "选择正文或译文后添加批注。批注自动保存，积累完成后提交本轮。",
  addComment: "添加批注",
  emptyComment: "已保存的批注不能为空，请删除或继续填写。",
  replyPlaceholder: "回复此条批注",
  saving: "正在保存…",
  saved: "已保存",
  notSaved: "尚未保存",
  deleteComment: "删除",
  retrySave: "重试保存",
  reloadComment: "载入已保存内容",
  submittedComment: "已提交",
  resolvedComment: "讨论已解决",
  resolveComment: "解决讨论",
  reopenComment: "重新打开",
  replyComment: "回复",
  submitRound: "提交本轮批注",
  submittingRound: "正在提交…",
  retryRound: "重新提交这轮批注",
  automaticReading: "独立审读",
  automaticReadingNotice: "本轮写作候选完成后，系统自动启动新的独立读者。请查看实际问题与证据限度，再决定是否接受。",
  retryReading: "重试中断的审读",
  commentsInDocument: "批注和回复保留在对应原文旁，定位后可继续讨论。",
  returnInConversation: "请在主对话框上传导师返稿，当前 Agent 会核对实际交付版本并继续比较。",
  compareOriginal: "与原稿比较",
  useComparisonBaseline: "以此版本作为 Word 比较基准",
  clearSelection: "取消选区",
  exportVariant: "文档版本",
  exportFormat: "文件格式",
  title: "论文工作台",
  description: "在当前任务阅读、批注和审阅论文修改",
  refresh: "刷新",
  loading: "连接中…",
  live: "已保存的修改实时同步",
  offline: "连接已结束，请刷新重连。",
  empty: "当前任务尚未关联论文。",
  scope: "在当前对话中导入 DOCX 或 Markdown，或关联已有论文。",
  originalSource: "下载原始文件",
  reading: "阅读",
  proposals: "候选修改",
  feedback: "反馈",
  history: "历史",
  source: "主语言正文",
  translation: "译文",
  language_en: "英文",
  language_zh: "中文",
  comment: "正文内容反馈",
  correction: "只纠正译文措辞",
  correct: "保存译文纠正",
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
  noChanges: "尚无候选修改。",
  readings: "独立审读",
  brief: "写作目标与研究材料位置",
  readingGoal: "审读目标",
  readingEvidence: "提供给独立读者的事实依据与上下文",
  noReadings: "系统尚未启动论文审读。",
  bilingualChanged: "译文已变化，需要重新核对两语含义；旧结果保留其原有范围。",
  sourceEvidenceRetained: "主语言正文仍与本次审读一致，变化后的译文不在其已审范围内。",
  restoreBeforeExport: "较早的恢复记录需要重新明确 Word 比较关系。请在历史中恢复本来要恢复的版本，即使可见文字相同；已有记录仍会保留。",
  combinationChanged: "待处理候选组合已不同于原审读材料。",
  interpretation: "读者理解",
  evidenceLimits: "证据限制",
  readingSource: "独立会话来源",
  frozenReading: "冻结审读材料",
  frozenReadingScope: "此会话只读已保存的候选组合。请在写作任务中决定是否接受修改。",
  baselineBody: "基准正文",
  candidateBody: "候选正文",
  submittedDirections: "用户已提交方向",
  queued: "等待启动",
  running: "正在审读",
  failed: "审读失败",
  interrupted: "已中断，需要明确重新启动",
  undo: "撤销决定",
  revision: "正文版本",
  cleanCopy: "干净稿",
  trackedCopy: "原生修订稿",
  bilingualCopy: "中英对照稿",
  exportFile: "导出文件",
  pdfCopy: "PDF 是静态阅读副本；接受或拒绝 Word 原生修订请使用 DOCX。",
  pdfFonts: "PDF 字体设置",
  fontAutomatic: "自动发现字体",
  fontFolders: "字体文件夹（每行一个绝对路径）",
  fontShared: "这些文件夹适用于当前 DSH 配置的所有 Office PDF 预览。指定文件夹会替代自动发现 Office 字体，缺失字体可能被替代；已有回退字体偏好及其他设置会保留。",
  fontNotes: "保存会重写 Office 配置块，该设置块内部的说明注释可能不保留。关闭表单而不应用，会保持当前设置。",
  fontApply: "应用共享字体设置",
  fontReadAgain: "应用会开始保存共享设置；若取消等待或连接重载，请再次读取当前设置确认结果。",
  unsupported: "原样保留且只读",
  cancel: "取消本次请求",
  locate: "定位原文",
  linkedFeedback: "关联反馈",
  compare: "与当前正文比较",
  restore: "恢复到已审阅的此版本",
  exactRange: "请在同一可编辑原文段落或一个译文句群中选择文字。",
  changed: "正文已更新，请重新选择当前文字；草稿仍保留。",
  copiedScope: "所示范围将整体处理，已包含必要依赖。",
  accept: "接收修改",
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
      type: name.toLowerCase().endsWith(".pdf") ? "application/pdf" : /\.docx$/i.test(name)
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : /\.(md|markdown)$/i.test(name) ? "text/markdown;charset=utf-8" : "application/octet-stream",
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
    <p className="pw-muted">{t("source")} · {t(`language_${packet.primaryLanguage}`)} / {t("translation")} · {t(`language_${packet.translationLanguage}`)}</p>
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
type FeedbackTarget = PaperView["feedback"][number]["target"];
type CommentDraft = { id: string; target: FeedbackTarget; replyTo?: string };
type CommentFlush = () => Promise<void>;

function MarkedText({ text, from, to, ranges = [] }: { text: string; from?: number; to?: number; ranges?: { from: number; to: number }[] }) {
  const start = Math.max(0, from ?? 0), end = Math.min(text.length, to ?? 0);
  const marks = [...ranges, ...(start < end ? [{ from: start, to: end }] : [])]
    .map(range => ({ from: Math.max(0, range.from), to: Math.min(text.length, range.to) })).filter(range => range.from < range.to);
  const boundaries = [...new Set([0, text.length, ...marks.flatMap(range => [range.from, range.to])])].sort((a, b) => a - b);
  return <>{boundaries.slice(0, -1).map((left, index) => {
    const right = boundaries[index + 1], content = text.slice(left, right);
    return marks.some(range => range.from < right && range.to > left)
      ? <mark key={left}>{content}</mark> : <React.Fragment key={left}>{content}</React.Fragment>;
  })}</>;
}

function CommentEditor({ draft, record, locked, call, sessionId, t, register, cache, remove, submitted }: {
  draft: CommentDraft; record?: PaperView["feedback"][number]; locked: boolean;
  call: Props["call"]; sessionId: SessionId; t: Props["t"];
  register: (id: string, flush: CommentFlush) => () => void;
  cache: Map<string, string>; remove: (id: string, version: number) => Promise<void>; submitted: boolean;
}) {
  const [text, setText] = React.useState(cache.get(draft.id) ?? record?.comment ?? "");
  const [saving, setSaving] = React.useState(false), [error, setError] = React.useState("");
  const latest = React.useRef(text), saved = React.useRef(record?.comment ?? ""), version = React.useRef(record?.version ?? 0);
  const active = React.useRef(true), pending = React.useRef<Promise<void> | undefined>(undefined);
  const controller = React.useRef<AbortController | undefined>(undefined), currentRecord = React.useRef(record);
  const retry = React.useRef<{ content: string; expectedVersion: number } | undefined>(undefined);
  currentRecord.current = record;
  const flush = React.useCallback((): Promise<void> => {
    if (pending.current) return pending.current;
    if (!retry.current && (latest.current === saved.current || !version.current && !latest.current.trim())) return Promise.resolve();
    const work = (async () => {
      setSaving(true); setError("");
      try {
        while (active.current && (retry.current || latest.current !== saved.current)) {
          const attempt = retry.current ?? { content: latest.current, expectedVersion: version.current };
          const { content } = attempt;
          if (!content.trim()) throw new Error(t("emptyComment"));
          retry.current = attempt;
          const request = new AbortController(); controller.current = request;
          const response = await call(sessionId, { action: "save_feedback", ...draft, expectedVersion: attempt.expectedVersion, comment: content }, request.signal);
          const stored = response.paper?.feedback.find(item => item.id === draft.id);
          if (!stored) throw new Error(t("changed"));
          saved.current = content; version.current = stored.version;
          retry.current = undefined;
          if (cache.get(draft.id) === content) cache.delete(draft.id);
        }
      } catch (failure) {
        if (active.current) setError(failure instanceof Error ? failure.message : String(failure));
        throw failure;
      } finally { if (active.current) setSaving(false); }
    })();
    pending.current = work;
    void work.finally(() => { if (pending.current === work) pending.current = undefined; }).catch(() => {});
    return work;
  }, [draft.id, sessionId, call, register]);
  React.useEffect(() => {
    active.current = true;
    const unregister = register(draft.id, flush);
    if (cache.has(draft.id)) void flush().catch(() => {});
    return () => { active.current = false; unregister(); controller.current?.abort(); };
  }, [draft.id, flush, register]);
  React.useEffect(() => {
    if (!saving && !retry.current && record && latest.current === saved.current && record.version !== version.current) {
      saved.current = record.comment; version.current = record.version; latest.current = record.comment; setText(record.comment);
    }
  }, [record?.version, saving]);
  if (locked) return <div className="pw-comment-text"><p>{record?.comment}</p><small>{t(submitted ? "submittedComment" : "saved")}</small></div>;
  return <div className="pw-comment-editor">
    <textarea aria-label={t("comment")} placeholder={t(draft.replyTo ? "replyPlaceholder" : "comment")}
      value={text} onChange={event => {
        const value = event.target.value; latest.current = value; cache.set(draft.id, value); setText(value);
        void flush().catch(() => {});
      }} onBlur={() => void flush().catch(() => {})} />
    <div className="pw-actions"><small role="status">{t(saving ? "saving" : error || latest.current !== saved.current || retry.current ? "notSaved" : "saved")}</small>
      <button disabled={saving} onClick={() => void remove(draft.id, version.current)}>{t("deleteComment")}</button>
      {error && <><button onClick={() => void flush().catch(() => {})}>{t("retrySave")}</button>
        {currentRecord.current && <button onClick={() => {
          const stored = currentRecord.current!; saved.current = stored.comment; latest.current = stored.comment; version.current = stored.version;
          retry.current = undefined; cache.delete(draft.id); setText(stored.comment); setError("");
        }}>{t("reloadComment")}</button>}</>}
    </div>{error && <p role="alert" className="pw-error">{error}</p>}
  </div>;
}

function Workbench({ sessionId, call, observe, t }: Props) {
  const [view, setView] = React.useState<View>(), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [connected, setConnected] = React.useState(false), [refresh, setRefresh] = React.useState(0);
  const [tab, setTab] = React.useState("reading"), [picked, setPicked] = React.useState<Picked>();
  const [drafts, setDrafts] = React.useState<CommentDraft[]>([]), [submitting, setSubmitting] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]), [preview, setPreview] = React.useState<Reply["preview"]>();
  const [comparison, setComparison] = React.useState<Reply["comparison"]>(), [correction, setCorrection] = React.useState<string>();
  const [variant, setVariant] = React.useState<"clean" | "tracked" | "bilingual">("tracked"), [format, setFormat] = React.useState<"docx" | "pdf">("docx");
  const [pdfFonts, setPdfFonts] = React.useState<OfficeFontSettings>(), [fontFolders, setFontFolders] = React.useState("");
  const controller = React.useRef<AbortController | undefined>(undefined), body = React.useRef<HTMLDivElement>(null);
  const saves = React.useRef(new Map<string, CommentFlush>()), cache = React.useRef(new Map<string, string>());
  const submission = React.useRef<{ requestId: string; feedbackIds: string[]; direction: string; feedbackVersions?: { id: string; version: number }[] } | undefined>(undefined);
  const submittingController = React.useRef<AbortController | undefined>(undefined);
  const paper = view?.paper;
  const register = React.useCallback((key: string, flush: CommentFlush) => {
    saves.current.set(key, flush);
    return () => { if (saves.current.get(key) === flush) saves.current.delete(key); };
  }, []);
  React.useEffect(() => {
    const stream = new AbortController(); setView(undefined); setConnected(false); setError("");
    setPicked(undefined); setDrafts([]); setSelected([]); setPreview(undefined); setComparison(undefined); cache.current.clear(); submission.current = undefined;
    void (async () => {
      try { for await (const state of observe(sessionId, stream.signal)) {
        if (stream.signal.aborted) return;
        setView(state); setConnected(true);
      } } catch (failure) { if (!stream.signal.aborted) { setConnected(false); setError(String(failure)); } }
    })();
    return () => { stream.abort(); controller.current?.abort(); submittingController.current?.abort(); };
  }, [sessionId, observe, refresh]);
  const prior = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const version = paper ? `${paper.id}:${paper.revision}` : undefined;
    if (prior.current && prior.current !== version) { setPicked(undefined); setPreview(undefined); setComparison(undefined); }
    prior.current = version;
  }, [paper?.id, paper?.revision]);
  async function run(request: object, outerSignal?: AbortSignal) {
    const active = new AbortController(); controller.current?.abort(); controller.current = active; setBusy(true); setError("");
    try {
      const response = await call(sessionId, request, outerSignal ? AbortSignal.any([active.signal, outerSignal]) : active.signal);
      if (active.signal.aborted) return;
      if (response.base64) download(response.base64, response.name!);
      if (response.preview) setPreview(response.preview);
      if (response.comparison) setComparison(response.comparison);
      if (response.pdfFonts) { setPdfFonts(response.pdfFonts); setFontFolders((response.pdfFonts.directories ?? response.pdfFonts.systemDirectories).join("\n")); }
      return response;
    } catch (failure) { if (!active.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (controller.current === active) setBusy(false); }
  }
  function capture(event: React.SyntheticEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    if (!selection || !paper || !selection.rangeCount) return;
    const range = selection.getRangeAt(0), start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement;
    const element = start?.closest("[data-paper-block],[data-translation]");
    if (!element || !event.currentTarget.contains(element) || !range.toString()) return;
    if (element !== end?.closest("[data-paper-block],[data-translation]")) { setError(t("exactRange")); return; }
    const prefix = document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(range.startContainer, range.startOffset);
    const from = prefix.toString().length, quote = range.toString(), blockId = element.getAttribute("data-paper-block");
    if (blockId) {
      const block = paper.blocks.find(item => item.id === blockId);
      if (!block?.editable || block.text.slice(from, from + quote.length) !== quote) { setError(t("exactRange")); return; }
      setPicked({ kind: "source", value: { ...block.selection, from, to: from + quote.length, quote } });
    } else {
      const translation = paper.translations.find(item => item.id === element.getAttribute("data-translation"));
      if (!translation || translation.state !== "current" || translation.text.slice(from, from + quote.length) !== quote) { setError(t("changed")); return; }
      setPicked({ kind: "translation", value: { translationId: translation.id, version: translation.version, from, to: from + quote.length, quote } });
    }
    setCorrection(undefined);
  }
  function locate(ids: string[]) {
    setTab("reading"); requestAnimationFrame(() => {
      const element = [...(body.current?.querySelectorAll<HTMLElement>("[data-source-card]") ?? [])].find(element => ids.includes(element.dataset.sourceCard!));
      element?.scrollIntoView({ block: "center", behavior: "smooth" }); element?.focus();
    });
  }
  function anchorBlock(target: FeedbackTarget) {
    if (target.kind === "source") return target.selections[0]?.blockId;
    const translation = paper?.translations.find(item => item.id === target.selection.translationId);
    return (translation?.mappedSources[0] ?? translation?.sources[0])?.blockId;
  }
  function addComment(target: FeedbackTarget, replyTo?: string) {
    setDrafts(items => [...items, { id: crypto.randomUUID(), target, ...(replyTo ? { replyTo } : {}) }]);
  }
  async function removeComment(id: string, version: number) {
    if (version && !await run({ action: "delete_feedback", id, expectedVersion: version })) return;
    cache.current.delete(id); setDrafts(items => items.filter(item => item.id !== id));
  }
  async function submitRound(batch?: PaperView["batches"][number]) {
    const active = new AbortController(); submittingController.current?.abort(); submittingController.current = active;
    setSubmitting(true); setError("");
    try {
      await Promise.all([...saves.current.values()].map(flush => flush()));
      active.signal.throwIfAborted();
      const current = await call(sessionId, { action: "read" }, active.signal);
      if (!current.paper || current.paper.id !== paper?.id) throw new Error(t("changed"));
      const feedbackIds = current.paper.feedback.filter(item => !item.resolved
        && !current.paper!.feedback.find(parent => parent.id === item.replyTo)?.resolved
        && !current.paper!.batches.some(saved => saved.feedbackIds.includes(item.id))).map(item => item.id);
      const feedbackVersions = feedbackIds.map(id => ({ id, version: current.paper!.feedback.find(item => item.id === id)!.version }));
      const input = batch ? { requestId: batch.requestId, feedbackIds: batch.feedbackIds, direction: batch.direction,
        ...(batch.feedbackVersions ? { feedbackVersions: batch.feedbackVersions } : {}) }
        : submission.current && JSON.stringify(submission.current.feedbackIds) === JSON.stringify(feedbackIds)
          && JSON.stringify(submission.current.feedbackVersions) === JSON.stringify(feedbackVersions) ? submission.current
          : { requestId: crypto.randomUUID(), feedbackIds, feedbackVersions, direction: "" };
      if (!input.feedbackIds.length) return;
      submission.current = input;
      if (await run({ action: "submit_batch", ...input }, active.signal)) { submission.current = undefined; setTab("proposals"); }
    } catch (failure) { if (!active.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (submittingController.current === active) setSubmitting(false); }
  }
  const pending = paper?.candidates.filter(candidate => candidate.status === "pending") ?? [];
  const round = paper?.feedback.filter(item => !item.resolved && !paper.feedback.find(root => root.id === item.replyTo)?.resolved
    && !paper.batches.some(batch => batch.feedbackIds.includes(item.id))) ?? [];
  function threads(blockId: string) {
    if (!paper) return null;
    const all = [...paper.feedback.map(item => ({ id: item.id, target: item.target, ...(item.replyTo ? { replyTo: item.replyTo } : {}) })), ...drafts.filter(draft => !paper.feedback.some(item => item.id === draft.id))];
    return all.filter(item => !item.replyTo && (paper.feedback.find(record => record.id === item.id)?.sources[0]?.blockId ?? anchorBlock(item.target)) === blockId).map(root => {
      const rootRecord = paper.feedback.find(item => item.id === root.id), entries = [root, ...all.filter(item => item.replyTo === root.id)];
      return <aside className={`pw-comment ${rootRecord?.resolved ? "pw-resolved" : ""}`} key={root.id}>
        <div className="pw-actions"><strong>{t(rootRecord?.resolved ? "resolvedComment" : "comment")}</strong>
          {rootRecord && <button disabled={busy} onClick={() => void run({ action: "resolve_feedback", id: root.id, expectedVersion: rootRecord.version, resolved: !rootRecord.resolved })}>{t(rootRecord.resolved ? "reopenComment" : "resolveComment")}</button>}
        </div>
        <blockquote onClick={() => {
          if (rootRecord?.state !== "current") return;
          const source = rootRecord?.sources[0];
          if (root.target.kind === "source" && source) setPicked({ kind: "source", value: source });
          if (root.target.kind === "translation") setPicked({ kind: "translation", value: root.target.selection });
        }}>{root.target.kind === "source" ? root.target.selections.map(source => source.quote).join(" … ") : root.target.selection.quote}</blockquote>
        {entries.map(entry => {
          const record = paper.feedback.find(item => item.id === entry.id);
          const submitted = record?.submitted ?? false;
          return <CommentEditor key={entry.id} draft={entry} record={record} locked={!!record && (submitted || !!rootRecord?.resolved) || submitting}
            call={call} sessionId={sessionId} t={t} register={register} cache={cache.current} remove={removeComment} submitted={submitted} />;
        })}
        {!rootRecord?.resolved && rootRecord && <button disabled={submitting} onClick={() => addComment(root.target, root.id)}>{t("replyComment")}</button>}
        {rootRecord?.state === "stale" && <small>{t("changed")}</small>}
      </aside>;
    });
  }
  function readingResult(reading: PaperView["readings"][number], compact = false) {
    return <section className="pw-review" key={reading.id}>
      <strong>{t("automaticReading")} · {t(reading.status)}</strong>
      {reading.diagnostic && <p className="pw-error">{reading.diagnostic}</p>}
      {reading.output && <>
        {!reading.combinationMatches && <p>{t("combinationChanged")}</p>}
        {reading.currentSourceReviewed && !reading.currentBodyReviewed && <p>{t("sourceEvidenceRetained")}</p>}
        {!!reading.bilingualChanges.length && <details><summary>{t("bilingualChanged")}</summary>{reading.bilingualChanges.map(change => <div key={change.key}>
          <p><del>{change.beforeText ?? ""}</del> <ins>{change.afterText ?? ""}</ins></p>
          {!!change.sources.length && <button onClick={() => locate(change.sources.map(source => source.blockId))}>{t("locate")}</button>}
        </div>)}</details>}
        {!compact && <details><summary>{t("interpretation")}</summary><p>{reading.output.interpretation.problem}</p><p>{reading.output.interpretation.mechanism}</p><p>{reading.output.interpretation.feedbackRole}</p></details>}
        {reading.findings.map((finding, index) => <div key={index}><p><strong>{finding.issue}</strong></p><p>{finding.suggestion}</p>
          <details><summary>{t("evidenceLimits")}</summary><p>{finding.impact}</p><p>{finding.evidence}</p></details>
          {!!finding.sources.length && <button onClick={() => locate(finding.sources.map(source => source.blockId))}>{t("locate")}</button>}
        </div>)}
        <details><summary>{t("evidenceLimits")}</summary>{reading.output.limits.map((limit, index) => <p key={index}>{limit}</p>)}</details>
      </>}
      {!compact && <details><summary>{t("readingSource")}</summary><code>{reading.childId}</code></details>}
      {(["queued", "running"].includes(reading.status)) && <button disabled={busy} onClick={() => void run({ action: "cancel_reading", readingId: reading.id })}>{t("cancel")}</button>}
      {(["failed", "cancelled", "interrupted"].includes(reading.status)) && <button disabled={busy} onClick={() => void run({ action: "retry_reading", requestId: crypto.randomUUID(), readingId: reading.id })}>{t("retryReading")}</button>}
    </section>;
  }
  return <section className="paper-workbench" aria-label={t("title")}>
    <style>{`.paper-workbench{height:100%;display:flex;flex-direction:column;font:14px/1.6 inherit;color:inherit;--pw-line:color-mix(in srgb,currentColor 16%,transparent);--pw-soft:color-mix(in srgb,currentColor 4%,transparent)}.paper-workbench *{box-sizing:border-box}.paper-workbench button,.paper-workbench textarea,.paper-workbench select{font:inherit;color:inherit;background:transparent;border:1px solid var(--pw-line);border-radius:7px;padding:6px 9px;max-width:100%}.paper-workbench button{cursor:pointer}.paper-workbench button:disabled{opacity:.5}.paper-workbench button:focus-visible,.paper-workbench textarea:focus-visible,.paper-workbench article:focus-visible{outline:2px solid #688bb8;outline-offset:2px}.pw-head{padding:12px 16px;border-bottom:1px solid var(--pw-line)}.pw-scroll{overflow:auto;flex:1;padding:12px 16px}.pw-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:8px 0}.paper-workbench article{border:1px solid var(--pw-line);border-radius:9px;padding:12px;margin:12px 0}.pw-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px}.pw-source{font:16px/1.8 Georgia,serif;white-space:pre-wrap}.pw-chinese,.pw-diff,.pw-comment-text{white-space:pre-wrap;overflow-wrap:anywhere}.pw-muted{opacity:.65;font-size:12px}.pw-error{border:1px solid #ad5858;padding:9px;white-space:pre-wrap}.pw-comment,.pw-review{border-left:3px solid #8296b4;background:var(--pw-soft);padding:10px;margin:10px 0}.pw-resolved{opacity:.7}.pw-comment textarea{width:100%;min-height:65px;resize:vertical}.paper-workbench mark{background:#d9bd624d;color:inherit}.paper-workbench blockquote{border-left:2px solid #8296b4;padding-left:9px;margin:7px 0;white-space:pre-wrap}.paper-workbench ins{background:#66b88922;text-decoration:underline}.paper-workbench del{background:#ce686822;text-decoration:line-through}.pw-tag{font-size:12px;border:1px solid var(--pw-line);padding:1px 5px}.paper-workbench h2{font-size:17px;margin:4px 0}.paper-workbench h3{font-size:14px;margin:8px 0}.paper-workbench summary{cursor:pointer}`}</style>
    <header className="pw-head"><h2>{paper?.name ?? view?.reading?.paper.name ?? t("title")}</h2>
      <div className="pw-actions"><small role="status">{t(!view ? "loading" : connected ? "live" : "offline")}</small>
        <button disabled={busy || submitting} onClick={() => setRefresh(value => value + 1)}>{t("refresh")}</button>
        {(busy || submitting) && <button onClick={() => {
          controller.current?.abort(); submittingController.current?.abort(); setSubmitting(false);
        }}>{t("cancel")}</button>}
      </div>
      {paper && <nav className="pw-actions" aria-label={t("title")}>{(["reading", "proposals", "feedback", "readings", "history"] as const).map(key => <button key={key} aria-selected={tab === key} disabled={submitting} onClick={() => setTab(key)}>{t(key)}{key === "proposals" ? ` ${pending.length}` : key === "feedback" ? ` ${round.length}` : ""}</button>)}</nav>}
      {!!paper && <button disabled={busy || submitting || !round.length} onClick={() => void submitRound()}>{t(submitting ? "submittingRound" : "submitRound")}</button>}
    </header>
    <div className="pw-scroll" ref={body}>
      {error && <p className="pw-error" role="alert">{error}</p>}
      {view?.reading && <FrozenReading packet={view.reading} t={t} />}
      {view && !paper && !view.reading && <><h3>{t("empty")}</h3><p>{t("chatDocumentInput")}</p><p className="pw-muted">{t("scope")}</p></>}
      {paper && <>
        {paper.warnings.map((warning, index) => <p className="pw-muted" key={index}>{warning}</p>)}
        {paper.wordExportNeedsRestore && <p className="pw-error">{t("restoreBeforeExport")}</p>}
        <div hidden={tab !== "reading"} onMouseUp={capture} onKeyUp={capture}>
          <p className="pw-muted">{t("selectForComment")}</p>
          {paper.blocks.map(block => {
            const sourceSelection = picked?.kind === "source" && picked.value.blockId === block.id ? picked.value : undefined;
            const commentRanges = paper.feedback.filter(item => !item.replyTo && !item.resolved && item.state === "current" && item.target.kind === "source")
              .flatMap(item => item.sources.filter(source => source.blockId === block.id));
            const selectedTranslation = picked?.kind === "translation" ? paper.translations.find(item => item.id === picked.value.translationId && item.mappedSources.some(source => source.blockId === block.id)) : undefined;
            const chosen = !!sourceSelection || !!selectedTranslation;
            let offset = 0;
            return <article key={block.id} data-source-card={block.id} tabIndex={-1}>
              <div className="pw-pair"><div><small>{t("source")} · {t(`language_${paper.primaryLanguage}`)}</small>
                <div className="pw-source" data-paper-block={block.id}>{block.editable ? block.runs.map((run, index) => {
                  const start = offset; offset += run.text.length;
                  return <span key={index} style={{ fontWeight: run.marks.includes("bold") ? 700 : undefined, fontStyle: run.marks.includes("italic") ? "italic" : undefined }}><MarkedText text={run.text} from={sourceSelection && sourceSelection.from - start} to={sourceSelection && sourceSelection.to - start}
                    ranges={commentRanges.map(range => ({ from: range.from - start, to: range.to - start }))} /></span>;
                }) : block.text}</div>
                {!block.editable && <small>{t("unsupported")}: {block.reason}</small>}
              </div><div><small>{t("translation")} · {t(`language_${paper.translationLanguage}`)}</small>
                {paper.translations.filter(translation => translation.state !== "superseded" && (translation.state === "current" ? translation.mappedSources : translation.sources)[0]?.blockId === block.id).map(translation => <div key={translation.id} className={translation.state === "stale" ? "pw-muted" : ""}>
                  <small>{t(translation.state)}</small><div className="pw-chinese" data-translation={translation.id}><MarkedText text={translation.text}
                    ranges={paper.feedback.flatMap(item => !item.replyTo && !item.resolved && item.state === "current" && item.target.kind === "translation"
                      && item.target.selection.translationId === translation.id && item.target.selection.version === translation.version ? [item.target.selection] : [])}
                    from={picked?.kind === "translation" && picked.value.translationId === translation.id ? picked.value.from : undefined}
                    to={picked?.kind === "translation" && picked.value.translationId === translation.id ? picked.value.to : undefined} /></div></div>)}
                {!paper.translations.some(translation => translation.state === "current" && translation.mappedSources.some(source => source.blockId === block.id)) && <p className="pw-muted">{t("translationInConversation")}</p>}
              </div></div>
              {chosen && picked && <div className="pw-actions"><button onClick={() => addComment(picked.kind === "source" ? { kind: "source", selections: [picked.value] } : { kind: "translation", selection: picked.value })}>{t("addComment")}</button>
                {picked.kind === "translation" && <button onClick={() => setCorrection(picked.value.quote)}>{t("correction")}</button>}
                <button onClick={() => { setPicked(undefined); setCorrection(undefined); }}>{t("clearSelection")}</button>
              </div>}
              {chosen && correction !== undefined && picked?.kind === "translation" && <section><textarea aria-label={t("correction")} value={correction} onChange={event => setCorrection(event.target.value)} />
                <button disabled={busy} onClick={() => void (async () => { if (await run({ action: "correct_translation", selection: picked.value, replacement: correction })) { setCorrection(undefined); setPicked(undefined); } })()}>{t("correct")}</button></section>}
              {threads(block.id)}
              {paper.readings.filter(reading => reading.findings.some(finding => finding.sources.some(source => source.blockId === block.id))).map(reading => readingResult(reading, true))}
            </article>;
          })}
        </div>
        {tab === "proposals" && <>
          <p className="pw-muted">{t("automaticReadingNotice")}</p>
          <div className="pw-actions"><button disabled={busy || !pending.length} onClick={() => void run({ action: "preview", candidateIds: "all" })}>{t("previewAll")}</button>
            <button disabled={busy || !selected.length} onClick={() => void run({ action: "preview", candidateIds: selected })}>{t("previewSelected")}</button>
            <button disabled={busy || !selected.length} onClick={() => void run({ action: "decide", candidateIds: selected, decision: "rejected", expectedRevision: paper.revision })}>{t("rejectSelected")}</button>
            <button disabled={busy || !pending.length} onClick={() => void run({ action: "decide", candidateIds: pending.map(item => item.id), decision: "rejected", expectedRevision: paper.revision })}>{t("rejectAll")}</button></div>
          {preview && <section className="pw-review"><h3>{t("preview")}</h3><p>{t("copiedScope")} · {preview.candidateIds.length}</p>
            {preview.conflicts.map(item => <p key={item.candidateId}>{item.message}</p>)}
            {!!preview.includedDependencies.length && <p>{t("dependencies")} · {preview.includedDependencies.length}</p>}
            <button disabled={busy || !preview.candidateIds.length || preview.revision !== paper.revision} onClick={() => void (async () => { if (await run({ action: "decide", candidateIds: preview.candidateIds, decision: "accepted", expectedRevision: preview.revision })) { setPreview(undefined); setSelected([]); } })()}>{t("acceptScope")}</button></section>}
          {!paper.candidates.length && <p>{t("noChanges")}</p>}
          {paper.candidates.map(candidate => <article key={candidate.id} data-candidate={candidate.id}><div className="pw-actions">
            {candidate.status === "pending" && <input type="checkbox" aria-label={candidate.reason} checked={selected.includes(candidate.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, candidate.id] : ids.filter(id => id !== candidate.id))} />}
            <span className="pw-tag">{t(candidate.status)}</span><strong>{candidate.reason}</strong></div>
            {candidate.diffs.map((parts, index) => <div className="pw-diff" key={index}><Diff parts={parts} /></div>)}
            {candidate.translations.map((translation, index) => <p className="pw-chinese" key={index}>{translation.text}</p>)}
            {candidate.conflict && <p className="pw-error">{candidate.conflict}</p>}
            {candidate.currentSelections.length > 0 && <button onClick={() => locate(candidate.currentSelections.map(source => source.blockId))}>{t("locate")}</button>}
            {candidate.status === "pending" && <div className="pw-actions"><button disabled={busy} onClick={() => void run({ action: "preview", candidateIds: [candidate.id] })}>{t("preview")}</button>
              <button disabled={busy} onClick={() => void run({ action: "decide", candidateIds: [candidate.id], decision: "rejected", expectedRevision: paper.revision })}>{t("reject")}</button></div>}
            {paper.readings.filter(reading => reading.candidateIds.includes(candidate.id)).map(reading => readingResult(reading, true))}
          </article>)}
        </>}
        {tab === "feedback" && <>
          <p>{t("commentsInDocument")}</p>
          {paper.feedback.filter(item => !item.replyTo).map(item => <article key={item.id}><p>{item.comment}</p><small>{t(item.resolved ? "resolvedComment" : "comment")}</small>
            {paper.feedback.filter(reply => reply.replyTo === item.id).map(reply => <blockquote key={reply.id}>{reply.comment}</blockquote>)}
            <button onClick={() => locate(item.sources.length ? item.sources.map(source => source.blockId) : [anchorBlock(item.target)!])}>{t("locate")}</button></article>)}
          {paper.batches.filter(batch => batch.delivery !== "sent").map(batch => <article key={batch.id}>{batch.error && <p className="pw-error">{batch.error}</p>}<button disabled={busy || submitting} onClick={() => void submitRound(batch)}>{t("retryRound")}</button></article>)}
        </>}
        {tab === "readings" && <><p>{t("automaticReadingNotice")}</p>{!paper.readings.length && <p>{t("noReadings")}</p>}{paper.readings.map(reading => readingResult(reading))}</>}
        {tab === "history" && <>
          <div className="pw-actions"><select aria-label={t("exportVariant")} value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{(["clean", "tracked", "bilingual"] as const).map(item => <option key={item} value={item}>{t(({ clean: "cleanCopy", tracked: "trackedCopy", bilingual: "bilingualCopy" } as const)[item])}</option>)}</select>
            <select aria-label={t("exportFormat")} value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="docx">Word</option><option value="pdf">PDF</option></select>
            <button disabled={busy || paper.wordExportNeedsRestore} onClick={() => void run({ action: "export", requestId: crypto.randomUUID(), variant, format, includeReasons: true, expectedRevision: paper.revision, baselineRevision: paper.comparisonRevision })}>{t("exportFile")}</button>
            <button disabled={busy} onClick={() => void run({ action: "download_source" })}>{t("originalSource")}</button></div>
          {format === "pdf" && <p className="pw-muted">{t("pdfCopy")}</p>}
          {paper.sourceResources.map(resource => <p key={resource.path}><button onClick={() => void run({ action: "download_source", resourcePath: resource.path })}>{resource.path}</button></p>)}
          <p className="pw-muted">{t("returnInConversation")}</p>
          {paper.documentReturns.map(returned => <article key={returned.id}><strong>{returned.name}</strong>{returned.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<button onClick={() => void run({ action: "download_return", returnId: returned.id })}>{t("originalSource")}</button></article>)}
          {paper.documentDeliveries.map(delivery => <p key={delivery.id}><button onClick={() => void run({ action: "download_delivery", deliveryId: delivery.id })}>{delivery.name}</button></p>)}
          <article><p>{t("originalSource")} · {t("revision")} 0</p><div className="pw-actions">
            <button disabled={busy} onClick={() => void run({ action: "compare", revision: 0 })}>{t("compareOriginal")}</button>
            <button disabled={busy} onClick={() => void run({ action: "set_baseline", revision: 0, expectedRevision: paper.revision })}>{t("useComparisonBaseline")}</button>
            <button disabled={busy} onClick={() => void run({ action: "restore", revision: 0, expectedRevision: paper.revision })}>{t("restore")}</button>
          </div></article>
          {paper.history.map(entry => <article key={entry.revision}><p>{t(entry.kind)} · {t("revision")} {entry.revision}</p>
            <div className="pw-actions"><button disabled={busy} onClick={() => void run({ action: "compare", revision: entry.revision })}>{t("compare")}</button>
              <button disabled={busy} onClick={() => void run({ action: "set_baseline", revision: entry.revision, expectedRevision: paper.revision })}>{t("useComparisonBaseline")}</button>
              <button disabled={busy} onClick={() => void run({ action: "restore", revision: entry.revision, expectedRevision: paper.revision })}>{t("restore")}</button></div></article>)}
          {paper.decisions.filter(decision => decision.decision !== "undone").map(decision => <p key={decision.id}><button disabled={busy} onClick={() => void run({ action: "undo", decisionId: decision.id, expectedRevision: paper.revision })}>{t("undo")} · {decision.candidateIds.length}</button></p>)}
          {comparison?.blocks.map(block => <article key={block.id}><Diff parts={block.diff} /></article>)}
          <details><summary>{t("pdfFonts")}</summary><button disabled={busy} onClick={() => void run({ action: "pdf_font_settings" })}>{t("refresh")}</button>
            <p>{t("fontShared")}</p><p className="pw-muted">{t("fontNotes")}</p>
            {pdfFonts?.diagnostic && <p className="pw-error">{pdfFonts.diagnostic}</p>}
            {pdfFonts?.canEdit && <><textarea aria-label={t("fontFolders")} value={fontFolders} onChange={event => setFontFolders(event.target.value)} />
              <div className="pw-actions"><button disabled={busy} onClick={() => void run({ action: "configure_pdf_fonts", directories: fontFolders.split(/\r?\n/).filter(path => !!path.trim()), expectedDirectories: pdfFonts.directories, sharedPreviews: true })}>{t("fontApply")}</button>
                <button disabled={busy} onClick={() => void run({ action: "configure_pdf_fonts", directories: null, expectedDirectories: pdfFonts.directories, sharedPreviews: true })}>{t("fontAutomatic")}</button></div>
              <p className="pw-muted">{t("fontReadAgain")}</p></>}
          </details>
        </>}
      </>}
    </div>
  </section>;
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
    scope.inject(["sidebarRight"], navigation => {
      navigation.effect(() => {
        let active: AbortController | undefined;
        const selected = () => {
          active?.abort();
          const sessionId = navigation.sidebarRight.mounted.getSnapshot();
          if (!sessionId) return;
          const controller = new AbortController(); active = controller;
          void (async () => {
            let initialized = false, previous: string | undefined;
            try {
              for await (const state of observe(sessionId, controller.signal)) {
                const paperId = state.paper?.id;
                if (initialized && paperId && paperId !== previous) requestAnimationFrame(() => {
                  if (!controller.signal.aborted && navigation.sidebarRight.mounted.getSnapshot() === sessionId)
                    navigation.sidebarRight.openTab("paper-workbench");
                });
                previous = paperId; initialized = true;
              }
            } catch {
              if (!controller.signal.aborted) console.warn("Paper workbench link observation stopped. Reopen the task to reconnect.");
            }
          })();
        };
        const unsubscribe = navigation.sidebarRight.mounted.subscribe(selected);
        selected();
        return () => { unsubscribe(); active?.abort(); };
      });
    });
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
