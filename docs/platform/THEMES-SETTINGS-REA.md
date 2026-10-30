# VS Code themes and Codex settings research

Research date: 2026-10-30. Wayfinder implements its own settings UI and reuses MIT-licensed VS Code color-theme data. Proprietary Codex assets are research references only.

| Reference | Scope | Completed REA evidence |
| --- | --- | --- |
| VS Code 1.144.0, commit `2c33b50b16c472efe58357d1d2a8a5414bc23fbf` | Four selected official source files: both onboarding theme-preview components, the theme picker and theme-data inheritance | `ev_b58ba208e33b0fcf96fd5508e0d2e05de1c0b04ec78301c0f4f925ff5e02e7d3`, 7.61 seconds |
| Codex app 26.1021.31345 / MSIX 26.1021.3705.0 | Four retained shipped JavaScript assets: appearance settings, two theme adapters and style variables | `ev_887bff55bdec7f0457832fc6ef7b86623095d85c418a2e817dddb67ecff56b1d`, 8.55 seconds |

[Evidence record](THEMES-SETTINGS-REA-EVIDENCE.json) contains selected hashes, scope, statistics and limitations. Full local evidence is retained in `.local/theme-research/`. The first sandboxed attempts stopped at REA's Windows runtime self-test; the completed read-only runs used access to the required runtime test directory. No target application was executed by REA.

VS Code is not installed in the accessible filesystem. Its stable update metadata supplied the version and commit; selected source and all theme definitions came from the official Microsoft repository. The previously inspected Codex MSIX is no longer present, and native desktop access is unavailable. The user explicitly selected retained, hash-verified assets plus official settings documentation. The original archive was not revalidated in this run, and this research does not claim a fresh observation of the current Codex window or its complete navigation shell.

## Findings applied to Wayfinder

VS Code's onboarding source presents four theme-preview cards, including high-contrast choices, plus a path to the full picker. The picker separates transient preview from applying a preference and restores the prior theme when cancelled. Theme files can inherit workbench colors and syntax styles. Built-in color themes include Light/Dark 2026, Modern, Dark+/Light+, Visual Studio, Abyss, Kimbie, Monokai, Quiet Light, Red, Solarized and Tomorrow Night Blue: 19 palettes in this pinned version.

Wayfinder shows four preview cards inside the optional **Customize now** area of onboarding step 3. Users can enter the app with defaults and change these choices later in Settings. Its complete picker supports theme search, light/dark/high-contrast filters, keyboard navigation, live preview, apply and cancel. Cancel and Escape restore the committed theme. Preferences support System, Light and Dark, with independently chosen preferred light and dark palettes. Main-window caption colors and companion chat follow the saved preference. The extra application menu strip remains removed.

Retained Codex modules expose centralized light/dark preferences, queued writes, transient snapshots and failure recovery. The selected modules concern appearance; they do not establish the complete current settings navigation. Official settings documentation describes scheme selection, a preview and appearance controls. Wayfinder independently implements a category list and a focused content panel with search: General, Appearance, AI provider, Connections, Permissions, Desktop companions, Privacy/runtime and About. It preserves existing actions and permissions, and does not add nonfunctional settings for unavailable capabilities.

Appearance preferences are validated and atomically stored by Electron main in `appearance-v1.json`. The renderer cannot supply arbitrary CSS, filesystem paths or native colors. It selects catalog IDs. Only the trusted main frame can save or preview. The widget and pet receive read-only appearance bridges and have no appearance-write access. Failed saves preserve the committed preference and restore the preview. Existing light/dark localStorage preferences migrate once when no main-owned preference exists; saved model keys, conversations and permissions are separate.

## Theme data and licensing

Original theme JSON files and their inheritance are included under `desktop-app/resources/themes/vscode/`. The provenance file records the pinned commit, source paths, SHA-256 values and semantic mapping. The Microsoft MIT license is included under `desktop-app/resources/licenses/VSCode-Themes-LICENSE.txt`. No VS Code application code or Codex assets are bundled as runtime UI code.

Wayfinder maps editor/workbench surfaces, text, focus, controls and title-bar colors to its semantic tokens. Missing colors use the applicable VS Code defaults, including the high-contrast border and input defaults. Where a description color has insufficient contrast on the app surface, Wayfinder uses that theme's foreground. Code-preview colors come from inherited theme rules. This is a palette adaptation for Wayfinder, not a complete VS Code editor or a claim of pixel-for-pixel identity.

References: [VS Code themes](https://code.visualstudio.com/docs/configure/themes), [pinned onboarding previews](https://github.com/microsoft/vscode/blob/2c33b50b16c472efe58357d1d2a8a5414bc23fbf/src/vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker.ts), [pinned theme picker](https://github.com/microsoft/vscode/blob/2c33b50b16c472efe58357d1d2a8a5414bc23fbf/src/vs/workbench/contrib/themes/browser/themes.contribution.ts), [official settings documentation](https://learn.chatgpt.com/docs/reference/settings), [earlier Codex artifact investigation](../research/wayfinder-rebuild/codex.md).

Validation is reported separately in [THEMES-SETTINGS-VALIDATION.md](THEMES-SETTINGS-VALIDATION.md).
