# Electron integration notes for the current Wayfinder checkout

These notes are based on the uploaded repository snapshot. They are not a claim that the companion is already wired up.

## Existing architecture observed

- Desktop shell: `desktop-app/src/main/index.ts` (Electron, TypeScript).
- Preload bridge: `desktop-app/src/preload/index.ts`, exposing a restricted `window.wayfinder` API.
- Shared renderer API types: `desktop-app/src/shared/types.ts` (`DesktopAPI`).
- Renderer entry: `desktop-app/src/renderer/main.tsx`, currently mounting `App`.
- Existing chat UI: `desktop-app/src/renderer/Chat.tsx` (`ChatPanel`), using the existing `window.wayfinder` methods.
- Feature/method allowlist: `desktop-app/FEATURES.json`.

## Suggested integration shape

1. Copy this module under `desktop-app/src/companion/` or another path chosen by the integrator. Update relative imports accordingly.
2. Add a renderer entry mode, e.g. `?companion=pet` and `?companion=overlay`, in `src/renderer/main.tsx`. Do not mount the full workspace in the pet window.
3. Add a small Electron companion-window controller, imported by `src/main/index.ts`, that creates:
   - a transparent, frameless, always-on-top pet BrowserWindow with a small initial size;
   - a full-work-area transparent overlay BrowserWindow with a dim background and right-side chat dock.
4. Load the existing built renderer HTML using `loadFile(rendererFile, { query: { companion: 'pet' } })` and `loadFile(rendererFile, { query: { companion: 'overlay' } })`. Verify actual routing with the project's Vite/Electron build rather than assuming query handling works.
5. Register the chosen global shortcut with Electron's `globalShortcut` in the main process. Register only after `app.whenReady()`, check the return value, and unregister in `will-quit`.
6. On the shortcut, show/focus the overlay. The overlay UI animates the pet from the bottom-right while the chat dock slides in from the right. Do not create duplicate windows if one already exists.
7. The pet menu's `Ask Wayfinder` action should request the same overlay. `Open Wayfinder` should focus the existing `main` window. `Hide pet` hides only the pet window; it must not kill the app or backend.
8. Mount the existing `ChatPanel` in `CompanionOverlay` as `chatContent`, using the selected space and `window.wayfinder` already used by `App`. Do not invent new chat endpoints. If no space is selected, show a clear prompt and a button that focuses the main app so the user can select/create a space.
9. Connect shortcut slots only to operations that the current build truly supports. The uploaded `FEATURES.json` excludes arbitrary workflow builder/scheduler and native desktop actions. Keep empty slots until a real, qualified operation is selected.
10. Expose only narrow IPC operations needed for window control. Validate IPC sender identity in the main process, as the existing code does with `requireMainSender`. Do not expose generic `ipcRenderer.invoke`, Node, filesystem, shell, arbitrary URL, or unrestricted execution to the renderer.

## Window behavior to implement

- Pet: frameless, transparent, always on top, skip taskbar, compact bounds; draggable region with buttons marked non-draggable.
- Overlay: frameless, transparent, work-area sized, always on top, with the backdrop and panel rendered by React. Close on Escape and backdrop click; make sure clicking the panel does not close it.
- Restore previous focus when overlay closes where feasible.
- Avoid overlay focus stealing repeatedly; if already open, focus it.
- Use per-display work area bounds and handle display changes. Do not hardcode a screen coordinate like `1600,800`.
- Add settings persistence only through the existing approved settings mechanism or a clearly scoped new preference file. Do not store secrets in renderer local storage.
- Respect reduced-motion preference and provide an explicit hide/disable option.

## Current chat contract

The current `ChatPanel` needs `api`, `space`, and `qualified` props. It uses existing API methods including `chats`, `newChat`, `chat`, `sendChat`, `cancelChat`, `lookupChat`, and `deleteChat`. Keep the existing pending-send and no-automatic-retry behavior intact. Do not replace it with a fake response demo.

## Security and scope boundaries

- No screen capture, recording, or desktop scanning is included.
- Never claim a workflow completed based only on a button click; show the existing run result/state.
- Do not bypass the existing confirmation/policy system.
- Do not broaden `FEATURES.json` capabilities just to make a UI button appear active.
- If the global shortcut is unavailable, show a non-blocking error in settings and allow retry with another key combination.
- If the app quits, unregister shortcuts and close companion windows cleanly.
