import { _electron } from 'playwright';
import electron from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-mascot-'));
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0', GEMINI_API_KEY: 'fixture-key', GEMINI_NUDGE_MODEL: 'fixture-text', GEMINI_TTS_MODEL: 'fixture-tts' };
delete env.ELECTRON_RUN_AS_NODE; delete env.DOPAMIGO_DEV_URL;
await fs.mkdir('test-results/mascot', { recursive: true });
const app = await _electron.launch({ executablePath: electron, args: ['.'], env });
const errors = [];
const observeAudio = () => {
  window.mascotTest = { plays: 0, ended: 0, errors: 0, clips: [] };
  const NativeAudio = window.Audio;
  window.Audio = function (...args) {
    const clip = new NativeAudio(...args); window.mascotTest.clips.push(clip);
    clip.addEventListener('playing', () => window.mascotTest.plays++);
    clip.addEventListener('ended', () => window.mascotTest.ended++);
    clip.addEventListener('error', () => window.mascotTest.errors++);
    return clip;
  };
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!await check()) { assert.ok(Date.now() < end, message); await pause(50); }
}

try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'Dopamigo', exact: true }).waitFor();
  await page.evaluate(observeAudio); await app.context().addInitScript(observeAudio);
  app.on('window', popup => popup.on('pageerror', error => errors.push(error.message)));
  await app.evaluate(() => {
    globalThis.fixtureMode = 'ready'; globalThis.ttsRequests = 0;
    const pcm = Buffer.alloc(24000 * 2 * 8);
    for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 24000 * Math.PI * 440) * (Math.sin(i / 24000 * Math.PI * 3) + 1) * 2800), i * 2);
    const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    const data = Buffer.concat([header, pcm]).toString('base64');
    globalThis.fetch = async url => {
      if (String(url).includes('/interactions')) {
        globalThis.ttsRequests++;
        if (globalThis.fixtureMode === 'voice-failed') return new Response('{}', { status: 503 });
        if (globalThis.fixtureMode === 'slow') await new Promise(resolve => { globalThis.releaseSpeech = resolve; });
        return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data, mime_type: 'audio/wav' }] }] }));
      }
      if (globalThis.fixtureMode === 'text-failed') return new Response('{}', { status: 503 });
      const extra = globalThis.fixtureMode === 'voice-failed' ? ' One small step is enough.' : globalThis.fixtureMode === 'slow' ? ' There is no rush.' : '';
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ text: `YouTube can wait a moment. Want to write one rough sentence for your literature review?${extra}` }) }] } }] }));
    };
  });
  await page.evaluate(async () => {
    await window.dopamigo.plan({ title: 'Literature review', brief: 'Compare two studies and write a short introduction.' });
    await window.dopamigo.command({ type: 'preferences.update', patch: { monitoring: true, demoMode: true, muted: false, volume: 0.02, reduceMotion: false, floatingLauncher: true } });
    await window.dopamigo.command({ type: 'session.transition', action: 'start' });
    await window.dopamigo.demoDetour();
  });
  await until(() => app.windows().some(w => w.url().endsWith('#nudge')), 'Mascot window should open');
  const popup = app.windows().find(w => w.url().endsWith('#nudge'));
  const native = await app.browserWindow(popup);
  await popup.locator('.mascot-stage[data-speaking=true]').waitFor();
  await popup.waitForFunction(() => Number(document.querySelector('.mascot-avatar').style.getPropertyValue('--speech-level')) > 0);
  assert.equal(await page.evaluate(() => window.mascotTest.plays), 0, 'Do not play nudge audio twice in the workspace');
  assert.equal(await native.evaluate(w => w.isFocusable()), false);
  assert.equal(await native.evaluate(w => w.isAlwaysOnTop()), true);
  assert.equal(await native.evaluate(w => w.isVisibleOnAllWorkspaces()), true);
  assert.match(await native.evaluate(w => w.getBackgroundColor()), /^#000000(?:00)?$/);
  assert.equal(await popup.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await popup.evaluate(() => getComputedStyle(document.querySelector('.mascot-drag-area')).webkitAppRegion), 'drag');
  const image = await popup.evaluate(async () => {
    const image = document.querySelector('.mascot-avatar img'); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return { width: image.naturalWidth, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  });
  assert.ok(image.width > 100); assert.equal(image.alpha, 0, 'Mascot asset must have a transparent background');
  await popup.screenshot({ path: 'test-results/mascot/speaking.png', omitBackground: true });
  await popup.getByRole('button', { name: 'Stop voice', exact: true }).click();
  await popup.locator('.mascot-stage[data-speaking=false]').waitFor();
  assert.ok(await page.evaluate(() => window.dopamigo.nudgeStatus()), 'Stopping voice must leave the reminder available');
  assert.equal(await popup.evaluate(() => window.mascotTest.clips.every(clip => clip.paused)), true);
  await page.evaluate(() => window.dopamigo.command({ type: 'preferences.update', patch: { reduceMotion: true } }));
  await popup.locator('.mascot-stage.reduce-motion').waitFor();
  assert.equal(await popup.evaluate(() => getComputedStyle(document.querySelector('.mascot-float')).animationName), 'none');
  await popup.screenshot({ path: 'test-results/mascot/companion.png', omitBackground: true });
  assert.equal(await popup.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);

  // Exercise real window click-through policy without moving the user's mouse.
  const bubble = await popup.locator('.mascot-bubble').boundingBox();
  await app.evaluate(({ BrowserWindow, screen }, bubble) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#nudge'));
    const original = screen.getCursorScreenPoint; const ignore = win.setIgnoreMouseEvents.bind(win);
    globalThis.restoreHitTest = () => { screen.getCursorScreenPoint = original; win.setIgnoreMouseEvents = ignore; };
    win.setIgnoreMouseEvents = value => { globalThis.lastIgnored = value; ignore(value); };
    const bounds = win.getBounds();
    globalThis.testPoint = { x: bounds.x + 2, y: bounds.y + 2 }; screen.getCursorScreenPoint = () => globalThis.testPoint;
    globalThis.bubblePoint = { x: bounds.x + Math.round(bubble.x + 5), y: bounds.y + Math.round(bubble.y + 5) };
  }, bubble);
  // Force both transitions because the initial native state depends on the cursor.
  await app.evaluate(() => { globalThis.testPoint = globalThis.bubblePoint; });
  await until(() => app.evaluate(() => globalThis.lastIgnored === false), 'Bubble should accept clicks');
  await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#nudge')).getBounds(); globalThis.testPoint = { x: b.x + 2, y: b.y + 2 }; });
  await until(() => app.evaluate(() => globalThis.lastIgnored === true), 'Transparent margin should pass clicks through');
  await app.evaluate(() => globalThis.restoreHitTest());
  await popup.getByRole('button', { name: 'This is research', exact: true }).click();
  await until(() => native.evaluate(w => !w.isVisible()), 'Research should hide mascot');
  const launcher = app.windows().find(w => w.url().endsWith('#launcher'));
  assert.ok(launcher); assert.equal(await (await app.browserWindow(launcher)).evaluate(w => w.isVisible()), true);

  async function detour(mode, patch = {}) {
    await app.evaluate((_electron, mode) => { globalThis.fixtureMode = mode; }, mode);
    await page.evaluate(async patch => {
      await window.dopamigo.command({ type: 'session.transition', action: 'end' });
      await window.dopamigo.command({ type: 'preferences.update', patch });
      await window.dopamigo.command({ type: 'session.transition', action: 'start' });
      await window.dopamigo.demoDetour();
    }, patch);
    await popup.getByRole('region', { name: 'Dopamigo nudge' }).waitFor();
  }
  const requests = await app.evaluate(() => globalThis.ttsRequests);
  await detour('ready', { muted: true });
  await popup.getByText('Voice is muted', { exact: true }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.ttsRequests), requests);
  assert.equal(await popup.locator('.mascot-stage').getAttribute('data-speaking'), 'false');
  await popup.getByRole('button', { name: 'Dismiss nudge', exact: true }).click();
  await until(() => native.evaluate(w => !w.isVisible()), 'Dismiss should hide mascot');

  await page.evaluate(async () => {
    const state = (await window.dopamigo.load()).value.state;
    await window.dopamigo.draft({ projectId: state.selectedProjectId, nextAction: 'Compare the study methods and record one observation. '.repeat(9) });
    await window.dopamigo.flush();
  });
  await detour('text-failed');
  await until(() => page.evaluate(async () => (await window.dopamigo.nudgeStatus())?.generation === 'failed'), 'Text failure should be visible');
  await popup.screenshot({ path: 'test-results/mascot/text-unavailable.png', omitBackground: true });
  assert.ok(await popup.locator('.nudge-text').textContent());
  const fits = await popup.evaluate(() => {
    const bubble = document.querySelector('.mascot-bubble').getBoundingClientRect();
    const options = document.querySelector('.mascot-options').getBoundingClientRect();
    const mascot = document.querySelector('.mascot-drag-area').getBoundingClientRect();
    return options.bottom < bubble.bottom && bubble.bottom < mascot.top && mascot.bottom <= innerHeight;
  });
  assert.equal(fits, true, 'Long fallback text must scroll without covering the buttons or mascot');
  await popup.getByRole('button', { name: 'Taking a break', exact: true }).click();
  await until(() => page.evaluate(async () => (await window.dopamigo.load()).value.state.session.status === 'break'), 'Break should persist');
  await until(() => native.evaluate(w => !w.isVisible()), 'Break should hide mascot');

  await detour('voice-failed', { muted: false });
  await popup.getByText(/Voice unavailable \(Google HTTP 503\)/).waitFor();
  await popup.screenshot({ path: 'test-results/mascot/voice-unavailable.png', omitBackground: true });
  await popup.getByRole('button', { name: 'Dismiss nudge', exact: true }).click();
  await until(() => native.evaluate(w => !w.isVisible()), 'Dismiss should hide failed voice reminder');

  await detour('slow');
  await until(() => app.evaluate(() => Boolean(globalThis.releaseSpeech)), 'Speech request should be pending');
  const plays = await popup.evaluate(() => window.mascotTest.plays);
  await popup.getByRole('button', { name: 'Dismiss nudge', exact: true }).click();
  await app.evaluate(() => globalThis.releaseSpeech()); await pause(500);
  assert.equal(await popup.evaluate(() => window.mascotTest.plays), plays, 'Cancelled speech must never play late');

  const workspace = await app.browserWindow(page); await workspace.evaluate(w => w.hide());
  await detour('ready');
  await popup.locator('.mascot-stage[data-speaking=true]').waitFor();
  assert.equal(await workspace.evaluate(w => w.isVisible()), false);
  assert.equal(await (await app.browserWindow(launcher)).evaluate(w => w.isVisible()), false);
  await popup.getByRole('button', { name: 'Bring me back', exact: true }).click();
  await until(() => workspace.evaluate(w => w.isVisible()), 'Return should reveal the workspace');
  await until(() => native.evaluate(w => !w.isVisible()), 'Return should hide mascot');
  assert.equal(await popup.evaluate(() => window.mascotTest.clips.every(clip => clip.paused)), true);
  const preview = await page.evaluate(() => window.dopamigo.previewVoice()); assert.equal(preview.ok, true);
  await until(() => page.evaluate(() => window.mascotTest.plays === 1), 'Voice preview should still play only in workspace');
  assert.equal(await native.evaluate(w => w.isVisible()), false);
  assert.deepEqual(errors, []);
  assert.equal(await popup.evaluate(() => window.mascotTest.errors), 0);
  console.log('PASS: transparent floating mascot, native overlay properties, click-through margins, speech-driven motion, no duplicate audio, stop voice, reduce motion, muted text, provider failures, cancellation, return/research/break/dismiss, hidden workspace and voice previews. Speech fixtures used; no live provider requests.');
} finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
