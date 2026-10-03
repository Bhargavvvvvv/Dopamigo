export interface SpeechProvider { synthesize(text: string, style: 'gentle' | 'playful', signal: AbortSignal): Promise<Buffer>; }
