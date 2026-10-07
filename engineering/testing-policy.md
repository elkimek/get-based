# Testing and critical-workflow policy

Function execution coverage and protection of user workflows are separate
forms of evidence. A high global percentage does not prove that every input,
branch, race, device, or provider works correctly.

## Choose checks for the change

Run relevant tests and lightweight compiler, architecture, quality, and build
checks locally. Use the commands in [CONTRIBUTING.md](../CONTRIBUTING.md).
Do not run the exhaustive browser or coverage matrix locally by default.

Pull requests use [the affected-test planner](../scripts/pr-test-scope.mts).
It follows imports and file references, transitive consumers, changed tests,
and deleted-module references. Shared dependencies and test-harness changes can
select a broader scope. A runtime module without selected test coverage blocks
the plan; unrelated tests cannot compensate for missing relevant tests.
The retained CI plan and job summary explain the selection.

PR tests do not ordinarily collect whole-project coverage. Main-branch pushes,
manual full test runs, and explicit release verification run the complete
regression suite, critical coverage gates, and combined production measurement.
A passing selective check is not a new whole-project coverage measurement.
The [Display pilot workflow](../.github/workflows/display-pilot.yml) provides
focused acceptance on its isolated branch without invoking the exhaustive suite;
full regression and combined-coverage requirements for release remain unchanged.

The [static SvelteKit bridge](static-sveltekit.md) has a local focused acceptance
command, `npm run test:sveltekit`, covering static aliases, CSP, delegated Display
preferences, offline first use, cold launch, stored data and explicit worker updates.
Headless launch environments cannot access the user's desktop session. Historical
size/cache ceilings are recorded for this local evaluation; quality, compiler and
coverage safety remain intact. The native production build keeps its budget gates.

## Behavioral requirements

Preserve independently failing assertions for these workflows:

