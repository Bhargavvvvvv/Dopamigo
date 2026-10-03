# Floating mascot

The friendly mascot appears in a transparent, always-on-top Electron window when an existing browser-detour rule fires during a focus session. It stays out of the keyboard focus, appears on the display nearest the pointer, and is available across macOS Spaces, including full-screen apps. The bubble header and mascot are draggable. Empty space around the bubble and mascot passes clicks to the app underneath.

The mascot speaks the existing Gemini/Google TTS reminder. Its movement follows actual playback and audio amplitude, rather than a guessed speech duration. Stop voice silences just the current reminder. Dismiss, return, research, a break, and changes to the active detour cancel pending and playing audio. Voice previews remain in the workspace; a nudge is played only by the companion window. The renderer signals readiness before buffered speech is delivered.

Both the system's reduced-motion preference and Dopamigo's Reduce motion setting disable animation. Mute spoken nudges retains the mascot and text. Text/voice failures retain the saved next action and return controls. The optional floating workspace launcher is hidden while the mascot is present, so the two don't overlap.

## Try it

Start a focus session. In Settings, enable browser monitoring and leave spoken nudges unmuted. A connected browser extension reports configured domains after the selected dwell time. To try the mascot without visiting a site, enable Demo timing and choose **Demo: simulate a browser detour**; it appears after about three seconds. Demo reminders remain labelled as simulated.

`npm run test:mascot` checks the actual Electron surface with isolated storage and synthetic text/audio fixtures: transparency, click-through regions, playback motion, stop voice, mute/reduced motion, failures, late cancellation, all return actions, and the hidden workspace. `npm run test:voice` checks a live Google voice through the mascot. The latter uses the configured key and audibly plays a short reminder.

## Artwork

Original: `output/mascot-emotions/friendly.png`. The original files are preserved.

Bundled cutout: `apps/desktop/renderer/src/assets/mascot/friendly-transparent.png`. Vite includes it in development, production and packaged builds. Prepared with the built-in imagegen tool in background-extraction mode, with true alpha transparency and an opaque white character.

Prompt:

> Use case: background-extraction. Asset type: transparent desktop companion sprite. Input image: edit target, the user's original black-and-white friendly waving cat mascot. Remove ONLY the exterior white background to genuine alpha transparency. Preserve the exact character, full body, waving hand, three greeting strokes, black hand-drawn outlines, large black eyes, smile, pose, proportions, and white fill INSIDE the character. Keep the art centered at the same scale and framing with transparent margins. No redesign, no added elements, no shadow, no text. All exterior background and gaps around the limbs must be transparent; the character's white body and face remain opaque white.

Native behavior follows Electron's [window API](https://www.electronjs.org/docs/latest/api/base-window) and [window interaction documentation](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions).
