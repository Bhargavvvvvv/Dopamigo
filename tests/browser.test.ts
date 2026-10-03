import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { BrowserServer } from '../apps/desktop/main/adapters/browser-server';
import { browserMessageSchema } from '../packages/contracts';
import { matchesDomain } from '../packages/core/browser';
test('extension contract rejects extra browsing content and domain suffix tricks', () => {
  assert.equal(matchesDomain('m.youtube.com', ['youtube.com']), true); assert.equal(matchesDomain('notyoutube.com', ['youtube.com']), false);
  assert.equal(browserMessageSchema.safeParse({ type: 'tab', tabId: 1, windowId: 2, domain: 'youtube.com', relevant: false, body: 'private' }).success, false);
  assert.equal(browserMessageSchema.safeParse({ type: 'tab', tabId: -1, windowId: 2, domain: 'https://youtube.com', relevant: false }).success, false);
});
test('real loopback channel requires authentication, gates signals and acknowledges restore', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-browser-'));
  const server = new BrowserServer(directory, () => {}); await server.start(0);
  const pairing = await server.pairing(); const origin = `chrome-extension://${'a'.repeat(32)}`;
  const socket = new WebSocket(`ws://127.0.0.1:${pairing.port}/companion`, { origin });
  try {
    await once(socket, 'open'); const authenticated = once(socket, 'message'); socket.send(JSON.stringify({ type: 'auth', token: pairing.token })); await authenticated;
    socket.send(JSON.stringify({ type: 'tab', tabId: 1, windowId: 1, domain: 'youtube.com', relevant: false }));
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(server.status.domain, null);
    server.configure({ enabled: true, sessionId: 'session', domains: ['youtube.com'], resources: [] });
    socket.send(JSON.stringify({ type: 'tab', tabId: 1, windowId: 1, domain: 'example.org', relevant: true }));
    socket.send(JSON.stringify({ type: 'tab', tabId: 2, windowId: 1, domain: 'youtube.com', relevant: false }));
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(server.status.detour, true); assert.equal(server.status.canRestore, true);
    socket.on('message', raw => { const message = JSON.parse(raw.toString()); if (message.type === 'restore') socket.send(JSON.stringify({ type: 'restored', requestId: message.requestId, ok: true })); });
    assert.equal(await server.restore(), true);
    const rejected = new WebSocket(`ws://127.0.0.1:${pairing.port}/companion`, { origin }); await once(rejected, 'open'); const closed = once(rejected, 'close'); rejected.send(JSON.stringify({ type: 'auth', token: 'x'.repeat(43) })); await closed;
    server.configure({ enabled: false, sessionId: 'session', domains: [], resources: [] }); assert.equal(server.status.domain, null);
  } finally { socket.terminate(); await server.stop(); }
});
