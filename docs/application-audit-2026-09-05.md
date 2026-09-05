# Application audit — 5 September 2026

## Scope and outcome

Risk-based engineering audit of the current `codex/agent-chat` worktree, starting at `7844eaf9`. This includes the CLI-provider work, chat redesign, dashboard layout, and their interactions with the wider application. Confirmed findings were fixed locally. Nothing was merged, pushed, or deployed.

This is not a claim that every line, model, account, operating system, or possible user journey has been exhaustively verified. Local verification followed `AGENTS.md`: focused suites, no complete browser/coverage matrix. GitHub Actions remains responsible for the exhaustive run.

The in-app changelog is now **1.19.0**, with a short overview of agents, personal gateways, model controls, chat projects and attachments, resizing, adaptive widgets, and voice routing. The current entry is separated from the historical archive to keep that module below its size limit.

## Findings fixed

| Area | Finding and correction |
| --- | --- |
| Profile isolation | Delayed thread-index/history reads, writes, search results, and project dialogs could finish against a newly selected profile. Operations now check their originating scope after asynchronous boundaries; superseded reads/searches are discarded. |
| Chat generation | A late response or consent decision could continue after a profile/conversation switch. Sending, streaming, typewriter callbacks, and final persistence now reject stale work. Cleanup belongs to its own generation, preserving newer work. |
| Summaries and dropped files | Summary streams/results and delayed file reads could cross profile boundaries. These now stop when their originating scope changes. Failed summary-index saves no longer leave a success-looking cached summary. |
| Offline use | The source service-worker shell omitted the two new dashboard modules. They and the newly extracted view/release modules are now included; dependency-graph and Firefox offline checks pass. |
| Settings accessibility | Repaired tab-panel IDs/roles, named unlabeled toggles, moved labels onto their actual inputs, kept Agent Access explanatory text readable when unavailable, and moved wearable action buttons outside interactive disclosure summaries. |
| Verification gaps | Fixed three strict-null regressions. Updated the HTML-writing inventory after reviewing changed rendering paths. The accessibility harness now opens Settings through its production lazy loader, verifies each panel is actually open, includes Voice, and fails on navigation/scan errors instead of silently skipping them. |
| Test reliability | Updated the extracted thread-view and summary-routing fixtures. The chat close/reopen fixture now seeds returning-user onboarding state before startup and waits for asynchronous Escape handling. |

The new profile-race tests first reproduced eight failures in the original code. The expanded suite now covers stale reads, writes, search, project rename/rollback, cancelled summaries, failed summary persistence, dropped files, and the successful unchanged-profile paths. Browser tests exercise the real chat controller/storage flow with controllable synthetic AI replies, including cancellation during consent.

## Verification performed

- Whole-source TypeScript checks: application, server, check-JS, service worker, and strict-null ratchet. Strict-null debt remains zero.
- Architecture: **754 modules, zero dependency cycles**.
- Quality gates: syntax, size limits, module boundaries, privacy-safe diagnostics, and pinned third-party Actions. No quality or accessibility baseline was relaxed.
- Security: proxy URL/redirect validation, caller-origin policy, rate limits, consent, profile sharing, Markdown injection defenses, tool/draft boundaries, and profile isolation through targeted tests and source inspection.
- Storage: encrypted chat index and message round trips, corrupt/locked storage protections, backup restoration, sync recovery and tombstones, profile deletion, and synthetic profile-share create/read/delete flows.
- Health workflows: representative tests for lab units/ranges, PDF import review and rollback, nutrition calculations/sync/save races, supplements, wearable summaries/disconnection, reports, Light context, and Biology context sync. This checks software behavior, not clinical validity or diagnostic accuracy.
- UI: model search and reasoning, provider catalog separation, personal gateway catalogs, chat projects/dragging, collapsed CLI settings, photo/file attachment flows, summary actions, desktop/mobile headings, dashboard geometry, and returning to an in-flight chat.
- Accessibility: axe scan of selected core pages/modals and **all seven Settings tabs**; the corrected scan passes the existing zero-critical/serious baseline. This is not a full screen-reader or assistive-technology certification.
- Firefox: demo navigation/settings, synthetic profile JSON export/import, and offline service-worker loading.
- Dependency inventory: 19 components covering 88 vendor files. `npm audit --json --ignore-scripts` reported **zero known vulnerabilities** across the reported 228 dependencies. This does not cover unknown vulnerabilities or independently installed agents.

More than 500 focused unit/runtime checks passed, alongside the scoped Chromium and Firefox browser checks and the legacy changelog/thread tests. Reproduced failures were rerun after their fixes; an initial loopback-server test failure was a sandbox permission issue and passed with loopback access. No paid inference, real funds, or user health records were used by these tests.

## Build budget

Startup remains **two JavaScript files, approximately 1,169 KiB decoded**; its budget is unchanged. New release copy, scope guards, and accessible markup add a small amount of lazy code. The total-output allowance was explicitly adjusted from 5,150,000 to 5,160,000 bytes and from 158 to 160 files, rather than removing safety checks to fit an exhausted allowance. Production build verification passes. These are decoded sizes, not compressed network transfer sizes.

## Before production

### PR review follow-up

The first independent review of PR #1612 found additional issues that the local audit had missed. They were not waived: the dev-server peer gate is now independent of its bind address; discovery credentials cannot invoke any lifecycle control; executable updates use a fixed official HTTPS URL with redirects refused and bounded reads; stale silent generations immediately release UI controls; unavailable CLI models cannot be sent; and Windows launchers preserve batch metacharacters. Companion version 1.2.2 contains these security changes; older running companions need an update.

File size checks now use the same open descriptor as reads, token creation handles competing exclusive creates without a check/write race, and arbitrary CLI error details are no longer serialized to the browser. Credential-bearing Hermes and dev-host HTTP requests refuse redirects. The intended credential flows remain limited to the configured Hermes gateway and numeric-loopback Companion respectively.

CI also exposed an untracked supplement-array mutation and premature chat deletion sync scheduling. Draft supplements now use the shared sync-aware helper; thread deletions persist locally without syncing, record the tombstone, and only then schedule sync. Legacy tests were updated to assert the provider-neutral feature-routing contract and shared runtime module boundaries; no assertion group or quality baseline was removed.

Discovery-only browser sessions intentionally show tray/terminal lifecycle guidance. They do not pretend to have installation authority or request a persistent installation secret from hosted pages.

1. Run the complete GitHub Actions browser and combined-coverage jobs on the final merge candidate. They were not launched by this local audit.
2. Perform native Windows and macOS Companion install/start/restart/pause/uninstall checks. Linux and browser emulation cannot establish those results.
3. Perform a real two-device encrypted-sync and backup/recovery drill with a disposable profile, including chat projects and attachments/imported records.
4. Smoke-test supported installed agents and personal gateways with the intended accounts/model entitlements. Mocked provider tests and earlier local live checks do not prove every current remote model or subscription works.
5. Keep the existing Claude distribution restrictions and unresolved brand/licensing approvals in place. This pass did not replace the earlier legal review or obtain new permissions.

The audit does not certify native OS drag-and-drop integrations, every live wearable OAuth flow, hosted infrastructure configuration, real-money wallet transfers, or every optional local voice model. Existing platform limitations and external release requirements remain explicit.
