# Wayfinder Desktop Companion — Drop-in Module

This folder is an integration module for the uploaded Wayfinder project, not a separate application and not a claim that the feature is already connected.

## What it contains

- Persistent draggable desktop pet UI with a five-slot shortcut menu.
- Hotkey-triggered companion overlay UI with animated entrance from the bottom-right and a right-side chat panel.
- A shared visual system and typed integration contracts.
- Electron integration notes tailored to the current `desktop-app/` architecture.
- An Antigravity prompt to integrate the module against the actual repository without inventing backend APIs.

## Intended destination

Copy this `wayfinder-companion-module` folder into the root of the existing repository, then give Antigravity `ANTIGRAVITY_INTEGRATION_PROMPT.md` and ask it to integrate the module.

The source components deliberately accept callbacks/props. They do not create a second agent loop, backend, memory engine, or pretend shortcut API. Antigravity must connect them to existing `window.wayfinder` methods and the Electron main process.

## Components

- `src/renderer/CompanionPet.tsx` — persistent pet and five shortcut slots.
- `src/renderer/CompanionOverlay.tsx` — animated summon and right-side chat surface; pass the existing `ChatPanel` as `chatContent`.
- `src/renderer/companion.css` — styles and animations.
- `src/renderer/contracts.ts` — UI contracts.
- `electron/INTEGRATION_NOTES.md` — safe integration details for Electron main/preload.
- `ANTIGRAVITY_INTEGRATION_PROMPT.md` — copy/paste integration request.

## Important constraints

- Five shortcut slots are fixed. Empty slots are shown as unconfigured; no fake workflows are run.
- A shortcut must map to a real existing, qualified operation. Do not assume arbitrary workflow execution is available.
- The uploaded project's current `FEATURES.json` explicitly excludes general workflow-builder/scheduler and native desktop actions. Preserve those limitations.
- Screen capture is not part of this module.
- The overlay should reuse the existing ChatPanel and `window.wayfinder` API; do not add a duplicate assistant/backend.
- Respect `prefers-reduced-motion`.

## Validation

After integration, run the existing desktop-app checks from `AI-Assistant/desktop-app/`:

```powershell
npm run check
npm test
npm run build
```

Only report tests as passed if they were actually run and passed.
