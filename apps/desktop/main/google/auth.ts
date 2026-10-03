import { createServer, type Server } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'];
const clientSchema = z.object({ client_id: z.string().regex(/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/), client_secret: z.string().max(500).optional() });
export type OAuthClient = z.infer<typeof clientSchema>;
const credentialsSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1), expiresAt: z.number(), scope: z.string(), accountId: z.string().min(1), email: z.string().email() });
const vaultSchema = z.object({ version: z.literal(1), client: clientSchema.optional(), credentials: credentialsSchema.optional() });
type VaultData = z.infer<typeof vaultSchema>;
export interface SecretStorage { read(): Promise<VaultData>; write(data: VaultData): Promise<void>; }
export class EncryptedGoogleStorage implements SecretStorage {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string, private cipher: { encrypt(text: string): Promise<Buffer>; decrypt(bytes: Buffer): Promise<string> }) {}
  async read(): Promise<VaultData> {
    try { const bytes = await fs.readFile(path.join(this.directory, 'google-connection.enc')); if (bytes.length > 100000) throw new Error(); return vaultSchema.parse(JSON.parse(await this.cipher.decrypt(bytes))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 }; throw new Error('Google sign-in could not be unlocked. Your saved work is safe. Check macOS Keychain access.'); }
  }
  write(data: VaultData): Promise<void> {
    const operation = this.queue.then(() => this.save(data)); this.queue = operation.catch(() => {}); return operation;
  }
  private async save(data: VaultData) {
    const bytes = await this.cipher.encrypt(JSON.stringify(vaultSchema.parse(data)));
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, 'google-connection.enc'); const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`;
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, file);
  }
}
export class GoogleAuthError extends Error { constructor(message: string, readonly reconnect = false) { super(message); } }
export class GoogleAuth {
  private data: VaultData = { version: 1 }; private refreshing?: Promise<string>; private connection?: AbortController; private epoch = 0;
  constructor(private storage: SecretStorage, private openBrowser: (url: string) => Promise<unknown>, private client?: OAuthClient, private request: typeof fetch = fetch) {}
  get configured() { return Boolean(this.data.client ?? this.client); }
  get connected() { return Boolean(this.data.credentials); }
  get account() { const c = this.data.credentials; return c ? { id: c.accountId, email: c.email } : null; }
  async load() { this.data = await this.storage.read(); }
  async importClient(raw: unknown) {
    if (this.connected || this.connection) throw new GoogleAuthError('Disconnect Google before changing its app setup.');
    const parsed = z.object({ installed: clientSchema }).safeParse(raw);
    if (!parsed.success) throw new GoogleAuthError('Choose the Google OAuth JSON for a Desktop app, not an API key or Web client.');
    const next = { ...this.data, client: parsed.data.installed }; await this.storage.write(next); this.data = next;
  }
  private async token(body: URLSearchParams, signal: AbortSignal) {
    const response = await this.request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), redirect: 'error' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new GoogleAuthError(error.error === 'invalid_grant' ? 'Google authorization expired or was revoked. Reconnect your account.' : 'Google sign-in failed. Check the Desktop OAuth setup and try again.', error.error === 'invalid_grant');
    }
    return z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().positive(), scope: z.string().optional() }).parse(await response.json());
  }
  async connect() {
    const client = this.data.client ?? this.client; if (!client) throw new GoogleAuthError('Import the Desktop OAuth setup JSON first.');
    if (this.connection) throw new GoogleAuthError('Google sign-in is already open.');
    const connection = new AbortController(); this.connection = connection; const epoch = ++this.epoch;
    const verifier = randomBytes(48).toString('base64url'); const state = randomBytes(32).toString('base64url');
    let server: Server | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const codePromise = new Promise<string>((resolve, reject) => {
        connection.signal.addEventListener('abort', () => reject(new GoogleAuthError('Google sign-in was cancelled.')), { once: true });
        server = createServer((request, response) => {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Security-Policy', "default-src 'none'"); response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          if (request.method !== 'GET' || url.pathname !== '/oauth2callback') { response.writeHead(404).end(); return; }
          const received = url.searchParams.get('state') ?? '';
          if (Buffer.byteLength(received) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(received), Buffer.from(state))) { response.writeHead(400).end('Invalid sign-in response. Return to Dopamigo.'); return; }
          if (url.searchParams.has('error')) { response.end('Google connection was not approved. You can return to Dopamigo.'); reject(new GoogleAuthError('Google access was not approved.')); return; }
          const code = url.searchParams.get('code'); if (!code || code.length > 4096) { response.writeHead(400).end('Missing sign-in code.'); return; }
          response.end('Google sign-in received. Return to Dopamigo to see the connection status.'); resolve(code);
        });
        server.on('error', () => reject(new GoogleAuthError('Could not open the local Google sign-in callback.')));
        timer = setTimeout(() => reject(new GoogleAuthError('Google sign-in timed out. Try connecting again.')), 180000);
      });
      // Attach a handler before browser launch so cancellation cannot become an unhandled rejection.
      void codePromise.catch(() => {});
      await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve); });
      const address = server!.address(); if (!address || typeof address === 'string') throw new Error();
      const redirect = `http://127.0.0.1:${address.port}/oauth2callback`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: GOOGLE_SCOPES.join(' '), state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' }).toString();
      await this.openBrowser(url.toString());
      const code = await codePromise;
      server!.close();
      const body = new URLSearchParams({ client_id: client.client_id, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect }); if (client.client_secret) body.set('client_secret', client.client_secret);
      const tokens = await this.token(body, connection.signal);
      const granted = new Set((tokens.scope ?? '').split(' '));
      if (GOOGLE_SCOPES.slice(2).some(scope => !granted.has(scope))) throw new GoogleAuthError('Calendar and Drive metadata access are both needed for automatic discovery. Reconnect and grant those permissions.');
      if (!tokens.refresh_token) throw new GoogleAuthError('Google did not grant persistent access. Reconnect and approve offline access.');
      const userResponse = await this.request('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.any([connection.signal, AbortSignal.timeout(15000)]), redirect: 'error' });
      if (!userResponse.ok) throw new GoogleAuthError('Could not verify the connected Google account.');
      const user = z.object({ sub: z.string().min(1), email: z.string().email(), email_verified: z.literal(true) }).parse(await userResponse.json());
      connection.signal.throwIfAborted(); if (epoch !== this.epoch) return;
      const next = { ...this.data, client, credentials: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, scope: tokens.scope!, expiresAt: Date.now() + tokens.expires_in * 1000, accountId: user.sub, email: user.email } };
      await this.storage.write(next); if (epoch === this.epoch) this.data = next;
    } finally { clearTimeout(timer); server?.close(); if (this.connection === connection) this.connection = undefined; }
  }
  async accessToken(force = false): Promise<string> {
    if (this.refreshing) return this.refreshing;
    const saved = this.data.credentials; const client = this.data.client ?? this.client;
    if (!saved || !client) throw new GoogleAuthError('Connect Google to sync assignments.', true);
    if (!force && saved.expiresAt > Date.now() + 60000) return saved.accessToken;
    const epoch = this.epoch;
    this.refreshing = (async () => {
      const body = new URLSearchParams({ client_id: client.client_id, refresh_token: saved.refreshToken, grant_type: 'refresh_token' }); if (client.client_secret) body.set('client_secret', client.client_secret);
      const tokens = await this.token(body, new AbortController().signal);
      if (epoch !== this.epoch) throw new GoogleAuthError('Google connection changed.');
      const next = { ...this.data, credentials: { ...saved, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? saved.refreshToken, expiresAt: Date.now() + tokens.expires_in * 1000 } };
      await this.storage.write(next); this.data = next; return tokens.access_token;
    })();
    try { return await this.refreshing; } finally { this.refreshing = undefined; }
  }
  cancelConnect() { ++this.epoch; this.connection?.abort(); }
  async disconnect() {
    this.cancelConnect(); await this.refreshing?.catch(() => {});
    const token = this.data.credentials?.refreshToken;
    const next = { ...this.data, credentials: undefined }; await this.storage.write(next); this.data = next;
    if (token) { try { await this.request('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(5000), redirect: 'error' }); } catch { /* Local credentials are already removed. */ } }
  }
}
