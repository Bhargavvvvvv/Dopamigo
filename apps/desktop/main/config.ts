import { config } from 'dotenv';
import path from 'node:path';
export function loadConfig(dataPath: string, packaged = false) {
  config({ path: packaged ? [path.join(dataPath, '.env')] : [path.join(process.cwd(), '.env'), path.join(dataPath, '.env')], quiet: true });
  return { chatModel: process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_PLANNING_MODEL || 'gemini-3.8-flash', googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '', googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '', assignmentModel: process.env.GEMINI_ASSIGNMENT_MODEL || process.env.GEMINI_PLANNING_MODEL || 'gemini-3.8-flash', apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '', planningModel: process.env.GEMINI_PLANNING_MODEL || 'gemini-3.8-flash', nudgeModel: process.env.GEMINI_NUDGE_MODEL || process.env.GEMINI_PLANNING_MODEL || 'gemini-3.8-flash', ttsModel: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts', voice: process.env.GEMINI_TTS_VOICE || 'Kore' };
}
