# Candidate installation

A–C and D's code/representative installed paths have received bounded independent
acceptance; see the [D review](https://github.com/frokens/dsh-paper-workbench/pull/4#pullrequestreview-5809051398).
The complete D exit remains open. A complete public Release has not been published. This page records the
candidate's formal installation path and support boundaries; it does not establish
full product, Microsoft Word, Desktop, all ordinary-task entries, actual font-form
interaction, public installation or cross-platform acceptance.

## Package and dependency

The tarball contains built Host/Client JavaScript, the self-contained DOCX engine,
four research/writing Skills, display resources and required license notices.
No source checkout, compilation, private registry or .NET SDK is required.

The declared combination is **macOS Apple silicon, Node.js 24.9 or later, DSH
0.2.2-rc.1 Web**. The package restricts its OS and CPU accordingly. Desktop and
other combinations remain unverified.

DSH's installer obtains the exact public dependency `pandoc-wasm@1.1.0` and its
WASI shim. The published dependency already includes Pandoc 3.10; no separate Pandoc
command, compiler or installation-time downloader is needed. First installation
needs a public npm registry. A plugin tarball alone does not guarantee offline first
installation. Later Markdown conversion uses the installed runtime and supplied
resources without downloading images, bibliography files or converters.

See [third-party notices](../THIRD_PARTY_NOTICES.md) for licenses and version/source
links. The plugin's own MIT license is unchanged.

## Formal entry

1. Obtain the reviewed candidate tarball from its GitHub Release when published.
   During review, use the exact candidate asset identified by the PR.
2. In DSH, open **Plugins**, then **Add plugin**.
3. Enter the downloaded tarball's local file path and choose **Install**.
4. Read the result. If DSH requests a restart, restart that same host/profile.
5. In any ordinary task, open the right sidebar and select **Paper workbench**.
   Import DOCX/Markdown, link an existing paper, or start a draft from materials.
   These document actions do not create or replace the main Agent.

Use DSH's own installation/removal actions; do not edit its package manifest or
plugin patch by hand. An installed package or enabled selection alone does not prove
that Host, Client and tools loaded. Restart, upgrade and removal need separate checks.

If a dependency download fails, inspect DSH's installation details, restore network
access and retry. Do not enable arbitrary build scripts or install another Pandoc.
If the installed Markdown runtime is missing, reinstall through **Plugins** and
restart that profile. This failure does not replace an already linked paper.

## Documents and delivery

For a new draft or source import, choose its primary language before creating or
uploading it. English is the default and projects Chinese; an explicit Chinese
primary projects English. The choice belongs to that Paper and is retained when
linking it from another ordinary task. It does not follow the interface language,
and linking does not change it. Existing records retain the earlier English default.
The source and translation headings display the selected pair. Translation jobs,
candidate projections and frozen independent-reading material use the same choice.

DOCX text paragraphs are editable. Fields, equations, tables, figures, notes and
other complex objects stay in the source package as read-only blocks. Read the import
diagnostics and retain the original. Supported existing body revisions require an
explicit accept/reject projection. Revisions in preserved headers, footers, notes
or unsupported structures must first be handled in Word.

For Markdown, choose the main file and supply referenced images, bibliography and
optional CSL with paths relative to it. The folder picker stages files for explicit
selection; it does not grant arbitrary filesystem or network access. Native
tables/math/notes and supplied media pass through the converter; complex Word objects
remain read only. Raw HTML/TeX is literal. Missing resources or conversion warnings
stop intake. LaTeX, PDF and OCR import are not complete supported routes.

In **History**, select the comparison baseline. Rejecting all native Word revisions
restores it; accepting workbench candidates does not erase the teacher's comparison.
Export clean, tracked or bilingual DOCX/PDF through **Document delivery**. Bilingual
output requires complete current translated paragraph groups. Delivered files are
immutable receipts that can be downloaded again. Exact source and return originals
are available separately from metadata-clean derived exports.

For a returned primary-language DOCX, select the file actually delivered and explicitly
resolve revisions in the return. Comparison uses delivered E, returned R and current
P. Changed or ambiguous paragraph identifiers require human alignment. Exact
conflict-free text changes become pending candidates and preserve unrelated local
edits. Formatting, moves and unmatched paragraph changes require review in the
original return; the text-only proposal does not apply them. Supported comment text
can be copied to feedback only at an exact current range. Rich comments remain in
the original return.

PDF uses DSH's shared Office provider and font configuration. The plugin neither
replaces shared font settings nor starts another converter. On the test machine,
default font discovery reproduced a blocked worker; explicit system-font directory
configuration converted bounded fixtures. This does not fix or establish default
scan/cancellation behavior. In **Document delivery**, choose PDF and open **PDF font
settings**. Read the existing folders, review the shared-preview and configuration
notes, and choose the folders before explicitly applying. **Use tested system
folders** only fills the draft; **Apply shared font settings** saves it through DSH.
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
return receipts after removal. Storage format 3 reads earlier formats in place;
older candidates may not reopen newer records. Test upgrades on disposable data.

A historical B restoration may lack its precise Word comparison. The sidebar reports
this and blocks export. In **History**, explicitly restore the intended revision even
if its visible body is identical. This records the actual relationship and retains
the old entry.

Saving feedback or translation requests is separate from **Send to current Agent
(uses model)**. Only explicit send queues work on the ordinary Agent. Sidebar reads,
decisions and document actions do not create model requests.

Developer fixtures use `npm run fixture:word -- prepare <new-test-directory>` and
refuse to overwrite files. Microsoft Word must create the actual accepted, rejected
and returned copies before verification. SDK settling, schema checks and preview
PDFs do not establish those actions. See [D status](reference/document-delivery-status.md)
and [earlier native evidence](reference/native-slice-status.md) for open gates.
