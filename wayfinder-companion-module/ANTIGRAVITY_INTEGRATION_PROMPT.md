# Antigravity task: integrate Wayfinder Desktop Companion into this repository

You are working in the existing Wayfinder repository. I have copied the `wayfinder-companion-module` folder into the repository root. Integrate this module into the existing desktop app without rebuilding the application architecture.

## First inspect; do not assume

Read these current files first:
- `desktop-app/package.json`
- `desktop-app/src/main/index.ts`
- `desktop-app/src/preload/index.ts`
- `desktop-app/src/shared/types.ts`
- `desktop-app/src/renderer/main.tsx`
- `desktop-app/src/renderer/App.tsx`
- `desktop-app/src/renderer/Chat.tsx`
- `desktop-app/FEATURES.json`
- `desktop-app/scripts/build.mjs`
- `desktop-app/vite.config.ts`

Read `wayfinder-companion-module/README.md` and `wayfinder-companion-module/electron/INTEGRATION_NOTES.md`.

## Goal

Integrate a persistent floating desktop pet and a separate hotkey-triggered animated chat overlay:

1. The pet is a compact transparent, frameless, always-on-top desktop window, independently draggable and hideable.
2. The pet's quick menu contains exactly five shortcut slots, plus Ask Wayfinder, Open Wayfinder, Widget settings, and Hide pet.
3. The global hotkey works when Wayfinder is not focused. It opens/focuses one overlay window, not a new application instance.
4. The overlay dims the desktop, animates a companion entering from the bottom-right, displays a short greeting, and slides a chat dock in from the right (about 45–50% width on desktop).
5. The chat dock must reuse the existing `ChatPanel` and existing `window.wayfinder` API. If a selected space is unavailable, show an honest empty state and a button to focus the main app to select/create a space.
6. Closing with Escape, the close button, or a click on the dim backdrop hides the overlay. Clicking inside the panel must not close it. Keep the persistent pet in its last position.
7. Add a settings affordance for changing the hotkey only if it can be implemented safely; otherwise keep a single documented default with conflict detection and a TODO, not a fake control.

## Required implementation discipline

- Preserve the current Electron security model: context isolation, no Node integration in renderer, sandboxing, main-owned privileged operations, sender validation.
- Add only narrow, named IPC channels/methods for showing/hiding windows and setting/reading non-secret widget preferences. Do not expose generic IPC or filesystem APIs.
- Follow existing `requireMainSender` validation where applicable and inspect sender validation assumptions for additional windows before implementing.
- Register `globalShortcut` only after Electron is ready; check registration success; unregister at shutdown.
- Avoid hardcoded monitor coordinates; use Electron `screen` display work areas. Handle multiple monitors and display changes sensibly.
- Keep the pet and overlay windows single-instance. Do not start another backend or agent loop.
- Use the existing chat methods and preserve `ChatPanel` safeguards against automatic request replay.
- The existing `FEATURES.json` excludes arbitrary workflow-builder/scheduler behavior and native desktop actions. Do not make unsupported operations appear functional. Empty shortcut slots are acceptable; only connect a shortcut when a real supported action is verified.
- Do not add screen capture, recording, microphone monitoring, or desktop scanning.
- Do not change backend semantics or unrelated pages.
- Use the supplied React components and CSS as a starting point, adapting import paths and styles to the actual project.

## Suggested steps

1. Move/copy the module renderer files into the desktop renderer source tree and fix imports.
2. Add renderer mode routing for `?companion=pet` and `?companion=overlay` in `main.tsx` without affecting normal startup.
3. Implement a small main-process controller that creates/reuses the pet and overlay BrowserWindows and registers the global shortcut.
4. Extend the restricted preload bridge with only the narrow window-control methods required. Update types/allowlists if the existing security model requires it; do not add unrelated backend methods.
5. Mount the existing ChatPanel in the overlay using the current selected space and capability state. Provide a safe empty state when no space is selected.
6. Add an entry point in existing Settings or a minimal Widget settings panel for showing/hiding the pet and explaining the shortcut. Do not create a whole new navigation section unless the existing UI architecture calls for it.
7. Add focused tests for shortcut registration failure, repeated hotkey presses, overlay close behavior, fixed five slots, and the empty-space state where feasible.
8. Run `npm run check`, `npm test`, and `npm run build` from `desktop-app/`. Fix regressions. Report exactly which commands ran and their results.

## Acceptance criteria

- Existing Wayfinder main window and existing chat continue to work.
- Pet can be dragged without preventing menu buttons from clicking.
- Exactly five shortcut slots are rendered.
- Hotkey works while another app has focus and creates no duplicate overlay.
- Entrance animation starts visually at the bottom-right; the panel slides in from the right.
- Escape/backdrop/close button close the overlay without terminating Wayfinder.
- Chat uses the existing backend and no fake responses are shown.
- Hide pet does not stop the backend or main app.
- Unsupported actions remain disabled/unavailable with honest explanations.
- No secrets, credentials, or runtime databases are copied into the module.
