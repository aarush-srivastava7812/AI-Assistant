# Wayfinder: phased app and agent integration plan

Latest execution: [Checkpoint 3](REBUILD-CHECKPOINT-03.md), 0.5.0-preview.3. Selected-source preset integration and EXE verification progressed; the full rebuild and a graph-lease regression remain open.

Implementation update: [Checkpoint 1 — tested preview and remaining work](REBUILD-CHECKPOINT-01.md). The original plan below remains the full target; this checkpoint does not complete it.

Date: 27 October 2026. Baseline: main `47f0dca`, desktop 0.4.1. Status: **implementation in progress; preview 1 UI rejected, Codex-informed revision under verification**.

This is the execution plan for the user's expanded request: connect Wayfinder's planned agents, improve the chatbot and workflows, redesign the UI/UX and onboarding, and deliver a Windows executable for direct inspection. It supersedes the narrower UI-only scope of the earlier adaptation plan. Existing native-testing restrictions, provider approvals and the decision to defer fitness remain in force.

Current implementation: [Checkpoint 2 — Codex-informed chat and theme](REBUILD-CHECKPOINT-02.md).

Current UI repair gate: [Codex REA revision and cross-plan acceptance rules](CODEX-REA-UX-REVISION.md).

## 1. Working documents and execution rule

- [Atomic backlog](WAYFINDER-REBUILD-TASKS.csv): **95 separately identified tasks**, with dependency, target, verification family, acceptance criterion, human gate and status. There are 91 tasks across P01–P14 and four conditional X01 tasks.
- [Test and phase-gate specification](WAYFINDER-REBUILD-TESTS.md): T01–T17, meaningful scenarios, existing commands and evidence requirements.
- [Fresh 47-role and 15-profile/preset audit](../research/wayfinder-rebuild/agent-readiness.md), with [machine-readable readiness](../research/wayfinder-rebuild/agent-readiness.json).
- [New reference research](../research/wayfinder-rebuild/README.md) and the earlier [six-product REA investigation](../research/desktop-reference-rea/README.md).

Complete a task, run its targeted verification, inspect the result, then integrate it. At the end of every phase, run its phase checks and relevant existing regressions. Record failures and fix them before activating dependent functionality. A UI screenshot, a registry entry or a successful build cannot substitute for execution evidence. Do not wait for human approval between ordinary reversible phases; request human action only at a real named dependency or effect boundary.

The backlog lists implementation work, not completed work. A phase can qualify a limited variant while recording another variant as blocked, but it cannot mark that blocked variant complete. The release manifest must tell the same story as the application.

P11.05 is conditional on enabling a live provider effect. Without its exact human authorization, keep that effect disabled, test its denial path and record live qualification as not run. This does not prevent testing or packaging unrelated read-only functionality, and it does not count the effect as delivered. The four X01 extension tasks are likewise outside an ungated core release.

## 2. Architecture that stays

| Concern | Reuse | Missing integration to add where demonstrated |
| --- | --- | --- |
| Reasoning, tools, skills, delegation | Installed Hermes and its SDK | Version-checked role dispatch, typed envelopes and permitted-tool adapters. No replacement agent loop. |
| Managed execution | Existing OpenShell/NemoClaw | Workspace/resource enforcement and qualified bindings; no new sandbox or desktop driver. |
| Discovery | Wayfinder Atlas | Operation-specific availability and runtime evidence. Search results remain candidates. |
| Persistent memory | Iron Web, existing query/conflict/maintenance APIs | Orchestrator-owned context and reviewed update paths. No second memory engine. |
| Workflows | Existing W05, W44, W47 infrastructure and Hermes execution | Definition/run persistence, dependency/state integration and result routing. This is trusted service bookkeeping, not a new agent framework. |
| Authorization | Existing final handlers, action gates, main-owned confirmation and receipts | Reuse exact binding/expiry/revocation/preconditions for additional qualified operations. |
| Desktop UI and packaging | Existing Electron/React, named preload/broker, frozen Python backend and electron-builder | Shared UI components, accurate states, complete flows and package verification. |
| Recurrence, when included | Installed Hermes scheduling | Scope/occurrence/approval adapter only after compatibility and lifecycle qualification. No homegrown clock scheduler. |

