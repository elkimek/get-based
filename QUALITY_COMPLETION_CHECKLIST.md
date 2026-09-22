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
