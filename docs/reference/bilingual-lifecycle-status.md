# Bilingual and revision lifecycle status

Status: B implementation in progress, not independently accepted. Candidate
version: 0.2.0-alpha.3. The original A package and synthetic Word files are retained;
the remaining real Word and Desktop checks are not replaced by these changes.

## Implemented ownership

The ordinary sidebar Remote and native paper tool still share `PaperWorkbench`.
No paper preset, replacement composer, second main Agent, provider client or model
runtime is introduced. Saving paper data does not send a prompt. The separate human
Send action uses DSH's existing session prompt API, queues onto the same task and
reuses a stable native request identity after response loss.

One storageDomain aggregate holds the editable ProseMirror body, immutable import
baseline and original package, actual steps/inverse steps, candidates, decisions,
feedback, batches and translation projections. Version 2 admits the installed
version 1 schema only to upgrade it in place. The upgrade reads original run
boundaries with the existing SDK, replays decisions, retains persistent IDs and
verifies the visible accepted body before writing. It neither clears old data nor
creates another editable document.

`operations.ts` owns replace/split/merge semantics. Acceptance persists actual
ProseMirror steps, including the new paragraph ID created by a split. Replay,
restore and undo consume those steps rather than rerunning random ID creation.
Native format marks are references into immutable source runs, not copied Word
format data. The same body and journal feed range mapping, undo and DOCX export.

Candidates are semantic groups with program-computed differences and explicit
feedback/dependencies. Preview reports the executable scope, included prerequisites
and conflicts. Accept commits the displayed scope atomically; reject preserves
history. Undo maps inverse steps across unrelated later changes and refuses
conflicting content or accepted dependents. History comparison and explicit restore
append changes without erasing prior decisions.

Inverse steps reference their actual source step positions in this same journal.
Word projection uses ProseMirror mirror mappings to cancel net-zero undo/restore
changes while retaining source run formatting; it does not rediff a plain-text
paragraph. Restore selects the still-active steps between current and target,
rebases their inverses through the same actual mappings, and appends only those
net steps. It neither recursively expands earlier restores nor replaces the full
document. An older installed undo can recover its explicit source from the retained
`undoOf` decision. An older full-document restore remains as recorded; explicitly
restoring a selected historical revision appends the precise inverse relationship
without rewriting that earlier record. Until that explicit choice, the sidebar
shows an actionable notice and disables Word export; the Host also refuses it.
Candidate navigation consumes current exact
selections from the existing mapping owner, leaving original operations immutable.

Translations bind to exact source selections/revisions. Groups can map many to
many. Late results cannot replace a changed source or corrected translation;
cancelled/superseded requests cannot publish. A translation correction changes
only that projection's version. Chinese content feedback binds the whole aligned
source group and produces a source candidate with its corresponding Chinese
projection. Unaffected translations retain mapped references; affected ones are
marked stale. Neither path back-translates the full body.

Client observation uses the formal DSH Remote stream and post-durability domain
events. There is no new HTTP service or polling owner. Requests and streams release
their resources on cancellation/unload; cancelling a translation job blocks its
result without cancelling an unrelated ordinary Agent turn.

## Evidence and limits

The first candidate passed type checking, Host/Client build, package creation and
34 focused checks. Its independent review then reproduced three defects: undo and
full-document restore left net-zero Word revisions; comparing after merge called
equality on an absent node; candidate navigation used a pre-split block ID. The
original failures and exports are retained. The correction adds five regressions
for net Word scope, repeated restoration, older restore history, removed/added
comparison nodes and the current exact candidate target. Existing checks include
the original DOCX regressions, native style restoration after undo/restore and 14
lifecycle cases for repeated ranges, atomic groups/dependencies, split/merge IDs,
unrelated and conflicting edits, Chinese correction/content intent, late/cancelled
translation, restart serialization and installed aggregate upgrade. These are owner
and SDK checks, not installed-client or model acceptance.

The alpha.2 correction passed type checking, 39 owner/SDK checks, Host/Client build and
the developer Word fixture preparation command. The public installed-Host test
now consumes the current operations/scope contracts through the official DSH
Client and also checks stream updates, split targets and comparison after merge.

A subsequent independent review and the first actual ordinary-Agent request exposed
two further failures. Repeated restoration expanded previously generated inverse
steps exponentially. Also, a successful send retained an optional `error: undefined`
in the aggregate: Remote JSON serialization hid it, but the native tool correctly
rejected the in-memory return as non-lossless JSON. Translation had durably completed
while its tool receipt failed. The test Agent's additional diagnostic work was
cancelled; that attempt is not model acceptance. Its raw evidence is retained
privately, and the local bootstrap credential seen in one diagnostic result was
rotated with old-link rejection and new-link authentication checked.

The alpha.3 correction passes type checking, 42 owner/SDK checks and the Host/Client
build. It omits the optional error at its existing delivery owner.
Production Host native dispatch is checked with DSH's own lossless JSON predicate
before serialization, including completion and clearing a previous failure. The
restoration checks cover 100 alternating restores and active edits across cancelled
prefixes and overlapping later edits. A one-character transition appends its two
primitive steps each time, keeping all history with linear growth. Further model
requests are paused pending this tool-contract review.

Four checks also call the production Host handler and observation owner over the
real DSH storageDomain and JSON backend with explicit fault injection. They cover
failed durable decisions without published text/events, same-data close/reopen,
queued cancellation, concurrent acceptance, stream cancellation and stable retry
identity/content after a simulated prompt reply loss. The prompt is a test stub in
that fault test; it is not evidence of the installed Agent or model.

The first B package was installed through the formal plugin manager and restarted
in the same disposable Web profile. Eight existing synthetic papers and six
bindings retained their bodies, original packages, candidates and decisions. A
real official Connection/Gateway Client exercised the installed Remote stream,
decisions, feedback, translation cancellation, undo and restore with the ordinary
chat cursor unchanged and no model call. That run exposed the restore export
failure above; it is not proof of the corrected package.

The correction candidate's affected installed Host/UI checks and bounded ordinary
Agent translation/proposal evidence are tracked against the exact head/package in
[PR #2](https://github.com/frokens/dsh-paper-workbench/pull/2). Stub prompt tests
remain separate. Native Word and Desktop frontend acceptance remain open; A's
earlier limited evidence is retained separately.

Word export currently supports the original paragraph layout. A changed split/merge
layout is explicitly refused while retaining the accepted body and full history;
the paragraph-boundary Word adapter remains D work. Undo/restoring the original
layout re-enables that export path. Complex Word objects remain preserved read only.
Independent fresh-session reading, full research writing, mentor returns and PDF
are still C–E work, not implied by B's candidate status.

After functional acceptance, the sidebar display and usability closing pass must
check refresh/save status, bilingual alignment/staleness, annotation locating,
actual differences and the hierarchy of item/group/all decisions in the real DSH
sidebar. Colors alone are not acceptance. The native conversation and main Agent
remain outside that UI work.
