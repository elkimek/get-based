# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

getbased is a blood work dashboard for tracking biomarker trends over time. It visualizes lab results across 17 standard categories (biochemistry, hormones, lipids, hematology, body composition, bone density, etc.) with Chart.js line charts, data tables, and a correlation viewer. The app starts empty and is fully data-driven — users load their data via AI-powered PDF import (any lab report) or JSON files. Specialty labs (OAT, fatty acids, etc.) flow through the custom marker pipeline — each user gets their own lab's stated reference ranges from their PDF. Fatty acid tests are grouped by product/lab (Spadia, ZinZino, OmegaQuant) under a "Fatty Acids" sidebar group.

Uses AI APIs (PPQ, Routstr, OpenRouter, Venice, or Local AI) for AI-powered PDF import and an AI chat panel for interpreting results.

## Architecture

Web app (PWA) only: no build system, no bundler, no package manager — native ES modules (`<script type="module">`). The Electron shell was retired in v1.21.0; users who want hardware-accelerated RAG self-host any server that speaks the *External server* lens protocol (`POST /query` with bearer auth, see `docs/guide/interpretive-lens.md`).

- **`BRAND.md`** — brand manual. Name is `getbased`, lowercase, no space
- **`index.html`** — HTML skeleton (header, sidebar, modals, chat panel, script/CSS includes)
- **`styles.css`** — all CSS (dark/light themes, 10 responsive breakpoints, touch/hover media queries)
- **`js/`** — 68 ES modules loaded via `js/main.js`. Grouped by concern below; read the source for exported symbols.
  - **Core**: `state.js` (single mutable `state`), `utils.js` (escape, status, notifications, dialogs), `theme.js`, `constants.js` (option arrays, personalities, EMF presets), `schema.js` (`MARKER_SCHEMA`, unit conversions, pricing, EMF thresholds, usage tracking), `main.js` (entry point, OAuth callback, init)
  - **Data pipeline**: `data.js` (`getActiveData` central pipeline), `profile.js` (CRUD + migrations), `adapters.js` (217 specialty markers across fattyAcids/metabolomix/oat/biostarks), `pdf-import.js`, `export.js`, `backup.js`, `crypto.js` (AES-256-GCM + BroadcastChannel cross-tab), `pii.js` (regex + local-AI obfuscation with streaming sanitizer)
  - **AI + providers**: `api.js` (6 providers, `callClaudeAPI` router, OpenRouter OAuth PKCE, Venice E2EE branch, recommended-model tiering), `provider-panels.js` (extracted from settings.js), `cashu-wallet.js` (Cashu BIP-39 seed, Lightning fund/withdraw, fee splitting), `nostr-discovery.js` (Routstr node discovery via Kind 38421)
  - **Views + UI**: `views.js` (navigate, dashboard, category, compare, correlations, detail modal, manual entry, focus card, onboarding), `nav.js` (sidebar, avatar colors), `charts.js` (Chart.js plugins), `context-cards.js` (9 cards with AI health dots + interpretive lens + change history), `client-list.js`, `supplements.js` (+ `supplement-warnings.js`, `food-contaminants.js`), `recommendations.js` (DNA-aware catalog, 3 touchpoints), `cycle.js`, `emf.js` (Baubiologie SBM-2015), `glossary.js`, `feedback.js`, `tour.js`, `changelog.js`, `notes.js`, `hardware.js` (GPU detection, model fitness), `image-utils.js`
  - **Chat + context**: `chat.js` (panel, streaming, personalities, threads, images), `lab-context.js` (extracted: context assembly + memoization), `markdown.js` (extracted: XSS-safe rendering)
  - **Sync + agent access**: `sync.js` (Evolu CRDT, debounced `onDataSaved`, header badge), `settings.js` (modal + sync setup)
  - **Wearables**: 7 vendors — Oura · Ultrahuman · WHOOP · Fitbit · Withings · Polar · Apple Health + `manual` as a first-class pseudo-source (user-authored weight/BP/pulse, migrated from legacy `importedData.biometrics`). `wearable-adapters.js` (canonical metric registry + per-vendor endpoint map + primary-source resolver; Apple Health + `manual` are `authType !== 'oauth2'`). Per-vendor pairs: `wearables-oura-auth.js` + `wearables-oura.js`, `wearables-withings-auth.js` + `wearables-withings.js`, `wearables-ultrahuman-auth.js` + `wearables-ultrahuman.js`, `wearables-whoop-auth.js` + `wearables-whoop.js`, `wearables-fitbit-auth.js` + `wearables-fitbit.js`, `wearables-polar-auth.js` + `wearables-polar.js`, `wearables-apple-health.js` (file-import, no OAuth), `wearables-manual.js` (no OAuth — `logManualMetric` / `logManualBP` / `deleteManualMetric` / `MANUAL_TAGS` whitelist / `migrateBiometricsToManual` idempotent migration). Server-side OAuth2 (secrets in `.env.local` + proxy): Oura / Withings / Ultrahuman / Polar. PKCE (no secret): WHOOP / Fitbit. Polar-only quirks: one-time `POST /v3/users` registration + transactions-model data reads (open → read → commit-only-after-IDB-write) — orchestrated by `postConnect` + `commitAfterWrite` hooks in `OAUTH_DISPATCH`. `wearables-store.js` (per-profile IndexedDB `labcharts-wearables-{profileId}` + `deleteDaily` for single-row cleanup + two-phase `upsertDailyBatch` (read-merge-put) so partial-fetch syncs don't null existing fields, never syncs), `wearables-summary.js` (L2 derivation + write gate — 5% d7 shift, trend flips, ISO-week-keyed rollovers, 14d force-refresh, plus `metric-removed` + `source-flip` + `latest-advanced` triggers so deletions and fresh data points propagate; `force` flag bypasses the gate for user-driven manual syncs), `wearables-connect.js` (connect/disconnect/backfill/sync orchestration + unified `OAUTH_DISPATCH` table), `wearables.js` (dashboard strip render + per-metric source picker + per-card "as of {date}" staleness hint + dismissible "Connect a wearable" stub for users with labs but no wearables + empty-state cards with inline log forms + detail-modal Manual entries list with per-row delete/backfill + ⇄ reorder mode persisting `importedData.wearableCardOrder` + Settings → Wearables list — theme-aware logos via brand-assets.js). `brand-assets.js` (per-vendor brand-asset registry — `iconLight/Dark` for in-app row icons, `signInLight/Dark` for landing-site Connect buttons, `mono` fallback). Brand asset files live in `brands/<vendor>/` with per-vendor LICENSE.md; mirrored to landing site via `brands/sync-to-site.sh`. WHOOP + Ultrahuman currently gated to "waiting on partner credentials" via `clientId: 'REPLACE_WITH_*'`. Polar logo also gated to fallback render until written-consent ticket lands. Sync deliberately strips `wearableConnections` from the synced payload (`sync.js:buildSyncPayload`) — refresh tokens stay local; users connect each vendor per-device.
  - **Knowledge Base / Interpretive Lens**: `lens.js` routes between two backends — **`in-browser`** (OPFS + transformers.js, per-library model) and **`external-server`** (user URL + Bearer, any `POST /query` endpoint per `docs/guide/interpretive-lens.md`). `queryLens` retrieves top-K with LRU cache (20/5min, profile-scoped). Library CRUD (`_libCreate`/`_libActivate`/…) dispatches to the worker. Legacy backend keys migrate via `migrateLensConfig`.
  - **`lens-local*.js`** (main + worker + utils + parsers) — the in-browser lens stack. Module Worker running transformers.js WASM + OPFS persistence (`FileSystemSyncAccessHandle`) + MMR reranker (λ=0.5, 3× oversample) + pdf.js/mammoth/JSZip extraction. Per-library OPFS subdirs, `_libraries.json` tracks registry. **Per-library model** (v1.21.4+): `MODELS` catalog (MiniLM / BGE-small-en / multilingual-E5-small / BGE-base-en); `_loadEmbedder()` swaps on library activate. Startup benchmark emits a tier verdict (`_benchmarkEmbedder`) that pre-selects a device-matched default in the creation dialog. Lazy-loaded on backend select.
- **`vendor/`** — locally bundled Chart.js, chartjs-adapter-native, pdf.js (+worker), Google Fonts, Evolu (CRDT + SQLite WASM + OPFS worker), cashu-ts, bip39-minimal, qrcode-generator, mammoth (DOCX), JSZip, `venice-e2ee.js` (ECDH + HKDF + AES-GCM). `@huggingface/transformers` is NOT vendored — loaded from jsdelivr at runtime (bundler-gated bare specifiers). `./update-vendor.sh` refreshes.
- **`data/`** — `demo-female.json`, `demo-male.json`, `emf-assessment-template.html`, `snp-health.json` (47 autosomal SNPs across 13 categories), `haplogroups.json` (39 mtDNA + Wallace coupling, includes 11 sub-clades), `mito-compounds.json` (114 PubMed-cited compounds)
- **`tests/`** — `test-*.js` files, mostly Puppeteer browser asserts (IIFE + `assert(name, cond)` pattern); a few run node-side. `verify-modules.js` + `spike-*.html` perf spikes + `spike-fixtures/`.

Functions called from inline HTML `onclick` handlers are exposed via `Object.assign(window, {...})` at the bottom of each module. Cross-module calls use `window.fn()` to avoid circular dependencies.

### Data Flow

1. `getActiveData()` is the central pipeline: clones `MARKER_SCHEMA` → collects dates from `importedData.entries` → populates `values` arrays → calculates ratios/PhenoAge → unit conversion if US mode
2. All data in `importedData` under `localStorage` key `labcharts-{profileId}-imported`. Legacy fields auto-migrated via `migrateProfileData()`
3. `refOverrides`, `categoryLabels`/`categoryIcons`/`markerLabels` override display. `markerNotes` for freeform notes. `changeHistory` (capped 200) for AI temporal reasoning. `biometrics` stores time-series weight/BP/pulse (height on profile object)
4. Marker values are arrays aligned with `dates`; `null` = no result. `singlePoint` categories use grid cards. Charts use `spanGaps: true`
5. Each entry has `markerSources` (per-marker provenance): `{ "category.markerKey": { file: "filename.pdf", at: unixMs } }`. `file: null` = manual entry. Detail modal shows source filename per value

### PDF Import Pipeline

1. **Text extraction** → **PII obfuscation** (Local AI streaming or regex) → **AI analysis** (`parseLabPDFWithAI`, detects testType, maps to `category.markerKey`) → **Import preview** (confirm/exclude per row) → save
2. Unknown markers become custom markers (AI suggests key/name/unit/refs/group). Manual creation via sidebar "+" button. Specialty data auto-migrated via `SPECIALTY_MARKER_DEFS`
3. Batch import (`handleBatchPDFs`), sidebar grouping by `group` field, import status FAB. See `pdf-import.js`

### Profile Context Cards

Nine cards stored as structured objects in `importedData`. Cards: Health Goals, Medical Conditions, Diet & Digestion, Exercise, Sleep & Rest, Light & Circadian, Stress, Love Life & Relationships, Environment. Each has AI health dot (green/yellow/red) + tip. `buildLabContext()` in `lab-context.js` serializes all cards to AI context. See source for data structures.

### Menstrual Cycle Tracking

Female profiles only. Phase-aware reference ranges (`PHASE_RANGES`), cycle phase bands on charts, perimenopause detection, iron alerts. See `cycle.js`.

### EMF Assessment

Baubiologie sub-module under Environment card. Room-by-room measurements with SBM-2015 severity, source/mitigation tags, AI interpretation. See `emf.js`. EMF affiliate products live in the unified catalog at `data/recommendations.json` (`_internal.emfMeters` for meters, `env.*` for mitigation products). Region routing + UTM stamping handled by `recommendations.js`. Surfaces: empty-state meter CTA + post-interpretation mitigation product list. Gated by `isProductRecsEnabled()` (same toggle as supplements).

### Cross-Device Sync

Opt-in Evolu CRDT sync (Settings → Data). E2E encrypted, BIP-39 mnemonic identity. Last-write-wins via `syncedAt`. Header badge shows relay status. See `sync.js`, `settings.js`.

### Calculated Markers

Free Water Deficit (sodium-based), BUN/Creatinine Ratio (US-unit conversion), PhenoAge (Levine 2018, 9 biomarkers + age, requires hs-CRP). See `data.js` for formulas.

### AI Chat Panel

Slide-out panel with streaming. 2+custom personalities, stop/discuss buttons, conversation threads (50 max), image attachments (vision-gated), web search hints (3 states: active/available/E2EE). `buildLabContext()` serializes all user data in priority order. Focus card uses `buildFocusContext()`.

### AI Provider System

Six backends: PPQ, Routstr, OpenRouter, Venice, Local AI (Ollama/LM Studio/Jan), Custom. `callClaudeAPI(opts)` routes to active provider. `hasAIProvider()` gates all AI features. Venice E2EE: ECDH + AES-256-GCM, per-chunk streaming decryption, 30-min TTL. See `api.js`, `provider-panels.js`, `cashu-wallet.js`.

### Desktop app

**Retired in v1.21.0.** The getbased Electron shell was removed. Users who want local hardware-accelerated RAG self-host any server speaking the External server protocol and wire it into Settings → Knowledge Base → External server. See `memory/project_electron_retirement.md` for the full rationale.

### Dashboard Section Order

**Has data**: Onboarding Banner → Interpretive Lens → Focus Card → Wearable Strip (when connected) → Context Cards → Menstrual Cycle (female) → Supplements → Key Trends + charts → Trends & Alerts → Data & Notes + Export. Import FAB (floating button, bottom-right above chat FAB) replaces the compact drop zone.
**Empty state**: Welcome hero (drop zone + demo cards) → collapsed context cards.

### Other Features

- **Trend alerts**: `detectTrendAlerts()` — sudden change (>25% ref range jump) + linear regression (slope/R² thresholds)
- **Marker glossary**: searchable modal, all markers grouped by category with values and ranges
- **Guided tours**: 7-step app tour (auto on first visit) + 8-step cycle tour. Generic engine: `runTour(steps, storageKey, auto)`
- **What's New modal**: `CHANGELOG` array in changelog.js. `APP_VERSION` in `/version.js` — single source of truth for app + SW cache. Patch bumps skip What's New; minor/major show it
- **Chart layers**: single dropdown controlling note dots, supplement bars, cycle phase bands. Persisted per-profile
- **Onboarding**: chat-driven 5-stage wizard (profile → API → extras → cards → has-data nudge). First-time visitors get auto-opened chat instead of guided tour. Per-profile state in localStorage. Pre-lab path: no-data context assembly, context-aware chat prompts

## Development

```
node dev-server.js
```
Dev server mirrors production routing. Landing page repo (`../get-based-site`) served at `/` when present, app at `/app`. Docs at `/docs/*` route to `dist-docs/`.

### Recommendation catalog

`data/recommendations.json` holds the supplement / lifestyle / EMF affiliate catalog. For local development the maintainer typically symlinks it to a separate working directory; for forks, copy `data/recommendations.example.json` to `data/recommendations.json` to start from a minimal stub. For Vercel deploy, `scripts/fetch-catalog.mjs` (wired into `vercel.json`'s `buildCommand`) fetches the file at build time when `CATALOG_FETCH_URL` and `CATALOG_FETCH_TOKEN` env vars are set; without them, it preserves whatever `data/recommendations.json` contains (or copies the example stub if the file is missing).

### Tests

All tests (node-side + Puppeteer) run headlessly:
```
./run-tests.sh
```
Auto-starts server, runs node-side tests first (fast fail on helper regressions), then all browser tests via Puppeteer. Exits 0/1.

### Documentation Site

VitePress at `/docs` (source in `docs/`). 33 user guide pages + 9 contributor pages. Build: `npm run docs:build`. Vercel deploys to `/dist-docs/`.

### PWA

`manifest.json` + `service-worker.js`. Cache: `labcharts-v${APP_VERSION}`. Bump `version.js` to bust cache. AI API calls bypass SW entirely (avoids IPC stream buffering).

### Responsive Layout

Breakpoints: 3000/2000/1600/1400px (chat scaling), 1200px (cards 3→2 col), 1024px (sidebar → hamburger slide-out with backdrop), 768px (compact header — hides dates, range, feedback, donate; header groups with dividers), 600/480/375px (mobile). Grid items: `min-width: 0; overflow: hidden`. Touch: `@media (pointer: coarse)` 44px tap targets; `@media (hover: none)` reveals hover-only elements. Mobile sidebar: `toggleMobileSidebar()`/`closeMobileSidebar()` in nav.js, auto-closes on navigation.

## Key Patterns

- **Status**: `getStatus()` → `"normal"`, `"high"`, `"low"`, `"missing"`. Returns `"normal"` when refs are `null`
- **Theme**: Dark (default) / light. CSS vars in `:root`, overridden in `[data-theme="light"]`
- **Performance**: rendering functions accept optional `data` param to avoid redundant `getActiveData()` calls
- **Chart.js plugins**: `refBandPlugin`, `optimalBandPlugin`, `noteAnnotationPlugin`, `supplementBarPlugin`, `phaseBandPlugin`. Time scale (proportional) for multi-point markers, category scale for single-point. Custom native date adapter (`vendor/chartjs-adapter-native.js`). Plugins detect scale type and fall back to index-based positioning for category charts (correlation view)
- **Streaming**: SSE via `callClaudeAPI({ onStream })`
- **Security**: `escapeHTML(str)` for all innerHTML. Markdown URLs validated to http/https/mailto
- **Marker keys**: `category.markerKey` format (e.g., `biochemistry.glucose`) used everywhere
- **Debug**: `isDebugMode()` gates console output. Toggled in Settings → Privacy
- **Design system**: `--accent-gradient`, `--shadow-lg`/`--shadow-glow`, `.ctx-btn-group`/`.ctx-btn-option` pill buttons
