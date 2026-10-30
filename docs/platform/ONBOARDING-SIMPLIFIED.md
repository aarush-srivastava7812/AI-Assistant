# Optional onboarding — updated preview.7

Step 3 previously mixed required model approval with workspace naming, 19 themes, companion switches, agents, folders and account setup. Users had to find and accept a long consent checkbox before the final button became available.

Step 3 now presents a short ready screen with two choices: **Open Wayfinder** with defaults, or **Customize now (optional)**. The initial workspace is Personal and appearance follows the existing default preference. Optional controls are not loaded until customization is expanded. Browsing those controls does not grant permissions. A pending optional-settings read does not prevent opening the workspace; an explicit permission write finishes before proceeding.

AI disclosure and approval sit beside the verified model in step 2. **Agree and continue** approves only the displayed connection. A changed or expired connection needs a fresh review; the trusted main process still validates setup. The local database/model checks remain prerequisites for the existing runtime. Step 3's forward action returns users to the needed setup page when a prerequisite is missing instead of presenting an unexplained disabled button.

Settings remains the place to configure everything deferred from step 3:

| Configuration | Settings category |
| --- | --- |
| Theme, System/Light/Dark, reading size | Appearance |
| Pet and chat widget | Desktop companions |
| Agents and allowed folders | Permissions |
| Google and optional account imports | Connections |
| Provider, API key and model | AI provider |

Small windows use a single-column layout. Changing steps resets the onboarding scroll position. The step 3 forward action remains visible with customization expanded, including at the minimum 600×600 window size.

The version and public filenames remain **0.5.0-preview.7**. Both local EXEs and the six assets on the existing GitHub release are replaced after fresh verification. The release tag is moved to the revised qualified source; earlier preview.7 bytes and metadata are retained in an ignored local backup. No new preview or release is created. Current checksums distinguish this revision from the earlier build. Existing user profiles are preserved.

[Validation and exact EXE identities](THEMES-SETTINGS-VALIDATION.md) · [Download instructions](../../desktop-app/release/START-HERE-0.5.0-preview.7.md)
