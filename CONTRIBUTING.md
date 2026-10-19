# Contributing to getbased

Use the [developer documentation](https://docs.getbased.health/developers) for
feature guides and [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and dependency
rules. Keep changes focused and preserve unrelated working changes.

## Run locally

Use Node.js 24 and a modern browser:

```bash
git clone https://github.com/elkimek/get-based
cd get-based
npm ci
npm run dev-server
```

Open `http://localhost:8000/app`. The root URL may serve a sibling
`get-based-site` checkout when present. AI is optional; AI-assisted import and
chat need a connected provider, local server or supported Companion capability.

`npm ci` installs the workspace dependencies and compiles the application.
Standard development, test and production commands compile before use.
After source edits, run `npm run typescript:build` before invoking emitted Node
entry points or Playwright directly.

## Source and ownership

- Edit authored `.ts`, `.mts` and `.svelte` sources. Ignored `.js`/`.mjs` siblings,
  compiled component declarations and CSS bundles are generated outputs.
  Handwritten public declarations and ambient types remain authored contracts.
- Find each feature's controller, projections, components and shared services in
  [ARCHITECTURE.md](ARCHITECTURE.md) and the generated [MODULE_MAP.md](MODULE_MAP.md).
  Keep persistence, provider execution and domain calculations in their owners;
  compose UI through typed Svelte children.
- Style changes belong in the owning Tailwind utility catalog or CSS recipe
  input. `.base.css` can contain authored semantic recipes; its suffix does not
  mean it is an uncompiled output. Consult [scripts/build-styles.mts](scripts/build-styles.mts)
  for stylesheet ownership and [the inline-style registry](scripts/inline-style-map-owners.mts)
  for generated typed style maps. Preserve public stylesheet URLs, cascade order,
  action attributes and controller contracts.
- `npm run styles:build` compiles styles; `npm run styles:check` verifies outputs.
  `npm run svelte:check` checks authored component types and component emissions
  without rewriting them. Application diagnostics use TypeScript 7; the
  `tooling/svelte` workspace isolates the checker's supporting TypeScript 6 peer.
- If runtime modules or imports change, run `npm run architecture:build`, inspect
  and commit the regenerated map, then run `npm run architecture:check`.
  Update the architecture contract when responsibilities or data flows change.

## Test a change

Default to checks relevant to the changed behavior:

```bash
npm test -- tests/<relevant-test>.test.ts
npm run typecheck:migration
npm run typecheck:migration-tests
npm run architecture:check
npm run quality
npx playwright test tests/playwright/<relevant-spec>.spec.ts
```

`typecheck:migration` checks application and tooling sources with strict
TypeScript options; `typecheck:migration-tests` checks maintained tests.
Other compiler projects cover compatibility, server,
worker and strict-null contracts; see `package.json` and the
[testing policy](engineering/testing-policy.md).

Add meaningful assertions for changed behavior. Preserve compiler safety,
security controls, native UI/data contracts, coverage floors and resource budgets;
do not weaken them to obtain a passing result. Report what was tested and any
remaining failures or acceptance limits. Documentation-only changes need link
and consistency checks rather than an application build.

Browser checks run headlessly and remove access to the desktop session.
Install only the required engine, for example `npx playwright install firefox`.
`npm run test:firefox` checks focused critical flows; `test:pwa` checks offline,
update and data-preservation behavior across the configured browser engines.
`test:evolu8-browsers` checks sync startup and identity/resource contracts.
The retained `test:display-pilot` command runs the focused Display cross-browser
contract; its name is not a whole-application acceptance claim.
After a production build, `npm run performance:check -- --artifact dist` enforces
SvelteKit startup and incremental first-use transfer budgets with synthetic profiles
in headless Chromium. Production builds enforce the separate offline-cache growth
budget. The previous native checks remain available as `performance:native:check`
and `native:compatibility:check`. See the testing policy for release coverage.

The Tests workflow also accepts the manual diagnostic choice
`webkit-lens-wearable`. It runs only the original Lens Shell and Wearables cases
in desktop WebKit and retains native cache and chart-pixel failure evidence.
For example, use `gh workflow run test.yml --ref <branch> -f diagnostic=webkit-lens-wearable`.
The manual diagnostic explicitly enables native CPU rendering for controlled
renderer comparisons. This does not mask CPU features or change normal release
jobs.
This diagnostic run does not publish the normal `test` gate or release evidence;
the default `off` choice retains the complete normal workflow.

GitHub Actions owns the exhaustive browser and combined-coverage matrix by
default. An exceptional local full run requires an explicit high-write opt-in:

```bash
GETBASED_ALLOW_HIGH_WRITE_TESTS=1 ./run-tests.sh
GETBASED_ALLOW_HIGH_WRITE_TESTS=1 COVERAGE=1 ./run-tests.sh
```

The runner starts an isolated server and runs the Node/Vitest, origin-guard and
full Chromium checks. `COVERAGE=1` combines independently validated Vitest native
V8 own-function identities with Playwright coverage against
`scripts/coverage-baseline.json`. The unit receipt retains raw ranges, source and
transform witnesses, and complete test membership; unsupported functions earn
zero credit. Classic worker tests retain their actual raw script source. The
separate critical gate and producer contracts explicitly use Istanbul for genuine
line, statement, function and branch counters. Raise the committed minimum
when coverage improves; `COVERAGE_MIN` may demand more, never less. Function
coverage does not establish branch coverage or complete workflow acceptance.
Live paid providers, physical hardware and manual acceptance remain separate.

## Build the static app

```bash
npm run production:build
npm run production:check
```

`production:build` writes the complete static SvelteKit distribution to ignored
`dist/`; `production:check` validates a disposable build. The core app needs no
rendering backend. Preserve the `/app` rewrite, CSP, MIME and single-worker
contracts when hosting it. Build success does not replace browser acceptance or
the separately retained native compatibility budget checks.

`npm run sveltekit:build` retains the ignored local acceptance artifact;
`npm run test:sveltekit` builds it first and runs its configured headless cases.
See [static build and acceptance](engineering/static-sveltekit.md) for exact
runtime, PWA and measurement boundaries, and
[optional integrations](engineering/optional-integrations.md) for service setup.

To profile a built local static artifact separately from service-worker caching:

```bash
GETBASED_KIT_ARTIFACT="$PWD/dist" npx playwright test --config=playwright.sveltekit.config.js sveltekit-startup-performance.spec.ts --project=kit-chromium
```

This records uncompressed local cold-start measurements; it introduces no new
resource/timing budget or general speed claim. Build the artifact before running it.

For matched compressed measurements of two already built artifacts:

```bash
npm run benchmark:local -- --baseline .local-notes/baseline-dist --candidate dist --cases empty,control,combined --pairs 3 --device mobile
```

The pre-hook compiles the benchmark and its seed dependencies. It does not rebuild
the two supplied artifacts. Results go into a unique ignored directory under
`.local-notes/benchmarks`; see [matched benchmark scope](engineering/static-sveltekit.md#matched-local-benchmark)
for fixture choices, guards and timing limits.
Run the focused benchmark option, parity and failure checks with
`npm test -- tests/benchmark-static.test.ts tests/benchmark-static-failures.test.ts`.
Missing required artifact files and invalid metadata/version identity fail before
browser acquisition. Cleanup failures remain visible and cannot produce a
successful benchmark receipt.

## Submit and maintain

- Keep PRs focused and include change-scoped validation. Use CI for the exhaustive
  regression and combined-coverage matrix.
- PWA cache identity comes from the complete authored/build inputs and public
  assets; revision provenance is recorded separately. Ordinary patches need no
  release-version bump; versioned releases update `version.ts` and the changelog.
- Keep maintained contracts in [engineering/](engineering/README.md), stable agent
  instructions in [AGENTS.md](AGENTS.md), and brand rules in [brands/BRAND.md](brands/BRAND.md).
  Task progress, plans, checkpoints and audit journals belong in ignored
  `.local-notes/`, not tracked guidance.
- Report bugs through a GitHub issue or the app's feedback button with browser,
  OS and reproduction steps. Report vulnerabilities privately through
  [SECURITY.md](SECURITY.md). Planned work is on the
  [project board](https://github.com/users/elkimek/projects/2).