| Workflow | Required behavior | Selected regression sources |
| --- | --- | --- |
| Lab import and restore | Reject invalid or duplicate mutations; retain units, provenance, and unrelated data; recover from failed writes | [Import integrity](../tests/import-data-integrity.test.ts), [provenance](../tests/import-provenance.test.ts) |
| Profiles and notes | Late work stays with its originating profile; failed reads block saves; drafts and records survive failed writes | [Profile races](../tests/chat-profile-races.test.ts), [profile persistence](../tests/profile-persistence.test.ts), [notes](../tests/notes-safety.test.ts) |
| Agent chat and proposals | Exercise the actual application and tools; keep retries bounded; retain uploads and journals; do not replay an uncertain mutation | [Agent workflow](../tests/playwright/agent-chat-workflow.spec.ts), [backend recovery](../tests/agent-chat-backend.test.ts), [draft persistence](../tests/agent-draft-persistence.test.ts) |
| Manual biometrics | Writes, deletions, and migration metadata remain scoped to the originating profile; failed deletion preserves rows | [Profile boundaries](../tests/manual-profile-boundaries.test.ts), [heart-rate deletion](../tests/manual-heart-rate-deletion.test.ts) |
| Agent Access migration | A failed encrypted profile write retains its original credential source through reload; another profile cannot consume it; cleanup follows confirmed persistence; new credentials never enter plaintext mirrors | [Encrypted storage recovery](../tests/agent-access-migration-recovery.test.ts), [origin ownership](../tests/settings-agent-access-origin.test.ts), [headless static PWA](../tests/pwa/sveltekit.spec.ts) |
| Security and Backup settings | Preserve encryption and backup explanations together; keep snapshot IDs and folder permissions; use keyboard-accessible restore controls; reject stale snapshot reads after remount; retain offline first use and encrypted cold-launch unlock | [Owned components](../tests/settings-protection.test.ts), [folder lifecycle](../tests/backup-folder-presentation.test.ts), [browser backup paths](../tests/playwright/backup-browser-coverage.spec.ts), [static PWA](../tests/pwa/sveltekit-protection.spec.ts) |
| PPQ accounts and funding | Preserve anonymous recovery credentials before encrypted storage, catalog or consent failures; reject stale account, invoice, QR and balance replies; keep keys and payment text out of nonsecret snapshots and clipboard attributes; enforce every payment-method minimum; preserve funded-account removal confirmation, private-model entitlement, cold launch and update consent | [Account lifecycle](../tests/ppq-account-controller.test.ts), [funding lifecycle](../tests/ppq-topup-controller.test.ts), [view ownership](../tests/ppq-settings-service-owner.test.ts), [private catalog](../tests/ppq-catalog-owner.test.ts), [owned browser UI](../tests/playwright/ppq-settings-owned.spec.ts), [static PWA](../tests/pwa/sveltekit-ppq-settings.spec.ts) |
| Wallet funding ownership | Preserve private invoice and token ports, original-mint quote identity, minimum whole-sat amounts, single-flight requests, paid/terminal QR guards, close/reopen recovery, cross-tab leadership, fee disclosures and encrypted cold launch; closing presentation must not stop wallet-wide reconciliation | [Owned component](../tests/wallet-funding-component.test.ts), [controller](../tests/wallet-funding-controller.test.ts), [invoice/recovery lifecycle](../tests/wallet-funding-service.test.ts), [background monitor](../tests/routstr-funding-monitor.test.ts), [theme/layout browser UI](../tests/playwright/wallet-funding-owned.spec.ts), [static PWA](../tests/pwa/sveltekit-wallet-funding.spec.ts) |
| CLI Settings ownership | Preserve setup/login/testing, agent and target-isolated model choices, direct/paused/outdated/linked/embedded companion management, bounded frame messages and credential-free UI; reject obsolete connection publication and late responses while allowing accepted writes and host actions to finish after close | [Owned panel](../tests/cli-agent-settings-component.test.ts), [action controller](../tests/cli-agent-settings-controller.test.ts), [connection publication](../tests/agent-connection-owner.test.ts), [management branches](../tests/cli-companion-ui.test.ts), [headless theme/layout controls](../tests/playwright/cli-agent-settings-owned.spec.ts), [static controls and cold launch](../tests/pwa/sveltekit-cli-agent-settings.spec.ts), [encrypted model choices](../tests/pwa/sveltekit-cli-agent-models.spec.ts) |
| Import Benchmarks ownership | Preserve report/protocol identity, raw versus corrected scoring, missing-value and percentage-point metrics, bounded difference review, locked answer keys and health records; accepted runs survive closure while obsolete confirmation/progress callbacks cannot update another view; native and static cached cold launch retain device-local history | [Owned runtime](../tests/settings-import-benchmark-controller-runtime.test.ts), [existing workflows and calculation parity](../tests/playwright/import-benchmarks.spec.ts), [headless theme/layout accessibility](../tests/playwright/import-benchmarks-owned.spec.ts), [static PWA history and health-data persistence](../tests/pwa/sveltekit-import-benchmarks.spec.ts) |
| Routstr shared actions and status | Preserve synchronous public controls, escaped attributes, first-click single dispatch and button identity through hydration; retain menu keyboard/outside behavior and reject removed/replaced/disposed owners; preserve node/mint/refund financial assertions, status typography, complete offline graph and both generated artifacts in coverage | [Action ownership](../tests/routstr-actions-component.test.ts), [status ownership](../tests/provider-status-component.test.ts), [build accounting](../tests/routstr-actions-build.test.ts), [real browser compatibility](../tests/playwright/routstr-actions-owned.spec.ts), [wallet and refund regression](../tests/playwright/cashu-wallet-browser-coverage.spec.ts), [static recovery](../tests/pwa/sveltekit-routstr-shell.spec.ts), [static node flow](../tests/pwa/sveltekit-wallet-node.spec.ts) |
| Routstr session connection | Keep draft tokens and session receipts behind private ports; preserve consent, original-node encrypted saves/removal, journal-before-payment, early recovery receipt, single-flight and 60-second clipboard clearing; reject stale views/accounts/drafts and malformed conversion keys without redeeming again; retain encrypted sessions and uncertain payment journals through cached cold launch | [Account ownership](../tests/routstr-account-controller.test.ts), [payment boundaries](../tests/routstr-security.test.ts), [original provider callbacks](../tests/playwright/provider-coverage-batch.spec.ts), [headless theme/layout accessibility](../tests/playwright/routstr-account-owned.spec.ts), [static account and recovery](../tests/pwa/sveltekit-routstr-account.spec.ts) |
| AI setup and balance notices | Preserve import-context copy, OAuth/Settings/sex-specific demo/credits actions and extension interception; callbacks close their current dialog before service entry; retain overlay identity while rejecting retired controls and style replies; release focus listeners and scroll locks on every dismissal; actual image import and chat 402 work from cached static assets through cold launch | [Owned dialog runtime](../tests/ai-action-dialog-runtime.test.ts), [original import actions](../tests/playwright/pdf-import-browser-coverage.spec.ts), [original provider actions](../tests/playwright/provider-coverage-batch.spec.ts), [headless themes/layout/accessibility and extensions](../tests/playwright/ai-action-dialog-owned.spec.ts), [static PWA acceptance](../tests/pwa/sveltekit-ai-action-dialog.spec.ts) |
| Wallet recovery | Preserve proofs, balances, and saved recovery through failures; retain mint and node ownership | [Wallet runtime](../tests/cashu-wallet-runtime.test.ts), [wallet UI](../tests/playwright/routstr-wallet-dom.spec.ts) |
| Offline updates | Failed installation preserves the working app and data; retry activates safely; tabs retain their local data | [PWA lifecycle](../tests/pwa/lifecycle.spec.ts) |
| Light context | Use canonical total vitamin D and units; reject another profile's stale values | [Vitamin D context](../tests/lab-vitamin-d-context.test.ts), [Light AI rendering](../tests/test-light-ai-renders.ts) |

