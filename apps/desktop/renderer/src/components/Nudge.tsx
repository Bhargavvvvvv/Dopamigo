import { useEffect, useState } from 'react';
import type { Nudge as NudgeData, NudgeAction } from '../../../../../packages/contracts';
import { useSpeechPlayback } from './useSpeechPlayback';
export function useNudge() {
  const [nudge, setNudge] = useState<NudgeData | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    let changed = false; let disposed = false;
    const unsubscribe = window.dopamigo.onNudge(value => { changed = true; setNudge(value); setError(''); });
    void window.dopamigo.nudgeStatus().then(value => { if (!changed && !disposed) setNudge(value); });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  async function respond(action: NudgeAction['action']) { if (!nudge) return; const result = await window.dopamigo.respondToNudge({ id: nudge.id, action }); if (!result.ok) setError(result.error); }
  return { nudge, error, respond };
}
export function NudgeCard() {
  const { nudge, error, respond } = useNudge();
  if (!nudge) return null;
  return <aside className="nudge-card" role="region" aria-label="Dopamigo nudge"><div className="card-heading"><span className="eyebrow">{nudge.demo ? 'DEMO · SIMULATED DETOUR' : `Browser detour · ${nudge.domain}${nudge.accelerated ? " · demo timing" : ""}`}</span><button className="dismiss-nudge" aria-label="Dismiss nudge" onClick={() => void respond('dismiss')}>×</button></div><p className="nudge-text" aria-live="polite">{nudge.generation === 'ready' ? nudge.text : nudge.nextAction || 'Your saved work is ready.'}</p><div className="nudge-actions"><button className="primary" onClick={() => void respond('return')}>Bring me back</button><button className="secondary" onClick={() => void respond('research')}>This is research</button><button className="quiet" onClick={() => void respond('break')}>Taking a break</button></div><small className="nudge-audio">{nudge.generation === 'loading' ? 'Gemini is writing a nudge for this moment…' : nudge.generation === 'failed' ? nudge.generationError : nudge.audio === 'loading' ? 'Preparing Google voice…' : nudge.audio === 'failed' ? nudge.audioError : nudge.audio === 'muted' ? 'Voice muted' : 'Your floating companion has the voice reminder.'}</small>{error && <p role="alert">{error}</p>}</aside>;
}
export function AudioPlayer() {
  const { error } = useSpeechPlayback();
  return error ? <p className="notice" role="status">{error}</p> : null;
}
