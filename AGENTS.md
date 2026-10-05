# Working on getbased

These are stable repository instructions for coding agents. Keep task progress,
checkpoints, run logs, and temporary audit notes in ignored `.local-notes/` files,
not in this file or in tracked documentation.

## Source and build

- Use Node.js 24 and the project's TypeScript 7 toolchain.
- Edit canonical `.ts` and `.mts` sources. Ignored `.js` and `.mjs` siblings are
  generated runtime output; do not edit or commit them.
- `npm ci` compiles through `prepare`. After source edits, run
  `npm run typescript:build` before directly invoking emitted Node entrypoints
  or Playwright. The standard dev, test, and production npm commands compile first.
- Keep existing runtime URLs and import contracts stable unless the task changes them.
- Write the product name as `getbased`, lowercase; see [brands/BRAND.md](brands/BRAND.md).

## Verification

- Run tests relevant to the changed behavior and applicable lightweight checks.
  Documentation-only changes need link and consistency checks, not a full app run.
- GitHub Actions owns the exhaustive browser and combined-coverage matrix.
  Avoid high-write local full-suite runs by default.
- Do not weaken assertions, compiler safety, or coverage and resource budgets
  to make checks pass. Report the exact scope and limitations of verification.
- Use [CONTRIBUTING.md](CONTRIBUTING.md) for commands and
  [engineering/testing-policy.md](engineering/testing-policy.md) for coverage
  and release requirements.

## Architecture and working state

- Preserve unrelated working changes and use an appropriate separate branch or
  worktree when needed.
- Follow [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and dependency rules.
  Run `npm run architecture:build` when runtime modules or imports change;
  inspect and commit the regenerated [MODULE_MAP.md](MODULE_MAP.md).
- Update maintained contracts when behavior changes. Keep temporary work state
  and personal machine paths out of tracked guidance.
- Shared change summaries and verification evidence belong in PRs and CI artifacts.
  Local journals are not release acceptance evidence.
