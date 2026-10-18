# Static SvelteKit distribution and acceptance

getbased ships a static SvelteKit 3/Svelte 5 application using `adapter-static`
and Tailwind 4. The core app needs no rendering backend. Application compilation
and diagnostics use TypeScript 7; supporting Kit/checker peers use TypeScript 6
in `tooling/svelte`. Optional integrations retain their own service requirements.

## Build and host

```bash
npm run production:build
npm run production:check
npm run sveltekit:build
npm run test:sveltekit
```

`production:build` writes the complete public distribution to ignored `dist/`.
`production:check` validates a disposable artifact. `sveltekit:build` retains the
local acceptance artifact at `.local-notes/sveltekit-build`; `test:sveltekit`
builds that artifact first and runs its configured browser cases. The npm
pre-hooks compile authored sources. Local building does not publish the app.

Serve the artifact with the `/app` rewrite to `/index.html`, existing MIME types
and deployed CSP. `/`, `/index.html`, `/app` and `/app/` remain document aliases;
manifest `id`, `start_url` and `scope` remain `/app`. Vercel uses the same static
output, with separately owned API functions. Do not copy server implementations,
credentials or the development checkout into the public artifact. See
[optional integrations](optional-integrations.md) for service deployment boundaries.

## Bootstrap, runtime and source ownership

Kit prerenders and hydrates shared authored components, using one Svelte runtime.
Native-compatible entrypoints render deterministic snapshots from the same owners
and hydrate matching nodes once. Preserve input identity, live transcript/summary
hosts, drafts, selection and focus; do not mount over an already owned subtree.
Native shell services initialize once, after the appropriate route mount.
Synchronous compatibility serializers resolve Svelte's server lifecycle exports;
client components use browser lifecycle exports. Both outputs must remain reproducible.

Kit runs in embedded mode, with navigation delegated inside `#kit-root`.
Outside forms/links retain their native document handlers and cancellation order;
inside navigation keeps Kit's browser history. The Vite graph consumes canonical
`.svelte` components and `.ts` route modules, excluding emitted route siblings.
Native stylesheet, worker, computed vendor and production facade URLs in the
verified bootstrap/worker closure remain stable. Emitted development modules outside
that closure are not a published standalone module API in the static distribution;
feature implementations remain available through their generated bundles.

The static assembler externalizes Kit's classic bootstrap to satisfy the CSP
without enabling inline executable scripts. The Terms/Privacy gate is prerendered
before the main app; development and static Kit load its checked legal bootstrap
as a standalone classic script. The separate native compatibility production
builder inlines that checked legal source. Both retain `legal-consent-accepted`
ordering for analytics, changelog, backups and deep links. A build must not silently
relax CSP or replace consent/update ownership with Kit defaults.

Raw compatibility bootstraps and Knowledge Base/voice workers retain their
transitive emitted ESM dependencies. The
[raw asset collector](../scripts/raw-module-assets.mts) discovers that closure from
runtime syntax; [static asset policy](../scripts/static-build-assets.mts) verifies
it against the declared worker shell. Missing emissions or undeclared dependencies
fail the build. Do not keep a worker entry while dropping its independently loaded
children. Optional provider/attestation vendors must remain behind their feature
boundary rather than becoming startup dependencies.

Startup reads encrypted Sun configuration through
[`sun-uvdata-config.ts`](../js/sun-uvdata-config.ts), after encryption is ready,
without importing the atmosphere client to initialize its cache. The existing
Sun facade retains its public exports. Settings provider choices use the
lightweight [registered-owner bridge](../js/settings-runtime-bridge.ts); Chat
onboarding opens Settings before forwarding a choice to its current owner.
Keep these configuration ports separate from their deferred UI implementations.

The initial navigation result is awaited before `data-app-ready`, including a
persisted Biology route whose page module and shared CSS are still cold. A route
that contains a load failure with a retry alert can complete readiness; a rejected
navigation cannot. The
[Biology loader](../js/biology-page-loader.ts) owns caching and fixed-URL retry;
route callers guard profile, navigation revision, request and content-root identity.
Dashboard calculations and projection remain eager, without loading the Biology
page/AI controller. [Shared review contracts](../js/biology-score-context-contract.ts)
remain available to Sync without importing provider/view lifecycle code.

