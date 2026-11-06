import * as React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-api-gateway/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { Selection, UiRequest } from './contracts.js';
import type { paperView } from './model.js';
import { remoteInfo } from './remote.js';

type PaperView = ReturnType<typeof paperView>;
type View = { paper: PaperView | null; available: { id: string; name: string }[] };
type Reply = View & { base64?: string; name?: string };
type Props = { sessionId: SessionId; call: (sessionId: SessionId, request: object, signal: AbortSignal) => Promise<Reply>; t: (key: string) => string };
export const inject = ['sidebarRightTabs', 'slots', 'locale', 'remote'];
const id = 'dsh-paper-workbench';

const en = {
  title: 'Paper workbench', description: 'Read a paper and review precise revisions in this task', loading: 'Loading…', refresh: 'Refresh', empty: 'No paper is linked to this task.',
  scope: 'Import a DOCX or explicitly link an existing paper. Your current conversation and agent stay here.', upload: 'Import DOCX', link: 'Link a paper', choose: 'Choose a paper',
  revisionMode: 'Existing Word revisions', requireChoice: 'Ask before resolving', acceptExisting: 'Accept existing revisions', rejectExisting: 'Reject existing revisions',
  select: 'Select text in one paragraph to propose a precise change.', selected: 'Selected source', replacement: 'Replacement', reason: 'Reason', propose: 'Save proposal',
  revisions: 'Proposals', history: 'Decisions', accepted: 'Accepted', rejected: 'Rejected', pending: 'Pending', accept: 'Accept', reject: 'Reject',
  unreviewed: 'Independent reading has not been implemented in this slice.', exportTracked: 'Export tracked DOCX', exportClean: 'Export clean DOCX',
  baseline: 'Word revisions compare the accepted body with the imported baseline. Accepting here keeps that comparison.',
  unsupported: 'Preserved read only', busy: 'Saving…', cancel: 'Cancel', exactRange: 'Select text within a single editable paragraph.', stale: 'The paper changed. Select the current text again.',
};
const zh: typeof en = {
  title: '论文工作台', description: '在当前任务阅读论文并审阅准确修订', loading: '加载中…', refresh: '刷新', empty: '当前任务尚未关联论文。',
  scope: '导入 DOCX 或明确关联已有论文。当前对话与 Agent 保持原样。', upload: '导入 DOCX', link: '关联论文', choose: '选择论文',
  revisionMode: '原有 Word 修订', requireChoice: '处理前询问', acceptExisting: '接受原有修订', rejectExisting: '拒绝原有修订',
  select: '在一个段落中选择文字，提出准确的局部修改。', selected: '所选原文', replacement: '替换内容', reason: '修改理由', propose: '保存候选',
  revisions: '候选修改', history: '决定记录', accepted: '已接受', rejected: '已拒绝', pending: '待处理', accept: '接受', reject: '拒绝',
  unreviewed: '本批尚未实现独立审读。', exportTracked: '导出修订 DOCX', exportClean: '导出干净 DOCX',
  baseline: 'Word 修订比较已接受正文与导入基准。在此接受修改后，导出仍保留差异。',
  unsupported: '原样保留且只读', busy: '保存中…', cancel: '取消', exactRange: '请在同一可编辑段落中选择文字。', stale: '正文已更新，请重新选择当前文字。',
};

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { paperWorkbench: keyof typeof en } }

