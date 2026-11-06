# Native slice status

This document describes the A candidate and its current evidence, not full product
acceptance. The implementation plan and product goals remain in force.

## Implemented responsibilities

- One profile level Host plugin and one shared right sidebar tab type; no preset,
  new agent type, chat UI, input replacement or system prompt replacement.
- UI human commands and the `paper_workbench` native tool share `PaperWorkbench`.
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

## Evidence so far

On macOS arm64 with Node 25.9.0 and DSH 0.2.2-rc.1:

- Type checking and the Host/Client build pass.
- Six focused tests cover exact repeated-text selection, untouched context and
  emphasis, idempotence, stale range refusal, rejection, SDK native tracked changes,
  clean export and engine accept/reject round trips.
- The first test run exposed ProseMirror required-node generation with required
  identity attributes. The document schema now allows an empty root while the import
  operation explicitly rejects a document without body blocks. The focused rerun passes.
- The real npm DSH Web host starts in a disposable test profile. Browser automation
  reaches its native interface. The desktop browser-control connector timed out twice.

Pending: actual release-package installation, live plugin UI and native tool use,
session-entry matrix, restart/unload, Microsoft Word acceptance/rejection, rendering,
metadata inspection, public download and independent installation. SDK schema checks
and its own projection round trip are not Word client acceptance.
