# Static SvelteKit build and acceptance

The static bridge supports incremental Svelte UI migration without a rendering
backend. It uses SvelteKit 3, Svelte 5 and `adapter-static`; Display settings
and the Settings shell use scoped Tailwind 4. Application compilation and diagnostics use
TypeScript 7. Supporting Kit/checker peers use TypeScript 6 in `tooling/svelte`.

## Build locally

```bash
npm run sveltekit:build
npm run test:sveltekit
```

The build writes the complete public artifact to ignored
`.local-notes/sveltekit-build`. `test:sveltekit` builds it first and runs focused
scenarios in Chromium, Firefox, desktop WebKit and mobile WebKit.
All launches are explicitly headless and disconnected from desktop display,
compositor, session-bus and activation credentials. WebKit's headless Linux port
is WPE; a custom executable must not substitute the GTK windowed binary.

The artifact runs on a static file host. Retain the existing `/app` rewrite to
`/index.html`, MIME types and CSP. It contains public app assets and one worker;
server/API implementations and development sources are not copied. Existing
optional provider/companion integrations retain their existing requirements.
The native `production:build` command and deployment configuration remain separate
while this bridge is evaluated; building locally does not publish it.

## Preserved contracts

- Native shell services initialize once; Kit owns its route DOM and Svelte shares
  the same runtime with the component adapters.
- Synchronous compatibility HTML builds resolve Svelte's server lifecycle
  exports, including destruction callbacks during rendering. Client components
  keep browser lifecycle exports; both outputs are reproducible and covered.
- Chat's initial shell and composer are authored once as shared Svelte
  components. Kit owns them in its `/app` route; the native document contains
  their deterministic build-generated snapshot, hydrated without replacing
  controls or live transcript hosts. `svelte:check` verifies that snapshot.
- Settings CSS, worker entry points, computed vendor URLs and delegated preference
  mutations keep their contracts.
- Manifest `id`, `start_url` and `scope` remain `/app`; `/`, `/index.html` and
  `/app/` remain document aliases.
- The existing root service worker owns offline precaching and atomic updates.
  Kit neither registers a second worker nor polls for independent updates.
- First feature use and cold launch work offline. Failed updates retain the
  active app. Later defers activation and explicit Reload preserves stored data.
- Old tabs can load their previous content-hashed modules after a new worker
  activates. Live clients report their document build, and unused version caches
  retire after old documents leave or reload; unknown pre-protocol clients keep
  their assets until they leave. Cleanup only considers versions present at
  activation, preserving caches prepared by a waiting worker. After a worker
  restart, old caches stay safe until the next activation census. Mutable assets
  and API traffic never use the
  old immutable-asset fallback.
- Kit's bootstrap runs as an external classic script under the existing CSP.

The focused browser scenarios live in [sveltekit.spec.ts](../tests/pwa/sveltekit.spec.ts).
The shell scenario verifies all core Settings sections, responsive orientation,
keyboard selection, retained preference actions and WCAG checks for the shell.
The [protection scenario](../tests/pwa/sveltekit-protection.spec.ts) covers
Security and Backup keyboard actions, themes, exported backups and encrypted
offline cold launch. [Native dialog checks](../tests/playwright/passphrase-dialog.spec.ts)
cover all six dialog modes, theme contrast, responsive containment, short
viewports and erasure failure recovery. Mocked erasure checks do not replace
real IndexedDB deletion verification or installed-PWA acceptance.
Build, desktop-isolation and [client cache retention](../tests/service-worker-client-cache.test.ts)
contracts have separate unit tests. These checks do
not constitute complete application regression, hardware/provider acceptance,
or a fresh combined function-coverage measurement. Owned Kit component emissions
remain in the existing coverage inventory; no source or compiler safety is waived.

## Size measurements

`build-metrics.json` records JavaScript output, precache resources and decoded
bytes, input build identity, and deltas against the historical cache limits.
Browser reports attach the actual cold startup JavaScript requests and decoded
bytes separately. Output totals and startup requests measure different things.

Historical size/cache ceilings are measurements during local Kit evaluation.
The native build still enforces its committed budgets; its limits and the
quality/coverage floors are unchanged. Evaluate cold loads and offline cache
cost before setting budgets for the consolidated build or promoting it.
