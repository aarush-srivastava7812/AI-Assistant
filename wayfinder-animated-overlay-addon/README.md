# Wayfinder Animated Chat Overlay Add-on

This is the **animated entrance + chat overlay visual module** for the existing Wayfinder Electron + React + TypeScript application.

## Included
- `src/renderer/AnimatedChatOverlay.tsx` — overlay component with a custom SVG companion, greeting bubble, Escape/backdrop/close behavior, and a slot for Wayfinder's existing chat UI.
- `src/renderer/animated-chat-overlay.css` — entrance animation from the bottom-right, companion greeting bob, dim backdrop, and right-side panel slide-in.
- `ANTIGRAVITY_INTEGRATION_PROMPT.md` — instructions for integrating it into the existing app.

## Important boundaries
- This is a renderer visual component, **not a standalone app**.
- It does not register the global hotkey or create Electron windows. Those must be connected to the existing Electron main process.
- It does not create a new agent loop, backend, or fake chat response.
- Pass the existing Wayfinder chat component as `chatContent`.
- The animated companion starts at the bottom-right of the overlay viewport regardless of the persistent pet's saved position.

## Dependencies
React and `lucide-react`, expected to already be present in the Wayfinder renderer. If Antigravity finds a different icon package or CSS convention, adapt imports without adding unnecessary dependencies.
