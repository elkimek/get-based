# Local quality hardening — 21 September 2026

Worktree: `/tmp/getbased-quality-hardening`  
Branch: `codex/code-quality-hardening`  
Base: `c498f4dc5016ef0cdeaf2a900b419bd65c760ff6`

**The original six-item objective is reopened; see `QUALITY_COMPLETION_CHECKLIST.md`.
Earlier completion statements below described narrower local increments, not full
acceptance of the original list. Publishing a ready PR is now authorized; CI and
external review acceptance remain pending.** Small real-model scenarios have now passed locally
(see the second increment below). Changes are
uncommitted and reviewable in this worktree. The original checkout and its existing
untracked work were preserved.

## First increment

1. **Firefox PWA fixture:** the original failing CI trace shows the delayed
   analytics notice moving Reload between pointer targeting and delivery.
   The installed-user fixture now acknowledges that notice. Update, offline,
   retry, two-tab and data-retention assertions are unchanged; production service
   worker lifecycle code is unchanged. Three focused Firefox repeats passed after the fix.
2. **Coverage correctness and reporting:** inventory all production roots,
   including never-imported files; map V8/Istanbul functions to source AST ranges
   rather than ambiguous names. Retain commit-attributed JSON/HTML/feature summaries
   in CI, including unmapped collector ranges. Keep the 79.50% floor unchanged.
   A real single-module V8 + Vitest sample validated range interoperability with
   zero unmapped called ranges for the sampled module. Its global percentage is
   deliberately incomplete and is not a new project baseline.
3. **Agent workflow and recovery:** add a real application send → synthetic
   companion → actual saved-marker tool → receipt → answer → edit/resend → reload
   browser test, including the actual consent interaction. Add nine backend cases
   for one-time session recovery, generic failures, negotiation failure, upload
   reuse and cancellation propagation. Existing profile-boundary, import-integrity,
   edit/cancel/fork and persistence checks passed.
4. **Core lab contract:** replace generic entry records with `LabEntry` and typed
   marker provenance/import metadata. Narrow optional metadata at import preflight.
   This exposed an actual bug: daily and onboarding Light & Sun prompts read an
   obsolete vitamin-D shape. They now read canonical total vitamin D with nmol/l
   units through a pure helper that accepts entries explicitly. Regression tests
   cover actual prompt inclusion, missing/non-finite values, D3 distinction and
   profile snapshot isolation. Other open `any` contracts remain incremental work.
5. **Controlled integration evidence:** add a manual-only CI workflow selecting
   MiniLM indexing/reload or Kokoro + small Whisper speech round trip, one worker,
   no traces and a 20-minute job limit. No scheduled runs or paid-provider calls.
6. **Behavior and security policy:** `QUALITY_COVERAGE_POLICY.md` maps critical
   workflows to independently asserted tests, defines honest coverage-baseline
   handling and documents CodeQL alert 120's loopback/redirect boundary and
   residual local-process trust assumption. The alert was not dismissed/suppressed.

## Focused verification

| Check | Result |
| --- | --- |
| Coverage scope/identity/reporting, coverage gate, service-worker update | 49 Vitest tests passed |
| Lab context, import integrity/provenance, companion, profile persistence/races | 66 Vitest tests passed |
| Agent backend recovery | 9 Vitest tests passed |
| Light AI rendering/context | 46 assertions passed |
| Agent chat, profile changes during generation/consent, import/storage failures | 11 Chromium tests passed |
| Existing chat edit/cancel/fork, including mobile | 2 Chromium tests passed |
| Failed-update/retry/data-retention PWA scenario | 3 Firefox repeats passed |
| TypeScript, full-app checkJs, strict-null ratchet | Passed; zero strict-null diagnostics |
| Architecture | Passed; 782 graph modules, zero cycles; module map refreshed |
| Quality guardrails | 17 passed |
| Workflow YAML and whitespace | Parsed; `git diff --check` passed |

