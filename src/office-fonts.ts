import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-config-editor";
import { isAbsolute } from "node:path";
import { z } from "zod";

const directoriesSchema = z.array(z.string().min(1).max(2000)).max(64);
const fallbacksSchema = z.array(z.array(z.string())).max(100);
export type OfficeFontSettings = {
  directories: string[] | null;
  fallbacks: string[][] | null;
  systemDirectories: string[];
  canEdit: boolean;
  diagnostic?: string;
};

function officeEntry(ctx: Context) {
  const editor = ctx.get("configEditor");
  if (!editor) throw new Error("This DSH profile does not expose its configuration editor.");
  // Cordis's published const enum is erased at runtime (ACTIVE = 2).
  const entries = editor.entries().filter(entry => entry.options.name === "@deepseek-ai/dsh-office-to-pdf" && entry.fiber?.state === 2);
  if (entries.length !== 1) throw new Error("The shared Office PDF provider has no unique editable configuration in this profile.");
  return { editor, entry: entries[0] };
}

// Only the Office font fields cross the wire. Entry objects, other settings and
// other providers' raw configurations never become a Client projection.
export function readOfficeFonts(ctx: Context): OfficeFontSettings {
  const base = { directories: null, fallbacks: null, systemDirectories: process.platform === "darwin" ? ["/System/Library/Fonts", "/Library/Fonts"] : [], canEdit: false };
  try {
    const { entry } = officeEntry(ctx), config = entry.options.config ?? {};
    const directories = config.fontDirectories === undefined ? null : directoriesSchema.safeParse(config.fontDirectories);
    const fallbacks = config.fontFallbacks === undefined ? null : fallbacksSchema.safeParse(config.fontFallbacks);
    if (directories && !directories.success || fallbacks && !fallbacks.success)
      throw new Error("This profile uses dynamic or unsupported font values. Keep its existing configuration; this form cannot rewrite those values.");
    return { ...base, directories: directories ? directories.data : null, fallbacks: fallbacks ? fallbacks.data : null, canEdit: true };
  } catch (error) { return { ...base, diagnostic: error instanceof Error ? error.message : "Office font settings are unavailable." }; }
}

export async function configureOfficeFonts(ctx: Context, request: { directories: string[] | null; expectedDirectories: string[] | null }, signal: AbortSignal) {
  signal.throwIfAborted();
  const directories = request.directories === null ? null : directoriesSchema.min(1).parse(request.directories);
  if (directories?.some(path => !isAbsolute(path))) throw new Error("Each font folder must be an absolute directory path.");
  const { editor, entry } = officeEntry(ctx);
  const present = entry.options.config?.fontDirectories;
  if (JSON.stringify(present === undefined ? null : present) === JSON.stringify(directories)) return readOfficeFonts(ctx);
  await editor.edit(entry, current => {
    signal.throwIfAborted();
    const actual = current.fontDirectories === undefined ? null : directoriesSchema.parse(current.fontDirectories);
    if (JSON.stringify(actual) !== JSON.stringify(request.expectedDirectories))
      throw new Error("The shared font folders changed. Read the current settings before applying your choice.");
    const next = { ...current };
    if (directories === null) delete next.fontDirectories;
    else next.fontDirectories = [...directories];
    return next;
  });
  // ConfigEditor owns validation, persistence and reload even if this action's
  // dependent Paper service was unloaded. Do not await this action in close().
  return readOfficeFonts(ctx.root);
}
