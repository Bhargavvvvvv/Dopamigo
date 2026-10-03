# Dopamigo

A macOS desktop companion for taking one small step and finding your way back to your work.

## Run the desktop app

macOS Apple Silicon; Node 22.12+ and npm (tested with Node 25).

```sh
npm install
cp .env.example .env
# Edit .env locally to add your Gemini key; never paste it into chat.
npm run dev
```

This opens an actual Electron window. React edits update live; restart after main-process/preload changes. No account is required. Without a key, use the explicitly labelled development mock plans. To use live Gemini, turn off **Use sample plans** in Settings.

Plan a task, open Work, start a session, save notes and links, and pause. Return restores the saved context and exact next action. Browser monitoring is optional and requires the [Chrome companion](docs/EXTENSION.md). Gentle is the default nudge style; choose Playful in Settings for fresh Gemini-written humor connecting the current site with your task and next action. Both styles generate new text for each eligible detour, then Google TTS speaks those words.

For a deterministic demo: Settings → **Load sample assignment**, then Return → **Continue working**. Settings also includes labelled demo timing and a simulated detour. These still require an active session and monitoring to be enabled.

## Automatic Google assignments

Settings → **Google assignments** connects Calendar and Drive once, discovers deadlines in the next two weeks, creates subject-grouped task workspaces, and links matching documents. Imported tasks accept pasted or PDF/TXT/Markdown briefs. This local build first needs a Desktop OAuth client: see [Google setup](docs/GOOGLE.md). Personal account access still needs your browser consent.

## Checks and build

```sh
npm run typecheck
npm test
npm run build
npm start
npm run smoke
npm run smoke:dev
npm run smoke:google
npm run test:extension
npm run test:loop
npm run package
npm run smoke:package
```

`npm run test:extension` and `npm run test:loop` require a test browser: `PLAYWRIGHT_BROWSERS_PATH=.local-data/browsers npx playwright install chromium`. They use isolated profiles and local page fixtures.

`npm run test:live` makes three small Google requests (planning + nudge writing + TTS). `npm run test:loop` also needs the key to verify live nudge writing. `npm run test:voice` generates and audibly plays a short Google nudge at 35% volume. These live checks require your local key and may incur API charges.

The build is `release/mac-arm64/Dopamigo.app`. It has no Developer ID signature or notarization; the Electron executable retains an ad-hoc linker signature. It is a local hackathon build, not an App Store release. Credentials and test/demo data are excluded.

See [setup and recovery](docs/SETUP.md), [demo script](docs/DEMO.md), [progress](docs/PROGRESS.md), and [architecture](docs/ARCHITECTURE.md).

### Assignment work chat

Open **Work** on a task to chat with Gemini. Use **Add PDF** to attach readings, the assignment or its rubric (up to 8 PDFs, 12 MB total). Each message includes the task's brief, saved notes, prior conversation and native PDFs, so Gemini can use their text and visual content. Imported brief text is included automatically; a linked Drive document must be downloaded and attached as a PDF to include its full contents. Replies support Markdown and **Add to notes**.

Chat history and PDF copies are stored locally per assignment and survive restart. Sending shares the context with Google Gemini; the API key remains in the desktop main process. Set `GEMINI_API_KEY` in `.env` and optionally `GEMINI_CHAT_MODEL` (defaults to `GEMINI_PLANNING_MODEL`, then `gemini-3.8-flash`). Chat always uses Gemini, independently of the sample planning setting. A chat holds up to 50 exchanges; errors keep the current message available to retry.

Verification: `npm test`, `npm run typecheck`, and `npm run build && node scripts/chat-smoke.mjs`. The chat smoke test uses an isolated workspace and mocked Gemini responses to verify the actual Electron UI without sending personal documents.
