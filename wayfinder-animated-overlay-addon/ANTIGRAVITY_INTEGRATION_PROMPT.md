# Antigravity prompt — integrate Wayfinder animated entrance + chat overlay

Integrate the files in `wayfinder-animated-overlay-addon/` into the existing Wayfinder repository. This is only the animated overlay part; the persistent desktop pet is handled by the companion module separately.

## Inspect before editing
Read the existing Electron main process, preload bridge, renderer entry point, chat component, shared types, build scripts, and the other `wayfinder-companion-module` files if present. Follow current architecture and security conventions. Do not assume paths or add a second backend.

## Desired behavior
1. A configured global hotkey, registered in Electron's main process after app readiness, shows or focuses a single overlay window. Check registration success and unregister on shutdown.
2. The overlay renders `AnimatedChatOverlay` in its own renderer route/window.
3. The entrance companion visually starts at the bottom-right of the overlay viewport, animates upward/inward, bobs briefly, and displays a greeting.
4. Simultaneously, the dim backdrop fades in and the chat dock slides in from the right at approximately 45–50% width on desktop.
5. Mount Wayfinder's existing chat component through `chatContent`; use existing selected-space state and existing `window.wayfinder` APIs. If chat needs a selected space and none is selected, show a truthful empty state with an action to focus the main app.
6. Escape, close button, or click on the backdrop closes/hides the overlay. Clicking inside the dock must not close it. Avoid duplicate overlay windows on repeated hotkeys.
7. Closing the overlay must not hide or reposition the persistent pet and must not stop the app/backend.
8. Keep reduced-motion accessibility behavior. Keep the persistent pet's saved position independent from the entrance animation origin.

## Security and integration constraints
- Preserve context isolation, sandboxing, `nodeIntegration: false`, sender validation, and narrow typed IPC.
- Do not expose generic IPC, arbitrary filesystem access, or privileged Electron APIs to the renderer.
- Do not add screen capture, recording, microphone monitoring, or desktop scanning.
- Do not create fake replies, invented API endpoints, or a second agent/runtime loop.
- Do not make unsupported workflow actions appear functional.
- Use the existing build/test commands and report which commands were run and their results. Fix regressions where feasible.

## Deliverables
- Move/copy the two renderer files into the appropriate renderer source tree and fix imports.
- Add or adapt a renderer route for the overlay.
- Add main-process window show/focus/hide and hotkey wiring using existing conventions.
- Connect the existing chat component.
- Add focused tests for repeated hotkeys, overlay close behavior, and shortcut-registration failure if the current test setup supports them.
- Summarize changed files and any remaining manual steps.
