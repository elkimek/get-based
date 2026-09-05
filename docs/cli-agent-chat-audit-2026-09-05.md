# CLI providers and chat audit — 2026-09-05

## Scope and outcome

Reviewed the unmerged `codex/agent-chat` feature against local `main`
(`331112b1`): CLI providers, companion lifecycle, tools and consent, gateway
routes, catalogs and reasoning, feature inference, attachments, chat layout and
identity, thread/project persistence, voice routing, and release safeguards.
The starting branch diff covered 246 files. This is an engineering audit, not
legal clearance or certification that every upstream model/OS combination works.

Reproduced defects were fixed and regression-tested. No merge, push, or public
deployment was performed. The local app remains available on port 8000.

## Findings fixed

| Area | Finding and correction |
| --- | --- |
| Windows CLI launch | Resolved npm shim entry-point arguments were lost for Codex, Claude, and OpenClaw. Preserve them before adapter flags; retain required Windows environment keys in Codex's isolated environment. |
| Process restart | Late output/exit from an old Codex or ACP child could clear a replacement client's state. Ignore events from superseded children. |
| Profile isolation | An asynchronous browser tool could return data after the active profile changed. Recheck the profile boundary after awaiting the handler. |
| Startup concurrency | Management actions and duplicate resumed turns could race adapter initialization. Reserve turns before asynchronous startup; release reservations and abort listeners exactly once. |
| Session recovery | A failed ACP resume created a fresh session without visible conversation history. Replay browser-owned history and report the session as fresh. |
| Cancellation cleanup | Repeated external-turn cleanup could interfere with a later turn. Make cleanup idempotent. |
| Grok tools | A live request was cancelled because the adapter denied permission for getbased MCP tools. Grant only exact active-turn getbased tools once; continue denying unrelated tools and revoke on cancellation/completion. |
| Companion compatibility | General control support did not prove support for restarting the companion. Add a separate restart capability and show update recovery for older installed bundles. |
| macOS first start | In-app installation could write a LaunchAgent without loading it, causing restart to fail. Bootstrap an unloaded service before kickstart. |
| Discovery | Remote Hermes target enumeration could exceed the browser's short discovery timeout and hide functioning local agents. Keep discovery independent of `/v1/targets`. |
| Feature inference | Background vision/feature requests forced low reasoning or reread a different selected agent after an await. Capture the route/model/effort and respect saved/default reasoning. |
| Model catalogs | ACP and OpenClaw refresh could return cached catalogs. Refresh the underlying catalog; reject removed ACP model-state selections instead of silently using a different model. |
| Chat composition | The cold-start context fallback introduced a 66-module dependency cycle. Move loading to app composition and reuse the existing lazy loader. Architecture now reports zero cyclic modules; startup remains within the unchanged budget. |

## Verification

- 430 unit/integration tests passed across 44 change-related files. These cover
  provider/voice contracts, reasoning preferences, consent, tool authorization,
  transport/uploads, lifecycle, platform installers, storage/sync, and production
  packaging. The final permission-cancellation refinement also passed its
  focused 9-test ACP rerun.
- Targeted Chromium checks passed for provider settings, model/reasoning menus,
  thread/project management, chat resizing, identity/thinking copy, attachments,
  provider live refresh, reopening an active stream, incoming chat sync, and
  cold-start context access. One Firefox demo/navigation/settings smoke passed.
- Server, checked browser JavaScript, and service-worker type checks passed.
  Quality guardrails passed 17/17; supply-chain inventory passed. Architecture:
  750 modules, zero cycles. Companion bundle and production budget checks passed.
- Live synthetic requests through Codex, OpenCode, Hermes, Grok, and OpenClaw
  each invoked `getbased_lab_context` and returned a made-up verification marker.
  No personal health data was used. Grok failed before the permission fix and
  passed after it.
- Live catalog endpoints succeeded for all five enabled adapters. At audit time,
  OpenCode exposed OpenRouter's GPT-6 Astra entries; the installed Codex and
  Hermes catalogs did not. Model availability must follow the actual harness
  catalog, not a hard-coded assumption based on another application's models.

## Remaining release checks and boundaries

- Native Windows and macOS installation, startup, tray, update, restart, and
  uninstall still need acceptance tests on those OSes. Linux command-fixture
  tests cannot establish native OS behavior.
- Exhaustive Chromium/coverage matrices belong to CI under repository policy;
  they were not run locally. Safari and physical mobile devices were not tested.
- Not every paid model, provider account, remote gateway configuration, vision
  model, or device audio backend was exercised live. Unit contracts and browser
  fixtures are not substitutes for those account/device acceptance tests.
- Remote personal agents may have their own tools and identity. Available tools
  and structured mutation support differ by adapter/target; the existing
  architecture capability table remains the source for those boundaries.
- Existing encrypted-storage and sync tests passed, including incoming chat
  state. A real multi-device relay/backup restoration drill was not performed.
- Browser/desktop file-access restrictions remain outside the application's
  control; unreadable drops retain the file-picker recovery path. The focused
  tests do not prove every desktop compositor's native drag-and-drop behavior.
- Claude remains disabled by default and requires the explicit API/Console
  self-hosting opt-in. No Claude subscription was used in live verification.
  Existing branding/release-policy tests passed; this audit does not replace
  the previously documented legal/brand review or provider approval.
