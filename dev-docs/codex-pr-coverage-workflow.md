# Codex PR Coverage Workflow

Last updated: 2026-06-10

## Purpose

Use this workflow for iterative Codex coverage PRs: sync the default branch, choose the next coherent high-value coverage gap, open a ready PR, watch CI and Greptile, merge when clean, then clean up the merged branch locally and remotely.

## Working Loop

1. Start from a clean, synced base branch after each merge.
2. After every merge, delete the merged Codex branch locally and remotely when safe. Prune stale remotes as needed, but leave unrelated user branches and files alone.
3. Create one ready-for-review PR per coherent coverage batch. Do not open drafts.
4. Batch related work by feature/module or user workflow instead of opening many tiny PRs for individual functions.
5. Prioritize high-value targets first: user-visible workflows, browser-only APIs, storage/security boundaries, cross-module integration, and files with many uncovered functions over low-risk pure helpers.
6. Prefer Playwright for browser-visible behavior, modal/session flows, UI state, storage-backed flows, and cross-module integration.
7. Use Vitest for pure helper functions, parsers, formatters, and narrow logic that does not need browser behavior.
8. Avoid deduplication unless duplicated fixtures/helpers are causing real maintenance risk. Isolated test setup is acceptable when it keeps tests readable.
9. For test-only changes, do not bump `version.js`. If production app files change, bump `version.js`.

## Verification

Before opening or updating a PR:

- Run targeted tests for the changed area.
- Run `./run-tests.sh` when the change is broad or before marking the PR ready.
- For Playwright coverage batches, use `npm run test:playwright -- <spec>` for fast iteration.
- Run coverage evaluation periodically to rank high-value targets, not after every PR. Use it when the next target is unclear or after several merged coverage batches.

After opening or pushing to every PR:

- Check GitHub Actions CI.
- Check Greptile review comments and unresolved threads.
- Patch actionable Greptile findings, rerun targeted tests, push, then recheck.
- Treat non-blocking Greptile robustness notes as worth fixing when they are small and improve test quality.

## PR Rules

- Open PRs as ready, not drafts.
- Include a focused summary and the test commands run.
- Keep scope to coverage or the specific reviewed fix.
- Do not mix unrelated refactors into coverage PRs.
- Keep watching CI and Greptile until both are clean enough to merge.

## Next Direction

Continue improving missing browser coverage in Playwright first, especially UI workflows, browser-only storage paths, delegated actions, and modal/session flows that Vitest cannot exercise well. Use Vitest only where the behavior is pure logic and browser setup would add noise.
