import type { AppState, DraftInput } from '../contracts';
import { saveCheckpoint } from './sessions';
import { Store } from './store';
export class Drafts {
  private pending = new Map<string, DraftInput>();
  private timer?: ReturnType<typeof setTimeout>;
  private flushing?: Promise<AppState>;
  constructor(private store: Store, private onError: () => void) {}
  stage(draft: DraftInput) {
    if (!this.store.state.projects.some(p => p.id === draft.projectId)) throw new Error('Project not found.');
    this.pending.set(draft.projectId, { ...this.pending.get(draft.projectId), ...draft });
    clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush().catch(this.onError); }, 450);
  }
  async flush(): Promise<AppState> {
    clearTimeout(this.timer);
    if (this.flushing) { await this.flushing; return this.flush(); }
    if (!this.pending.size) return this.store.whenIdle();
    const batch = new Map(this.pending); this.pending.clear();
    this.flushing = this.store.update(state => {
      for (const [id, draft] of batch) {
        const project = state.projects.find(p => p.id === id); if (!project) continue;
        if (draft.notes !== undefined) project.notes = draft.notes;
        if (draft.nextAction !== undefined) project.nextAction = draft.nextAction;
        // Snapshot each edited project without changing the selected workspace.
        const selected = state.selectedProjectId; state.selectedProjectId = id; saveCheckpoint(state, 'work.saved'); state.selectedProjectId = selected;
      }
    });
    try { return await this.flushing; }
    catch (error) { for (const [id, draft] of batch) this.pending.set(id, { ...draft, ...this.pending.get(id) }); throw error; }
    finally { this.flushing = undefined; }
  }
}
