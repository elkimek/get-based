# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

getbased is a personal health intelligence platform organized around five lenses on the user's biology — **Labs**, **Genome**, **Body**, **Light**, **Insight**. Every lens informs every other: DNA shapes how labs are interpreted, wearable physiology shapes which biomarkers matter most, light environment shapes sleep and hormones, and the AI synthesizes across all of them with full context. Anti-reductionist by design.

- **🩸 Labs**: biomarkers across 17 categories + 217 specialty markers (custom marker pipeline), AI-powered PDF import, biological age (PhenoAge + Bortz), trend detection, correlation viewer
- **🧬 Genome**: 51 curated SNPs, APOE haplotype, 39 mtDNA haplogroups, DNA-aware recommendations
- **⌚ Body**: 7 wearable vendors (Oura/Withings/Ultrahuman/WHOOP/Fitbit/Polar/Apple Health), manual biometrics, cycle tracking with phase-aware ranges, EMF assessment (Baubiologie SBM-2015)
- **☀ Light**: sun sessions with Bird-Riordan spectral reconstruction, 19-preset photobiology device library (Chroma, EMR-Tek, Mitochondriak; custom devices supported), indoor light environment (rooms + screens), 8 on-device measurement tools, 6 channels (vit D / circadian / NIR / NO-cardiovascular / POMC / violet-eye) + 2 device-only PBM channels (660 nm red / 810-850 nm NIR), per-channel weekly chart, manual UVI override, photosensitive-medication awareness, burn-threshold alerts (70% / 100% MED), cumulative carry-over chip, altitude UV chip
- **🧠 Insight**: AI chat (6 providers), interpretive lens, custom knowledge base (RAG), 9 lifestyle context cards, supplement & lifestyle recommendations, cross-device sync (Evolu CRDT)

App is fully data-driven — starts empty, users load their data via PDF import or JSON files. All data stored locally in the browser, AES-256-GCM encrypted at rest, optional opt-in CRDT sync. Specialty labs flow through the custom marker pipeline.

## Architecture

Web app (PWA) only: production runtime ships with no build system, no bundler, and no runtime dependencies — just native ES modules (`<script type="module">`). Dev tooling does use `package.json` (Puppeteer + Vitest for tests) but those never reach end users. The Electron shell was retired in v1.21.0; users who want hardware-accelerated RAG self-host any server that speaks the *External server* lens protocol (`POST /query` with bearer auth, see `dev-docs/lens-endpoint-contract.md`).

