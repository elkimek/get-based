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

## Behavioral requirements

Preserve independently failing assertions for these workflows:

| Workflow | Required behavior | Selected regression sources |
| --- | --- | --- |
| Lab import and restore | Reject invalid or duplicate mutations; retain units, provenance, and unrelated data; recover from failed writes | [Import integrity](../tests/import-data-integrity.test.ts), [provenance](../tests/import-provenance.test.ts) |
| Profiles and notes | Late work stays with its originating profile; failed reads block saves; drafts and records survive failed writes | [Profile races](../tests/chat-profile-races.test.ts), [profile persistence](../tests/profile-persistence.test.ts), [notes](../tests/notes-safety.test.ts) |
| Agent chat and proposals | Exercise the actual application and tools; keep retries bounded; retain uploads and journals; do not replay an uncertain mutation | [Agent workflow](../tests/playwright/agent-chat-workflow.spec.ts), [backend recovery](../tests/agent-chat-backend.test.ts), [draft persistence](../tests/agent-draft-persistence.test.ts) |
| Manual biometrics | Writes, deletions, and migration metadata remain scoped to the originating profile; failed deletion preserves rows | [Profile boundaries](../tests/manual-profile-boundaries.test.ts), [heart-rate deletion](../tests/manual-heart-rate-deletion.test.ts) |
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
