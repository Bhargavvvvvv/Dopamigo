import type { GoogleStatus, AssignmentClassification, GoogleAction } from '../../../../packages/contracts';
import { Store } from '../../../../packages/core/store';
import { createAssignment, eventFingerprint, reconcileAssignments, type AssignmentDetector, type DriveDocument } from '../../../../packages/core/assignments';
import { GoogleAuth, GoogleAuthError } from './auth';
import { GoogleAPI, type DriveFolder } from './api';
export class GoogleController {
  private timer?: ReturnType<typeof setInterval>; private operation?: Promise<void>; private abort?: AbortController;
  private connecting = false; private error: string | null = null; private reconnect = false;
  private folderNotice: string | null = null; private folders: DriveFolder[] = []; private stopped = false;
  private unsubscribe: () => void;
  constructor(private store: Store, private auth: GoogleAuth, private api: GoogleAPI, private detector: AssignmentDetector, private emit: (status: GoogleStatus) => void) { this.unsubscribe = store.subscribe(() => this.publish()); }
  get status(): GoogleStatus {
    const google = this.store.state.google;
    return { configured: this.auth.configured, connected: this.auth.connected && !this.reconnect, connecting: this.connecting, syncing: Boolean(this.operation), email: this.auth.account?.email ?? null, enabled: google.enabled, lastSyncAt: google.lastSyncAt ?? null, error: this.error, folderNotice: this.folderNotice, folders: this.folders, folderId: google.folderId ?? null, folderName: google.folderName ?? null, candidates: google.candidates,
      ignoredAssignments: google.ignored.map(key => ({ key, title: google.classifications[key]?.result.title || 'Calendar assignment' })) };
  }
  private publish() { this.emit(this.status); }
  async start() {
    try { await this.auth.load(); } catch (error) { this.error = (error as Error).message; }
    this.publish();
    this.timer = setInterval(() => { void this.sync(); }, 10 * 60 * 1000); this.timer.unref();
    void this.sync();
  }
  async setup(raw: unknown) { await this.auth.importClient(raw); this.error = null; this.publish(); }
  async action(action: Exclude<GoogleAction, { type: 'setup' }>) {
    if (action.type === 'connect') {
      if (this.connecting) throw new Error('Google sign-in is already open.');
      this.connecting = true; this.error = null; this.publish();
      try {
        await this.auth.connect(); const account = this.auth.account; if (!account) return;
        await this.store.update(state => {
          if (state.google.accountId !== account.id) state.google = { enabled: true, accountId: account.id, email: account.email, candidates: [], ignored: [], classifications: {} };
          else Object.assign(state.google, { enabled: true, email: account.email });
        });
        this.reconnect = false;
      } finally { this.connecting = false; this.publish(); }
      await this.sync(); return;
    }
    if (action.type === 'disconnect') {
      this.abort?.abort(); this.auth.cancelConnect(); await this.operation;
      await this.auth.disconnect();
      await this.store.update(state => { state.google.enabled = false; state.google.email = undefined; state.google.candidates = []; state.google.classifications = {}; });
      this.error = null; this.reconnect = false; this.folders = []; this.folderNotice = null; this.publish(); return;
    }
    if (action.type === 'enabled') {
      if (!action.enabled) { this.abort?.abort(); await this.operation; }
      await this.store.update(state => { state.google.enabled = action.enabled; }); this.publish(); if (action.enabled) await this.sync(); return;
    }
    if (action.type === 'sync') { await this.sync(); return; }
    if (action.type === 'restore') {
      if (!this.auth.connected || this.reconnect) throw new GoogleAuthError('Reconnect Google before importing this assignment again.', true);
      if (!this.store.state.google.enabled) throw new Error('Turn on automatic assignment sync before importing this assignment again.');
      await this.operation;
      await this.store.update(state => {
        if (!state.google.ignored.includes(action.key)) throw new Error('This assignment is no longer excluded from sync.');
        state.google.ignored = state.google.ignored.filter(key => key !== action.key);
      });
      this.publish(); await this.sync(); return;
    }
    if (action.type === 'folder') {
      this.abort?.abort(); await this.operation;
      const folder = await this.api.folder(action.id, new AbortController().signal);
      await this.store.update(state => { state.google.folderId = folder.id; state.google.folderName = folder.name; });
      this.publish(); await this.sync(); return;
    }
    if (action.type === 'candidate') {
      await this.store.update(state => {
        const candidate = state.google.candidates.find(c => c.key === action.key); if (!candidate) throw new Error('This possible assignment is no longer available.');
        if (action.accept) createAssignment(state, candidate, new Date().toISOString());
        else state.google.ignored = [...new Set([...state.google.ignored, action.key])].slice(-1000);
        state.google.candidates = state.google.candidates.filter(c => c.key !== action.key);
      }); this.publish();
    }
  }
  sync(): Promise<void> {
    if (this.operation) return this.operation;
    if (this.stopped || !this.auth.connected || this.reconnect || !this.store.state.google.enabled || this.connecting) return Promise.resolve();
    const controller = new AbortController(); this.abort = controller; this.error = null;
    this.operation = this.runSync(controller.signal).catch(error => {
      if (!controller.signal.aborted) { this.error = error instanceof GoogleAuthError || (error instanceof Error && !('issues' in error)) ? error.message : 'Google sync could not finish. Existing work is preserved.'; if (error instanceof GoogleAuthError && error.reconnect) this.reconnect = true; }
    }).finally(() => { this.operation = undefined; if (this.abort === controller) this.abort = undefined; this.publish(); });
    this.publish(); return this.operation;
  }
  private async runSync(signal: AbortSignal) {
    const accountId = this.auth.account!.id; const google = this.store.state.google;
    const events = await this.api.events(new Date(), signal);
    const keys = new Set(events.map(event => event.key));
    // Fetch existing imports individually too: deadlines can move outside the discovery window.
    for (const project of this.store.state.projects) if (project.assignment?.accountId === accountId && !keys.has(project.assignment.key)) events.push(await this.api.tracked(project.assignment, signal));
    const results = new Map<string, AssignmentClassification>(); const cache = { ...google.classifications };
    const pending = events.filter(event => {
      if (event.status !== 'active') return false;
      const cached = cache[event.key]; if (cached?.fingerprint === eventFingerprint(event)) { results.set(event.key, cached.result); return false; } return true;
    });
    for (let i = 0; i < pending.length; i += 20) {
      const batch = pending.slice(i, i + 20); const classified = await this.detector.classify(batch, signal);
      if (classified.length !== batch.length) throw new Error('Assignment classification was incomplete. Sync will retry later.');
      batch.forEach((event,index) => { results.set(event.key, classified[index]); cache[event.key] = { fingerprint: eventFingerprint(event), result: classified[index] }; });
    }
    let documents: DriveDocument[] | null = null; let folder: DriveFolder | undefined;
    this.folderNotice = null;
    try {
      if (google.folderId) folder = await this.api.folder(google.folderId, signal);
      else {
        const all = await this.api.folders(signal); this.folders = all;
        const automatic = all.filter(folder => /(^|\s)assignments?(\s|$)/i.test(folder.name.trim()));
        if (automatic.length === 1) folder = automatic[0];
        else this.folderNotice = automatic.length > 1 ? 'Several Assignments folders were found. Choose the one to watch once.' : 'No Assignments folder was found. Choose a folder once to enable document matching.';
      }
      if (folder) documents = await this.api.documents(folder, signal);
    } catch (error) { if (signal.aborted) throw error; this.folderNotice = error instanceof Error && !('issues' in error) ? error.message : 'Drive could not be checked. Calendar discovery can still continue.'; }
    signal.throwIfAborted(); if (this.auth.account?.id !== accountId) return;
    const at = new Date().toISOString();
    await this.store.update(state => {
      if (signal.aborted || !state.google.enabled) return;
      reconcileAssignments(state, events, results, documents, at);
      state.google.classifications = Object.fromEntries(Object.entries(cache).slice(-1000));
      state.google.lastSyncAt = at;
      if (folder) { state.google.folderId = folder.id; state.google.folderName = folder.name; }
    });
  }
  async stop() { this.stopped = true; this.unsubscribe(); clearInterval(this.timer); this.abort?.abort(); this.auth.cancelConnect(); await this.operation; }
}
