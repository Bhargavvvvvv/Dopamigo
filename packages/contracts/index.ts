import { z } from 'zod';
import { assignmentSourceSchema, googleStateSchema, type GoogleStatus, type GoogleAction } from './google';
export * from './google';
export const safeUrl = z.string().max(2048).refine(value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}, 'Use an http or https link without embedded credentials.');
export const domainSchema = z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a domain such as youtube.com.');
export const stepSchema = z.object({ id: z.string(), title: z.string().min(1).max(180), completion: z.string().min(1).max(500), minutes: z.number().int().min(1).max(180).optional(), status: z.enum(['todo', 'done', 'skipped']) });
export type Step = z.infer<typeof stepSchema>;
export const planSchema = z.object({ id: z.string(), source: z.enum(['gemini', 'mock', 'starter']), createdAt: z.string(), steps: z.array(stepSchema).max(30) });
export type Plan = z.infer<typeof planSchema>;
export const resourceSchema = z.object({ id: z.string(), label: z.string().min(1).max(120), url: safeUrl });
export type Resource = z.infer<typeof resourceSchema>;
export const chatMessageSchema = z.object({ id: z.string(), role: z.enum(['user', 'model']), text: z.string().min(1).max(100000), at: z.string() });
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export const chatDocumentSchema = z.object({ id: z.string().uuid(), name: z.string().max(255), size: z.number().int().positive() });
export type ChatDocument = z.infer<typeof chatDocumentSchema>;
export const chatInputSchema = z.object({ projectId: z.string().min(1).max(200), text: z.string().trim().min(1).max(12000) }).strict();
export const documentInputSchema = z.object({ projectId: z.string().min(1).max(200), documentId: z.string().uuid().optional() }).strict();
export const projectSchema = z.object({ id: z.string(), title: z.string().min(1).max(180), subject: z.string().max(100).optional(), assignment: assignmentSourceSchema.optional(), chat: z.array(chatMessageSchema).max(100).optional(), documents: z.array(chatDocumentSchema).max(8).optional(), brief: z.string().max(30000), deadline: z.string().max(40).optional(), plan: planSchema.nullable(), activeStepId: z.string().nullable(), notes: z.string().max(100000), resources: z.array(resourceSchema).max(30), nextAction: z.string().max(500), createdAt: z.string() });
export type Project = z.infer<typeof projectSchema>;
export const sessionSchema = z.object({ id: z.string(), projectId: z.string(), status: z.enum(['active', 'paused', 'break', 'ended']), startedAt: z.string(), updatedAt: z.string() });
export type FocusSession = z.infer<typeof sessionSchema>;
export const checkpointSchema = z.object({ id: z.string(), projectId: z.string(), sessionId: z.string().nullable(), at: z.string(), reason: z.string(), projectTitle: z.string(), stepTitle: z.string(), completed: z.array(z.string()), notes: z.string(), nextAction: z.string(), resources: z.array(resourceSchema) });
export type Checkpoint = z.infer<typeof checkpointSchema>;
export const preferencesSchema = z.object({ monitoring: z.boolean(), domains: z.array(domainSchema).max(30), dwellSeconds: z.number().int().min(5).max(600), cooldownSeconds: z.number().int().min(30).max(3600), style: z.enum(['gentle', 'playful']), muted: z.boolean(), volume: z.number().min(0).max(1), reduceMotion: z.boolean(), floatingLauncher: z.boolean(), useMock: z.boolean(), demoMode: z.boolean() });
export type Preferences = z.infer<typeof preferencesSchema>;
export const stateSchema = z.object({ version: z.literal(1), google: googleStateSchema, revision: z.number().int().nonnegative(), projects: z.array(projectSchema).max(100), selectedProjectId: z.string().nullable(), session: sessionSchema.nullable(), checkpoints: z.array(checkpointSchema).max(100), preferences: preferencesSchema });
export type AppState = z.infer<typeof stateSchema>;
export const planningInputSchema = z.object({ projectId: z.string().max(200).optional(), title: z.string().trim().min(3).max(180), brief: z.string().max(30000), deadline: z.string().max(40).optional(), clarification: z.string().trim().max(1000).optional() }).strict();
export type PlanningInput = z.infer<typeof planningInputSchema>;
export const draftPlanSchema = z.object({ steps: z.array(stepSchema.omit({ id: true, status: true }).strict()).min(2).max(7) }).strict();
export type DraftPlan = z.infer<typeof draftPlanSchema>;
export type PlanningOutcome = { kind: 'plan'; projectId: string } | { kind: 'clarification'; question: string };
export const draftInputSchema = z.object({ projectId: z.string(), notes: z.string().max(100000).optional(), nextAction: z.string().max(500).optional() }).strict();
export type DraftInput = z.infer<typeof draftInputSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('preferences.update'), patch: preferencesSchema.partial().strict() }).strict(),
  z.object({ type: z.literal('project.delete'), projectId: z.string().min(1).max(200), allowReimport: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('project.select'), projectId: z.string() }).strict(),
  z.object({ type: z.literal('step.edit'), stepId: z.string(), title: z.string().trim().min(1).max(180), completion: z.string().trim().min(1).max(500), minutes: z.number().int().min(1).max(180).optional() }).strict(),
  z.object({ type: z.literal('step.status'), stepId: z.string(), status: z.enum(['todo', 'done', 'skipped']) }).strict(),
  z.object({ type: z.literal('step.move'), stepId: z.string(), direction: z.enum(['up', 'down']) }).strict(),
  z.object({ type: z.literal('step.smaller') }).strict(),
  z.object({ type: z.literal('session.transition'), action: z.enum(['start', 'pause', 'break', 'resume', 'end']) }).strict(),
  z.object({ type: z.literal('resource.add'), label: z.string().trim().min(1).max(120), url: safeUrl }).strict(),
  z.object({ type: z.literal('resource.remove'), resourceId: z.string() }).strict(),
  z.object({ type: z.literal('project.brief'), brief: z.string().max(30000) }).strict(),
  z.object({ type: z.literal('demo.load') }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type RuntimeInfo = { planningReady: boolean; ttsReady: boolean; storageNotice: string | null; dataPath: string };
export const browserMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
  z.object({ type: z.literal('heartbeat') }).strict(),
  z.object({ type: z.literal('idle') }).strict(),
  z.object({ type: z.literal('tab'), tabId: z.number().int().nonnegative(), windowId: z.number().int().nonnegative(), domain: domainSchema, relevant: z.boolean() }).strict(),
  z.object({ type: z.literal('restored'), requestId: z.string().uuid(), ok: z.boolean() }).strict(),
]);
export type BrowserMessage = z.infer<typeof browserMessageSchema>;
export type BrowserStatus = { connected: boolean; listening: boolean; enabled: boolean; domain: string | null; detour: boolean; canRestore: boolean; error: string | null; port: number };
export type BrowserConfig = { enabled: boolean; sessionId: string | null; domains: string[]; resources: string[] };
export type Nudge = { id: string; text: string; nextAction: string; domain: string; demo: boolean; accelerated: boolean; generation: 'loading' | 'ready' | 'failed'; generationError?: string; audio: 'loading' | 'ready' | 'muted' | 'failed'; audioError?: string };
export type SpeechEvent = { type: 'stop' } | { type: 'play'; id: string; base64: string; volume: number };
export const nudgeActionSchema = z.object({ id: z.string().uuid(), action: z.enum(['return', 'research', 'break', 'dismiss']) }).strict();
export type NudgeAction = z.infer<typeof nudgeActionSchema>;
export type Snapshot = { state: AppState; runtime: RuntimeInfo };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface DesktopAPI {
  googleStatus(): Promise<GoogleStatus>;
  googleAction(action: GoogleAction): Promise<Result<null>>;
  onGoogle(listener: (status: GoogleStatus) => void): () => void;
  chat(input: { projectId: string; text: string }): Promise<Result<null>>;
  attachPDF(projectId: string): Promise<Result<null>>;
  removePDF(input: { projectId: string; documentId: string }): Promise<Result<null>>;
  importBrief(): Promise<Result<{ text: string; name: string } | null>>;
  load(): Promise<Result<Snapshot>>;
  command(command: Command): Promise<Result<AppState>>;
  plan(input: PlanningInput): Promise<Result<PlanningOutcome>>;
  draft(input: DraftInput): Promise<Result<null>>;
  flush(): Promise<Result<AppState>>;
  openResource(resourceId: string): Promise<Result<null>>;
  browserStatus(): Promise<BrowserStatus>;
  pairing(reset?: boolean): Promise<Result<{ token: string; port: number }>>;
  copyPairingToken(): Promise<Result<null>>;
  restoreTab(): Promise<Result<null>>;
  onBrowser(listener: (status: BrowserStatus) => void): () => void;
  nudgeStatus(): Promise<Nudge | null>;
  onNudge(listener: (nudge: Nudge | null) => void): () => void;
  onSpeech(listener: (event: SpeechEvent) => void): () => void;
  speechReady(): Promise<void>;
  setNudgeRegions(regions: { x: number; y: number; width: number; height: number }[]): void;
  respondToNudge(action: NudgeAction): Promise<Result<null>>;
  demoDetour(): Promise<Result<null>>;
  previewVoice(): Promise<Result<null>>;
  onNavigate(listener: (view: 'work' | 'return') => void): () => void;
  showWorkspace(): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
  onSaveError(listener: () => void): () => void;
}
