# Third party notices

The built Host includes ProseMirror model and transform, orderedmap, diff, Zod and
pdf-lib (including @pdf-lib/standard-fonts, @pdf-lib/upng, pako and tslib).
Required license texts are included under `resources/licenses` in the package,
along with the generated JavaScript legal notices.

The self contained DOCX helper uses the Microsoft Open XML SDK 3.5.1, its Framework,
System.IO.Packaging and .NET 10. Required licenses and .NET third party notices are
included in the same directory. Third party copyright and attribution are retained.

DSH and React are supplied by the existing host. The plugin does not bundle another
DSH installation or React runtime.

Markdown conversion starts a separate managed process which imports the public,
unmodified runtime dependency `pandoc-wasm@1.1.0`. DSH's package installer obtains
that dependency; its WASM binary is not copied into this plugin's tarball. The
JavaScript wrapper is MIT-licensed, while the included Pandoc 3.10 program is
GPL-2.0-or-later. Its WASI shim is supplied by that dependency under its own license.
These are separate notices and do not replace the licenses or attribution shipped
with those packages. The plugin's own MIT license is unchanged.

The original wrapper license, Pandoc 3.10 GPL text and copyright notices are in
`resources/licenses`. [Source and build pointers](resources/licenses/pandoc-sources.md)
state the actual included Pandoc version, correcting the upstream notice's `X.Y.Z`
placeholder without changing the original license. No assertion about the legal
classification of the combined distribution follows merely from a process boundary.