- **`BRAND.md`** — brand manual. Name is `getbased`, lowercase, no space
- **`index.html`** — HTML skeleton (header, sidebar, modals, chat panel, script/CSS includes)
- **`styles.css`** — all CSS (dark/light themes, 10 responsive breakpoints, touch/hover media queries)
- **`js/`** — ES modules loaded via `js/main.js` (count drifts; `ls js/*.js | wc -l`). Grouped by concern below; read the source for exported symbols.
  - **Core**: `state.js` (single mutable `state`), `utils.js` (escape, status, notifications, dialogs), `theme.js`, `constants.js` (option arrays, personalities, EMF presets), `schema.js` (`MARKER_SCHEMA`, unit conversions, pricing, EMF thresholds, usage tracking), `main.js` (thin entry point), `app-feature-modules.js` (startup feature group coordinator), `app-foundation-modules.js` (startup foundation/privacy imports), `app-health-data-modules.js` (startup Health & Data feature imports), `app-light-sun-modules.js` (startup Light & Sun feature imports), `app-data-io-modules.js` (startup import/export feature imports), `app-ai-interaction-modules.js` (startup AI/chat/settings feature imports), `app-ui-shell-modules.js` (startup UI shell feature imports), `startup-orchestrator.js` (startup global wiring/phase ordering), `startup-foundation.js` (encryption/meteo/broadcast/folder bootstrap), `startup-profile.js` (profile migration/load/display bootstrap), `startup-oauth-callbacks.js` (wearable/OpenRouter callback routing), `startup-maintenance.js` (startup services and post-profile maintenance jobs), `startup-ui.js` (first-render UI bootstrap), `emf-facade.js` (lazy EMF window handlers), `app-event-listeners.js` (global modal/keyboard/refresh wiring)
  - **Data pipeline**: `data.js` (`getActiveData` central pipeline), `profile.js` (CRUD + migrations), `adapters.js` (217 specialty markers across fattyAcids/metabolomix/oat/biostarks), `pdf-import.js`, `import-file-input.js` (lazy file-picker import routing), `import-drop-zone.js` (lazy import drop-zone binding), `export.js`, `backup.js`, `crypto.js` (AES-256-GCM + BroadcastChannel cross-tab), `pii.js` (regex + local-AI obfuscation with streaming sanitizer)
  - **AI + providers**: `api.js` (6 providers, `callClaudeAPI` router, OpenRouter OAuth PKCE, Venice E2EE branch, recommended-model tiering), `provider-panels.js` (extracted from settings.js), `cashu-wallet.js` (Cashu BIP-39 seed, Lightning fund/withdraw, fee splitting), `nostr-discovery.js` (Routstr node discovery via Kind 38421)
  - **Views + UI**: `views-router.js` (route validation, per-profile last-view restore, scroll anchoring), `dashboard-view-composition.js` (dashboard route/widget/control wiring), `dashboard-page-view.js` (dashboard route shell, empty-state onboarding, mobile handoff, widget page composition), `lens-pages.js` (Labs/Genome/Body/Insight/Recommendations page renderers), `lens-page-shell.js` (shared lens header, widget chrome, ordering, and dashboard toggles), `dashboard-widgets.js` (dashboard widget registry, defaults, per-profile widget prefs), `dashboard-widget-controls.js` (widget picker, layout actions, drag/reorder controls), `dashboard-widget-renderers.js` (dashboard widget body renderers and recommendation helpers), `recommendation-actions.js` (recommendation modal/chat/save/dismiss handlers), `category-page-view.js` (category route shell, view switching, card-order preservation), `category-view-renderers.js` (category chart cards, table/heatmap shells, fatty-acid profile renderers), `category-customization.js` (category/marker rename helpers and category icon picker), `light-page-view.js` (Light & Sun page shell, Light Today strip, dashboard Light pills), `light-channel-view.js` (Light channel pills, sparklines, drill-down panels, citations, and suggestions), `views.js` (route wiring, compatibility exports, compare, correlations, detail modal, manual entry, focus card, onboarding), `nav.js` (sidebar, avatar colors), `charts.js` (Chart.js plugins), `context-cards.js` (9 cards with AI health dots + interpretive lens + change history), `client-list.js`, `supplements.js` (+ `supplement-warnings.js`, `food-contaminants.js`), `recommendations.js` (DNA-aware catalog, 3 touchpoints), `cycle.js`, `emf.js` (Baubiologie SBM-2015), `feedback.js`, `tour.js`, `changelog.js`, `notes.js`, `hardware.js` (GPU detection, model fitness), `image-utils.js`
  - **Chat + context**: `chat.js` (panel, streaming, personalities, threads, images), `chat-icons.js` (chat SVG icons + icon-button DOM helper), `chat-continuation.js` (token-limit detection + auto-continue wrapper), `chat-summaries.js` (conversation summaries + saved-summary modal actions), `lab-context.js` (extracted: context assembly + memoization), `markdown.js` (extracted: XSS-safe rendering)
  - **Sync + agent access**: `sync.js` (Evolu CRDT — Phase 1 dual-write across 44 importedData surfaces via 3 planners + Phase 2 cutover gate; debounced `onDataSaved`; header badge). User-facing UI labels in the Diagnose modal: Phase 1 → "Push efficiency", Phase 2 → "Lean sync mode". `settings.js` (modal + sync setup), `data-merge.js` (composite-keyed conflict resolution + 200-cap on changeHistory, exports `COMPOSITE_KEYED_ARRAYS`)
  - **Wearables**: 7 vendors — Oura · Ultrahuman · WHOOP · Fitbit · Withings · Polar · Apple Health + `manual` as a first-class pseudo-source (user-authored weight/BP/pulse, migrated from legacy `importedData.biometrics`). `wearable-adapters.js` (canonical metric registry + per-vendor endpoint map + primary-source resolver; Apple Health + `manual` are `authType !== 'oauth2'`). Per-vendor pairs: `wearables-oura-auth.js` + `wearables-oura.js`, `wearables-withings-auth.js` + `wearables-withings.js`, `wearables-ultrahuman-auth.js` + `wearables-ultrahuman.js`, `wearables-whoop-auth.js` + `wearables-whoop.js`, `wearables-fitbit-auth.js` + `wearables-fitbit.js`, `wearables-polar-auth.js` + `wearables-polar.js`, `wearables-apple-health.js` (file-import, no OAuth), `wearables-manual.js` (no OAuth — `logManualMetric` / `logManualBP` / `deleteManualMetric` / `MANUAL_TAGS` whitelist / `migrateBiometricsToManual` idempotent migration). Server-side OAuth2 (secrets in `.env.local` + proxy): Oura / Withings / Ultrahuman / Polar. PKCE (no secret): WHOOP / Fitbit. Self-hosters override the hardcoded `clientId` per-vendor via `*_CLIENT_ID` env vars (browser fetches via `/api/proxy {wearable_runtime_config: true}` at startup; memoized + 1.5s timeout; scheduler awaits before first sync; empty env = no-op for hosted). Polar-only quirks: one-time `POST /v3/users` registration + transactions-model data reads (open → read → commit-only-after-IDB-write) — orchestrated by `postConnect` + `commitAfterWrite` hooks in `OAUTH_DISPATCH`. `wearables-store.js` (per-profile IndexedDB `labcharts-wearables-{profileId}` + `deleteDaily` for single-row cleanup + two-phase `upsertDailyBatch` (read-merge-put) so partial-fetch syncs don't null existing fields, never syncs), `wearables-summary.js` (L2 derivation + write gate — 5% d7 shift, trend flips, ISO-week-keyed rollovers, 14d force-refresh, plus `metric-removed` + `source-flip` + `latest-advanced` triggers so deletions and fresh data points propagate; `force` flag bypasses the gate for user-driven manual syncs), `wearables-connect.js` (connect/disconnect/backfill/sync orchestration + unified `OAUTH_DISPATCH` table), `wearables.js` (dashboard strip render + per-metric source picker + per-card "as of {date}" staleness hint + dismissible "Connect a wearable" stub for users with labs but no wearables + empty-state cards with inline log forms + detail-modal Manual entries list with per-row delete/backfill + ⇄ reorder mode persisting `importedData.wearableCardOrder` + Settings → Wearables list — theme-aware logos via brand-assets.js). `brand-assets.js` (per-vendor brand-asset registry — `iconLight/Dark` for in-app row icons, `signInLight/Dark` for landing-site Connect buttons, `mono` fallback). Brand asset files live in `brands/<vendor>/` with per-vendor LICENSE.md; mirrored to landing site via `brands/sync-to-site.sh`. WHOOP + Ultrahuman currently gated to "waiting on partner credentials" via `clientId: 'REPLACE_WITH_*'`. Polar logo also gated to fallback render until written-consent ticket lands. Sync deliberately strips `wearableConnections` from the synced payload (`sync.js:buildSyncPayload`) — refresh tokens stay local; users connect each vendor per-device.
  - **Light & Sun**: `sun.js` (sessions with 16-region anatomical body picker — front/back split for face, throat, arms, torso, legs, feet — + 4 quick-presets capped at single-position-anatomical max, live ticker, `rotatedSides` flag + 🔄 Flip mid-session button doubles vit-D IU when user alternates sides, channel doses, hydrate, MED math, `vitaminDIU(channelAu, fitzpatrick, uvi, rotatedSides)` — `VITD_IU_PER_CHANNEL_AU=60` calibrated against dminder + NIWA, rolling totals), `sun-spectrum.js` (Bird-Riordan radiative transfer with Bass-Paur ozone cross-sections, 6 action spectra, vitaminDIU + fractionOfMED + erythemalSED + retinalUVdose with sun-elevation gate at 5°), `sun-uvdata.js` (Sun Data Source picker now 4 modes: `auto`=CAMS+Open-Meteo merge / `open-meteo` only / `selfhost` / `manual`; legacy `cams`/`noaa` auto-migrate to `auto`. **CAMS hosted relay** at `uvdata.getbased.health` proxied via `/api/proxy?meteo=cams` with bearer injected from `UVDATA_BEARER` env. `computeUVConfidence(opts)` returns real-time confidence weighted by snapshot age + cloud cover + zenith + UVI band + stale flag instead of a static per-source number. `_isValidSelfhostUrl` SSRF guard), `sun-defaults.js` (4-question Light setup card + 10-Q Ott light-burden audit + photosensitive-meds toggle), `sun-context.js` (AI-context tier emitter, ~520 tok always-tier), `sun-correlations.js` (per-channel × biomarker Pearson, 12-week rolling, n≥4 overlapping weeks), `light-devices.js` (19-preset device library — Chroma, EMR-Tek, Mitochondriak — plus custom-device CRUD + sessions; `synthesizeDeviceSpectrum()` accepts optional `peakShares` per-band power weights so hybrid panels with UVB+UVA+visible+NIR don't equal-split power across bands; distance correction capped at 3× near-field plateau), `light-env.js` (rooms + screens disclosure cards with chip pickers + light audits before/after compare), `light-tools.js` (8 measurement tools: Lux Meter / Flicker Detector / CCT Meter / Spectrum Classifier / Glass Transmission / Sleep Darkness / Sunrise Logger / Eye-Level Audit. **Storage model** (v1.6.7+): `lightMeasurements` is a sparse latest-per-(roomId, tool) array — `saveMeasurement` calls `_supersedePriorMeasurement` to tombstone any prior entry for the same room+tool. Audit-walkthrough rows (`tool='audit'`) are exempt — each walkthrough is its own record. AI context + UI iterate the sparse array directly, no time-window filter), `blob-storage.js` (IDB wrapper for >5MB importedData blobs). Active session pinned at the top of the Light & Sun page with a "Live" badge above the Stop CTA. Sun Data Source picker lives on the Light & Sun page itself (not Settings → Privacy).
  - **Knowledge Base / Interpretive Lens**: `lens.js` routes between **`in-browser`** (OPFS + transformers.js, per-library model) and **`external-server`** (user URL + Bearer per `dev-docs/lens-endpoint-contract.md`). `queryLens` retrieves top-K with LRU cache (20/5min, profile-scoped). `queryLensMulti` wraps it with LLM-driven paraphrase expansion + reciprocal-rank fusion to bridge vocabulary gaps. Lives in a dedicated modal (`openKnowledgeBaseModal`), not Settings → AI. Library CRUD via `_libCreate`/`_libActivate`. Legacy backend keys migrate via `migrateLensConfig`.
  - **`lens-local*.js`** (main + worker + utils + parsers) — the in-browser lens stack. Module Worker running transformers.js WASM + OPFS persistence (`FileSystemSyncAccessHandle`) + MMR reranker (λ=0.5, 3× oversample) + pdf.js/mammoth/JSZip extraction. Per-library OPFS subdirs, `_libraries.json` tracks registry. **Per-library model** (v1.21.4+): `MODELS` catalog (MiniLM / BGE-small-en / multilingual-E5-small / BGE-base-en); `_loadEmbedder()` swaps on library activate. Startup benchmark emits a tier verdict (`_benchmarkEmbedder`) that pre-selects a device-matched default in the creation dialog. Lazy-loaded on backend select.
- **`vendor/`** — locally bundled Chart.js, chartjs-adapter-native, pdf.js (+worker), Google Fonts, Evolu (CRDT + SQLite WASM + OPFS worker), cashu-ts, bip39-minimal, qrcode-generator, mammoth (DOCX), JSZip, `venice-e2ee.js` (ECDH + HKDF + AES-GCM). `@huggingface/transformers` is NOT vendored — loaded from jsdelivr at runtime (bundler-gated bare specifiers). `./update-vendor.sh` refreshes.
- **`data/`** — `demo-female.json`, `demo-male.json`, `emf-assessment-template.html`, `snp-health.json` (47 autosomal SNPs across 13 categories), `haplogroups.json` (39 mtDNA + Wallace coupling, includes 11 sub-clades), `mito-compounds.json` (114 PubMed-cited compounds)
- **`tests/`** — `test-*.js` files, mostly Puppeteer browser asserts (IIFE + `assert(name, cond)` pattern); a few run node-side. `verify-modules.js` (manual smoke test, not in `run-tests.sh`). `spike-fixtures/apple-health-sample.xml` is the only retained fixture asset.

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

Nine cards stored as structured objects in `importedData`. Cards: Health Goals, Medical History, Diet & Digestion, Exercise, Sleep & Rest, Light & Circadian, Stress, Love Life & Relationships, Environment. Each has AI health dot (green/yellow/red) + tip. `buildLabContext()` in `lab-context.js` serializes all cards to AI context. **Medical History** (`diagnoses` field) carries `conditions[]`, `note`, and `familyHistory[]` — the family-history subsection captures first-degree-plus-grandparent relatives (mother/father/sibling/child/maternal+paternal grandmothers/grandfathers), each entry = `{ relative, condition, onsetAge?, note? }`. See source for full data structures.

### Menstrual Cycle Tracking

Female profiles only. Phase-aware reference ranges (`PHASE_RANGES`), cycle phase bands on charts, perimenopause detection, iron alerts. See `cycle.js`.

### EMF Assessment

Baubiologie sub-module under Environment card. Room-by-room measurements with SBM-2015 severity, source/mitigation tags, AI interpretation. See `emf.js`. EMF affiliate products live in the unified catalog at `data/recommendations.json` (`_internal.emfMeters` for meters, `env.*` for mitigation products). Region routing + UTM stamping handled by `recommendations.js`. Surfaces: empty-state meter CTA + post-interpretation mitigation product list. Gated by `isProductRecsEnabled()` (same toggle as supplements).

### Cross-Device Sync

Opt-in Evolu CRDT sync (Settings → Data). E2E encrypted, BIP-39 mnemonic identity. Header badge shows relay status. See `sync.js`, `settings.js`.

**Two datapaths run in parallel (Phase 1 dual-write, shipped v1.6.0):**
1. *Fat-blob push* — the legacy path. `buildSyncPayload` ships the entire `importedData` plus profile/AI/chat envelope as one CRDT message (`_v: 3`). Back-compat with pre-v1.6.0 devices.
2. *Per-row CRDT deltas* — the new path. Three planners (`_planArrayDelta`, `_planKeyedMapDelta`, `_planScalarDelta`) emit small per-item inserts/updates/tombstones into a generic `itemRow` table keyed by `arrayName + itemId`. Covers **45 importedData surfaces**: 13 arrays (`DELTA_ARRAYS` — sunSessions, lightDevices, deviceSessions, lightAudits, lightMeasurements, lightEnvironment.rooms, lightEnvironment.screens, entries, notes, supplements, healthGoals, changeHistory, chatSummaries), 11 keyed maps (`DELTA_MAPS` — markerNotes, markerValueNotes, customMarkers, manualValues, refOverrides, categoryLabels, categoryIcons, markerLabels, wearablePrimaryOverride, genetics.snps, lightDailyVerdicts), and 21 scalars (`DELTA_SCALARS` — 8 context cards + interpretiveLens + contextNotes + menstrualCycle + emfAssessment + genetics + biometrics + sunCorrelations + lifelightProfile + sunDefaults + channelMixAI + lightEnvironment.burdenAI + wearableSummary + wearableCardOrder).

**Per-array overrides** (`DELTA_ARRAY_CONFIG`): `itemIdFn` derives a stable allowlist-safe itemId for items without a `.id` (changeHistory uses synth `field.dateMs`). `noTombstones: true` suppresses delete events for cap-evicted lists where local eviction would falsely propagate as a user-delete (changeHistory cap=200). Map equivalent (`DELTA_MAP_CONFIG`): `keyIdFn` for non-allowlist-safe raw keys (manualValues' `:`-bearing keys → doubling-escape); payload wraps `{k: rawKey, v: value}` so the original key is preserved on pull.

**Pull pipeline**: blob merge first (baseline), then `_mergeItemRowsIntoImported` overlays per-row state on top (authoritative — per-row wins on disagreement because it carries up-to-the-moment LWW). All three shapes route through the single function (array / map / scalar branches). Defence-in-depth: payload's claimed key/itemId must match `row.itemId` after itemIdFn/keyIdFn re-derivation; `_isAllowlistSafeId` rejects `__proto__`/`constructor`/`prototype` to block prototype pollution.

**Phase 2 cutover** (shipped v1.6.0, OFF by default): per-profile flag `labcharts-{profileId}-sync-cutover-v2`. When enabled, `buildSyncPayload` omits `importedData` entirely (`_v: 4`); per-row deltas become the only carrier. Gated by `getDeltaCutoverReadiness` which surveys all 44 surfaces for "any local data without a corresponding per-row push?" — refuses to enable while any blocker exists. Reversible via `disablePhase2Cutover`. Post-enable drift detection in `pushProfile` re-runs readiness on every push and auto-disables on schema drift (so a future commit adding a new write site outside DELTA_*/SCALARS reverts to dual-write instead of silently dropping data). Mixed-version (v3↔v4) cohorts converge: v4 devices pulling v3 rows merge the blob normally; v3 devices pulling v4 rows see no blob (no-op merge) + per-row pulls fill in everything. Two known Phase 2 edge cases deserve follow-up before recommending Phase 2 to users — see `memory/project_phase2_cutover_followups.md`.

**Telemetry** (shipped v1.6.0): per-push entry recorded in `localStorage` (rolling 50-entry cap), tracks blob bytes vs delta bytes vs ops per array. Sync diagnose modal renders the ratio + per-array breakdown + Phase 2 readiness panel. When ratio sits <5% across paired devices for ≥2 weeks AND readiness reads READY, Phase 2 is safe to flip.

**Hardening**: per-row gunzip capped at 1 MB to defeat decompression bombs (`_gunzipToStringCapped`). `_applyArrayDelta` returns boolean success — snapshot only advances when every op landed (no partial-failure poisoning). `restoreFromMnemonic` and `disableSync` clear `-delta-*` snapshots + cutover flag (otherwise the new owner's relay would be forever empty for items the planner thinks were already shipped). Selfhost UV-data bearer requires HTTPS (DNS-rebinding defence; see `sun-uvdata.js`).

### Calculated Markers

Free Water Deficit (sodium-based), BUN/Creatinine Ratio (US-unit conversion), PhenoAge (Levine 2018, 9 biomarkers + age, requires hs-CRP). See `data.js` for formulas.

### AI Chat Panel

Slide-out panel with streaming. 2+custom personalities, stop/discuss buttons, conversation threads (50 max), image attachments (vision-gated), web search hints (3 states: active/available/E2EE). `buildLabContext()` serializes all user data in priority order. Focus card uses `buildFocusContext()`.

### AI Provider System

Six backends: PPQ, Routstr, OpenRouter, Venice, Local AI (Ollama/LM Studio/Jan), Custom. `callClaudeAPI(opts)` routes to active provider. `hasAIProvider()` gates all AI features. Venice E2EE: ECDH + AES-256-GCM, per-chunk streaming decryption, 30-min TTL. See `api.js`, `provider-panels.js`, `cashu-wallet.js`.

### AI Verdict Engine

Shared `js/ai-verdict-engine.js` `createAIVerdict(cfg)` factory powers 10 per-row / per-day AI verdict surfaces across **Light & Sun** (ten feature modules + the shared engine). Engine owns: in-memory in-flight tracker (analyzing state never persists), 60s API watchdog, fingerprint cache (skip re-fire when target unchanged — applies to both auto + force calls; `cached.fingerprint === fingerprint` is checked BEFORE the provider gate so cached verdicts read without AI), JSON parse + dot validation against `[green,yellow,red,gray]`, save+immediate-`pushCurrentProfile()` (skip 10s onDataSaved debounce), one-time orphan-purge for legacy `status:'analyzing'`, custom-event broadcast (`labcharts-ai-verdict-updated`), global feature flag (`window.DISABLE_AI_VERDICTS = true` short-circuits all analyses).

Per-feature modules: `sun-ai-analysis.js`, `light-device-ai-analysis.js`, `light-tools-ai-analysis.js`, `light-env-ai-analysis.js`, `light-screen-ai-analysis.js`, `light-audit-ai-analysis.js`, `light-burden-ai-analysis.js`, `light-channels-ai-analysis.js`, `light-today-ai.js`, `sun-onboarding-ai.js`. Each is ~150-250 lines: feature-specific config (getTarget/getId/getAIAnalysis/setAIAnalysis adapters, fingerprint, buildContext) + system prompt + render functions.

Shared prompt block in `js/lighting-hardware-caveats.js` — load-bearing instruction set imported by every surface that recommends fixtures. Without this the model recommends "dimmable LEDs" as the cure for measured flicker (dimmable LEDs ARE the #1 source of household PWM flicker). De-branded — uses categories only ("DC-dimmable LED", "high-frequency PWM ≥2 kHz") + explicit "NEVER name a brand or product" instruction.

Storage: per-row CRDT for row-level (sun session, device, room, screen, audit, measurement); singleton fields for aggregates (`lightDailyVerdicts[date]`, `lightEnvironment.burdenAI`, `channelMixAI`, `sunDefaults.aiAnalysis`). Auto-fire on completion events (session stop, save, finish), manual on edit-flurry / aggregates.

Element-anchor scroll preservation (`createNavigate()` in `views-router.js`, exposed as `window.navigate` by `views.js`) restores the focused element's viewport-top after a rebuild — replaces an earlier pixel-based attempt that broke when content above the viewport changed height. Force layout via `void document.body.offsetHeight` before reading rect, then RAF re-apply during the stabilization window.

Canonical map of AI vs deterministic surfaces: `dev-docs/ai-surfaces-map.md` (was `docs/guide/ai-overview.md` in the retired VitePress site). Architecture memo: `memory/project_ai_verdict_arc_2026_05_06.md`.

### Desktop app

**Retired in v1.21.0.** The getbased Electron shell was removed. Users who want local hardware-accelerated RAG self-host any server speaking the External server protocol and wire it into Settings → Knowledge Base → External server. See `memory/project_electron_retirement.md` for the full rationale.

### Dashboard Section Order

**Has data**: Onboarding Banner → Interpretive Lens → Focus Card → Wearable Strip (when connected) → Context Cards → Menstrual Cycle (female) → Supplements → Key Trends + charts → Trends & Alerts → Data & Notes + Export. Import FAB (floating button, bottom-right above chat FAB) replaces the compact drop zone.
**Empty state**: Welcome hero (drop zone + demo cards) → collapsed context cards.

### Other Features

- **Trend alerts**: `detectTrendAlerts()` — sudden change (>25% ref range jump) + linear regression (slope/R² thresholds)
- **Guided tours**: 7-step app tour (auto on first visit) + 8-step cycle tour. Generic engine: `runTour(steps, storageKey, auto)`
- **What's New modal**: `CHANGELOG` array in changelog.js. `APP_VERSION` in `/version.js` — single source of truth for app + SW cache. Patch bumps skip What's New; minor/major show it
- **Chart layers**: single dropdown controlling note dots, supplement bars, cycle phase bands. Persisted per-profile
- **Onboarding**: chat-driven 5-stage wizard (profile → API → extras → cards → has-data nudge). First-time visitors get auto-opened chat instead of guided tour. Per-profile state in localStorage. Pre-lab path: no-data context assembly, context-aware chat prompts
- **Dashboard CTAs**: inline `.dashboard-cta` pills under the Interpretive Lens row. Two pickers: `openPersonalizeAIPicker` (Lens + KB) and `openDataProtectionPicker` (Encryption + Sync + Auto-backup). Adaptive copy — exactly-one-missing renders a direct CTA, 2+ missing renders a generic pill that opens the picker, all-configured hides. DNA discovery lives separately in `renderGeneticsSection()`'s empty-state stub (DNA is data, not a personalization preference).

## Development

```
node dev-server.js
```
Dev server mirrors production routing. Landing page repo (`../get-based-site`) served at `/` when present, app at `/app`. `/docs/*` 301-redirects to `docs.getbased.health` (docs are hosted on Mintlify).

### Recommendation catalog

`data/recommendations.json` holds the supplement / lifestyle / EMF affiliate catalog. For local development the maintainer typically symlinks it to a separate working directory; for forks, copy `data/recommendations.example.json` to `data/recommendations.json` to start from a minimal stub. For Vercel deploy, `scripts/fetch-catalog.mjs` (wired into `vercel.json`'s `buildCommand`) fetches the file at build time when `CATALOG_FETCH_URL` and `CATALOG_FETCH_TOKEN` env vars are set; without them, it preserves whatever `data/recommendations.json` contains (or copies the example stub if the file is missing).

### Tests

All tests (node-side + Puppeteer) run headlessly:
```
./run-tests.sh
```
Auto-starts server, runs node-side tests first (fast fail on helper regressions), then all browser tests via Puppeteer. Exits 0/1.

### Documentation

User docs are hosted on Mintlify at `docs.getbased.health` (source in the separate `elkimek/getbased-docs` repo). `vercel.json` 301-redirects the old `app.getbased.health/docs/*` paths to the Mintlify equivalents (`/docs/guide/X` → `/guides/X`, with a few explicit renames). Contributor/developer docs live in `dev-docs/` as plain markdown (read on GitHub; surfaced via a link-out in the Mintlify nav). The old in-repo VitePress site has been retired.

### PWA

`manifest.json` + `service-worker.js`. Cache: `labcharts-v${APP_VERSION}`. Bump `version.js` to bust cache. AI API calls bypass SW entirely (avoids IPC stream buffering).

### Agent discovery metadata

`.well-known/mcp.json` + `.well-known/agent-skills/` describe the `getbased-mcp` server for AI agents. These files are mirrored verbatim from the `get-based-site` repo — keep both copies in sync when the MCP version, tool list, or auth changes. If `SKILL.md` changes, regenerate its `sha256` digest in `index.json`.

`robots.txt` and `sitemap.xml` are static files at the repo root (the sitemap is just the app root — docs have their own sitemap on the Mintlify domain).

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
- **Units**: storage is SI; `UNIT_CONVERSIONS` in `schema.js` keys per dotKey to `{factor, usUnit, type}`. `getAlternateUnit(dotKey, value, isUSMode)` returns the other system for dual-display; `convertUserInputToSI(dotKey, value, inputUnit)` accepts either system at manual-entry time. Per-profile `state.showAltUnits` (Settings → Display) toggles the secondary `≈` line in the detail modal. Add an entry per real numerical conversion AND per label-only US convention (e.g. mU/L ↔ µIU/mL has `factor: 1` so US users can recognize their lab-report unit). Skip true universals (homocysteine µmol/L)
- **Debug**: `isDebugMode()` gates console output. Toggled in Settings → Privacy
- **Design system**: `--accent-gradient`, `--shadow-lg`/`--shadow-glow`, `.ctx-btn-group`/`.ctx-btn-option` pill buttons