Runtime documentation is a discovery aid, not installed-version proof. Reinspect the actual Hermes SDK/tool schemas before implementing runtime changes, including streaming and delegation. Preserve the approved NVIDIA model policy. No silent provider, model, toolset, history or memory fallback is permitted.

## 3. Current gaps that determine the order

All 16 dedicated worker definitions are already merged locally; the older audit's “other branch” wording is historical. The fresh audit accounts for all W01–W47, including deterministic responsibilities. Ten still need an explicit definition/reuse mapping, five have metadata only, and several integrations remain partial.

The current app's executable profile variants are A01/A05/A06 selected-file tasks through W35. A07 points to the Memory view. All six app presets currently return unavailable. Manual Google/Tavily/Notion reads are genuine integrations, but they are not yet an agent workflow or authorization for disclosure to a model.

Chat is a separate bounded Hermes conversation service, currently without tools or automatic memory writes. Workflows expose one fixed document/memory recipe rather than a general builder. Onboarding bundles the backend/model but still depends on Docker and an existing managed Hermes installation. Several descriptions and status badges are stale or overbroad.

Therefore: fix contracts and truthfulness first; make onboarding/chat usable; qualify reusable worker/context/connector paths; connect task variants; then expose multi-step workflows and controlled effects. A polished graph editor must not precede a working execution contract.

## 4. Research-to-feature decisions

The earlier six references supplied desktop interaction, memory visibility and permission patterns. This pass added focused references for the uncovered chat/onboarding and workflow concerns:

| Concern | Reference and actual investigation | Adopt for Wayfinder |
| --- | --- | --- |
| Chat and first-run setup | Open WebUI 0.12.4 published wheel; actual REA on compiled frontend. Five smaller sources completed; the final large chat chunk timed out with partial Evidence preserved. The onboarding query did not prove a complete flow. | Staged first run, clear errors, capability-dependent controls, preserved drafts/scroll, and separate client cancellation/server stop states. |
| Workflow operations | n8n editor UI 2.45.4 published npm artifact; actual REA selected analysis plus narrower execution-preview analysis and caller queries. Static analyses succeeded; caller relationships remained unresolved. | Separate definition/version/run, inspect step data, read-only historical preview, explicit test mode, redaction and version-aware recovery. |
| Conversation continuity | Earlier AnythingLLM shipped-package REA | Existing Chat and in-app palette; no screenshot context or new global overlay. |
| Workspace/agent visibility | Earlier CLAI source plus native-artifact REA | Workspace-aware task and review views. Its native UI/enforcement remain unresolved; no security assumption based on import names. |
| Context and knowledge | Earlier Keel/Khoj investigations | Source pane, context provenance and explicit memory review; keep Iron Web. Khoj's investigated companion is historical. |
| Permission lifecycle | Earlier Handrail/Hearth REA | Request identity, distinct states and readable pending reviews. Reject plaintext fallback, credentials in renderer settings, Enter-to-approve and truncated exact payloads. |
| Icons and assets | Official Lucide React/accessibility documentation, existing installed icons; optional stock-source terms | Consistent local SVG icons, accessible names and optional locally bundled licensed artwork. These docs are design/package guidance, not REA runtime proof. |

Do not import these products' engines, model catalogues, credential systems, arbitrary shell tools, voice, capture, permanent agent fleets or automatic memory behavior. n8n-style generic retries must not replay Wayfinder's uncertain effects. A successful reference analysis does not certify Wayfinder's future implementation.

