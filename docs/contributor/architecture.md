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
  test-*.js         — 30 browser-based test files
  verify-modules.js — Module integrity assertions

js/
  main.js           — Entry point: DOMContentLoaded init, global event listeners
  schema.js         — MARKER_SCHEMA, UNIT_CONVERSIONS, OPTIMAL_RANGES, PHASE_RANGES
  constants.js      — Option arrays, CHAT_PERSONALITIES, fake data, COUNTRY_LATITUDES
  state.js          — Single shared mutable state object
  utils.js          — escapeHTML, hashString, getStatus, formatValue, showNotification, linearRegression
  theme.js          — Theme get/set/toggle, getChartColors, time format helpers
  api.js            — AI provider routing, all 5 providers, model management
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
  chat.js           — Chat panel, buildLabContext, markdown, personalities, per-marker AI
  client-list.js    — Client List modal: search/sort/filter profiles, inline CRUD, archive/flag/pin
  recommendations.js — Supplement & lifestyle recommendations, lazy catalog, 3 touchpoints
  cashu-wallet.js   — In-app Cashu eCash wallet: BIP-39 seed, IndexedDB proofs, Lightning fund/withdraw
  nostr-discovery.js — Nostr relay queries for Routstr nodes (Kind 38421), health checks, caching
  settings.js       — Settings modal: profile, display, AI providers, privacy, security, backup
  glossary.js       — Marker glossary modal
  feedback.js       — Feedback modal (bug reports, feature requests)
  tour.js           — Guided tour spotlight engine (app tour + cycle tour)
  nav.js            — Sidebar, date range filter, chart layers dropdown
  views.js          — navigate(), dashboard, category views, modals, manual entry, onboarding
  crypto.js         — AES-256-GCM encryption, IndexedDB auto-backup, folder backup, backup restore
```

## Entry point

```
index.html
  └── <script type="module" src="js/main.js">
        └── imports all other modules (directly or transitively)
```

`main.js` registers the `DOMContentLoaded` listener, attaches global keyboard and event handlers, and calls the initial `navigate()` to render the dashboard.

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
│  pdf-import.js  export.js  chat.js  settings.js  glossary.js       │
│  feedback.js    nav.js                                              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L6 — Orchestration                                                 │
│  views.js   main.js   tour.js   changelog.js                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Circular dependency avoidance

The main tension is between `views.js` (which renders everything) and modules like `data.js` and `charts.js` (which views depend on but which also need to trigger re-renders). Two mechanisms break cycles:

**`registerRefreshCallback(fn)` in `data.js`** — `main.js` registers the refresh function after init, so `data.js` can trigger re-renders without importing `views.js`:

```js
// main.js
import { registerRefreshCallback } from './data.js';
registerRefreshCallback(() => window.refreshDashboard());
```

**`window.fn()` calls** — functions exposed via `Object.assign(window, {...})` are callable from any module without creating an import edge:

```js
// cycle.js can call views.js functions without importing views.js
window.showDashboard();
```

## External dependencies

Loaded from CDN with SRI integrity hashes in `index.html`:

| Library | Version | Purpose |
|---|---|---|
| Chart.js | 4.4.7 | Line charts, bar charts |
| pdf.js | 3.11.174 | PDF text extraction |
| Inter, Outfit, JetBrains Mono | latest | Google Fonts (body, headings, data) |

AI providers (OpenRouter, Routstr, PPQ, Venice, Local AI) are called directly from the browser — no backend proxy.
