# Wayfinder desktop 0.5.0-preview.6

[Download and setup](release/START-HERE-0.5.0-preview.6.md). The app bundles OpenCode for chat and supports 18 named API-key providers plus custom HTTPS OpenAI-compatible endpoints. Keys are encrypted for the Windows account. The extra menu strip is removed; native caption controls and Settings > Quit Wayfinder remain.

Provider/model changes are available in Settings and preserve spaces and conversations while requiring new verification and consent. Pet, widget, agents, folder access and account connections are optional. Setup installs a private Hermes/Python task runtime and offers Docker Desktop installation.

[REA provider research](../docs/platform/OPENCODE-PROVIDERS-REA.md), [validation](../docs/platform/PROVIDERS-VALIDATION.md), [remaining rebuild work](../docs/platform/REBUILD-CHECKPOINT-03.md). The broader rebuild is unfinished. Hosted provider writes, recurring schedules and native desktop actions remain unavailable.

Use `npm run check`, `npm test -- --maxWorkers=1` and `npm run build` from this folder. `scripts/Test-Backend.ps1 -All` runs the full Python suite against a temporary owned Docker database. `scripts/verify-opencode-providers.py` exercises the actual bundled OpenCode SDK transports using local synthetic servers. Packaged EXE testing and real account qualification are separate from unit-test evidence.
