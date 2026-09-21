# Critical workflow evidence inventory

**Scope correction:** earlier local closure statements are not completion of the
original six-item list. `QUALITY_COMPLETION_CHECKLIST.md` is the acceptance tracker.

This is a completion checklist for the local hardening goal, not a new measured
coverage baseline. A test's existence is not proof of adequate assertions. Rows
marked reviewed identify behavior actually inspected; execution evidence is kept
separate. No exhaustive test matrix is authorized locally.

| Requirement | Current evidence and boundary | Remaining action |
| --- | --- | --- |
| Coverage measures all production roots and distinct functions | Collector inventory/AST range tests and a real V8 + Istanbul single-module sample passed. HTML/JSON/feature reports retain revision and unmapped ranges. | Full exact-diff CI measurement remains external; preserve 79.50% floor. |
| Lab import rejects invalid mutations and retains provenance | Reviewed and ran focused import integrity/provenance tests and browser commit/abort/restore scenarios in increment 1. | No new local gap identified in these reviewed scenarios. |
| Profile and note writes remain scoped and durable | Runtime race, note editor, actual IndexedDB abort/retry, and concurrent profile-save checks passed in increments 1–2. | Lab entries, messages, threads, notes, meals, and supplements now have explicit contracts. Marker note maps are string-valued; unknown extension fields require narrowing. Broad lifestyle/context maps remain legacy types; these tests do not cover every UI writer. |
| Agent conversation sends, tool access, recovery and edit/resend | Real UI uses synthetic companion transport and actual marker tool; edit/resend survives reload. Disabled contexts deny reads, retries are bounded, and failures preserve uploads appropriately. | Live CLI/provider compatibility is separate, unverified evidence. |
| Agent proposal application cannot silently retry an uncertain mutation | Durable claim, current-conversation guards, failed status persistence, reload normalization, and real action/save/reload passed. | Local claims now use a separate encrypted journal and Web Lock. Two real tabs save one meal, reload rejects another claim, and profile cleanup removes the journal. The journal is device-local: it is not a cross-device exactly-once protocol or a backup-restoration guarantee. |
| Manual biometric data survives profile switches and simultaneous entries | Origin-scoped metadata/tombstones, abort preservation, and same-tab/two-tab read-modify-write checks passed. Local queue recovers after failure. | Reviewed the boundary: sync ships L2 summaries, not raw L1 rows. Backup/encryption raw batches containing manual rows now use the same lock as manual edits. A real-browser queued restore/edit test retains restored pulse plus new weight; affected encryption migration passed. Raw restoration remains intentional row replacement, and profile metadata and wearable rows remain separate commits. |
| Nutrition storage and meal proposals preserve data across failures | Reviewed origin-scoped completion and save/hydration ordering. New real-IDB tests verify meal proposal rollback/retry and unrelated-edit retention during stale save/delete/restore; 17 focused unit tests and four browser cases passed. | No gap remains in those scenarios. Canonical profile and local meal cache still have separate commits; a new real-browser abort during post-commit cache finalization verified successful hydration recovery without changing production code. |
| Sync converges and respects deletion | Inspected three-device chat test assertions: independent threads converge, deletion propagates, and a stale snapshot cannot resurrect a deleted thread. Other real-relay tests exist. | Reviewed existing merge isolation and profile-write concurrency assertions for failed pull reads/writes, preserved live data, lock release, stale additions, and delete-versus-edit behavior. Real-relay tests assert offline recovery, rebuild/no-op stability, restored profile survival and new identity cleanup. No fresh unrelated relay run is claimed. |
| Wallet preserves funds through crashes and storage failure | Inspected real SDK durable-send recovery assertions: exact prepared outputs restore valid proofs while preserving unselected proofs. Runtime test cases include aborted proof replacement and funding recovery. | Reviewed fail-closed encryption setup, cross-mint collision rejection retaining funds, aborted proof replacement preserving recovery tokens, exact funding journal recovery, and paid withdrawal change recovery in `cashu-wallet-runtime.test.js`. These use synthetic mint responses; no live mint/payment evidence or fresh unrelated test run is claimed. |
| Encryption and backup preserve recoverability | Browser specs exist for encryption enable/disable, passphrase change/unlock, backup import/export, IDB errors and folder reauthorization. | Reviewed actual wrong-key, passphrase-change/unlock, canceled restore, restored settings/data/envelopes, and storage-error assertions. Fixed the uncovered completion path: wearable/cycle failures propagate, both stores are awaited, and file/snapshot UI reports incomplete restore without a success reload. Six focused browser cases and five ordering/failure/sync-handoff unit tests passed. Restore spans several stores and can be partial; the error explicitly says so and asks the user to retain the backup. |
| Consent gates automatic outbound AI activity | Inspected checkbox/approval assertions separating transparency acknowledgement from cloud consent. Browser activation/decline cases exist; actual consent used in agent-send verification. | Reviewed browser request counters: zero automatic requests before approval and after decline, one after approval; custom-provider decline persists neither URL nor key. Reviewed route-change unit assertions: approving one CLI adapter/model does not authorize another, and the destination scope changes. This is software behavior evidence, not legal clearance. |
| Offline lifecycle retains local data | Failed update/retry Firefox scenario and disconnected Light & Sun canonical context passed; service-worker dependency closure passed. | No additional local gap identified in those scenarios. |
| Local knowledge and voice work with actual models | Real MiniLM indexing/cache reload and Kokoro + small Whisper round trip/playback passed on WASM. | WebGPU/larger model tiers and CI workflow execution remain explicitly unverified; do not download more models by default. |
| Biology scores, genetics, cycle and provider domain behavior | Existing targeted tests were located, including composition/integrity, DNA catalogs/runtime, cycle import, and provider auth. | Reviewed score-composition assertions separating same-draw/specimen evidence and preserving core weights; bounded AI retries retain saved explanations. Genetics tests distinguish mechanistic traits from health evidence and require evidence/relevance metadata. Cycle tests round-trip encrypted rows and source metadata. Provider auth asserts timeout aborts and clears pending state. These are existing software assertions, not new clinical validation or live-provider evidence. |

