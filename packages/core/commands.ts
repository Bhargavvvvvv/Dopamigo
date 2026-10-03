import { randomUUID } from 'node:crypto';
import type { AppState, Command } from '../contracts';
import { currentProject } from './state';
import { saveCheckpoint, transitionSession } from './sessions';
import { loadDemo } from './demo';
export function applyCommand(state: AppState, command: Command) {
  if (command.type === 'demo.load') { loadDemo(state); return; }
  if (command.type === 'preferences.update') { Object.assign(state.preferences, command.patch); return; }
  if (command.type === 'session.transition') { transitionSession(state, command.action); return; }
  if (command.type === 'project.select') {
    if (!state.projects.some(p => p.id === command.projectId)) throw new Error('Project not found.');
    if (state.session && state.session.status !== 'ended' && state.session.projectId !== command.projectId) throw new Error('End your session before switching projects.');
    state.selectedProjectId = command.projectId; return;
  }
  if (command.type === 'project.delete') {
    const target = state.projects.find(p => p.id === command.projectId);
    if (!target) throw new Error('This task is no longer available.');
    const key = target.assignment?.key;
    if (key) {
      if (!command.allowReimport && !state.google.ignored.includes(key)) {
        if (state.google.ignored.length >= 1000) throw new Error('Too many ignored calendar assignments. Allow calendar sync to recreate this task before deleting it.');
        state.google.ignored.push(key);
      }
      if (command.allowReimport) state.google.ignored = state.google.ignored.filter(item => item !== key);
      state.google.candidates = state.google.candidates.filter(candidate => candidate.key !== key);
    }
    state.projects = state.projects.filter(p => p.id !== target.id);
    state.checkpoints = state.checkpoints.filter(checkpoint => checkpoint.projectId !== target.id);
    if (state.session?.projectId === target.id) state.session = null;
    if (state.selectedProjectId === target.id) state.selectedProjectId = state.projects[0]?.id ?? null;
    return;
  }
  const project = currentProject(state);
  if (command.type === 'project.brief') { if (!project) throw new Error('Select a task first.'); project.brief = command.brief; saveCheckpoint(state, 'brief.updated'); return; }
  if (!project?.plan) throw new Error('Create a plan first.');
  if (command.type === 'resource.add') { if (project.resources.length >= 30) throw new Error('Remove a resource before adding more.'); project.resources.push({ id: randomUUID(), label: command.label, url: command.url }); saveCheckpoint(state, 'resource.added'); return; }
  if (command.type === 'resource.remove') { project.resources = project.resources.filter(r => r.id !== command.resourceId); saveCheckpoint(state, 'resource.removed'); return; }
  const steps = project.plan.steps;
  const step = steps.find(s => s.id === ('stepId' in command ? command.stepId : project.activeStepId));
  if (!step) throw new Error('This step is no longer available.');
  if (command.type === 'step.edit') { step.title = command.title; step.completion = command.completion; step.minutes = command.minutes; }
  if (command.type === 'step.status') step.status = command.status;
  if (command.type === 'step.move') { const index = steps.indexOf(step); const target = index + (command.direction === 'up' ? -1 : 1); if (target >= 0 && target < steps.length) [steps[index], steps[target]] = [steps[target], steps[index]]; }
  if (command.type === 'step.smaller') {
    if (steps.length >= 30) throw new Error('Finish or edit a step before adding more.');
    const tiny = { id: randomUUID(), title: `Write one rough bullet: ${step.title.replace(/^Write one rough bullet: /, '').slice(0, 145)}`, completion: 'One imperfect bullet is saved in your notes. That is enough for this step.', minutes: 2, status: 'todo' as const };
    steps.splice(steps.indexOf(step), 0, tiny); project.activeStepId = tiny.id;
  }
  const next = command.type === 'step.smaller' ? steps.find(s => s.id === project.activeStepId) : steps.find(s => s.status === 'todo');
  const changed = project.activeStepId !== (next?.id ?? null);
  project.activeStepId = next?.id ?? null;
  if (changed || (command.type === 'step.edit' && step.id === project.activeStepId)) project.nextAction = next?.title ?? 'All steps are complete. Take a moment to review your work.';
  if (command.type === 'step.smaller') project.nextAction = next!.title;
  saveCheckpoint(state, 'step.changed');
}
