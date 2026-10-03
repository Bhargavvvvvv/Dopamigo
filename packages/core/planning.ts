import { z } from 'zod';
import { draftPlanSchema, type DraftPlan, type PlanningInput } from '../contracts';
export type AgentResult = { kind: 'plan'; plan: DraftPlan } | { kind: 'clarification'; question: string };
export interface PlanningProvider { readonly source: 'mock' | 'gemini'; generate(input: PlanningInput): Promise<AgentResult>; }
// A single agent has a deliberately small tool registry. Tools return validated
// proposals; application use cases own persistence and all session permissions.
const questionSchema = z.object({ question: z.string().trim().min(5).max(300) }).strict();
export const planningTools = {
  submit_plan: { description: 'Submit 2–7 concrete student-work steps, each with an observable completion condition.', schema: draftPlanSchema, execute: (args: unknown): AgentResult => ({ kind: 'plan', plan: draftPlanSchema.parse(args) }) },
  ask_clarification: { description: 'Ask exactly one essential clarification only when a useful first step cannot be proposed.', schema: questionSchema, execute: (args: unknown): AgentResult => ({ kind: 'clarification', ...questionSchema.parse(args) }) },
};
export function executePlanningTool(name: string, args: unknown, alreadyClarified: boolean): AgentResult {
  if (!Object.hasOwn(planningTools, name) || (alreadyClarified && name === 'ask_clarification')) throw new Error('Invalid planning tool response');
  return planningTools[name as keyof typeof planningTools].execute(args);
}
export class MockPlanner implements PlanningProvider {
  readonly source = 'mock';
  async generate(input: PlanningInput): Promise<AgentResult> {
    return { kind: 'plan', plan: draftPlanSchema.parse({ steps: [
      { title: 'Open your brief and name the deliverable', completion: 'Write one sentence describing what you need to hand in.', minutes: 3 },
      { title: `List three questions for ${input.title.slice(0, 90)}`, completion: 'Three rough questions are written in your notes.', minutes: 5 },
      { title: 'Find one useful source or example', completion: 'Save its link and write one sentence about why it helps.', minutes: 10 },
      { title: 'Draft one small section', completion: 'One rough paragraph or worked example is on the page.', minutes: 15 },
      { title: 'Check the draft against the brief', completion: 'Mark one thing to improve and record your next action.', minutes: 5 },
    ] }) };
  }
}
