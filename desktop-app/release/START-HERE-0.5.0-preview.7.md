# Wayfinder 0.5.0-preview.7

Download **Wayfinder-Setup-0.5.0-preview.7-Windows-x64.exe** and run it on Windows x64. Setup installs the private task runtime and offers Docker Desktop installation if needed. Complete any Docker license, Windows permission and restart prompts, then reopen Wayfinder. Use **Install / repair required software** if setup was interrupted.

1. Start Docker Desktop with its local Linux engine. Prepare Wayfinder's private database and verify the included memory model.
2. Choose your AI provider, paste its API key and select a model. Use **Get an API key** to open the selected provider's official console. Use **Enter another model ID** for a model specific to your account.
3. Click **Connect and verify**. The key is encrypted for your Windows account. A short test prompt goes to the selected provider; documents and history are excluded from that check. Accept the displayed connection before opening your workspace.
4. Choose your appearance using the four onboarding previews or **Browse all 19 themes**. System follows your Windows light/dark preference. Theme choices include the built-in VS Code Modern, 2026, classic and high-contrast palettes.
5. Choose the optional pet, widget, agents, folders and account connections. They default off. Google currently requires your own Desktop OAuth client JSON and browser consent.

Supported API-key connections: OpenAI, Anthropic, Google Gemini, OpenRouter, NVIDIA, DeepSeek, Groq, xAI, Mistral, Together AI, Fireworks AI, Cerebras, Perplexity, Moonshot/Kimi, Z.AI, DeepInfra, Alibaba/Qwen, MiniMax, and custom HTTPS OpenAI-compatible Chat Completions endpoints. You only need one provider. Model suggestions come from the pinned OpenCode catalog; your provider must grant access to the chosen model. Subscription OAuth, AWS IAM, Vertex service accounts and Azure deployment authentication are separate methods and are not implemented by this API-key picker.

Chat uses bundled OpenCode with your selected provider. The app includes no developer API key. Optional source workers use Hermes. Prompts and recent conversation history go to your selected provider when you send a message. Chat has no tools and does not automatically publish memory.

Use **Settings > AI provider > Change provider or model** to change connections. Saved spaces and conversations stay in place; setup requires fresh verification and consent. Existing encrypted NVIDIA profiles migrate without changing their original consent pin.

Use **Settings > Appearance** to change themes later. Search or filter the full picker, preview a theme, then Apply; Cancel or Escape restores the saved theme. Set preferred light and dark themes independently. The native caption, widget and pet controls follow the saved palette. Settings has searchable categories for appearance, AI, connections, permissions, companions and privacy.

The dark top menu strip is removed. Native window controls remain. Use **Settings > General > Quit Wayfinder** to quit when companions are enabled. Closing the main window hides it while a companion is enabled; with both off, closing exits normally. Pet, widget and agent toggles are in Settings. Turning agents off blocks new runs; use Stop for an existing run.

These are unsigned preview builds. Verify the attached SHA-256 and verification JSON. NVIDIA was exercised live; the other API formats were tested against local protocol fixtures. This is not live-account certification for every vendor. Clean-PC virtualization/reboot paths and live Google consent still need manual validation. The broader product rebuild, recurring schedules, provider writes and native desktop automation remain unfinished.
