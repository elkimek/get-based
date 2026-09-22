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
