# Themes and settings validation — preview.7

Qualified on Windows x64 on 2026-10-30. This revised preview.7 replaces the earlier preview.7 assets in place; no new version was created. See [simplified onboarding](ONBOARDING-SIMPLIFIED.md). Both Setup and portable EXEs are version 0.5.0-preview.7. [Release verification](../../desktop-app/release/Wayfinder-0.5.0-preview.7-verification.json) binds results to the exact application archive and executable hashes.

| Layer | Result | Coverage |
| --- | --- | --- |
| TypeScript / frontend | Type check and 153 tests passed | Theme catalog, strict preferences, atomic writes and rollback, sender restrictions, preview/cancel, onboarding, settings and existing UI |
| Rendered Chromium | 66 checks passed | All 19 actual palettes, System changes, preview without save, Cancel/Escape, keyboard/search, reload persistence, settings categories, no external runtime requests, 900×700 and 600×600 overflow and scrolling, optional onboarding skip/customization, visible forward action at 600×600, configuration available afterward in Settings |
| Actual packaged Windows app | 81 checks passed | Fresh isolated onboarding, explicit agreement in step 2, step 3 entry without customization or permission grants, all 19 native backgrounds/captions, transient native preview, encrypted key setup, real OpenCode/NVIDIA chat and history, actual light/dark widget panel colors, read-only companion bridges, pet actions, Unicode selected-file task, dependent workflow, restart persistence and clean shutdown |
| Delivered portable EXE | 12 checks passed | Copied to an unrelated fresh directory, self-extraction, bundled resource identity, backend/memory model, provider setup and normal exit |
| Setup EXE | Exit 0; 3008 installed files verified | Silent installation into an isolated workspace folder; installed backend, app archive, OpenCode/runtime bootstrap, original theme files and theme license match the qualified payload |
| Static packaged checks | 77 passed | Version, isolated preload, CSP, no generic IPC, resource manifests, model, notices, theme source hashes and identity of actual acceptance archive |

The full backend suite was not rerun for this renderer/main-process change. Python source in `wayfinder`, `memory` and `desktop-app/backend` is unchanged from `341b655`; preview.6's 668 passed / 1 skipped / 4 deselected remain inherited evidence. The live packaged backend and task paths above were rerun for this exact archive.

Raw results and screenshots are retained locally in `desktop-app/test-results/` and `.local/verification/`; the release verification JSON publishes the relevant checks and hashes. Research scope and original source provenance are in [THEMES-SETTINGS-REA.md](THEMES-SETTINGS-REA.md). Original MIT theme files and license are included in both installers. Codex assets are not bundled.

Native desktop UI automation was unavailable. The app was exercised through its own hidden Electron renderer and main process, plus headless Chromium fixtures; this does not certify OS-level hotkey interaction or Windows visual rendering. Google live consent and clean-PC Docker/virtualization/UAC/restart remain unqualified. Only NVIDIA used a live provider account; other provider protocol evidence is inherited from preview.6's local fixtures. Existing user data was preserved; isolated test secrets were removed. Broader rebuild limitations remain documented in the release notes.
