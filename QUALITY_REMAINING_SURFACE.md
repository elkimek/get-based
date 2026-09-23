# Additional concrete gap found during completion audit

Cycle import/delete failure recovery was not proven by existing success-path
coverage. The next local batch adds 35 cases and fixes four reproduced ownership
and rollback failures, with real IndexedDB restoration checks. See the completion
checklist for focused evidence. PR1649 acceptance remains independent; do not
mark the overall goal complete before this recovery batch is accepted and the
remaining-surface audit is finished.

# Active autonomous remaining-surface batch — 2026-09-23

PR #1648 merged as `1bda34a8002d9c9099354b0d7a221c7a5600ec1b` after exact-head
CI, all 17 feature gates, all 30 critical floors and Greptile 5/5. The user
authorized subsequent administrator merges for this coverage effort after the
same acceptance checks. Branch: `codex/remaining-recovery-coverage`.

Local work in progress: 60 new unit regressions and three new Chromium navigation races, including nine wallet journal
integrity cases (partial/missing signatures, amount/keyset mismatch, ordering,
unsupported runtime and malformed journal). All retain original local proofs and
the journal on failure; valid recovery is verified after transient response faults.
These use only deterministic mint fixtures, no real funds or network. Three
import regressions reproduced cross-profile chat restore and rollback into
replacement data during failed saves; both paths now retain origin ownership. Nutrition: 19 editor draft-navigation, 17 comparison-recovery
and nine result/presentation cases pass. Seven comparison tests reproduced late
file-loading/profile/reset, late restoration, stale clearing and stale estimate
application failures; ownership checks now reject those stale continuations.
Clearing comparison history now cancels pending requests. Presentation helpers moved into the existing results module to retain the runtime
module size limit. Related lifecycle/scoring checks and CheckJS also pass. This is not final acceptance or a claim that
the comparison lifecycle is fully covered. Continue comparison races and durable
failure handling, then broader Light navigation, wallet/provider recovery,
shell/chat dispatch and import/export recovery. Batch related changes before
publishing; focused tests only locally.

---

# Current investigation: sun session recovery (2026-09-23)

The previous sync boundary batch merged as PR #1646. The new batch covers session
ownership across delayed weather/persistence, failed computation/save retries,
live timer cancellation, pause/resume and stop idempotency. It adds 142 cases;
whole-project impact remains pending CI rather than extrapolated from scoped tests.

Still separate: broader Light page event/navigation coverage, wallet/provider
recovery, nutrition editor/comparison failures, shell/chat event dispatch and
import/export rollback. This batch does not claim those areas are complete.

The table below is a historical prioritization snapshot, not current coverage.

# Remaining coverage surface after PR #1645

Evidence: production artifact 10696256536 from CI run 35731140675,
reviewed head `d5880741d7efcba9485912c2c7cd1d6741396b14`, merged as
`a546c202cf84ee86759c2b9b938fc43b3cf75e59`.

The complete denominator contains 16,136 functions; 14,507 executed (89.9046%).
Unexecuted functions are investigation candidates, not proof of missing user
workflows. Executed functions likewise do not establish complete branch or
functional coverage. Default no-op callbacks remain in the denominator.

## Current larger batch: identity and cleanup failure boundaries

- Identity vault: blocked/open failures, late success, timeouts, transaction
  durability/abort, malformed records, inaccessible storage and invalidation races.
- Profile cleanup: each database failure, delayed deletion, blob failures, retry,
  invalid IDs, discovery errors and preservation of unrelated profile/global data.
- Sync-disable metadata cleanup, OPFS lock boundaries and legacy owner handoff are
  covered in the combined batch.
- Accumulate related fixes locally; focused tests only. CI owns the complete matrix.

## Prioritized residual investigations

1. Sync identity/candidate and storage cleanup: stale owner restoration, interrupted
   migration, generation changes, resource disposal and failure recovery.
2. Wallet persistence/provider recovery: locking, duplicate recovery actions and
   failed durable commits; deterministic fixtures must avoid real funds/providers.
3. Light/session persistence and UI: session restoration, timer cleanup, navigation,
   mutation failures and profile ownership.
4. Remaining nutrition comparison/editor flows: partial model failure, stale
   comparisons, cancellation and durable edit failure.
5. Shell/settings and chat event paths: actual event dispatch, route transitions,
   queued operations and permission/clipboard failures.
6. Import/export/cycle: recovery, partial failures and rollback across persisted data.

Hardware/model inference, real paid providers and exhaustive device combinations
remain separate integration acceptance surfaces; mocks cannot prove them.

## Largest unexecuted function counts at the reference head

| Module | Executed / total | Unexecuted |
|---|---:|---:|
| `js/light-page-view.js` | 28 / 60 | 32 |
| `dev-server.js` | 24 / 53 | 29 |
| `js/chat-actions.js` | 26 / 54 | 28 |
| `js/sync-evolu8-candidate.js` | 40 / 66 | 26 |
| `js/sun-session-ui.js` | 55 / 78 | 23 |
| `js/cashu-wallet-store.js` | 127 / 150 | 23 |
| `js/shell-actions.js` | 17 / 39 | 22 |
| `js/light-tools.js` | 48 / 67 | 19 |
| `js/nutrition-store.js` | 91 / 110 | 19 |
| `js/app-event-listeners.js` | 19 / 37 | 18 |
| `js/settings.js` | 29 / 47 | 18 |
| `js/provider-panels.js` | 37 / 55 | 18 |
| `js/nutrition-comparison-ui.js` | 68 / 86 | 18 |
| `js/cycle-import.js` | 72 / 90 | 18 |
| `js/sun-active-session.js` | 56 / 72 | 16 |
| `js/sync-evolu8-identity-vault.js` | 21 / 36 | 15 |
| `js/nutrition-review-ui.js` | 51 / 66 | 15 |
| `js/cycle-store.js` | 69 / 84 | 15 |
| `js/views.js` | 71 / 86 | 15 |
| `js/settings-agent-access-panel.js` | 20 / 34 | 14 |
| `js/settings-provider-bridge.js` | 16 / 29 | 13 |
| `js/chat-model-controls.js` | 41 / 54 | 13 |
| `js/sun-sessions-store.js` | 44 / 57 | 13 |
| `js/profile-runtime.js` | 9 / 21 | 12 |
| `js/voice-controller.js` | 23 / 35 | 12 |
| `js/light-conditions-now.js` | 26 / 38 | 12 |
| `lib/agent-host-service.js` | 32 / 44 | 12 |
| `js/wearables-connect.js` | 52 / 64 | 12 |
| `js/chat-layout.js` | 8 / 19 | 11 |
| `js/pdf-import-preflight.js` | 29 / 40 | 11 |
