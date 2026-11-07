import { z } from "zod";
import {
  feedbackTargetSchema,
  operationSchema,
  selectionSchema,
  readingOutputSchema,
  candidateTranslationSchema,
  documentVariantSchema,
  documentFormatSchema,
  returnMappingsSchema,
  sourceFormatSchema,
  sourceResourceSchema,
} from "./contracts.js";

const diffSchema = z.array(
  z.object({ kind: z.enum(["equal", "delete", "insert"]), text: z.string() }),
);
export const candidateSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  operations: z.array(operationSchema),
  reason: z.string(),
  feedbackIds: z.array(z.string()),
  dependsOn: z.array(z.string()),
  status: z.enum(["pending", "accepted", "rejected", "undone"]),
  diffs: z.array(diffSchema),
  translations: z.array(candidateTranslationSchema),
  returnedFrom: z.object({ returnId: z.string(), changeIds: z.array(z.string()), mappings: returnMappingsSchema,
    sourceRevision: z.number().int().nonnegative() }).optional(),
});
export const historySchema = z.object({
  revision: z.number().int().positive(),
  kind: z.enum(["accept", "undo", "restore"]),
  candidateIds: z.array(z.string()),
  steps: z.array(z.json()),
  inverseSteps: z.array(z.json()),
  inverseOf: z.array(z.number().int().nonnegative()).optional(),
});
const decisionSchema = z.object({
  id: z.string(),
  candidateIds: z.array(z.string()),
  decision: z.enum(["accepted", "rejected", "undone"]),
  revision: z.number().int().nonnegative(),
  undoOf: z.string().optional(),
  editRevision: z.number().int().positive().optional(),
});
const deliverySchema = {
  sessionId: z.string(),
  delivery: z.enum(["ready", "sent"]),
  error: z.string().optional(),
};
export const translationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  sources: z.array(selectionSchema),
  text: z.string(),
  version: z.number().int().positive(),
  corrections: z.array(z.object({ version: z.number().int().positive(), before: z.string(), after: z.string() })),
  replacedBy: z.string().optional(),
});
export const translationViewSchema = translationSchema.extend({
  state: z.enum(["current", "stale", "superseded"]),
  mappedSources: z.array(selectionSchema),
});
const feedbackSchema = z.object({
  id: z.string(), requestId: z.string(), target: feedbackTargetSchema, comment: z.string(),
  wordCommentId: z.string().optional(),
  returnComment: z.object({ returnId: z.string(), commentId: z.string() }).optional(),
});
export const documentDeliverySchema = z.object({
  id: z.string(), revision: z.number().int().nonnegative(), baselineRevision: z.number().int().nonnegative(),
  variant: documentVariantSchema, format: documentFormatSchema, includeReasons: z.boolean(),
  name: z.string(), base64: z.string().max(48_000_000), sourceDocxBase64: z.string().max(24_000_000).optional(),
  bytes: z.number().int().nonnegative(), warnings: z.array(z.string()),
  anchors: z.array(z.object({ blockId: z.string(), nativeId: z.string() })),
  translations: z.array(z.object({ id: z.string(), version: z.number().int().positive() })),
  pages: z.number().int().positive().optional(),
  conversion: z.object({ key: z.string(), generation: z.string(), missingFonts: z.array(z.string()) }).optional(),
});
export type DocumentDelivery = z.infer<typeof documentDeliverySchema>;
export const importedWordCommentSchema = z.object({ id: z.string(), text: z.string(), editable: z.boolean(),
  ranges: z.array(z.object({ sourceIndex: z.number().int().nonnegative(), from: z.number().int().nonnegative(), to: z.number().int().nonnegative() })) });
export const returnedBlockSchema = z.object({ sourceIndex: z.number().int().nonnegative(), nativeId: z.string().nullable(),
  text: z.string(), editable: z.boolean(), style: z.string().nullable(), paragraphFormat: z.string(),
  runs: z.array(z.object({ text: z.string(), bold: z.boolean(), italic: z.boolean(), nativeFormat: z.string() })), reason: z.string().nullable() });
