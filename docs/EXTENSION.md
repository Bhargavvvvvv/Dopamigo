# Chrome companion

1. Launch Dopamigo (`npm run dev`).
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/browser-extension` in this repository.
3. In desktop Settings, choose **Show pairing details**, then **Copy token**. A “Token copied” message confirms it is on your clipboard. Use **Show token** if you want to inspect or select it manually. Paste into the extension popup, use the shown port (normally 47321), and connect.
4. Add task resource links in Work. Enable browser monitoring in Settings and start a session.
5. Visit a saved resource, or explicitly choose **Use this as my work tab** in the extension popup. Then visit a configured detour domain.
6. The extension badge says ON only while monitoring is enabled for an active session. Pause, break, end, or disable monitoring to stop signals.

Permissions: `tabs` reads the active URL for domain classification and matching saved work; `storage` holds pairing configuration; `alarms` reconnects after the service worker or desktop stops; loopback host access connects to the local desktop. No content scripts, history API, screenshots, page bodies, or incognito signals. URLs used to remember the work tab stay in extension memory. Desktop receives domain + tab/window IDs + a relevance flag, never full browsing URLs. Saved task links travel locally to the extension for matching. When an eligible nudge fires, the desktop sends the current hostname plus task/step/next action and recent generated lines to Gemini to write the nudge; Google TTS receives that generated text. Page contents and full browsing URLs are not sent.

The desktop accepts only extension origins, requires a random 256-bit token, validates messages, limits payloads/rates, and listens on `127.0.0.1` only. Reset pairing invalidates the previous token. Close/reopen the popup to reconnect immediately; otherwise automatic reconnect occurs within a minute. Other local processes with access to your account/files are outside this trust boundary.

If a work tab was closed or navigated away, use the saved resource in Return. Only one Chrome connection is supported. For a port conflict set `DOPAMIGO_PORT` in the shell before launching and use the displayed port.

References checked October 3, 2026: [Chrome WebSocket service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets), [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs).
