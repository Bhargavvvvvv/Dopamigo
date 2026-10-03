import { _electron } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
const executablePath = path.resolve('release/mac-arm64/Dopamigo.app/Contents/MacOS/Dopamigo');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-package-'));
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0' }; delete env.ELECTRON_RUN_AS_NODE; delete env.DOPAMIGO_DEV_URL;
let app;
async function launch() { app = await _electron.launch({ executablePath, args: [], env }); return await app.firstWindow(); }
async function close() { if (app) { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); app = undefined; } }
try {
  let page = await launch(); await page.getByLabel('Task name').waitFor();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(await app.evaluate(() => process.arch), 'arm64');
  const briefPath = path.resolve('test-results/assignment-brief.pdf');
  if (await fs.stat(briefPath).catch(() => null)) {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, briefPath);
    const brief = await page.evaluate(() => window.dopamigo.importBrief()); assert.equal(brief.ok, true); assert.match(brief.value.text, /Compare three studies/);
  }
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Load sample assignment' }).click();
  await page.getByRole('button', { name: /^Return/ }).click();
  await page.getByText('Demo · Urban green spaces literature review', { exact: true }).last().waitFor();
  await page.screenshot({ path: 'test-results/packaged-return.png' });
  await close(); page = await launch();
  await page.getByRole('heading', { name: 'Where you left off', exact: true }).waitFor();
  assert.match(await page.locator('.saved-notes').textContent(), /Demo notes/);
  const asar = await fs.readFile('release/mac-arm64/Dopamigo.app/Contents/Resources/app.asar');
  const local = parse(await fs.readFile('.env').catch(() => Buffer.alloc(0))); const secrets = [local.GEMINI_API_KEY, local.GOOGLE_API_KEY, local.GOOGLE_OAUTH_CLIENT_SECRET, local.GOOGLE_CLIENT_SECRET].filter(Boolean);
  for (const secret of secrets) assert.equal(asar.includes(Buffer.from(secret)), false, 'Secret must not be bundled');
  console.log('PASS: packaged arm64 app launched, loaded the saved-work demo, restarted with intact notes, and contains no configured API key.');
} finally { await close(); }
