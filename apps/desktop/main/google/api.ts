import { z } from 'zod';
import { digest, type CalendarEvent, type DriveDocument } from '../../../../packages/core/assignments';
import { GoogleAuth, GoogleAuthError } from './auth';
const calendarSchema = z.object({ id: z.string(), summary: z.string().default('Calendar'), accessRole: z.string().optional() });
const dateSchema = z.object({ date: z.string().optional(), dateTime: z.string().optional() });
const eventSchema = z.object({ id: z.string(), iCalUID: z.string().optional(), summary: z.string().default('Untitled event'), description: z.string().default(''), status: z.string().default('confirmed'), htmlLink: z.string().optional(), start: dateSchema.optional(), originalStartTime: dateSchema.optional() });
type RawEvent = z.infer<typeof eventSchema>;
const fileSchema = z.object({ id: z.string().regex(/^[\w-]+$/), name: z.string(), mimeType: z.string(), modifiedTime: z.string().optional(), trashed: z.boolean().optional() });
export type DriveFolder = { id: string; name: string };
const FOLDER = 'application/vnd.google-apps.folder';
export class GoogleAPI {
  constructor(private auth: GoogleAuth, private request: typeof fetch = fetch) {}
  private async get(url: URL, signal: AbortSignal, missingOkay = false): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.auth.accessToken(attempt === 1); signal.throwIfAborted();
      const response = await this.request(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), redirect: 'error' });
      if (response.status === 401 && attempt === 0) continue;
      if (missingOkay && [404, 410].includes(response.status)) return null;
      if (!response.ok) throw new GoogleAuthError(response.status === 403 ? 'Google denied access. Enable Calendar and Drive APIs and check the account permissions.' : response.status === 401 ? 'Google authorization needs reconnection.' : `Google sync is temporarily unavailable (HTTP ${response.status}). Existing tasks are preserved.`, response.status === 401);
      const body = await response.text(); if (body.length > 5000000) throw new Error('Google response exceeded the sync limit.'); return JSON.parse(body);
    }
    throw new GoogleAuthError('Reconnect Google.', true);
  }
  private async list<T>(base: string, params: Record<string,string>, field: string, schema: z.ZodType<T>, signal: AbortSignal, limit: number): Promise<T[]> {
    const items: T[] = []; let token: string | undefined;
    for (let page = 0; page < 30; page++) {
      const url = new URL(base); url.search = new URLSearchParams({ ...params, ...(token ? { pageToken: token } : {}) }).toString();
      const data = z.object({ nextPageToken: z.string().optional(), incompleteSearch: z.boolean().optional() }).passthrough().parse(await this.get(url, signal));
      if (data.incompleteSearch) throw new Error('Google returned an incomplete Drive search. Document matches were not updated.');
      const batch = z.array(schema).parse(data[field] ?? []); items.push(...batch);
      if (items.length > limit) throw new Error('Google sync reached its safety limit. No partial discovery was saved.');
      token = data.nextPageToken; if (!token) return items;
    }
    throw new Error('Google sync could not finish pagination. Existing tasks are preserved.');
  }
  private event(raw: RawEvent, calendarId: string, calendarName: string, accountId: string, key?: string): CalendarEvent {
    const deadline = raw.start?.date ?? raw.start?.dateTime ?? '';
    if (raw.status !== 'cancelled' && (!deadline || !Number.isFinite(Date.parse(deadline)))) throw new Error('A calendar event has an invalid date.');
    let eventUrl: string | undefined;
    try { const url = new URL(raw.htmlLink ?? ''); if (url.protocol === 'https:' && (url.hostname === 'calendar.google.com' || url.hostname === 'www.google.com')) eventUrl = url.href; } catch {}
    return { key: key ?? digest(JSON.stringify([accountId, raw.iCalUID ?? `${calendarId}:${raw.id}`, raw.originalStartTime?.date ?? raw.originalStartTime?.dateTime ?? ''])), accountId, calendarId, calendarName: calendarName.slice(0, 500), eventId: raw.id, title: raw.summary.slice(0, 500), description: raw.description.replace(/<[^>]*>/g, ' ').slice(0, 3000), deadline, eventUrl, status: raw.status === 'cancelled' ? 'cancelled' : 'active' };
  }
  async events(now: Date, signal: AbortSignal): Promise<CalendarEvent[]> {
    const accountId = this.auth.account!.id;
    const calendars = await this.list('https://www.googleapis.com/calendar/v3/users/me/calendarList', { maxResults: '250' }, 'items', calendarSchema, signal, 100);
    const start = new Date(now); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate() + 15);
    const events: CalendarEvent[] = [];
    for (const calendar of calendars.filter(c => c.accessRole !== 'freeBusyReader')) {
      const raw = await this.list(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`, { timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', showDeleted: 'false', maxResults: '250', orderBy: 'startTime' }, 'items', eventSchema, signal, 1000);
      for (const item of raw) { const event = this.event(item, calendar.id, calendar.summary, accountId); if (event.status === 'active' && (event.deadline.length === 10 ? event.deadline >= localDate(start) && event.deadline < localDate(end) : Date.parse(event.deadline) >= start.getTime() && Date.parse(event.deadline) < end.getTime())) events.push(event); }
      if (events.length > 1000) throw new Error('More than 1,000 upcoming events. Discovery stopped without changing saved work.');
    }
    return [...new Map(events.map(event => [event.key, event])).values()];
  }
  async tracked(source: { key: string; calendarId: string; calendarName: string; eventId: string; accountId: string; eventTitle: string }, signal: AbortSignal): Promise<CalendarEvent> {
    const raw = await this.get(new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events/${encodeURIComponent(source.eventId)}`), signal, true);
    if (!raw) return { ...source, title: source.eventTitle, description: '', deadline: '', status: 'unavailable' };
    return this.event(eventSchema.parse(raw), source.calendarId, source.calendarName, source.accountId, source.key);
  }
  async folders(signal: AbortSignal) {
    const files = await this.list('https://www.googleapis.com/drive/v3/files', { q: `trashed = false and mimeType = '${FOLDER}'`, fields: 'nextPageToken,files(id,name,mimeType)', pageSize: '1000' }, 'files', fileSchema, signal, 2000);
    return files.map(({ id, name }) => ({ id, name: name.slice(0, 500) }));
  }
  async folder(id: string, signal: AbortSignal) {
    const raw = await this.get(new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed`), signal);
    const file = fileSchema.parse(raw); if (file.mimeType !== FOLDER || file.trashed) throw new Error('Choose an existing Google Drive folder.'); return { id: file.id, name: file.name.slice(0, 500) };
  }
  async documents(folder: DriveFolder, signal: AbortSignal): Promise<DriveDocument[]> {
    const queue = [{ ...folder, depth: 0 }]; const visited = new Set<string>(); const documents: DriveDocument[] = [];
    while (queue.length) {
      const current = queue.shift()!; if (visited.has(current.id)) continue; visited.add(current.id);
      if (visited.size > 200 || current.depth > 8) throw new Error('The Assignments folder is too large or deep to check fully. Choose a smaller folder.');
      const files = await this.list('https://www.googleapis.com/drive/v3/files', { q: `trashed = false and '${current.id}' in parents`, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)', pageSize: '1000' }, 'files', fileSchema, signal, 2000);
      for (const file of files) {
        if (file.mimeType === FOLDER) queue.push({ id: file.id, name: `${current.name}/${file.name}`, depth: current.depth + 1 });
        else if (['application/vnd.google-apps.document', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(file.mimeType)) documents.push({ id: file.id, name: file.name.slice(0, 500), url: `https://drive.google.com/file/d/${file.id}/view`, modifiedTime: file.modifiedTime, location: current.name });
      }
      if (documents.length > 2000) throw new Error('The Assignments folder has more than 2,000 documents. Choose a smaller folder.');
    }
    return documents;
  }
}
function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
