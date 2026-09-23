# Repository agent instructions

## Test scope and disk writes

- Every local test run must be change-scoped to avoid unnecessary SSD writes.
  Run only the unit tests, Playwright specs (or individual cases), and
  lightweight static gates relevant to the diff and its directly affected
  behavior. Identify that scope before starting a command.
- Do not run bare `npm test`, unfiltered `npx playwright test`, all-browser
  matrices, or repository-wide coverage for a scoped change. Keep coverage
  disabled unless a specific changed behavior or failing coverage gate needs it.
- Once relevant checks pass, do not repeat or broaden them unless a new edit,
  failure, or concrete unresolved concern justifies the additional run.
- Do not interpret requests such as "make sure", "fully verify", or "100%" as
  permission to run the complete local browser or coverage matrix.
- Pull requests run affected tests selected by `scripts/pr-test-scope.mjs`.
  Full Chromium and combined coverage run on main, manual CI runs, and explicit
  release verification. A selective PR result is not full-suite evidence.
- The automatic selector is for CI. Its dry-run plan does not authorize running
  every selected case locally; choose the relevant local subset explicitly.
- Before running a local command expected to produce more than 1 GB of disk
  writes, obtain explicit user approval in the current conversation.
- `./run-tests.sh` and `npm run test:playwright` are intentionally guarded
  outside CI. Set `GETBASED_ALLOW_HIGH_WRITE_TESTS=1` only after that explicit
  approval. Never set `CI=true` locally to bypass the disk-write guard.
- Prefer focused commands such as:
  - `npm test -- tests/<relevant-test>.test.js`
  - `npx playwright test tests/playwright/<relevant-spec>.spec.js`
  - `npx playwright test tests/playwright/<relevant-spec>.spec.js --grep '<relevant case>'`
- When CI fails, inspect the failing job and reproduce only the failing or
  directly related tests locally.