Sources: [Open WebUI chat](https://docs.openwebui.com/features/chat-conversations/chat-features/), [setup](https://docs.openwebui.com/getting-started/quick-start/), [n8n execution types](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions.md), [execution history](https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions.md), [Lucide React](https://lucide.dev/guide/react/), [icon accessibility](https://lucide.dev/how-to/accessibility), [Unsplash terms](https://unsplash.com/license). Research reports retain the exact artifact versions, hashes, commands, Evidence IDs and limits.

## 5. Product and visual design

Use one main assistant and task-oriented entry points. Users should ask for an outcome or select an app/task preset; they should not need to choose W-worker IDs. Technical worker details stay available under execution evidence and Capabilities.

Retain the existing destinations, grouped as:

- Work: Home, Chat, Documents, Memory, Agents & apps.
- Execute: Workflows/Runs, Connections, Local Git.
- Control: Permissions, Capabilities, Settings.

Keep existing route identities where possible. Add workflow definition/run subviews only when their service contracts pass. The header always identifies the current space; an optional source/run inspector sits beside the work and becomes an accessible drawer on smaller windows.

Visual direction: lighter, calmer content surfaces with a dark option, clear typography and more purposeful color. Proposed tokens include cobalt for primary actions, teal for knowledge/context, violet for agent identity, green for verified completion, amber for attention/uncertainty and red for failure/revocation. Validate actual foreground/background combinations; color never carries state alone. Preserve the project's local fonts and use monospace mainly for code and technical identifiers.

Reuse Lucide for navigation, actions and the eight task profiles. Add original vetted compass/source/workflow SVG illustrations for onboarding and empty states. Optional stock artwork belongs on welcome/Home only where useful, with origin, author, applicable terms and checksum recorded. Bundle selected assets locally; no runtime stock-image requests, tracking URLs, copied product screenshots or remote fonts. Do not render arbitrary model/provider SVG or HTML as trusted UI.

Every important view needs loading, ready, stale, empty, denied, disconnected, interrupted, failed and uncertain states. Give each a clear next action. Do not invent task activity, percentages, citations, cost, tokens or capability checks for appearance.

## 6. Agent and app coverage

M00 owns conversation/task routing and final synthesis. W01–W47 remain reusable logical roles or deterministic services, not 47 permanent processes. One lead owns a task; helpers are bounded and only receive necessary context/tools. Tool sharing between agents does not share grants or credentials.

| Profile | Target qualified workflow | Important boundary |
| --- | --- | --- |
| A01 Research & Verification | Supplied sources and qualified public/source search → evidence → comparison/synthesis | Retrieval permission is separate from publishing or unrestricted browsing. |
| A02 Planning & Productivity | Selected calendar/tasks/commitments → feasible plan | A plan is not a calendar write or scheduled reminder. |
| A03 Communications | Selected messages → commitments/local draft → optional separately approved send | Message bodies/attachments and sends have distinct supported scopes. |
| A04 Software Development | Scoped repository → investigate/plan/review → qualified edit/test/Git stages | No general host shell or implicit push/merge. |
| A05 Knowledge & Learning | Authorized sources → explanation/study guide/report | Attributed evidence, no invented citations or duplicate memory store. |
| A06 Files & Desktop | Scoped discovery/document analysis; separately qualified image/planning variants | W37 native actions remain disabled until explicitly re-enabled and genuinely qualified. |
| A07 Memory & Personalization | Scoped recall → proposed correction/preference/conflict/maintenance review | Only trusted services access Iron Web or approve updates. |
| A08 Fitness & Habits | Deferred supported-source integration; canonical local CSV remains separate | Preserve the user's “fitness later” decision. |

P01 Google Workspace, P02 Gmail, P03 Calendar & Tasks, P04 Notion, P05 GitHub and P06 Drive/Docs/Sheets each get a separate backlog task and acceptance scenario. Availability is by operation/variant: manual reads, metadata reads, content reads, drafting and writes must not collapse into one green “connected agent” badge. A Google Workspace variant should require only the services that task actually uses, rather than demanding every Google scope.

The exact 47-role ledger supplies missing contracts, reuse mappings, owners and gates. Worker-configuration work belongs in that lane; integration supplies stable contracts and synthetic fixtures rather than silently replacing the other developer's prompts. Required missing fragments block the dependent variant, while unrelated implementation can continue.

## 7. Chat and workflow behavior

Chat must first work well as conversation: stable history, usable composer, safe Markdown/code/tables, actionable errors and accurate stop/reconnect behavior. Only expose token streaming if the installed Hermes path supplies verified events; otherwise show real stages and the final response. Do not display hidden model reasoning as an execution log.

Task mode then uses the same trusted routing as Agents/Workflows. A request becomes an explicit finite plan with required context, capable handlers and a result expectation. Plain conversation does not silently acquire tools or private-source access. Source chips represent references actually accepted by the service, not attachments only drawn in the renderer.

Workflow v1 uses allowlisted existing project steps, typed inputs/outputs and immutable definition versions. The editor starts with supported recipes and step forms; its SVG graph is a view of validated data. A run freezes its definition/version, scope, source identities, bindings and approval digests. Draft edits cannot mutate a running or historical attempt.

Initial proposed limits are a small finite DAG, two active model leaf jobs, one qualified helper level and explicit run/step deadlines. Exact configurable bounds are finalized against installed Hermes and current service limits in P01/P09 and contract-tested. Reject cycles, unknown nodes, arbitrary code/URLs and edges crossing scope. Add only missing dependency/persistence enforcement to the existing coordinator.

Provide node input/output, provenance, redaction, failure and audit inspection. Synthetic test data is visibly isolated and cannot enter live runs. A test-node button cannot bypass effects policy. Reconnect observes an existing run; uncertain outcomes offer read-only reconciliation. Retry requires eligibility and a new attempt; edited parameters require a new proposal and approval.

## 8. Phase sequence and test gates

| Phase | Atomic tasks | Deliverable | Exit gate before activation |
| --- | ---: | --- | --- |
| Research | Completed in this planning turn | Eight reference investigations in total, fresh role audit, backlog and test specification | Evidence tiers/limits and remaining gaps are explicit. This is not an app test pass. |
| P01 Contracts/runtime truth | 6 | Versioned contracts, accurate capability matrix and installed SDK qualification | T01–T03/T15: no mismatch between service, manifest and UI; migration checked in disposable storage. |
| P02 Visual system/assets | 6 | Tokens, icons/SVGs, shared components, responsive shell | T04/T05: accessibility, safe assets and no renderer remote dependencies. |
| P03 Onboarding | 6 | Resumable required checks and optional connections; first-success path | T06/T07: failure/restart/stale-consent cases pass; prerequisites are never silently installed or reported ready. |
| P04 Chatbot | 7 | Reliable conversation UX, safe formatting and real lifecycle states | T03/T05/T07: duplicate, cancellation, scope-switch and reconnect checks pass. |
| P05 Worker/routing integration | 6 | Role ledger, existing definitions, deterministic reuse and M00 route | T02/T08: actual binding/isolation/contracts pass; unavailable roles cannot dispatch. |
| P06 Files/memory/context | 5 | Attributed source context, reviewed memory, useful evidence UI | T09/T10: stale/revoked inputs and changed approvals fail closed; no worker storage access. |
| P07 Provider adapters | 7 | Bounded current/manual and task-context provider variants | T11: scope, identity, truncation, rotation and revocation; live status only after the applicable authorized check. |
| P08 Task profiles/app presets | 14 | One reviewed activation/test decision for every A/P entry | T12: each enabled variant has an actual scenario; missing access remains explicit rather than falling back. |
| P09 Workflow infrastructure | 7 | Immutable finite workflows, dependency dispatch, persistence/recovery | T13/T14: cancellation, restart, duplicate delivery, budgets and uncertain effects behave correctly. |
| P10 Workflow/chat task UX | 6 | Recipe/definition editor, run history, node inspector and task mode | T04/T13/T14: UI mirrors service state; drafts/test mode cannot grant or execute. |
| P11 Approvals/controlled effects | 6 | Full exact review, scoped coding/effect paths, audit/reconciliation | T10/T14/T16: every enabled effect qualified independently; unapproved live effects stay disabled. |
| P12 Reliability/UX qualification | 6 | Cross-profile, security, failure, real-Hermes and accessibility evidence | Relevant targeted tests plus meaningful final regressions pass; limitations retained. |
| P13 Executable | 6 | Exact versioned portable EXE, checksum and release verification | T15: bundled/source identities and privacy checks pass; no development checkout/Python needed. |
| P14 Your direct EXE check | 3 | First-run and everyday-task acceptance on the exact candidate | T17: acceptance recorded by the user; defects reopen the relevant phase. |
| X01 Conditional extensions | 4 | Qualified recurrence, image/planning/native variants and fitness only as applicable | Separate compatibility, account/model and explicit native/source gates. Never assumed part of the core pass. |

The CSV defines the individual changes and task-level acceptance, not just these phase headings. Its default dependency chain gives a safe sequential execution order. Independent work may run in separate files/worktrees after the common contract gate, but no dependent feature is enabled before its tests pass.

## 9. Onboarding and executable expectations

Onboarding should read: Welcome → Check this laptop → Verify local memory → Verify the approved model → Create space/consent → Optional connections → First task. Each stage has observed progress, one appropriate recovery action and resumable state. Provider import may be skipped; missing infrastructure required by AppService cannot be hidden behind a successful finish screen.

Keep local Docker ownership checks, the pinned image, private database credentials, stable application-data root and current Windows vault. Downloads remain explicit user actions where required. Show the actual model destination before consent; a changed binding invalidates that consent/check. Do not ask for credentials in chat or import them into prompts.

The final EXE bundles the existing Python backend, public memory model, contracts, fonts, icons and local artwork. It must launch without a development checkout or system Python, but Docker Desktop and the configured Hermes/OpenShell environment remain honest prerequisites unless separately scoped installation work is approved. Moving the EXE must not create a silent empty workspace or lose connections. Record the source commit, binary SHA-256, signing state, compatible data schema and remaining limitations.

The existing terminal-only rule still applies to agent-run testing. Component, contract, Node/backend, static package and synthetic data checks can proceed. Native dialogs/windows, desktop capture, clipboard inspection and W37 automation require explicit re-enablement. Your planned direct EXE walkthrough is the final human acceptance step, not permission for us to begin desktop automation now.

## 10. Human dependencies and completion truth

| Gate | Needed only when | What is requested |
| --- | --- | --- |
| H-READ | An enabled variant needs unavailable account/repository access or additional scope | Select the account/resource and complete the provider's own consent flow; first reuse valid existing connections. No secrets in chat. |
| H-WRITE | Enabling a live send, calendar/task/page change or hosted Git effect | Approve the exact disposable target/payload after fixture and contract checks; independently verify its receipt. |
| H-DESKTOP | Actual native testing/W37 or a new image-model binding is required | Explicitly re-enable that scope and choose the permitted target/model; reconcile the prior W37 uncertainty first. |
| H-FITNESS | Activating fitness beyond canonical local CSV | Choose a supported source and authorize it. Currently deferred. |
| H-EXE | Candidate has passed the permitted automated/static gates | Open that exact EXE and complete the supplied first-run and task walkthrough. |

“All agents connected” is only true after the required contracts, capability bindings, permissions and end-to-end tests are satisfied for their variants. Disabled or deferred entries are accounted for, not counted as completed. A useful core EXE can be delivered with accurately gated provider writes, W37 and fitness; it must not be advertised as completing those integrations. If the requested full scope requires one of these gates, report that dependency instead of silently shrinking scope or inventing success.

Each phase report records: reused components and why, code/interfaces changed, tests actually run and outcomes, evidence paths/hashes, remaining limitations, and the next task. This planning turn ran research tools and document validation only; no product code, new workflow, provider permission or executable was changed.
