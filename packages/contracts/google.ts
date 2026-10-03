import { z } from 'zod';
export const googleFileSchema = z.object({ id: z.string().max(300), name: z.string().max(500), url: z.string().url().max(2048), modifiedTime: z.string().max(40).optional() });
export type GoogleFile = z.infer<typeof googleFileSchema>;
export const assignmentSourceSchema = z.object({
  key: z.string(), accountId: z.string(), calendarId: z.string(), eventId: z.string(), eventUrl: z.string().url().optional(),
  calendarName: z.string().max(500), eventTitle: z.string().max(500), status: z.enum(['active', 'cancelled', 'unavailable', 'needs_review']),
  documentStatus: z.enum(['unchecked', 'found', 'not_found', 'ambiguous']), document: googleFileSchema.optional(), syncedAt: z.string(),
});
export const assignmentCandidateSchema = z.object({ key: z.string(), accountId: z.string(), calendarId: z.string(), eventId: z.string(), eventUrl: z.string().url().optional(), calendarName: z.string().max(500), eventTitle: z.string().max(500), title: z.string().max(180), subject: z.string().max(100), deadline: z.string().max(40), reason: z.string().max(250) });
export type AssignmentCandidate = z.infer<typeof assignmentCandidateSchema>;
export const classificationSchema = z.object({ kind: z.enum(['assignment', 'possible', 'other']), title: z.string().max(180), subject: z.string().max(100), confidence: z.number().min(0).max(1), reason: z.string().max(250) }).strict();
export type AssignmentClassification = z.infer<typeof classificationSchema>;
export const googleStateSchema = z.object({
  enabled: z.boolean().default(false), accountId: z.string().optional(), email: z.string().optional(),
  folderId: z.string().optional(), folderName: z.string().optional(), lastSyncAt: z.string().optional(),
  candidates: z.array(assignmentCandidateSchema).max(100).default([]), ignored: z.array(z.string()).max(1000).default([]),
  classifications: z.record(z.string(), z.object({ fingerprint: z.string(), result: classificationSchema })).default({}),
}).default({ enabled: false, candidates: [], ignored: [], classifications: {} });
export type GoogleState = z.infer<typeof googleStateSchema>;
export type GoogleStatus = {
  configured: boolean; connected: boolean; connecting: boolean; syncing: boolean; email: string | null;
  enabled: boolean; lastSyncAt: string | null; error: string | null; folderNotice: string | null;
  folders: { id: string; name: string }[]; folderId: string | null; folderName: string | null; candidates: AssignmentCandidate[];
  ignoredAssignments: { key: string; title: string }[];
};
export const googleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connect') }).strict(), z.object({ type: z.literal('disconnect') }).strict(),
  z.object({ type: z.literal('sync') }).strict(), z.object({ type: z.literal('help') }).strict(), z.object({ type: z.literal('setup') }).strict(),
  z.object({ type: z.literal('enabled'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('folder'), id: z.string().regex(/^[a-zA-Z0-9_-]{1,300}$/) }).strict(),
  z.object({ type: z.literal('candidate'), key: z.string().max(300), accept: z.boolean() }).strict(),
  z.object({ type: z.literal('restore'), key: z.string().min(1).max(300) }).strict(),
]);
export type GoogleAction = z.infer<typeof googleActionSchema>;