No exhaustive local browser/coverage matrix was run. Focused logs are in
`/tmp/getbased-quality-*.log` and `/tmp/getbased-quality-hardening-*.log`.

## Remaining evidence and longer-term work

- Full CI against this exact diff is **unverified** because the user chose local
  changes only. The expanded denominator may fail the unchanged coverage floor;
  resolve it from real CI evidence without lowering the floor to obtain green.
- Exact current per-feature percentages and branch coverage are **not measured**.
  The last successful main-push measurement remains 81.09% functions / 83.85%
  source bytes under the old denominator, not a result for this worktree.
- The manual CI workflow itself is **not executed**. Its two selected scenarios
  passed locally on WASM. WebGPU, larger voice tiers, live CLI/provider behavior
  and human acceptance remain separate evidence.
- CodeQL alert 120 remains open; the documented local-process trust assumption
  would require a separate authenticated-transport design to eliminate.
- Chat, thread, note and meal state now have explicit domain types. Other open
  profile maps and the wider shared-state architecture still need progressive improvements.

The audit score remains **7.5/10 overall, approximately 7/10 functional regression
protection**. Focused improvements alone do not justify a new whole-project score.


## Second increment: persistence, isolation and real inference

Implemented and verified locally:

- Added profile-runtime race tests, first reproducing five failures. Runtime
  refresh now checks both profile identity and data snapshot after each await,
  including chat module/personality/thread loading and wearable recovery. A stale
  hydration failure cannot clear the new profile's nutrition summary. Typed
  refresh dependency signatures replace the blanket callable `any` dictionary.
- Note save/delete now persists an isolated mutation with an explicit baseline.
  Failed writes leave live notes and deletion tombstones unchanged; the editor
  keeps the draft for retry. Success is announced after commit. Double submission
  is blocked and late completion does not close a newer/unrelated editor.
- Agent context-note, marker-note and supplement proposals now reject failed
  writes instead of announcing success; profile mutations use explicit baselines.
  Real aborted IndexedDB transactions verify failure and successful retry.
- Added `ChatMessage`, `ChatThread`, `ProfileNote`, `NutritionMeal`, component and
  thumbnail contracts. Unknown extension metadata requires narrowing. Discussion
  join events are represented separately and cannot be copied/regenerated as text.
- Added agent-tool disclosure tests for context/group opt-outs, ambiguous markers,
  dates and limits, aggregate-only nutrition, bounded knowledge excerpts, missing
  wearable data, failed navigation and profile isolation.
- Real MiniLM indexing/search and cached reload passed on WASM. Real Kokoro/Whisper
  Small q8 synthesis/transcription plus chat Web Audio playback passed on WASM:
  transcript exactly `Check my iron level.`, nonzero RMS 0.0632, peak 0.4338.
  These were two individually selected tests; no larger/GPU models or full suite.
- Registered the new vitamin-D helper in the offline app shell. The dependency
  closure gate checks that every reachable module and worker is precached.

Focused evidence (overlapping runs are not summed as unique tests):

| Scope | Result |
| --- | --- |
| Notes, profile runtime, chat storage/discussion, nutrition sync/save races | 46 passed before the additional unrelated-modal note case |
| Profile refresh/write concurrency/manual deletion | 49 passed |
| Notes, including delayed/failing/concurrent editor paths | 19 passed |
| Agent tool disclosure/profile binding | 14 passed |
| Agent proposal persistence/rendering | 7 passed |
| New proposal persistence, notes and affected chat action browser cases | 8 passed |
| Affected discussion join and summary browser cases | 2 passed |
| Real MiniLM indexing/reload | 1 passed, WASM |
| Real CPU speech round trip and playback | 1 passed, WASM |
| Offline module dependency closure | 5 passed |
| Firefox offline Light & Sun context with the origin disconnected | 1 passed |
| Updated checkJs / strict-null / service-worker types / architecture | Passed |

