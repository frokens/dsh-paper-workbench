import { z } from "zod";

export const selectionSchema = z.object({
  paperId: z.string(),
  revision: z.number().int().nonnegative(),
  blockId: z.string(),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  quote: z.string(),
});
export type Selection = z.infer<typeof selectionSchema>;
export const paperLanguageSchema = z.enum(["en", "zh"]);
export type PaperLanguage = z.infer<typeof paperLanguageSchema>;
export const translationLanguageFor = (primary: PaperLanguage): PaperLanguage => primary === "en" ? "zh" : "en";
export const languageNameFor = (language: PaperLanguage) => language === "en" ? "English" : "Chinese";
export const operationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("replace"),
    selection: selectionSchema,
    replacement: z
      .string()
      .max(100000)
      .refine(
        (t) => !/[\r\n]/.test(t),
        "Use a paragraph split for structural changes.",
      ),
  }),
  z.object({ kind: z.literal("split"), selection: selectionSchema }),
  z.object({
    kind: z.literal("fill_draft"),
    selection: selectionSchema,
    paragraphs: z.array(z.string().min(1).max(100000).refine(
      text => !!text.trim() && !/[\r\n]/.test(text),
      "Supply separate non-empty paragraphs without embedded paragraph breaks.",
    )).min(2).max(100).refine(
      paragraphs => paragraphs.reduce((length, text) => length + text.length, 0) <= 4_000_000,
      "The draft exceeds four million characters.",
    ),
  }),
  z.object({
    kind: z.literal("merge"),
    selection: selectionSchema,
    next: selectionSchema,
    separator: z
      .string()
      .max(8)
      .refine(
        (t) => !/[\r\n]/.test(t),
        "A merge separator cannot contain a paragraph break.",
      ),
  }),
]);
export type Operation = z.infer<typeof operationSchema>;
export const readRequest = z.object({ action: z.literal("read") });
export const documentVariantSchema = z.enum(["clean", "tracked", "bilingual"]);
export const documentFormatSchema = z.enum(["docx", "pdf"]);
export const sourceFormatSchema = z.enum(["docx", "markdown"]);
export const sourceResourceSchema = z.object({ path: z.string().min(1).max(1000), base64: z.string().max(24_000_000) });
export const sourceResourcesSchema = z.array(sourceResourceSchema).max(256).refine(resources => resources.reduce((sum, resource) => sum + resource.base64.length, 0) <= 24_000_000, "Source resources exceed the aggregate input limit.");
export const markdownSourceSchema = z.object({ base64: z.string().max(8_000_000), resources: sourceResourcesSchema.default([]) });
export const documentExportRequest = z.object({
  action: z.literal("export"), requestId: z.string().min(1).max(200),
  variant: documentVariantSchema, format: documentFormatSchema,
  includeReasons: z.boolean(), expectedRevision: z.number().int().nonnegative(),
  baselineRevision: z.number().int().nonnegative(),
});
export const returnMappingsSchema = z.array(z.object({ sourceIndex: z.number().int().nonnegative(), blockId: z.string() })).max(5000);
export const compareReturnRequest = z.object({ action: z.literal("compare_return"), returnId: z.string(), mappings: returnMappingsSchema.default([]) });
export const proposeReturnRequest = z.object({ action: z.literal("propose_return"), requestId: z.string().min(1).max(200),
  returnId: z.string(), mappings: returnMappingsSchema.default([]), changeIds: z.array(z.string()).min(1).max(100),
  expectedRevision: z.number().int().nonnegative(), textOnly: z.literal(true),
});
export const copyReturnCommentsRequest = z.object({ action: z.literal("copy_return_comments"), requestId: z.string().min(1).max(200),
  returnId: z.string(), mappings: returnMappingsSchema.default([]), commentIds: z.array(z.string()).min(1).max(100),
  expectedRevision: z.number().int().nonnegative(), textOnly: z.literal(true),
});
const fontDirectoriesSchema = z.array(z.string().min(1).max(2000)).min(1).max(64).nullable();
export const configurePdfFontsRequest = z.object({ action: z.literal("configure_pdf_fonts"),
  directories: fontDirectoriesSchema, expectedDirectories: z.array(z.string()).max(64).nullable(), sharedPreviews: z.literal(true),
});
export const createRequest = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(250),
  brief: z.string().max(20000),
  primaryLanguage: paperLanguageSchema.default("en"),
});
export const readingRequest = z.object({
  action: z.literal("read_independently"),
  requestId: z.string().min(1).max(200),
  candidateIds: z.union([z.literal("all"), z.array(z.string()).max(100)]),
  goal: z.string().min(1).max(20000),
  evidence: z.string().max(30000),
  replaces: z.string().optional(),
});
export const readingOutputSchema = z.strictObject({
  interpretation: z.strictObject({
    problem: z.string(),
    mechanism: z.string(),
    feedbackRole: z.string(),
  }),
  findings: z.array(z.strictObject({
    kind: z.enum(["concern", "question"]),
    locations: z.array(z.strictObject({
      version: z.enum(["baseline", "candidate"]),
      blockId: z.string(),
      quote: z.string(),
    })),
    candidateIds: z.array(z.string()),
    issue: z.string(),
    impact: z.string(),
    evidence: z.string(),
    suggestion: z.string(),
  })),
  limits: z.array(z.string()),
});
export const candidateTranslationSchema = z.object({
  operationIndexes: z.array(z.number().int().nonnegative()).min(1).max(100),
  paragraphIndexes: z.array(z.number().int().nonnegative()).min(1).max(100).optional(),
  text: z.string().min(1).max(100000),
});
export const proposeRequest = z.object({
  action: z.literal("propose"),
  requestId: z.string().min(1).max(200),
  operations: z.array(operationSchema).min(1).max(100),
  reason: z.string().min(1).max(10000),
  feedbackIds: z.array(z.string()).max(100).default([]),
  dependsOn: z.array(z.string()).max(100).default([]),
  translations: z.array(candidateTranslationSchema).max(100).default([]),
});
export const translationSelectionSchema = z.object({
  translationId: z.string(),
  version: z.number().int().positive(),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  quote: z.string(),
});
export const feedbackTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("source"),
    selections: z.array(selectionSchema).min(1).max(100),
  }),
  z.object({
    kind: z.literal("translation"),
    selection: translationSelectionSchema,
  }),
]);
export const completeTranslationRequest = z.object({
  action: z.literal("complete_translation"),
  jobId: z.string(),
  groups: z
    .array(
      z.object({
        sourceIndexes: z.array(z.number().int().nonnegative()).min(1).max(100),
        text: z.string().min(1).max(100000),
      }),
    )
    .min(1)
    .max(100),
});
export const agentRequest = z.discriminatedUnion("action", [
  readRequest,
  createRequest,
  readingRequest,
  proposeRequest,
  completeTranslationRequest,
]);
export const uiRequest = z.discriminatedUnion("action", [
  readRequest,
  createRequest,
  readingRequest,
  z.object({ action: z.literal("cancel_reading"), readingId: z.string() }),
  proposeRequest,
  z.object({
    action: z.literal("import"),
    name: z.string().min(1).max(250),
    base64: z.string().max(24_000_000),
    format: sourceFormatSchema.default("docx"),
    primaryLanguage: paperLanguageSchema.default("en"),
    resources: sourceResourcesSchema.default([]),
    revisionMode: z.enum(["accept", "reject"]).optional(),
  }),
  z.object({ action: z.literal("link"), paperId: z.string() }),
  z.object({
    action: z.literal("preview"),
    candidateIds: z.union([
      z.literal("all"),
      z.array(z.string()).min(1).max(100),
    ]),
  }),
  z.object({
    action: z.literal("decide"),
    candidateIds: z.array(z.string()).min(1).max(100),
    decision: z.enum(["accepted", "rejected"]),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("undo"),
    decisionId: z.string(),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("restore"),
    revision: z.number().int().nonnegative(),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("compare"),
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("feedback"),
    requestId: z.string().min(1).max(200),
    target: feedbackTargetSchema,
    comment: z.string().min(1).max(10000),
  }),
  z.object({
    action: z.literal("submit_batch"),
    requestId: z.string().min(1).max(200),
    feedbackIds: z.array(z.string()).min(1).max(100),
    direction: z.string().max(10000),
  }),
  z.object({
    action: z.literal("request_translation"),
    requestId: z.string().min(1).max(200),
    sources: z.array(selectionSchema).min(1).max(100),
    replaces: z.array(z.string()).max(100).default([]),
  }),
  z.object({
    action: z.literal("send"),
    kind: z.enum(["batch", "translation"]),
    id: z.string(),
  }),
  z.object({ action: z.literal("cancel_translation"), jobId: z.string() }),
  z.object({
    action: z.literal("correct_translation"),
    selection: translationSelectionSchema,
    replacement: z.string().max(100000),
  }),
  z.object({ action: z.literal("set_baseline"), revision: z.number().int().nonnegative(), expectedRevision: z.number().int().nonnegative() }),
  z.object({ action: z.literal("download_delivery"), deliveryId: z.string() }),
  z.object({ action: z.literal("import_return"), requestId: z.string().min(1).max(200), deliveryId: z.string(),
    name: z.string().min(1).max(250), base64: z.string().max(24_000_000), revisionMode: z.enum(["accept", "reject"]).optional() }),
  z.object({ action: z.literal("download_return"), returnId: z.string() }),
  z.object({ action: z.literal("download_source"), resourcePath: z.string().optional() }),
  compareReturnRequest,
  proposeReturnRequest,
  copyReturnCommentsRequest,
  z.object({ action: z.literal("pdf_font_settings") }),
  configurePdfFontsRequest,
  documentExportRequest,
]);
export type UiRequest = z.infer<typeof uiRequest>;
