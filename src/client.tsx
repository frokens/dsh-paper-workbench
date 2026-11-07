import * as React from "react";
import { Button, SegmentedTabs, ConnectionIndicator, type SegmentedTab } from "@deepseek-ai/dsh-client-ui-primitives";
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
const tabs = ["reading", "proposals", "feedback", "readings", "history"] as const;
type WorkbenchTab = typeof tabs[number];
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
  live: "Connected",
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
  connectionDetails: "Connection details",
  reconnecting: "Reconnecting…",
  readyComments: "Comments and replies ready to submit",
  savedDiscussions: "Saved discussions",
  concern: "Concern",
  question: "Question",
  impact: "Why it matters",
  evidence: "Evidence",
  suggestion: "Suggested next step",
  findings: "Findings",
  allReadingDetails: "Read the full review and evidence limits",
  unlocatedFindings: "Findings without a current source location",
  reviewedCombination: "Matches this candidate combination",
  historicalCombination: "Applies to an earlier combination",
  viewCandidate: "View the related proposal",
  proposal: "Proposed change",
  proposalReason: "Reason for this change",
  previousProposalDiff: "Text changes from the previous proposal",
  acceptedSourceDiff: "Full difference from the accepted body",
  pairedTranslation: "Paired translation",
  previousProposals: "Earlier proposals",
  revisedProposal: "View the revised proposal",
  notices: "Source notes",
  pendingDraft: "The first draft is a pending proposal. Read its text and paired translation in Changes before deciding.",
  unchangedText: "Unchanged text",
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
  live: "已连接",
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
  connectionDetails: "连接详情",
  reconnecting: "正在重新连接…",
  readyComments: "待提交的批注与回复",
  savedDiscussions: "已保存的讨论",
  concern: "关注问题",
  question: "待澄清",
  impact: "影响",
  evidence: "依据",
  suggestion: "建议",
  findings: "审读发现",
  allReadingDetails: "查看完整审读与证据限制",
  unlocatedFindings: "尚无当前正文定位的发现",
  reviewedCombination: "对应当前候选组合",
  historicalCombination: "对应较早的候选组合",
  viewCandidate: "查看相关候选",
  proposal: "修改建议",
  proposalReason: "修改说明",
  previousProposalDiff: "本次相对上一候选的文字变化",
  acceptedSourceDiff: "相对已接受正文的完整差异",
  pairedTranslation: "配对译文",
  previousProposals: "较早的候选",
  revisedProposal: "查看后续候选",
  notices: "原稿提示",
  pendingDraft: "首稿仍是待处理候选，可在候选修改中阅读正文与完整译文，再决定是否接受。",
  unchangedText: "未改动的内容",
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
function Diff({ parts, collapseEqual }: { parts: { kind: string; text: string }[]; collapseEqual?: string }) {
  return (
    <div className="pw-diff">
      {parts.map((part, i) =>
        part.kind === "insert" ? (
          <ins key={i}>{part.text}</ins>
        ) : part.kind === "delete" ? (
          <del key={i}>{part.text}</del>
        ) : collapseEqual && part.text.length > 320 ? (
          <details className="pw-unchanged" key={i}><summary>{collapseEqual}</summary><span>{part.text}</span></details>
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
    if (!saving && !retry.current && record && latest.current === saved.current && record.version > version.current) {
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
      <Button size="sm" variant="outline" disabled={saving} onClick={() => void remove(draft.id, version.current)}>{t("deleteComment")}</Button>
      {error && <><Button size="sm" variant="outline" onClick={() => void flush().catch(() => {})}>{t("retrySave")}</Button>
        {currentRecord.current && <Button size="sm" variant="outline" onClick={() => {
          const stored = currentRecord.current!; saved.current = stored.comment; latest.current = stored.comment; version.current = stored.version;
          retry.current = undefined; cache.delete(draft.id); setText(stored.comment); setError("");
        }}>{t("reloadComment")}</Button>}</>}
    </div>{error && <p role="alert" className="pw-error">{error}</p>}
  </div>;
}

function Workbench({ sessionId, call, observe, t }: Props) {
  const [view, setView] = React.useState<View>(), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [connection, setConnection] = React.useState<"loading" | "live" | "offline">("loading"), [refresh, setRefresh] = React.useState(0);
  const [connectionError, setConnectionError] = React.useState("");
  const [tab, setTab] = React.useState<WorkbenchTab>("reading"), [picked, setPicked] = React.useState<Picked>();
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
  const panelId = React.useId();
  const pendingKey = paper?.candidates.filter(candidate => candidate.status === "pending").map(candidate => candidate.id).join("\n");
  const register = React.useCallback((key: string, flush: CommentFlush) => {
    saves.current.set(key, flush);
    return () => { if (saves.current.get(key) === flush) saves.current.delete(key); };
  }, []);
  React.useEffect(() => {
    setView(undefined);
    setPicked(undefined); setDrafts([]); setSelected([]); setPreview(undefined); setComparison(undefined); cache.current.clear(); submission.current = undefined;
    return () => { controller.current?.abort(); submittingController.current?.abort(); };
  }, [sessionId]);
  React.useEffect(() => {
    const stream = new AbortController(); setConnection("loading"); setConnectionError("");
    void (async () => {
      try { for await (const state of observe(sessionId, stream.signal)) {
        if (stream.signal.aborted) return;
        setView(state); setConnection("live");
      }
        if (!stream.signal.aborted) setConnection("offline");
      } catch (failure) { if (!stream.signal.aborted) { setConnection("offline"); setConnectionError(failure instanceof Error ? failure.message : String(failure)); } }
    })();
    return () => stream.abort();
  }, [sessionId, observe, refresh]);
  const prior = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const version = paper ? `${paper.id}:${paper.revision}` : undefined;
    if (prior.current && prior.current !== version) { setPicked(undefined); setPreview(undefined); setComparison(undefined); }
    prior.current = version;
  }, [paper?.id, paper?.revision]);
  React.useEffect(() => {
    const current = new Set(pendingKey?.split("\n") ?? []);
    setSelected(ids => ids.filter(candidateId => current.has(candidateId)));
    setPreview(undefined);
  }, [paper?.id, pendingKey]);
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
  function locate(ids: string[], kind: "source" | "candidate" = "source") {
    setTab(kind === "source" ? "reading" : "proposals"); requestAnimationFrame(() => {
      const element = [...(body.current?.querySelectorAll<HTMLElement>(kind === "source" ? "[data-source-card]" : "[data-candidate]") ?? [])]
        .find(element => ids.includes(kind === "source" ? element.dataset.sourceCard! : element.dataset.candidate!));
      if (element instanceof HTMLDetailsElement) element.open = true;
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
  const pendingDraft = !!pending.length && !!paper?.blocks.every(block => !block.text.trim());
  const round = paper?.feedback.filter(item => !item.resolved && !paper.feedback.find(root => root.id === item.replyTo)?.resolved
    && !paper.batches.some(batch => batch.feedbackIds.includes(item.id))) ?? [];
  function threads(blockId: string) {
    if (!paper) return null;
    const all = [...paper.feedback.map(item => ({ id: item.id, target: item.target, ...(item.replyTo ? { replyTo: item.replyTo } : {}) })), ...drafts.filter(draft => !paper.feedback.some(item => item.id === draft.id))];
    return all.filter(item => !item.replyTo && (paper.feedback.find(record => record.id === item.id)?.sources[0]?.blockId ?? anchorBlock(item.target)) === blockId).map(root => {
      const rootRecord = paper.feedback.find(item => item.id === root.id), entries = [root, ...all.filter(item => item.replyTo === root.id)];
      return <aside className={`pw-comment ${rootRecord?.resolved ? "pw-resolved" : ""}`} key={root.id}>
        <div className="pw-actions"><strong>{t(rootRecord?.resolved ? "resolvedComment" : "comment")}</strong>
          {rootRecord && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "resolve_feedback", id: root.id, expectedVersion: rootRecord.version, resolved: !rootRecord.resolved })}>{t(rootRecord.resolved ? "reopenComment" : "resolveComment")}</Button>}
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
        {!rootRecord?.resolved && rootRecord && <Button size="sm" variant="outline" disabled={submitting} onClick={() => addComment(root.target, root.id)}>{t("replyComment")}</Button>}
        {rootRecord?.state === "stale" && <small>{t("changed")}</small>}
      </aside>;
    });
  }
  function readingResult(reading: PaperView["readings"][number], compact = false, findings = reading.findings) {
    const heading = <><span>{t("automaticReading")}</span><span className="pw-tag">{t(reading.status)}</span>
      {reading.output && <span className="pw-muted">{t("findings")} {findings.length}</span>}</>;
    const content = <>
      {reading.diagnostic && <p className="pw-error">{reading.diagnostic}</p>}
      {reading.output && <>
        <p className="pw-muted">{t(reading.combinationMatches ? "reviewedCombination" : "historicalCombination")}</p>
        {!compact && !reading.combinationMatches && <p>{t("combinationChanged")}</p>}
        {!compact && reading.currentSourceReviewed && !reading.currentBodyReviewed && <p>{t("sourceEvidenceRetained")}</p>}
        {!!reading.bilingualChanges.length && <details><summary>{t("bilingualChanged")}</summary>{reading.bilingualChanges.map(change => <div key={change.key}>
          <p><del>{change.beforeText ?? ""}</del> <ins>{change.afterText ?? ""}</ins></p>
          {!!change.sources.length && <Button size="sm" variant="outline" onClick={() => locate(change.sources.map(source => source.blockId))}>{t("locate")}</Button>}
        </div>)}</details>}
        {!compact && <details><summary>{t("interpretation")}</summary><p>{reading.output.interpretation.problem}</p><p>{reading.output.interpretation.mechanism}</p><p>{reading.output.interpretation.feedbackRole}</p></details>}
        {findings.map((finding, index) => <details className="pw-finding" key={index}>
          <summary><span className="pw-tag">{t(finding.kind)}</span><span className="pw-finding-title">{finding.issue}</span></summary>
          {finding.locations.filter(location => location.quote).map((location, index) => <blockquote key={index}>
            <small>{t(location.version === "candidate" ? "candidateBody" : "baselineBody")}</small><p>{location.quote}</p>
          </blockquote>)}
          <dl><dt>{t("impact")}</dt><dd>{finding.impact}</dd><dt>{t("evidence")}</dt><dd>{finding.evidence}</dd>
            <dt>{t("suggestion")}</dt><dd>{finding.suggestion}</dd></dl>
          {!!finding.sources.length && <Button size="sm" variant="outline" onClick={() => locate(finding.sources.map(source => source.blockId))}>{t("locate")}</Button>}
          {!!finding.candidateIds.length && <Button size="sm" variant="outline" onClick={() => locate(finding.candidateIds, "candidate")}>{t("viewCandidate")}</Button>}
        </details>)}
        {!compact && <details><summary>{t("evidenceLimits")} · {reading.output.limits.length}</summary><ul>{reading.output.limits.map((limit, index) => <li key={index}>{limit}</li>)}</ul></details>}
        {compact && <Button size="sm" variant="outline" onClick={() => setTab("readings")}>{t("allReadingDetails")} · {reading.output.limits.length}</Button>}
      </>}
      {!compact && <details><summary>{t("readingSource")}</summary><code>{reading.childId}</code></details>}
      {(["queued", "running"].includes(reading.status)) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "cancel_reading", readingId: reading.id })}>{t("cancel")}</Button>}
      {(["failed", "cancelled", "interrupted"].includes(reading.status)) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "retry_reading", requestId: crypto.randomUUID(), readingId: reading.id })}>{t("retryReading")}</Button>}
    </>;
    return compact ? <details className="pw-review pw-review-compact" key={reading.id}><summary>{heading}</summary>{content}</details>
      : <section className="pw-review" key={reading.id}><h3 className="pw-actions">{heading}</h3>{content}</section>;
  }
  return <section className="paper-workbench" aria-label={t("title")}>
    <style>{`
.paper-workbench{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;container-type:inline-size;font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:1.65;color:var(--dsw-alias-label-primary,inherit);--pw-line:var(--dsw-alias-border-l2,color-mix(in srgb,currentColor 16%,transparent));--pw-soft:var(--dsw-alias-bg-layer-1,color-mix(in srgb,currentColor 4%,transparent));--pw-muted:var(--dsw-alias-label-secondary,currentColor);--pw-accent:var(--dsw-static-deepseek-500,currentColor)}
.paper-workbench *{box-sizing:border-box;min-width:0}
.paper-workbench button{font-family:inherit;white-space:normal;max-width:100%;height:auto;min-height:28px}
.paper-workbench textarea,.paper-workbench select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--pw-line);border-radius:var(--dsw-radius-sm,8px);padding:8px 10px;max-width:100%}
.paper-workbench textarea{width:100%;min-height:90px;resize:vertical;line-height:1.65}
.paper-workbench button:focus-visible,.paper-workbench textarea:focus-visible,.paper-workbench [tabindex="-1"]:focus-visible{outline:2px solid var(--pw-accent);outline-offset:3px}
.paper-workbench h2{font-size:17px;line-height:1.45;margin:0;overflow-wrap:anywhere}
.paper-workbench h3{font-size:14px;line-height:1.5;margin:12px 0 8px}
.paper-workbench p{margin:8px 0 12px}
.paper-workbench small{font-size:12px;color:var(--pw-muted)}
.paper-workbench summary{cursor:pointer;line-height:1.6;overflow-wrap:anywhere}
.paper-workbench code{white-space:pre-wrap;overflow-wrap:anywhere}
.pw-head{flex:none;padding:16px;border-bottom:1px solid var(--pw-line);background:var(--dsw-alias-bg-module-platform,transparent)}
.pw-scroll{overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;padding:16px}
.pw-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
.pw-connection{justify-content:space-between;margin:4px 0 10px}
.pw-connection-detail{font-size:12px;color:var(--pw-muted);margin:8px 0}
.pw-connection-detail p{max-height:10rem;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
.pw-tabs{margin:12px 0;overflow-x:auto}
.pw-tabs button{white-space:nowrap}
.pw-submit-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}
.paper-workbench article,.pw-archived{border:1px solid var(--pw-line);border-radius:var(--dsw-radius-lg,12px);padding:16px;margin:0 0 20px;overflow-wrap:anywhere}
.pw-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:24px}
.pw-source,.pw-chinese{font-size:16px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}
.pw-source{margin:8px 0 16px}
.pw-muted{color:var(--pw-muted);font-size:12px}
.pw-error{border:1px solid var(--dsw-static-red-500,currentColor);border-radius:8px;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere}
.pw-comment{border-left:3px solid var(--pw-accent);background:var(--pw-soft);border-radius:0 8px 8px 0;padding:12px;margin:16px 0 0}
.pw-comment .pw-actions{justify-content:space-between;margin-top:0}
.pw-comment-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75}
.pw-resolved{color:var(--pw-muted)}
.paper-workbench blockquote{border-left:2px solid var(--pw-line);padding-left:12px;margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.pw-comment blockquote{font-size:13px;max-height:12em;overflow:auto}
.paper-workbench mark{background:var(--dsw-alias-bg-document-selection,#d9bd624d);color:inherit;border-radius:2px}
.pw-diff{font-size:15px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}
.paper-workbench ins{background:var(--dsw-static-green-500-a12,#66b88922);text-decoration:underline;text-underline-offset:3px;box-decoration-break:clone}
.paper-workbench del{background:var(--dsw-static-red-400-a12,#ce686822);text-decoration:line-through;box-decoration-break:clone}
.pw-tag{display:inline-block;font-size:11px;font-weight:500;line-height:1.7;border:1px solid var(--pw-line);border-radius:5px;padding:1px 6px;white-space:nowrap;vertical-align:middle}
.pw-reason{color:var(--pw-muted);font-size:13px;margin:8px 0 16px}
.pw-change,.pw-translation{margin:16px 0}
.pw-translation{border-top:1px solid var(--pw-line);padding-top:8px}
.pw-unchanged{font-size:13px;color:var(--pw-muted);margin:8px 0;white-space:normal}
.pw-unchanged>span{white-space:pre-wrap}
.pw-review{border:1px solid var(--pw-line);border-radius:8px;background:var(--pw-soft);padding:12px;margin:16px 0}
.pw-review-compact>summary>.pw-tag,.pw-review-compact>summary>.pw-muted{margin-left:8px}
.pw-review>h3{margin-top:0}
.pw-finding{border-top:1px solid var(--pw-line);padding:12px 0}
.pw-finding-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin:6px 0 0;line-height:1.7;font-weight:500}
.pw-finding[open] .pw-finding-title{-webkit-line-clamp:unset}
.pw-finding dt{font-size:12px;color:var(--pw-muted);font-weight:600;margin-top:12px}
.pw-finding dd{margin:4px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.pw-finding blockquote{font-size:13px}
.pw-review li{margin:8px 0;overflow-wrap:anywhere}
.pw-archived{color:var(--pw-muted)}
.pw-archived[open]{color:inherit}
.pw-notices{font-size:12px;color:var(--pw-muted);margin-bottom:16px}
@container (max-width:420px){.pw-head,.pw-scroll{padding:12px}.paper-workbench article,.pw-archived{padding:12px}.pw-tabs{max-width:100%}.pw-tabs>[role="tab"]{min-width:max-content}.pw-submit-bar{align-items:flex-start}.pw-source,.pw-chinese{font-size:15px}.pw-actions{gap:6px}}
`}</style>
    <header className="pw-head"><h2>{paper?.name ?? view?.reading?.paper.name ?? t("title")}</h2>
      <div className="pw-actions pw-connection"><small role="status">{t(connection)}</small>
        {connection === "live" && <Button size="sm" variant="toolbar" onClick={() => setRefresh(value => value + 1)}>{t("refresh")}</Button>}
        {(busy || submitting) && <Button size="sm" variant="outline" onClick={() => {
          controller.current?.abort(); submittingController.current?.abort(); setSubmitting(false);
        }}>{t("cancel")}</Button>}
      </div>
      <ConnectionIndicator state={connection === "live" ? undefined : connection === "loading" ? "connecting" : "disconnected"}
        disconnectedLabel={t("offline")} connectingLabel={t(view ? "reconnecting" : "loading")} recoveredLabel={t("live")}
        reconnectActionLabel={t("refresh")} restartActionLabel={t("refresh")} onReconnect={() => setRefresh(value => value + 1)} />
      {connectionError && <details className="pw-connection-detail"><summary>{t("connectionDetails")}</summary><p>{connectionError}</p></details>}
      {paper && <SegmentedTabs size="sm" className="pw-tabs" label={t("title")} value={tab} onChange={setTab}
        items={tabs.map(key => ({ value: key, id: `${panelId}-${key}-tab`, panelId: `${panelId}-${key}-panel`,
          label: <>{t(key)}{key === "proposals" ? ` ${pending.length}` : key === "feedback" ? ` ${paper.feedback.filter(item => !item.replyTo).length}` : ""}</>,
        })) as [SegmentedTab<WorkbenchTab>, ...SegmentedTab<WorkbenchTab>[]]} />}
      {!!paper && <div className="pw-submit-bar"><small>{t("readyComments")} · {round.length}</small>
        <Button size="sm" variant="primary" disabled={busy || submitting || !round.length} onClick={() => void submitRound()}>{t(submitting ? "submittingRound" : "submitRound")}</Button></div>}
    </header>
    <div className="pw-scroll" ref={body}>
      {error && <p className="pw-error" role="alert">{error}</p>}
      {view?.reading && <FrozenReading packet={view.reading} t={t} />}
      {view && !paper && !view.reading && <><h3>{t("empty")}</h3><p>{t("chatDocumentInput")}</p><p className="pw-muted">{t("scope")}</p></>}
      {paper && <>
        {!!paper.warnings.length && <details className="pw-notices"><summary>{t("notices")} · {paper.warnings.length}</summary>{paper.warnings.map((warning, index) => <p className="pw-muted" key={index}>{warning}</p>)}</details>}
        {paper.wordExportNeedsRestore && <p className="pw-error">{t("restoreBeforeExport")}</p>}
        <div id={`${panelId}-reading-panel`} role="tabpanel" aria-labelledby={`${panelId}-reading-tab`} hidden={tab !== "reading"} onMouseUp={capture} onKeyUp={capture}>
          <p className="pw-muted">{t("selectForComment")}</p>
          {pendingDraft && <article><p>{t("pendingDraft")}</p><Button size="sm" variant="outline" onClick={() => setTab("proposals")}>{t("proposals")} · {pending.length}</Button></article>}
          {paper.readings.filter(reading => reading.findings.some(finding => !finding.sources.length)).map(reading => <section key={reading.id}>
            <small className="pw-muted">{t("unlocatedFindings")}</small>{readingResult(reading, true, reading.findings.filter(finding => !finding.sources.length))}
          </section>)}
          {(pendingDraft ? [] : paper.blocks).map(block => {
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
              {chosen && picked && <div className="pw-actions"><Button size="sm" variant="outline" onClick={() => addComment(picked.kind === "source" ? { kind: "source", selections: [picked.value] } : { kind: "translation", selection: picked.value })}>{t("addComment")}</Button>
                {picked.kind === "translation" && <Button size="sm" variant="outline" onClick={() => setCorrection(picked.value.quote)}>{t("correction")}</Button>}
                <Button size="sm" variant="outline" onClick={() => { setPicked(undefined); setCorrection(undefined); }}>{t("clearSelection")}</Button>
              </div>}
              {chosen && correction !== undefined && picked?.kind === "translation" && <section><textarea aria-label={t("correction")} value={correction} onChange={event => setCorrection(event.target.value)} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void (async () => { if (await run({ action: "correct_translation", selection: picked.value, replacement: correction })) { setCorrection(undefined); setPicked(undefined); } })()}>{t("correct")}</Button></section>}
              {threads(block.id)}
              {paper.readings.filter(reading => reading.findings.some(finding => finding.sources.some(source => source.blockId === block.id)))
                .map(reading => readingResult(reading, true, reading.findings.filter(finding => finding.sources.some(source => source.blockId === block.id))))}
            </article>;
          })}
        </div>
        {tab === "proposals" && <section id={`${panelId}-proposals-panel`} role="tabpanel" aria-labelledby={`${panelId}-proposals-tab`}>
          <p className="pw-muted">{t("automaticReadingNotice")}</p>
          <div className="pw-actions"><Button size="sm" variant="outline" disabled={busy || !pending.length} onClick={() => void run({ action: "preview", candidateIds: "all" })}>{t("previewAll")}</Button>
            <Button size="sm" variant="outline" disabled={busy || !selected.length} onClick={() => void run({ action: "preview", candidateIds: selected })}>{t("previewSelected")}</Button>
            <Button size="sm" variant="outline" disabled={busy || !selected.length} onClick={() => void run({ action: "decide", candidateIds: selected, decision: "rejected", expectedRevision: paper.revision })}>{t("rejectSelected")}</Button>
            <Button size="sm" variant="outline" disabled={busy || !pending.length} onClick={() => void run({ action: "decide", candidateIds: pending.map(item => item.id), decision: "rejected", expectedRevision: paper.revision })}>{t("rejectAll")}</Button></div>
          {preview && <section className="pw-review"><h3>{t("preview")}</h3><p>{t("copiedScope")} · {preview.candidateIds.length}</p>
            {preview.conflicts.map(item => <p key={item.candidateId}>{item.message}</p>)}
            {!!preview.includedDependencies.length && <p>{t("dependencies")} · {preview.includedDependencies.length}</p>}
            <Button size="sm" variant="outline" disabled={busy || !preview.candidateIds.length || preview.revision !== paper.revision} onClick={() => void (async () => { if (await run({ action: "decide", candidateIds: preview.candidateIds, decision: "accepted", expectedRevision: preview.revision })) { setPreview(undefined); setSelected([]); } })()}>{t("acceptScope")}</Button></section>}
          {!paper.candidates.length && <p>{t("noChanges")}</p>}
          {[...paper.candidates].reverse().map(candidate => {
            const content = <><div className="pw-actions">
            {candidate.status === "pending" && <input type="checkbox" aria-label={candidate.reason} checked={selected.includes(candidate.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, candidate.id] : ids.filter(id => id !== candidate.id))} />}
            <span className="pw-tag">{t(candidate.status)}</span><h3>{t("proposal")}</h3></div>
            <details className="pw-reason"><summary>{t("proposalReason")}</summary><p>{candidate.reason}</p></details>
            {candidate.proposalDiff && <section className="pw-change"><h3>{t("previousProposalDiff")}</h3><Diff parts={candidate.proposalDiff} collapseEqual={t("unchangedText")} /></section>}
            <details className="pw-change" open={!candidate.proposalDiff}><summary>{t("acceptedSourceDiff")}</summary>
              {candidate.diffs.map((parts, index) => <Diff parts={parts} key={index} />)}
            </details>
            {!!candidate.translations.length && <section className="pw-translation"><h3>{t("pairedTranslation")} · {t(`language_${paper.translationLanguage}`)}</h3>
              {candidate.translations.map((translation, index) => <p className="pw-chinese" key={index}>{translation.text}</p>)}
            </section>}
            {candidate.conflict && <p className="pw-error">{candidate.conflict}</p>}
            {candidate.currentSelections.some(source => source.quote) && <Button size="sm" variant="outline" onClick={() => locate(candidate.currentSelections.map(source => source.blockId))}>{t("locate")}</Button>}
            {candidate.status === "pending" && <div className="pw-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "preview", candidateIds: [candidate.id] })}>{t("preview")}</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "decide", candidateIds: [candidate.id], decision: "rejected", expectedRevision: paper.revision })}>{t("reject")}</Button></div>}
            {candidate.revisedBy && <Button size="sm" variant="outline" onClick={() => locate([candidate.revisedBy!], "candidate")}>{t("revisedProposal")}</Button>}
            {paper.readings.filter(reading => reading.candidateIds.includes(candidate.id)).map(reading => readingResult(reading, true,
              reading.findings.filter(finding => finding.candidateIds.includes(candidate.id)
                || !finding.candidateIds.length && finding.sources.some(source => candidate.currentSelections.some(selection => selection.blockId === source.blockId))))) }
            </>;
            return candidate.status === "superseded"
              ? <details key={candidate.id} className="pw-archived" data-candidate={candidate.id} tabIndex={-1}><summary>{t("previousProposals")} · {t(candidate.status)}</summary>{content}</details>
              : <article className="pw-candidate" key={candidate.id} data-candidate={candidate.id} tabIndex={-1}>{content}</article>;
          })}
        </section>}
        {tab === "feedback" && <section id={`${panelId}-feedback-panel`} role="tabpanel" aria-labelledby={`${panelId}-feedback-tab`}>
          <p>{t("commentsInDocument")}</p><p className="pw-muted">{t("savedDiscussions")} · {paper.feedback.filter(item => !item.replyTo).length} / {t("readyComments")} · {round.length}</p>
          {paper.feedback.filter(item => !item.replyTo).map(item => <article key={item.id}><p>{item.comment}</p><small>{t(item.resolved ? "resolvedComment" : "comment")}</small>
            {paper.feedback.filter(reply => reply.replyTo === item.id).map(reply => <blockquote key={reply.id}>{reply.comment}</blockquote>)}
            <Button size="sm" variant="outline" onClick={() => locate(item.sources.length ? item.sources.map(source => source.blockId) : [anchorBlock(item.target)!])}>{t("locate")}</Button></article>)}
          {paper.batches.filter(batch => batch.delivery !== "sent").map(batch => <article key={batch.id}>{batch.error && <p className="pw-error">{batch.error}</p>}<Button size="sm" variant="outline" disabled={busy || submitting} onClick={() => void submitRound(batch)}>{t("retryRound")}</Button></article>)}
        </section>}
        {tab === "readings" && <section id={`${panelId}-readings-panel`} role="tabpanel" aria-labelledby={`${panelId}-readings-tab`}><p className="pw-muted">{t("automaticReadingNotice")}</p>{!paper.readings.length && <p>{t("noReadings")}</p>}{[...paper.readings].reverse().map(reading => readingResult(reading))}</section>}
        {tab === "history" && <section id={`${panelId}-history-panel`} role="tabpanel" aria-labelledby={`${panelId}-history-tab`}>
          <div className="pw-actions"><select aria-label={t("exportVariant")} value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{(["clean", "tracked", "bilingual"] as const).map(item => <option key={item} value={item}>{t(({ clean: "cleanCopy", tracked: "trackedCopy", bilingual: "bilingualCopy" } as const)[item])}</option>)}</select>
            <select aria-label={t("exportFormat")} value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="docx">Word</option><option value="pdf">PDF</option></select>
            <Button size="sm" variant="outline" disabled={busy || paper.wordExportNeedsRestore} onClick={() => void run({ action: "export", requestId: crypto.randomUUID(), variant, format, includeReasons: true, expectedRevision: paper.revision, baselineRevision: paper.comparisonRevision })}>{t("exportFile")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "download_source" })}>{t("originalSource")}</Button></div>
          {format === "pdf" && <p className="pw-muted">{t("pdfCopy")}</p>}
          {paper.sourceResources.map(resource => <p key={resource.path}><Button size="sm" variant="outline" onClick={() => void run({ action: "download_source", resourcePath: resource.path })}>{resource.path}</Button></p>)}
          <p className="pw-muted">{t("returnInConversation")}</p>
          {paper.documentReturns.map(returned => <article key={returned.id}><strong>{returned.name}</strong>{returned.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<Button size="sm" variant="outline" onClick={() => void run({ action: "download_return", returnId: returned.id })}>{t("originalSource")}</Button></article>)}
          {paper.documentDeliveries.map(delivery => <p key={delivery.id}><Button size="sm" variant="outline" onClick={() => void run({ action: "download_delivery", deliveryId: delivery.id })}>{delivery.name}</Button></p>)}
          <article><p>{t("originalSource")} · {t("revision")} 0</p><div className="pw-actions">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "compare", revision: 0 })}>{t("compareOriginal")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "set_baseline", revision: 0, expectedRevision: paper.revision })}>{t("useComparisonBaseline")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "restore", revision: 0, expectedRevision: paper.revision })}>{t("restore")}</Button>
          </div></article>
          {paper.history.map(entry => <article key={entry.revision}><p>{t(entry.kind)} · {t("revision")} {entry.revision}</p>
            <div className="pw-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "compare", revision: entry.revision })}>{t("compare")}</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "set_baseline", revision: entry.revision, expectedRevision: paper.revision })}>{t("useComparisonBaseline")}</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "restore", revision: entry.revision, expectedRevision: paper.revision })}>{t("restore")}</Button></div></article>)}
          {paper.decisions.filter(decision => decision.decision !== "undone").map(decision => <p key={decision.id}><Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "undo", decisionId: decision.id, expectedRevision: paper.revision })}>{t("undo")} · {decision.candidateIds.length}</Button></p>)}
          {comparison?.blocks.map(block => <article key={block.id}><Diff parts={block.diff} /></article>)}
          <details><summary>{t("pdfFonts")}</summary><Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "pdf_font_settings" })}>{t("refresh")}</Button>
            <p>{t("fontShared")}</p><p className="pw-muted">{t("fontNotes")}</p>
            {pdfFonts?.diagnostic && <p className="pw-error">{pdfFonts.diagnostic}</p>}
            {pdfFonts?.canEdit && <><textarea aria-label={t("fontFolders")} value={fontFolders} onChange={event => setFontFolders(event.target.value)} />
              <div className="pw-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "configure_pdf_fonts", directories: fontFolders.split(/\r?\n/).filter(path => !!path.trim()), expectedDirectories: pdfFonts.directories, sharedPreviews: true })}>{t("fontApply")}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "configure_pdf_fonts", directories: null, expectedDirectories: pdfFonts.directories, sharedPreviews: true })}>{t("fontAutomatic")}</Button></div>
              <p className="pw-muted">{t("fontReadAgain")}</p></>}
          </details>
        </section>}
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
