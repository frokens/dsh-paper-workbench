# Candidate installation

The bounded A code slice was merged; B is under implementation and review. A public Release has not yet
been published. This page records the formal installation path exercised so far;
it does not claim full product, Desktop or cross-platform acceptance.

## Package

The candidate tarball contains built Host and Client JavaScript, the self contained
DOCX engine, a local revision Skill, translated display resources, an icon and
required licenses. No source checkout, compilation, private registry or .NET SDK
is required by an ordinary installer.

Current declared candidate: macOS Apple silicon, Node.js 24.9 or later, DSH
0.2.2-rc.1. The package restricts its OS and CPU accordingly. Other combinations
remain unverified.

## Formal entry

1. Obtain the candidate `.tgz` from the reviewed GitHub Release when it is published.
   For independent review, use the exact candidate asset provided with the PR.
2. In the existing DSH profile, open **Plugins**, then **Add plugin**.
3. Enter the downloaded tarball's local file path and choose **Install**.
4. Read the result. If DSH requests a restart, restart that same host/profile.
   An installed package or enabled selection alone does not prove successful loading.
5. In an ordinary task, open the right sidebar and select **Paper workbench**.
   Do not switch preset or create a special paper agent. With no linked paper,
   import a DOCX or explicitly link an existing paper in that sidebar.

Updating installed module code may require a host restart. Use DSH's own removal
and installation actions for a tarball candidate; do not edit the profile manifest
or patch by hand. Paper aggregates are held in DSH storage and are not deleted by
plugin removal. Restart, update and removal evidence is tracked separately from
first installation.

## Boundaries

The sidebar uses DSH Remote calls into the same Host operation as the native paper
tool. Sidebar data reads and decisions do not enter the agent inbox or write paper JSON
as chat messages. The earlier command-based prototype exposed this problem and was
removed; old test messages are retained as failure evidence.

In B, saving a feedback batch or translation request is separate from **Send to
current Agent (uses model)**. Only that explicit action queues work on the current
ordinary Agent. No new paper Agent or provider configuration is needed. A failed
send remains retryable with the same native request identity.

Only ordinary text paragraphs are editable in this slice. Complex DOCX content is
preserved in the source package and flagged read only; its full client round trip
matrix belongs to later format validation. Read all import diagnostics. B adds
translation projections, feedback and revision lifecycle; its actual evidence and
limits are tracked in [the B status](reference/bilingual-lifecycle-status.md).
Independent reading, mentor three-way returns and PDF remain unimplemented.

The B data format upgrades the existing A aggregate in place and retains original
paper data and decisions. It is not a reversible package-only downgrade: the older
A package does not understand version 2 storage. Retain a backup before test upgrades.
Paragraph splits/merges are retained in the workbench but Word export currently
refuses a changed paragraph layout; the structural Word adapter remains later work.
An earlier B full-document restoration may lack its precise Word comparison.
The sidebar reports this and blocks export. In History, choose the intended
historical revision and explicitly restore it, even if its visible body is the
same. This appends its actual restoration relationship and retains the old record.

Developer-only Word fixtures can be generated with
`npm run fixture:word -- prepare <new-test-directory>`. The command refuses to
overwrite existing files. Open the tracked fixture in Microsoft Word, save separate
accepted and rejected copies, then use
`npm run fixture:word -- verify <same-test-directory>` to inspect those files. The
verification command does not perform or establish the Word UI actions itself.

Word acceptance has partial real-client evidence; the final export's two client
paths, Desktop activation and public download remain unverified. See the
[native slice evidence](reference/native-slice-status.md).