Narrow Vitest execution measurements, **not global project coverage**:

| Module and selected tests | Functions | Branches | Lines |
| --- | ---: | ---: | ---: |
| Agent tool bindings | 100% (30/30) | 77.77% | 96.34% |
| Profile runtime + persistence/manual-delete scenarios | 28.57% (6/21) | 88.88% | 89.65% |
| Notes unit-level editor/storage cases | 66.66% (10/15) | 70.54% | 83.63% |

The profile runtime function denominator includes eleven default no-op callbacks
that these tests replace with observable dependencies, plus three unexercised
facade/event exports and a rejection callback. This is why branch/behavior evidence
must be examined alongside function percentage. Browser evidence above is not
merged into these narrow Vitest percentages.

Still to investigate next: agent-proposal status persistence across a profile or
thread switch, remaining critical workflow gaps in the feature inventory, and
additional domain contracts where actual consumers still accept `any`. Do not
mark the overall goal complete merely because this increment passes.


## Third increment: proposal execution status

Proposal actions now persist an applying claim before mutating data, reject
repeat clicks while the claim is outstanding, and check the originating profile,
thread, and history object after each asynchronous boundary. Completion never
writes the newly active conversation. A completed mutation is not reset to pending
when its status write fails. Discard failures are caught and preserve the proposal.

Reloaded applying claims normalize to a non-actionable uncertain outcome with
an explicit instruction to inspect the data. This is conservative recovery, not
an exactly-once transaction: profile data and conversation history remain separate
writes. A navigation during application can leave the originating conversation
with an unconfirmed outcome even when its data change succeeded. Cross-tab claims
are not atomic; shared-storage concurrency remains a separate gap to investigate.

Verification: 38 focused unit tests across proposal actions/cards, storage
normalization, and existing profile races passed; four Chromium proposal
persistence tests passed, including an actual action/save/history-reload flow.
checkJs and git diff whitespace checks passed. No full suite or coverage matrix ran.

Next concrete finding: manual metric writes capture a profile for wearable row
storage but consult global imported data after awaits for tombstones and source
connection metadata. Verify and repair that boundary before considering biometric
proposal coverage complete. Continue the critical-workflow inventory and domain
contract work; the overall goal remains active.


## Fourth increment: manual biometric profile boundaries

Manual metric/BP writes now capture the origin and edit isolated profile data.
Tombstone filtering uses that captured data even if IndexedDB completes after a
profile switch. Connection metadata is saved with an explicit origin and baseline;
failed metadata saves reject rather than report success. Inactive-profile writes
are rejected before storage access. Migration uses a captured snapshot and only
marks completion after its connection metadata commits.

Single and bulk deletion now commit durable tombstones and legacy cleanup before
removing wearable rows. An aborted profile commit preserves both live data and
wearable readings. The separate profile and wearable databases are not one atomic
transaction: a row write followed by failed connection persistence can still leave
a row requiring recovery, and a wearable deletion failure can leave tombstoned
rows for reconciliation. These failures are surfaced, not reported as success.
Concurrent same-day read/modify/write operations remain a separate review item.

Evidence: 11 new boundary cases failed on the previous implementation. After the
fix, 29 focused tests passed (13 manual boundary cases, 11 existing deletion cases,
and 5 proposal persistence cases); the standalone manual-wearables script passed
102 assertions. Two Chromium tests used actual IndexedDB for profile-switch and
transaction-abort behavior. checkJs, strict-null (zero diagnostics), all 17 quality
guards, and diff whitespace validation passed.

Existing deletion fixtures now persist their starting profile before exercising
scoped merges; no assertions were removed. No full-suite run, full coverage matrix,
remote push, or PR was performed. Remaining work includes concurrent manual row
mutations and a requirement-by-requirement critical-workflow evidence inventory;
this increment does not establish overall completion.


## Fifth increment: concurrent manual entries and completion inventory

