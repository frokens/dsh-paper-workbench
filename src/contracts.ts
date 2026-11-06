import { z } from 'zod';

export const selectionSchema = z.object({
  paperId: z.string(), revision: z.number().int().nonnegative(), blockId: z.string(),
  from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), quote: z.string(),
});
export type Selection = z.infer<typeof selectionSchema>;
export const readRequest = z.object({ action: z.literal('read') });
export const proposeRequest = z.object({
  action: z.literal('propose'), requestId: z.string().min(1).max(200), selection: selectionSchema,
  replacement: z.string().max(100000).refine(t => !/[\r\n]/.test(t), 'This slice supports a single paragraph per operation.'),
  reason: z.string().min(1).max(10000),
});
export const agentRequest = z.discriminatedUnion('action', [readRequest, proposeRequest]);
export const uiRequest = z.discriminatedUnion('action', [
  readRequest, proposeRequest,
  z.object({ action: z.literal('import'), name: z.string().min(1).max(250), base64: z.string().max(24_000_000), revisionMode: z.enum(['accept', 'reject']).optional() }),
  z.object({ action: z.literal('link'), paperId: z.string() }),
  z.object({ action: z.literal('decide'), candidateId: z.string(), decision: z.enum(['accepted', 'rejected']) }),
  z.object({ action: z.literal('export'), tracked: z.boolean() }),
]);
export type UiRequest = z.infer<typeof uiRequest>;
