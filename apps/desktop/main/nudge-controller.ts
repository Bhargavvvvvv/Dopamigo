import { randomUUID } from 'node:crypto';
import type { AppState, BrowserStatus, Nudge, NudgeAction, SpeechEvent } from '../../../packages/contracts';
import { NudgeRules } from '../../../packages/core/nudges';
import { nudgeTextSchema, type NudgeInput, type NudgeWriter } from '../../../packages/core/nudge-writer';
import { currentProject, currentStep } from '../../../packages/core/state';
import type { SpeechProvider } from '../../../packages/core/speech';
import { ProviderError } from './adapters/gemini';

export class NudgeController {
  private rules = new NudgeRules(); private timer: ReturnType<typeof setInterval>; private abort?: AbortController;
  private demoDomain: string | null = null; private contextKey = ''; current: Nudge | null = null;
  private recentNudges: string[] = []; private copySessionId: string | undefined;
  private muted: boolean | undefined;
  constructor(private getState: () => AppState, private getBrowser: () => BrowserStatus, private writer: NudgeWriter, private provider: SpeechProvider, private emit: (nudge: Nudge | null) => void, private speech: (event: SpeechEvent) => void) {
    this.timer = setInterval(() => this.tick(), 500); this.timer.unref();
  }
  tick() {
    const state = this.getState(); const p = currentProject(state); const step = currentStep(state); const prefs = state.preferences; const browser = this.getBrowser();
    if (this.copySessionId !== state.session?.id) { this.copySessionId = state.session?.id; this.recentNudges = []; }
    const enabled = prefs.monitoring && state.session?.status === 'active' && Boolean(p?.activeStepId);
    const domain = (prefs.demoMode ? this.demoDomain : null) ?? (browser.connected && browser.detour ? browser.domain : null);
    const contextKey = JSON.stringify([state.session?.id, state.selectedProjectId, enabled, domain, p?.title, p?.activeStepId, step?.title, p?.nextAction, prefs.style]);
    if (contextKey !== this.contextKey) { this.cancel(); this.contextKey = contextKey; }
    if (prefs.muted !== this.muted) {
      this.muted = prefs.muted;
      if (prefs.muted) {
        this.speech({ type: 'stop' });
        if (this.current) { this.current.audio = 'muted'; this.emit(this.current); }
      }
    }
    if (!enabled || !prefs.demoMode) this.demoDomain = null;
    const fire = this.rules.update({ sessionId: state.session?.id ?? null, enabled, domain, dwellMs: prefs.demoMode ? 3000 : prefs.dwellSeconds * 1000, cooldownMs: prefs.demoMode ? 10000 : prefs.cooldownSeconds * 1000 }, Date.now());
    if (fire && p && domain) {
      this.current = { id: randomUUID(), text: '', nextAction: p.nextAction, domain, demo: Boolean(this.demoDomain), accelerated: prefs.demoMode, generation: 'loading', audio: prefs.muted ? 'muted' : 'loading' };
      this.emit(this.current);
      void this.compose(this.current.id, this.input(state, domain), prefs.muted).catch(() => { /* compose reports errors on the card. */ });
    }
  }
  private input(state: AppState, domain: string): NudgeInput {
    const p = currentProject(state);
    return { domain, task: p?.title ?? '', step: currentStep(state)?.title ?? '', nextAction: p?.nextAction ?? '', style: state.preferences.style, recentNudges: [...this.recentNudges] };
  }
  private async compose(id: string | null, input: NudgeInput, muted: boolean) {
    this.abort?.abort(); this.speech({ type: 'stop' });
    const controller = new AbortController(); this.abort = controller;
    const active = () => !controller.signal.aborted && this.abort === controller && (id === null || this.current?.id === id);
    const silent = () => muted || this.getState().preferences.muted || (id !== null && this.current?.audio === 'muted');
    let generated = false;
    try {
      const text = nudgeTextSchema.parse(await this.writer.generate(input, controller.signal));
      if (!active()) return;
      generated = true;
      this.recentNudges = [...this.recentNudges, text].slice(-3);
      if (id && this.current?.id === id) { this.current.text = text; this.current.generation = 'ready'; this.emit(this.current); }
      if (silent()) return;
      const audio = await this.provider.synthesize(text, input.style, controller.signal);
      if (!active() || silent()) return;
      if (id && this.current?.id === id) { this.current.audio = 'ready'; this.emit(this.current); }
      this.speech({ type: 'play', id: id ?? randomUUID(), base64: audio.toString('base64'), volume: this.getState().preferences.volume });
    } catch (error) {
      if (!active()) return;
      if (generated && silent()) return;
      const message = error instanceof ProviderError ? error.message : generated ? 'Voice unavailable. Use the return controls below.' : 'Could not write a nudge. Your saved next action is still available.';
      if (id && this.current?.id === id) {
        if (!generated) { this.current.generation = 'failed'; this.current.generationError = message; }
        this.current.audio = 'failed'; this.current.audioError = message; this.emit(this.current);
      } else throw new Error(message);
    } finally { if (id === null && !active()) throw new Error('Preview cancelled because your work or browser context changed.'); }
  }
  cancel() { this.abort?.abort(); this.abort = undefined; this.speech({ type: 'stop' }); if (this.current) { this.current = null; this.emit(null); } }
  respond(input: NudgeAction) { if (this.current?.id !== input.id) throw new Error('This nudge has already ended.'); this.rules.dismiss(input.action === 'research'); this.cancel(); this.demoDomain = null; }
  demo() { const state = this.getState(); if (!state.preferences.demoMode || !state.preferences.monitoring || state.session?.status !== 'active') throw new Error('Enable demo timing and monitoring, then start a focus session.'); this.demoDomain = state.preferences.domains[0] ?? 'youtube.com'; this.tick(); }
  async preview() {
    this.tick();
    const state = this.getState(); const prefs = state.preferences; const browser = this.getBrowser();
    if (prefs.muted) throw new Error('Unmute voice to hear a preview.');
    const domain = browser.connected && browser.detour && browser.domain ? browser.domain : prefs.domains[0] ?? 'youtube.com';
    this.cancel();
    await this.compose(null, this.input(state, domain), false);
  }
  stop() { clearInterval(this.timer); this.cancel(); }
}
