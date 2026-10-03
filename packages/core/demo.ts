import type { AppState } from '../contracts';
import { saveCheckpoint } from './sessions';
export function loadDemo(state: AppState) {
  if (state.session && state.session.status !== 'ended') throw new Error('End the current session before loading the demo.');
  const id = 'dopamigo-demo';
  if (!state.projects.some(p => p.id === id)) state.projects.push({
    id, title: 'Demo · Urban green spaces literature review', brief: 'Sample assignment: compare three studies of urban green spaces and student wellbeing. Draft a 1500-word literature review covering methods, findings, and one research gap.', createdAt: new Date().toISOString(),
    plan: { id: 'demo-plan', source: 'mock', createdAt: new Date().toISOString(), steps: [
      { id: 'demo-1', title: 'Write the review question', completion: 'One question defines the scope of the review.', minutes: 3, status: 'done' },
      { id: 'demo-2', title: 'Compare how two studies measure green-space access', completion: 'One bullet for each study explains its measurement method.', minutes: 5, status: 'todo' },
      { id: 'demo-3', title: 'Draft a short methods comparison', completion: 'One rough paragraph compares the measurement choices.', minutes: 10, status: 'todo' },
      { id: 'demo-4', title: 'Note one gap for the discussion', completion: 'A sentence states a limitation worth discussing.', minutes: 5, status: 'todo' },
    ] }, activeStepId: 'demo-2', notes: 'Demo notes — saved sample work\n\nReview question: How do urban green spaces relate to student wellbeing?\n\nNext reading pass: compare how the selected studies define access to green space. Look in their methods sections. No findings have been recorded yet.',
    nextAction: 'Open the methods section and write one bullet about how access to green space is measured.',
    resources: [{ id: 'demo-source', label: 'Background overview · urban green space', url: 'https://en.wikipedia.org/wiki/Urban_green_space' }],
  });
  state.selectedProjectId = id;
  state.session = { id: `demo-session-${Date.now()}`, projectId: id, status: 'paused', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveCheckpoint(state, 'demo.loaded');
}
