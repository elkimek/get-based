# Original quality review — acceptance tracker

This supersedes claims that completing a selected local batch finished the original
six-item review. Publishing and ready-PR review are now authorized; **CI acceptance is pending**, not complete. Work is local on
`codex/code-quality-hardening` in `/tmp/getbased-quality-hardening`.

| Original requirement | Implemented and locally verified | Acceptance still outstanding |
| --- | --- | --- |
| 1. Resolve Firefox PWA failure and obtain green exact-revision CI | Returning-user notice fixture corrected without weakening offline/data-retention assertions; targeted Firefox repeats passed. | Full exact-revision CI, including browser matrix, has not run. Nothing is merged into main. |
| 2. Complete, attributable coverage; honest rebaseline | All first-party roots inventoried, AST identities, retained JSON/HTML/feature reports, unchanged global floor. New independently enforced critical module branch floors pass 71 selected tests; omitted tests fail the gate. | Full revised-denominator report and measured per-feature rebaseline remain required. No project-wide percentage or new global score is asserted. |
| 3. Critical behavior independent of global coverage | Import/persist/reload, async profile isolation, proposals, chat edit/retry, note/delete, manual migration/concurrency, backup failures and offline paths have focused evidence in the workflow inventory. | Exact-revision full CI must confirm these additions coexist with existing tests. Live installed CLI/provider acceptance remains distinct from the synthetic companion journey. |
| 4. Strengthen principal data contracts | Lab/provenance, chat, notes, nutrition, supplements, health goals, diagnoses/family history, lifestyle and biometrics have explicit types. Legacy string context is distinguished from normalized records; extensions require narrowing. CheckJs and zero-debt strict-null pass. | No claim that every `any` in the application is removed: the original recommendation was progressive core-contract hardening, not a full strict-TypeScript rewrite. |
| 5. Controlled real-integration release evidence | Real MiniLM and small Kokoro/Whisper scenarios passed locally on WASM. An opt-in manual/labeled-PR release-evidence workflow now requires full regression plus both real-model jobs on the same revision. | The new gate has not run remotely. Live providers/installed CLI and optional GPU/large-model behavior require separate account/hardware evidence; no paid inference was authorized or performed. |
| 6. Security triage and reduced state coupling | Removed installation-token HTTP probe on occupied configured ports; unavailable discovery withholds the token. Lifecycle tests pass. Biology context now has a typed explicit-profile calculation boundary, with four snapshot-isolation tests plus existing regression checks. | GitHub CodeQL rescan/alert disposition remains external. Shared application state still exists; no claim of a complete application rewrite or elimination of every host trust assumption. |

## New verification in this continuation

- Critical branch gate: 71 tests / exactly five files passed. Negative run with
  journal tests alone correctly failed proposal/note thresholds.
- Dev companion and bounded gate configuration: nine tests passed.
- Biology context, import and manual-deletion compatibility: 87 tests passed.
- Explicit profile snapshot plus existing light dependencies: 12 tests passed.
- CheckJs, server types, strict-null (zero diagnostics), 17 quality guards and
  architecture (784 modules, no cycles) pass. Workflow YAML parses.
- A first config version accidentally merged the broad unit-test include list.
  That run was terminated as soon as unrelated tests appeared. Its results are
  not acceptance evidence. The corrected config uses direct overrides and has a
  regression guard for its explicit file lists. No full suite completed.

Evidence is in `/tmp/getbased-critical-gate-focused.log`,
`/tmp/getbased-critical-negative.log`, `/tmp/getbased-security-config-tests.log`,
`/tmp/getbased-core-context-tests.log`, `/tmp/getbased-context-snapshot-tests.log`,
`/tmp/getbased-context-refactor-types.log`, `/tmp/getbased-final-server-types.log`,
`/tmp/getbased-final-context-strict.log`, and `/tmp/getbased-reopened-quality.log`.

## Publishing authorization

The user has now authorized publishing this branch as a ready PR, watching Actions
and Greptile, requesting review beyond the file-count limit, and fixing findings.
This supersedes the earlier local-only instruction. Merging and deployment remain
outside that authorization. CI and external review must pass before acceptance.

## Follow-up: verify inference actually ran

The opt-in real-model workflow now validates its Playwright JSON report before
acceptance. Exactly one selected scenario must have a single passed result; skipped,
flaky, failed, wrong-scenario and report-error outcomes fail the gate. Eight focused
verifier cases pass. The actual MiniLM scenario was rerun specifically to validate
this new report boundary: one case passed in 5.4 seconds on WASM and its unmodified
JSON report passed the verifier. No additional model tier or full suite was run.
Evidence: `/tmp/getbased-real-model-gate-check.log` and
`/tmp/getbased-real-model-gate-report.json`.

Publishing is authorized. The remaining acceptance work is the exact-revision CI
run, revised coverage report and feature baseline, real-model release gate, and
CodeQL/Greptile review. These remain pending until their actual results are inspected.
