import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkChat } from '../apps/desktop/main/work-chat';
import { generateChat } from '../apps/desktop/main/adapters/gemini-chat';
import { JsonRepository } from '../apps/desktop/main/adapters/json-repository';
import { Store } from '../packages/core/store';
import { initialState } from '../packages/core/state';
import type { Project } from '../packages/contracts';
const project = (id: string): Project => ({ id, title: `Assignment ${id}`, brief: 'Explain the evidence', notes: 'My draft', resources: [], plan: null, nextAction: 'Draft an outline', activeStepId: null, createdAt: '2026-10-03' });
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-chat-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repository = new JsonRepository(directory); const state = initialState(); state.projects = [project('a'), project('b')]; state.selectedProjectId = 'a';
  const store = new Store(state, repository); const pdf = path.join(directory, 'reading.pdf'); await fs.writeFile(pdf, '%PDF-1.4\nfixture');
  return { store, directory, repository, pdf };
}
test('PDFs and chat persist, context follows the assignment even after selection changes', async t => {
  const { store, directory, repository, pdf } = await setup(t);
  let complete!: (value: string) => void;
  const chat = new WorkChat(store, directory, 'key', 'model', async (_key, _model, p, text, documents) => {
    assert.equal(p.id, 'a'); assert.equal(text, 'Explain it'); assert.equal(documents[0].name, 'reading.pdf'); assert.match(Buffer.from(documents[0].data, 'base64').toString(), /%PDF/);
    return new Promise(resolve => { complete = resolve; });
  });
  await chat.attach({ projectId: 'a' }, pdf); const id = store.state.projects[0].documents![0].id;
  const pending = chat.send({ projectId: 'a', text: 'Explain it' });
  while (!complete) await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(chat.send({ projectId: 'a', text: 'Duplicate' }), /already responding/);
  await assert.rejects(chat.remove({ projectId: 'a', documentId: id }), /Wait/);
  await store.update(s => { s.selectedProjectId = 'b'; }); complete('Grounded answer'); await pending;
  const loaded = (await repository.load()).state;
  assert.equal(loaded.projects[0].chat?.[1].text, 'Grounded answer'); assert.equal(loaded.projects[1].chat, undefined); assert.equal(loaded.projects[0].documents?.length, 1);
  await chat.remove({ projectId: 'a', documentId: id }); assert.equal(store.state.projects[0].documents?.length, 0);
  await assert.rejects(fs.stat(path.join(directory, 'chat-pdfs', `${id}.pdf`)));
});
test('provider failures preserve history and allow retry; missing PDFs prevent ungrounded requests', async t => {
  const { store, directory, pdf } = await setup(t); let calls = 0;
  const chat = new WorkChat(store, directory, '', '', async () => { calls++; if (calls === 1) throw new Error('Provider unavailable'); return 'Recovered'; });
  await assert.rejects(chat.send({ projectId: 'a', text: 'Help' }), /Provider unavailable/); assert.equal(store.state.projects[0].chat, undefined);
  await chat.send({ projectId: 'a', text: 'Help' }); assert.equal((await store.whenIdle()).projects[0].chat?.length, 2);
  await chat.attach({ projectId: 'a' }, pdf); await fs.rm(path.join(directory, 'chat-pdfs'), { recursive: true });
  await assert.rejects(chat.send({ projectId: 'a', text: 'Use PDF' }), /unavailable/); assert.equal(calls, 2);
});
test('invalid uploads, oversized attachment sets and unknown assignments leave no attachment metadata', async t => {
  const { store, directory, pdf } = await setup(t); const chat = new WorkChat(store, directory, '', '');
  await fs.writeFile(pdf, 'not a PDF'); await assert.rejects(chat.attach({ projectId: 'a' }, pdf), /not a supported PDF/);
  await fs.writeFile(pdf, '%PDF-1.4\n'); await assert.rejects(chat.attach({ projectId: 'missing' }, pdf), /not found/);
  const large = Buffer.alloc(7 * 1024 * 1024); large.write('%PDF-1.4'); await fs.writeFile(pdf, large);
  await chat.attach({ projectId: 'a' }, pdf); await assert.rejects(chat.attach({ projectId: 'a' }, pdf), /totaling 12 MB/);
  assert.equal(store.state.projects[0].documents?.length, 1); assert.equal((await fs.readdir(path.join(directory, 'chat-pdfs'))).length, 1);
});
test('Gemini request includes native PDFs, brief, notes and previous turns; blocks empty replies', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; }); let blocked = false;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    assert.match(body.contents[0].parts[0].text, /My draft/); assert.match(body.contents[0].parts[0].text, /Explain the evidence/);
    assert.equal(body.contents[0].parts[2].inlineData.mimeType, 'application/pdf'); assert.equal(body.contents[2].parts[0].text, 'Earlier question');
    return new Response(JSON.stringify(blocked ? { candidates: [{ finishReason: 'SAFETY' }] } : { candidates: [{ content: { parts: [{ text: 'private thought', thought: true }, { text: 'Supported answer' }] }, finishReason: 'STOP' }] }));
  };
  const p = project('a'); p.chat = [{ id: '1', role: 'user', text: 'Earlier question', at: '' }, { id: '2', role: 'model', text: 'Earlier answer', at: '' }];
  assert.equal(await generateChat('key', 'model', p, 'Continue', [{ name: 'file.pdf', data: 'abc' }]), 'Supported answer');
  blocked = true; await assert.rejects(generateChat('key', 'model', p, 'Continue', [{ name: 'file.pdf', data: 'abc' }]), /could not provide/);
});
