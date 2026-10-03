import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiNudgeWriter } from '../apps/desktop/main/adapters/gemini-nudge-writer';
import type { NudgeInput } from '../packages/core/nudge-writer';
const input: NudgeInput = { domain: 'instagram.com', task: 'Green spaces review', step: 'Compare methods', nextAction: 'Compare the sample sizes.', style: 'playful', recentNudges: [] };
const response = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
test('Gemini nudge writer sends bounded context and validates a fresh structured response each time', async context => {
  const requests: Record<string, any>[] = [];
  context.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    requests.push(JSON.parse(options.body as string));
    return response(JSON.stringify({ text: `Generated line ${requests.length} about Instagram and comparing sample sizes.` }));
  });
  const writer = new GeminiNudgeWriter('fake-test-key', 'model');
  const first = await writer.generate(input, new AbortController().signal);
  const second = await writer.generate({ ...input, recentNudges: [first] }, new AbortController().signal);
  assert.notEqual(first, second); assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[0].contents[0].parts[0].text), input);
  assert.equal(requests[0].generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
  assert.match(requests[0].systemInstruction.parts[0].text, /cannot see the page/);
  await assert.rejects(writer.generate({ ...input, notes: 'private' } as NudgeInput, new AbortController().signal));
  assert.equal(requests.length, 2);
});
test('nudge writer rejects missing keys, API errors, blocked, malformed and truncated output', async context => {
  await assert.rejects(new GeminiNudgeWriter('', 'model').generate(input, new AbortController().signal), /GEMINI_API_KEY/);
  let result = new Response('{}', { status: 503 });
  context.mock.method(globalThis, 'fetch', async () => result);
  const writer = new GeminiNudgeWriter('fake-test-key', 'model');
  await assert.rejects(writer.generate(input, new AbortController().signal), /HTTP 503/);
  for (const value of ['not JSON', JSON.stringify({ text: '' }), JSON.stringify({ text: 'x'.repeat(281) }), JSON.stringify({ text: 'word '.repeat(51) }), JSON.stringify({ text: 'A valid length\nwith a control character' }), JSON.stringify({ text: 'Valid length text here.', extra: 'unexpected' })]) {
    result = response(value); await assert.rejects(writer.generate(input, new AbortController().signal), /validation/);
  }
  result = response(JSON.stringify({ text: 'This response was cut short.' }), 'MAX_TOKENS');
  await assert.rejects(writer.generate(input, new AbortController().signal), /validation/);
  result = new Response(JSON.stringify({ candidates: [] })); await assert.rejects(writer.generate(input, new AbortController().signal), /validation/);
});
