# Repository agent instructions

## Test scope and disk writes

- Default to change-scoped verification. Run only the unit tests, Playwright
  specs, and lightweight static gates relevant to the diff.
- Do not interpret requests such as "make sure", "fully verify", or "100%" as
  permission to run the complete local browser or coverage matrix.
- GitHub Actions owns the exhaustive Chromium and combined-coverage run.
- Before running a local command expected to produce more than 1 GB of disk
  writes, obtain explicit user approval in the current conversation.
- `./run-tests.sh` and `npm run test:playwright` are intentionally guarded
  outside CI. Set `GETBASED_ALLOW_HIGH_WRITE_TESTS=1` only after that explicit
  approval.
- Prefer focused commands such as:
  - `npm test -- tests/<relevant-test>.test.js`
  - `npx playwright test tests/playwright/<relevant-spec>.spec.js`
- When CI fails, inspect the failing job and reproduce only the failing or
  directly related tests locally.
