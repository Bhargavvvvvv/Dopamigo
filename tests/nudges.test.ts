import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NudgeRules } from '../packages/core/nudges';
import type { NudgeInput, NudgeWriter } from '../packages/core/nudge-writer';
import type { SpeechProvider } from '../packages/core/speech';
import { parseInteractionAudio, pcmToWav } from '../apps/desktop/main/adapters/google-tts';
import { NudgeController } from '../apps/desktop/main/nudge-controller';
import { initialState } from '../packages/core/state';
import type { Nudge, SpeechEvent } from '../packages/contracts';
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(writer: NudgeWriter, speech: SpeechProvider) {
  const state = initialState(); Object.assign(state.preferences, { monitoring: true, style: 'playful', dwellSeconds: 5, cooldownSeconds: 30 });
  state.selectedProjectId = 'p'; state.projects = [{ id: 'p', title: 'Review', brief: 'Private brief', plan: null, activeStepId: 's', notes: 'Private notes', resources: [], nextAction: 'Compare the sample sizes.', createdAt: 'now' }];
  state.session = { id: 'session', projectId: 'p', status: 'active', startedAt: 'now', updatedAt: 'now' };
  const browser = { connected: true, listening: true, enabled: true, domain: 'youtube.com', detour: true, canRestore: false, error: null, port: 1 };
  const events: SpeechEvent[] = [];
  const controller = new NudgeController(() => state, () => browser, writer, speech, () => {}, event => events.push(event));
  return { state, browser, events, controller };
}
test('dwell, cooldown, research, dismissal, breaks and new sessions are deterministic', () => {
  const rules = new NudgeRules(); const c = { sessionId: 'one', enabled: true, domain: 'youtube.com', dwellMs: 30000, cooldownMs: 180000 };
  assert.equal(rules.update(c, 0), false); assert.equal(rules.update(c, 29999), false); assert.equal(rules.update(c, 30000), true);
  assert.equal(rules.update(c, 500000), false);
  rules.update({ ...c, domain: null }, 500001); rules.update(c, 500002); assert.equal(rules.update(c, 530002), true);
  rules.dismiss(true); rules.update({ ...c, domain: null }, 530003); assert.equal(rules.update(c, 900000), false); assert.equal(rules.update(c, 1000000), false);
  assert.equal(rules.update({ ...c, sessionId: 'two' }, 1000001), false); assert.equal(rules.update({ ...c, sessionId: 'two' }, 1030001), true);
  assert.equal(rules.update({ ...c, enabled: false }, 2000000), false);
  const cooldown = new NudgeRules(); cooldown.update(c, 0); cooldown.update(c, 30000); cooldown.update({ ...c, domain: null }, 31000); cooldown.update(c, 32000); assert.equal(cooldown.update(c, 62000), false); assert.equal(cooldown.update(c, 210000), true);
});
test('audio parser accepts actual WAV and refuses malformed provider output', () => {
  const wav = pcmToWav(Buffer.alloc(48)); assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 24000);
  assert.deepEqual(parseInteractionAudio({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: wav.toString('base64'), mime_type: 'audio/wav' }] }] }), wav);
  assert.throws(() => parseInteractionAudio({ steps: [] }));
});

