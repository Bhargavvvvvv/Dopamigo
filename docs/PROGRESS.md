# Dopamigo progress

- [x] Block 0 — launchable desktop shell
- [x] Block 1 — structure and local state
- [x] Block 2 — task planning
- [x] Block 3 — sessions and checkpoints
- [x] Block 4 — return loop
- [x] Block 5 — Chrome companion
- [x] Block 6 — nudge rules and Google TTS
- [x] Block 7 — desktop polish
- [x] Block 8 — package and demo

Environment: macOS arm64; Node 25.0.0; npm 11.6.2. Empty repository, no repository instructions found. Target Apple Silicon first.

Block 0 verified: npm dependencies installed; `npm run typecheck` and `npm run build` pass. `npm run smoke` launched an actual Electron BrowserWindow, verified the rendered heading, and captured `test-results/block-0-shell.png`. Run with `npm run dev`.

Block 1: Plan/Work/Return/Settings navigation, keyboard shortcuts, typed canonical models, validated IPC and versioned atomic persistence. Typecheck and two persistence tests pass (restart, concurrent writes, backup recovery, unknown versions). Electron smoke passes.

Block 2: task/brief/deadline, bounded single-agent tool registry, validated Gemini adapter, explicit deterministic mock, editable/reorderable/completable/skippable steps, and smaller-step helper. Four unit tests pass. Actual Electron UI smoke created a task, generated a mock plan, made the next step smaller, restarted, and verified plan/preferences persisted. Live Google planning was subsequently verified in Block 6.

Block 3: constrained session transitions; main-process debounced drafts flushed on actions/close/quit; saved notes, exact next action, links, and bounded checkpoint history. Interrupted active sessions reopen paused. Six tests pass. Actual Electron start → notes/resources → pause → restart → resume → break → end passed.

Block 4: accurate saved-work return card, saved resources and resuming the exact next action. Actual Electron return loop passed; OS link opening intercepted to verify the exact saved URL.

Block 5: authenticated loopback WebSocket service and Chrome MV3 companion; opt-in session-gated domain signals; saved/pinned work-tab restore; visible connection and monitoring settings. Eight unit/integration tests pass. Real Chromium extension test paired through the popup, recognized a saved resource, detected a configured domain, restored the actual work tab, and stopped signals when disabled. Test pages were local fixtures; no personal Chrome profile was modified.

Block 6: deterministic dwell/cooldown/visit suppression; research-domain suppression per session; gentle default and opt-in playful style; voice preview/mute/volume; in-memory audio cache; stale speech cancellation; visual non-focus-stealing nudge panel; labelled manual demo timing. Eleven tests pass, including stale in-flight audio cancellation. Live Gemini returned five validated steps. Live Google TTS generated WAV and played a nudge to completion through Electron, verified by media events. The first playback attempt timed out; a diagnostic retry passed. Real browser detection is separately verified; the live-audio test used the labelled manual trigger.

Block 7: macOS tray with Show/Hide, pause nudges and Quit; optional non-focusable floating launcher; native edit/window menus; pause on suspend/lock; isolated Electron profiles and single-instance protection; denied unused permissions; loopback-only development URL. Development CSP and actual Electron launcher/minimum-size smoke pass. Explicit normal quit completed; test cleanup now requests normal quit before closing its driver connection.

Block 8: Apple Silicon build created at `release/mac-arm64/Dopamigo.app`; deterministic saved-work sample and visibly labelled accelerated timing included. Typecheck and all 14 domain/adapter tests pass. Final Electron smoke includes immediate navigation after typing and checkpoint recovery across restart. The integrated Electron + real Chromium extension loop detected a configured tab, displayed the timed nudge, restored the exact work tab and Work view, and preserved notes. The packaged app launched, loaded the demo, restarted with notes intact, and passed a check that the configured API key is absent from its bundle. Return opens at the top with the exact next action prominent.

Follow-up — live nudge writing: replaced the site phrase bank with a Gemini request for every eligible detour and voice preview. Context is limited to hostname, task, step, next action, style and three recent generated lines. Validated text goes unchanged to Google TTS; failed writing leaves saved-work controls available without canned speech. Both text and audio requests cancel when context changes. The model is configurable with `GEMINI_NUDGE_MODEL` (defaults to the planning model). Typecheck and all 20 tests pass, including malformed/blocked/truncated output, site changes during writing, stale audio, muted generation and failure behavior. Real Chromium tests verified fresh Gemini text for YouTube and Instagram and restoration of the saved work tab. Live Gemini-generated Instagram text was spoken to completion by Google TTS in Electron, and Taking a break stopped the nudge. The rebuilt arm64 app passes packaged launch, saved-demo restart and credential-exclusion checks. The voice harness now waits for the asynchronous break transition before asserting it.

Follow-up — Google integration: added Desktop OAuth with PKCE/state and loopback callback; macOS-encrypted app setup/refresh credentials; automatic Calendar discovery and Gemini classification; two-week imports grouped by subject; duplicate-safe deadline updates; automatic Assignments-folder discovery and conservative document matching; optional possible-assignment review; pause/disconnect; local PDF/TXT/Markdown brief import and same-workspace plan generation. All 30 tests and the actual Electron integration smoke pass, including encrypted restart refresh without repeated sign-in. Live Gemini correctly classified synthetic assignment/social/study events. Google account responses in the UI smoke were fixtures: real account access is still awaiting Desktop OAuth setup and user consent. The rebuilt arm64 app passes packaged launch, PDF parsing, saved-work restart and credential-exclusion checks.

Current: Blocks 0–8 and Google integration implementation complete. Google connection is in Settings; see [GOOGLE.md](GOOGLE.md). Run `npm run dev`, or open the packaged app. Follow [DEMO.md](DEMO.md) for the rehearsal and [EXTENSION.md](EXTENSION.md) to pair your own Chrome profile; automated browser tests used isolated profiles only. Choose Settings → Nudge style → Playful for site-specific light teasing.

Setup needed: a Google Desktop OAuth client and user consent are required for real Calendar/Drive access; no client was configured in the workspace. The app has no Developer ID signing or notarization; only Electron's ad-hoc executable signature remains. Runtime dependency audit has zero findings; eight high-severity findings remain in development-only packager dependencies, documented in [SETUP.md](SETUP.md). Local text-based PDF brief ingestion is implemented for imported assignments; phone monitoring remains out of scope.

Next: rehearse with the intended assignment and Chrome profile. Distribution signing and optional integrations remain future work. Existing UI/mascot work in the workspace was preserved.



Matrix incoperation for distraction in myb phone 
