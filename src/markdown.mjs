import { posix } from "node:path";
import { markdownSourceSchema } from "./contracts.ts";

// This process owns one conversion and its WASM memory. The Host owns its
// subprocess lifetime; only explicitly supplied files enter Pandoc's virtual FS.
try {
  const { convert, query } = await import("pandoc-wasm").catch(() => {
    throw new Error("The Markdown runtime dependency is unavailable. Reinstall Paper Workbench through DSH Plugins with access to the public package registry, then restart the same DSH profile. No separate Pandoc installation is needed.");
  });
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 32 * 1024 * 1024) throw new Error("Markdown input and resources exceed 32 MiB.");
    chunks.push(chunk);
  }
  const input = markdownSourceSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length > 4 * 1024 * 1024) throw new Error("Markdown source exceeds 4 MiB of UTF-8 text.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const files = {}, aliases = new Map();
  let resourceBytes = 0;
  const key = value => posix.normalize(value.replaceAll("\\", "/")).normalize("NFC");
  const resourceAlias = value => {
    const direct = aliases.get(key(value));
    if (direct) return direct;
    try { return aliases.get(key(decodeURIComponent(value))); } catch { return undefined; }
  };
  input.resources.forEach((resource, index) => {
    if (resource.path.includes("\0")) throw new Error("A resource path contains an invalid character.");
    const path = key(resource.path);
    if (aliases.has(path)) throw new Error("Markdown resources contain duplicate paths.");
    const data = Buffer.from(resource.base64, "base64");
    resourceBytes += data.length;
    if (resourceBytes > 16 * 1024 * 1024) throw new Error("Markdown resource files exceed 16 MiB.");
    const alias = `resource-${index}${posix.extname(path).replace(/[^.a-zA-Z0-9]/g, "")}`;
    aliases.set(path, alias); files[alias] = new Blob([data]);
  });
  function checked(result) {
    const warnings = (result.warnings ?? []).filter(message => message.verbosity !== "INFO" && message.verbosity !== "DEBUG");
    if (result.stderr?.trim() || warnings.length)
      throw new Error(`Markdown conversion needs attention: ${result.stderr || JSON.stringify(warnings)}`.slice(0, 8000));
    return result;
  }
  const parsed = checked(await convert({ from: "markdown-raw_html-raw_tex", to: "json" }, text, {}));
  const document = JSON.parse(parsed.stdout);
  // Rewrite only structured resource targets, using Pandoc's own AST. Paths
  // never become Host filesystem reads, even when the Markdown uses ../ paths.
  function imageTarget(target) {
    if (target.startsWith("data:")) return target;
    const alias = resourceAlias(target);
    if (!alias) throw new Error(`Supply the image resource referenced by the Markdown: ${target}`.slice(0, 2000));
    return alias;
  }
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    if (value.t === "Image") value.c[2][0] = imageTarget(value.c[2][0]);
    Object.values(value).forEach(visit);
  }
  visit(document.blocks);
  function metadataResource(value) {
    if (value.t === "MetaList") { value.c.forEach(metadataResource); return; }
    const name = value.t === "MetaString" ? value.c
      : value.t === "MetaInlines" && value.c.every(item => item.t === "Str" || item.t === "Space")
        ? value.c.map(item => item.t === "Str" ? item.c : " ").join("") : undefined;
    const alias = name === undefined ? undefined : resourceAlias(name);
    if (!alias) throw new Error("Supply the bibliography or CSL file referenced by the Markdown metadata.");
    value.t = "MetaString"; value.c = alias;
  }
  for (const name of ["bibliography", "csl"]) if (document.meta?.[name]) metadataResource(document.meta[name]);
  const result = checked(await convert({ from: "json", to: "docx", standalone: true, citeproc: true,
    "output-file": "converted.docx" }, JSON.stringify(document), files));
  const output = result.files["converted.docx"];
  if (!(output instanceof Blob)) throw new Error("Markdown conversion did not produce a DOCX.");
  const converted = Buffer.from(await output.arrayBuffer());
  if (converted.length > 16 * 1024 * 1024) throw new Error("The converted Markdown exceeds the 16 MiB Word input limit.");
  console.log(JSON.stringify({ ok: true, result: { base64: converted.toString("base64"),
    version: query({ query: "version" }), warnings: ["Markdown was converted into a Word working source. Raw HTML/TeX remains literal; unsupported Word objects are preserved read only. The original Markdown and supplied resource files remain available."] } }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
