import { createHash } from 'node:crypto';
import type { AppState, AssignmentCandidate, AssignmentClassification, GoogleFile } from '../contracts';
export type CalendarEvent = { key: string; accountId: string; calendarId: string; calendarName: string; eventId: string; title: string; description: string; deadline: string; eventUrl?: string; status: 'active' | 'cancelled' | 'unavailable' };
export type DriveDocument = GoogleFile & { location: string };
export interface AssignmentDetector { classify(events: CalendarEvent[], signal: AbortSignal): Promise<AssignmentClassification[]>; }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const eventFingerprint = (event: CalendarEvent) => digest(JSON.stringify([event.title, event.description, event.calendarName, event.deadline, event.status]));
export function candidateFrom(event: CalendarEvent, result: AssignmentClassification): AssignmentCandidate {
  return { key: event.key, accountId: event.accountId, calendarId: event.calendarId, eventId: event.eventId, eventUrl: event.eventUrl, calendarName: event.calendarName, eventTitle: event.title, title: result.title.trim() || event.title.slice(0, 180), subject: result.subject.trim() || 'Assignments', deadline: event.deadline, reason: result.reason };
}
export function createAssignment(state: AppState, item: AssignmentCandidate, at: string) {
  if (state.projects.some(project => project.assignment?.key === item.key)) return;
  if (state.projects.length >= 100) throw new Error('Your workspace has reached 100 tasks. Existing work is preserved.');
  const id = `google-${item.key}`; const stepId = `${id}-start`;
  const title = item.title || 'Upcoming assignment';
  const nextAction = `Write one rough note about what ${title.slice(0, 100)} needs.`;
  state.projects.push({ id, title, subject: item.subject, deadline: item.deadline, brief: '', notes: '', resources: [], createdAt: at,
    assignment: { ...item, status: 'active', documentStatus: 'unchecked', syncedAt: at },
    plan: { id: `${id}-starter`, source: 'starter', createdAt: at, steps: [{ id: stepId, title: nextAction, completion: 'One note about the assignment is saved. Add the professor’s brief whenever you have it.', minutes: 2, status: 'todo' }] },
    activeStepId: stepId, nextAction });
  if (!state.selectedProjectId) state.selectedProjectId = id;
}
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (value: string) => new Set(normalized(value).split(' ').filter(word => word.length > 2 && !['assignment', 'assignments', 'deadline', 'submission', 'submit', 'essay', 'report', 'draft', 'final', 'the', 'and', 'due', 'docx', 'pdf'].includes(word)));
export function matchDocument(title: string, subject: string, files: DriveDocument[]): { status: 'found'; file: GoogleFile } | { status: 'not_found' | 'ambiguous' } {
  const wanted = tokens(title); const subjectTokens = tokens(subject);
  const ranked = files.map(file => {
    const name = tokens(file.name); const location = tokens(file.location);
    const matches = [...wanted].filter(word => name.has(word)).length;
    const inSubject = [...subjectTokens].some(word => location.has(word) || name.has(word));
    const exact = normalized(file.name.replace(/\.(pdf|txt|md|docx?)$/i, '')) === normalized(title);
    const eligible = (exact && (wanted.size >= 2 || inSubject)) || (matches >= 2 && matches / Math.max(1, wanted.size) >= .7);
    return { file, score: eligible ? (exact ? 2 : matches / wanted.size) + (inSubject ? .2 : 0) : 0 };
  }).filter(item => item.score > 0).sort((a,b) => b.score - a.score);
  if (!ranked.length) return { status: 'not_found' };
  if (ranked[1] && ranked[0].score - ranked[1].score < .15) return { status: 'ambiguous' };
  const { location: _location, ...file } = ranked[0].file; return { status: 'found', file };
}
export function reconcileAssignments(state: AppState, events: CalendarEvent[], classifications: Map<string, AssignmentClassification>, files: DriveDocument[] | null, at: string) {
  const seen = new Set<string>(); const candidates: AssignmentCandidate[] = [];
  for (const event of events) {
    if (seen.has(event.key)) continue; seen.add(event.key);
    const result = classifications.get(event.key); let project = state.projects.find(p => p.assignment?.key === event.key);
    if (project?.assignment) {
      project.assignment.status = event.status; project.assignment.syncedAt = at;
      if (event.status === 'active') {
        project.deadline = event.deadline; project.assignment.eventTitle = event.title; project.assignment.eventUrl = event.eventUrl;
        if (result && (result.kind !== 'assignment' || result.confidence < .85)) project.assignment.status = 'needs_review';
      }
    } else if (event.status === 'active' && result && !state.google.ignored.includes(event.key)) {
      if (result.kind === 'assignment' && result.confidence >= .85) {
        createAssignment(state, candidateFrom(event, result), at); project = state.projects.find(p => p.assignment?.key === event.key);
      } else if (result.kind === 'possible' || (result.kind === 'assignment' && result.confidence >= .5)) candidates.push(candidateFrom(event, result));
    }
    if (project?.assignment && files) {
      const match = matchDocument(project.title, project.subject ?? '', files);
      project.assignment.documentStatus = match.status;
      const previous = project.assignment.document?.id;
      project.assignment.document = match.status === 'found' ? match.file : undefined;
      // Keep saved user resources. Manage only the integration's own link.
      if (previous) project.resources = project.resources.filter(r => r.id !== `drive-${previous}`);
      if (match.status === 'found' && !project.resources.some(r => r.id === `drive-${match.file.id}`) && project.resources.length < 30) project.resources.push({ id: `drive-${match.file.id}`, label: match.file.name.slice(0, 120), url: match.file.url });
    } else if (project?.assignment) project.assignment.documentStatus = 'unchecked';
  }
  state.google.candidates = candidates.slice(0, 100);
}
