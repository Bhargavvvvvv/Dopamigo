import { z } from 'zod';
import { domainSchema } from '../contracts';

export const nudgeTextSchema = z.string().trim().min(10).max(280)
  .refine(text => text.split(/\s+/).length <= 50, 'Keep spoken nudges under 50 words.')
  .refine(text => !/[\u0000-\u001f\u007f]/.test(text), 'Use a single line of speech.');
export const nudgeInputSchema = z.object({
  domain: domainSchema,
  task: z.string().max(180),
  step: z.string().max(180),
  nextAction: z.string().max(500),
  style: z.enum(['gentle', 'playful']),
  recentNudges: z.array(nudgeTextSchema).max(3),
}).strict();
export type NudgeInput = z.infer<typeof nudgeInputSchema>;
export interface NudgeWriter { generate(input: NudgeInput, signal: AbortSignal): Promise<string>; }
