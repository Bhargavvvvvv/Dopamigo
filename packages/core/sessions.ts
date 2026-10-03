import { randomUUID } from 'node:crypto';
import type { AppState, FocusSession } from '../contracts';
import { currentProject } from './state';
export type SessionAction = 'start' | 'pause' | 'break' | 'resume' | 'end';
export function saveCheckpoint(state: AppState, reason: string, at = new Date().toISOString()) {
  const project = currentProject(state); if (!project) return;
  const step = project.plan?.steps.find(s => s.id === project.activeStepId);
  state.checkpoints.unshift({ id: randomUUID(), projectId: project.id, sessionId: state.session?.projectId === project.id ? state.session.id : null, at, reason, projectTitle: project.title, stepTitle: step?.title ?? 'Roadmap complete', completed: project.plan?.steps.filter(s => s.status === 'done').map(s => s.title) ?? [], notes: project.notes, nextAction: project.nextAction, resources: structuredClone(project.resources) });
  state.checkpoints = state.checkpoints.slice(0, 100);
}
export function transitionSession(state: AppState, action: SessionAction, at = new Date().toISOString()) {
  const project = currentProject(state); if (!project) throw new Error('Create a plan first.');
  const session = state.session?.projectId === project.id ? state.session : null;
  if (action === 'start') {
    if (state.session && state.session.status !== 'ended') throw new Error('End or resume your existing session first.');
    if (!project.activeStepId) throw new Error('Reopen a step to start another session.');
    state.session = { id: randomUUID(), projectId: project.id, status: 'active', startedAt: at, updatedAt: at };
  } else {
    if (!session) throw new Error('No session to update.');
    const allowed: Record<Exclude<SessionAction, 'start'>, FocusSession['status'][]> = { pause: ['active'], break: ['active', 'paused'], resume: ['paused', 'break'], end: ['active', 'paused', 'break'] };
    if (!allowed[action].includes(session.status)) throw new Error('That session transition is not available.');
    session.status = ({ pause: 'paused', break: 'break', resume: 'active', end: 'ended' } as const)[action]; session.updatedAt = at;
  }
  saveCheckpoint(state, `session.${action}`, at);
}
