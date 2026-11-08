# Bilingual and revision lifecycle status

Status: bounded B code and its representative native path independently accepted
in [PR #2](https://github.com/frokens/dsh-paper-workbench/pull/2), reviewed at
`7936adcef50222002a5284130d6f9cc07a770afd` and merged as `f398f95`.
Accepted package: 0.2.0-alpha.3. The original A package and synthetic Word files are retained;
complex Word return/layout checks remain extensions. The current minimum file loop
has separate bounded evidence; complete Desktop workflow remains open. Later Word/Mac and
published alpha2 evidence is recorded in the
[current delivery status](document-delivery-status.md#current-e-prerelease-consumers)
and [support matrix](https://github.com/frokens/dsh-paper-workbench/blob/v0.5.0-alpha.5/docs/reference/dsh-integration.md#4-支持矩阵).

## Implemented ownership

The ordinary sidebar Remote and native paper tool still share `PaperWorkbench`.
No paper preset, replacement composer, second main Agent, provider client or model
runtime is introduced. Current source keeps document input in the native main
conversation. Comment drafts autosave without a prompt; one human round submission
persists the batch and uses DSH's existing session prompt API on the same task,
reusing its identity after response loss. Submission checks the saved comment
versions atomically so a concurrent edit cannot enter a round the user did not read.
Mutable discussion resolution is excluded from the dispatch content; a response-loss
retry keeps both the original prompt identity and its exact submitted content.
The document's comment editors stay mounted across sidebar tabs and same-task
stream reconnects. Refresh retains unconfirmed text, anchors and the original save
attempt; it does not reset the task's comment state. An older observation cannot
roll back an acknowledged save version or overwrite dirty/in-flight text. Current
saved anchors remain highlighted; stale locations are not guessed. Earlier B/alpha1 evidence below covers the
old separate-save/send workflow, not native acceptance of the new interaction.
Published alpha2 has independent package/public-install checks and an actual
current native DOCX import, same-turn paragraph Chinese, local candidate and
completed automatic reader. Its computed edit adds only `observed ` while the
paired Chinese covers that complete changed sentence; unaffected paragraph
translations are retained. The subsequent explicit human decision and actual
tracked download received [bounded independent file acceptance](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6710057046).
This evidence does not establish visible comment
autosave/one-submit interaction or whole-paper bilingual quality.

One storageDomain aggregate holds the editable ProseMirror body, immutable import
baseline and original package, actual steps/inverse steps, candidates, decisions,
feedback, batches and translation projections. Current domain version4 admits
versions1–3; optional creation/turn provenance and versioned discussion state stay
in these same records. The existing version1 upgrade reads original run
boundaries with the existing SDK, replays decisions, retains persistent IDs and
verifies the visible accepted body before writing. It neither clears old data nor
creates another editable document.

Draft comment edits use expected versions and keep their original anchors. Once
submitted or frozen into candidates/readings, comment content is immutable;
discussion replies append Feedback records, and resolve/reopen is discussion state,
not a source decision. Candidate translations cover exactly the chosen operations'
resulting ranges. The program does not infer a full sentence from translation text;
a suitable source scope can retain the same minimal physical edit Steps. Bilingual
export still requires complete current paragraph groups and rejects partial ones.

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
the developer Word fixture preparation command. At that B stage the installed-Host test
consumed the operations/scope contracts through the official DSH
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
primitive steps each time, keeping all history with linear growth. Independent
review rechecked the original failures, native JSON returns and installed package.

A subsequent request in the earlier test task was stopped after reading an
engineering driver outside its limited paper task; it did not reach the paper tool
and is not a JSON regression failure. A new ordinary standard task then linked the
same existing synthetic paper and unchanged configured model. One explicit Send
successfully read the paper, acknowledged the original completed job with its
identical original result, and proposed the requested English sentence with its
Chinese counterpart and feedback link. All three actual paper-tool receipts
succeeded; the candidate stayed pending, source revision 2 and the old translation
and job were unchanged, and the session ended idle with no queued or pending input.
The earlier failed/stopped attempts remain preserved. This representative path,
42 checks and installed sidebar/stream evidence were independently verified in the
[six-direction review](https://github.com/frokens/dsh-paper-workbench/pull/2#pullrequestreview-5804575270).

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

The following is the historical B package boundary; current delivery is described
in the [D/E record](document-delivery-status.md).
At B, Word export supported the original paragraph layout. A changed split/merge
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
