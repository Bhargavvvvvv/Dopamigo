import { _electron } from 'playwright';
import electron from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-chat-ui-'));
const pdfPath = path.join(directory, 'rubric.pdf'); await fs.writeFile(pdfPath, '%PDF-1.4\nfixture');
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0', GEMINI_API_KEY: 'fixture-key' }; delete env.ELECTRON_RUN_AS_NODE; delete env.DOPAMIGO_DEV_URL;
let app;
async function launch() {
  app = await _electron.launch({ executablePath: electron, args: ['.'], env });
  const page = await app.firstWindow(); await page.getByRole('heading', { name: 'Dopamigo', exact: true }).waitFor();
  await app.evaluate(({ dialog }, pdfPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pdfPath] });
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body); globalThis.chatRequest = body;
      if (body.contents.at(-1).parts[0].text === 'Fail this message') return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '## Working outline\n\n1. Define the question.\n2. Compare the evidence.\n\nUse **three studies** (rubric.pdf, p. 1).' }] }, finishReason: 'STOP' }] }));
    };
  }, pdfPath);
  return page;
}
async function close() { await app.close(); app = undefined; }
try {
  let page = await launch();
  await page.evaluate(() => window.dopamigo.plan({ title: 'Urban green spaces', brief: 'Compare three studies.' }));
  await page.getByRole('button', { name: /^Work/ }).click();
  await page.getByRole('button', { name: 'Add PDF', exact: true }).click();
  await page.getByText('PDF · rubric.pdf', { exact: true }).waitFor();
  await page.getByLabel('Message Gemini').fill('Draft an outline'); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('heading', { name: 'Working outline', exact: true }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.chatRequest.contents[0].parts[2].inlineData.mimeType), 'application/pdf');
  await page.getByRole('button', { name: 'Add to notes', exact: true }).click();
  await page.getByRole('button', { name: 'Saved to notes', exact: true }).waitFor(); assert.match(await page.getByLabel('Work notes').inputValue(), /three studies/);
  await page.getByLabel('Message Gemini').fill('Fail this message'); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /HTTP 503/ }).waitFor(); assert.equal(await page.getByLabel('Message Gemini').inputValue(), 'Fail this message');
  await page.getByLabel('Message Gemini').fill(''); await fs.mkdir('test-results', { recursive: true });
  await page.getByRole('region', { name: 'Assignment work chat' }).screenshot({ path: 'test-results/work-chat.png' });
  await close(); page = await launch(); await page.getByRole('button', { name: /^Work/ }).click();
  await page.getByRole('heading', { name: 'Working outline', exact: true }).waitFor(); await page.getByText('PDF · rubric.pdf', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove PDF rubric.pdf', exact: true }).click(); await page.getByText('Add readings or a rubric to include in the conversation.', { exact: true }).waitFor();
  console.log('PASS: Electron chat, native PDF request, Markdown, save to notes, failed-message retry, restart persistence and PDF removal. Gemini response was mocked.');
} finally { if (app) await close(); await fs.rm(directory, { recursive: true, force: true }); }