[EMF configuration and loaded close](../js/emf-interpretation-runtime.ts) remain
available without importing interpretation UI. Close aborts the loaded request
synchronously; late streams/completions require their original profile/data and
actual overlay/body owner. Dashboard picker projection and rendering remain
synchronous.

Cycle previews await both Cycle and Import stylesheet loaders before rendering.
The general Import stylesheet does not duplicate the dedicated Cycle rules;
retain that readiness boundary for cold, retry and offline first use.

Tailwind relationship markers use the prefix alone (`gb:peer`, `gb:group`);
component scope belongs on consuming utilities. Verify rendered track/thumb,
color and keyboard focus as well as a switch's checked value. Other typed view,
private-field, async save and style ownership rules live in
[presentation ownership](presentation-ownership.md) and
[ARCHITECTURE.md](../ARCHITECTURE.md).

## Offline assets and atomic updates

The existing root service worker is the sole offline/update owner. Kit must not
register another worker or poll an independent version. App-shell declarations
include deferred feature modules/styles and required static artwork, so cached
clients can use a feature for the first time and start cold while offline.
Remote model downloads and live provider data have separate connectivity needs;
large model assets are not included in ordinary shell precaching.

Font faces with identical payloads share a source URL while retaining their
family, weight, style and Unicode-range descriptors. Historical font alias files
remain public for existing documents. The [font asset selector](../scripts/font-assets.mts)
keeps every stylesheet-referenced font and unique font payload in the production
precache; it omits only unreferenced aliases with bytes identical to a referenced
payload. This does not remove those aliases from the static artifact. The
production worker receives a build-verified `FONT_ALIASES` map, so exact historical
font URLs also resolve offline to byte-identical payloads in the current build's
cache.

Updates install into a separate cache. Failure retains the active app; Later
defers activation, while explicit Reload preserves stored data. Before early
activation, the waiting worker asks every live document to identify its build
directly and checks the live-client census again. An unidentified document leaves
the update waiting; close all app tabs/windows and reopen to finish that update.
Releases that only report to their current controller need this one-time close and
reopen. They cannot display the newer deferred-update notice, so an old Reload
button can leave the update pending rather than switching its code and styles.

Identified old tabs keep their matching modules and stable application CSS after
activation. A successful cached app navigation records the new document's build
before its startup styles load. Fingerprinted production workers do not cache
unproven network documents as owned application shells. Missing owned documents
at the app aliases return an uncached error rather than borrowing new deployment
HTML with old cached version metadata. A restarted worker requests ownership again;
unresolved or missing stylesheet ownership returns an uncached error instead of
mixing styles from another build. The exact stylesheet retry URL retains the same
ownership boundary. Retire unused version caches only after their documents leave
or reload. Cleanup considers versions present at activation, preserving a waiting
worker's prepared cache. A restarted worker retains old caches until the next
activation census. Other mutable assets and API traffic never use the old
immutable-asset fallback.

Keep offline workflow tests on the assembled artifact and real navigation/actions.
Do not substitute imports from pruned development-module URLs for a missing shipped
dependency. Source-binding checks must identify the actual authored component or
public facade in the artifact graph. Preserve canonical IndexedDB/encrypted-cache
and backup comparisons, unrelated/unknown profile fields, origin-scoped writes and
native focus/keyboard controls across offline first use and closed-client launches.

## Build identity and size measurements

`build-metrics.json` records application identity, complete authored source input
count, verification digest, revision, emitted JavaScript bytes, precache resources
and deltas against historical cache limits. Application identity includes all
authored TypeScript, Svelte, CSS, HTML and JSON inputs, an explicit build tag and
copied public asset bytes, even in an ignored evaluation checkout. Unknown
source/config inputs remain included.