A real Chromium test reproduced lost weight when weight and blood pressure were
logged simultaneously. Manual row read/modify/write operations now use one
profile-scoped queue plus Web Locks across tabs. Single-row deletion, migration
batch writes, tombstone reconciliation, and bulk clearing participate in the same
row lock. Profile metadata commits remain outside it, avoiding nested lock order.
This does not turn the two stores into an atomic transaction or automatically
coordinate sync/import writers that call the wearable store directly.

All four focused manual-persistence browser cases passed, including same-tab and
two-tab writes retaining both measurements. The latter holds the profile lock,
observes both tabs waiting, then verifies the merged persisted row. Twenty-six
manual boundary/deletion unit tests passed, including fallback queue ordering and
recovery after a failed operation. checkJs passed. No exhaustive suite ran.

`QUALITY_WORKFLOW_INVENTORY.md` now records the goal's critical workflow evidence,
separating inspected assertions, locally executed scenarios, external integration
limits, and concrete remaining review work. The next local gaps include cross-tab
proposal claims and actual meal-proposal commit failures. Goal remains active.


## Sixth increment: nutrition persistence scope

A real-browser stale-view regression showed that saving a meal replaced an
unrelated context note committed by another writer. Nutrition persistence now
passes the mutation baseline to scoped profile saving instead of replacing the
whole profile. Save, delete, archive restore, and cache-to-profile reconciliation
supply baselines; aligned retries capture the newly active view's baseline before
merging nutrition state. The persistence helper declares explicit ProfileData
contracts for its intended and baseline snapshots.

Four browser cases passed: an aborted meal-proposal profile commit rolls back its
local cache and live meal surface, retry saves exactly one meal, and stale meal
save/delete/restore retain the other writer's context note. Seventeen focused
nutrition storage, ordering, and sync tests passed; checkJs and whitespace checks
passed. No full nutrition/browser/coverage suite ran.

The workflow inventory also records inspected existing wallet failure/recovery
assertions and browser consent request-count assertions. These unrelated suites
were not rerun solely to refresh a pass count. Full exact-diff coverage and live
providers remain unverified; the goal is active, including cross-tab proposal
claims and the remaining inventory review.


## Seventh increment: durable cross-tab proposal claims

A separate profile-scoped claim journal now prevents two stale conversations from
independently applying the same proposal on this browser origin. Web Locks guard
read/claim/write, and a claim is committed before the mutator starts. Conversation
saves cannot erase it. Failed or interrupted attempts keep the claim because the
journal and profile mutation are separate commits. A view switch while waiting
for the claim prevents application to the new view.

The journal contains proposal identifiers only, follows profile encryption, and
is removed by existing profile-prefix cleanup. Invalid identifiers, corrupt or
unreadable journals, locked encryption, missing Web Locks, and storage failures
block application with an explicit error. There is no unsafe unlocked fallback.
This journal is local to the browser origin; no cross-device exactly-once or old
backup-restoration guarantee is claimed. A new explicit proposal after inspecting
an uncertain outcome remains the recovery path.

Verification: 30 focused tests passed (11 journal, 14 action, 5 offline dependency
closure), followed by a 14-case action rerun after refining error messages. Five
proposal browser cases passed together, including simultaneous tabs producing
one meal and reload rejecting another claim. The encryption/cleanup fixture first
hit the test-only session-key guard; after enabling its required test flag, that
single case passed. checkJs passed; the architecture map now has 783 modules and
zero cycles; whitespace checks passed. No full suite, remote push, or PR.


## Eighth increment: domain contracts and evidence review

Supplement records now describe their schedule, lifecycle, periods, ingredients,
quality evidence, serving size and import provenance, while retaining compatibility
with older records missing history. Newly edited records require history/schedule;
marker and per-value note maps hold strings rather than any. Unknown extension
fields require narrowing. checkJs passed, and the initially exposed optional-field
diagnostics were resolved without weakening the strict-null floor (zero remains).
These changes are type declarations/annotations and do not alter runtime behavior.

