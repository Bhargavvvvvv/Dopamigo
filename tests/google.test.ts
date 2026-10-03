import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initialState } from '../packages/core/state';
import { stateSchema } from '../packages/contracts';
import { applyCommand } from '../packages/core/commands';
import { reconcileAssignments, matchDocument, type CalendarEvent } from '../packages/core/assignments';
import { GoogleAuth, GOOGLE_SCOPES, type SecretStorage } from '../apps/desktop/main/google/auth';
import { GoogleAPI } from '../apps/desktop/main/google/api';
import { GoogleController } from '../apps/desktop/main/google/controller';
import { Store } from '../packages/core/store';
import { readBrief } from '../apps/desktop/main/google/brief';
import { GeminiAssignmentDetector } from '../apps/desktop/main/google/detector';
const event: CalendarEvent = { key: 'assignment-key', accountId: 'student', calendarId: 'cal', calendarName: 'Research Methods', eventId: 'event', title: 'Urban green spaces literature review due', description: 'Submit the literature review.', deadline: '2026-10-17', status: 'active' };
const classification = { kind: 'assignment' as const, title: 'Urban green spaces literature review', subject: 'Research Methods', confidence: .98, reason: 'Explicit assignment deadline.' };
const files = [{ id: 'draft', name: 'Urban green spaces literature review', url: 'https://drive.google.com/file/d/draft/view', location: 'Assignments/Research Methods', modifiedTime: '2026-10-03T12:00:00Z' }];
function memoryStorage(): SecretStorage { let data: any = { version: 1 }; return { read: async () => structuredClone(data), write: async next => { data = structuredClone(next); } }; }
const client = { client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-client-secret' };
const credentials = { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: Date.now()+3600000, scope: GOOGLE_SCOPES.join(' '), accountId: 'student', email: 'student@example.org' };
test('Google import is additive, deduplicated, updates deadlines and preserves work on cancellation', () => {
  const state = initialState(); const classifications = new Map([[event.key, classification]]);
  reconcileAssignments(state, [event, event], classifications, files, 'now'); assert.equal(state.projects.length, 1);
  const project = state.projects[0]; project.notes = 'My actual work'; project.nextAction = 'A custom next action'; project.plan!.steps[0].status = 'done';
  reconcileAssignments(state, [{ ...event, deadline: '2026-11-20' }], classifications, [], 'later');
  assert.equal(state.projects.length, 1); assert.equal(project.deadline, '2026-11-20'); assert.equal(project.notes, 'My actual work'); assert.equal(project.nextAction, 'A custom next action'); assert.equal(project.plan!.steps[0].status, 'done'); assert.equal(project.assignment?.documentStatus, 'not_found');
  reconcileAssignments(state, [{ ...event, status: 'cancelled', deadline: '' }], new Map(), null, 'later');
  assert.equal(project.assignment?.status, 'cancelled'); assert.equal(project.notes, 'My actual work'); assert.equal(project.deadline, '2026-11-20');
});
test('uncertain events stay in the inbox and document ambiguity never implies progress', () => {
  const state = initialState(); reconcileAssignments(state, [event], new Map([[event.key, { ...classification, confidence: .65 }]]), files, 'now');
  assert.equal(state.projects.length, 0); assert.equal(state.google.candidates.length, 1);
  state.google.ignored.push(event.key); reconcileAssignments(state, [event], new Map([[event.key, classification]]), files, 'now'); assert.equal(state.projects.length, 0);
  assert.equal(matchDocument(classification.title, classification.subject, [...files, { ...files[0], id: 'another' }]).status, 'ambiguous');
  assert.equal(matchDocument('Essay', 'Economics', [{ ...files[0], name: 'Essay', location: 'Assignments/History' }]).status, 'not_found');
  assert.equal(matchDocument(classification.title, classification.subject, files).status, 'found');
});
test('previous local saves load with Google disconnected and no schema version rewrite', () => {
  const { google: _google, ...old } = initialState(); const loaded = stateSchema.parse(old);
  assert.equal(loaded.version, 1); assert.equal(loaded.google.enabled, false); assert.deepEqual(loaded.google.candidates, []);
});
test('desktop OAuth uses real loopback callback, state and PKCE, persists refresh access, and revokes on disconnect', async () => {
  const storage = memoryStorage(); let challenge = ''; let refreshCalls = 0; let revoked = false;
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/userinfo')) return new Response(JSON.stringify({ sub: 'student', email: 'student@example.org', email_verified: true }));
    if (String(url).endsWith('/revoke')) { revoked = true; return new Response('{}'); }
    const body = new URLSearchParams(init!.body as URLSearchParams);
    if (body.get('grant_type') === 'authorization_code') assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), challenge);
    else refreshCalls++;
    return new Response(JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 1, scope: GOOGLE_SCOPES.join(' ') }));
  };
  const auth = new GoogleAuth(storage, async link => {
    const url = new URL(link); assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); challenge = url.searchParams.get('code_challenge')!;
    const callback = new URL(url.searchParams.get('redirect_uri')!); assert.equal(callback.hostname, '127.0.0.1');
    callback.search = new URLSearchParams({ state: 'é'.repeat(43), code: 'bad' }).toString(); assert.equal((await fetch(callback)).status, 400);
    callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, code: 'fixture-code' }).toString(); assert.equal((await fetch(callback)).status, 200);
  }, client, request);
  await auth.load(); await auth.connect(); assert.equal(auth.account?.email, 'student@example.org');
  await Promise.all([auth.accessToken(), auth.accessToken()]); assert.equal(refreshCalls, 1);
  const reopened = new GoogleAuth(storage, async () => {}, client, request); await reopened.load(); assert.equal(reopened.connected, true);
  await reopened.disconnect(); assert.equal(reopened.connected, false); assert.equal(revoked, true);
});
test('denied consent and missing scopes never create a connected account', async () => {
  const auth = new GoogleAuth(memoryStorage(), async link => {
    const url = new URL(link); const callback = new URL(url.searchParams.get('redirect_uri')!); callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, error: 'access_denied' }).toString(); await fetch(callback);
  }, client);
  await assert.rejects(auth.connect(), /not approved/); assert.equal(auth.connected, false);
  await assert.rejects(auth.importClient({ web: client }), /Desktop/);
  const partial = new GoogleAuth(memoryStorage(), async link => {
    const url = new URL(link); const callback = new URL(url.searchParams.get('redirect_uri')!); callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, code: 'fixture' }).toString(); await fetch(callback);
  }, client, async () => new Response(JSON.stringify({ access_token: 'partial', refresh_token: 'partial-refresh', expires_in: 3600, scope: 'openid email' })));
  await assert.rejects(partial.connect(), /both needed/); assert.equal(partial.connected, false);
});
test('Calendar pagination, recurring identities and all-day deadlines survive exact parsing', async () => {
  const storage = memoryStorage(); await storage.write({ version: 1, credentials }); const auth = new GoogleAuth(storage, async () => {}, client); await auth.load();
  const calls: URL[] = [];
  const api = new GoogleAPI(auth, async raw => {
    const url = new URL(String(raw)); calls.push(url);
    if (url.pathname.endsWith('/calendarList')) return new Response(JSON.stringify({ items: [{ id: 'one', summary: 'Research Methods', accessRole: 'reader' }] }));
    const second = url.searchParams.has('pageToken'); return new Response(JSON.stringify({ ...(second ? {} : { nextPageToken: 'next' }), items: [{ id: second ? 'two' : 'one', iCalUID: 'recurring', originalStartTime: { date: second ? '2026-10-12' : '2026-10-10' }, summary: 'Essay deadline', start: { date: second ? '2026-10-12' : '2026-10-10' }, end: { date: '2026-10-11' } }] }));
  });
  const events = await api.events(new Date('2026-10-03T12:00:00Z'), new AbortController().signal);
  assert.equal(events.length, 2); assert.notEqual(events[0].key, events[1].key); assert.equal(events[0].deadline, '2026-10-10'); assert.equal(calls.at(-1)!.searchParams.get('pageToken'), 'next');
});
test('sync classifies automatically, reuses classifications, discovers folder and follows moved deadlines', async () => {
  const storage = memoryStorage(); await storage.write({ version: 1, credentials }); const auth = new GoogleAuth(storage, async () => {}, client); await auth.load();
  const state = initialState(); state.google.enabled = true; let saves = 0; const store = new Store(state, { load: async () => ({ state, notice: null }), save: async () => { saves++; } });
  let scans = 0; let classifications = 0;
  const api = { events: async () => ++scans < 3 ? [event] : [], folders: async () => [{ id: 'assignments', name: 'Assignments' }], folder: async () => ({ id: 'assignments', name: 'Assignments' }), documents: async () => files, tracked: async () => ({ ...event, deadline: '2026-11-20' }) } as unknown as GoogleAPI;
  const controller = new GoogleController(store, auth, api, { classify: async events => { classifications++; return events.map(() => classification); } }, () => {});
  try {
    await Promise.all([controller.sync(), controller.sync()]); assert.equal(scans, 1); assert.equal(store.state.projects.length, 1); assert.equal(store.state.projects[0].assignment?.documentStatus, 'found'); assert.equal(store.state.google.folderId, 'assignments');
    await controller.sync(); assert.equal(classifications, 1); await controller.sync(); assert.equal(store.state.projects[0].deadline, '2026-11-20'); assert.equal(classifications, 2); assert.equal(saves, 3);
  } finally { controller.stop(); }
});
test('disconnecting while classification is pending prevents a late import', async () => {
  const storage = memoryStorage(); await storage.write({ version: 1, credentials }); const auth = new GoogleAuth(storage, async () => {}, client, async () => new Response('{}')); await auth.load();
  const state = initialState(); state.google.enabled = true; const store = new Store(state, { load: async () => ({ state, notice: null }), save: async () => {} });
  let finish!: () => void;
  const api = { events: async () => [event], folders: async () => [], documents: async () => [] } as unknown as GoogleAPI;
  const controller = new GoogleController(store, auth, api, { classify: async () => { await new Promise<void>(resolve => { finish = resolve; }); return [classification]; } }, () => {});
  try { const sync = controller.sync(); await new Promise(r => setImmediate(r)); const disconnect = controller.action({ type: 'disconnect' }); finish(); await Promise.all([sync, disconnect]); assert.equal(store.state.projects.length, 0); assert.equal(store.state.google.enabled, false); } finally { controller.stop(); }
});

