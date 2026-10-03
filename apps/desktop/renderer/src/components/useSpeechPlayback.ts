import { useEffect, useRef, useState, type RefObject } from 'react';

type Playback = { id: string | null; phase: 'idle' | 'preparing' | 'speaking' | 'ended' | 'failed'; error?: string };

/** Animate only while the media element is actually playing, not while TTS is loading. */
export function useSpeechPlayback(avatar?: RefObject<HTMLDivElement | null>) {
  const [playback, setPlayback] = useState<Playback>({ id: null, phase: 'idle' });
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    const release = () => {
      const previous = audio; audio = null;
      previous?.pause(); if (previous) previous.removeAttribute('src');
      cancelAnimationFrame(frame);
      if (context) void context.close().catch(() => {}); context = null;
      avatar?.current?.style.setProperty('--speech-level', '0');
    };
    stopRef.current = () => { release(); setPlayback(previous => ({ id: previous.id, phase: 'ended' })); };
    const unsubscribe = window.dopamigo.onSpeech(event => {
      release();
      if (event.type === 'stop') { setPlayback({ id: null, phase: 'idle' }); return; }
      const clip = new Audio(`data:audio/wav;base64,${event.base64}`);
      audio = clip; clip.volume = event.volume;
      setPlayback({ id: event.id, phase: 'preparing' });
      const fail = () => {
        if (audio !== clip) return;
        release(); setPlayback({ id: event.id, phase: 'failed', error: 'Voice could not play. You can still use the buttons below.' });
      };
      clip.addEventListener('playing', () => { if (audio === clip) setPlayback({ id: event.id, phase: 'speaking' }); });
      clip.addEventListener('waiting', () => { if (audio === clip) setPlayback({ id: event.id, phase: 'preparing' }); });
      clip.addEventListener('ended', () => { if (audio === clip) { release(); setPlayback({ id: event.id, phase: 'ended' }); } });
      clip.addEventListener('error', fail);
      if (avatar) {
        try {
          context = new AudioContext();
          const source = context.createMediaElementSource(clip); const analyser = context.createAnalyser();
          analyser.fftSize = 256; source.connect(analyser); analyser.connect(context.destination);
          const samples = new Uint8Array(analyser.fftSize);
          let level = 0;
          const animate = () => {
            if (audio !== clip) return;
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
            level = level * 0.55 + Math.min(1, rms * 6) * 0.45;
            avatar.current?.style.setProperty('--speech-level', level.toFixed(3));
            frame = requestAnimationFrame(animate);
          };
          animate(); void context.resume().catch(() => {});
        } catch { /* Audio and the speaking indicator still work without an analyser. */ }
      }
      void clip.play().catch(fail);
    });
    // Main process buffers speech until this subscription is attached.
    // A running development window may hot-reload before its preload is restarted.
    void window.dopamigo.speechReady?.();
    return () => { unsubscribe(); release(); stopRef.current = () => {}; };
  }, [avatar]);
  return { ...playback, stop: () => stopRef.current() };
}
