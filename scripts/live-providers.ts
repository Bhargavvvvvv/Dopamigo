import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../apps/desktop/main/config';
import { GeminiPlanner } from '../apps/desktop/main/adapters/gemini';
import { GeminiNudgeWriter } from '../apps/desktop/main/adapters/gemini-nudge-writer';
import { GoogleTTS } from '../apps/desktop/main/adapters/google-tts';
const config = loadConfig(path.resolve('.local-data'));
await fs.mkdir('test-results', { recursive: true });
const status: Record<string, unknown> = { planningModel: config.planningModel, ttsModel: config.ttsModel, nudgeModel: config.nudgeModel, checkedAt: new Date().toISOString() };
try {
  const plan = await new GeminiPlanner(config.apiKey, config.planningModel).generate({ title: 'Literature review on urban green spaces', brief: 'Compare three studies on urban green spaces and student wellbeing. Write a 1500-word literature review with a methods comparison and a research gap.' });
  if (plan.kind !== 'plan') throw new Error('Provider requested clarification for the sample assignment.');
  status.planning = 'passed'; status.stepCount = plan.plan.steps.length; console.log(`PASS: live Gemini returned ${plan.plan.steps.length} validated steps.`);
} catch (error) { status.planning = (error as Error).message; console.log(`Planning check: ${(error as Error).message}`); }
try {
  const text = await new GeminiNudgeWriter(config.apiKey, config.nudgeModel).generate({ domain: 'instagram.com', task: 'Literature review on urban green spaces', step: 'Compare methods', nextAction: 'Compare the sample sizes in two studies.', style: 'playful', recentNudges: [] }, new AbortController().signal);
  status.nudgeWriting = 'passed'; status.generatedText = text;
  const audio = await new GoogleTTS(config.apiKey, config.ttsModel, config.voice).synthesize(text, 'playful', new AbortController().signal);
  await fs.writeFile('test-results/google-nudge.wav', audio); status.tts = 'passed'; status.audioBytes = audio.length; console.log(`PASS: live Google TTS returned ${audio.length} bytes of WAV audio.`);
} catch (error) { status.tts = (error as Error).message; console.log(`TTS check: ${(error as Error).message}`); }
await fs.writeFile('test-results/live-providers.json', JSON.stringify(status, null, 2));
if (status.planning !== 'passed' || status.tts !== 'passed' || status.nudgeWriting !== 'passed') process.exitCode = 1;
