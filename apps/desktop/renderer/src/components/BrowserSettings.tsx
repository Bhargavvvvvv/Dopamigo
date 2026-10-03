import { useEffect, useState } from 'react';
import type { BrowserStatus, Preferences } from '../../../../../packages/contracts';
export function useBrowser() {
  const [status, setStatus] = useState<BrowserStatus>();
  useEffect(() => { void window.dopamigo.browserStatus().then(setStatus); return window.dopamigo.onBrowser(setStatus); }, []);
  return status;
}
export function BrowserBadge() { const b = useBrowser(); return <span className="pill" title={b?.error ?? undefined}>{b?.enabled ? (b.connected ? b.detour ? 'Browser detour detected' : 'Browser monitoring on' : 'Monitoring enabled · Chrome offline') : 'Browser monitoring off'}</span>; }
export function BrowserSettings({ preferences: p, update }: { preferences: Preferences; update: (patch: Partial<Preferences>) => Promise<boolean> }) {
  const status = useBrowser(); const [pairing, setPairing] = useState<{ token: string; port: number }>(); const [error, setError] = useState(''); const [domains, setDomains] = useState(p.domains.join(', '));
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(timeout);
  }, [copied]);
  async function getPairing(reset = false) {
    setError(''); setCopied(false); setPairingBusy(true);
    try {
      const result = await window.dopamigo.pairing(reset);
      if (result.ok) { setPairing(result.value); setTokenVisible(false); }
      else setError(result.error);
    } catch { setError('Could not load pairing details. Please try again.'); }
    finally { setPairingBusy(false); }
  }
  async function copyToken() {
    setError(''); setCopied(false); setPairingBusy(true);
    try {
      const result = await window.dopamigo.copyPairingToken();
      if (result.ok) setCopied(true);
      else setError(result.error);
    } catch { setError('Could not copy the pairing token. Choose Show token and copy it manually.'); }
    finally { setPairingBusy(false); }
  }
  return <div className="card settings-card">
    <h3>Chrome companion</h3>
    <p>{status?.connected ? 'Connected to Chrome' : 'Chrome is disconnected'} · {status?.enabled ? 'monitoring enabled for this session' : 'monitoring off'}</p>
    {status?.error && <p role="alert">{status.error}</p>}
    <label className="toggle-row"><span><strong>Enable browser monitoring</strong><small>Only during active focus sessions. Domain signals stay on this Mac.</small></span><input type="checkbox" checked={p.monitoring} onChange={e => void update({ monitoring: e.target.checked })}/></label>
    <form onSubmit={async e => { e.preventDefault(); await update({ domains: domains.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }); }}>
      <label>Detour domains (comma separated)<input value={domains} onChange={e => setDomains(e.target.value)} placeholder="youtube.com, reddit.com"/></label>
      <button className="secondary" style={{ marginTop: 12 }}>Save domains</button>
    </form>
    <p className="footnote">A configured site can also be research. Dopamigo only reports the browser detour.</p>
    <button className="secondary" disabled={pairingBusy} onClick={() => void getPairing()}>Show pairing details</button>
    {pairing && <div className="pairing-details">
      <label>Local pairing token<input id="pairing-token" readOnly type={tokenVisible ? 'text' : 'password'} value={pairing.token} autoComplete="off" spellCheck={false} onFocus={e => e.target.select()} aria-describedby="pairing-help"/></label>
      <div className="pairing-actions">
        <button type="button" className="secondary" disabled={pairingBusy} aria-controls="pairing-token" onClick={() => setTokenVisible(visible => !visible)}>{tokenVisible ? 'Hide token' : 'Show token'}</button>
        <button type="button" className="primary" disabled={pairingBusy} onClick={() => void copyToken()}>Copy token</button>
        <span className="pairing-copy-status" role="status">{copied ? 'Token copied' : ''}</span>
      </div>
      <small id="pairing-help">Port {pairing.port}. Paste the token into the extension popup.</small>
      <button className="quiet" disabled={pairingBusy} onClick={() => void getPairing(true)}>Reset pairing</button>
    </div>}
    <p className="footnote">Load <code>apps/browser-extension</code> from Chrome’s Extensions page with Developer mode enabled. See docs/EXTENSION.md.</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
