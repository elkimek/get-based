# Meals & Nutrition handoff — 2026-08-24

> Current release status and verification moved to
> [`meals-nutrition-release-audit-2026-08-25.md`](meals-nutrition-release-audit-2026-08-25.md).
> This file remains the historical implementation handoff.

## Resume point

- Repository: `/home/elkim/Documents/Codex/get-based-meals-nutrition`
- Branch: `feature/meals-nutrition`
- Branch base at handoff: `900aba9e Fix CodeQL insecure randomness findings (#1571)`
- State: the complete feature branch is intentionally uncommitted. It contains
  62 tracked modified files plus the new nutrition modules, stylesheet,
  documentation, unit tests, and Playwright spec. Do not reset or discard this
  worktree.
- The separate food-vision benchmark repo/session is out of scope here and does
  not need to be resumed from this handoff.

The durable product and architecture description is in
[`docs/meals-nutrition-module.md`](meals-nutrition-module.md). This handoff only
records the latest audit/fix state and the safest continuation path.

## Current product state

The branch implements a first-class, local-first Meals & Nutrition feature:

- photo and nutrition-label analysis with an editable review before Save;
- deterministic barcode/label scaling and linked component portion arithmetic;
- separate meal, drink, target, and saved-meal detail flows;
- profile-scoped encrypted IndexedDB persistence, portable export/import,
  profile deletion, and full-data erasure integration;
- a seven-day Dashboard/Body widget with weight-aware protein targets, hydration,
  configurable nutrients, logging coverage, and recent meals;
- a compact opt-in nutrition context summary that never includes photos or
  individual meals;
- a Debug-only 2–4 model comparison with retry, token/cost display, local manual
  or model reference scoring, and encrypted last-run persistence;
- provider-aware vision-model curation, including eligible connected Qwen tiers,
  without treating model-written confidence as measured accuracy.

The correct product claim is **photo-assisted, user-reviewed nutrition logging**,
not clinical measurement. Barcode, printed-label, and manually grounded inputs
are more reliable than an ungrounded meal photograph.

## Final audit fixes completed today

1. **Unlinked portion safety**
   - Expanded common model quantity aliases and strengthened the weight-first
     prompt.
   - A component gram change with no component nutrient profile now preserves
     the prior estimate only for review, marks it stale, disables Save, and
     requires recalculation.
   - Reverting to the analyzed grams clears the stale state without an AI call.
   - Linked component changes still recalculate locally without AI cost.

2. **PWA and production gates**
   - Every nutrition module imported by the entry feature is explicitly listed
     in `APP_SHELL`, one entry per line.
   - The production output budget remains enforced at 4,850,000 decoded bytes
     and records the completed audit-fix feature measurement.

3. **Widget semantics**
   - Macro, fluid, and energy targets use an 85–105% on-target band.
   - Values above the band are amber and labeled above target rather than
     remaining green indefinitely.
   - Fiber is treated as a minimum; sugar and sodium remain limits/guides.

4. **Mobile handoff**
   - Successful meal-photo and label analysis scrolls and focuses the editable
     review on narrow screens, respecting reduced-motion preferences.

5. **Context accuracy**
   - Removed the nonexistent 90-day nutrition-context claim.
   - Trends compare the current seven days with the non-overlapping preceding
     23-day period.
   - Trend claims require at least 3 current and 5 baseline complete
     nutrient-days.

6. **Maintainability**
   - Portion-validation and mobile-focus ownership live in
     `nutrition-review-ui.js`.
   - Both `nutrition.js` and `service-worker.js` finish at 789 lines, below the
     repository's near-cap threshold.

## Verification at handoff

Final change-scoped verification is green:

- 79/79 nutrition, PWA, app-shell-budget, and production-build unit tests;
- 18/18 Chromium nutrition Playwright scenarios, including WCAG A/AA automation,
  hard-refresh persistence, mobile layout/focus, label and barcode paths,
  model settings, comparisons, targets, drinks, and recent meals;
- check-JS TypeScript gate;
- service-worker TypeScript gate;
- production build: 2 startup JS files, 156 lazy JS files, approximately
  4,768.6 KiB decoded;
- PWA precache: 306 resources, approximately 14,760.4 KiB decoded;
- architecture check: 687 modules, zero cycles;
- quality guardrails: 17/17;
- `git diff --check`.

The exhaustive browser and coverage matrices were not run locally; GitHub
Actions owns those runs under the repository instructions.

## Suggested next session

1. Read this handoff and the product document; do not repeat the full audit.
2. Inspect `git status` and a focused final diff, preserving all existing work.
3. If the user wants release preparation, organize/commit the branch and let CI
   run its exhaustive matrix. Reproduce only any failing CI job locally.
4. The release-pinned FNDDS grounding layer is now implemented. A next accuracy
   phase should evaluate candidate matching across cuisines and preparation
   descriptions, then expand named-recipe editing without weakening provenance.
5. Keep the standalone multi-image/model benchmark effort in its separate repo;
   do not expand the in-app Debug comparison into a research harness.

Useful focused commands:

```bash
node dev-server.js 8000
npm test -- tests/nutrition-analysis.test.js tests/nutrition-calculation.test.js tests/nutrition-summary.test.js tests/nutrition-context.test.js
PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/playwright/nutrition-module.spec.js --workers=1
npm run production:check
npm run quality
npm run architecture:check
npx tsc -p tsconfig.checkjs.json --pretty false
npm run typecheck:service-worker -- --pretty false
git diff --check
```

Do not run `./run-tests.sh` or the complete Playwright/coverage matrix locally
without the explicit high-write approval required by `AGENTS.md`.