The verification digest binds revision and the complete authored source inventory.
Revision alone does not invalidate application caches when all actual inputs are
identical. Test inputs remain conservatively included in application identity:
the bundler can consume them as inline assets without exposing a supported complete
dependency inventory. Excluding tests safely requires that inventory first.

Verification metadata can change independently; it does not establish full artifact
byte identity. Read it from the retained build artifact or an uncontrolled network
request: a controlling worker can cache this metadata, so it is not a guaranteed
fresh in-app verification receipt. Source discovery excludes dependency, build and
journal trees and generated runtime siblings. Registered typed style-map outputs
are generated from fingerprinted recipe inputs. Public asset bytes remain part of
application identity.

Output totals, cold startup requests and complete service-worker cache population
are different measurements. Production SvelteKit builds enforce
[`sveltekit-resource-budget.json`](../scripts/sveltekit-resource-budget.json)
before replacing an existing output directory. The offline precache has a 22 MiB
absolute decoded-body ceiling and a separate 5% growth ceiling against the recorded
19,172,377-byte reference. The current effective ceiling is 20,130,995 bytes; neither
limit advances automatically. More than 550 resources produces a warning. Counts
remain visible without making the bundler's complete chunk count a release gate.
Every precache URL must resolve to a regular file inside the artifact. Distinct
cached document URLs count separately even when their bodies are identical.
Generated precached JavaScript gzip/Brotli totals are informational sums of individual
files; they do not describe startup transfer.

These limits cover one complete build, not all Cache Storage at an origin. An open
older document can still need its matching build's styles and modules. Updates retain
that cache until its owners leave; size limits never authorize eviction of live data
or an older live build. User-profile storage and optional downloaded models are outside
the precache measurement.

After building, `npm run performance:check -- --artifact dist` enforces the separate
SvelteKit startup and incremental first-use browser budgets. It uses synthetic empty
and combined-data profiles, real Settings and Body controls, fresh browser contexts,
blocked service workers, disabled HTTP cache and a Brotli-capable loopback server.
AI is paused with the supported OpenRouter provider selected and no credentials.
The server supplies only the deployment's public commit-metadata fixture from the
frozen artifact's recorded revision; its response is counted like every other
request. This controlled fixture adds no backend requirement to the application.
Provider discovery and paid inference are outside these scenarios; any external
request fails qualification.
Both desktop and emulated mobile run three samples by default. HTTP response
transfer bytes, encoded response bodies, decoded bodies and request counts have
separate limits; every sample must pass. These are controlled local Brotli
measurements, excluding TCP/TLS overhead; deployment compression is separate. CPU/network settings and timing medians are recorded, with
timing diagnostic rather than a machine-dependent hard gate. Failed, pending,
external or private-fixture requests, page/CSP errors and changed committed profile
data fail qualification independently of the size limits. `--record` only measures;
it explicitly does not establish a passing budget result.

The fixed transfer policy lives in
[`sveltekit-performance-budget.json`](../scripts/sveltekit-performance-budget.json).
The reference uses three samples for each of the four device/workflow combinations.
All samples in each group had identical resource counts and byte totals. The
ceilings allow approximately 19–28% byte growth from the largest observed sample;
small request groups receive a few additional request slots. They are reviewed
limits, not a rolling percentage that silently increases after each run.

| Phase | HTTP transfer ceiling | Encoded body ceiling | Decoded body ceiling | Request ceiling |
| --- | ---: | ---: | ---: | ---: |
| Startup | 1,280 KiB | 1,152 KiB | 4,608 KiB | 220 |
| Settings first use | 400 KiB | 360 KiB | 1,536 KiB | 64 |
| Body first use | 64 KiB | 56 KiB | 288 KiB | 10 |

The recorded largest HTTP transfers were 1,077,321 bytes at startup, 331,955 bytes
for Settings and 53,186 bytes for Body. Startup is measured before any first-use
action; first-use numbers are incremental. Settings includes closing the genuine
empty-profile chat panel before opening the real Settings control. These finite
scenarios do not certify every feature's first use. A limit or reference change
requires new qualified measurements and an explanation of the user-visible tradeoff;
a larger current artifact alone is not a reason to raise a ceiling.

