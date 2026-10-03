import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../apps/desktop/main/config';
import { GeminiAssignmentDetector } from '../apps/desktop/main/google/detector';
import type { CalendarEvent } from '../packages/core/assignments';
const config = loadConfig(path.resolve('.local-data'));
const base: CalendarEvent = { key: 'fixture', accountId: 'fixture', calendarId: 'fixture', calendarName: 'Research Methods', eventId: 'fixture', title: '', description: '', deadline: '2026-10-17', status: 'active' };
const events = [
  { ...base, title: 'Literature review submission deadline', description: 'Submit the 1500-word literature review on urban green spaces for Research Methods.' },
  { ...base, key: 'social', title: 'Dinner with friends', calendarName: 'Personal', description: 'Meet at the restaurant.' },
  { ...base, key: 'study', title: 'Work on the literature review', description: 'Study session. The assignment deadline is next month, not today.' },
];
const result = await new GeminiAssignmentDetector(config.apiKey, config.assignmentModel).classify(events, new AbortController().signal);
assert.equal(result[0].kind, 'assignment'); assert.ok(result[0].confidence >= .85);
assert.equal(result[1].kind, 'other'); assert.ok(result[2].kind !== 'assignment' || result[2].confidence < .85);
await fs.mkdir('test-results', { recursive: true });
await fs.writeFile('test-results/google-discovery-live.json', JSON.stringify({ model: config.assignmentModel, checkedAt: new Date().toISOString(), input: 'Synthetic assignment, dinner and study-session events; no personal calendar data', result }, null, 2));
console.log('PASS: live Gemini identifies an assignment deadline and does not auto-import a social event or study session. Input events are synthetic; Google account access was not tested.');
