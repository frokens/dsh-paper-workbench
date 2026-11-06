# Pandoc dependency sources

Paper Workbench declares the unmodified public npm dependency `pandoc-wasm@1.1.0`.
The package manager downloads it with its normal lockfile and integrity checks.
Its `pandoc-version.txt` and the included binary's version query report **3.10**.
The upstream wrapper README's older version and license's `X.Y.Z` placeholders
are not the version used by this candidate.

- [Published wrapper package](https://www.npmjs.com/package/pandoc-wasm/v/1.1.0)
- [Wrapper source and license](https://github.com/pandoc/pandoc-wasm)
- [Wrapper preparation script](https://github.com/pandoc/pandoc-wasm/blob/main/scripts/download-wasm.js), which obtains the official release before publication
- [Pandoc 3.10 source tree](https://github.com/jgm/pandoc/tree/3.10), including its `wasm` build scripts and package descriptions
- [Pandoc 3.10 source archive](https://github.com/jgm/pandoc/archive/refs/tags/3.10.tar.gz)
- [Pandoc 3.10 release and assets](https://github.com/jgm/pandoc/releases/tag/3.10)
- [Official Pandoc 3.10 WASM archive](https://github.com/jgm/pandoc/releases/download/3.10/pandoc-3.10.wasm.zip)
- [Pandoc GPL text](https://github.com/jgm/pandoc/blob/3.10/COPYING.md)
- [Pandoc copyright and component notices](https://github.com/jgm/pandoc/blob/3.10/COPYRIGHT)

The wrapper's JavaScript is licensed under MIT; Pandoc is GPL version 2 or later.
The files `pandoc-wasm.txt`, `pandoc-3.10-COPYING.md` and
`pandoc-3.10-COPYRIGHT.txt` retain the corresponding notices. The wrapper's
`@bjorn3/browser_wasi_shim` dependency retains its own MIT OR Apache-2.0 notices.

The dependency is not modified or rebuilt by Paper Workbench. A first installation
needs access to the public package registry. The published package already contains
the binary: ordinary installation and later Markdown conversion require no Pandoc
download script, compiler or separately installed Pandoc executable.
