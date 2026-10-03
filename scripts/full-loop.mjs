import { _electron, chromium } from 'playwright';
import electron from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
async function waitForDesktop(page, predicate, description) {
  const deadline = Date.now() + 45000;
  while (!await page.evaluate(predicate)) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-loop-'));
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0' }; delete env.ELECTRON_RUN_AS_NODE; delete env.DOPAMIGO_DEV_URL;
const app = await _electron.launch({ executablePath: electron, args: ['.'], env }); let chrome;
try {
  const page = await app.firstWindow(); await page.getByLabel('Task name').waitFor();
  await page.evaluate(() => {
    window.loopEvents = [];
    window.dopamigo.onBrowser(status => window.loopEvents.push({ at: Date.now(), domain: status.domain, detour: status.detour, connected: status.connected }));
    window.dopamigo.onNudge(nudge => window.loopEvents.push({ at: Date.now(), nudge: nudge?.domain ?? null }));
  });
  const pairing = await page.evaluate(async () => {
    await window.dopamigo.plan({ title: 'Browser return loop test', brief: 'Read the saved source and write one bullet.' });
    await window.dopamigo.command({ type: 'resource.add', label: 'Work document', url: 'https://example.org/work' });
    await window.dopamigo.command({ type: 'preferences.update', patch: { monitoring: true, demoMode: true, muted: true, style: 'playful' } });
    await window.dopamigo.command({ type: 'session.transition', action: 'start' });
    return (await window.dopamigo.pairing()).value;
  });
  const extension = path.resolve('apps/browser-extension');
  chrome = await chromium.launchPersistentContext(path.join(directory, 'chrome'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = chrome.serviceWorkers()[0] ?? await chrome.waitForEvent('serviceworker');
  const popup = await chrome.newPage(); await popup.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
  await popup.locator('#token').fill(pairing.token); await popup.locator('#port').fill(String(pairing.port)); await popup.getByRole('button', { name: 'Connect to desktop' }).click();
  await chrome.route('https://example.org/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Work document fixture</h1>' }));
  await chrome.route('https://youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Configured domain fixture</h1>' }));
  await chrome.route('https://instagram.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Second configured domain fixture</h1>' }));
  const work = await chrome.newPage(); await work.goto('https://example.org/work'); await work.bringToFront();
  await waitForDesktop(page, async () => (await window.dopamigo.browserStatus()).canRestore, 'saved work tab');
  const detour = await chrome.newPage(); await detour.goto('https://youtube.com/watch'); await detour.bringToFront();
  await page.getByRole('region', { name: 'Dopamigo nudge' }).waitFor();
  await waitForDesktop(page, async () => (await window.dopamigo.nudgeStatus())?.generation === 'ready', 'Gemini YouTube text');
  assert.match((await page.evaluate(() => window.dopamigo.nudgeStatus())).text, /youtube/i);
  await detour.goto('https://instagram.com/');
  await waitForDesktop(page, async () => (await window.dopamigo.browserStatus()).domain === 'instagram.com', 'Instagram browser signal');
  await waitForDesktop(page, async () => (await window.dopamigo.nudgeStatus())?.domain === 'instagram.com', 'Instagram nudge after cooldown');
  await waitForDesktop(page, async () => (await window.dopamigo.nudgeStatus())?.generation === 'ready', 'Gemini Instagram text');
  assert.match((await page.evaluate(() => window.dopamigo.nudgeStatus())).text, /instagram/i);
  const nudgeWindow = app.windows().find(p => p.url().endsWith('#nudge'));
  assert.ok(nudgeWindow);
  const nativeWindow = await app.browserWindow(nudgeWindow); assert.equal(await nativeWindow.evaluate(w => w.isFocusable()), false);
  await nudgeWindow.locator('.nudge-text').filter({ hasText: /instagram/i }).waitFor();
  await nudgeWindow.screenshot({ path: 'test-results/site-aware-nudge.png' });
  await nudgeWindow.getByRole('button', { name: 'Bring me back', exact: true }).click();
  await waitForDesktop(page, async () => { const b = await window.dopamigo.browserStatus(); return b.domain === 'example.org' && !b.detour; }, 'restored work tab');
  await page.getByLabel('Work notes').waitFor();
  await page.getByLabel('Work notes').fill('The full browser-to-work return loop passed.');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await detour.bringToFront();
  await waitForDesktop(page, async () => !(await window.dopamigo.browserStatus()).enabled, 'monitoring paused');
  assert.equal(await page.evaluate(() => window.dopamigo.nudgeStatus()), null);
  await page.screenshot({ path: 'test-results/full-loop.png' });
  console.log('PASS: Electron + real Chromium extension → fresh Gemini YouTube nudge → live switch to fresh Instagram nudge → restore exact tab and Work view → notes → pause. Audio muted; demo timing visibly enabled.');
} catch (error) {
  console.log(await app.windows()[0]?.evaluate(() => window.loopEvents)); throw error;
} finally { await chrome?.close(); await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); }
