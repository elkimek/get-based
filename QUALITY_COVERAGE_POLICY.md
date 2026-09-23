# Coverage and critical-workflow expectations

Function execution coverage and functional workflow protection are separate
evidence. A high global percentage cannot replace the following assertions.

| Area | Required behavior | Focused evidence |
| --- | --- | --- |
| Lab import and restore | Reject invalid/duplicate values before mutation; retain canonical units, raw provenance and unrelated restored markers; reject aborted writes and roll back edits | `tests/import-data-integrity.test.js`, `tests/import-provenance.test.js`, `tests/playwright/import-data-integrity.spec.js` |
| Profile isolation | Late responses and consent completion must not modify a different profile or thread; failed reads must block saves | `tests/chat-profile-races.test.js`, `tests/profile-persistence.test.js`, `tests/playwright/chat-send-profile-boundary.spec.js` |
| Agent chat | Real application send → companion protocol → actual marker tool → response receipt → persisted answer; edit and resend survives reload | `tests/playwright/agent-chat-workflow.spec.js` |
| Agent failures | Retry only invalid session/agent/target once; do not replay generic failures; failed negotiation sends nothing; reuse uploads on session recovery | `tests/agent-chat-backend.test.js` |
| Chat editing | Cancel preserves the composer draft; retry stays in the thread; fork preserves the source | `tests/playwright/chat-message-edit.spec.js` plus the real send path above |
| Offline updates | Failed update preserves data; retry activates; both tabs retain local data | `tests/pwa/lifecycle.spec.js` |
| Notes and agent proposals | Do not announce success before commit; preserve records and drafts on failed writes; interrupted proposal application remains non-actionable until reviewed | `tests/notes-safety.test.js`, `tests/agent-draft-persistence.test.js`, corresponding focused browser specs |
| Manual biometrics | Writes, tombstones, and migration metadata stay with the originating profile; failed deletion intent preserves wearable rows | `tests/manual-profile-boundaries.test.js`, `tests/manual-heart-rate-deletion.test.js`, `tests/playwright/manual-profile-persistence.spec.js` |
| Light context | Read total vitamin D from canonical entries with units; do not substitute D3 or retain another profile's values | `tests/lab-vitamin-d-context.test.js`, `tests/test-light-ai-renders.js` |
| Knowledge and voice | Actual model inference, meaningful search ordering and cached reload; actual speech round trip | Both selected WASM scenarios passed in release-evidence CI on PR #1637 head `82f025da` |

These behavioral tests remain independently failing assertions in CI, regardless
of aggregate coverage. Keep local runs limited to the affected rows.

## Test execution scope

Pull requests run the affected suites selected by `scripts/pr-test-scope.mjs`,
without whole-project coverage. The plan is retained as a CI artifact and its
counts and broader-scope reasons appear in the job summary. Main-branch pushes,
manual test runs, and explicit release verification retain the full regression
suite, critical branch floors, and combined production-coverage gates. A passing
selective PR check does not establish a new whole-project coverage measurement.

Selection follows literal imports and file references, including transitive
consumers, deleted-module references, changed tests, and individual legacy test
cases. Provider catalog modules have an explicit feature-suite boundary because
following their `api.js` barrel through startup would select almost every UI
suite. Keep that boundary current when adding provider or model-selector flows.
Shared dependencies or test harness changes deliberately select broader affected
suites. A runtime module with no selected test coverage blocks selection until
its test references or explicit scope are added; unrelated tests cannot mask it.

The automatic runner is GitHub Actions-only. Local verification must use explicit
relevant files or cases, with coverage disabled unless specifically needed; see
`AGENTS.md`. Never run the planned CI matrix locally just because it is listed.

## Measurement policy

The combined collector inventories first-party production roots, including
never-imported modules. Functions are identified by source ranges, not names.
The `production-coverage` artifact retains all file results, 17 feature groups,
unmapped collector ranges, commit SHA and working-tree status. Feature groups are
filename-based review aids, not architectural boundaries or branch coverage.

