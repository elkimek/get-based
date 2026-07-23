# Contributing to getbased

Thanks for wanting to help. This is the short version — the in-depth developer docs live in the Mintlify docs repo at [docs.getbased.health/developers](https://docs.getbased.health/developers). Code ownership and dependency rules live in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Running locally

```bash
git clone https://github.com/elkimek/get-based
cd get-based
node dev-server.js
```

Open `http://localhost:8000`. No install step, no build step — getbased is native ES modules loaded directly by the browser.

Prerequisites: a modern browser (Chrome or Firefox), Node.js for the dev server, and `npm ci` if you want to run the test suite. An AI provider key or a local Ollama instance is optional — only needed for PDF import and chat.

---

## Tests

```bash
./run-tests.sh
COVERAGE=1 ./run-tests.sh
npx playwright install firefox
npm run test:firefox
npm run performance:check
```

`./run-tests.sh` auto-starts a server, runs Vitest, the origin guard, and the full Chromium Playwright suite. The Firefox command runs a focused cross-browser check of startup, demo data, navigation, settings, JSON round trips, and offline app-shell readiness. Exit code 0 = all pass. If you add a feature or fix a bug, add assertions to the relevant test file. See the [Testing developer doc](https://docs.getbased.health/developers/testing) for how the harness works.
`COVERAGE=1 ./run-tests.sh` additionally enforces the combined function-coverage minimum in `scripts/coverage-baseline.json`. Raise that committed minimum when coverage improves; `COVERAGE_MIN` may temporarily demand a stricter local threshold but cannot weaken the repository baseline.
`npm run performance:check` measures the cold mobile app path and enforces the committed request-count, compressed-transfer, and decoded-byte ceilings in `scripts/cold-load-budget.json`.

If you add, remove, rename, or rewire a runtime module, regenerate and inspect the file map:

```bash
npm run architecture:build
npm run architecture:check
```

---

## Pull request guidelines

- Keep PRs focused. One thing at a time is easier to review.
- Run `./run-tests.sh` before opening a PR.
- If you touch any app file (JS, CSS, HTML, manifest), bump the version in `version.js` — this busts the service worker cache for existing users.
- Commit the regenerated [`MODULE_MAP.md`](MODULE_MAP.md) when runtime modules or imports change.
- Update [`ARCHITECTURE.md`](ARCHITECTURE.md) when responsibilities, entry points, major data flows, or allowed dependency directions change.

---

## Architecture & deeper docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the human-maintained module ownership, dependency, state, storage, and privacy contract.
- **[MODULE_MAP.md](MODULE_MAP.md)** — generated file-level ESM inventory, coupling hotspots, and current dependency cycles.
- **[Developer docs](https://docs.getbased.health/developers)** — architecture, module reference, data pipeline, storage schema, testing, deployment, and feature internals. Source lives in the separate `getbased-docs` Mintlify repo.

---

## Roadmap

Check the [project board](https://github.com/users/elkimek/projects/2) for planned features and ideas. If something interests you, comment on the issue to discuss the approach before starting work.

## Reporting bugs

Open a GitHub issue or use the feedback button in the app (flag icon in the header). Include browser, OS, and steps to reproduce.
