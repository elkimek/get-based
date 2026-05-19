# Architecture

## Zero-build philosophy

getbased has no bundler, no package manager, and no compile step. It uses native ES modules (`<script type="module">`) supported by every modern browser. The development workflow is:

1. Edit a file
2. Reload the browser

That is the entire build process. There is nothing else.

This constraint is intentional — it keeps the codebase approachable, removes tooling churn, and makes every file human-readable as shipped.

## File layout

```
index.html          — HTML structure only; script/CSS includes with SRI hashes; SEO meta tags
styles.css          — All CSS: dark/light themes, 10 responsive breakpoints, all components
manifest.json       — PWA manifest (installable as a native app)
service-worker.js   — PWA cache strategies, API bypass rules
data/
  demo-female.json  — Female demo profile (Sarah)
  demo-male.json    — Male demo profile (Alex)

tests/
  test-*.js         — browser-based + node-side test files (see run-tests.js for the list)
  verify-modules.js — Module integrity assertions

js/
  main.js           — Entry point: DOMContentLoaded init, global event listeners
  schema.js         — MARKER_SCHEMA, UNIT_CONVERSIONS, OPTIMAL_RANGES, PHASE_RANGES
  constants.js      — Option arrays, CHAT_PERSONALITIES, fake data, COUNTRY_LATITUDES
  state.js          — Single shared mutable state object
  utils.js          — escapeHTML, hashString, getStatus, formatValue, showNotification, linearRegression
  theme.js          — Theme get/set/toggle, getChartColors, time format helpers
  api.js            — AI provider routing, 6 providers (PPQ, Routstr, OpenRouter, Venice, Local AI, Custom), model management
  profile.js        — Profile CRUD, sex/DOB/location, migrateProfileData, profile dropdown
  data.js           — getActiveData() pipeline, unit conversion, date range, saveImportedData
  pii.js            — PII obfuscation: local AI (OpenAI-compatible) + regex fallback, diff viewer
  charts.js         — Chart.js plugins (5), createLineChart, destroyAllCharts
  notes.js          — Note editor: open/save/delete
  supplements.js    — Supplement editor and rendering
  cycle.js          — Menstrual cycle helpers, editor, dashboard rendering
  context-cards.js  — 9 context card editors, health dots, AI tips, summaries
  pdf-import.js     — PDF pipeline, batch import, import preview, drop zone
  export.js         — JSON export/import (single, per-client, database bundle), PDF report, clearAllData
  chat.js           — Chat panel, personalities, per-marker AI
  client-list.js    — Client List modal: search/sort/filter profiles, inline CRUD, archive/flag/pin
  recommendations.js — Supplement & lifestyle recommendations, lazy catalog, 3 touchpoints
  cashu-wallet.js   — In-app Cashu eCash wallet: BIP-39 seed, IndexedDB proofs, Lightning fund/withdraw
  nostr-discovery.js — Nostr relay queries for Routstr nodes (Kind 38421), health checks, caching
  settings.js       — Settings modal: profile, display, AI providers, privacy, security
  feedback.js       — Feedback modal (bug reports, feature requests)
  tour.js           — Guided tour spotlight engine (app tour + cycle tour)
  nav.js            — Sidebar, date range filter, chart layers dropdown
  views-router.js   — route validation, last-view persistence, scroll-anchor navigation
  lens-pages.js     — Labs, Genome, Body, Insight, and Recommendations page renderers
  dashboard-widgets.js — dashboard widget registry, defaults, widget prefs
  views.js          — dashboard renderers, Light/category views, modals, manual entry, onboarding
  crypto.js         — AES-256-GCM encryption, cross-tab sync (BroadcastChannel)
  backup.js          — IndexedDB auto-backup, folder backup (File System Access API), backup restore
  lab-context.js     — buildLabContext() central AI context serializer (extracted from chat.js)
  markdown.js        — renderMarkdown() block-aware parser (extracted from chat.js)
  provider-panels.js — AI provider panel rendering for settings modal (extracted from settings.js)
```

