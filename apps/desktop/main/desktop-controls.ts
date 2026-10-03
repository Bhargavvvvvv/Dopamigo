import { Menu, Tray, nativeImage, BrowserWindow, screen, app } from 'electron';
import path from 'node:path';
export class DesktopControls {
  private tray: Tray; launcher: BrowserWindow | null = null;
  private nudgeVisible = false;
  setNudgeVisible(visible: boolean) { this.nudgeVisible = visible; if (visible) this.launcher?.hide(); else this.launcher?.showInactive(); }
  constructor(private show: () => void, private hide: () => void, private pauseNudges: (enabled: boolean) => void, private devUrl?: string) {
    this.tray = new Tray(nativeImage.createEmpty()); this.tray.setTitle('d.'); this.tray.setToolTip('Dopamigo');
    this.update(false, false);
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Dopamigo', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Show Dopamigo', click: show }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  }
  update(monitoring: boolean, floating: boolean) {
    this.tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show Dopamigo', click: this.show }, { label: 'Hide Dopamigo', click: this.hide }, { type: 'separator' }, { label: monitoring ? 'Pause nudges' : 'Enable nudges for focus sessions', click: () => this.pauseNudges(!monitoring) }, { type: 'separator' }, { label: 'Quit Dopamigo', accelerator: 'Command+Q', click: () => app.quit() }]));
    if (floating && !this.launcher) void this.createLauncher(); else if (!floating && this.launcher) { this.launcher.close(); this.launcher = null; }
  }
  private async createLauncher() {
    const area = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({ width: 76, height: 76, x: area.x + area.width - 96, y: area.y + area.height - 106, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    this.launcher = win;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', e => e.preventDefault());
    win.on('closed', () => { if (this.launcher === win) this.launcher = null; });
    if (this.devUrl) await win.loadURL(`${this.devUrl}/#launcher`); else await win.loadFile(path.join(__dirname, 'renderer/index.html'), { hash: 'launcher' });
    if (!win.isDestroyed() && !this.nudgeVisible) win.showInactive();
  }
  destroy() { this.tray.destroy(); this.launcher?.destroy(); this.launcher = null; }
}