function download(base64: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Workbench({ sessionId, call, t }: Props) {
  const [view, setView] = React.useState<View>();
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [selection, setSelection] = React.useState<Selection>();
  const [replacement, setReplacement] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [mode, setMode] = React.useState('');
  const [linked, setLinked] = React.useState('');
  const controller = React.useRef<AbortController | undefined>(undefined);
  const paper = view?.paper;

  async function run(request: object) {
    const active = new AbortController();
    controller.current?.abort(); controller.current = active;
    setBusy(true); setError('');
    try {
      const response = await call(sessionId, request, active.signal);
      if (active.signal.aborted) return;
      if (response.base64) download(response.base64, response.name!);
      else { setView(response); setSelection(undefined); }
    } catch (e) { if (!active.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (controller.current === active) setBusy(false); }
  }

  React.useEffect(() => { void run({ action: 'read' }); return () => controller.current?.abort(); }, [sessionId]);

  function capture(event: React.SyntheticEvent<HTMLDivElement>) {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !paper) return;
    const range = selected.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement;
    const element = start?.closest('[data-paper-block]');
    if (!element || element !== end?.closest('[data-paper-block]') || !event.currentTarget.contains(element)) { setError(t('exactRange')); return; }
    const block = paper.blocks.find(b => b.id === element.getAttribute('data-paper-block'));
    if (!block?.editable) { setError(t('exactRange')); return; }
    const prefix = document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(range.startContainer, range.startOffset);
    const from = prefix.toString().length, quote = range.toString();
    if (block.text.slice(from, from + quote.length) !== quote) { setError(t('stale')); return; }
    setSelection({ ...block.selection, from, to: from + quote.length, quote }); setReplacement(quote); setError('');
  }

  async function upload(file: File) {
    if (file.size > 16 * 1024 * 1024) { setError('DOCX exceeds 16 MiB.'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await run({ action: 'import', name: file.name, base64: btoa(binary), ...(mode ? { revisionMode: mode } : {}) });
  }

  return <section className="paper-workbench" aria-label={t('title')}>
    <style>{`.paper-workbench{height:100%;overflow:auto;padding:18px;box-sizing:border-box;color:inherit;font:14px/1.65 inherit}.paper-workbench button,.paper-workbench select,.paper-workbench textarea{font:inherit;color:inherit;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:8px;background:transparent;padding:7px 10px;max-width:100%;box-sizing:border-box}.paper-workbench button{cursor:pointer}.paper-workbench button:disabled{opacity:.5;cursor:default}.paper-workbench button:focus-visible,.paper-workbench textarea:focus-visible,.paper-workbench select:focus-visible{outline:2px solid #5d8dd5;outline-offset:2px}.paper-workbench .paper-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.paper-workbench label{display:block;margin:10px 0}.paper-workbench textarea{display:block;width:100%;min-height:75px}.paper-workbench article{border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);padding:14px 0}.paper-workbench .paper-body{white-space:pre-wrap;font-family:Georgia,'Times New Roman',serif;font-size:16px}.paper-workbench .paper-muted{opacity:.7;font-size:12px}.paper-workbench .paper-error{border:1px solid #bd6464;border-radius:8px;padding:10px;white-space:pre-wrap}.paper-workbench ins{background:#c9ebd533;color:inherit;text-decoration:underline}.paper-workbench del{background:#efb9b933;color:inherit}.paper-workbench blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #8296b4}.paper-workbench h2{font-size:18px;margin:12px 0}.paper-workbench h3{font-size:15px;margin:10px 0}`}</style>
    <div className="paper-actions"><button disabled={busy} onClick={() => void run({ action: 'read' })}>{t('refresh')}</button>{busy && <button onClick={() => controller.current?.abort()}>{t('cancel')}</button>}<span role="status">{busy ? t('busy') : ''}</span></div>
    {error && <p role="alert" className="paper-error">{error}</p>}
    {!view && !error && <p>{t('loading')}</p>}
    {view && <>
      {!paper && <><h2>{t('empty')}</h2><p>{t('scope')}</p></>}
      <details open={!paper}><summary>{t('upload')} / {t('link')}</summary>
        <label>{t('revisionMode')}<select aria-label={t('revisionMode')} value={mode} onChange={e => setMode(e.target.value)}><option value="">{t('requireChoice')}</option><option value="accept">{t('acceptExisting')}</option><option value="reject">{t('rejectExisting')}</option></select></label>
        <label>{t('upload')}<input type="file" aria-label={t('upload')} accept=".docx" disabled={busy} onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); e.target.value = ''; }} /></label>
        {view.available.length > 0 && <div className="paper-actions"><select aria-label={t('link')} value={linked} onChange={e => setLinked(e.target.value)}><option value="">{t('choose')}</option>{view.available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button disabled={!linked || busy} onClick={() => void run({ action: 'link', paperId: linked })}>{t('link')}</button></div>}
      </details>
      {paper && <>
        <h2>{paper.name}</h2>{paper.warnings.map((warning, i) => <p className="paper-muted" key={i}>{warning}</p>)}
        <p className="paper-muted">{t('select')}</p>
        <div onMouseUp={capture} onKeyUp={capture}>{paper.blocks.map(block => <article key={block.id}>
          <div className="paper-body" data-paper-block={block.id} style={block.heading ? { fontWeight: 600 } : undefined}>{block.editable ? block.runs.map((run, i) => <span key={i} style={{ fontWeight: run.marks.includes('bold') ? 700 : undefined, fontStyle: run.marks.includes('italic') ? 'italic' : undefined }}>{run.text}</span>) : block.text}</div>
          {!block.editable && <small>{t('unsupported')}: {block.reason}</small>}
        </article>)}</div>
        {selection && <form onSubmit={e => { e.preventDefault(); void run({ action: 'propose', requestId: crypto.randomUUID(), selection, replacement, reason }); }}>
          <h3>{t('selected')}</h3><blockquote>{selection.quote}</blockquote>
          <label>{t('replacement')}<textarea aria-label={t('replacement')} value={replacement} onChange={e => setReplacement(e.target.value)} /></label>
          <label>{t('reason')}<textarea required aria-label={t('reason')} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button disabled={busy || !reason.trim() || replacement === selection.quote}>{t('propose')}</button>
        </form>}
        <h3>{t('revisions')}</h3><p className="paper-muted">{t('unreviewed')}</p>
        {paper.candidates.map(candidate => <article key={candidate.id} data-candidate={candidate.id}>
          <div>{candidate.diff.map((part, i) => part.kind === 'insert' ? <ins key={i}>{part.text}</ins> : part.kind === 'delete' ? <del key={i}>{part.text}</del> : <span key={i}>{part.text}</span>)}</div>
          <p>{candidate.reason}</p><small>{t(candidate.status)}</small>
          {candidate.status === 'pending' && <div className="paper-actions"><button disabled={busy} onClick={() => void run({ action: 'decide', candidateId: candidate.id, decision: 'accepted' })}>{t('accept')}</button><button disabled={busy} onClick={() => void run({ action: 'decide', candidateId: candidate.id, decision: 'rejected' })}>{t('reject')}</button></div>}
        </article>)}
        <details><summary>{t('history')} ({paper.decisions.length})</summary>{paper.decisions.map((d, i) => <p key={i}>{t(d.decision)} · {paper.candidates.find(c => c.id === d.candidateId)?.reason}</p>)}</details>
        <p className="paper-muted">{t('baseline')}</p><div className="paper-actions"><button disabled={busy} onClick={() => void run({ action: 'export', tracked: true })}>{t('exportTracked')}</button><button disabled={busy} onClick={() => void run({ action: 'export', tracked: false })}>{t('exportClean')}</button></div>
      </>}
    </>}
  </section>;
}

export async function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register('paperWorkbench', { en, zh }));
  const t = ctx.locale.bind('paperWorkbench');
  const disposeRemote = await ctx.remote.$mount(remoteInfo);
  ctx.effect(() => disposeRemote);
  ctx.inject(['remote', 'remote.paperWorkbench'], scope => {
    scope.effect(() => scope.sidebarRightTabs.register({ id, kind: 'paper-workbench', title: () => t('title'),
      guide: [{ id: 'open', order: 35, title: () => t('title'), description: () => t('description'), icon: () => <span aria-hidden="true">▤</span> }] }));
    async function call(sessionId: SessionId, request: object, signal: AbortSignal): Promise<Reply> {
      const result = await scope.remote.paperWorkbench.userAction(sessionId, request as UiRequest, signal);
      if (!result.ok) throw new Error(result.error.message);
      return result.value as Reply;
    }
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: id,
      inject: () => ({ call, t }),
    }, Workbench)));
  });
}
