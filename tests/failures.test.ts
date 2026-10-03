import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiPlanner, generateContent } from '../apps/desktop/main/adapters/gemini';
import { GoogleTTS } from '../apps/desktop/main/adapters/google-tts';
import { initialState } from '../packages/core/state';
import { Store } from '../packages/core/store';
import { loadDemo } from '../packages/core/demo';
test('missing credentials, provider failures and invalid AI output have safe errors', async context => {
  await assert.rejects(generateContent('', 'model', {}), /GEMINI_API_KEY/);
  await assert.rejects(new GoogleTTS('', 'model', 'Kore').synthesize('hello', 'gentle', new AbortController().signal), /configure/);
  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(new GeminiPlanner('fake-test-key', 'model').generate({ title: 'Review', brief: '' }), /HTTP 503/);
  context.mock.restoreAll();
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'submit_plan', args: { steps: [] } } }] } }] }), { status: 200 }));
  await assert.rejects(new GeminiPlanner('fake-test-key', 'model').generate({ title: 'Review', brief: '' }), /validation/);
});
test('failed disk write does not publish uncommitted state; sample demo is non-destructive', async () => {
  const state = initialState(); const store = new Store(state, { load: async () => ({ state, notice: null }), save: async () => { throw new Error('disk full'); } });
  await assert.rejects(store.update(s => { s.preferences.muted = true; }), /disk full/); assert.equal(store.state.preferences.muted, false);
  loadDemo(state); const saved = state.projects[0]; assert.equal(state.session?.status, 'paused'); assert.match(state.checkpoints[0].notes, /Demo notes/);
  assert.throws(() => loadDemo(state), /End/); state.session!.status = 'ended'; loadDemo(state); assert.equal(state.projects.length, 1); assert.equal(state.projects[0], saved);
});
