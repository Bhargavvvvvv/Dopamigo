import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { browserMessageSchema, type BrowserConfig, type BrowserStatus } from '../../../../packages/contracts';
import { matchesDomain } from '../../../../packages/core/browser';
export class BrowserServer {
  status: BrowserStatus = { connected: false, listening: false, enabled: false, domain: null, detour: false, canRestore: false, error: null, port: 47321 };
  private token = ''; private http?: Server; private wss?: WebSocketServer; private socket?: WebSocket;
  private config: BrowserConfig = { enabled: false, sessionId: null, domains: [], resources: [] };
  private workTab?: { tabId: number; windowId: number }; private lastSeen = 0; private timer?: ReturnType<typeof setInterval>;
  private pendingRestore?: { id: string; finish: (ok: boolean) => void };
  constructor(private directory: string, private onChange: (status: BrowserStatus) => void) {}
  private emit() { this.onChange({ ...this.status }); }
  async start(port = 47321) {
    const file = path.join(this.directory, 'browser-token');
    try { this.token = (await fs.readFile(file, 'utf8')).trim(); } catch { /* First pairing. */ }
    if (!/^[A-Za-z0-9_-]{43}$/.test(this.token)) await this.rotate();
    this.http = createServer((_req, res) => { res.writeHead(404); res.end(); });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
    this.http.on('upgrade', (request, socket, head) => {
      if (!/^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin ?? '') || request.url !== '/companion' || (this.wss?.clients.size ?? 0) >= 4) { socket.destroy(); return; }
      this.wss!.handleUpgrade(request, socket, head, client => this.accept(client));
    });
    try {
      await new Promise<void>((resolve, reject) => { this.http!.once('error', reject); this.http!.listen(port, '127.0.0.1', () => resolve()); });
      const address = this.http.address(); this.status.port = typeof address === 'object' && address ? address.port : port;
      this.status.listening = true;
      this.http.on('error', () => { this.status.error = 'The local browser connection stopped.'; this.emit(); });
    } catch { this.status.error = 'Chrome connection unavailable. Another app may be using port 47321. Your workspace still works.'; }
    this.timer = setInterval(() => { if (this.socket && Date.now() - this.lastSeen > 26000) this.socket.close(); }, 3000); this.timer.unref(); this.emit();
  }
  private accept(client: WebSocket) {
    let authenticated = false; let count = 0; let second = Date.now();
    const timeout = setTimeout(() => client.close(1008), 5000);
    client.on('error', () => client.close());
    client.on('message', raw => {
      if (Date.now() - second > 1000) { second = Date.now(); count = 0; } if (++count > 30) { client.close(1008); return; }
      try {
        const message = browserMessageSchema.parse(JSON.parse(raw.toString()));
        if (!authenticated) {
          if (message.type !== 'auth' || !timingSafeEqual(Buffer.from(message.token), Buffer.from(this.token))) { client.close(1008); return; }
          authenticated = true; clearTimeout(timeout); this.socket?.close(); this.socket = client; this.lastSeen = Date.now(); this.status.connected = true; this.status.error = null; this.sendConfig(); this.emit(); return;
        }
        if (this.socket !== client) return;
        this.lastSeen = Date.now();
        if (message.type === 'restored') { if (message.requestId === this.pendingRestore?.id) this.pendingRestore.finish(message.ok); return; }
        if (!this.config.enabled) return;
        if (message.type === 'idle') { this.status.domain = null; this.status.detour = false; this.emit(); }
        if (message.type === 'tab') {
          this.status.domain = message.domain; this.status.detour = matchesDomain(message.domain, this.config.domains);
          if (message.relevant) this.workTab = { tabId: message.tabId, windowId: message.windowId };
          else if (this.workTab?.tabId === message.tabId) this.workTab = undefined;
          this.status.canRestore = Boolean(this.workTab); this.emit();
        }
      } catch { client.close(1008); }
    });
    client.on('close', () => { clearTimeout(timeout); if (this.socket === client) { this.socket = undefined; this.workTab = undefined; this.status.connected = false; this.status.domain = null; this.status.detour = false; this.status.canRestore = false; this.pendingRestore?.finish(false); this.emit(); } });
  }
  configure(config: BrowserConfig) {
    if (JSON.stringify(config) === JSON.stringify(this.config)) return;
    if (!config.enabled || config.sessionId !== this.config.sessionId) { this.workTab = undefined; this.status.domain = null; this.status.detour = false; this.status.canRestore = false; }
    this.config = config; this.status.enabled = config.enabled; this.sendConfig(); this.emit();
  }
  private sendConfig() { this.socket?.send(JSON.stringify({ type: 'config', ...this.config })); }
  async pairing(reset = false) { if (reset) await this.rotate(); return { token: this.token, port: this.status.port }; }
  private async rotate() { this.token = randomBytes(32).toString('base64url'); await fs.writeFile(path.join(this.directory, 'browser-token'), this.token, { mode: 0o600 }); this.socket?.close(); }
  async restore() {
    if (!this.socket || !this.workTab || !this.config.enabled) return false;
    this.pendingRestore?.finish(false);
    return await new Promise<boolean>(resolve => { const id = randomUUID(); const timer = setTimeout(() => finish(false), 3000); const finish = (ok: boolean) => { clearTimeout(timer); this.pendingRestore = undefined; resolve(ok); }; this.pendingRestore = { id, finish }; this.socket!.send(JSON.stringify({ type: 'restore', requestId: id, ...this.workTab })); });
  }
  async stop() { clearInterval(this.timer); this.pendingRestore?.finish(false); for (const client of this.wss?.clients ?? []) client.terminate(); this.wss?.close(); await new Promise<void>(resolve => { if (!this.http?.listening) resolve(); else this.http.close(() => resolve()); }); }
}
