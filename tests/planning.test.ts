import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executePlanningTool, MockPlanner } from '../packages/core/planning';
import { planningInputSchema, safeUrl } from '../packages/contracts';
test('agent tool registry rejects unknown tools, malformed plans, and repeated clarification', () => {
  assert.throws(() => executePlanningTool('shell', {}, false));
  assert.throws(() => executePlanningTool('submit_plan', { steps: [{ title: 'Work' }] }, false));
  assert.throws(() => executePlanningTool('ask_clarification', { question: 'What is required?' }, true));
  assert.throws(() => planningInputSchema.parse({ title: ' ', brief: '' }));
  assert.equal(safeUrl.safeParse('javascript:alert(1)').success, false);
});
test('explicit mock produces a bounded usable roadmap', async () => { const result = await new MockPlanner().generate({ title: 'Literature review', brief: '' }); assert.equal(result.kind, 'plan'); if (result.kind === 'plan') { assert.equal(result.plan.steps.length, 5); assert.equal(result.plan.steps[0].minutes, 3); } });
