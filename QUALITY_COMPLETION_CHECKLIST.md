# Sun session recovery and coverage — 2026-09-23

PR #1646 was verified against head `e20352c80f8755012d37eb1977245ec223930f63`
and merged with the user-authorized administrator override as
`7732d5da1f3d6be590c312920116e9cb53f31561`. This batch starts from that merge.

## Current combined batch

142 new regression cases: 80 session-store, 33 live-runtime, 23 session-format
unit cases and six Chromium integration scenarios. These cover stale weather
completion/rejection after profile changes, deletion, reset and replacement;
concurrent hydration, failed persistence and retry; pause/resume/duplicate stop;
partial calculation failures; live ticker ownership and cleanup; and preserved
uncertainty labels in session summaries. Fourteen store and eighteen live-runtime
regressions were observed failing before their production corrections.

Store requests now verify profile, data, record identity and generation before
continuing after asynchronous boundaries. Newer requests supersede older weather;
queued work is keyed by record rather than a reusable id. Live requests similarly
cannot recreate cleared state or release another request's pending flag. Missing
location and failed weather can retry. Already-stopped sessions retain their
original end time. False storage results are failures, partial calculation errors
clear derived values, and failed final saves remain eligible for recovery.

This is not transaction rollback: synchronous in-memory edits can remain after a
failed save. The tests assert failure reporting and lack of success-side analysis,
not an invented guarantee that every failed write undoes every local mutation.

The added checks exceeded the existing production byte budget at first. Duplicate
live-rate and stored-safety calculations were consolidated without changing the
formulas; preflight formatting moved into the existing format module to keep the
runtime below its module-size cap. No budget or existing coverage floor was raised
or weakened to accommodate the changes.

## Focused local verification

- 136 new unit cases plus the critical-config guard pass.
- All six new browser scenarios and three directly affected existing scenarios
  pass, including real persistence across reload and profile/deletion races.
- Scoped coverage: store lines 95.72%, branches 89.34%, functions 78.46%,
  statements 94.33%; session format lines/functions 100%, branches 90.81%,
  statements 97.53%. Default no-op callbacks remain in the denominator.
- Critical configuration adds the three suites and two independently enforced
  modules: 53 explicit suites, 30 module floors. CI owns the complete run.
- Existing sun-domain checks: 117 passed; shipped-behavior checks: 132 passed; existing audit checks: 378 passed.
- CheckJS, strict-null, architecture, quality guardrails and production budgets
  are checked without exhaustive local browser or coverage matrices.

## Acceptance still required

The new PR must pass exact-head CI, all 17 feature and 30 critical gates, and full
Greptile review. Whole-project coverage changes are unknown until its artifact is
available. No collector policy changed; new cases and deduplication can change the
function denominator. Synthetic weather/math dependencies do not prove real
weather-provider availability, physical exposure estimates, or complete workflow
coverage. Remaining surface areas continue below and in QUALITY_REMAINING_SURFACE.md.

---

## Review corrections combined before the next push

Greptile identified failed-stop retry, in-place synchronization and inherited
pending-state gaps. All three have focused regressions. Repeated stops retry the
save without changing time or committing a second slice. A shared calculation-input
snapshot detects in-place changes that preserve object identity. Obsolete pending
state is cleared on the next live tick, allowing a replacement to request weather
without waiting for the old provider. Browser tests use actual `adoptProfileData`
and durable profile storage. Shared exposure construction preserves the original
formulas and bundle budget. These changes add 14 cases to the initial 127.

## Full-CI correction

Head b7e55b80 passed all critical floors and Greptile reviewed all 14 files at
5/5 with all three threads resolved. Its full browser run had one failure and
753 passes: the existing Light/Sun start/pause scenario installed a complete rate
while earlier weather was pending. The stale pending request subsequently erased
paused committed totals. The failure reproduced in isolation, and a new unit
regression reproduced the same behavior. Installing any explicit rate now
supersedes its pending request, rather than only clearing requests for null rates.
The focused live suite passes 33 cases; the failing browser case plus six recovery
scenarios pass. Strict-null and unchanged production budgets pass. New-head full
CI and review are required; b7e55b80 is not final acceptance.

## Historical evidence from preceding batches

# Sync identity and cleanup boundaries — 2026-09-22

## Verified starting point

