# Wayfinder 0.5.0-preview.5

Download **Wayfinder-Setup-0.5.0-preview.5-Windows-x64.exe** from this release and run it on Windows x64. The portable EXE is also attached; use Setup for the dependency installation flow.

1. Install Wayfinder. OpenCode is bundled for chat. Setup installs a private Python/Hermes runtime for source tasks and starts Docker Desktop installation if needed. Internet access is required. Complete Docker's license and Windows permission prompts; restart Windows if requested, then open Wayfinder again. If Windows App Installer/winget is missing, install Docker Desktop from its official website.
2. In onboarding, use **Install / repair required software** if installation was interrupted. Start Docker Desktop with its local Linux engine. Prepare the private database and verify the bundled memory model.
3. Enter your own NVIDIA API key and choose Nemotron Lightning or Ultra. Save it securely, then check the connection. The check sends a short test prompt to NVIDIA; no documents or history are sent. Read and accept the model disclosure before creating your workspace.
4. Choose whether to enable the desktop pet, chat widget and advisory task agents. They default off. Folder access and Google/Notion/Tavily connections are optional and can be skipped.
5. To connect Google, select a **Desktop** OAuth client JSON from your own Google Cloud project, choose read-only services, and complete Google consent in your browser. Enable the corresponding APIs and configure any required OAuth test users in that project. This preview does not include an app-owned Google OAuth client.

You can turn the pet, widget and agents off in **Settings → Permissions and desktop features**. Turning the widget off removes its window and Ctrl+Shift+Space shortcut. Removing a saved folder also clears active file grants. Turning agents off prevents new runs; use Stop to cancel an active run.

Chat runs through **OpenCode**, using your explicitly selected NVIDIA model, with no tools or automatic memory publication. Your key is required; a developer key is never included. Task agents use Hermes and require opt-in and source disclosure. Review memory changes separately. Closing the main window quits when both companion features are off; when either is enabled, use **Wayfinder → Quit** to stop the app and its owned database container. Older managed-provider setups must supply their own key in onboarding; existing spaces are preserved.

The app and its installer are unsigned previews. Check the attached SHA-256 and verification JSON. Docker's clean-PC installation, hardware virtualization and reboot path require user interaction and a suitable Windows installation; the attached evidence distinguishes what was actually tested. Native desktop automation, provider writes, recurring schedules and the full product rebuild remain unfinished.

Onboarding research: [REA report](https://github.com/aarush-srivastava7812/AI-Assistant/blob/main/docs/platform/ONBOARDING-RESEARCH.md).