The previous native checks remain available as `performance:native:check` and
`native:compatibility:check`, with their original budget files and behavior intact.
They describe the retained native graph, not the default SvelteKit release budget.
Compiler, correctness, coverage and security requirements remain unchanged.

For readiness spanning pages/cold launches, use host monotonic elapsed time from
navigation through app-ready and, where applicable, worker/controller readiness.
A fixed Playwright browser clock can carry prior workflow time, so its absolute
`performance.now()` is not a per-launch duration. The
[readiness clock regression](../tests/pwa/sveltekit-readiness-clock.spec.ts) protects
that distinction. Diagnostic timings include observation overhead and do not
establish a hardware-independent performance guarantee.

## Static startup diagnostic

Build the desired artifact first, then run the focused Chromium diagnostic:

```bash
GETBASED_KIT_ARTIFACT="$PWD/dist" npx playwright test --config=playwright.sveltekit.config.js sveltekit-startup-performance.spec.ts --project=kit-chromium
```

[The startup case](../tests/pwa/sveltekit-startup-performance.spec.ts) uses fresh
desktop and Pixel 5 contexts, blocks service workers, disables browser cache with
CDP and aborts cross-origin requests. It measures local uncompressed HTTP with no
CPU/network throttling, one sample per mode. Its JSON attachment records app-ready,
paint/LCP observations, long tasks, request timing, script/layout durations and the
loaded source inventory through app-ready then network idle. It does not measure
worker precaching, compressed deployment transfer, installed-PWA performance or
real mobile hardware.

The assertions retain the lazy Settings stylesheet and optional attestation-vendor
boundaries, then open real Settings and change units without document navigation.
Source maps are read on the host after measurement so diagnostics do not inflate
browser requests. Missing optimized maps fail except exact pinned generated helpers
or AST-verified import/export-only forwarding barrels; raw compatibility scripts
retain their explicit URL inventory even if compiler maps are not shipped.
This diagnostic adds no timing/resource budget and does not waive an existing one.

## Matched local benchmark

After building and retaining two static artifacts, run:

```bash
npm run benchmark:local -- --baseline .local-notes/baseline-dist --candidate dist --cases empty,control,combined --pairs 3 --device mobile --output .local-notes/benchmarks
```

The [benchmark](../scripts/benchmark-static.mts) compiles through its npm pre-hook,
then uses fresh headless Chromium contexts and alternating artifact order. It
uses the same qualified startup/first-use phase boundaries and supported paused
OpenRouter fixture as the single-artifact performance gate. Each server exposes
its own artifact's recorded public revision metadata, counted as a normal request.
Both artifacts are explicit inputs; the command does not rebuild them. Its private seed
page commits synthetic data through the native APIs and closes before measurement.
Meals use verified device-encrypted storage. This is not a universal claim that
all profile fields are encrypted under every application configuration.

The laboratory seed selects only the bundled demo's exact `entries`,
`customMarkers` and `refOverrides`, preserving marker values, units, per-entry
context and provenance. The control retains eight panels. Public profile defaults
and migration normalize this declared seed before its durable commit. Unrelated
Light sessions, devices, geographic/weather history, export metadata and cached AI
are excluded; this is a laboratory/meal/wearable fixture, not a full demo import.

Measured-page request events provide resource counts and private-module guards.
At one post-timing boundary, the command freezes that ledger and passive CDP
`Network.loadingFinished` encoded-byte receipts. Transfer bytes cover responses
completed by that boundary; request completion states are retained. It does not
await response-body metadata. Raw ResourceTiming entries are retained too, and can
be empty under the fixed browser clock.

Measurements use Brotli, 4x CPU slowdown, 100 ms latency, 10 Mbps download, disabled
HTTP cache and blocked service workers. The command rejects measured pages that load seed modules or request external
resources. Startup uses the host monotonic clock; first-use
journeys use one browser clock. Whole Body journeys retain drawer/locator waiting,
with actual click-to-content and animation-frame phases reported separately.