A new single real-browser nutrition scenario aborts cache finalization after the
canonical meal commit, resets the DB connection, and verifies hydration restores
the one-meal summary. It passed without another production change.

The inventory now records inspected assertions for sync isolation and recovery,
route-specific consent, score composition, genetics evidence labels, cycle encrypted
backup round trips, and provider timeout handling. These unrelated suites were not
rerun. Review discovered a concrete remaining backup completion gap: wearable
restore errors are swallowed, and manual import announces success from an unawaited
finally even if a dependent restore rejects. This is the next regression target;
full-goal completion remains unproven.


## Ninth increment: backup restore completion

A real aborted wearable transaction reproduced a false "Backup restored" success
notification and reload. File import and auto-backup restore now await all dependent
stores with allSettled. Wearable and cycle batch errors are counted and propagated
after attempting other batches. No success/reload is scheduled on any dependent
failure; the snapshot action delegate catches and displays rejection. The error
states that some data may already be restored and asks the user to retain the
backup and retry after resolving storage failure. This is not atomic rollback of
a multi-store restore.

Verification: six focused Chromium cases passed (four actual IDB failure cases
across file/snapshot and wearable/cycle paths, plus two existing successful/error
backup flows). Five focused unit cases passed: cycle observation/metadata failure,
waiting for a remaining store after another fails, and existing sync handoff.
checkJs passed. No full test suite, full coverage collection, push or PR was run.
The overall goal remains active pending the remaining manual-row restore interaction
review and final requirement-by-requirement audit.


## Final increment and completion audit

Extracted the manual-row queue into a shared, typed module and enrolled raw
backup/encryption batches containing manual rows in the same lock. A real-browser
test holds that lock, queues raw restoration, then applies a manual edit and proves
that the restored pulse and new weight both survive. Sync source inspection confirms
that raw wearable L1 rows remain device-local; only L2 summaries sync.

Final affected verification: 31 unit tests and 10 Chromium cases passed; these
include manual profile/transaction boundaries, same-tab/two-tab concurrency, raw
restore ordering, backup failure reporting and encryption enable/disable migration.
Final checkJs, strict-null (zero diagnostics), service-worker types, all 17 quality
guards, architecture (784 modules, zero cycles), and whitespace validation passed.
The coverage baseline file is byte-for-byte unchanged from HEAD at 79.50%.

| Goal requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Review critical functional protection end to end | `QUALITY_WORKFLOW_INVENTORY.md`, inspected assertions, and the focused logs recorded throughout this report | Identified local gaps resolved; existing and new evidence distinguished |
| Improve meaningful regressions | Real UI/IndexedDB, two-tab, abort/retry, origin-switch, canonical-data, consent/tool and actual WASM model scenarios | Passed within their stated scopes |
| Strengthen domain contracts | `types/lab-data.d.ts`, `types/chat-data.d.ts`, `types/nutrition-data.d.ts`, `types/supplement-data.d.ts`, `types/app-state.d.ts`, typed runtime dependencies | Compiler checks pass without increasing strict-null debt |
| Improve coverage measurement without weakening it | Production-root/AST collector tests, retained report artifacts and unchanged `scripts/coverage-baseline.json` | Implemented; full exact-diff CI result remains unmeasured |
| Keep work local and tests relevant | HEAD remains `c498f4dc5016ef0cdeaf2a900b419bd65c760ff6` on `codex/code-quality-hardening`; changes are uncommitted; only focused commands used | No push, PR, exhaustive local suite or full local coverage matrix |
| Distinguish real integrations from simulations | Real MiniLM and small CPU speech logs, synthetic companion/provider fixtures, explicit external limitations | No live-provider, larger-model or GPU claims |

