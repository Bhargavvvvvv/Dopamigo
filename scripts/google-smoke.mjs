import { _electron } from 'playwright';
import electron from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-google-'));
await fs.writeFile(path.join(directory, 'oauth.json'), JSON.stringify({ installed: { client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-client-secret-only' } }));
// A minimal real PDF containing a professor's assignment brief.
const text = 'Compare three studies on urban green spaces. Include methods and one research gap.';
const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf = '%PDF-1.4\n'; const offsets = [0]; for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index+1} 0 obj\n${object}\nendobj\n`; } const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; await fs.writeFile(path.join(directory, 'brief.pdf'), pdf); await fs.mkdir('test-results', { recursive: true }); await fs.writeFile('test-results/assignment-brief.pdf', pdf);
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0', DOPAMIGO_GOOGLE_FIXTURE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE; delete env.DOPAMIGO_DEV_URL;
let app;
async function launch() { app = await _electron.launch({ executablePath: electron, args: ['scripts/google-smoke-bootstrap.cjs'], env }); const page = await app.firstWindow(); await page.getByRole('heading', { name: 'Dopamigo', exact: true }).waitFor(); return page; }
async function wait(page, predicate) { const deadline = Date.now()+30000; while (!await page.evaluate(predicate)) { assert.ok(Date.now()<deadline, 'Google UI state timed out'); await new Promise(r => setTimeout(r,100)); } }
async function close() { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); app = undefined; }
try {
  let page = await launch(); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Import Google setup JSON' }).click();
  await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await wait(page, async () => { const s = await window.dopamigo.googleStatus(); return s.connected && Boolean(s.lastSyncAt) && !s.syncing; });
  assert.equal(await app.evaluate(() => globalThis.googleFixture.oauthOpens), 1);
  const snapshot = await page.evaluate(() => window.dopamigo.load()); assert.equal(snapshot.value.state.projects.length, 1);
  const id = snapshot.value.state.projects[0].id; const originalDue = snapshot.value.state.projects[0].deadline;
  // Removed calendar tasks must explain why they stay absent and offer an explicit recovery.
  await page.evaluate(id => window.dopamigo.command({ type: 'project.delete', projectId: id }), id);
  await page.getByText('Not being imported (1)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await wait(page, async () => !(await window.dopamigo.googleStatus()).syncing);
  assert.equal((await page.evaluate(() => window.dopamigo.load())).value.state.projects.length, 0);
  await page.getByRole('button', { name: 'Import Urban green spaces literature review again', exact: true }).click();
  await wait(page, async () => (await window.dopamigo.load()).value.state.projects.length === 1);
  await page.getByText('Not being imported (1)', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Open plan for Urban green spaces literature review' }).click();
  await page.getByText(/Matching document found/).waitFor();
  await page.getByText('Add the professor’s brief · optional', { exact: true }).click();
  await page.getByRole('button', { name: 'Import brief document' }).click();
  await wait(page, () => document.querySelector('textarea')?.value.includes('Compare three studies'));
  assert.match(await page.getByLabel('Professor’s assignment brief').inputValue(), /research gap/);
  await page.getByRole('button', { name: 'Save brief', exact: true }).click();
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  await page.getByLabel('Work notes').fill('Saved research notes survive calendar changes.');
  await page.getByRole('button', { name: /Settings/ }).click();
  await app.evaluate(() => { globalThis.googleFixture.phase = 2; });
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await wait(page, async () => !(await window.dopamigo.googleStatus()).syncing);
  const updated = (await page.evaluate(() => window.dopamigo.load())).value.state;
  assert.equal(updated.projects.length, 1); assert.equal(updated.projects[0].id, id); assert.notEqual(updated.projects[0].deadline, originalDue); assert.match(updated.projects[0].notes, /survive/);
  await page.getByRole('button', { name: 'Open plan for Urban green spaces literature review' }).click();
  await page.getByText('Assignment brief', { exact: true }).click();
  await page.getByRole('button', { name: 'Build plan from brief' }).click();
  await page.getByText('Development mock plan', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.dopamigo.load())).value.state.projects[0].id, id);
  await page.screenshot({ path: 'test-results/google-assignment.png' });
  const encrypted = await fs.readFile(path.join(directory, 'google-connection.enc'));
  for (const secret of ['fixture-access-only', 'fixture-refresh-only', 'fixture-client-secret-only']) assert.equal(encrypted.includes(Buffer.from(secret)), false);
  assert.equal((await fs.stat(path.join(directory, 'google-connection.enc'))).mode & 0o777, 0o600);
  await close(); page = await launch();
  await wait(page, async () => (await window.dopamigo.googleStatus()).connected && !(await window.dopamigo.googleStatus()).syncing);
  assert.equal(await app.evaluate(() => globalThis.googleFixture.oauthOpens), 0); assert.ok(await app.evaluate(() => globalThis.googleFixture.refreshes) >= 1);
  await page.getByRole('button', { name: /Settings/ }).click(); await page.screenshot({ path: 'test-results/google-settings.png' });
  await page.getByRole('button', { name: 'Disconnect Google', exact: true }).click();
  await wait(page, async () => !(await window.dopamigo.googleStatus()).connected);
  assert.equal((await page.evaluate(() => window.dopamigo.load())).value.state.projects.length, 1);
  console.log('PASS: actual Electron UI + real loopback callback + macOS encrypted credentials + automatic fixture assignment/Drive matching + PDF brief import + deadline update + same-task planning + restart refresh without sign-in + disconnect preserves work. Google API responses are fixtures, not a real-account test.');
} catch(error) { if (app) { const page = app.windows()[0]; await page.screenshot({path:'test-results/google-failure.png'}); console.log(await page.evaluate(() => window.dopamigo.googleStatus())); } throw error; }
finally { if (app) await close(); }
