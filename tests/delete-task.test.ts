import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../packages/core/state';
import { applyCommand } from '../packages/core/commands';
import { stateSchema } from '../packages/contracts';
import { loadDemo } from '../packages/core/demo';
function fixture() { const state = initialState(); loadDemo(state); return state; }
test('deleting the last task clears its session and saved progress', () => {
  const state = fixture(); const id = state.projects[0].id;
  applyCommand(state, { type: 'project.delete', projectId: id });
  assert.equal(state.projects.length, 0); assert.equal(state.selectedProjectId, null);
  assert.equal(state.session, null); assert.equal(state.checkpoints.length, 0);
  stateSchema.parse(state);
  assert.throws(() => applyCommand(state, { type: 'project.delete', projectId: id }));
});
test('deleting another task preserves the selected task and its session', () => {
  const state = fixture(); const selected = state.selectedProjectId; const session = structuredClone(state.session);
  state.projects.push({ ...structuredClone(state.projects[0]), id: 'other' });
  applyCommand(state, { type: 'project.delete', projectId: 'other' });
  assert.equal(state.selectedProjectId, selected); assert.deepEqual(state.session, session);
  assert.equal(state.projects.length, 1); assert.ok(state.checkpoints.length);
});
test('calendar deletion prevents reimport unless explicitly allowed', () => {
  for (const allowReimport of [false, true]) {
    const state = fixture(); const project = state.projects[0];
    project.assignment = { key: 'calendar-event', accountId: 'account', calendarId: 'calendar', eventId: 'event', calendarName: 'School', eventTitle: 'Assignment', status: 'active', documentStatus: 'unchecked', syncedAt: 'now' };
    applyCommand(state, { type: 'project.delete', projectId: project.id, allowReimport });
    assert.equal(state.google.ignored.includes('calendar-event'), !allowReimport);
    stateSchema.parse(state);
  }
});