The hardening objective is satisfied by the concrete regression protections and
stronger contracts above. It is not a claim of 100% project coverage or absence of
all future defects. The original whole-project score remains provisional at 7.5/10
(approximately 7/10 functional regression protection); the previous main-branch
81.09% function metric uses the old denominator and is not this worktree's result.
Full CI may expose additional work under the expanded, unchanged-floor collector.

Primary final logs: `/tmp/getbased-final-manual-unit.log`,
`/tmp/getbased-final-manual-browser.log`, `/tmp/getbased-final-checkjs.log`,
`/tmp/getbased-final-strict.log`, `/tmp/getbased-final-sw-types.log`,
`/tmp/getbased-final-quality.log`, `/tmp/getbased-final-architecture.log`.

## Follow-up goal: proposal coverage and backup creation hardening

The user clarified that “hardware” meant code hardening. This continuation remains
local and uses selected tests only. It adds 41 unit cases (23 proposal routing,
six review-card cases, 12 backup collection cases) and three browser regressions.

Proposal tests assert rejection before mutation for ineligible proposals, ambiguous
or missing markers, append/replace semantics, invalid timestamps, meal provenance,
biometric units and origin profile, persistence rejection, medication/supplement
lifecycle, and escaped review fields. The focused `agent-drafts.js` run covers all
12 functions, all 58 lines, and 121/135 branches (89.62%). This is not a project-wide
coverage percentage and does not include browser coverage. The independently scoped
claim journal run already covered all its measured lines/functions/branches; the
manual lock's remaining unit branch is also exercised by existing real-tab tests.

Two backup-creation defects were reproduced and fixed:

- Wearable/cycle read failures were swallowed, allowing incomplete exports to be
  marked successful. Collection now rejects; manual export reports an error before
  download or updating its success timestamp. Empty stores remain valid. Automatic
  snapshot creation already catches collection failure before writing/pruning.
- An encrypted profile index was enumerated only when the synchronous legacy scan
  found no profiles. Mixed legacy/IndexedDB users could lose migrated profiles from
  the backup. Full collection now always reads the encrypted index and rejects an
  unreadable index rather than emitting an empty or partial snapshot.

Six read-failure cases and four encrypted-index cases failed before their respective
fixes. All 12 collection cases now pass, including ciphertext preservation and empty
stores. Browser tests abort actual wearable/cycle read transactions, verify no false
success, and retry successfully. A real-encryption browser case verifies that both
legacy and IDB profiles appear with byte-identical encrypted imported data and no
plaintext notes in the snapshot.

Verification: 37 proposal unit cases plus 17 backup unit cases passed (54 distinct
cases across these two groups); four focused backup browser cases passed, followed
by the newly added encrypted-backup case (five distinct cases). CheckJs, strict-null
(zero diagnostics), all 17 quality guards, and whitespace checks passed. The 79.50%
coverage floor remains unchanged. No push, PR, full suite, or whole-project coverage
run was performed. Earlier scoring remains provisional; these module measurements
do not establish a new global score. Remaining branch work should prioritize actual
failure contracts in profile/runtime and note editing, rather than default no-op
callbacks or artificial percentage padding.

Evidence: `/tmp/getbased-next-proposal-tests.log`,
`/tmp/getbased-proposal-routing-coverage/coverage-summary.json`,
`/tmp/getbased-backup-enumeration-before.log`,
`/tmp/getbased-backup-export-final-browser.log`,
`/tmp/getbased-encrypted-backup-browser.log`, `/tmp/getbased-next-quality.log`.

## End-to-end local closure audit

The final continuation audited the remaining meaningful profile/runtime and note
branches, reviewed the persistence changes against the workflow inventory, and
followed through the additional defect it found. No further local implementation
or regression item identified in this audit remains open. This is completion of
the bounded local hardening audit, not a claim that every possible behavior has
been tested or that the unrun full CI matrix passes.

