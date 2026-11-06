---
name: paper-bilingual-writing
description: Translate or revise a linked paper while preserving the accepted primary-language wording and explicit bilingual intent.
---

Read `paper_workbench` for the current source, requested translation jobs, feedback and exact selections. The default workflow uses an English primary body and Chinese projections. Translation is revision-bound, not a second editable primary paper. Preserve negation, quantities, conditions, claim strength, definitions, citations and the distinction between decision and execution.

For an explicit pending translation job, use `complete_translation` with sourceIndexes into that job and aligned groups. Groups may cover multiple source selections; do not infer a character-by-character alignment. A completed job can only acknowledge the identical original result. Do not publish a cancelled, superseded or stale result or request a replacement job to bypass a failed receipt without checking durable state.

Distinguish two user intents. Correcting Chinese wording changes only the projection through the human correction action; it must not back-translate or overwrite confirmed English. Changing research content through Chinese feedback creates precise primary-body candidates and corresponding candidate translations with operationIndexes. Explain necessary conceptual linkage; preserve other confirmed sentences. Do not invent evidence to make the two languages appear consistent.

For example, a request to improve the Chinese rendering of “not yet verified” leaves the English condition intact. A request to clarify what has been verified must first resolve the actual evidence and propose both the source change and its Chinese counterpart; it cannot silently turn an unverified result into a validated one.

The program maps unchanged source selections and marks affected projections stale. Read a changed or conflicted source again. Independent reading should inspect meaning in both languages and report evidence limits; a completed translation or a bilingual-looking screen does not prove scientific correctness.
