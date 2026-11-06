# Native slice status

This document describes the A candidate and its current evidence, not full product
acceptance. The implementation plan and product goals remain in force.

## Implemented responsibilities

- One profile level Host plugin and one shared right sidebar tab type; no preset,
  new agent type, chat UI, input replacement or system prompt replacement.
- The sidebar's formal DSH Remote and the `paper_workbench` native tool share
  `PaperWorkbench`; the sidebar does not submit commands to the chat or agent inbox.
  The tool reads and proposes; decisions are not part of its schema or dispatcher.
- One DSH storageDomain owns paper aggregates. Its queued durable update owns a
  decision and document change together; failed writes cannot publish partial text.
- ProseMirror owns editable body structure. The original DOCX and immutable import
  baseline are projections and sources, not parallel editable documents.
- A replacement identifies the exact paper revision, persistent block and range.
  Program computed differences are retained with the reason and user decision.
- Open XML SDK 3.5.1 handles package parts, typed revisions and schema validation.
  The self contained macOS arm64 runtime is packaged; users need no .NET SDK.
- Clean and tracked DOCX export compare accepted text with the immutable import
  baseline. Workbench acceptance does not erase Word revisions against that baseline.

## Current support boundary

Editable: ordinary top-level paragraphs composed of text runs, including headings
and preserved run formatting. Bold and italic are shown in the sidebar. Replacement
text inherits the source style. One paragraph per proposal; no newline insertion.

Complex blocks, tables, fields, equations, anchored comments, hyperlinks and other
objects remain in the original package and export unchanged. They are read only in
the sidebar. Headers and footers are preserved and reported but are not displayed.
Existing simple run revisions require an explicit accept/reject choice at import;
structural or formatting revisions must first be resolved in Word.

Limits: 16 MiB compressed source, 64 MiB expanded package, 2000 parts, 5000 body
blocks, 4 million characters per XML part, and 30 seconds per engine operation.

Unimplemented in this A slice: bilingual views, comments and feedback batches,
independent reading, undo and dependency groups, from-material drafting, three-way
mentor return comparison, Markdown and PDF. These remain B–E work. After one accepted
change, other proposals from the earlier revision currently require a new read and
selection; B owns mapping unaffected selections and semantic applicability.

## Observed evidence

On macOS arm64 with Node 25.9.0 and DSH 0.2.2-rc.1:

- Type checking and the Host/Client build pass.
- Seven focused tests cover exact repeated-text selection, untouched context and
  emphasis, idempotence, stale range refusal, rejection, SDK native tracked changes,
  clean export, mixed-format replacement and engine accept/reject round trips.
- The first test run exposed ProseMirror required-node generation with required
  identity attributes. The document schema now allows an empty root while the import
  operation explicitly rejects a document without body blocks. The focused rerun passes.
- The built tarball was installed through DSH's real Plugins / Add plugin entry.
  Subsequent candidates used the same formal plugin manager. Host loading, the
  native paper tool, local Skill and right sidebar were exercised in the same
  isolated Web profile; no profile manifests were edited by hand.
- One bounded native model turn used the existing file-read tool, local revision
  Skill, paper read and paper proposal. It changed only the second of two identical
  source sentences into a pending proposal and did not accept it. This trace belongs
  to an earlier candidate; the later sidebar transport and style corrections did
  not repeat that model call. The trace is evidence for that invocation, not a new
  model run against every candidate.
- The current formal Remote passed a real installed-Host check for empty read,
  import, exact proposal, incorrect-source refusal, acceptance, export and history.
  These operations left the ordinary chat event cursor unchanged and made no
  model call. This check is available as `npm run test:host`.
- In DSH's actual interface, an existing ordinary task restored its linked paper
  and pending proposal after host restart/update. Clicking Accept changed only the
  selected second occurrence. A real mouse selection of `unverified` opened the
  exact source form; saving and rejecting that proposal left the body unchanged.
  History retained both decisions. Refresh, acceptance, proposal, rejection and
  export left the native chat cursor unchanged, the agent idle and the queue empty.
- The same sidebar remained available in a new ordinary, non-paper task with the
  standard native composer. It initially showed no linked paper; an explicit link
  loaded the existing paper and its decisions, which survived page reload. There
  was no paper preset or special task creation flow.
- The sidebar's downloaded tracked DOCX contains native insertions/deletions.
  SDK acceptance yields the changed sentence; rejection yields the original, with
  untouched bold formatting retained. Optional core/app/custom metadata was absent
  and mandatory ZIP dates were fixed to the ZIP epoch.
- Microsoft Word 16.105 opened the synthetic tracked document and displayed native
  revisions. A copy saved after accepting changes in Word has the expected accepted
  text, no remaining revisions, and three editable paragraphs on reimport. This
  Word evidence predates the word-level diff/style correction; the newer sidebar
  export has SDK evidence, but has not repeated both Word client paths.
- A generated clean DOCX was rendered and visually inspected as one page, without
  clipping and with the untouched bold text present. This render is layout QA,
  not implementation of plugin PDF export.
- Formal bundle removal reported `applied`, removed the paper plugin row and
  withdrew the Remote definition. The live sidebar body stopped rendering and its
  entry disappeared from the new-tab guide. DSH retained the already-open tab as an
  unavailable view, rather than deleting its persisted tab record. This verifies
  plugin/Remote/UI withdrawal; a new native model turn was not run while uninstalled.

## Failures retained and remaining evidence

Early real-host failures exposed an invalid storage domain name, stale modules
until restart, missing Client injection dependencies and an incorrect canonical
session lookup type. They were corrected through the same plugin installation
path. The earlier command transport wrote internal paper JSON into native chat;
it was removed in favor of DSH Remote. Old messages and failed candidates remain
as private test evidence. The browser-control extension also timed out; the later
interface checks used an owned hidden in-app browser tab.

The Word rejection path was interrupted by client file-access/open-dialog and
screen-capture failures. It is **unverified**, not passed by SDK projection. Raw
Word-saved evidence also contains Word-refilled optional metadata and is retained
as raw evidence, not offered as a cleaned final deliverable. Product-generated
exports are checked separately.

Still pending: final reviewed package reinstallation, actual Desktop plugin
activation and interface coverage, Word
acceptance and rejection of the final reviewed export, complex-object round trips,
public Release download and independent installation. Desktop application
installation alone is not plugin verification. These gaps and B–E work prevent a
full-product or complete A acceptance claim. Independent review decides the bounded
candidate's disposition; SDK checks and renders are not Word client acceptance.