The global 79.50% function floor remains unchanged. The retained complete CI
report from [run 35620728573](https://github.com/elkimek/get-based/actions/runs/35620728573)
measured 88.24% function execution and 82.99% source-byte coverage on PR #1637
head `82f025da` (synthetic merge commit `86131497`). These are execution metrics,
not proof that all behaviors or branches are protected.

`scripts/coverage-baseline.json` records the source run, head, report commit and
called/total counts for every feature. Each feature floor is its measured function
percentage rounded down to a whole percentage point. Retained reference counts
are validated; floors below that rounded measurement fail. Deliberately tighter
floors are allowed. Percentage values must parse in full. All 17 groups must be present;
missing, duplicate, newly unbaselined or malformed groups fail closed. Another
feature's improvement cannot compensate for a regression. Review changes to feature
classification and baselines explicitly; do not lower floors just to pass CI.

Collector mapping accepts exact AST name spans only for Istanbul and recognizes
an indented closing-brace line boundary. The original report had 270 unmapped
executed ranges; these rules recognize 216 of those ranges when interpreted as
Istanbul locations. This is diagnostic replay, not a new whole-project measurement:
some functions were already counted from another collector. The remaining ranges
stay visible and excluded rather than being attributed by broad overlap. Fresh
combined CI must establish the new measured result.

## Real integration boundary

The manual workflow runs only one selected scenario on the chosen revision.
Knowledge downloads MiniLM and tests indexing/search/cache reuse; voice explicitly
uses WASM for Kokoro and Whisper's small tier. It has a 20-minute job limit,
one browser worker, no traces, no scheduled trigger and no paid provider calls.
Dispatch deliberately authorizes model downloads on the CI runner. It is not
proof of WebGPU, larger Whisper tiers, provider billing or live CLI compatibility.
Those remain separate release evidence requiring appropriate hardware/accounts.
The two individual small WASM scenarios were run locally in the follow-on goal.
The release-evidence workflow subsequently passed both WASM scenarios on PR #1637.
Larger voice models, GPU execution and paid providers remain separate acceptance.

## Critical branch floors

`npm run test:critical-coverage` runs exactly five selected test files. The three
covered modules have independently enforced line, statement, function and branch
floors; another feature cannot compensate for a regression. Current branch floors
are 100% for the claim journal, 89% for proposal application/rendering, and 82% for
notes. They were set from passing focused measurements, without changing the
79.50% complete-production function floor. CI runs this gate before browser work
and retains its summary artifact. A negative run containing only journal tests
fails the proposal and note floors, demonstrating missing tests cannot pass.
The bounded-config regression prevents inheritance of the broad test include glob.
These are selected critical module gates, not complete per-feature global floors.
The separate feature floors above use the retained complete CI report.

## Security triage and remediation: CodeQL alert 120

The original occupied-port probe sent the stored installation bearer token to an
unidentified process at a loopback address. Loopback and blocked redirects did not
prove the receiving process was the intended companion.

The probe has been removed. When an explicitly configured port is occupied, the
development companion now reports unavailable and exposes no token in its discovery
result. It does not make an HTTP request to the occupying process. Automatic-port
startup still follows the child companion to its available port. This intentionally
replaces implicit reuse on a configured-port conflict with an actionable conflict
message; stop the other process or select another port. Eight focused lifecycle
tests pass, including no fetch/token disclosure on conflict and normal startup.

GitHub reports alert 120 as fixed as of 2026-09-22 05:10:44 UTC after the merge;
it was not dismissed or suppressed. Other same-user filesystem/process
trust assumptions remain; removing this probe is not a complete local-host threat
model or an authenticated transport redesign.

## Release verification gate

The manually dispatched (or explicitly `run-release-evidence`-labeled PR)
`release-evidence.yml` reuses the full regression workflow
and both real-model scenarios on the selected revision. Its final acceptance job
requires all three to pass. It does not deploy. Dispatch authorizes the explicitly
selected CI model downloads; the workflow has not been dispatched for this local
revision. Live paid providers, physical hardware and human acceptance remain
separate evidence. The real-model input is validated before executing tests.

Real-model acceptance additionally validates the JSON execution report with
`scripts/verify-real-model-evidence.mjs`: one selected test must actually pass,
with no skips, flaky retries or report errors. A green command with skipped
inference is not accepted as integration evidence.
