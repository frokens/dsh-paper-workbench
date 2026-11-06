# Bilingual and revision lifecycle status

Status: B implementation in progress, not independently accepted. Candidate
version: 0.2.0-alpha.1. The original A package and synthetic Word files are retained;
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

Type checking, Host/Client build, package creation and 34 focused checks currently pass. These include
the original DOCX regressions, native style restoration after undo/restore and 14
lifecycle cases for repeated ranges, atomic groups/dependencies, split/merge IDs,
unrelated and conflicting edits, Chinese correction/content intent, late/cancelled
translation, restart serialization and installed aggregate upgrade. These are owner
and SDK checks, not installed-client or model acceptance.

Four checks also call the production Host handler and observation owner over the
real DSH storageDomain and JSON backend with explicit fault injection. They cover
failed durable decisions without published text/events, same-data close/reopen,
queued cancellation, concurrent acceptance, stream cancellation and stable retry
identity/content after a simulated prompt reply loss. The prompt is a test stub in
that fault test; it is not evidence of the installed Agent or model.

The accurate B package still needs installation in the existing disposable Web
profile, migration/restart inspection, the formal stream and representative UI/tool
use. B has made no new paid model call. Native Word and Desktop frontend acceptance
remain open; A's earlier limited evidence is retained separately.

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
