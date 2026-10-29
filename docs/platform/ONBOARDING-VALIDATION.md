# Onboarding and OpenCode preview validation

Wayfinder 0.5.0-preview.5 adds an assisted Windows installer, user-supplied NVIDIA credentials, OpenCode chat, optional Google Desktop-client sign-in and persisted permission choices. Pet, widget and advisory agents default off. Settings can turn them off later; removing a saved folder clears active file grants.

Final verification:

| Check | Result |
| --- | --- |
| TypeScript check | Passed |
| Frontend suite | 116 passed |
| Complete backend suite | 648 passed, 1 skipped, 4 deselected |
| Actual hidden packaged app | 40 checks passed |
| Delivered portable EXE from an unrelated temporary directory | 11 checks passed; 2,975 extracted backend/model resources verified |
| Static package, source, manifest, notice and runtime identities | 49 checks passed |
| Actual NSIS Setup installation | Exit 0; 2,983 installed files matched the qualified payload |
| Real OpenCode/NVIDIA canary | Initial reply and exact restored-history reply completed |

The packaged-app test entered the authorized test key through onboarding, verified Windows-encrypted storage, prepared its own password-protected database, ran actual CPU memory inference, completed real OpenCode chat and bounded-history replies, used the same backend through the widget, denied agents before opt-in, completed native Hermes source tasks and a dependent workflow after opt-in, and verified that disabled pet/widget/agents stayed off after restart. It also checked that chat/tasks did not automatically publish memory. Test profiles and database containers were isolated; encrypted test key copies were removed after verification.

The normal `%APPDATA%\wayfinder-desktop` profile and its exact app-owned memory container/volume were permanently removed at the user's request. The default profile was still absent after installer and executable verification, so the next normal launch starts onboarding. The new private SDK runtime remains installed. Other Docker data, the managed developer environment and source repositories were preserved.

Limits: the laptop already had Docker. A clean Windows VM, missing-Docker license/UAC, virtualization/WSL enablement and restart paths were not interactively qualified. Google state/PKCE and client validation used local test fixtures; live account consent remains the user's action. Only Nemotron Lightning was tested live. The app is unsigned. Hidden-window checks do not establish native hotkey or visual acceptance. The full product rebuild remains unfinished.

Exact EXE sizes, SHA-256 values, individual checks and limits are in the [release verification record](../../desktop-app/release/Wayfinder-0.5.0-preview.5-verification.json). [REA research and evidence](ONBOARDING-RESEARCH.md), [source hashes](ONBOARDING-REA-EVIDENCE.json), [build instructions](ONBOARDING-BUILD.md) and [user instructions](../../desktop-app/release/START-HERE-0.5.0-preview.5.md) accompany the release.
