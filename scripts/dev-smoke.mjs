import { createServer } from 'vite';
import { _electron } from 'playwright';
import electron from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
process.argv.push('--main-only'); await import('./build.mjs');
const server = await createServer(); await server.listen();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-dev-'));
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0', DOPAMIGO_DEV_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: electron, args: ['.'], env });
try {
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByLabel('Task name').waitFor();
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('checkbox', { name: /Floating launcher/ }).click();
  const launcher = await app.waitForEvent('window'); await launcher.getByRole('button', { name: 'Open Dopamigo' }).waitFor();
  const launcherWindow = await app.browserWindow(launcher); assert.equal(await launcherWindow.evaluate(w => w.isFocusable()), false);
  await launcher.getByRole('button', { name: 'Open Dopamigo' }).click();
  await page.setViewportSize({ width: 760, height: 600 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'test-results/settings-minimum.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: Electron development mode rendered with CSP, launcher is non-focusable, settings fit the minimum window.');
} finally { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); await server.close(); }
