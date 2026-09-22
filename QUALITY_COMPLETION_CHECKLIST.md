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
