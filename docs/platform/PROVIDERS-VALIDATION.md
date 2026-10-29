# Provider onboarding validation — 0.5.0-preview.6

Completed 2026-10-30 (local date). Release identities and individual checks are in [the verification record](../../desktop-app/release/Wayfinder-0.5.0-preview.6-verification.json). [Download instructions](../../desktop-app/release/START-HERE-0.5.0-preview.6.md) and [REA research](OPENCODE-PROVIDERS-REA.md).

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Frontend | 137 passed |
| Full backend suite | 668 passed, 1 skipped, 4 deselected |
| Focused provider / worker wire tests after the final fix | 39 passed, including 2 new legacy-code-page regressions |
| Actual bundled OpenCode transports, local protocol fixtures | 5 passed: NVIDIA-compatible, OpenAI Responses, Anthropic Messages, Gemini native, MiniMax Messages |
| Actual packaged app, real NVIDIA inference | 53 passed |
| Delivered portable EXE from an unrelated temporary directory | 11 passed; 2,979 extracted resources verified |
| Static source / manifest / payload pairing | 55 passed |
| Actual Setup installation | Exit 0; 2,987 installed files matched the qualified payload |

The packaged checks verify the removed menu strip, light caption, all 19 provider choices, real encrypted key storage, real OpenCode chat and bounded history, optional companions, native Hermes source tasks and a dependent workflow, Unicode replies, restart persistence, Settings model setup, saved-key reuse, renewed consent, preservation of spaces/conversations and normal shutdown with the owned database stopped.

EXE testing found a native Windows protocol defect: the worker emitted unescaped Unicode using its stdout code page, while the parent parsed UTF-8. One candidate produced UnicodeDecodeError; an earlier candidate exited without a valid worker reply. The runner now emits ASCII JSON escapes. Its actual output block passes with cp1252 and ASCII stdout using accented text, Chinese and emoji. The final EXE passed a real multilingual model reply and the complete workflow. The earlier generic exit was not independently diagnosed beyond its transport failure.

No real developer key is bundled or committed. The authorized NVIDIA test key was supplied only through private test environments, saved to isolated Windows-encrypted profiles and removed from those test profiles afterward. Changed source and the application archive were checked for the real key before publication. Existing normal-user onboarding progress was preserved.

These results do not certify live access for every vendor, subscription OAuth, AWS/Vertex/Azure authentication, Google account consent, a clean-PC Docker/reboot path or native hotkey interaction. Model suggestions are examples, not live account inventories. The installer was tested on this existing Windows laptop with Docker and the private runtime already available. Hidden-window tests verify application behavior and caption configuration; they do not constitute manual visual acceptance. The broader product rebuild remains unfinished.