export const documentReturnSchema = z.object({ id: z.string(), deliveryId: z.string(), name: z.string(), originalBase64: z.string().max(24_000_000),
  revisionMode: z.enum(["accept", "reject", "none"]), blocks: z.array(returnedBlockSchema),
  nativeComments: z.array(importedWordCommentSchema), warnings: z.array(z.string()),
  deliveryMarkers: z.array(z.object({ id: z.string().nullable(), paperId: z.string().nullable() })),
});
export type DocumentReturn = z.infer<typeof documentReturnSchema>;
export type ReturnedBlock = z.infer<typeof returnedBlockSchema>;
export type ImportedWordComment = z.infer<typeof importedWordCommentSchema>;
export const readingSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  sessionId: z.string(),
  childId: z.string(),
  sourceRevision: z.number().int().nonnegative(),
  candidateIds: z.array(z.string()),
  requestedCandidateIds: z.union([z.literal("all"), z.array(z.string())]),
  goal: z.string(),
  evidence: z.string(),
  replaces: z.string().optional(),
  material: z.object({
    baselineDocument: z.json(),
    candidateDocument: z.json(),
    candidates: z.array(candidateSchema),
    feedback: z.array(feedbackSchema),
    directions: z.array(z.object({
      batchId: z.string(),
      revision: z.number().int().nonnegative(),
      feedbackIds: z.array(z.string()),
      direction: z.string(),
    })).optional(),
    translations: z.array(translationViewSchema),
    candidateTranslations: z.array(translationViewSchema),
    brief: z.string(),
    warnings: z.array(z.string()),
  }),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled", "interrupted"]),
  output: readingOutputSchema.optional(),
  diagnostic: z.string().optional(),
  terminal: z.json().optional(),
});
export type Reading = z.infer<typeof readingSchema>;
export const paperSchema = z.object({
  id: z.string(),
  name: z.string(),
  brief: z.string().default(""),
  revision: z.number().int().nonnegative(),
  document: z.json(),
  baseline: z.json(),
  originalBase64: z.string(),
  sourceBase64: z.string(),
  sourceFormat: sourceFormatSchema.default("docx"),
  sourceResources: z.array(sourceResourceSchema).default([]),
  comparisonRevision: z.number().int().nonnegative().default(0),
  documentDeliveries: z.array(documentDeliverySchema).default([]),
  documentReturns: z.array(documentReturnSchema).default([]),
  warnings: z.array(z.string()),
  candidates: z.array(candidateSchema),
  decisions: z.array(decisionSchema),
  history: z.array(historySchema),
  readings: z.array(readingSchema).default([]),
  feedback: z.array(feedbackSchema),
  batches: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      feedbackIds: z.array(z.string()),
      direction: z.string(),
      revision: z.number().int().nonnegative(),
      ...deliverySchema,
    }),
  ),
  translationJobs: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      sourceRevision: z.number().int().nonnegative(),
      sources: z.array(selectionSchema),
      replaces: z.array(
        z.object({ id: z.string(), version: z.number().int().positive() }),
      ),
      status: z.enum([
        "pending",
        "completed",
        "cancelled",
        "superseded",
        "stale",
      ]),
      ...deliverySchema,
    }),
  ),
  translations: z.array(translationSchema),
});
export type Candidate = z.infer<typeof candidateSchema>;
export type Paper = z.infer<typeof paperSchema>;

// The previous installed aggregate is admitted only for the in-place data upgrade.
export const legacyPaperSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number().int().nonnegative(),
  document: z.json(),
  baseline: z.json(),
  originalBase64: z.string(),
  sourceBase64: z.string(),
  warnings: z.array(z.string()),
  candidates: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      selection: selectionSchema,
      replacement: z.string(),
      reason: z.string(),
      status: z.enum(["pending", "accepted", "rejected"]),
      diff: diffSchema,
    }),
  ),
  decisions: z.array(
    z.object({
      candidateId: z.string(),
      decision: z.enum(["accepted", "rejected"]),
      revision: z.number(),
    }),
  ),
});
export const storedPaperSchema = z.union([paperSchema, legacyPaperSchema]);
export type LegacyPaper = z.infer<typeof legacyPaperSchema>;
export type StoredPaper = z.infer<typeof storedPaperSchema>;
