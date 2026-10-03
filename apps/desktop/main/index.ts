import { app, BrowserWindow, clipboard, ipcMain, shell, session, powerMonitor, safeStorage, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { commandSchema, googleActionSchema, planningInputSchema, draftInputSchema, safeUrl, nudgeActionSchema } from '../../../packages/contracts';
import { currentProject } from '../../../packages/core/state';
import { randomUUID } from 'node:crypto';
import { applyCommand } from '../../../packages/core/commands';
import { MockPlanner } from '../../../packages/core/planning';
import { GeminiPlanner, ProviderError } from './adapters/gemini';
import { loadConfig } from './config';
import { Drafts } from '../../../packages/core/drafts';
import { transitionSession } from '../../../packages/core/sessions';
import { BrowserServer } from './adapters/browser-server';
import { Store } from '../../../packages/core/store';
import { JsonRepository } from './adapters/json-repository';
import { GoogleTTS } from './adapters/google-tts';
import { NudgeController } from './nudge-controller';
import { GeminiNudgeWriter } from './adapters/gemini-nudge-writer';
import { GoogleAuth, EncryptedGoogleStorage } from './google/auth';
import { GoogleAPI } from './google/api';
import { GoogleController } from './google/controller';
import { GeminiAssignmentDetector } from './google/detector';
import { readBrief } from './google/brief';
import { WorkChat } from './work-chat';
import { DesktopControls } from './desktop-controls';
import { FloatingNudge } from './floating-nudge';

app.setName('Dopamigo');
if (process.env.DOPAMIGO_DATA_DIR) app.setPath('userData', process.env.DOPAMIGO_DATA_DIR);
const developmentUrl = !app.isPackaged && process.env.DOPAMIGO_DEV_URL === 'http://127.0.0.1:5173' ? process.env.DOPAMIGO_DEV_URL : undefined;
let desktop: DesktopControls;
let window: BrowserWindow | null = null;
const floatingNudge = new FloatingNudge(developmentUrl);
let nudges: NudgeController;
function broadcast(channel: string, value: unknown) { for (const win of [window, floatingNudge.window]) if (win && !win.isDestroyed()) win.webContents.send(channel, value); }
let store: Store;
let drafts: Drafts;
let browser: BrowserServer;
let google: GoogleController;
let closing = false;
let initialized = false;
async function setup() {
  const directory = process.env.DOPAMIGO_DATA_DIR ?? (process.argv.includes('--smoke-test') ? await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-smoke-')) : app.getPath('userData'));
  const repository = new JsonRepository(directory);
  const config = loadConfig(directory, app.isPackaged);
  browser = new BrowserServer(directory, status => { broadcast('browser:status', status); nudges?.tick(); });
  let startupError = '';
  let notice: string | null = null;
  try { const loaded = await repository.load(); store = new Store(loaded.state, repository); notice = loaded.notice; } catch (error) { startupError = (error as Error).message; }
  if (store) {
    drafts = new Drafts(store, () => window?.webContents.send('workspace:save-error'));
    if (store.state.session?.status === 'active') await store.update(s => transitionSession(s, 'pause'));
  }
  const authorize = (event: Electron.IpcMainInvokeEvent) => { if (![window, floatingNudge.window, desktop?.launcher].some(win => win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame)) throw new Error('Untrusted request'); };
  if (store) {
    const secrets = new EncryptedGoogleStorage(directory, {
      encrypt: async text => { if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Secure macOS storage is unavailable. Google credentials were not saved.'); return safeStorage.encryptStringAsync(text); },
      decrypt: async bytes => (await safeStorage.decryptStringAsync(bytes)).result,
    });
    const auth = new GoogleAuth(secrets, url => shell.openExternal(url), config.googleClientId ? { client_id: config.googleClientId, client_secret: config.googleClientSecret || undefined } : undefined);
    google = new GoogleController(store, auth, new GoogleAPI(auth), new GeminiAssignmentDetector(config.apiKey, config.assignmentModel), status => broadcast('google:status', status));
  }
  ipcMain.handle('google:status', event => { authorize(event); return google?.status; });
  ipcMain.handle('google:action', async (event, input) => {
    authorize(event);
    try {
      if (!google) throw new Error('Your workspace must load before connecting Google.');
      const action = googleActionSchema.parse(input);
      if (action.type === 'help') { await shell.openExternal('https://console.cloud.google.com/apis/credentials'); }
      else if (action.type === 'setup') {
        const selected = await dialog.showOpenDialog({ title: 'Import Google Desktop OAuth setup', properties: ['openFile'], filters: [{ name: 'Google OAuth JSON', extensions: ['json'] }] });
        if (selected.canceled) return { ok: true, value: null };
        const info = await fs.stat(selected.filePaths[0]); if (info.size > 50000) throw new Error('That setup file is too large.');
        await google.setup(JSON.parse(await fs.readFile(selected.filePaths[0], 'utf8')));
      } else await google.action(action);
      return { ok: true, value: null };
    } catch (error) { return { ok: false, error: error instanceof Error && !('issues' in error) && !(error instanceof SyntaxError) ? error.message : 'Google setup or action could not be completed. Check the selected file and try again.' }; }
  });
  const workChat = store ? new WorkChat(store, directory, config.apiKey, config.chatModel) : null;
  for (const action of ['chat', 'attach-pdf', 'remove-pdf'] as const) ipcMain.handle(`workspace:${action}`, async (event, input) => {
    authorize(event);
    try {
      if (!workChat) throw new Error('Your workspace is unavailable.');
      await drafts.flush();
      if (action === 'chat') await workChat.send(input);
      else if (action === 'remove-pdf') await workChat.remove(input);
      else {
        const selected = await dialog.showOpenDialog({ title: 'Add PDF context to this assignment', properties: ['openFile'], filters: [{ name: 'PDF documents', extensions: ['pdf'] }] });
        if (!selected.canceled) await workChat.attach(input, selected.filePaths[0]);
      }
      return { ok: true, value: null };
    } catch (error) { return { ok: false, error: error instanceof Error && !('issues' in error) && !('code' in error) ? error.message : 'Could not complete this chat action. Check local disk access and try again.' }; }
  });
  ipcMain.handle('workspace:import-brief', async event => {
    authorize(event);
    try { const selected = await dialog.showOpenDialog({ title: 'Add assignment brief', properties: ['openFile'], filters: [{ name: 'Assignment brief', extensions: ['pdf', 'txt', 'md'] }] }); return { ok: true, value: selected.canceled ? null : await readBrief(selected.filePaths[0]) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not read that brief.' }; }
  });
  ipcMain.handle('ui:show', async event => { authorize(event); await showWorkspace(); });
  if (store) nudges = new NudgeController(() => store.state, () => browser.status, new GeminiNudgeWriter(config.apiKey, config.nudgeModel), new GoogleTTS(config.apiKey, config.ttsModel, config.voice), nudge => {
    broadcast('nudge:status', nudge);
    desktop?.setNudgeVisible(Boolean(nudge));
    void floatingNudge.update(nudge).catch(() => { /* The workspace's reminder remains available if the desktop surface fails. */ });
  }, event => {
    if (event.type === 'stop') { floatingNudge.stopSpeech(); window?.webContents.send('speech:event', event); }
    else if (nudges.current?.id === event.id) floatingNudge.speak(event);
    else window?.webContents.send('speech:event', event);
  });
  ipcMain.handle('speech:ready', event => { authorize(event); if (event.sender === floatingNudge.window?.webContents) floatingNudge.speechReady(); });
  ipcMain.on('nudge:regions', (event, regions) => {
    if (event.sender === floatingNudge.window?.webContents && event.senderFrame === event.sender.mainFrame) floatingNudge.setRegions(regions);
  });
  ipcMain.handle('nudge:status', event => { authorize(event); return nudges?.current ?? null; });
  ipcMain.handle('nudge:demo', event => { authorize(event); try { nudges.demo(); return { ok: true, value: null }; } catch (error) { return { ok: false, error: (error as Error).message }; } });
  ipcMain.handle('nudge:preview', async event => { authorize(event); try { await nudges.preview(); return { ok: true, value: null }; } catch (error) { return { ok: false, error: (error as Error).message }; } });
  ipcMain.handle('nudge:respond', async (event, value) => {
    authorize(event);
    try {
      const action = nudgeActionSchema.parse(value); nudges.respond(action); await drafts.flush();
      if (action.action === 'break') await store.update(s => transitionSession(s, 'break'));
      if (action.action === 'return') {
        if (!window) await createWindow(); window!.webContents.send('ui:navigate', 'work'); window!.show();
        if (!await browser.restore()) { const resource = currentProject(store.state)?.resources[0]; if (resource) await shell.openExternal(safeUrl.parse(resource.url)); }
      }
      return { ok: true, value: null };
    } catch { return { ok: false, error: 'This nudge has ended, or the saved resource could not be opened. Your work is in Return.' }; }
  });
  ipcMain.handle('browser:status', event => { authorize(event); return browser.status; });
  ipcMain.handle('browser:pairing', async (event, reset) => { authorize(event); try { if (reset !== undefined && typeof reset !== 'boolean') throw new Error(); return { ok: true, value: await browser.pairing(reset) }; } catch { return { ok: false, error: 'Could not create a pairing token.' }; } });
  ipcMain.handle('browser:copy-pairing-token', async event => {
    authorize(event);
    try {
      const { token } = await browser.pairing();
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error();
      await clipboard.writeText(token);
      return { ok: true, value: null };
    } catch { return { ok: false, error: 'Could not copy the pairing token. Choose Show token and copy it manually.' }; }
  });
  ipcMain.handle('browser:restore', async event => { authorize(event); return await browser.restore() ? { ok: true, value: null } : { ok: false, error: 'The previous work tab is unavailable. Open a saved resource from Return.' }; });
  ipcMain.handle('workspace:load', event => { authorize(event); return startupError ? { ok: false, error: startupError } : { ok: true, value: { state: store.state, runtime: { planningReady: Boolean(config.apiKey), ttsReady: Boolean(config.apiKey), storageNotice: notice, dataPath: directory } } }; });
  ipcMain.handle('workspace:command', async (event, input) => {
    authorize(event);
    try {
      if (startupError) throw new Error(startupError);
      const command = commandSchema.parse(input);
      if (command.type === 'project.delete') {
        const project = store.state.projects.find(p => p.id === command.projectId);
        if (!project) throw new Error('This task is no longer available.');
        const options: Electron.MessageBoxOptions = {
          type: 'warning', title: 'Delete task', message: `Delete “${project.title}”?`,
          detail: 'This removes its plan, notes, chat, links, and saved progress from Dopamigo and ends its focus session. This cannot be undone.' + (project.assignment ? ' Your Google Calendar event and Drive files will stay unchanged.' : ''),
          buttons: ['Cancel', 'Delete task'], defaultId: 0, cancelId: 0,
          ...(project.assignment ? { checkboxLabel: 'Allow the next calendar sync to recreate this task', checkboxChecked: false } : {}),
        };
        const answer = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
        if (answer.response !== 1) return { ok: true, value: store.state };
        command.allowReimport = answer.checkboxChecked;
      }
      await drafts.flush();
      const state = await store.update(state => applyCommand(state, command));
      return { ok: true, value: state };
    } catch (error) { return { ok: false, error: error instanceof Error && !('issues' in error) && !('code' in error) ? error.message : 'Unable to save this change. Check the input and local disk access.' }; }
  });
  ipcMain.handle('workspace:draft', (event, input) => { authorize(event); try { drafts.stage(draftInputSchema.parse(input)); return { ok: true, value: null }; } catch { return { ok: false, error: 'Unable to stage your edits. Copy your notes before closing.' }; } });
  ipcMain.handle('workspace:flush', async event => { authorize(event); try { return { ok: true, value: await drafts.flush() }; } catch { return { ok: false, error: 'Autosave failed. Your edits are still in memory. Check disk access and retry.' }; } });
  ipcMain.handle('workspace:open-resource', async (event, id) => {
    authorize(event);
    try { if (typeof id !== 'string') throw new Error(); const resource = currentProject(store.state)?.resources.find(r => r.id === id); if (!resource) throw new Error(); await shell.openExternal(safeUrl.parse(resource.url)); return { ok: true, value: null }; }
    catch { return { ok: false, error: 'That saved resource could not be opened. Check the link in Work.' }; }
  });
  let planning = false;
  ipcMain.handle('workspace:plan', async (event, input) => {
    authorize(event);
    if (startupError || planning) return { ok: false, error: 'The workspace is busy or unavailable. Please try again.' };
    planning = true;
    try {
      const request = planningInputSchema.parse(input);
      const provider = store.state.preferences.useMock ? new MockPlanner() : new GeminiPlanner(config.apiKey, config.planningModel);
      const { projectId: _projectId, ...planningDetails } = request;
      const outcome = await provider.generate(planningDetails);
      if (outcome.kind === 'clarification') return { ok: true, value: outcome };
      await drafts.flush();
      const id = request.projectId ?? randomUUID(); const at = new Date().toISOString();
      await store.update(state => {
        if (state.session && state.session.status !== 'ended') throw new ProviderError('End the existing session before creating another plan.');
        const steps = outcome.plan.steps.map(step => ({ ...step, id: randomUUID(), status: 'todo' as const }));
        const existing = request.projectId ? state.projects.find(p => p.id === request.projectId) : undefined;
        if (request.projectId) {
          if (!existing || existing.plan?.source !== 'starter') throw new ProviderError('Only the initial imported starter plan can be replaced. Your existing plan is preserved.');
          const usingStarterAction = !existing.activeStepId || existing.nextAction === existing.plan.steps.find(step => step.id === existing.activeStepId)?.title;
          existing.brief = request.brief; existing.plan = { id: randomUUID(), source: provider.source, createdAt: at, steps }; existing.activeStepId = steps[0].id;
          if (usingStarterAction) existing.nextAction = steps[0].title;
        } else state.projects.push({ id, title: request.title, brief: request.brief, deadline: request.deadline, plan: { id: randomUUID(), source: provider.source, createdAt: at, steps }, activeStepId: steps[0].id, notes: '', resources: [], nextAction: steps[0].title, createdAt: at });
        state.selectedProjectId = id;
      });
      return { ok: true, value: { kind: 'plan', projectId: id } };
    } catch (error) { return { ok: false, error: error instanceof ProviderError ? error.message : 'Unable to create this plan. Check the task input and local disk access.' }; }
    finally { planning = false; }
  });
  await browser.start(Number(process.env.DOPAMIGO_PORT ?? 47321));
  function configureBrowser() {
    if (!store) return;
    const state = store.state; const enabled = state.preferences.monitoring && state.session?.status === 'active';
    browser.configure({ enabled, sessionId: state.session?.id ?? null, domains: state.preferences.domains, resources: enabled ? (currentProject(state)?.resources.map(r => r.url) ?? []) : [] });
  }
  configureBrowser();
  desktop = new DesktopControls(() => { void showWorkspace(); }, () => window?.hide(), enabled => { void store?.update(s => { s.preferences.monitoring = enabled; }).catch(() => broadcast('workspace:save-error', null)); }, developmentUrl);
  if (store) desktop.update(store.state.preferences.monitoring, store.state.preferences.floatingLauncher);
  store?.subscribe(state => { broadcast('workspace:state', state); configureBrowser(); nudges?.tick(); desktop.update(state.preferences.monitoring, state.preferences.floatingLauncher); });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  powerMonitor.on('suspend', () => { void shutdown().catch(() => broadcast('workspace:save-error', null)); });
  powerMonitor.on('lock-screen', () => { void shutdown().catch(() => broadcast('workspace:save-error', null)); });
  await createWindow();
  initialized = true;
  if (google) await google.start();
  powerMonitor.on('resume', () => { void google?.sync(); });
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1120, height: 780, minWidth: 760, minHeight: 600,
    title: 'Dopamigo', backgroundColor: '#F7F7F7',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (closing || !drafts) return;
    event.preventDefault();
    void shutdown().then(() => { closing = true; window?.close(); closing = false; }).catch(() => window?.webContents.send('workspace:save-error'));
  });
  window.on('closed', () => { window = null; });
  if (developmentUrl) await window.loadURL(developmentUrl);
  else await window.loadFile(path.join(__dirname, 'renderer/index.html'));
  if (process.argv.includes('--smoke-test')) {
    setTimeout(async () => {
      try {
        const title = await window!.webContents.executeJavaScript('document.querySelector("h1")?.textContent');
        if (title !== 'Dopamigo') throw new Error('Desktop shell did not render');
        const screenshot = await window!.webContents.capturePage();
        await fs.mkdir('test-results', { recursive: true });
        await fs.writeFile('test-results/block-0-shell.png', screenshot.toPNG());
        console.log('PASS: actual Electron BrowserWindow rendered Dopamigo. Screenshot saved.');
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    }, 1000);
  }
}
if (app.requestSingleInstanceLock()) { app.whenReady().then(setup).catch(() => { console.error('Dopamigo could not initialize. Check local data permissions.'); app.exit(1); }); app.on('second-instance', () => { if (initialized) void showWorkspace(); }); } else app.quit();
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (initialized) void showWorkspace(); });
async function showWorkspace() { if (!window || window.isDestroyed()) await createWindow(); window!.show(); window!.focus(); }
async function shutdown() { nudges?.cancel(); await drafts?.flush(); if (store?.state.session?.status === 'active') await store.update(s => transitionSession(s, 'pause')); }
let quitting = false;
let quitPending = false;
app.on('before-quit', event => { if (quitting || !drafts) return; event.preventDefault(); if (quitPending) return; quitPending = true; void shutdown().then(async () => { nudges?.stop(); await google?.stop(); await browser?.stop(); floatingNudge.destroy(); desktop?.destroy(); quitting = true; closing = true; app.quit(); }).catch(() => { quitPending = false; broadcast('workspace:save-error', null); }); });
