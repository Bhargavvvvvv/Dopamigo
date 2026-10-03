import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../packages/core/state';
import { transitionSession } from '../packages/core/sessions';
import { Drafts } from '../packages/core/drafts';
import { Store } from '../packages/core/store';
export function fixture() { const state = initialState(); state.selectedProjectId = 'p'; state.projects.push({ id: 'p', title: 'Review', brief: '', createdAt: 'now', plan: { id: 'plan', source: 'mock', createdAt: 'now', steps: [{ id: 's', title: 'Write a sentence', completion: 'A sentence exists', minutes: 2, status: 'todo' }] }, activeStepId: 's', notes: '', resources: [], nextAction: 'Write a sentence' }); return state; }
test('session transitions are constrained and checkpoints contain actual saved context', () => {
  const state = fixture(); assert.throws(() => transitionSession(state, 'resume'));
  transitionSession(state, 'start'); assert.equal(state.session?.status, 'active');
  assert.throws(() => transitionSession(state, 'start'));
  state.projects[0].notes = 'Source A discusses access to parks.';
  transitionSession(state, 'pause'); assert.equal(state.checkpoints[0].notes, state.projects[0].notes);
  transitionSession(state, 'break'); transitionSession(state, 'resume'); transitionSession(state, 'end');
  assert.equal(state.session?.status, 'ended'); assert.throws(() => transitionSession(state, 'resume'));
});
test('debounced draft flush preserves latest notes and exact next action before transition', async () => {
  const state = fixture(); const store = new Store(state, { load: async () => ({ state, notice: null }), save: async () => {} });
  const drafts = new Drafts(store, () => {});
  drafts.stage({ projectId: 'p', notes: 'first' }); drafts.stage({ projectId: 'p', notes: 'latest', nextAction: 'Compare the samples' });
  await drafts.flush(); await store.update(s => transitionSession(s, 'start'));
  assert.equal(store.state.checkpoints[0].notes, 'latest'); assert.equal(store.state.checkpoints[0].nextAction, 'Compare the samples');
});
test('navigation flush waits for an already-running save', async () => {
  const state = fixture(); let finish!: () => void;
  const store = new Store(state, { load: async () => ({ state, notice: null }), save: async () => await new Promise<void>(resolve => { finish = resolve; }) });
  const drafts = new Drafts(store, () => {}); drafts.stage({ projectId: 'p', notes: 'The last typed sentence.' });
  const blurSave = drafts.flush(); await new Promise(resolve => setImmediate(resolve));
  const navigationSave = drafts.flush(); let returned = false; void navigationSave.then(() => { returned = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(returned, false);
  finish(); await blurSave; assert.equal((await navigationSave).projects[0].notes, 'The last typed sentence.');
});
