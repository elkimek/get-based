# Contributing to getbased

Thanks for wanting to help. This is the short version — the in-depth developer docs live in the Mintlify docs repo at [docs.getbased.health/developers](https://docs.getbased.health/developers). Code ownership and dependency rules live in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Running locally

```bash
git clone https://github.com/elkimek/get-based
cd get-based
npm ci
npm run dev-server
```

Open `http://localhost:8000/app`. The root URL may serve the sibling `get-based-site` landing page when that repository is present.

Prerequisites: a modern browser (Chrome or Firefox) and Node.js 24. `npm ci` installs dependencies and compiles the TypeScript sources; `npm run dev-server` recompiles them before starting the server. Edit the authored `.ts` and `.mts` files, or `.svelte` components in the Display pilot. When running a Node entry point or Playwright directly after editing, first run `npm run typescript:build`. An AI provider key or a local Ollama instance is optional — only needed for PDF import and chat.

---

## Tests

Default to tests related to the files and behavior you changed:

```bash
npm test -- tests/<relevant-test>.test.ts
npm run typecheck:migration
npm run typecheck:migration-tests
npx playwright test tests/playwright/<relevant-spec>.spec.ts
npx playwright install firefox
npm run test:firefox
npm run performance:check
```

GitHub Actions owns the exhaustive Chromium and combined-coverage matrix. This
avoids repeatedly creating large temporary browser profiles and V8 coverage
snapshots on developer drives. If an exceptional local full run is necessary,
acknowledge its high write volume explicitly:

```bash
GETBASED_ALLOW_HIGH_WRITE_TESTS=1 ./run-tests.sh
GETBASED_ALLOW_HIGH_WRITE_TESTS=1 COVERAGE=1 ./run-tests.sh
```

`./run-tests.sh` auto-starts a server, runs Vitest, the origin guard, and the full Chromium Playwright suite. `COVERAGE=1` additionally enforces the combined function-coverage minimum in `scripts/coverage-baseline.json`. The commands are blocked outside CI without the explicit environment opt-in above. The Firefox command runs a focused cross-browser check of startup, demo data, navigation, settings, JSON round trips, and offline app-shell readiness. Exit code 0 = all pass. If you add a feature or fix a bug, add assertions to the relevant test file. See the [Testing developer doc](https://docs.getbased.health/developers/testing) for how the harness works.
Raise the committed coverage minimum when coverage improves; `COVERAGE_MIN` may temporarily demand a stricter threshold but cannot weaken the repository baseline.
`npm run performance:check` measures the cold mobile app path and enforces the committed request-count, compressed-transfer, and decoded-byte ceilings in `scripts/cold-load-budget.json`.

If you add, remove, rename, or rewire a runtime module, regenerate and inspect the file map:

```bash
npm run architecture:build
npm run architecture:check
```

---

## Pull request guidelines

- Keep PRs focused. One thing at a time is easier to review.
- Run change-scoped tests and relevant lightweight gates before opening a PR;
  let GitHub Actions run the exhaustive browser and coverage matrix.
- Edit canonical `.ts`/`.mts` sources, not generated `.js`/`.mjs` files. PWA cache identity comes from the production commit and deployment ID, so ordinary patches need no version bump. For a versioned release, update `version.ts` and the changelog.
- Commit the regenerated [`MODULE_MAP.md`](MODULE_MAP.md) when runtime modules or imports change.
- Update [`ARCHITECTURE.md`](ARCHITECTURE.md) when responsibilities, entry points, major data flows, or allowed dependency directions change.
- Keep maintained feature and testing contracts under `engineering/`. Keep task progress, checkpoints, and audit logs local in `.local-notes/`, which Git ignores.
- Keep [AGENTS.md](AGENTS.md) concise and limited to stable coding-agent instructions; it is not a task journal.

---

## Architecture & deeper docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the human-maintained module ownership, dependency, state, storage, and privacy contract.
- **[MODULE_MAP.md](MODULE_MAP.md)** — generated file-level ESM inventory, coupling hotspots, and current dependency cycles.
- **[Engineering guidance](engineering/README.md)** — maintained testing and feature contracts.
- **[AGENTS.md](AGENTS.md)** — stable repository instructions for coding agents.
- **[Developer docs](https://docs.getbased.health/developers)** — architecture, module reference, data pipeline, storage schema, testing, deployment, and feature internals. Source lives in the separate `getbased-docs` Mintlify repo.

---

## Roadmap

Check the [project board](https://github.com/users/elkimek/projects/2) for planned features and ideas. If something interests you, comment on the issue to discuss the approach before starting work.

## Reporting bugs

Open a GitHub issue or use the feedback button in the app (flag icon in the header). Include browser, OS, and steps to reproduce.

Settings CSS is generated at its existing runtime URL. Edit
`css/settings.base.css` for legacy Settings styles or
`css/settings-display.tailwind.css` and `js/components/DisplaySettings.svelte`
for the Svelte + Tailwind Display pilot. Run `npm run styles:build` after styling edits;
`npm run styles:check` verifies the bundle. The standard TypeScript build,
prepare, development, test and production commands also compile these styles
and the component. `npm run svelte:check` validates authored component types with
TypeScript 7 and checks emitted output without rewriting it. `tooling/svelte`
is an npm workspace that isolates the checker's supporting TypeScript 6 dependency;
`npm ci` installs it along with the application toolchain.

The bounded Display pilot has a focused cross-browser acceptance command,
`npm run test:display-pilot`, covering Chromium, Firefox, desktop WebKit and
mobile WebKit. The [focused pilot workflow](.github/workflows/display-pilot.yml) runs on the
pilot branch and can be dispatched manually. It checks the affected tooling and
settings contracts, strict typing, architecture, production budgets, critical
coverage, and the Display and PWA browser matrices. Its retained JSON evidence
is scoped to the pilot; it does not measure fresh whole-project combined coverage.
The full release CI workflow also runs both browser matrices.

PWA Chromium checks use the pinned full browser in its modern headless mode
(`channel: chromium`), exercising Chrome's normal browser implementation without
opening desktop windows. See [Playwright browser modes](https://playwright.dev/docs/browsers#chromium-new-headless-mode).