test('switching sites cancels pending text and sends only the new generated line to the card and TTS', async context => {
  let now = 0; context.mock.method(Date, 'now', () => now);
  const requests: { input: NudgeInput; signal: AbortSignal; resolve: (text: string) => void }[] = [];
  const spoken: string[] = [];
  const { controller, browser, events } = fixture({ generate: (input, signal) => new Promise(resolve => requests.push({ input, signal, resolve })) }, { synthesize: async text => { spoken.push(text); return pcmToWav(Buffer.alloc(48)); } });
  try {
    controller.tick(); now = 5000; controller.tick();
    assert.equal(controller.current?.generation, 'loading'); assert.equal(spoken.length, 0);
    assert.equal(requests[0].input.domain, 'youtube.com');
    assert.deepEqual(Object.keys(requests[0].input).sort(), ['domain', 'nextAction', 'recentNudges', 'step', 'style', 'task']);
    browser.domain = 'instagram.com'; now = 6000; controller.tick(); assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve('Old generated YouTube text that must never be spoken.'); await settle();
    assert.equal(controller.current, null); assert.deepEqual(spoken, []);
    now = 11000; controller.tick(); assert.equal(requests.length, 1); // Cooldown still applies.
    now = 35000; controller.tick(); assert.equal(requests[1].input.domain, 'instagram.com');
    const generated = 'Fresh model-written Instagram observation. Shall we compare the sample sizes?';
    requests[1].resolve(generated); await settle();
    const current = controller.current as Nudge | null; assert.equal(current?.text, generated); assert.equal(current?.generation, 'ready');
    assert.deepEqual(spoken, [generated]); assert.equal(events.filter(e => e.type === 'play').length, 1);
    browser.domain = 'reddit.com'; now = 36000; controller.tick(); now = 65000; controller.tick();
    assert.deepEqual(requests[2].input.recentNudges, [generated]);
  } finally { controller.stop(); }
});
test('returning cancels in-flight speech after text generation so stale audio cannot play', async context => {
  let now = 0; context.mock.method(Date, 'now', () => now);
  let resolve!: (audio: Buffer) => void; let signal!: AbortSignal;
  const { controller, browser, events } = fixture({ generate: async () => 'A fresh generated reminder to compare the sample sizes.' }, { synthesize: (_text, _style, inputSignal) => { signal = inputSignal; return new Promise(r => { resolve = r; }); } });
  try {
    controller.tick(); now = 5000; controller.tick(); await settle(); assert.equal(controller.current?.generation, 'ready');
    browser.detour = false; controller.tick(); assert.equal(signal.aborted, true);
    resolve(pcmToWav(Buffer.alloc(48))); await settle();
    assert.equal(controller.current, null); assert.equal(events.some(e => e.type === 'play'), false);
  } finally { controller.stop(); }
});
test('generation errors leave saved next action and controls available without canned speech', async context => {
  let now = 0; context.mock.method(Date, 'now', () => now); let called = false;
  const { controller } = fixture({ generate: async () => { throw new Error('private upstream body'); } }, { synthesize: async () => { called = true; return Buffer.alloc(0); } });
  try {
    controller.tick(); now = 5000; controller.tick(); await settle();
    assert.equal(controller.current?.generation, 'failed'); assert.equal(controller.current?.text, '');
    assert.equal(controller.current?.nextAction, 'Compare the sample sizes.'); assert.equal(called, false);
    assert.doesNotMatch(controller.current!.generationError!, /private upstream/);
    controller.respond({ id: controller.current!.id, action: 'research' }); assert.equal(controller.current, null);
  } finally { controller.stop(); }
});
test('muted nudges still generate fresh text while work changes cancel pending writing', async context => {
  let now = 0; context.mock.method(Date, 'now', () => now); let called = false;
  let resolve!: (text: string) => void; let signal!: AbortSignal;
  const { controller, state } = fixture({ generate: (_input, s) => { signal = s; return new Promise(r => { resolve = r; }); } }, { synthesize: async () => { called = true; return Buffer.alloc(0); } });
  state.preferences.muted = true;
  try {
    controller.tick(); now = 5000; controller.tick();
    resolve('Freshly generated visual reminder for the current task.'); await settle();
    assert.equal(controller.current?.generation, 'ready'); assert.equal(controller.current?.audio, 'muted'); assert.equal(called, false);
    state.projects[0].nextAction = 'Write the methods comparison.'; controller.tick(); assert.equal(signal.aborted, true); assert.equal(controller.current, null);
  } finally { controller.stop(); }
});
test('preview also generates its words and failure never falls back to a prerecorded script', async () => {
  const inputs: NudgeInput[] = []; const spoken: string[] = [];
  const { controller } = fixture({ generate: async input => { inputs.push(input); return 'A new preview generated for this task and browser site.'; } }, { synthesize: async text => { spoken.push(text); return pcmToWav(Buffer.alloc(48)); } });
  try { await controller.preview(); assert.equal(inputs[0].domain, 'youtube.com'); assert.equal(inputs[0].style, 'playful'); assert.deepEqual(spoken, ['A new preview generated for this task and browser site.']); } finally { controller.stop(); }
  const failed = fixture({ generate: async () => { throw new Error('unavailable'); } }, { synthesize: async () => { throw new Error('must not synthesize'); } });
  try { await assert.rejects(failed.controller.preview(), /Could not write/); } finally { failed.controller.stop(); }
});

test('muting a pending voice preserves the mascot text and prevents late playback even after unmuting', async context => {
  let now = 0; context.mock.method(Date, 'now', () => now);
  let resolve!: (audio: Buffer) => void;
  const { controller, state, events } = fixture({ generate: async () => 'A fresh reminder to compare the sample sizes.' }, { synthesize: () => new Promise(r => { resolve = r; }) });
  try {
    controller.tick(); now = 5000; controller.tick(); await settle();
    const id = controller.current?.id;
    state.preferences.muted = true; controller.tick();
    assert.equal(controller.current?.id, id); assert.equal(controller.current?.generation, 'ready'); assert.equal(controller.current?.audio, 'muted');
    state.preferences.muted = false; controller.tick();
    resolve(pcmToWav(Buffer.alloc(48))); await settle();
    assert.equal(controller.current?.id, id); assert.equal(events.some(event => event.type === 'play'), false);
  } finally { controller.stop(); }
});

test('muting while a nudge is being written keeps its text generation but skips TTS', async context => {
  let now = 0; context.mock.method(Date, 'now', () => now);
  let resolve!: (text: string) => void; let called = false;
  const { controller, state } = fixture({ generate: () => new Promise(r => { resolve = r; }) }, { synthesize: async () => { called = true; return Buffer.alloc(48); } });
  try {
    controller.tick(); now = 5000; controller.tick();
    const id = controller.current?.id;
    state.preferences.muted = true; controller.tick();
    resolve('A fresh visual reminder to compare the sample sizes.'); await settle();
    assert.equal(controller.current?.id, id); assert.equal(controller.current?.generation, 'ready'); assert.equal(controller.current?.audio, 'muted'); assert.equal(called, false);
  } finally { controller.stop(); }
});
