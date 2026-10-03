import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { SpeechProvider } from '../../../../packages/core/speech';
import { generateContent, ProviderError } from './gemini';
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40); return Buffer.concat([header, pcm]);
}
const audioSchema = z.object({ type: z.literal('audio'), data: z.string().min(1).max(12_000_000), mime_type: z.string().optional() });
export function parseInteractionAudio(response: unknown) {
  const parsed = z.object({ steps: z.array(z.object({ type: z.string(), content: z.array(z.unknown()).optional() })) }).parse(response);
  const clips = parsed.steps.filter(s => s.type === 'model_output').flatMap(s => s.content ?? []).map(s => audioSchema.safeParse(s)).filter(s => s.success);
  const clip = clips.at(-1); if (!clip?.success) throw new ProviderError('Google returned no speech audio.');
  const bytes = Buffer.from(clip.data.data, 'base64');
  if (bytes.length < 44) throw new ProviderError('Google returned empty speech audio.');
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return bytes;
  if (clip.data.mime_type?.startsWith('audio/l16')) return pcmToWav(bytes);
  throw new ProviderError('Google returned an unsupported audio format.');
}
export class GoogleTTS implements SpeechProvider {
  private cache = new Map<string, Buffer>();
  constructor(private key: string, private model: string, private voice: string) {}
  async synthesize(text: string, style: 'gentle' | 'playful', signal: AbortSignal) {
    if (!this.key) throw new ProviderError('Voice unavailable: configure GEMINI_API_KEY locally and restart.');
    const hash = createHash('sha256').update(JSON.stringify([this.model, this.voice, text, style])).digest('hex');
    const cached = this.cache.get(hash); if (cached) return cached;
    let audio: Buffer;
    if (/^gemini-(2\.|3\.1)/.test(this.model)) {
      const raw = await generateContent(this.key, this.model, { contents: [{ parts: [{ text: `Read warmly, without adding words: ${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } } } }, signal);
      const response = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ inlineData: z.object({ data: z.string(), mimeType: z.string() }).optional() })) }) })) }).parse(raw);
      const clip = response.candidates[0]?.content.parts.find(p => p.inlineData)?.inlineData;
      if (!clip || !clip.mimeType.startsWith('audio/')) throw new ProviderError('Google returned no speech audio.');
      const bytes = Buffer.from(clip.data, 'base64'); audio = clip.mimeType.includes('wav') ? bytes : pcmToWav(bytes);
    } else {
      let response: Response;
      try { response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key }, signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]), body: JSON.stringify({ model: this.model, store: false, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: style === 'playful' ? 'playful, warm, lighthearted' : 'warm, calm, friendly' }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: this.voice }] } }) }); }
      catch { throw new ProviderError('Voice generation was cancelled or Google could not be reached.'); }
      if (!response.ok) throw new ProviderError(`Voice unavailable (Google HTTP ${response.status}). Check TTS model access and quota.`);
      const raw = await response.text(); if (raw.length > 15_000_000) throw new ProviderError('Speech response exceeded the audio limit.');
      audio = parseInteractionAudio(JSON.parse(raw));
    }
    if (signal.aborted) throw new ProviderError('Speech cancelled.');
    if (this.cache.size >= 12) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(hash, audio); return audio;
  }
}
