let socket = null;
let config = { enabled: false, sessionId: null, resources: [] };
let heartbeat;
let workTab = null;
const send = value => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
function safeUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null; } catch { return null; } }
async function badge() { await chrome.action.setBadgeText({ text: config.enabled ? 'ON' : '' }); await chrome.action.setBadgeBackgroundColor({ color: '#1e1e1e' }); await chrome.action.setTitle({ title: `Dopamigo — ${config.enabled ? 'monitoring this focus session' : 'monitoring off'}` }); }
async function report() {
  if (!config.enabled || socket?.readyState !== WebSocket.OPEN) return;
  const session = config.sessionId;
  try {
    const window = await chrome.windows.getLastFocused();
    if (!window.focused) { send({ type: 'idle' }); return; }
    const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
    if (!config.enabled || config.sessionId !== session) return;
    const url = safeUrl(tab?.url);
    if (!tab || tab.incognito || !url || !url.hostname.includes('.')) { send({ type: 'idle' }); return; }
    const matches = config.resources.some(resource => { const saved = safeUrl(resource); return saved && saved.origin === url.origin && saved.pathname === url.pathname; });
    if (matches) workTab = { tabId: tab.id, windowId: tab.windowId, url: tab.url };
    else if (workTab?.tabId === tab.id && workTab.url !== tab.url) workTab = null;
    send({ type: 'tab', tabId: tab.id, windowId: tab.windowId, domain: url.hostname, relevant: matches || (workTab?.tabId === tab.id && workTab.url === tab.url) });
  } catch { send({ type: 'idle' }); }
}
async function connect() {
  if (socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) return;
  const { token, port = 47321 } = await chrome.storage.local.get(['token', 'port']);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '') || !Number.isInteger(port) || port < 1024 || port > 65535) return;
  const connection = new WebSocket(`ws://127.0.0.1:${port}/companion`); socket = connection;
  connection.onopen = () => { send({ type: 'auth', token }); clearInterval(heartbeat); heartbeat = setInterval(() => { send({ type: 'heartbeat' }); void report(); }, 10000); };
  connection.onmessage = async event => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'config' && typeof message.enabled === 'boolean' && Array.isArray(message.resources) && message.resources.length <= 30 && message.resources.every(url => Boolean(safeUrl(url)))) {
        if (!message.enabled || message.sessionId !== config.sessionId) workTab = null;
        config = message; await badge(); await report();
      } else if (message.type === 'restore' && config.enabled && workTab && message.tabId === workTab.tabId && message.windowId === workTab.windowId && typeof message.requestId === 'string') {
        let ok = false;
        try { const tab = await chrome.tabs.get(workTab.tabId); if (tab.url === workTab.url) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); ok = true; } } catch { workTab = null; }
        send({ type: 'restored', requestId: message.requestId, ok });
      } else if (message.type === 'restore' && typeof message.requestId === 'string') send({ type: 'restored', requestId: message.requestId, ok: false });
    } catch { connection.close(); }
  };
  connection.onclose = () => { if (socket === connection) { socket = null; config.enabled = false; workTab = null; clearInterval(heartbeat); void badge(); } };
  connection.onerror = () => connection.close();
}
chrome.tabs.onActivated.addListener(() => void report());
chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (config.enabled && tab.active && (change.url || change.status === 'complete')) void report(); });
chrome.windows.onFocusChanged.addListener(() => void report());
chrome.tabs.onRemoved.addListener(id => { if (workTab?.tabId === id) workTab = null; });
chrome.runtime.onStartup.addListener(() => void connect());
chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.create('reconnect', { periodInMinutes: 1 }); void connect(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'reconnect') void connect(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'status') respond({ connected: socket?.readyState === WebSocket.OPEN, enabled: config.enabled, hasWorkTab: Boolean(workTab) });
  if (message.type === 'reconnect') { socket?.close(); socket = null; void connect().then(() => respond({ ok: true })); return true; }
  if (message.type === 'pin-work-tab') { if (!config.enabled) { respond({ ok: false }); return; } void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => { if (tab && !tab.incognito && safeUrl(tab.url)) workTab = { tabId: tab.id, windowId: tab.windowId, url: tab.url }; void report(); respond({ ok: Boolean(workTab) }); }); return true; }
});
void chrome.alarms.create('reconnect', { periodInMinutes: 1 });
void connect();
