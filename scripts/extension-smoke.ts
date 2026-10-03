import { chromium } from 'playwright';
import { BrowserServer } from '../apps/desktop/main/adapters/browser-server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-extension-'));
const server = new BrowserServer(directory, () => {});
await server.start(0);
const extension = path.resolve('apps/browser-extension');
const context = await chromium.launchPersistentContext(path.join(directory, 'profile'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
async function until(check: () => boolean, label: string) { const start = Date.now(); while (!check()) { if (Date.now() - start > 15000) throw new Error(`Timeout: ${label}`); await new Promise(resolve => setTimeout(resolve, 100)); } }
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const pairing = await server.pairing();
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
  await popup.locator('#token').fill(pairing.token); await popup.locator('#port').fill(String(pairing.port)); await popup.getByRole('button', { name: 'Connect to desktop' }).click();
  await until(() => server.status.connected, 'extension authentication');
  await context.route('https://example.org/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Test assignment draft</h1>' }));
  await context.route('https://youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Test configured detour</h1>' }));
  const work = await context.newPage(); await work.goto('https://example.org/review'); await work.bringToFront();
  assert.equal(server.status.domain, null);
  server.configure({ enabled: true, sessionId: 'test-session', domains: ['youtube.com'], resources: ['https://example.org/review'] });
  await until(() => server.status.canRestore, 'saved resource recognized');
  const detour = await context.newPage(); await detour.goto('https://youtube.com/watch'); await detour.bringToFront();
  await until(() => server.status.detour, 'configured domain detected');
  assert.equal(await server.restore(), true);
  await until(() => server.status.domain === 'example.org' && !server.status.detour, 'actual previous tab restored');
  server.configure({ enabled: false, sessionId: 'test-session', domains: [], resources: [] });
  await detour.bringToFront(); await new Promise(resolve => setTimeout(resolve, 250)); assert.equal(server.status.domain, null);
  console.log('PASS: real Chromium MV3 extension paired, observed only enabled active tabs, detected a detour, restored the exact work tab, and stopped monitoring. Page contents were local test fixtures.');
} finally { await context.close(); await server.stop(); }