test('removed Calendar assignments stay excluded until individually restored through Google sync', async () => {
  const storage = memoryStorage(); await storage.write({ version: 1, credentials });
  const auth = new GoogleAuth(storage, async () => {}, client); await auth.load();
  const state = initialState(); state.google.enabled = true;
  const store = new Store(state, { load: async () => ({ state, notice: null }), save: async () => {} });
  const api = { events: async () => [event], folders: async () => [], documents: async () => [] } as unknown as GoogleAPI;
  let publications = 0;
  const controller = new GoogleController(store, auth, api, { classify: async () => [classification] }, () => { publications++; });
  try {
    await controller.sync(); const id = store.state.projects[0].id;
    const before = publications;
    await store.update(s => { applyCommand(s, { type: 'project.delete', projectId: id }); s.google.ignored.push('another-excluded-event'); });
    assert.ok(publications > before, 'Deleting a task should refresh Google settings immediately');
    assert.deepEqual(controller.status.ignoredAssignments[0], { key: event.key, title: classification.title });
    await controller.sync(); assert.equal(store.state.projects.length, 0);
    await assert.rejects(controller.action({ type: 'restore', key: 'unknown-event' }), /no longer excluded/);
    await controller.action({ type: 'restore', key: event.key });
    assert.equal(store.state.projects.length, 1); assert.equal(store.state.projects[0].id, id);
    assert.deepEqual(store.state.google.ignored, ['another-excluded-event']);
    await controller.sync(); assert.equal(store.state.projects.length, 1);
    await store.update(s => { s.google.enabled = false; });
    await assert.rejects(controller.action({ type: 'restore', key: 'another-excluded-event' }), /Turn on/);
    assert.deepEqual(store.state.google.ignored, ['another-excluded-event']);
  } finally { await controller.stop(); }
});
test('Gemini discovery validates every input index before applying classifications', async context => {
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ events: [{ ...classification, index: 4 }] }) }] } }] })));
  await assert.rejects(new GeminiAssignmentDetector('test-key', 'model').classify([event], new AbortController().signal), /invalid AI response/);
});
test('brief import reads local text and rejects oversized or unsupported files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-brief-')); const file = path.join(directory, 'brief.txt');
  await fs.writeFile(file, 'Compare three studies.'); assert.equal((await readBrief(file)).text, 'Compare three studies.');
  await fs.writeFile(file, 'x'.repeat(30001)); await assert.rejects(readBrief(file), /30,000/);
});
