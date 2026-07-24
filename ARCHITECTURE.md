# getbased architecture

This is the human-maintained architecture contract for the getbased codebase.
Use it to decide where a module belongs, which direction dependencies should
flow, and which system boundaries a change must preserve. The generated
[`MODULE_MAP.md`](MODULE_MAP.md) is the file-level companion: it inventories
every first-party runtime module and its direct imports.

Public feature and deployment documentation remains in the separate
[`getbased-docs`](https://github.com/elkimek/getbased-docs) repository. This
file covers code ownership and dependency rules that must change with the app.

## Update contract

- Add, remove, rename, or change imports in `js/`, `api/`, or `lib/`: run
  `npm run architecture:build` and commit the generated map.
- Change a module's responsibility, a major data flow, an entry point, or an
  allowed dependency direction: update this file and the architecture rules.
- Move public behavior or a user-facing contract: update the relevant page in
  `getbased-docs` as well.
- Never hand-edit `MODULE_MAP.md`. CI regenerates it and fails if it is stale.

## Runtime topology

getbased is a static browser application. There is no production bundling
step: `index.html` loads `js/main.js`, and native ES modules form the runtime
graph. Hosted deployments add small Vercel functions for operations that
cannot run directly in the browser.

```mermaid
flowchart TD
  HTML[index.html + service worker] --> Main[js/main.js]
  Main --> Composition[app-* composition modules]
  Composition --> Startup[startup orchestrator and phases]
  Startup --> Features[feature workflows and UI]
  Features --> Foundation[state, profile, data, crypto, storage]
  Foundation --> BrowserStorage[localStorage, IndexedDB, OPFS]
  Features --> Hosted[/api/* hosted boundary]
  Hosted --> ServerShared[lib/* server policy and transport]
  ServerShared --> Upstreams[approved external services]
```

The browser remains the authority for health data. Hosted functions relay
explicit requests, encrypted share envelopes, OAuth exchanges, or catalog
operations; they must not become an implicit health-data store.

## Enforced source boundaries

The architecture checker currently enforces these coarse runtime boundaries:

| Source group | Owns | May import |
| --- | --- | --- |
| `js/` browser | Native browser application | `js/` browser modules |
| `api/` serverless | Hosted request entry points | `api/` and `lib/` |
| `lib/` server-shared | Node-only policy and transport | `lib/` |

Relative imports of data files and explicitly vendored browser libraries are
recorded as repository dependencies but are outside the ESM cycle graph.
Tests and tooling may import production modules; production modules must not
import tests or tooling.

The exact rules live in [`scripts/architecture-rules.json`](scripts/architecture-rules.json)
and are enforced by `npm run architecture:check` in local and CI validation.

## Target dependency direction inside `js/`

The desired internal direction is:

```text
entry and composition
        ↓
UI and workflow orchestration
        ↓
feature/domain services
        ↓
foundation, storage adapters, and pure utilities
```

- **Entry and composition** wires the app together and may have broad fan-out.
  It should not contain feature logic.
- **UI and workflows** render, collect user intent, and coordinate services.
  They should receive browser-shell callbacks through explicit configuration
  seams rather than creating reverse imports from lower layers.
- **Feature/domain services** own health calculations, provider contracts,
  normalization, and feature-specific persistence rules.
- **Foundation and adapters** own shared state primitives, encryption,
  serialization, storage access, and dependency-free helpers. They must not
  depend on feature UI.
- `*-runtime.js`, `*-hooks.js`, and configuration functions are dependency
  inversion seams. Keep them narrow; do not turn them into alternate global
  service locators.

This fine-grained direction remains a migration target for coupling cleanup,
but the runtime graph no longer contains strongly connected components. Both
cycle ceilings are fixed at zero, so the checker rejects any new cyclic
dependency.

## Module ownership map

| Area | Typical modules | Responsibility |
| --- | --- | --- |
| Boot and shell | `main.js`, `app-*`, `startup-*`, `nav*`, `views-router*` | Startup ordering, route selection, and shell wiring |
| Foundation | `state.js`, `profile*`, `data*`, `crypto.js`, `blob-storage.js` | Active state, durable profile data, encryption, migration, and storage |
| Labs and genome | `schema*`, `adapters.js`, `marker-*`, `dna*`, `biology-score*` | Marker normalization, reference data, genetics, and deterministic scoring |
| Body | `wearables-*`, `wearable-*`, `cycle*`, `supplements*` | Device adapters, local raw rows, synced summaries, cycle and body context |
| Light and environment | `light-*`, `sun-*`, `emf*` | Light measurements, spectral/session models, environment and EMF context |
| AI and knowledge | `api-*`, `provider-*`, `chat-*`, `lens-*`, `pii.js` | Provider routing, prompt/context workflows, RAG, transport, and PII controls |
| Sync and Agent Access | `sync-*` | Encrypted CRDT payloads, deltas, relay health, identity, and agent context |
| Import/export | `pdf-import*`, `import-*`, `export*`, `backup*` | File classification, review/commit, reports, backups, and restoration |
| Presentation | `dashboard-*`, `context-card-*`, `settings*`, `modal-*` | Views, editing surfaces, settings, accessibility, and interaction lifecycle |
| Hosted runtime | `api/*`, `lib/*` | Server-side validation, proxy transport, sharing, and repository operations |

Names express ownership, not permission to bypass the dependency direction.
When a module spans two rows, split orchestration from domain logic or inject
the higher-layer behavior through a narrow runtime seam.

## State, storage, and privacy boundaries

- `state.js` is shared in-memory session state. Do not treat it as durable
  storage or add feature callbacks to it.
- Profile writes flow through profile/data persistence helpers so migrations,
  encryption, change history, and sync hooks remain consistent.
- Secrets and sensitive rows use the existing encryption and IndexedDB paths.
  Do not introduce plaintext fallbacks for OAuth tokens, AI keys, wallet
  proofs, genetics, or health records.
- Raw wearable and cycle stores remain device-local unless an explicit,
  privacy-reviewed summary surface is added to sync.
- Network calls use the existing provider, URL-safety, PII, same-origin, and
  proxy-policy boundaries. New direct fetch paths require an explicit review.
- UI modules render escaped/sanitized values and use the shared modal and
  delegated-action patterns; architecture cleanup must not weaken XSS or
  accessibility guards.

## Adding or changing a module

1. Choose the ownership row above and keep the filename feature-oriented.
2. Import down the target dependency direction. If that is impossible, add a
   narrow injected callback/runtime seam instead of a reverse dependency.
3. Run `npm run architecture:build` after changing the graph.
4. Inspect the `MODULE_MAP.md` diff. A new cycle or source-boundary violation
   is a design failure, not a baseline-update task.
5. Add focused behavior tests, run `npm run architecture:check`, and run the
   normal test suite.
6. Update this file only when responsibilities, boundaries, or major flows
   changed; routine file inventory changes belong only in the generated map.

## Architecture tooling and debt ratchet

- `npm run architecture:build` regenerates `MODULE_MAP.md`.
- `npm run architecture:check` verifies the generated file, resolves every
  relative ESM import, enforces source boundaries, and rejects cycle growth.
- [`scripts/architecture-cycle-baseline.json`](scripts/architecture-cycle-baseline.json)
  fixes both cycle ceilings at zero. Never raise either ceiling merely to pass
  CI; a new cycle is a design failure.

## Cold-load performance budget

`npm run performance:check` measures a fresh mobile returning-user load of
`/app` with the browser cache and service workers disabled. The committed
ceilings in [`scripts/cold-load-budget.json`](scripts/cold-load-budget.json)
cover same-origin application request count, compressed transfer bytes, and
decoded bytes. Runtime `/api/*` calls and cross-origin services are excluded so
the measurement tracks the shipped app graph rather than network availability.

The browser check runs in the normal Chromium suite and therefore in CI. Lower
the ceilings as route and feature lazy loading removes startup resources; do
not raise them to absorb an unexplained regression.

Light & Sun keeps `sun-context-hooks.js` in the startup graph so dashboard,
chat, and Agent Access context remains complete. Its analysis and feature hook
group is loaded through `light-sun-loader.js` when the Light route or an
optional Light dashboard widget is opened, or when a background Light/Sun
session finishes and needs analysis. Background completion uses the module-only
loader so it does not fetch presentation assets. Visual entry points use the
UI loader, which waits for the module graph and all seven ordered Light
stylesheets before rendering. An HTML anchor preserves the original cascade
position. Marker-history controls and the context-card Ott badge keep their
cross-feature styles in their eager owning bundles, while the deferred Light
stylesheets remain in the service-worker app shell for offline first use.

Settings and Tweaks are loaded through `settings-loader.js` on their first
shell, startup deep-link, or feature action. Theme-owned accent initialization
stays in `theme.js`, while the Light page imports its Sun data-source renderer
from `settings-privacy.js`; neither path requires the full Settings modal
during normal startup. The loader also fetches `css/settings.css` on first use
and waits for both resources before opening the UI. An HTML anchor preserves
the stylesheet's cascade position, while the shell-owned Settings button rule
stays in `app-shell.css`. The deferred stylesheet remains in the service-worker
app shell for offline first use.

Profile Sharing is loaded through `profile-share-loader.js` when a shell,
Settings, or client-list action opens it, or when startup/hash routing detects
a shared-profile link. The loader owns only lazy loading and route detection;
`profile-share.js` retains link validation, encryption, import, and UI
responsibilities. `export.js` remains shell-owned without a Data I/O
composition wrapper.

Genome and DNA behavior stays module-eager because dashboard summaries,
recommendations, startup catalog hydration, and import routing share it.
`dna-runtime.js` owns the narrower presentation boundary: `css/genetics.css`
loads when the Genome route or a DNA preview/manual-entry surface first opens.
Every styled entry waits for the stylesheet, concurrent calls share one
request, failed links are removed and cache-busted for retry, and route/action
failures remain contained with an explanatory status. An HTML anchor preserves
the original cascade position, while dashboard genome tiles remain in the
eager `dashboard-data.css` bundle. The service-worker app shell retains the
deferred stylesheet for offline first use.

Client List remains module-eager because shell, profile, and location actions
use it, but `css/client-list.css` loads only when `openClientList()` is first
called. Opening waits for the stylesheet, concurrent opens share one request,
and a failed request is removed so the next open can retry. An HTML anchor
preserves the stylesheet's cascade position, and the service-worker app shell
retains it for offline first use.

Import review presentation loads through `import-loader.js` on the first file
input/drop interaction, pending-draft restoration, or direct cycle-import
preview. The generic action buttons, header import status, and empty-Labs drop
zone remain in `app-shell.css` because non-import features and startup routes
use them. Concurrent stylesheet requests share one load, failures are removed
for retry, an HTML anchor preserves cascade order, and the service-worker app
shell retains `css/import.css` for offline first use.

Marker detail, manual-entry, and custom-marker presentation remains
module-eager because dashboard, category, Biology Score, and sync refresh paths
share its behavior, but `css/marker-detail-modal.css` loads only when one of
those modal surfaces first opens through its already-eager runtime adapter. The
entry waits for the stylesheet so an unstyled modal is never shown, concurrent
requests share one load, failed links are removed and cache-busted for retry,
and an HTML anchor preserves the original cascade position before
Recommendations. The service-worker app shell retains the stylesheet for
offline first use.

The EMF assessment module and `css/emf.css` load together through
`emf-runtime.js` when an EMF editor entry point is first used. Cross-feature
launchers keep their presentation in their eager owning bundles, so the
deferred stylesheet contains only EMF editor and interpretation UI. Opening
waits for both resources, concurrent stylesheet requests share one load, and a
failed link is removed and cache-busted for retry. An HTML anchor preserves
the original cascade position, and the service-worker app shell retains the
stylesheet for offline first use.