These are selected pointers, not an exhaustive inventory or a claim that every
possible failure is covered. Retain temporary assertion reviews and progress
logs locally in `.local-notes/`; use PRs and revision-specific CI artifacts for
shared change and verification evidence.

## Coverage measurement and floors

The combined collector inventories first-party production roots, including
never-imported modules. It measures emitted JavaScript from the canonical
TypeScript sources, without counting both as separate modules. Function identity
uses source ranges rather than names. Unmapped collector ranges remain visible;
do not assign them through broad overlap to improve a result.

Svelte components are inventoried once at their emitted native-browser URL.
Their generated source maps identify bundled third-party framework functions;
only positively mapped library functions are separated from the first-party
function denominator. Unit collection keeps these artifacts in the same compiled
coordinate space as browser collection; external maps remain available to the
combined collector. Missing component maps fail collection, and unmapped
functions remain visible. Focused component tests do not replace the complete
combined-coverage gate.

The retained `production-coverage` artifact includes per-file results, feature
summaries, unmapped ranges, and revision information. The authoritative global
and feature floors live in [coverage-baseline.json](../scripts/coverage-baseline.json).
The current global function floor is **89%**, with independent floors for all
17 feature groups. Feature floors retain measured reference counts and cannot
be weakened to obtain a green check. Review classification and baseline changes
explicitly; improvement in one feature cannot hide regression in another.

`npm run test:critical-coverage` separately enforces line, statement, function,
and branch thresholds for selected critical modules. Its suite membership,
source inventory, and per-module thresholds are defined in
[vitest.critical.config.ts](../vitest.critical.config.ts), rather than a fixed
suite count in prose. Missing execution must fail the applicable floor.
This gate supplements the complete denominator; it does not replace it.

## Release and integration evidence

[Release evidence](../.github/workflows/release-evidence.yml) is requested by
manual dispatch or the `run-release-evidence` PR label. It runs full regression,
both selected real WASM model scenarios, and the two isolated service-image
build/runtime checks. Its acceptance job requires its declared dependencies to
pass. It does not deploy. The model checks validate the JSON execution report:
skipped tests, flaky retries, and report errors do not count as passing inference.

Knowledge verification uses a real MiniLM model for indexing, search, and cache
reuse. Voice verification uses Kokoro and small Whisper on WASM. CI model jobs
use bounded execution and an isolated browser; requesting release evidence
explicitly authorizes those model downloads. Avoid extra local downloads unless
needed for the requested work.

[Sync compatibility](../.github/workflows/sync-compat.yml) runs separately.
Real paid providers, live wallets, installed CLI agents, physical hardware,
WebGPU, and larger model tiers require their own acceptance evidence. Synthetic
transport and mint fixtures do not prove live billing or hardware behavior.
Use checks and retained artifacts for the exact selected revision when assessing
release readiness. Local working logs do not establish current release acceptance.