## Entry point

```
index.html
  └── <script type="module" src="js/main.js">
        └── imports all other modules (directly or transitively)
```

`main.js` registers the `DOMContentLoaded` listener, attaches global keyboard and event handlers, and calls the initial `navigate()` to render the dashboard.

## Navigation and dashboard IA

The sidebar has three conceptual groups:

- Home: `dashboard`, the customizable cross-lens overview.
- Lenses: `labs`, `genome`, `body`, `light`, `insight`, and `recommendations`. `views-router.js` validates and dispatches these routes. Labs, Genome, Body, Insight, and Recommendations pages are rendered through `lens-pages.js`; the Light page remains in `views.js` with the light-specific helpers it depends on.
- Tools: focused utilities such as compare dates, correlations, knowledge base, custom markers, and EMF assessment entry points.

The dashboard is not a replacement for lens pages. It is a user-composed overview made from lens/tool widgets. Default widgets are ordered for a new user as: Current Focus, Cycle when available, Current Priority, Quick Markers, Key Trends, Recommended Next Steps, Profile Context, Biometrics Overview, and Biological Age. Users can reorder, hide, reset, clear, and add widgets. Lens pages expose Add/Remove Dashboard toggles for widgets that can appear in the overview.

Recommendations have both a dashboard widget and a dedicated `recommendations` route. The page aggregates data-linked recommendation candidates from Labs, Body, Light, and Genome signals, while product option rendering and affiliate disclosure remain owned by `recommendations.js`.

## 6-layer dependency graph

Modules in a higher layer may import from lower layers. Modules in the same layer must not import from each other — cross-layer calls within the same layer use `window.fn()` to avoid circular dependencies.

```
┌─────────────────────────────────────────────────────────────────────┐
│  L1 — Foundation                                                    │
│  schema.js   constants.js   state.js   utils.js                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L2 — Core Services                                                 │
│  theme.js   api.js                                                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L3 — Data & Profile                                                │
│  profile.js   data.js   pii.js                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L4 — Domain Modules                                                │
│  charts.js   notes.js   supplements.js   cycle.js   context-cards.js│
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L5 — Feature Modules                                               │
│  pdf-import.js  export.js  chat.js  settings.js                     │
│  feedback.js    nav.js                                              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L6 — Orchestration                                                 │
│  dashboard-widgets.js  views.js  main.js  tour.js  changelog.js    │
└─────────────────────────────────────────────────────────────────────┘
```

### Circular dependency avoidance

The main tension is between `views.js` (which renders everything) and modules like `data.js` and `charts.js` (which views depend on but which also need to trigger re-renders). Two mechanisms break cycles:

**`registerRefreshCallback(fn)` in `data.js`** — `main.js` registers the refresh function after init, so `data.js` can trigger re-renders without importing `views.js`:

```js
// main.js
import { state } from './state.js';
import { registerRefreshCallback } from './data.js';
import { buildSidebar } from './nav.js';

registerRefreshCallback(() => {
  buildSidebar();
  window.navigate(state.currentView || 'dashboard');
});
```

**`window.fn()` calls** — functions exposed via `Object.assign(window, {...})` are callable from any module without creating an import edge:

```js
// cycle.js can call views.js functions without importing views.js
window.showDashboard();
```

## External dependencies

Bundled locally under `vendor/`:

| Library | Version | Purpose |
|---|---|---|
| Chart.js | 4.4.7 | Line charts, bar charts |
| pdf.js | 4.10.38 (legacy ESM) | PDF text extraction; loaded lazily via `js/pdfjs-loader.js` with `isEvalSupported: false` pinned for defense-in-depth |
| Inter, Outfit, JetBrains Mono | latest | Google Fonts (body, headings, data) |

AI providers (OpenRouter, Routstr, PPQ, Venice, Local AI) are called directly from the browser — no backend proxy.
