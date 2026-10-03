# Dopamigo interface

Dopamigo should feel like a considered Mac utility: familiar, calm, and useful. Use the native Apple system font, charcoal `#1E1E1E`, soft white `#F7F7F7`, and neutral grays. The sidebar uses soft white; the document workspace uses white.

## Layout and language

- Lead with the user's task title. Use practical headings such as Notes, Steps, and Links. Keep supporting copy short and conversational.
- Use a light, compact sidebar with task navigation. The main workspace is one continuous document, with fine rules between sections.
- Avoid promotional headlines, uppercase overlines, status pills, oversized logos, dark feature cards, decorative gradients, and stacks of rounded panels.
- Use 25–27px page titles, 13px body text, and 11–12px supporting labels. Keep Apple system typography and normal sentence case throughout.
- Use whitespace to group related content. Controls have small 5px corners. Reserve shadows for functional overlays such as step menus.
- Plans use checkboxes and a per-step options menu. Put actions near the content they change. Notes should feel like a writing surface.

## Shared styles

Use variables from `apps/desktop/renderer/src/style.css`: `--ink`, `--paper`, `--surface`, `--surface-soft`, `--text-secondary`, `--text-muted`, `--border`, and `--border-strong`.

The shell and general controls live in `style.css`; planning and form layout in `workspace.css`; sessions, notes, and resources in `focus.css`; saved sessions in `return.css`; assignment chat in `chat.css`; settings layout in `settings.css`. Reuse `.page`, `.section-heading`, `.primary`, `.secondary`, `.quiet`, and `.actions`.

Keep keyboard focus visible. Settings switches and task checkboxes have distinct styles. Step menus must work with the keyboard, close with Escape, and preserve accessible labels. Honor reduced motion, including pseudo-elements. Check the default 1120 × 780 window and the minimum 760 × 600 window, including long task names. Use vertical scrolling without horizontal overflow.

## Form controls

Every field has one focus boundary. Standalone fields use the shared inset focus outline; compound editors such as chat put focus on the container and suppress it on the inner textarea. Never add a second outline, border, or resize handle inside a composer. Keep the footer below the writing area, with enough room for keyboard hints and the send button. Settings prose and privacy notes remain normal paragraphs, not flex rows.

## Desktop companion

The floating mascot is a small transparent cutout with a soft-white speech bubble, native system type and one clear return action. Keep desktop focus in the current app. The surrounding transparent area must pass clicks through. Use subtle motion tied to actual voice playback and honor app/system reduced motion. Do not add an opaque square behind the character. See [mascot behavior and artwork](MASCOT.md).
