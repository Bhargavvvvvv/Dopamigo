import { _electron } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-delete-'));
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0' };
delete env.ELECTRON_RUN_AS_NODE; delete env.DOPAMIGO_DEV_URL;
const executablePath = path.resolve('release/mac-arm64/Dopamigo.app/Contents/MacOS/Dopamigo');
let app;
try {
  app = await _electron.launch({ executablePath, env });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Load sample assignment' }).click();
  const remove = page.getByRole('button', { name: /^Delete task / });
  await remove.waitFor();
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await remove.click();
  await page.waitForFunction(() => !document.querySelector('.task-delete')?.disabled);
  assert.equal(await remove.count(), 1);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await remove.click();
  await page.getByText('Your tasks will appear here.').waitFor();
  const state = JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8'));
  assert.equal(state.projects.length, 0); assert.equal(state.checkpoints.length, 0); assert.equal(state.session, null);
  console.log('PASS: packaged app supports cancelling and confirming task deletion, and persists the empty workspace.');
} finally { if (app) await app.close(); }
