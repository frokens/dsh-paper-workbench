import { z } from "zod";
import {
  feedbackTargetSchema,
  operationSchema,
  selectionSchema,
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
  translations: z.array(
    z.object({
      operationIndexes: z.array(z.number().int().nonnegative()),
      text: z.string(),
    }),
  ),
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
export const paperSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number().int().nonnegative(),
  document: z.json(),
  baseline: z.json(),
  originalBase64: z.string(),
  sourceBase64: z.string(),
  warnings: z.array(z.string()),
  candidates: z.array(candidateSchema),
  decisions: z.array(decisionSchema),
  history: z.array(historySchema),
  feedback: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      target: feedbackTargetSchema,
      comment: z.string(),
    }),
  ),
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
  translations: z.array(
    z.object({
      id: z.string(),
      jobId: z.string(),
      sources: z.array(selectionSchema),
      text: z.string(),
      version: z.number().int().positive(),
      corrections: z.array(
        z.object({
          version: z.number().int().positive(),
          before: z.string(),
          after: z.string(),
        }),
      ),
      replacedBy: z.string().optional(),
    }),
  ),
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
