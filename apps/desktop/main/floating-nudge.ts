import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { Nudge, SpeechEvent } from '../../../packages/contracts';

type Region = { x: number; y: number; width: number; height: number };

/** The companion owns nudge audio; voice previews stay in the workspace. */
export class FloatingNudge {
  window: BrowserWindow | null = null;
  private loading?: Promise<void>;
  private currentId: string | null = null;
  private ready = false;
  private pendingSpeech: Extract<SpeechEvent, { type: 'play' }> | null = null;
  private regions: Region[] = [];
  private hitTest?: ReturnType<typeof setInterval>;
  private ignoringMouse = true;

  constructor(private devUrl?: string) {}

  async update(nudge: Nudge | null) {
    const appearing = !this.currentId;
    this.currentId = nudge?.id ?? null;
    if (!nudge) {
      this.stopSpeech();
      this.window?.hide();
      clearInterval(this.hitTest); this.hitTest = undefined;
      return;
    }
    if (!this.window) this.loading = this.createWindow();
    await this.loading;
    const win = this.window;
    if (!win || win.isDestroyed() || !this.currentId) return;
    if (appearing) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const width = Math.min(400, area.width); const height = Math.min(520, area.height);
      win.setBounds({ width, height, x: Math.max(area.x, area.x + area.width - width - 16), y: Math.max(area.y, area.y + area.height - height - 16) });
    }
    win.showInactive();
    this.flushSpeech();
    if (!this.hitTest) { this.hitTest = setInterval(() => this.updateHitTest(), 50); this.hitTest.unref(); }
    this.updateHitTest();
  }

  speechReady() { this.ready = true; this.flushSpeech(); }
  speak(event: Extract<SpeechEvent, { type: 'play' }>) {
    if (event.id !== this.currentId) return;
    this.pendingSpeech = event; this.flushSpeech();
  }
  stopSpeech() {
    this.pendingSpeech = null;
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('speech:event', { type: 'stop' });
  }
  private flushSpeech() {
    if (!this.ready || !this.window?.isVisible() || this.pendingSpeech?.id !== this.currentId) return;
    this.window.webContents.send('speech:event', this.pendingSpeech);
    this.pendingSpeech = null;
  }

  setRegions(value: unknown) {
    if (!Array.isArray(value) || value.length > 4) return;
    if (!value.every(r => r && ['x', 'y', 'width', 'height'].every(key => typeof r[key] === 'number' && Number.isFinite(r[key]) && r[key] >= 0 && r[key] <= 2000))) return;
    this.regions = value; this.updateHitTest();
  }
  private updateHitTest() {
    const win = this.window;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const cursor = screen.getCursorScreenPoint(); const bounds = win.getBounds();
    const x = cursor.x - bounds.x; const y = cursor.y - bounds.y;
    const ignore = !this.regions.some(r => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height);
    if (ignore !== this.ignoringMouse) { win.setIgnoreMouseEvents(ignore); this.ignoringMouse = ignore; }
  }
  private async createWindow() {
    this.ready = false; this.regions = []; this.ignoringMouse = true;
    const win = new BrowserWindow({
      width: 400, height: 520, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
      show: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      acceptFirstMouse: true, hiddenInMissionControl: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
    });
    this.window = win;
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('moved', () => {
      const bounds = win.getBounds(); const area = screen.getDisplayMatching(bounds).workArea;
      const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
      const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
      if (x !== bounds.x || y !== bounds.y) win.setPosition(x, y);
    });
    win.on('closed', () => {
      if (this.window === win) this.window = null;
      this.ready = false; this.pendingSpeech = null;
      clearInterval(this.hitTest); this.hitTest = undefined;
    });
    if (this.devUrl) await win.loadURL(`${this.devUrl}/#nudge`);
    else await win.loadFile(path.join(__dirname, 'renderer/index.html'), { hash: 'nudge' });
  }
  destroy() { clearInterval(this.hitTest); this.pendingSpeech = null; this.window?.destroy(); }
}
