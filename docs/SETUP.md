# Setup and recovery

## Development

Use a recent Node release (22.12+; tested on macOS arm64 with Node 25.0.0/npm 11.6.2). Run `npm install`, then `npm run dev`. The renderer supports hot reload; restart for changes to main or preload. Vite listens only on `127.0.0.1:5173`.

Copy `.env.example` to `.env`, add credentials in your local editor, and set `chmod 600 .env`. The file is ignored by Git and never bundled. Environment variables override files. Restart after changing configuration. The app reports only whether a key is configured.

| Setting | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | Google API key; `GOOGLE_API_KEY` also supported |
| `GEMINI_PLANNING_MODEL` | `gemini-3.8-flash` | Single planning agent |
| `GEMINI_NUDGE_MODEL` | planning model | Fresh contextual nudge text (defaults to the configured planning model) |
| `GEMINI_TTS_MODEL` | `gemini-3.8-flash-tts` | Spoken nudges |
| `GEMINI_TTS_VOICE` | `Kore` | Voice name |
| `DOPAMIGO_PORT` | `47321` | Shell environment override for loopback companion port |
| `DOPAMIGO_DATA_DIR` | Electron userData | Shell environment override for isolated tests/demo data |

The current default planning, nudge-writing and TTS models were exercised live. Other model IDs are configurable but require corresponding Google account access; the compatibility path for older TTS models is not live-tested.

In Settings, **Use sample plans** produces a deterministic, visibly labelled development mock. Turn it off for Gemini. Missing keys, provider errors, and invalid model results leave saved work intact; they do not silently switch to mock output. Planning sends only task/brief/deadline/clarification. Nudge writing sends only the current hostname, task title, active step, saved next action, selected style, and up to three recent generated nudges to Gemini. TTS then receives the generated text. No page contents, full browsing URLs, notes or assignment brief are sent for nudge writing. Recent nudges are held in memory and reset for a new session.

For witty site-specific speech, choose **Nudge style → Playful**. Gemini writes each line from the live context, for any configured site; there is no phrase bank or canned spoken fallback. Only enabled/configured browser detours trigger nudges, after the selected dwell and cooldown. Switching sites cancels pending text generation and old speech; the next eligible nudge uses the new site. Gentle stays the default and also uses generated text. Writing starts when dwell/cooldown rules allow a nudge and may add several seconds before audio starts. Muting voice still permits text generation for the visual nudge. If writing fails, the saved next action and controls remain visible without speech. **Preview Google voice** uses the current detour, or your first configured domain when there is no detour.

## Google Calendar and Drive

See [GOOGLE.md](GOOGLE.md) for one-time Desktop OAuth setup and automatic assignment discovery. Google sign-in is separate from the Gemini API key. Connections use encrypted macOS storage; calendar/Drive access is read-only.

## Packaged app

Run `npm run package`. Open `release/mac-arm64/Dopamigo.app`. For a packaged app, place `.env` in its local data directory (shown in Settings, normally `~/Library/Application Support/Dopamigo/.env`), or supply environment variables when launching its executable. Packaged builds do not read arbitrary working-directory `.env` files. Never put your key inside the `.app`.

There is no Developer ID signing or notarization. `codesign -dv` reports only the Electron executable’s ad-hoc linker signature, no TeamIdentifier or sealed resources. Gatekeeper treatment can vary when copying/downloading this local build. Distribution signing/notarization are outside this hackathon build.

## Saved work

`state.json` contains versioned local data, with a validated previous save in `state.json.bak`. Files are written through fsync + atomic rename with owner-only permissions. `browser-token` holds the pairing token separately. Audio caches are memory-only. The data is local plaintext, not encrypted.

If a primary save is damaged, a valid backup is loaded with a visible recovery notice. If both are unreadable or the schema version is newer, the app preserves the files and reports a loading error. Quit the app, copy both files somewhere safe, then restore a known good `state.json` backup. Do not delete the originals to troubleshoot. A disk-full/autosave error leaves edits in memory; copy your text out before forcing an exit. Normal close/quit waits for the save.

Bounds: 100 projects, 100 recent checkpoints, 30 steps/resources per project, 100,000 characters of notes per project. Browser observations are never added to the saved state. Completed/skipped steps can be reopened from their options menu.

## Troubleshooting

- Chrome disconnected: open its extension popup and reconnect; check the token and port. The workspace works offline. See [extension setup](EXTENSION.md).
- No nudge: confirm a running session, enabled monitoring, a configured domain, elapsed dwell, and no research/dismissal suppression. Research lasts for the session; dismissal lasts for that visit. Returning, pausing, breaking, or changing the next action cancels stale speech.
- No sound: check mute/volume, use **Preview Google voice**, and inspect the visible provider error. Network/quota/model failures preserve the visual nudge. Text-generation failures show the saved next action; speech failures keep the generated text. There is no canned speech or hidden system-TTS fallback.
- Active session after a crash: reopening pauses it; resume explicitly. Sleep and lock also pause it.
- Port conflict: supply `DOPAMIGO_PORT=47322 npm run dev` and use the new displayed port in the extension.

## Known limitations

- macOS arm64 is built/tested. No Windows, Intel Mac, or Linux package verification.
- Only one Chrome companion connection. Work-tab memory is session-only and clears after disconnect/pause; saved resource links remain the fallback. Query strings are ignored when matching a saved resource’s origin/path, then the exact visited tab URL is used to validate restoration.
- Local PDF/TXT/Markdown brief import is supported for imported assignments; no scanned-PDF OCR, DOCX import, arbitrary app capture, phone monitoring, Dopamigo cloud sync, or medical effectiveness claims. Optional Google sign-in is documented separately.
- Google generation can be slow or transiently fail. A live playback check needed a retry; visual fallback and stale-request cancellation are tested.
- `npm audit --omit=dev` reports zero runtime findings. The current electron-builder download/cache dependency chain has eight reported high-severity development-tool findings. The audit-suggested older packager increased findings, so the current release is retained. Do not treat this as a hardened public distribution pipeline.