Added 19 unit cases: eight note-editor/deletion/delegated-action cases, nine profile
refresh cases, and two manual migration cases. Added two browser cases for actual
note deletion abort/retry and manual migration metadata abort/retry.

The additional production defect was a migration retry overwriting newer manual
readings with older legacy values. Both new unit regressions failed before the
fix. Migration now reads existing rows inside the shared manual-row lock and fills
missing legacy fields while preserving existing values and annotations. The
browser regression aborts the profile metadata commit, records a newer weight,
retries migration, and verifies the newer weight and note plus retained blood
pressure. The completion flag stays absent after failure and appears after retry.

The profile/runtime audit covers stale profile IDs and same-ID replacement data,
old asynchronous rejection, current hydration failure, failed thread loading,
lazy chat loading and best-effort wearable recovery. The note audit covers stale
or removed records, duplicate dates and reordering, invalid input, cancelled and
failed writes, delegated actions, pending-write suppression, replacement modals,
and deletion tombstones. Actual deletion abort/retry preserves memory and disk,
then survives reload with exactly one deletion marker.

Latest focused module measurements:

| Module | Lines | Functions | Branches | Scope |
| --- | --- | --- | --- | --- |
| `agent-drafts.js` | 100% | 100% | 89.62% | 37 proposal cases from the preceding increment |
| `notes.js` | 97.27% | 86.66% | 82.94% | Note/runtime/deletion group; browser coverage not merged |
| `profile-runtime.js` | 89.65% | 28.57% | 90.47% | Same group; 11 default no-op callbacks explain much of the low function figure |
| `agent-draft-claims.js` | 100% | 100% | 100% | Earlier narrowly scoped journal measurement |

These percentages are independent module samples, not additive, not a global
baseline and not grounds to exclude default functions from the coverage floor.
Remaining unexecuted trivial wrappers/fallbacks were reviewed rather than adding
artificial tests solely to improve the percentages. Existing real-browser tests
cover cross-tab/manual locking and other behavior absent from individual unit
reports.

Final affected evidence:

- 55 unit cases passed in the note/profile/deletion group; 49 passed in the
  migration/profile/deletion group after the migration change. Those groups have
  **72 distinct cases**, not 104; 32 were intentionally shared affected checks.
- Both newly selected browser cases passed. Earlier successful browser checks
  were retained as evidence instead of rerunning unrelated green scenarios.
- The selected encrypted nutrition backup case passed; ten unrelated cases in
  that file were filtered out. The relevant legacy crypto/backup checks passed
  314 assertions, and manual-biometric checks passed 102 assertions.
- Fresh checkJs and strict-null checks passed with zero strict-null diagnostics.
  All 17 quality guards passed; architecture reports 784 modules and zero cycles.
  `git diff --check` passed. The 79.50% coverage baseline remains byte-identical
  to HEAD. No new import graph changes were needed for the migration repair.

Logs: `/tmp/getbased-runtime-note-final.log`,
`/tmp/getbased-runtime-note-coverage/coverage-summary.json`,
`/tmp/getbased-note-delete-browser.log`, `/tmp/getbased-migration-before.log`,
`/tmp/getbased-migration-final-unit.log`, `/tmp/getbased-migration-browser.log`,
`/tmp/getbased-migration-legacy.log`, `/tmp/getbased-final-crypto-legacy.log`,
`/tmp/getbased-end-checkjs.log`, `/tmp/getbased-end-strict.log`,
`/tmp/getbased-end-quality.log`, `/tmp/getbased-end-architecture.log`.

The critical-workflow inventory is closed for identified local actions. Remaining
boundaries are full exact-diff CI/global coverage, live providers/relay/payment
acceptance, optional GPU/larger models, and documented architectural limitations
(device-local proposal claims, separate profile/row commits, and loopback-process
trust). These are explicitly unverified or separate design work, not silently
counted as passed tests. Everything remains local and uncommitted in the existing
hardening worktree, with no push, PR, full suite or full coverage matrix.
