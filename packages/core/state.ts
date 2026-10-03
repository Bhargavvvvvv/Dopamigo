import type { AppState } from '../contracts';
export function initialState(): AppState {
  return { version: 1, google: { enabled: false, candidates: [], ignored: [], classifications: {} }, revision: 0, projects: [], selectedProjectId: null, session: null, checkpoints: [], preferences: { monitoring: false, domains: ['youtube.com', 'reddit.com', 'instagram.com'], dwellSeconds: 30, cooldownSeconds: 180, style: 'gentle', muted: false, volume: 0.65, reduceMotion: false, floatingLauncher: false, useMock: true, demoMode: false } };
}
export const currentProject = (state: AppState) => state.projects.find(p => p.id === state.selectedProjectId);
export const currentStep = (state: AppState) => { const p = currentProject(state); return p?.plan?.steps.find(s => s.id === p.activeStepId); };
