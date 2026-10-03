import type { Command, Preferences, RuntimeInfo } from '../../../../../packages/contracts';
import { GoogleSettings } from '../components/GoogleSettings';
import { BrowserSettings } from '../components/BrowserSettings';
import { VoiceSettings } from '../components/VoiceSettings';
export function Settings({ preferences: p, runtime, command }: { preferences: Preferences; runtime: RuntimeInfo; command: (value: Command) => Promise<boolean> }) {
  const update = (patch: Partial<Preferences>) => command({ type: 'preferences.update', patch });
  return <section className="page settings-page"><h2>Settings</h2><p className="lede">Set things up the way you like.</p>
    <div className="card settings-card"><h3>Workspace</h3><label className="toggle-row"><span><strong>Reduce motion</strong><small>Turn off interface animations.</small></span><input type="checkbox" checked={p.reduceMotion} onChange={e => void update({ reduceMotion: e.target.checked })}/></label><label className="toggle-row"><span><strong>Use sample plans</strong><small>Try example steps without sending your task to an AI service.</small></span><input type="checkbox" checked={p.useMock} onChange={e => void update({ useMock: e.target.checked })}/></label></div>
    <div className="card settings-card"><h3>Connection & privacy</h3><p>Gemini planning: <strong>{runtime.planningReady ? 'Key configured' : 'No key configured'}</strong></p><p>Google voice: <strong>{runtime.ttsReady ? 'Key configured' : 'No key configured'}</strong></p><p className="muted">Notes and checkpoints stay on this Mac. Browser monitoring is off by default.</p><small className="storage-path">Local data: {runtime.dataPath}</small></div>
    <GoogleSettings/>
    <BrowserSettings preferences={p} update={update}/>
    <VoiceSettings preferences={p} update={update}/>
    <div className="card settings-card"><h3>Saved-work demo</h3><p className="muted">A sample literature review with a completed step, saved notes, and an exact next action. Your other tasks are preserved.</p><button className="secondary" onClick={() => void command({ type: 'demo.load' })}>Load sample assignment</button><p className="footnote">Then open Return. End an existing session before loading the demo.</p></div>
    <div className="card settings-card"><h3>Desktop</h3><label className="toggle-row"><span><strong>Floating launcher</strong><small>A small shortcut to your workspace. Opens only when you click it.</small></span><input type="checkbox" checked={p.floatingLauncher} onChange={e => void update({ floatingLauncher: e.target.checked })}/></label></div>
  </section>;
}