Completion requires resolving the remaining local actions above with concrete
assertions or fixes, and reporting external evidence limits without relabeling
focused results as full-project coverage. The whole-project score remains the
original 7.5/10 assessment until evidence supports reassessment.


## Completion audit

The identified local actions in this inventory are resolved and have assertion-level
review or focused execution evidence as stated in each row. New defects uncovered
by the review were fixed and covered; existing meaningful regression tests were
reviewed without rerunning unrelated suites. Domain contracts were strengthened
for the principal lab, chat, note, meal, supplement and marker-note surfaces.

This audit does not certify every possible input, race, device, provider or storage
failure. Full CI measurement, the newly expanded coverage denominator, WebGPU/larger
models and live services remain unverified evidence boundaries. The unchanged
79.50% floor may still require further work when CI measures the exact diff. Legacy
lifestyle maps, cross-device proposal idempotency and transactional whole-backup
restore remain architectural limitations, not claims made by these regressions.

## Follow-up coverage evidence

Proposal routing and review rendering now have 37 passing focused unit cases,
covering 100% of lines/functions and 89.62% of branches in `agent-drafts.js`.
These percentages describe that selected module and test group only.

Backup creation now fails on unreadable wearable/cycle stores or an unreadable
encrypted profile index. It enumerates all encrypted profiles even when a legacy
localStorage subset exists. Twelve collection unit cases and three new browser
regressions cover failure, recovery, mixed storage, and ciphertext preservation;
existing focused backup checks also pass. Auto-backup remains best-effort and
silent on failure, but cannot persist/prune using a failed collection result.
See the follow-up section in `QUALITY_HARDENING.md` for exact scope and evidence.

## Final local closure

The remaining local profile/runtime and note cases have been completed. Current
hydration failure and stale asynchronous work preserve profile boundaries; note
validation, delegated actions, deletion races and late completion preserve the
reviewed record and active editor. Actual aborted note deletion retains the record
and creates no tombstone until a successful retry.

Final review also found and fixed migration retry replacing newer manual readings
with legacy data. Migration now fills missing fields under the existing manual-row
lock. Two before/after unit regressions and a real IndexedDB metadata-abort/retry
case prove that newer readings and annotations survive and the migration flag is
only committed after metadata success.

All locally actionable findings identified by this inventory have corresponding
implementation and focused verification evidence in the final section of
`QUALITY_HARDENING.md`. No pending local priority is being deferred. Full global
coverage/CI and external acceptance remain outside the local evidence boundary;
this closure does not assert 100% branch coverage or the absence of undiscovered
bugs. Existing intentional architecture limits remain documented in the table.