PR #1645 merged as `a546c202cf84ee86759c2b9b938fc43b3cf75e59`.
[CI 35731140675](https://github.com/elkimek/get-based/actions/runs/35731140675)
verified head `d5880741d7efcba9485912c2c7cd1d6741396b14`: 14,507/16,136
production functions (89.9046%), all 17 feature gates and 25 critical floors.
Greptile reviewed all seven files without findings. Its pending notes below are
superseded by that acceptance. Remaining surfaces are recorded separately in
QUALITY_REMAINING_SURFACE.md; no complete functional-coverage claim is made.

## Current combined batch

107 new regression cases: 101 accumulated before publication and six review regressions:

- 43 identity-vault cases exercise open/block/timeout/late-success failures,
  transaction commit/abort, malformed records, inaccessible storage, invalidation
  during reads/writes and external commit-token changes.
- 27 profile-cleanup cases exercise deletion failures and retries, delayed
  database deletion, blob errors, invalid IDs, discovery and unrelated data
  preservation; six use the default database operations with fake IndexedDB.
- 32 sync cleanup/handoff cases exercise metadata retention, dirty markers,
  exclusive OPFS cleanup locks, inaccessible/busy stores and legacy invalidation.
- Five Chromium scenarios use real IndexedDB for invalidated reads/writes and
  persistence after reload without putting the recovery words in localStorage.

The vault now rechecks the commit token before returning an identity and before
publishing a write. A per-vault revision invalidates in-flight work even when the
first write has no token yet. Two new tests reproduced the original races before
fixing them. This does not claim cross-tab atomicity across IndexedDB/localStorage.

## Focused local evidence

- 122 relevant unit cases initially passed; the review follow-up adds two unit
  cases, with all 48 directly affected vault cases passing (102 new unit cases total).
- Five new Chromium scenarios plus the existing real v7/v8 identity handoff passed.
- Independent floors now cover 28 modules across 50 explicit critical suites.
  Existing floors are unchanged. Measurements (lines/functions/branches/statements):
  vault 94.50/88.88/88.52/93.16; profile cleanup 100/100/88.63/98.68;
  sync-disable cleanup 100/100/100/100.
- Check-JS, strict-null, quality, architecture, 32 coverage policy/config checks
  and existing production budgets pass. No budget increases.
- No exhaustive local browser/coverage matrix, live providers or downloaded models.

## Review follow-up

Greptile reviewed all ten initial files and identified a cross-tab write race:
a losing writer could overwrite the database record before rejecting a changed
localStorage token. Writes now hold a Web Lock across the database commit and
token publication; physical invalidation uses the same lock. Missing coordination
fails closed. Per-instance revision checks still reject invalidated queued work.
A two-tab real-browser regression verifies both writes settle and retain the same
readable final identity. Two unit cases cover unavailable locks and invalidation
while queued. Vault coverage is now 94.89/90/89.39/93.65; old floors remain intact.

The second review identified queued invalidation deleting a record after another
context published a token. Invalidation now clears/verifies the token again while
holding the write lock before physical deletion; failure to clear rejects without
deleting that record. A real two-tab case and two unit cases reproduce the ordering
and failure path. CI also caught optional storage-method narrowing across the lock
callback; bound validated methods resolve it. The strict-null gate, 48 affected
unit cases, six Chromium scenarios, quality and existing output budgets pass.

## Acceptance required

Verify exact-final-head CI,
all 17 feature gates and 28 critical floors in the complete production artifact,
clean provenance and full Greptile review. Do not merge the new PR or deploy.

---

# Nutrition request and storage boundaries — 2026-09-22

## Verified starting point

PR [#1643](https://github.com/elkimek/get-based/pull/1643) merged as
`0efb968d7e77cbf7020c5cc688535e0e974fc3bd`. Its reviewed head
`a49d9acd593ed4535bc773441d68707598fb0fb1` passed
[CI run 35726349411](https://github.com/elkimek/get-based/actions/runs/35726349411):
14,497/16,135 production functions (89.8482%), all 17 feature gates and 23
critical module floors. Greptile reviewed all 18 files with no new comments;
all five earlier findings were addressed. This supersedes its pending notes below.

## Current combined batch

69 new regression cases accumulated locally before publication:

- 33 request/workspace cases: success, failures, correction context, cancellation
  during photo preparation and provider execution, replacement requests, profile
  navigation/reload, stale errors/progress, comparison controller cleanup,
  background DOM preservation, focus restoration and workspace ownership.
- 32 storage cases: archive validation before any writes, malformed photos,
  profile-scoped encrypted metadata, chronological reads, transaction-abort
  durability, corrupted export rejection and browser persistence permissions.
- Four real Chromium scenarios delay a stored-photo fetch, then cancel, close,
  switch profile or reload its data before releasing the response. None may
  restart analysis or affect the destination editor.

Analysis now owns a cancellation controller before asynchronous photo loading,
checks the original profile and data identity at every asynchronous boundary,
handles preparation failures, and ignores stale provider callbacks. Background
workspaces retain their original owner even if parking is repeated, and a failed
parking attempt does not create a resumable session.

## Focused local verification

- 80 relevant unit cases across four suites pass, including 65 new cases.
- Four new browser scenarios and three existing correction/cancellation/background
  workflows pass. Synthetic images/providers only; no live credentials or models.
- Independent request coverage: 91.59% lines, 51.61% functions, 94.87% branches,
  91.17% statements. Default dependency no-op functions remain in the denominator.
- Independent storage coverage: 89.69% lines, 80% functions, 73.07% branches,
  84.42% statements. Both modules receive new measured floors; all prior floors
  remain intact. Critical collection now has 43 explicit suites and 25 modules.
- Browser check-JS, strict-null, quality guards, architecture and production size
  checks pass. Existing production budgets remain unchanged.
- No complete local browser or coverage matrix was run. The new independent
  percentages do not establish a new project-wide or functional coverage score.

## Acceptance still required

Verify exact-final-head CI, complete production artifact and all 17 feature gates,
all 25 critical floors and full Greptile review. Address actionable findings in
this batch. Do not merge or deploy. Browser request tests exercise real module
and fetch lifecycles in a minimal DOM; the three existing browser workflows also
exercise the application UI.

---

# Chat persistence and retry reliability — 2026-09-22

## Verified starting point

PR [#1642](https://github.com/elkimek/get-based/pull/1642) merged as
`1ab14cc2e9ae326596a038a3b131362763cf07a6`. Final reviewed head was
`e5ac54cc500ff73e80b01b869b32f10421a126b3`; [CI run 35716944371](https://github.com/elkimek/get-based/actions/runs/35716944371)
measured 14,469/16,125 production functions (89.7302%), including 719/835
server functions (86.1078%). All 17 feature gates and 21 critical module floors
passed. Greptile's three findings were resolved before the authorized merge.

## Current combined batch

115 new regression cases: 99 accumulated locally before the initial publication,
then 16 focused cases for CI and review findings:

- 41 history cases: malformed and missing storage, write blocking/recovery,
  read/write/index failures, stale load/save results, message/personality snapshots,
  overlapping writes, confirmation/navigation races, clear rollback and pending
  save/clear ordering. Writes to the same conversation are serialized in this
  runtime; index metadata describes the persisted snapshot and failed saves
  report false. Clearing waits for pending writes and excludes competing saves.
- 23 retry cases: failed persistence, duplicate actions, changed profile/thread/
  history/tail, streaming, unavailable attachments, new drafts, refused/failed
  sends and restoration without overwriting accepted replacement messages.
  Retry preserves the original turn until Send passes approval and route checks.
- 38 edit/fork cases: eligibility, missing DOM, cancellation, whitespace,
  trimmed submissions, failed sends preserving edited text, duplicate submits,
  stale profile/thread/message identity, keyboard actions and destination draft
  restoration after a fork. Editing is scoped to the original profile and message.
- Twelve new real-browser scenarios: message/index storage failures prevent provider
  requests; refused retry consent preserves the response; duplicate clicks while
  saving do not duplicate messages; new drafts survive an earlier send; navigation
  during retry consent cannot persist a shortened original transcript.

The review follow-up compensates a partial save by restoring exact prior stored
bytes and only the metadata fields still owned by that save. Compensation cannot
overwrite a detected external write; failure blocks further writes until reload.
Retry payloads now bypass the live composer entirely. Successful sends consume
only their captured attachment objects. Failed edited-send persistence restores
the edit session and revision. Fork creation persists its body before publishing
its index entry and switches context only after both writes succeed.

CI also identified an obsolete source-signature check and a race fixture that
switched profiles before its promised write began. The fixtures now distinguish
navigation during reading from navigation during an already-started write; an
additional regression protects the former case.

Send now waits for successful persistence before contacting the provider and
clearing the submitted composer state. On failure it restores the conversation
in memory and preserves the normal prompt/attachments for retry. New composer
input or attachments added during persistence are retained.

## Focused local verification

- 157 relevant unit cases across seven suites passed (103 newly added across the batch).
- 22 relevant Chromium scenarios passed across chat actions, editing/forking and
  send/profile boundaries (twelve newly added); provider and consent boundaries use
  synthetic responses. No paid requests or downloaded models.
- Four selected legacy wrappers passed across focused runs; unrelated wrappers skipped.
- Browser check-JS TypeScript, strict-null, quality guards, architecture checks
  and production budgets passed. No exhaustive local browser/coverage matrix.
- Independent history coverage: 99.43% lines, 88.23% functions, 92.47% branches,
  97.23% statements. New floors: 99/88/92/96 respectively.
- Independent edit coverage: 98.57% lines, 84.21% functions, 92.15% branches,
  97.43% statements. New floors: 98/83/91/97 respectively.
- Critical CI collection now lists 39 explicit suites and 23 enforced modules.
  Existing floors and the complete production denominator remain in place.
- Production output measured 5,383,517 decoded bytes. Total-output allowance
  increases from 5,381,000 to 5,385,000 for these guards, retaining the established
  path-relocation margin. Startup remains 1,261,837 bytes in two files; startup
  and file-count limits are unchanged.

## Acceptance still required

The local measurements above are scoped, not a new project-wide percentage.
The combined PR still requires exact-head Actions, the complete production
coverage artifact with all 17 feature gates and 23 critical floors, and full
Greptile review with actionable findings resolved. Verify clean provenance and
synthetic merge parents. Browser/storage mocks do not prove live providers or
hardware integration. Per-runtime serialization is not a cross-tab transaction.

---

# Proxy and gateway failure handling — 2026-09-22

## Verified starting point

PR [#1641](https://github.com/elkimek/get-based/pull/1641) merged as
`cdc79d30ff24fc6fcbc5a6552c6c76f5dcc459ae`. Its final head was
`0b5dcf8b8df791d444463641770472224eff924f`; [CI run 35710752083](https://github.com/elkimek/get-based/actions/runs/35710752083)
measured 14,423/16,109 functions (89.5338%) and 673/819 server functions
(82.1734%). All 17 feature gates and 19 critical module floors passed, with
2,432 unit, 493 critical and 727 Chromium cases. Greptile reviewed all 12 files
with no findings. This supersedes that batch's pending acceptance notes below.

## Current combined batch

136 new regression cases: 127 accumulated locally for the initial combined publication,
plus nine review-driven lifecycle cases:

- 36 Hermes lifecycle cases: shared handshakes, early close/error, timeout,
  restart during connection, stale socket events, RPC failure/cancellation,
  streaming disconnect, early approval/error events, consumer callback failure,
  catalog refresh races and configuration failures. Active replies now settle
  promptly on disconnect/restart; cancellation and early errors release pending
  submission RPCs, listeners and timers. Old sockets cannot fail new requests.
- 24 Hermes registry cases: credential/URL rotation, removed routes, revoked or
  protected credentials, malformed/missing/oversized registries, discovery
  failures and close during discovery. Resolution rereads the registry; obsolete
  clients close, and refresh/close operations are serialized.
- 51 development API proxy cases: exchange/refresh grants for six providers,
  server credential requirements, mismatched client IDs, transport failures,
  declared/streamed response caps, interrupted responses, postal lookup parsing
  and coordinate rounding, and idle upstream timeouts. OAuth responses now use
  the existing cap; all four upstream paths receive a 180-second idle timeout.
- 14 compatibility-relay startup cases: bind/timeout configuration, startup
  failure, malformed HTTP, graceful/forced shutdown and simultaneous signals.
  Shutdown is idempotent and cancels its forced-exit timer after draining.
- 11 agent-host routing cases: unavailable/missing targets, failed discovery,
  private metadata filtering, model/refresh forwarding, catalog failure and login
  requirements. Unavailable targets cannot use a previously cached client.

## Focused local verification

- 172 cases across 11 directly relevant suites passed, with coverage restricted
  to the four affected production modules.
- 31 coverage-policy checks passed; the critical-config check also passed.
- Two selected legacy wrappers passed 169 helper and 40 security assertions;
  147 unrelated wrappers were skipped.
- Server TypeScript, strict-null, quality guards, architecture checks and
  production size budgets passed. No exhaustive local browser/coverage matrix.
- Hermes: 99.33% lines, 95.16% functions, 82.96% branches, 98.08% statements.
- Compatibility relay: 89.74% lines, 95.23% functions, 80.39% branches,
  90% statements. Both now have independent critical CI floors, making 21 modules
  across 36 explicit suites; all existing floors are preserved.
- The server feature floor rises from 75% to 82%, using the retained complete
  PR #1641 artifact. Other feature counters/provenance are refreshed from the
  same artifact. This is a previous-result ratchet, not this batch's measured
  global improvement. No collector mapping or denominator rules changed.

## Review follow-up

Greptile reviewed all 13 files at `cd636a1e` and identified two lifecycle issues.
The combined fix preserves established clients across temporary profile-probe
failure while refusing new work on unavailable routes. Credential rotation and
removal still revoke old clients. A terminal provider flag prevents queued,
in-flight and later discovery from recreating clients during shutdown, including
shutdown racing credential rotation. Five added regression cases cover these
sequences. The 60 directly affected Hermes cases and server typecheck pass.

The second full review identified non-default route IDs disappearing during a
sustained profile-probe outage. Cached, credential-bound profile metadata now
preserves their IDs and labels as unavailable; successful rediscovery updates
that metadata, while removal or credential/endpoint changes invalidate it.
Four more cases cover sustained outages and cache invalidation. All 64 affected
Hermes cases and server typecheck pass; independent coverage floors are retained.

## Acceptance still required

Exact-final-head CI, complete production-coverage artifact, all 17 feature gates,
all 21 critical floors and full Greptile review remain required before acceptance.
Local gateway tests use deterministic transports; OAuth tests do not contact
providers. Existing relay tests use real loopback HTTP. No live credentials,
installed-agent/model integration, hardware validation, merge or deployment is
claimed.

---

# Server lifecycle and storage boundaries — 2026-09-22

## Verified starting point

PR [#1640](https://github.com/elkimek/get-based/pull/1640) merged as
`d50db4b038a6d90965a4541cb1800a912e63d60c`. Its final reviewed head was
`4502455fbaa77b7198acd3ddfdac985e03eca3d8`.
[Final CI](https://github.com/elkimek/get-based/actions/runs/35706359198)
passed 2,325 unit cases, 372 critical cases and 727 Chromium cases (9 skipped).
All 17 feature gates passed; Greptile reviewed all 16 files with zero comments.
The complete report measured 14,368/16,109 functions (89.1924%), including
75.2137% server/companion functions. Its clean synthetic merge was
`89a33d53c785e8c4508be9504b642bbf4e766161`, whose parents were verified to
include that exact head. This supersedes the older pending acceptance below.

## Current combined batch

107 new regression cases accumulated locally before publication:

- 29 companion bootstrap cases exercise adapter wiring, authentication states,
  allowed origins, port validation/retry, runtime recovery and shutdown. Shutdown
  previously waited for HTTP draining before closing the clients needed to finish
  those requests. It now begins listener closure, settles all client closes, then
  waits for draining and removes the workspace. A failed client close no longer
  skips other clients or workspace cleanup.
- 23 development-host lifecycle cases cover disabled/unavailable discovery,
  refresh, partial readiness banners, invalid ports, legacy CRLF output and
  shutdown. The previous parser could publish port 83 from the first fragment of
  port 8325 and disclose the bearer token for that incomplete endpoint. It now
  accepts only a complete, bounded readiness line with a valid port. Late output
  cannot revive availability after child failure/exit or explicit close; close
  is idempotent.
- 18 real loopback profile-share HTTP cases cover declared/chunked body limits,
  disconnects, malformed origins, trusted identity selection, masked handler/body
  errors and response privacy headers.
- 13 profile-share startup cases cover configuration, health-check/listen failure,
  maintenance errors and shutdown. Startup failures now close the owned store and
  cancel maintenance. Concurrent signals share one shutdown, and successful
  closure cancels the forced-exit timer.
- 24 real SQLite storage cases cover cancellation, path validation, host disk
  reserve, UTF-8 size limits, conflict classification, persistence, private file
  permissions, pagination and daily keyed identities. A SQLite trigger forces
  failure on the second deletion, proving rollback restores the earlier deletion.

Negative checks reproduced seven discovery failures, three companion shutdown
failures (including two unhandled rejections), and three profile-share startup
failures before the corresponding fixes.

## Focused verification

121 cases across eight directly relevant suites pass with scoped coverage; 91
related service, listener, runtime-control, bundle, share-transition and coverage
policy cases also pass. Server typecheck, strict-null, architecture generation,
17 quality guards, production budgets and diff whitespace checks pass. Only
focused local tests were run; the full browser and combined matrix belongs to CI.

| Module | Functions | Branches | Lines | Statements |
| --- | ---: | ---: | ---: | ---: |
| Companion entrypoint | 100% | 92.75% | 100% | 100% |
| Development host | 100% | 92.04% | 98.86% | 97.22% |
| Profile-share server | 96.87% | 86.02% | 95.12% | 94.44% |
| SQLite store | 100% | 84.81% | 98.14% | 95.68% |

Four new independently enforced module floors bring the critical configuration
to 19 source modules across 31 explicit suites. Existing floors are preserved.
The server/companion feature minimum increases 72 → 75 using the retained #1640
complete report, not this batch's scoped measurement. All 17 feature floors were
revalidated against that report and its exact provenance is recorded.

## Pending acceptance and limits

This batch requires its own exact-head Actions result, retained complete coverage
artifact, all 17 feature gates, and full Greptile review with findings resolved.
There are no collector matching changes or new denominator exclusions. The 55
unmapped ranges in the retained report remain excluded.

Bootstrap/startup tests execute the real orchestration with mocked process,
agent-client and listener boundaries. They establish orchestration behavior,
not installed CLI compatibility, operating-system service integration or hardware
inference. HTTP and storage tests use real loopback sockets and small isolated
SQLite files. Do not infer 100% functional correctness from function coverage.

---

# Companion transport and CLI coverage — 2026-09-22

## Verified starting point

PR [#1639](https://github.com/elkimek/get-based/pull/1639) was squash merged as
`d386f3751b62c0787a5c6bc55d21c48ebe970cc3` after explicit administrator-override
authorization. Its reviewed head was `a37de6085239cf841a4523233ee654a85618dd32`.
[Final CI](https://github.com/elkimek/get-based/actions/runs/35701715003) passed:
2,249 unit cases, 727 Chromium cases (9 skipped), critical coverage and all 17
feature gates. Greptile rated the final head 5/5 with no actionable findings.
The complete report measured 14,341/16,100 functions (89.0745%) and 83.1529%
bytes against synthetic merge `3bcd7868a78b67c58e28055dc50256a06dfc809b`.
Optional model/release jobs were skipped; these were not acceptance evidence.

## Current local batch

76 new regression cases across CLI protocol and cancellation, private-file
creation races, child-process failures, real Node subprocesses and compatibility
proxy transport. The seven focused suites contain 89 cases including 13 existing
ones. No installed model CLI, credentials, model downloads or hardware are used.

- Both one-shot adapters reject pre-cancelled work without spawning and settle
  active cancellation/restart even when a child does not acknowledge SIGTERM.
  Process and stdin failures are observed immediately. Claude process failures
  interrupt a stalled stdout iterator; failed input writes no longer orphan the
  tracked turn.
- Await all private-file writes/opens before cleaning up a failed preparation.
  Retain and close successful sibling handles after another open fails. Close
  handles before unlinking, and retry cleanup when child stdio closes for systems
  that keep inherited files locked. Cancellation during preparation prevents spawn.
- Preserve Claude streamed/final text semantics, resumed sessions and restrictions;
  verify OpenClaw failed model discovery can recover on retry.
- Proxy stream piping now destroys/cancels the upstream body when its downstream
  connection closes. Real loopback tests also cover failed handlers, invalid
  origins, stream errors, forwarded origins and body-free responses.
- The failure tests reproduced hangs, unhandled rejection, private-file races and
  a missing upstream cancellation before their fixes. Four tests additionally use
  actual small Node child processes for successful output and SIGTERM cancellation.

## Scoped measurements and gates

| Module | Functions | Branches | Lines | Statements |
| --- | ---: | ---: | ---: | ---: |
| Process lifecycle | 91.66% | 100% | 100% | 100% |
| Claude adapter | 100% | 91.35% | 100% | 100% |
| OpenClaw adapter | 90.32% | 86.74% | 99.21% | 95.09% |

Added independent floors for these three modules, preserving every existing
critical floor. The bounded critical configuration now lists 23 suites and 15
source modules. Only the relevant added suites were run locally; CI runs their
combination with the previous critical suites.

Global function floor increases 88 → 89 and knowledge/voice 81 → 85, using the
retained complete PR #1639 report. All 17 feature floors were revalidated against
that report, and its head/run/synthetic-merge provenance is retained. These floor
changes reflect the merged batch, not a new whole-project local measurement.

Local verification: 89 focused cases with scoped coverage, 61 related host,
bundle and coverage-policy cases, server typecheck, strict-null ratchet,
architecture generation/check, 17 static quality gates, production size budgets
and diff whitespace checks passed. No exhaustive local browser/coverage run.

The initial CI run passed all 369 critical cases but uncovered incidental local
coverage of OpenClaw ambient configuration and late cancellation. Three explicit
fixtures now cover those paths deterministically (76 new cases total); all 79
relevant CLI cases pass together. Coverage floors remain unchanged. Greptile
reviewed all 16 files on the initial head with zero comments; the revised head
still needs its own acceptance.

## Remaining acceptance and limits

Await exact-head CI, complete production coverage and Greptile on this batch.
Do not substitute previous-head checks. The proxy module's focused measurement
is 57.14% functions / 67.34% branches because startup, process-signal orchestration
and lazy default-handler loading remain outside this adapter test scope. Its
production denominator is preserved. The previous complete report's 55 unmapped
ranges remain excluded; this batch changes no collector matching rules.

Cancellation requests SIGTERM and settles the caller; it cannot guarantee death
of an uncooperative third-party process. Deferred cleanup retries once on close.
The real subprocess fixtures prove Node transport behavior, not actual installed
agent compatibility or Windows filesystem semantics. No hardware/model coverage
claim is made.

---

# Runtime coverage hardening — 2026-09-22

## Verified starting point

PR [#1638](https://github.com/elkimek/get-based/pull/1638) merged as
`c5a2d73d341a11103aeffb38502d1e817dcc3bca`. Its final head was
`0ebfa8235e4d8aeff2dadbcf3046a95f9ee5027a`.
[Final CI](https://github.com/elkimek/get-based/actions/runs/35694525579)
passed 727 Chromium cases (9 skipped) and measured 14,303/16,097 production
functions (88.8551%); all 17 feature gates passed. Greptile reviewed that head
with no outstanding actionable findings. This supersedes the historical
pending-CI notes below.

The retained report's synthetic merge commit is
`565171599e57bfb18d3d23f3f912d88c1978e6ca`, not the eventual squash commit.
The baseline preserves this provenance. This batch raises the global minimum
79.5 → 88, PWA 56 → 88, server/companion 64 → 72, and knowledge/voice 79 → 81.
All updated floors pass against the retained complete report; no thresholds
are reduced and no new whole-project percentage is claimed from local tests.

## Current batch

- 96 new behavior cases: 20 TTS worker and 22 STT worker protocol/model lifecycle,
  17 companion HTTP boundary (including real loopback transport), 12 update
  failures, two listener recoveries, 12 additional RPC lifecycle cases and
  11 progressive-audio failure cases.
- Fixed stale model reuse after failed disposal and late disposal clearing a
  replacement model in both speech workers. Bounded MediaSource opening, provider
  reads and decoder appends so stalled playback rejects and cleans up. Fixed listener handler leakage when port publication throws.
  Focused negative checks failed against each old implementation, then passed
  with the fixes restored.
- Extracted the existing companion HTTP adapter without changing its request
  limits, headers, response/error semantics or abort propagation, allowing direct
  tests without starting installed agents or touching real agent credentials.
- Expanded independent branch/function/line/statement gates from three to twelve
  runtime modules. The explicit local suite contains 17 files; it is not the
  exhaustive project coverage suite.
- Pinned OpenRouter catalog responses in two additional mobile nutrition scenarios
  so provider refreshes cannot race their seeded model choices.

## Measurement audit and limits

The previous report counted the TTS worker as 0/20. Browser page V8 coverage does
not establish dedicated-worker coverage, and existing voice tests predominantly
mocked the worker caller. The new direct worker harness attributes real module
execution through Vitest while stubbing only the external model package. It
measures 90% functions, 95.91% branches and 99.28% lines in the focused suite.
This is new behavior coverage, not a relaxed collector mapping rule. It does not
prove actual model quality, model downloads or physical GPU compatibility.

The previous companion entrypoint was 0/32. Its extracted HTTP boundary is now
covered directly, including a real socket test; bootstrap discovery, installed
agent lifecycle and process-signal orchestration remain separate integration
boundaries. We neither remove these from the production denominator nor mark
subprocess execution as covered without attributable evidence.

The retained report still has 54 unmapped executed collector ranges across 34
files, including zero-length synthetic entries. They remain excluded rather
than being matched speculatively. This batch makes no collector identity changes.

The extension brings STT worker coverage to 91.86% branches and 98.95% lines.
Codex RPC branch coverage increases 77.5 → 85%, ACP 80.95 → 83.33%, and voice
playback 73.18 → 74.71% branches (79.31 → 87.35% functions). Each improvement
has a corresponding raised committed critical gate; these are scoped metrics.

The first PR #1639 CI run stopped before full coverage at Firefox's five-second
wait for `registration.installing` to clear after a failed install. That assertion
now reports the current worker state and uses the same 30-second lifecycle budget
as activation, while still requiring no installing worker before retry. None of
the offline, failed-update, two-tab activation or retained-data checks are removed.

## Verification

- 293 focused cases in the expanded critical suite, enforcing all twelve modules.
- 33 additional coverage-gate/configuration/bundle checks.
- Two changed Chromium mobile nutrition scenarios, two targeted Chromium voice
  scenarios and two repetitions of the failing Firefox PWA lifecycle scenario.
- CheckJs, server types, strict-null ratchet, architecture checks, all 17 static
  quality guards and production budgets.
- Final combined coverage and review on the new PR head remain CI acceptance.
  No exhaustive local matrix, model download, merge or deployment was performed.

---

# Original quality review — acceptance tracker

PR [#1637](https://github.com/elkimek/get-based/pull/1637) merged on 2026-09-22
at `224ed016651f3da7ed9b074a94329fcf78faafbf`. Its final head was
`82f025da171751bbdb90c936db17d9356f4aedee`. The previous local-only and pending-CI
statements are superseded by the verified evidence below.

| Original requirement | Verified evidence | Remaining boundary |
| --- | --- | --- |
| 1. PWA reliability and green CI | Corrected returning-user fixture; focused Firefox repetitions passed; final PR Actions passed. | Future changes must retain offline/data-retention assertions. |
| 2. Complete attributable coverage and measured floors | Complete production denominator and retained per-file/feature artifacts; final CI measured 88.24% functions and 82.99% bytes. Critical branch floors enforced independently. | This continuation adds measured floors for all 17 feature groups and corrects collector mapping; fresh CI acceptance is pending. Uncertain collector ranges remain excluded and reported. |
| 3. Critical functional regressions | Import/restore, async profile isolation, agent proposals, chat edit/retry/reload, notes, manual migration/concurrency, backup failures and offline tests passed full CI. | Synthetic companion protocol acceptance does not imply live installed CLI/provider acceptance. |
| 4. Principal data contracts | Explicit lab/provenance, chat, notes, nutrition, supplement, profile context and biometric contracts; CheckJs/server/strict-null gates passed. | Progressive core hardening, not elimination of every `any` or all shared state. |
| 5. Controlled real integrations | Exact-head release-evidence regression plus real MiniLM and Kokoro/Whisper WASM jobs passed. | Paid providers, physical GPU and larger models require separate acceptance; no such claim is made. |
| 6. Security and state coupling | Removed token-bearing occupied-port probe; explicit biology profile boundary; CodeQL passed. GitHub alert 120 is fixed, verified 2026-09-22. | Broader same-user host trust assumptions remain outside this specific remediation. |

## Retained remote evidence

- [Full tests and production coverage](https://github.com/elkimek/get-based/actions/runs/35620728573).
- [Release evidence, regression and both real-model scenarios](https://github.com/elkimek/get-based/actions/runs/35620729253).
- [CodeQL analysis](https://github.com/elkimek/get-based/actions/runs/35620728755).
- [Sync transport and three-browser checks](https://github.com/elkimek/get-based/actions/runs/35620728608).
- Greptile check passed on the final PR head; no outstanding actionable findings.

The coverage artifact identifies GitHub's synthetic merge commit `86131497`,
which differs from both the PR head and the eventual squash merge. The baseline
records all relevant provenance rather than relabeling that report as a main run.

## Coverage continuation verification

- 40 focused coverage-source and coverage-gate assertions pass, including negative
  feature regression, missing/duplicate groups and source-range ambiguity checks.
- Four companion-client tests pass with coverage restricted to that single module;
  all 15 executed collector functions map to their AST identities.
- All 17 new feature floors pass when evaluated against the retained complete CI
  report. The global floor stays 79.50%; feature floors round that report's measured
  values down to whole percentage points.
- Diagnostic replay recognizes 216 of 270 previously unmapped collector ranges.
  This is not a new global percentage; full CI owns that measurement.
- No exhaustive local browser or coverage matrix was run.

Fresh CI and review for the continuation remain required before its acceptance.

## Larger local batch — 2026-09-22 (not pushed)

The user requested larger slices before invoking remote CI. Subsequent work stays
local in `codex/coverage-mapping-hardening`; the published PR head does not include
this batch yet.

- Added 20 companion RPC failure-boundary cases across Codex and ACP: failed
  serialization, synchronous and callback write errors, stdin error events,
  timeouts/late replies, process replacement, initialization retry, shutdown and
  malformed protocol input. Nine cases failed before the transport fixes.
- Fixed pending-request/timer leaks on failed writes and handled stdin errors
  without allowing events from replaced processes to affect the active client.
- Service-worker network cache writes now extend the fetch event lifetime while
  returning the network response promptly. Added seven cases covering write
  completion, quota errors, partial/error responses, activation failures and
  update-message origins.
- Fixed both Greptile findings locally: percentages must parse in full, and feature
  floors cannot be lower than their rounded recorded reference counts. Missing or
  invalid reference counts are rejected; deliberate tightening remains allowed.
- 57 focused runtime tests passed with coverage restricted to three changed
  modules. The separate gate/source tests also pass (31 and 22 cases). No global
  coverage result is inferred from these selected tests.

| Selected module | Function execution | Branches | Lines |
| --- | ---: | ---: | ---: |
| Service-worker runtime | 94.73% | 84.09% | 96.52% |
| ACP client | 85.10% | 80.95% | 95.41% |
| Codex app-server client | 86.95% | 77.50% | 96.19% |

The existing Chromium cold offline relaunch scenario passed (one spec, 2.7s).
Server and service-worker typechecks, all 17 quality guards, production output
budgets and diff whitespace checks passed. No full local suite was run, no
threshold was reduced, and no push was made for this batch.

## Local voice playback continuation — 2026-09-22 (not pushed)

Added 12 failure-path tests for HTML playback errors/abort, asynchronous decoding
and replacement, activation cancellation, source-start failure, and PCM cancellation
after the producer finishes. The new regressions exposed and now protect four fixes:

- Synchronous HTML `play()` failure releases listeners, player state and blob URLs.
- A stopped or replaced Web Audio decode cannot start later or trigger an obsolete
  HTML fallback when decoding rejects.
- A failed Web Audio `start()` disconnects the source before fallback.
- Stop/abort settles PCM playback even after generation ends, stopping and
  disconnecting only sources owned by that playback session.

Both relevant voice test files pass: 45 cases, including 33 existing voice runtime
regressions. CheckJs, all 17 quality guards, production budgets and whitespace
checks pass. No model download, paid inference, whole-project coverage run or push
was performed. These mock-based failure tests verify lifecycle behavior, not
physical audio-device quality or complete browser compatibility.

Selected voice-player coverage: 77.1% functions, 68.51% branches, 90.48% lines. These values come only from the two selected voice test files.

## Combined batch ready for PR/CI acceptance

The local checkpoints above are historical: their changes are now being published
as one combined update to PR #1638, rather than triggering CI after each increment.
The final voice slice adds six more cases covering buffered-provider cancellation,
PCM activation cancellation, and stopped MediaSource opening late. All 18 new
voice lifecycle cases plus 33 existing voice cases pass. Buffered reads are
cancelled on Stop/abort/replacement, obsolete preparation cannot resume, and
MediaSource lifecycle listeners are released when playback stops.

The batch adds 58 regression cases beyond the initial PR head: 13 gate validation,
seven PWA runtime, 20 companion RPC and 18 voice lifecycle cases. Across the eight
relevant unit-test files, 161 cases pass. Three targeted browser scenarios passed:
PWA cold offline relaunch, managed buffered voice playback, and chat voice controls.
Server/service-worker/CheckJs typechecks, 17 quality guards, production budgets,
and diff checks pass. No exhaustive local suite or model download was run.

Fresh whole-project CI coverage and complete review of the combined head are the
remaining acceptance gate. Do not extrapolate the selected local coverage samples
to a new project score, or treat older PR checks as evidence for this batch.

## CI correction after the combined push

The first combined-head CI stopped at the strict-null gate with two voice-player
diagnostics that the non-strict CheckJs run did not detect. The correction declares
the optional abort reason as unknown and snapshots/narrows the final PCM promise
before entering its callback. No baseline was changed. The strict-null gate now
passes with zero diagnostics, and both focused voice files pass all 51 tests.
Fresh CI and Greptile acceptance still remain pending.