`--pairs` accepts 1 through 5; `--device` is `mobile` or `desktop`. Fixture cases are
`empty`, `control`, `lab40`, `lab120`, `meal1460`, `meal7300`, `wearable1`, `wearable3`
and `combined`. Defaults are three pairs of empty/control/combined on mobile.
Scale tiers are opt-in. The [fixture and parity owner](../scripts/benchmark-static-fixtures.mts)
requires exact raw text and complete durable-profile equality. Empty/control/lab
cases also require complete markup equality; other raw markup hashes are retained
without normalization. These guards do not replace visual or complete device-store
workflow acceptance.

Each run owns a unique Git-ignored output directory and retains raw observations,
medians, paired deltas, source/build identities and partial failure evidence.
Both artifacts must have regular metadata, document and version files with a
matching build identity and a valid recorded revision before the command acquires
servers or a browser. The empty-profile Settings journey displays the revision,
so exact UI parity requires both artifacts to record the same revision when
`empty` is selected. Cross-revision comparisons can use Body-only cases such as
`--cases control,combined`; use `performance:check` to enforce one artifact's limits.
The command never replaces revision labels to make parity pass. Failure
receipts preserve the original error and structured causes, including labeled
cleanup errors. Every acquired resource gets a close attempt; completed results
are published only after cleanup succeeds. The [failure contracts](../tests/benchmark-static-failures.test.ts)
exercise invalid artifacts, interrupted ownership and cleanup failures.
There is no timing gate, new resource allowance or field-performance claim. Run it
with other browser/build workloads idle. Existing performance and release gates
remain independently required.

## Acceptance and limits

Use [the testing policy](testing-policy.md) to select relevant cases and release
gates. [The shared shell scenario](../tests/pwa/sveltekit.spec.ts),
[protection/offline scenario](../tests/pwa/sveltekit-protection.spec.ts),
[native passphrase lifecycle](../tests/playwright/passphrase-dialog.spec.ts) and
[old-client cache tests](../tests/service-worker-client-cache.test.ts) are entry
points; feature scenarios live under `tests/pwa/`, with native UI/ownership checks
under `tests/playwright/`. Keep their substantive data, security, action and
corruption assertions active rather than reporting only the presence of components.

Browser launches are headless and remove desktop display/compositor/session-bus
and activation credentials. Linux WebKit uses WPE; a custom executable must not
substitute the GTK windowed binary. Use synthetic profiles and a local origin.
Tests with synthetic inference, mocked camera/microphone input or clipboard/folder
callbacks establish orchestration, not provider availability, sensor accuracy,
permission behavior or OS picker operation. Mocked erasure is not a substitute for
real IndexedDB deletion. Installed-PWA acceptance, physical devices, paid providers,
complete regression and fresh combined coverage require their own evidence;
scoped passing workflows do not imply those results.


Wearables native parity is reproducible from a clean checkout. The maintained
[compressed fixture](../tests/fixtures/wearable-native-parity/manifest.json)
contains byte-exact synthetic receipts from all four supported browser projects,
the original input manifest, and only the three original Chart callback-owner or
binding chunk/source-map pairs required by the comparator. The fixture loader
checks a source-pinned manifest hash, compressed and decompressed sizes, each
original member hash, and safe unique relative paths before extracting a fresh
worker-owned temporary directory. It does not download or rebuild historical
application code. [Corruption controls](../tests/wearable-native-fixture.test.ts)
cover changed bytes, traversal, duplicate members and decompression bounds.

The Wearables PWA test prepares these inputs automatically when none of the three
`GETBASED_WEARABLE_NATIVE_*` variables is set. Explicit historical input overrides
remain supported only as a complete directory/manifest/manifest-SHA set and retain
all original qualification checks. CI still supplies `GETBASED_EXPECTED_KIT_BUILD_ID`
from its qualified shipping artifact. To prepare an explicit shared input directory
for a job after compilation, run `node scripts/wearable-native-fixture.mjs` for JSON,
or `node scripts/wearable-native-fixture.mjs --github-env` to append the three
verified input variables to the current GitHub job environment. The extracted
directory is temporary test input and must never be included in application output.
