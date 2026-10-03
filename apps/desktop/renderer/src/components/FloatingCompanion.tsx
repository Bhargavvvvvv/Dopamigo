import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import mascot from '../assets/mascot/friendly-transparent.png';
import { useNudge } from './Nudge';
import { useSpeechPlayback } from './useSpeechPlayback';

export function FloatingCompanion() {
  const { nudge, error, respond } = useNudge();
  const stage = useRef<HTMLDivElement>(null);
  const avatar = useRef<HTMLDivElement>(null);
  const voice = useSpeechPlayback(avatar);
  const [reduceMotion, setReduceMotion] = useState(true);
  const speaking = voice.id === nudge?.id && voice.phase === 'speaking';
  const canStopVoice = voice.id === nudge?.id && ['speaking', 'preparing'].includes(voice.phase);

  useEffect(() => {
    let changed = false; let disposed = false;
    const unsubscribe = window.dopamigo.onState(state => { changed = true; setReduceMotion(state.preferences.reduceMotion); });
    void window.dopamigo.load().then(result => { if (!disposed && !changed && result.ok) setReduceMotion(result.value.state.preferences.reduceMotion); });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  useLayoutEffect(() => {
    const root = stage.current;
    if (!root || !nudge) { window.dopamigo.setNudgeRegions?.([]); return; }
    const measure = () => window.dopamigo.setNudgeRegions?.(Array.from(root.querySelectorAll('[data-interactive]'), element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll('[data-interactive]').forEach(element => observer.observe(element));
    measure();
    return () => { observer.disconnect(); window.dopamigo.setNudgeRegions?.([]); };
  }, [nudge?.id]);

  if (!nudge) return null;
  const status = voice.id === nudge.id && voice.error ? voice.error
    : nudge.generation === 'failed' ? nudge.generationError
    : nudge.generation === 'loading' ? 'A little help getting back…'
    : nudge.audio === 'failed' ? nudge.audioError
    : nudge.audio === 'muted' ? 'Voice is muted'
    : speaking ? 'Speaking…'
    : nudge.audio === 'loading' || voice.phase === 'preparing' ? 'Preparing voice…'
    : 'Whenever you’re ready.';

  return <div ref={stage} className={`mascot-stage ${reduceMotion ? 'reduce-motion' : ''}`} data-speaking={speaking}>
    <aside className="mascot-bubble" data-interactive role="region" aria-label="Dopamigo nudge">
      <header className="mascot-heading">
        <div className="mascot-drag-heading" title="Drag to move"><strong>Dopamigo</strong><span className="mascot-context" title={nudge.domain}>{nudge.demo ? 'Demo · simulated detour' : `${nudge.domain}${nudge.accelerated ? ' · demo timing' : ''}`}</span></div>
        <button className="mascot-icon-button" aria-label="Dismiss nudge" onClick={() => void respond('dismiss')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>
      </header>
      <div className="mascot-copy"><p className="nudge-text" aria-live="polite">{nudge.generation === 'ready' ? nudge.text : nudge.nextAction || 'Your saved work is ready when you are.'}</p></div>
      <div className="mascot-voice" role="status">
        {speaking && <span className="mascot-wave" aria-hidden="true"><i/><i/><i/><i/></span>}
        <span>{status}</span>
        {canStopVoice && <button className="mascot-stop" onClick={voice.stop}>Stop voice</button>}
      </div>
      <button className="primary mascot-return" onClick={() => void respond('return')}>Bring me back<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4"/></svg></button>
      <div className="mascot-options"><button onClick={() => void respond('research')}>This is research</button><span aria-hidden="true">·</span><button onClick={() => void respond('break')}>Taking a break</button></div>
      {error && <p className="mascot-error" role="alert">{error}</p>}
    </aside>
    <div className="mascot-drag-area" data-interactive title="Drag your companion to move it">
      <div className="mascot-float"><div ref={avatar} className="mascot-avatar"><img src={mascot} alt="Dopamigo, your waving cat companion" draggable={false}/></div></div>
      <div className="mascot-shadow" aria-hidden="true"/>
    </div>
  </div>;
}
