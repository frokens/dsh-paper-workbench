# Candidate installation

A–C and D's code/representative installed paths have received bounded independent
acceptance; see the [D review](https://github.com/frokens/dsh-paper-workbench/pull/4#pullrequestreview-5809051398).
The complete D/E exits remain open. The public test prerelease
[0.5.0-alpha.1](https://github.com/frokens/dsh-paper-workbench/releases/tag/v0.5.0-alpha.1)
is available; it is not a complete-product release. Its attachment is fixed to
implementation commit `46957f2c4dc6b40433f6bbe5fef0ab23f230768f`. Later repository
source and documentation do not rebuild or replace that attachment.

## Package and dependency

The tarball contains built Host/Client JavaScript, the self-contained DOCX engine,
four research/writing Skills, display resources and required license notices.
No source checkout, compilation, private registry or .NET SDK is required.

The declared combination is **macOS Apple silicon, Node.js 24.9 or later, DSH
0.2.2-rc.1 Web**. The package restricts its OS and CPU accordingly. The official
Mac application's own existing host/profile is the desktop acceptance route.
Its [alpha1 native installation/sidebar check](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6703848563)
has bounded real evidence, including ordinary-task translation and fresh reading.
That window used the old forms/manual trigger. The current source's main-chat
input, comments and automatic-reading interaction awaits a new reviewed package
and native check; it is not contained in the frozen alpha1. Other combinations
remain unverified.

The [independent public-attachment check](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6701853484)
downloaded anonymously, installed through DSH's native API, matched all 40 package
files and four installed Skill paths, and read nine ordinary tasks without changing
their data, model defaults or the existing UI target. The dependency cache already
existed. This is API installation evidence, not a visible-UI or completely cold
installation test. See the [current support matrix](reference/dsh-integration.md#4-支持矩阵)
for Word, Desktop, task-entry and font limits.

DSH's installer obtains the exact public dependency `pandoc-wasm@1.1.0` and its
WASI shim. The published dependency already includes Pandoc 3.10; no separate Pandoc
command, compiler or installation-time downloader is needed. First installation
needs a public npm registry. A plugin tarball alone does not guarantee offline first
installation. Later Markdown conversion uses the installed runtime and supplied
resources without downloading images, bibliography files or converters.

See [third-party notices](../THIRD_PARTY_NOTICES.md) for licenses and version/source
links. The plugin's own MIT license is unchanged.

## Formal entry

1. Download the [alpha1 tarball](https://github.com/frokens/dsh-paper-workbench/releases/download/v0.5.0-alpha.1/dsh-paper-workbench-0.5.0-alpha.1.tgz)
   and its [SHA256 file](https://github.com/frokens/dsh-paper-workbench/releases/download/v0.5.0-alpha.1/dsh-paper-workbench-0.5.0-alpha.1.tgz.sha256).
   The tarball is 32,932,855 bytes; its SHA256 is
   `12931815a95dabbef926511a09a2b64521ee5f86b29dfdd7a49a3059e4a29464`.
2. In DSH, open **Plugins**, then **Add plugin**.
3. Enter the downloaded tarball's local file path and choose **Install**.
4. Read the result. If DSH requests a restart, restart that same host/profile.
5. The native sidebar is available in ordinary tasks without replacing the main
   Agent. Frozen alpha1 retains its historical workflow. In the clarified current
   source, document input belongs to the original main conversation: attach a
   file, mention @file, supply a path/link, or request a new draft. The ordinary
   Agent calls the shared backend and the associated document opens in the sidebar.

Use DSH's own installation/removal actions; do not edit its package manifest or
plugin patch by hand. An installed package or enabled selection alone does not prove
that Host, Client and tools loaded. Restart, upgrade and removal need separate checks.

If a dependency download fails, inspect DSH's installation details, restore network
access and retry. Do not enable arbitrary build scripts or install another Pandoc.
If the installed Markdown runtime is missing, reinstall through **Plugins** and
restart that profile. This failure does not replace an already linked paper.

## Documents and delivery

This section describes the current source workflow, awaiting a reviewed new package
and native check. The frozen alpha1 retains its historical interaction.

State a different primary language in the main conversation when needed. English
is the default and projects Chinese; an explicit Chinese primary projects English.
The Agent supplies that choice; no name/language/goal form is required. The choice
belongs to that Paper and is retained when
linking it from another ordinary task. It does not follow the interface language,
and linking does not change it. Existing records retain the earlier English default.
The source and translation headings display the selected pair. Translation jobs,
candidate projections and frozen independent-reading material use the same choice.

DOCX text paragraphs are editable. Fields, equations, tables, figures, notes and
other complex objects stay in the source package as read-only blocks. Read the import
diagnostics and retain the original. Supported existing body revisions require an
explicit accept/reject projection. Revisions in preserved headers, footers, notes
or unsupported structures must first be handled in Word.

For Markdown, the ordinary Agent investigates the main file and referenced images,
bibliography and optional CSL with DSH's file tools, then passes readable file
references to the same import owner. Links use the existing investigation/download
capabilities first; the plugin does not add an HTTP, permission or file stack.
Document bytes stay in the backend instead of travelling through model arguments.
Native
tables/math/notes and supplied media pass through the converter; complex Word objects
remain read only. Raw HTML/TeX is literal. Missing resources or conversion warnings
stop intake. LaTeX, PDF and OCR import are not complete supported routes.

In **History**, select the comparison baseline. Rejecting all native Word revisions
restores it; accepting workbench candidates does not erase the teacher's comparison.
Export clean, tracked or bilingual DOCX/PDF through **History**. Bilingual
output requires complete current translated paragraph groups. Delivered files are
immutable receipts that can be downloaded again. Exact source and return originals
are available separately from metadata-clean derived exports.

For a returned primary-language DOCX, attach it in the main conversation. The
ordinary Agent uses its file reference and the actual embedded delivery marker.
Missing/ambiguous baselines or unresolved-revision choices require clarification
there; the sidebar has no return upload, delivery-ID or manual-mapping form.
Comparison uses delivered E, returned R and current P. Ambiguous paragraph
alignment requires the user's content-based clarification rather than a guess. Exact
conflict-free text changes become pending candidates and preserve unrelated local
edits. Formatting, moves and unmatched paragraph changes require review in the
original return; the text-only proposal does not apply them. Supported comment text
can be copied to feedback only at an exact current range. Rich comments remain in
the original return.

PDF uses DSH's shared Office provider and font configuration. The plugin neither
replaces shared font settings nor starts another converter. On the test machine,
default font discovery reproduced a blocked worker; explicit system-font directory
configuration converted bounded fixtures. This does not fix or establish default
scan/cancellation behavior. In **History**, choose PDF and open **PDF font
settings**. Read the existing folders, review the shared-preview and configuration
notes, and choose the folders before explicitly applying. **Apply shared font
settings** saves the listed folders through DSH; **Automatic font discovery**
explicitly restores the provider's discovery choice.
Closing without applying keeps the existing settings. Existing fallback preferences
and other raw settings are retained. Saving may remove comments inside the target
Office settings block. If a request is cancelled or the connection reloads during
application, read the current settings again before retrying.

This configuration uses DSH's existing provider and editor. It does not repair the
default font scan or its graceful exit. Shared changes affect other previews and
may exclude Office fonts. The configured test profile has actual PDF, cancellation,
reload and same-profile graceful restart evidence. Default discovery and complete
product acceptance remain open. Check missing-font warnings and rendered pages
before sharing.

## Data, updates and removal

DSH storage retains paper aggregates, originals, feedback, decisions and delivery/
return receipts after removal. Current source storage format 4 reads formats 1–3 in place
(the frozen alpha1 uses format 3);
older candidates may not reopen newer records. Test upgrades on disposable data.

A historical B restoration may lack its precise Word comparison. The sidebar reports
this and blocks export. In **History**, explicitly restore the intended revision even
if its visible body is identical. This records the actual relationship and retains
the old entry.

Comments and replies autosave at their source/translation location without a model
request. **Submit this round of comments** saves the batch and dispatches it through
the current ordinary Agent in one action. Failed delivery retries that same batch
and native prompt identity. Import prepares paragraph translation jobs for the
already-running ordinary Agent to complete in that turn, with no second Send.

When the complete writing candidate combination reaches DSH's formal turn boundary,
the Host starts one fresh independent reader automatically. First drafts and
main-chat revisions use this same path; unrelated answers, translation-only jobs
and the reader's own turn do not start more paper readers. Findings and limits are
read only. A stopped/failed reading can retry its saved scope without goal/evidence
forms. Only the user accepts/rejects; automatic reading is not automatic acceptance.
These entry and trigger changes need a reviewed new package and native acceptance;
the frozen public alpha1 retains its earlier interaction.

Developer fixtures use `npm run fixture:word -- prepare <new-test-directory>` and
refuse to overwrite files. Microsoft Word must create the actual accepted, rejected
and returned copies before verification. SDK settling, schema checks and preview
PDFs do not establish those actions. See [D status](reference/document-delivery-status.md)
and [earlier native evidence](reference/native-slice-status.md) for open gates.
