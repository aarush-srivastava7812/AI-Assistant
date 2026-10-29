# Desktop companion integration

The GitHub pet and animated chat overlay are integrated into the Electron desktop app in 0.5.0-preview.4. They share the existing owned backend, approved model, spaces and conversation storage; no second agent or memory runtime is started.

The pet appears near the bottom-right work area. Open its menu for Ask Wayfinder, Open Wayfinder, Widget settings or Hide pet. The menu expands the widget window so controls are not clipped. Five shortcut slots remain empty until explicitly configured supported operations exist.

Press Ctrl+Shift+Space to open chat. If another application owns the shortcut, Settings reports the conflict. In Settings > Desktop companion widget, use Show desktop pet or Open companion chat to recover a hidden window. The pet's Widget settings action navigates the main window to Settings.

Select a space in the main window before using companion chat. The overlay follows that selection and uses the same conversation service and history. Its preload exposes only named chat/status operations; file reads, credentials, approvals, memory changes and other backend operations remain unavailable there. Requests require the exact overlay frame and the currently selected space. The pet has no backend API.

Closing the main window hides it while the pet and current session remain alive. Choose Wayfinder > Quit to shut down the windows, owned backend and registered shortcut. Double-launching the app restores its main window.

Verification uses hidden app windows and synthetic data. It does not press the OS global hotkey or capture the desktop. The actual EXE report records which packaged and portable checks passed. The earlier full Python suite's graph-lease failure and remaining broader rebuild scope are documented in REBUILD-CHECKPOINT-03.md; this companion change does not resolve those unrelated limitations.

Verified final build: 110 frontend tests, 10 rendered scenarios, 31 actual packaged checks, 11 outer portable checks and 39 static package checks passed. All 2,973 staged backend/source/model resources matched after extraction. Actual managed-model overlay chat, shared service history, menu expansion, Settings navigation, repeated opening, main-close persistence and restart passed. The hidden harness selects windows by route, waits for conversation readiness, dispatches synthetic DOM input events and captures only app windows with Electron. These checks do not certify a physical global-hotkey press or human visual acceptance.

SHA-256: `8449c2eb5962a73e2bf3c444f527912c093c67090121fbceb3716a1bd956e339`. [Exact verification report](../../desktop-app/release/Wayfinder-0.5.0-preview.4-verification.json).

The executable is now published: [Download preview 4](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.5.0-preview.4/Wayfinder-0.5.0-preview.4-Windows-x64.exe). [All published executables and their digests](DESKTOP-RELEASES.json).
