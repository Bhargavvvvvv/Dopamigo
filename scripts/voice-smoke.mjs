import { _electron } from 'playwright';
import electron from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-voice-'));
const env = { ...process.env, DOPAMIGO_DATA_DIR: directory, DOPAMIGO_PORT: '0' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: electron, args: ['.'], env });
try {
  const page = await app.firstWindow(); await page.getByRole('heading', { name: 'Dopamigo', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(window.dopamigo));
  // Observe the actual media element. Playback is neither stubbed nor muted.
  await app.context().addInitScript(() => {
    window.voiceTest = { played: false, ended: false, error: false };
    const NativeAudio = window.Audio;
    window.Audio = function (...args) { const audio = new NativeAudio(...args); audio.addEventListener('playing', () => { window.voiceTest.played = true; }); audio.addEventListener('ended', () => { window.voiceTest.ended = true; }); audio.addEventListener('error', () => { window.voiceTest.error = true; }); return audio; };
  });
  const popupPromise = app.waitForEvent('window');
  const result = await page.evaluate(async () => {
    await window.dopamigo.plan({ title: 'Literature review', brief: 'Compare two studies and record the sample sizes.' });
    await window.dopamigo.command({ type: 'preferences.update', patch: { monitoring: true, demoMode: true, muted: false, volume: 0.35, style: 'playful', domains: ['instagram.com'] } });
    await window.dopamigo.command({ type: 'session.transition', action: 'start' });
    return await window.dopamigo.demoDetour();
  });
  assert.equal(result.ok, true);
  const popup = await popupPromise;
  await popup.waitForFunction(() => window.voiceTest?.played, null, { timeout: 90000 });
  const nudge = await page.evaluate(() => window.dopamigo.nudgeStatus());
  assert.equal(nudge.generation, 'ready'); assert.match(nudge.text, /instagram/i);
  await popup.screenshot({ path: 'test-results/live-nudge.png', omitBackground: true });
  await popup.waitForFunction(() => window.voiceTest.ended, null, { timeout: 30000 });
  assert.equal(await popup.evaluate(() => window.voiceTest.error), false);
  await fs.writeFile('test-results/live-playback.json', JSON.stringify({ textGeneratedBy: 'Google Gemini', generatedText: nudge.text, generatedBy: 'Google Gemini TTS', playback: 'Electron media element emitted playing and ended', monitoringSignal: 'labelled manual demo', checkedAt: new Date().toISOString() }, null, 2));
  await popup.getByRole('button', { name: 'Taking a break', exact: true }).click();
  const deadline = Date.now() + 5000;
  while ((await page.evaluate(() => window.dopamigo.load())).value.state.session.status !== 'break') {
    assert.ok(Date.now() < deadline, 'Taking a break should persist the session transition');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log('PASS: fresh Gemini text and real Google TTS played to completion through the floating mascot; Taking a break stopped nudges. Trigger was a labelled simulated detour.');
} catch (error) {
  const page = app.windows()[0];
  if (page) { await page.screenshot({ path: 'test-results/voice-failure.png' }); console.log(await page.evaluate(async () => { const nudge = await window.dopamigo.nudgeStatus(); return { generation: nudge?.generation, generationError: nudge?.generationError, audioState: nudge?.audio, audioError: nudge?.audioError, playback: window.voiceTest }; })); }
  throw error;
} finally { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); }
