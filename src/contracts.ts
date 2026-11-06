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
export const proposeRequest = z.object({
  action: z.literal("propose"),
  requestId: z.string().min(1).max(200),
  operations: z.array(operationSchema).min(1).max(100),
  reason: z.string().min(1).max(10000),
  feedbackIds: z.array(z.string()).max(100).default([]),
  dependsOn: z.array(z.string()).max(100).default([]),
  translations: z
    .array(
      z.object({
        operationIndexes: z
          .array(z.number().int().nonnegative())
          .min(1)
          .max(100),
        text: z.string().min(1).max(100000),
      }),
    )
    .max(100)
    .default([]),
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
  proposeRequest,
  completeTranslationRequest,
]);
export const uiRequest = z.discriminatedUnion("action", [
  readRequest,
  proposeRequest,
  z.object({
    action: z.literal("import"),
    name: z.string().min(1).max(250),
    base64: z.string().max(24_000_000),
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
  z.object({ action: z.literal("export"), tracked: z.boolean() }),
]);
export type UiRequest = z.infer<typeof uiRequest>;
