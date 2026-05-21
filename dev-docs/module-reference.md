# Module Reference

Modules live under `js/` (current count: `ls js/*.js | wc -l`). Grouped by layer — lower layers have no dependencies on higher ones.

---

## Layer 1 — Foundation

### `schema.js`

The single source of truth for all biomarker definitions. No runtime logic — pure data.

**Key exports:**
- `MARKER_SCHEMA` — nested object: `{ categoryKey: { label, icon, markers: { markerKey: { name, unit, refMin, refMax, refMin_f, refMax_f, desc } } } }`. Categories include `biochemistry`, `hormones`, `electrolytes`, `lipids`, `hematology`, `differential`, `thyroid`, `proteins`, `vitamins`, `diabetes`, `inflammation`, `fattyAcids`, `calculatedRatios`, and others
- `UNIT_CONVERSIONS` — keyed by `"category.markerKey"`: `{ type: 'multiply', factor, unit }` for EU→US conversions
- `OPTIMAL_RANGES` — keyed by `"category.markerKey"`: `{ optimalMin, optimalMax, optimalMin_f?, optimalMax_f? }`
- `PHASE_RANGES` — keyed by `"category.markerKey"`: `{ menstrual: { min, max }, follicular: {...}, ovulatory: {...}, luteal: {...} }` — covers `hormones.estradiol`, `hormones.progesterone`, `hormones.lh`, and `hormones.fsh`
- `SPECIALTY_MARKER_DEFS` — re-exported from `adapters.js` as `ADAPTER_MARKERS`. Used by `migrateProfileData()` and `buildMarkerReference()`
- `CHIP_COLORS` — status → CSS color string
- `MODEL_PRICING` — AI model pricing metadata, keyed by provider/model

**Window exports:** none

---

### `adapters.js`

Parser adapter registry for specialty lab detection and normalization. Single source of truth for all specialty marker definitions (OAT, fatty acids, Metabolomix+, BioStarks).

**Key exports:**
- `ADAPTER_MARKERS` — flat object keyed by `"category.markerKey"`: `{ name, unit, refMin, refMax, categoryLabel, icon, group, singlePoint? }` (217 entries). Re-exported from `schema.js` as `SPECIALTY_MARKER_DEFS`
- `getAllAdapterMarkers()` — returns merged marker map from all registered adapters
- `detectProduct(fileName, pdfText)` — runs all adapter `detect()` functions, returns `{ adapter, product: { prefix, label } }` or `null`
- `normalizeWithAdapter(adapter, markers, fileName, pdfText, product)` — dispatches to `adapter.normalize()` for post-AI marker key/category rewriting
- `getAdapterByTestType(testType)` — looks up adapter by AI-returned test type string

**Adapter registry:** array of `{ id, testTypes[], markers, detect?, normalize? }`:
- `fattyAcids` — 29 markers, detects Spadia/ZinZino/OmegaQuant by filename/text, normalizes to product-prefixed categories under "Fatty Acids" sidebar group
- `metabolomix` — no unique markers (reuses OAT + FA), detects Genova Metabolomix+ reports, routes FA add-on markers to `metabolomixFA` prefix
- `oat` — 165 markers, no detect/normalize (AI handles OAT categorization directly)
- `biostarks` — 23 markers, detects BioStarks dried blood spot reports by filename/text, normalizes specialty markers (amino acids, serum FA, intracellular minerals, hormones, vitamins) while passing standard blood markers through to schema categories (hybrid import)

**Window exports:** none

---

### `constants.js`

Static arrays and string constants used across modules.

**Key exports:**
- `CHAT_PERSONALITIES` — array of `{ id, name, icon, promptText }` for the 3 built-in personalities
- `CHAT_SYSTEM_PROMPT` — the base system prompt string injected into all AI chat requests
- `COUNTRY_LATITUDES` — `{ countryCode: latitudeBand }` (~70 countries, 5 bands: arctic/north/temperate/subtropical/tropical)
- `FAKE_DATA` — synthetic name/address/DOB data for PII obfuscation
- Per-card option arrays: `SLEEP_DURATIONS`, `SLEEP_QUALITIES`, `SLEEP_SCHEDULES`, `SLEEP_ISSUES`, `SLEEP_ENVIRONMENTS`, `SLEEP_PRACTICES`, `LIGHT_AM`, `LIGHT_DAYTIME`, `LIGHT_UV`, `LIGHT_EVENING`, `LIGHT_SCREEN`, `LIGHT_TECH_ENV`, `LIGHT_COLD`, `LIGHT_GROUNDING`, `LIGHT_MEAL_TIMING`, `STRESS_LEVELS`, `STRESS_SOURCES`, `STRESS_MANAGEMENT`, `ENV_SETTING`, `ENV_CLIMATE`, `ENV_WATER`, `ENV_WATER_CONCERNS`, `ENV_EMF`, `ENV_EMF_MITIGATION`, `ENV_HOME_LIGHT`, `ENV_AIR`, `ENV_TOXINS`, `ENV_BUILDING`, `LOVE_STATUS`, `LOVE_RELATIONSHIP`, `LOVE_SATISFACTION`, `LOVE_LIBIDO`, `LOVE_FREQUENCY`, `LOVE_ORGASM`, `LOVE_CONCERNS`, `PERIOD_SYMPTOMS`, `DIET_TYPES`, `DIET_RESTRICTIONS`, `DIET_PATTERNS`, `EXERCISE_FREQUENCIES`, `EXERCISE_TYPES`, `EXERCISE_INTENSITIES`, `EXERCISE_DAILY_MOVEMENT`

**Window exports:** none

---

### `state.js`

Single shared mutable state object. Import `state` to read or write. No logic.

**Key exports:**
- `state` — the mutable singleton:
  ```js
  {
    chartInstances: {},        // Chart.js instances by element id
    markerRegistry: {},        // runtime marker lookup cache
    importedData: {            // all user data for the active profile
      entries: [],             // lab results: [{ date, markers: { "cat.key": value } }]
      notes: [],               // [{ date, text }]
      supplements: [],         // supplement timeline entries
      healthGoals: [],         // [{ text, severity }]
      diagnoses: null,         // { conditions: [{ name, severity, since? }], note }
      diet: null,              // structured meal object
      exercise: null,          // structured exercise object
      sleepRest: null,         // structured sleep object
      lightCircadian: null,    // structured light/circadian object
      stress: null,            // structured stress object
      loveLife: null,          // structured relationship/sexual health object
      environment: null,       // structured environment object
      interpretiveLens: '',    // freetext string
      contextNotes: '',        // freetext string
      menstrualCycle: null,    // { cycleLength, periodLength, regularity, flow, periods[] }
      customMarkers: {}        // { "cat.key": { name, unit, refMin, refMax, categoryLabel } }
    },
    unitSystem: 'EU',          // 'EU' | 'US'
    currentProfile: 'default', // active profile id
    profiles: null,            // loaded profiles array
    profileSex: null,          // 'male' | 'female' | null
    profileDob: null,          // 'YYYY-MM-DD' | null
    chatHistory: [],           // current thread messages
    chatThreads: [],           // thread index array
    currentThreadId: null,
    currentChatPersonality: 'default',
    dateRangeFilter: 'all',    // 'all' | '6m' | '1y' | '2y'
    rangeMode: 'optimal',      // 'optimal' | 'reference'
    suppOverlayMode: 'off',    // 'off' | 'on'
    noteOverlayMode: 'off',
    phaseOverlayMode: 'off',
    compareDate1: null,
    compareDate2: null,
  }
  ```

`window._labState = state` is set for debugging in the browser console.

**Window exports:** none (state is accessed via import)

---

### `utils.js`

Shared pure utility functions.

**Key exports:**
- `escapeHTML(str)` — escapes `<>&"'` for safe innerHTML insertion
- `hashString(str)` — djb2 hash, returns integer
- `getStatus(value, refMin, refMax)` — `'normal'` | `'high'` | `'low'` | `'missing'`. Returns `'normal'` when refs are `null`
- `formatValue(value, unit)` — formats a numeric value with appropriate decimal places
- `showNotification(message, type)` — toast notification (`'info'` | `'success'` | `'error'` | `'warning'`)
- `showConfirmDialog(message)` — returns `Promise<boolean>`, styled confirm dialog
- `linearRegression(points)` — `{ slope, intercept, r2 }` from `[{ x, y }]` array
- `hasCardContent(obj)` — generic empty-card gate: returns `true` if any field has content (strings non-empty, arrays non-empty, `note` trimmed). Used by `buildLabContext()` for 7 context card gates

**Window exports:** `showNotification`, `showConfirmDialog`, `setDebugMode`, `setPIIReviewEnabled`, `hasCardContent`

---

## Layer 2 — Core Services

### `theme.js`

Theme management and Chart.js color helpers.

**Key exports:**
- `getTheme()` / `setTheme(theme)` / `toggleTheme()` — `'dark'` | `'light'`; `setTheme` sets `data-theme` on `<html>`
- `getChartColors()` — reads live CSS custom properties and returns a chart color config object
- `formatDateLabel(dateStr)` — formats ISO date for chart x-axis
- `getTimeFormat()` / `setTimeFormat(fmt)` — `'24h'` | `'12h'`, stored in `labcharts-time-format`
- `formatTime(timeStr)` — formats a 24h time string for display using the active format
- `parseTimeInput(input)` — accepts both `'14:30'` and `'2:30 PM'`, always returns 24h format

**Window exports:** `toggleTheme`

---

### `hardware.js`

GPU detection and model fitness advisor for Local AI settings. Pure functions, no DOM manipulation.

**Key exports:**
- `detectHardware()` — async, returns `{ gpu: { name, vram, unified, renderer, source }, ram: { gb, source }, cpuThreads }`. GPU detected via WebGL `WEBGL_debug_renderer_info` matched against 75-entry `GPU_DB` (Apple Silicon M1–M4, NVIDIA RTX 30/40/50, AMD RX 6000/7000, Intel Arc, Vega)
- `assessModel(modelObj, hardware)` — returns `{ tier, badge, vramNeeded, label }` where tier is `'fits'` / `'tight'` / `'toobig'` / `'unknown'`
- `assessFitness(modelName)` — rates a model for getbased lab analysis: `{ tier, note }` where tier is `'recommended'` / `'capable'` / `'underpowered'` / `'inadequate'`. Benchmarked against Sonnet 4.6
- `getBestModel(modelDetails, hardware)` — picks the highest-fitness installed model that fits in VRAM
- `getUpgradeSuggestion(modelDetails, hardware)` — returns a pull recommendation if no installed model is "recommended" tier
- `saveHardwareOverride(vram)` / `getHardwareOverride()` — manual VRAM override in localStorage

**Window exports:** none (imported by `settings.js`)

---

### `api.js`

AI provider routing and model management. All AI calls flow through `callClaudeAPI`.

**Key exports:**
- `callClaudeAPI(opts)` — main router: delegates to the active provider based on `getAIProvider()`
- `callOpenRouterAPI(opts)` — OpenRouter via `callOpenAICompatibleAPI`
- `callRoutstrAPI(opts)` — Routstr via `callOpenAICompatibleAPI`
- `callPPQAPI(opts)` — PPQ via `callOpenAICompatibleAPI`
- `callVeniceAPI(opts)` — Venice AI via `callOpenAICompatibleAPI`
- `callOpenAICompatibleLocalAPI(opts)` — Local AI via shared `callOpenAICompatibleAPI` helper
- `callOpenAICompatibleAPI(endpoint, key, model, providerName, opts, extraHeaders)` — shared OpenAI-format helper
- `getAIProvider()` / `setAIProvider(provider)` — `'openrouter'` | `'routstr'` | `'ppq'` | `'venice'` | `'ollama'` (internal key for Local)
- `hasAIProvider()` — returns `true` if any provider is configured; gates all 7 AI features
- `getOpenRouterModel()`, `getRoutstrModel()`, `getPPQModel()`, `getVeniceModel()`, `getOllamaMainModel()`
- `fetchOpenRouterModels()`, `fetchRoutstrModels()`, `fetchPPQModels()`, `fetchVeniceModels()` — dynamic model lists
- `getModelPricing(modelId)` — checks dynamic OpenRouter pricing cache, falls back to `MODEL_PRICING`
- `OPENROUTER_CURATED` — whitelist of latest-gen medically capable models (prefix-matched)
- `OPENROUTER_EXCLUDE` — blocklist filtering codex/audio/image/oss variants

**Window exports:** `getRoutstrNodeUrl` (used by settings UI for node URL access)

---

### `cashu-wallet.js`

In-app Cashu eCash wallet for decentralized AI payments. Proofs stored in IndexedDB, BIP-39 seed encrypted in localStorage.

**Key exports:**
- `getMintUrl()` / `setMintUrl(url)` — configured Cashu mint
- `generateWalletSeed()` — creates 12-word BIP-39 mnemonic
- `restoreWalletFromSeed(mnemonic)` — restores proofs from mint via `batchRestore`
- `getWalletBalance()` — sum of unspent proofs for current mint
- `createFundingInvoice(amountSats)` / `checkFundingStatus(quoteId)` — Lightning deposit flow
- `receiveToken(tokenString)` — deposit a Cashu token
- `depositToNode(nodeUrl, amountSats, existingKey)` — swap proofs for a node session key
- `sendAsToken(amountSats)` — withdraw as shareable Cashu token
- `createWithdrawQuote(bolt11)` / `executeWithdraw(quoteId)` — Lightning withdrawal
- `withdrawToAddress(address, amountSats)` — LNURL-pay withdrawal
- `recoverPendingDeposit()` / `recoverPendingWithdraw()` — failed operation recovery
- `exportWallet()` / `importWallet(tokenString)` — backup/restore
- `getFeePct()` — current fee percentage (0 during beta)

**Window exports:** all functions prefixed with `cashu` (e.g., `cashuGetBalance`, `cashuDepositToNode`)

---

### `nostr-discovery.js`

Discovers Routstr AI nodes via Nostr relays (Kind 38421 events).

**Key exports:**
- `discoverNodes(forceRefresh)` — queries relays in parallel, deduplicates, health-checks, returns sorted node array
- `getSelectedNodeUrl()` / `setSelectedNodeUrl(url)` — persisted node selection
- `clearNodeCache()` — force re-discovery on next call

**Window exports:** `nostrDiscoverNodes`, `nostrGetSelectedNode`, `nostrSetSelectedNode`, `nostrClearNodeCache`

---

## Layer 3 — Data & Profile

### `profile.js`

Profile lifecycle and settings persistence.

**Key exports:**
- `profileStorageKey(profileId, suffix)` — builds `labcharts-{profileId}-{suffix}`
- `loadProfiles()` / `saveProfiles()` — profile index CRUD
- `switchProfile(profileId)` — loads importedData from localStorage for the given profile
- `deleteProfile(profileId)` — removes all keys for the profile
- `migrateProfileData()` — upgrades legacy field formats on load (old `sleepCircadian` → `sleepRest` + `lightCircadian`, old `fieldExperts`/`fieldLens` → `interpretiveLens`, initializes missing fields with `null`)
- `getProfileLocation()` / `setProfileLocation(country, zip)` — country+ZIP storage
- `getLatitudeFromLocation()` — looks up latitude band from `COUNTRY_LATITUDES`
- `renderProfileDropdown()` — renders the profile selector UI

**Window exports:** `openProfileEditor`, `switchProfile`, `deleteProfile`, `addProfile`, `saveProfile`

---

### `data.js`

The central data pipeline. Every view gets its data from `getActiveData()`.

**Key exports:**
- `getActiveData()` — deep-clones `MARKER_SCHEMA`, merges custom markers, applies sex-specific ranges, populates `values[]` arrays from `importedData.entries`, computes ratios + PhenoAge + cycle phases, applies unit conversion. Returns `data` object with `{ dates[], dateLabels[], categories, phaseLabels? }`
- `saveImportedData()` — persists `state.importedData` to localStorage (or encrypted store), triggers backup
- `buildMarkerReference()` — compact JSON of all known markers for AI system prompts (PDF import)
- `filterDatesByRange(data)` — applies `state.dateRangeFilter` to dates + values arrays in-place
- `getEffectiveRange(marker)` — returns `{ refMin, refMax }` respecting `state.rangeMode`
- `getEffectiveRangeForDate(marker, dateIndex)` — phase-aware range lookup; falls back to `getEffectiveRange()`
- `getPhaseRefEnvelope(marker)` — widest span across all cycle phases for chart ref bands
- `registerRefreshCallback(fn)` — registers the refresh function from `app-event-listeners.js`
- `detectTrendAlerts(data)` — sudden-change (25% of ref range, 2+ values) and linear-regression (slope >0.02, R²>0.5 for 4+ points) alerts
- `getAllFlaggedMarkers(data)` — markers >50% of reference range width past their boundary
- `getFocusCardFingerprint()` — djb2 hash of all entries + all 9 context cards + sex + DOB

**Window exports:** `saveImportedData`, `clearAllData` (via export.js), `filterDatesByRange`

---

### `pii.js`

Two-path PII obfuscation for PDF text before AI submission, with streaming review modal.

**Key exports:**
- `sanitizeWithOllamaStreaming(pdfText, onChunk, signal)` — preferred path: SSE streaming via OpenAI-compatible API, calls `onChunk(delta)` per token, supports `AbortSignal`
- `sanitizeWithOllama(pdfText)` — non-streaming path: same endpoint, used when review is disabled
- `obfuscatePDFText(pdfText)` — regex fallback: label-based + pattern-based replacement, returns `{ obfuscated, original, replacements }`
- `reviewPIIBeforeSend(originalText, { obfuscatedText, streamFn })` — review modal: streaming mode (pass `streamFn`) or static mode (pass `obfuscatedText`). Returns edited text or `'cancel'`
- `checkOllamaPII()` — checks PII server availability via `/v1/models`
- `getOllamaConfig()` / `saveOllamaConfig(config)` — local AI config: `{ url, model, apiKey }`
- `showPIIDiffViewer(original, obfuscated, replacements)` — debug diff viewer (requires `labcharts-debug` flag)

**Window exports:** `setOllamaPIIModel`

---

### `image-utils.js`

Shared image utilities for chat attachments and PDF image fallback.

**Key exports:**
- `resizeImage(file, maxDim?, quality?)` — resizes an image to fit within `maxDim` pixels (default 1024), returns `{ base64, mediaType, width, height, origWidth, origHeight, quality_warnings }`
- `isValidImageType(type)` — validates MIME type against `image/(jpeg|png|gif|webp)`
- `formatImageBlock(base64, mediaType, provider)` — returns a provider-specific image content block (`type:'image_url'` for OpenAI-compatible providers)
- `buildVisionContent(imageBlocks, text, provider)` — assembles a content array with image blocks + text block

**Internal:**
- `analyzeImageQuality(ctx, width, height)` — canvas-based pixel sampling (~100k samples): brightness (dark/overexposed) + Laplacian variance (blur detection). Returns `string[]` warnings

**Window exports:** `resizeImage`, `isValidImageType`, `formatImageBlock`, `buildVisionContent`

---

## Layer 4 — Domain Modules

### `charts.js`

Chart.js configuration and all custom plugins.

**Key exports:**
- `createLineChart(canvasId, marker, data, phaseLabels?)` — creates a Chart.js line chart with all plugins applied
- `destroyAllCharts()` — destroys all instances in `state.chartInstances` to prevent memory leaks
- Five Chart.js plugins (registered globally):
  - `refBandPlugin` — shaded reference range band
  - `optimalBandPlugin` — green dashed optimal range band
  - `noteAnnotationPlugin` — yellow dot annotations at note dates with hover tooltips
  - `supplementBarPlugin` — colored timeline bars for supplements
  - `phaseBandPlugin` — cycle phase vertical shading (menstrual=red, follicular=blue, ovulatory=purple, luteal=yellow, 8% opacity)

**Window exports:** none

---

### `notes.js`

Standalone note management (independent of lab entries).

**Key exports:**
- `openNoteEditor(date?)` — opens the note editor modal, pre-filled if `date` provided
- `saveNote()` — saves the current editor content to `importedData.notes`
- `deleteNote(date)` — removes a note by date

**Window exports:** `openNoteEditor`, `saveNote`, `deleteNote`

---

### `supplements.js`

Supplement and medication timeline, editor, ingredient tracking, and AI impact analysis.

**Key exports:**
- `openSupplementsEditor(index?)` — opens the supplement editor modal
- `saveSupplement(idx)` — persists current form state to `importedData.supplements`
- `deleteSupplement(idx)` — removes by index
- `renderSupplementsSection()` — dashboard timeline bars
- `renderSupplementImpact(supp, editIdx)` — per-supp impact card (shimmer → cached AI summary)
- `computeSupplementImpact(supp, markerKey, ...)` — before/after mean comparison for one marker
- `computeAllImpacts(supp, data)` — impact vectors across all markers, sorted by |pctChange|
- `parseAmount(str)` — extract `{value, unit}` from "890mg" / "5,4 mg" / "500 IU" (handles comma decimals)
- `effectiveTimesPerDay(ing, supp)` — row override wins, else supp-level default
- `ingredientDailyTotal(ing, supp)` — computed `amount × effectiveTimesPerDay`

**Ingredient data model:** each supp has an optional outer `timesPerDay` (default multiplier); each `ingredient` row has `{name, amount, timesPerDay?}` where `timesPerDay` is an optional per-row override. Daily total = `amount × (row.timesPerDay ?? supp.timesPerDay)`.

**Impact cache:** per-supp cache in `labcharts-{profileId}-suppImpact` keyed by supp name with a fingerprint that includes dosage, outer `timesPerDay`, per-ingredient fields, periods, and lab dates — any edit auto-invalidates only that supp's cache entry. Concurrent renders are coalesced via a 50ms debounced queue (`scheduleAnalyze` → `flushAnalyses`).

---

### `cycle.js`

Menstrual cycle tracking, helpers, and dashboard rendering.

**Key exports:**
- `getCyclePhase(dateStr, mc)` — `{ cycleDay, phase, phaseName }` for a date against a cycle object
- `getNextBestDrawDate(mc)` — next early follicular window (days 3–5)
- `getBloodDrawPhases(mc, dates)` — maps lab dates to phases
- `calculateCycleStats(periods)` — auto-computes `{ cycleLength, periodLength, regularity }` from period log
- `detectPerimenopausePattern(mc, dob)` — flags perimenopause pattern (age 35+, 4+ periods, 2+ of 4 indicators)
- `detectCycleIronAlerts(mc, data)` — cross-references heavy flow with ferritin/hemoglobin/iron
- `openMenstrualCycleEditor()` — opens the cycle editor modal
- `saveMenstrualCycle()` — saves to `importedData.menstrualCycle`, triggers cycle tour
- `renderMenstrualCycleSection(data)` — renders the full cycle dashboard section
- `startCycleTour(auto)` — triggers the 8-step cycle spotlight tour

**Window exports:** `openMenstrualCycleEditor`, `saveMenstrualCycle`, `addPeriod`, `deletePeriod`, `startCycleTour`

---

### `context-cards.js`

All 9 lifestyle context card editors plus AI health dots, the Interpretive Lens / Knowledge Base dashboard rows, and the dashboard CTA pills.

**Key exports:**
- `renderProfileContextCards(data)` — renders the 3-column context card grid on the dashboard
- `renderInterpretiveLensSection()` — renders the lens row (when set) + KB status row (when configured) + AI personalize CTA pill + Data protection CTA pill
- `renderKnowledgeBaseSection()` — pure-render helper for the KB status row (returns `''` when no library configured)
- `renderDataProtectionCta(stateOverride?)` — pure render of the data-protection pill; accepts an explicit state override for testability
- `openPersonalizeAIPicker()` — 2-card picker (Lens / Knowledge Base) shown when both are unset
- `openDataProtectionPicker()` — 3-card picker (Encryption / Sync / Auto-backup) with configured cards grayed out
- `triggerDNAFilePicker()` — programmatic file input trigger that routes through `window.handleDNAFile`; used by the genetics empty-state stub
- `loadContextHealthDots()` — async; fetches AI health ratings for stale cards (per-card fingerprint caching)
- `getCardFingerprint(key)` — djb2 hash of lab data + card data + sex + DOB for cache invalidation
- Per-card editor functions: `openDiagnosesEditor`, `openDietEditor`, `openExerciseEditor`, `openSleepEditor`, `openLightEditor`, `openStressEditor`, `openLoveLifeEditor`, `openEnvironmentEditor`, `openHealthGoalsEditor`
- Per-card save functions: `saveDiagnoses`, `saveDiet`, `saveExercise`, `saveSleep`, `saveLight`, `saveStress`, `saveLoveLife`, `saveEnvironment`, `saveHealthGoals`
- `selectCtxOption(el, group, multi)` — shared button-group selection handler
- `getSelectedOption(group)` — reads selected value from a `.ctx-btn-group`
- `summaryFn` implementations — generate the one-line text shown on each collapsed card
- `debounceContextNotes()` — auto-saves the free-form context notes textarea
- `recordChange(field)` — snapshots a context field and appends a timestamped entry to `importedData.changeHistory` (dedup: same-day overwrite, identical skip, 200 cap)

**Window exports:** all open/save functions, `selectCtxOption`, `addCondition`, `deleteCondition`, `addGoal`, `deleteGoal`, `syncDiagnosesNote`, `openInterpretiveLensEditor`, `saveInterpretiveLens`, `renderKnowledgeBaseSection`, `openPersonalizeAIPicker`, `openDataProtectionPicker`, `triggerDNAFilePicker`

---

## Layer 5 — Feature Modules

### `dna.js`

DNA raw data import: client-side parser, storage, dashboard section, AI context assembly.

**Key exports:**
- `detectDNAFile(text)` — detects format from file header: `'ancestry'` | `'23andme'` | `'livingdna'` | `'csv'` | `null`
- `isDNAFile(file)` — checks filename patterns for known DNA providers
- `isDNAFileByContent(file)` — async, reads first 500 bytes to detect DNA format by content
- `parseDNAFile(file)` — async, runs Web Worker parser, matches against `data/snp-health.json` (41 SNPs), resolves APOE haplotype, returns enriched matches with effect/note per genotype
- `saveGeneticsData(profileData, result)` — stores matched SNPs + APOE in `importedData.genetics`
- `deleteGeneticsData(profileData)` — removes genetics data
- `buildGeneticsContext(genetics, activeMarkerKeys)` — serializes genetics for AI context, filtered to SNPs relevant to active markers
- `renderGeneticsSection()` — full genetics interpretation section for classic/mobile dashboard contexts; returns an in-context "Add your DNA data" empty-state stub (wired to `triggerDNAFilePicker`) when no SNPs/mtDNA exist
- `handleDNAFile(file)` — full import flow: parse → preview modal → confirm → save

Supports: AncestryDNA (2-column alleles), 23andMe, MyHeritage, FTDNA, Living DNA. Genotype reversal handles strand ambiguity (CT ↔ TC).

**Window exports:** `isDNAFile`, `isDNAFileByContent`, `handleDNAFile`, `confirmDNAImport`, `closeDNAImportPreview`, `deleteGeneticsData`, `_buildGeneticsContext`, `_getRelevantSNPs`

---

### `pdf-import.js`

Full PDF-to-lab-data import pipeline.

**Key exports:**
- `extractPDFText(file)` — pdf.js text extraction with x/y coordinates, returns page-aware formatted text
- `parseLabPDFWithAI(pdfText)` — sends text + `buildMarkerReference()` to AI; maps lab results to marker keys
- `handleImageFile(file)` — imports lab reports from JPG/PNG/WebP images via AI image pipeline
- `handleBatchPDFs(files)` — sequential multi-file import with per-file confirm/skip
- `showImportPreview(parsed)` — modal with matched (green), new custom (blue), unmatched (yellow) markers. All numeric results are captured — unknowns become custom markers rather than being silently dropped
- `confirmImport(parsed)` — merges parsed data into `importedData.entries`
- `setupDropZone()` — legacy eager drop-zone binding retained for compatibility; page shells use `import-drop-zone.js` so the PDF import module stays lazy-loaded

**Window exports:** `confirmImport`, `skipImport`, `importNextPDF`, `syncImportStatusFab`, `handleImportStatusClick`, `isImportRunning`

---

### `import-drop-zone.js`

Lazy drop-zone event binding shared by Dashboard, Labs, and mobile dashboard shells. It imports `loadPdfImport()` from `import-loader.js`, classifies dropped files only after interaction, and routes JSON, lab PDFs/images, text imports, and DNA files to the same handlers used by the file input path.

**Key exports:**
- `setupDropZone()` — idempotently binds click, drag, and drop handlers to `#drop-zone`

---

### `import-file-input.js`

Lazy file-picker import binding for the hidden `#pdf-input`. It shares `loadPdfImport()` with the drop-zone path, classifies files on change, clears stale selections on failure, and routes JSON, lab PDFs/images, text imports, and DNA files through the import/DNA handlers exposed on `window`.

**Key exports:**
- `bindImportFileInput()` — idempotently binds `#pdf-input` change handling and document-level drag/drop prevention
- `handleImportInputChange(e)` — routes one file-picker change event through the lazy import classifier

---

### `export.js`

Data export, import, and reset.

**Key exports:**
- `exportToJSON()` — exports v2 JSON for the current profile: `{ version: 2, exportedAt, entries, notes, diagnoses, diet, exercise, sleepRest, lightCircadian, stress, loveLife, environment, interpretiveLens, healthGoals, contextNotes, menstrualCycle, customMarkers, supplements }`
- `exportClientJSON(profileId)` — exports a single client's data (used from Client List ⋮ menu)
- `exportAllDataJSON()` — exports a full database bundle with all profiles, chat threads, custom personalities, and settings
- `buildAllDataBundle()` — builds the bundle object used by both `exportAllDataJSON()` and folder backup
- `importFromJSON(file)` — merges entries by date, deduplicates notes, overwrites context fields, merges healthGoals by text. Auto-detects database bundles and handles multi-profile merge
- `exportToPDF()` — generates a printable PDF report with all data, charts, and context cards
- `clearAllData()` — confirms and wipes all imported data for the current profile

**Window exports:** `exportToJSON`, `exportDataJSON`, `exportClientJSON`, `exportAllDataJSON`, `importFromJSON`, `exportToPDF`, `clearAllData`

---

### `chat.js`

AI chat panel and streaming.

**Key exports:**
- `sendChatMessage()` — sends user message (with optional image attachments) and last 30 messages to the active AI provider, streams response with typewriter trickle
- `askAIAboutMarker(markerKey)` — per-marker AI explanation, streams into the chat panel
- Thread management: `createNewThread()`, `loadThread(id)`, `deleteThread(id)`, `renameThread(id)`
- `setChatPersonality(id)` — switches personality, updates system prompt
- `getCustomPersonality()` — returns `{ name, icon, promptText, evidenceBased }` from storage
- `generateCustomPersonality()` — AI-powered persona generation from a name (2048 tokens, streamed)
- `pickPersonaIcon(name)` — djb2 hash into 10-emoji palette

- `addImageAttachment(file)` — resizes + attaches image (max 5), shows quality warnings
- `toggleHDMode()` — toggles HD image mode (1024px↔2048px), persisted in localStorage
- `updateAttachButtonVisibility()` — shows/hides attach + HD buttons based on vision support

**Window exports:** `sendChatMessage`, `setChatPersonality`, `openChatPanel`, `closeChatPanel`, `createNewThread`, `loadThread`, `deleteThread`, `renameThread`, `generateCustomPersonality`, `saveCustomPersonality`, `askAIAboutMarker`, `addImageAttachment`, `toggleHDMode`

---

### `settings.js`

Settings modal with 6 sections.

**Key exports:**
- `openSettingsModal()` / `closeSettingsModal()`
- `initSettingsModelFetch()` — fetches model lists for all providers on modal open
- `saveProfileSettings()` — saves sex, DOB, location from the Profile section
- `setUnitSystem(system)` — `'EU'` | `'US'`
- `showSyncSetupModal()` — opens the cross-device sync setup wizard directly (also reachable via `toggleSync` toggle); used by the dashboard data-protection picker

**Window exports:** `openSettingsModal`, `closeSettingsModal`, `saveProfileSettings`, `setUnitSystem`, `setAIProvider`, `startTour`, `showSyncSetupModal`

---

### `feedback.js`

In-app feedback modal.

**Key exports:**
- `openFeedbackModal()` / `closeFeedbackModal()`
- `submitFeedback()` — validates and submits feedback (bug report or feature request)

**Window exports:** `openFeedbackModal`, `closeFeedbackModal`, `submitFeedback`

---

### `nav.js`

Sidebar navigation, profile switcher, and mobile sidebar shell.

**Key exports:**
- `buildSidebar(data)` - renders Home, Lenses, Tools, and lab category navigation with marker counts
- `filterSidebar()` - filters lab categories and keeps top-level app routes visible during search
- `toggleNavGroup(groupId)` - expands/collapses sidebar category groups
- `renderProfileDropdown()` / `renderProfileButton()` - profile switcher UI
- `openRecommendationsFromSidebar()` - compatibility helper that routes to the dedicated `recommendations` page

**Window exports:** `buildSidebar`, `filterSidebar`, `toggleNavGroup`, `renderProfileDropdown`, `renderProfileButton`, `toggleMobileSidebar`, `closeMobileSidebar`, `openRecommendationsFromSidebar`

---

## Layer 6 — Orchestration

### `views-router.js`

Route validation, per-profile last-view persistence, mobile tab sync handoff, and element-anchor scroll preservation. `views.js` creates the concrete navigator by passing render handlers into `createNavigate()`.

**Key exports:**
- `createNavigate({ routeHandlers, syncMobileBottomNav })` — builds the app-level `navigate()` function without importing page renderers
- `getInitialView()` — restores the active profile's last valid route, falling back to `dashboard`
- `isKnownRoute(route, data?)` — validates fixed routes and data-backed lab category routes

---

### `lens-pages.js`

Dedicated page renderers for Labs, Genome, Body, Insight, and Recommendations. The module receives dashboard, recommendation, and lens shell helper functions from `views.js` through `createLensPageHandlers()` so page rendering can move out of the main views module without creating new import cycles.

**Key exports:**
- `createLensPageHandlers(deps)` — returns `showLabs`, `showGenomeLens`, `showBodyLens`, `showInsightLens`, and `showRecommendations`

---

### `dashboard-page-view.js`

Dashboard route shell and page-level dashboard orchestration. `dashboard-view-composition.js` creates it with `createDashboardPageView()` after wiring dashboard widget renderers, controls, and registry helpers, so the dashboard route can live outside the main compatibility module without importing the widget control layer directly.

**Key exports:**
- `createDashboardPageView(deps)` — returns `showDashboard(data?)`; owns the populated dashboard shell, empty welcome/demo state, import drop-zone setup calls, mobile dashboard handoff, focus-card hydration, context-dot hydration, and first-visit tour triggers

---

### `dashboard-view-composition.js`

Dashboard route, widget, mobile handoff, marker-modal, and lens-shell composition wiring. `views.js` creates this layer once and keeps compatibility facades, while this module wires `dashboard-page-view.js`, `dashboard-widgets.js`, `dashboard-widget-controls.js`, `dashboard-widget-renderers.js`, and mobile dashboard dependencies together.

**Key exports:**
- `createDashboardViewComposition(deps)` — returns `showDashboard`, dashboard widget control handlers, recommendation helpers, and dashboard render helpers needed by lens pages and recommendation actions

---

### `lens-page-shell.js`

Shared lens page chrome and ordering helpers used by `views.js` and `lens-pages.js`. The module owns lens headers, reorderable page widget wrappers, per-profile lens widget order persistence, page-section move controls, dashboard add/remove toggles, and quote-safe inline handler generation.

**Key exports:**
- `configureLensPageShell(deps)` — injects dashboard widget visibility helpers without importing dashboard modules directly
- `renderLensHeader(title, subtitle, actions?)` — renders the shared lens page header
- `renderLensPageWidgets(route, widgets)` / `renderLensWidget(...)` — render reorderable page widgets and their chrome
- `moveLensPageWidget(route, id, direction)` — persists per-profile page section order and refreshes the active route
- `inlineHandlerCall(fnName, ...args)` — builds escaped `window.*` inline handlers for existing template surfaces

---

### `dashboard-widgets.js`

Dashboard widget registry and persistence helpers. `dashboard-view-composition.js` supplies renderer functions from `dashboard-widget-renderers.js` to `createDashboardWidgetRegistry()` so widget metadata, defaults, availability gates, per-profile widget preferences, custom marker widget IDs, and visible-entry generation can live outside the main views module.

**Key exports:**
- `createDashboardWidgetRegistry(renderers, opts?)` — returns dashboard widget definitions plus preference/order helpers
- `DASHBOARD_WIDGET_SOURCE_ORDER` — Lens/source ordering for the widget picker
- `DASHBOARD_WIDGET_DEFAULT_IDS` — new-profile dashboard default order
- `DASHBOARD_MANUAL_BIOMETRIC_METRICS` and `dashboardBiometricSelectionKey()` — biometrics widget selection helpers

---

### `dashboard-widget-controls.js`

Dashboard widget picker, widget chrome, layout actions, and drag/reorder controls. `dashboard-view-composition.js` creates the control layer with registry, marker, and biometrics dependencies; `views.js` re-exports the public handlers for existing `window.*` integrations.

**Key exports:**
- `createDashboardWidgetControls(deps)` — returns render helpers and dashboard widget action handlers

---

### `dashboard-widget-renderers.js`

Dashboard widget body renderers and shared recommendation helpers. `dashboard-view-composition.js` creates the renderer layer with Light helper and mobile-summary dependencies, then passes the returned renderers to `dashboard-widgets.js`, `dashboard-widget-controls.js`, and `lens-pages.js`.

**Key exports:**
- `createDashboardWidgetRenderers(deps)` — returns dashboard body renderers, dashboard context builders, biometrics helpers, custom marker renderer support, and recommendation helper functions

---

### `category-view-renderers.js`

Category chart card, table, heatmap, and fatty-acid profile renderers. `category-page-view.js` calls these helpers for category route content, while `views.js` imports and re-exports them so existing module and `window.*` integrations stay stable.

**Key exports:**
- `renderChartCard(id, marker, dateLabels)` — renders one category/dashboard marker card and registers it for the detail modal
- `renderTableView(cat, dateLabels, categoryKey, dates)` / `renderHeatmapView(cat, dateLabels, dates, categoryKey)` — render category table shells with empty-value add affordances
- `renderFattyAcidsView(cat, categoryKey)` / `renderFattyAcidsCharts(cat)` — render the single-date fatty-acid profile cards and bar chart

---

### `category-page-view.js`

Category route shell and view-mode orchestration. The module owns `showCategory()`, `switchView()`, category card sorting, range-toggle order preservation, chart hydration, and chart-card recommendation loading. It depends on `category-view-renderers.js` for HTML fragments and keeps `views.js` as a thin router/compatibility facade.

**Key exports:**
- `showCategory(categoryKey, data?)` — renders the category header, view tabs, date/layer controls, chart grid, empty marker affordances, and saved table/heatmap mode
- `switchView(view, categoryKey, btn)` — switches between chart, table, and heatmap modes, updates tab ARIA state, destroys stale charts, and rehydrates charts when needed

---

### `category-customization.js`

Category and marker display override helpers. The module owns category rename, marker rename/revert, the emoji picker, and category icon override persistence while `views.js` keeps compatibility exports and injects navigation via `configureCategoryCustomization()`.

**Key exports:**
- `configureCategoryCustomization(deps)` — injects the app-level `navigate()` function without importing `views.js`
- `renameCategory(categoryKey)` / `renameMarker(id)` / `revertMarkerName(id)` — persist display-name overrides into `importedData.categoryLabels` and `importedData.markerLabels`
- `showEmojiPicker(anchorEl, callback, opts?)` — shared category/custom-marker emoji picker used by category views and the marker creation modal
- `changeCategoryIcon(categoryKey)` — persists `importedData.categoryIcons` overrides and mirrors custom marker category icon metadata

---

### `views.js`

Tool page routing and compatibility exports. Dashboard composition lives in `dashboard-view-composition.js`; dashboard route shell lives in `dashboard-page-view.js`; dashboard widget body renderers live in `dashboard-widget-renderers.js`; recommendation action handlers live in `recommendation-actions.js`; category route orchestration lives in `category-page-view.js`; category card/table/heatmap renderers live in `category-view-renderers.js`; category display overrides live in `category-customization.js`; the Light page shell lives in `light-page-view.js`; Light channel pills and drill-down panels live in `light-channel-view.js`; shared lens page chrome lives in `lens-page-shell.js`; public navigation and lens page functions remain exported here for compatibility, backed by `views-router.js` and delegated to route modules where applicable.

**Key exports:**
- `navigate(section, params)` — router facade created from `views-router.js`; calls the appropriate render function
- `showDashboard(data?)` - compatibility facade backed by `dashboard-view-composition.js` and `dashboard-page-view.js`; renders the customizable widget dashboard whose default widgets are Current Focus, Cycle when available, Current Priority, Quick Markers, Key Trends, Recommended Next Steps, Profile Context, Biometrics Overview, and Biological Age
- `showLabs(data?)`, `showGenomeLens()`, `showBodyLens()`, `showInsightLens(data?)`, `showRecommendations(data?)` - compatibility facades delegated to `lens-pages.js`
- `showCategory(categoryKey, data?)` - compatibility facade imported from `category-page-view.js`
- `showLight(data?)`, `renderLightTodayStrip()`, `renderLightChannelsLive()` - compatibility facades imported from `light-page-view.js`
- `showCompare(data?)` / `showCorrelations(data?)` - focused tool pages
- Dashboard widget controls: compatibility facades backed by `dashboard-widget-controls.js`, including `openDashboardWidgetPicker()`, `toggleDashboardOrganizeMode()`, `resetDashboardWidgets()`, `clearDashboardWidgets()`, `addDashboardWidgetFromLens()`, and `removeDashboardWidgetFromLens()`
- `showDetailModal(markerKey, data?)` — opens the marker detail modal

**Window exports:** `navigate`, `showDashboard`, `showLabs`, `showGenomeLens`, `showBodyLens`, `showInsightLens`, `showRecommendations`, `showLight`, `showCategory`, `showDetailModal`, dashboard widget controls, and recommendation page helpers (`openRecommendationDetail`, `discussRecommendation`, `saveRecommendation`, `dismissRecommendation`)

---

### `recommendation-actions.js`

Recommendation modal and action handlers shared by dashboard cards and the Recommendations page. It keeps option-detail rendering, chat prompts, saved/bookmarked state, and dismissed state out of the main route facade.

**Key exports:**
- `createRecommendationActions(deps)` — returns `openRecommendationDetail()`, `discussRecommendation()`, `saveRecommendation()`, and `dismissRecommendation()`

---

### `light-page-view.js`

Light & Sun page shell, Light Today strip, dashboard Light channel pills, Light session log actions, page widget assembly, and async population of page-only Light workbench sections. It imports shared lens chrome from `lens-page-shell.js`, condition rendering from `light-conditions-now.js`, session history from `light-sessions-view.js`, and channel rows/suggestions from `light-channel-view.js`.

**Key exports:**
- `showLight(data?)` — renders the reorderable Light & Sun page widgets
- `renderLightTodayStrip()` — legacy compact Light strip used by embedded/welcome surfaces
- `renderLightChannelsLive()` — refreshes the live channel-pills slot after session updates
- `renderDashboardLightChannelPills()` / `renderLightSessionLogActions()` — dashboard widget helper bodies shared through `dashboard-widget-renderers.js`
- `_expandLightToolsSection()` — compatibility handler for expanding the collapsed Light tools placeholder

---

### `light-channel-view.js`

Light channel pill rows, seven-day sparklines, dashboard-to-Light channel navigation, per-channel drill-down panels, citations, source mix, and channel suggestions. `light-page-view.js` imports the render helpers; `views.js` keeps the legacy `window._toggleChannelDetail` / `window._openChannelOnLightPage` wiring for inline handlers and dashboard widgets.

**Key exports:**
- `mergeTotals(a, b)` — combines sun and device channel totals
- `renderChannelPills(totals7d, totals30d)` — renders the interactive Light page channel row and detail slot
- `_toggleChannelDetail(channelKey)` / `_openChannelOnLightPage(channelKey)` — compatibility handlers for expanding channel detail panels
- `renderSuggestion(totals7d)` — fallback channel-guidance copy when AI synthesis is unavailable

---

### `main.js`

Thin module entry point. Imports startup feature side effects, then starts the startup orchestrator.

**Responsibilities:**
- Imports `app-feature-modules.js` for startup-loaded feature side effects and window exports
- Calls `startApp()` from `startup-orchestrator.js`

**Window exports:** none (all exports come from other modules)

---

### `app-feature-modules.js`

Startup-loaded feature side-effect imports extracted from `main.js`. This module preserves the previous feature import order while keeping `main.js` focused on startup orchestration.

**Key exports:** none

**Window exports:** none directly; imported feature modules attach their existing compatibility handlers.

---

### `startup-orchestrator.js`

Startup global wiring and phase ordering. Runs once, installs app-wide startup hooks, and registers the `DOMContentLoaded` startup sequence.

**Responsibilities:**
- Sets the `_getActiveProfileId` startup global
- Installs lazy EMF window handlers through `emf-facade.js`
- Installs app-wide event and refresh wiring through `app-event-listeners.js`
- Delegates encryption, backup, and meteo bootstrap to `startup-foundation.js`
- Initializes startup profile data
- Delegates startup service boot and post-profile maintenance to `startup-maintenance.js`
- Delegates wearable/OpenRouter callback routing to `startup-oauth-callbacks.js`
- Delegates first-render UI bootstrap to `startup-ui.js`

**Key exports:**
- `startApp()` — idempotently installs startup globals/listeners and registers the startup sequence

**Window exports:** `_getActiveProfileId`

---

### `emf-facade.js`

Lazy window facade for the EMF assessment module extracted from `main.js`. It installs async `window.*` handlers for EMF editor and assessment actions, then imports `emf.js` on first use and replaces the facade handlers with the real module exports.

**Key exports:**
- `EMF_LAZY_WINDOW_FUNCTIONS` — list of EMF window handlers covered by the lazy facade
- `installEMFLazyFacade()` — installs lazy handlers during app startup

**Window exports:** EMF handler names from `EMF_LAZY_WINDOW_FUNCTIONS`

---

### `startup-foundation.js`

Blocking startup foundation extracted from `main.js`: encryption unlock, decrypted meteo config cache hydration, cross-tab broadcast setup, and folder backup handle restoration.

**Key exports:**
- `initializeStartupFoundation()` — runs the blocking security/storage bootstrap before wearable services or profile data load

**Window exports:** none

---

### `startup-profile.js`

Profile startup bootstrap extracted from `main.js`: legacy v1 profile migration, encrypted profile-cache warmup, active-profile imported-data load, and unit/sex/range/DOB display state.

**Key exports:**
- `initializeProfileData()` — creates the default profile for legacy users, migrates old imported data through encrypted storage, warms the profile cache, sets `state.currentProfile`, and loads active imported data before OAuth callbacks can persist profile-scoped data
- `applyProfileDisplayState()` — applies saved units/range mode plus sex/DOB metadata to `state` and the startup toggle controls

**Window exports:** none

---

### `startup-oauth-callbacks.js`

Startup OAuth callback routing extracted from `main.js`. Wearable callbacks run first after profile load; if they do not consume the URL code, OpenRouter OAuth handles the same `?code=`/`state` pair.

**Key exports:**
- `handleStartupOAuthCallbacks()` — delegates wearable OAuth callback handling, exchanges OpenRouter codes with state verification, stores the OpenRouter key, switches the active AI provider, and opens chat after init

**Window exports:** none

---

### `startup-maintenance.js`

Non-blocking startup maintenance extracted from `main.js`: wearable runtime config/scheduler boot, sun session self-heal, light-device preset hydration, and legacy biometrics migration.

**Key exports:**
- `initializeStartupServices()` — starts wearable runtime config loading and scheduler setup before profile data loads
- `runPostProfileStartupMaintenance()` — schedules post-profile maintenance jobs without blocking OAuth callbacks or first render

**Window exports:** none

---

### `startup-ui.js`

First-render UI bootstrap extracted from `main.js`: profile display state, theme, footer version, sidebar, sync indicator, initial navigation, deferred sync/catalog warmup, changelog, startup nudges, deferred settings/chat opens, header chrome, chat attachment handlers, and file-picker import binding.

**Key exports:**
- `renderStartupUI()` — runs the initial UI render and schedules non-blocking startup UI work after profile/OAuth startup completes

**Window exports:** none

---

### `app-event-listeners.js`

App-wide browser event wiring that used to live in `main.js`: modal wheel guards, backdrop click handling, global role-button keyboard activation, Escape/Tab modal behavior, app shortcuts, and the `registerRefreshCallback()` bridge back into `navigate(state.currentView || 'dashboard')`.

**Key exports:**
- `installGlobalEventListeners()` — idempotently installs document-level modal, keyboard, shortcut, and click handlers
- `registerAppRefreshCallback()` — registers the data refresh callback that rebuilds sidebar state and re-renders the active route

---

### `tour.js`

Generic spotlight tour engine plus the app tour and cycle tour configurations.

**Key exports:**
- `runTour(steps, storageKey, auto)` — generic engine: creates `#tour-overlay`, `#tour-spotlight`, `#tour-tooltip`; filters steps with missing targets; navigates with Back/Next/Skip/Done
- `startTour(auto)` — launches the 7-step app tour (auto=`true` checks completion flag first)
- `startCycleTour(auto)` — launches the 8-step cycle-specific tour
- `endTour()` — removes tour DOM elements, stores completion flag
- `CYCLE_TOUR_STEPS` — array of 8 step configs for the cycle tour

**Window exports:** `startTour`, `startCycleTour`, `endTour`

---

### `changelog.js`

What's New modal triggered on version bump so users see what changed after each PWA update.

**Key exports:**
- `APP_VERSION` — number matching the SW cache version (e.g., 53)
- `openChangelog(showAll)` — renders and shows the modal; `showAll=true` shows all entries, `false` shows latest 3
- `closeChangelog()` — hides modal, marks current version as seen in localStorage
- `maybeShowChangelog()` — auto-trigger: shows modal if `labcharts-changelog-seen` !== `APP_VERSION`

**Window exports:** `openChangelog`, `closeChangelog`, `maybeShowChangelog`

---

### `client-list.js`

Client List modal for managing multiple profiles.

**Key exports:**
- `openClientListModal()` / `closeClientListModal()` — modal lifecycle
- `renderClientList(query?, sortBy?)` — renders searchable, sortable profile list with inline create/edit form
- Per-profile actions: archive, flag, pin, delete, per-client export

**Window exports:** `openClientListModal`, `closeClientListModal`, `createClientInline`, `saveClientInline`, `toggleArchiveClient`, `toggleFlagClient`, `togglePinClient`, `deleteClient`, `exportClientJSON`

---

### `recommendations.js`

Supplement, lifestyle, light-device, and EMF affiliate recommendations driven by a lazy-loaded catalog. Region-aware: products + URLs + coupons are filtered by user country via a single hierarchy chain (CZ → EU → INTL etc.). The global Recommendations page is rendered by `lens-pages.js`, while `dashboard-widgets.js` registers the dashboard surface and `dashboard-widget-renderers.js` owns its dashboard renderer; this module owns catalog loading, slot rendering, disclosure state, product filtering, and DNA/wearable slot helpers.

**Key exports:**
- `loadCatalog()` — lazy-loads `data/recommendations.json` on first call
- `getUserRegion()` — derives region code (CZ/SK/DE/AT/EU/US/INTL) from profile country
- `regionLookupChain(region)` — returns the lookup chain (most-specific → INTL); used by both product visibility filter and per-region map resolution
- `getProductsForSlot(catalog, slotKey, region)` — region-filtered products
- `_resolveCouponForRegion`, `_resolveHomepageForRegion`, `_resolveProductUrlForRegion` — pick from per-region maps using the chain
- `_addUTMParams(url, content, campaign)` — partner-dashboard attribution
- `renderRecommendationSection(slotKey, opts)` — renders the "What can help" section in the detail modal
- `renderEMFMeterRecs(catalog, opts)` / `renderEMFMitigationRecs(catalog, tags, opts)` — EMF panel surfaces

**Window exports:** none (called via imports from `views.js`, `chat.js`, `context-cards.js`)

---

### `crypto.js`

Data encryption at rest and cross-tab sync.

**Key exports:**
- `encryptedSetItem(key, value)` / `encryptedGetItem(key)` — AES-256-GCM via PBKDF2 passphrase
- `getEncryptionEnabled()` / `setEncryptionEnabled(bool)` — encryption toggle
- `validatePassphrase(p)` — checks 4 strength rules (8+ chars, lowercase, uppercase, special), returns `{ valid, message }`
- `broadcastDataChanged(profileId)` — BroadcastChannel message for multi-tab sync
- `SENSITIVE_PATTERNS` — array of localStorage key pattern strings that get encrypted

**Window exports:** `setEncryptionEnabled`, `changePassphrase`, `exportBackup`, `importBackup`

---

### `backup.js`

IndexedDB auto-backup, folder backup via File System Access API, and backup restore. Extracted from `crypto.js`.

**Key exports:**
- `scheduleAutoBackup()` — debounced 60s trigger; saves up to 5 snapshots to IndexedDB + writes to folder backup if configured
- `buildBackupSnapshot()` — captures all importedData + per-profile preferences
- `loadBackupSnapshots()` — async; populates the Backup & Restore section with IndexedDB snapshots
- `restoreAutoBackup(id)` — writes snapshot to localStorage, reloads
- `saveFolderBackup(snapshot)` — writes `getbased-backup-latest.json` + daily dated snapshot to user-selected folder via File System Access API

**Window exports:** `restoreAutoBackup`, `pickBackupFolder`, `showBackupReminder`

---

### `lab-context.js`

Central AI context serializer. Extracted from `chat.js`.

**Key exports:**
- `buildLabContext()` — serializes all lab entries + all 9 context cards + interpretiveLens + contextNotes + cycle data + notes into a structured AI context string

**Window exports:** `buildLabContext`

---

### `markdown.js`

Block-aware markdown parser for chat rendering. Extracted from `chat.js`.

**Key exports:**
- `renderMarkdown(text)` — block-aware parser: headings, lists, code blocks, HR, paragraphs + inline formatting

**Window exports:** `renderMarkdown`

---

### `provider-panels.js`

AI provider panel rendering for the settings modal. Extracted from `settings.js`.

**Key exports:**
- `renderProviderPanels()` — renders the AI provider configuration panels in the settings modal

**Window exports:** none (imported by `settings.js`)

---

### `lens.js`

Knowledge Base / Interpretive Lens — RAG endpoint config + multi-query rewrite + dedicated modal. Two backends under one UI: `'in-browser'` (transformers.js + OPFS via `lens-local.js`) and `'external-server'` (user-configured URL + Bearer key).

**Key exports:**
- `hasLens()` — true when a lens is configured AND has indexed content
- `queryLens(hint, opts?)` — single-query retrieval; routes to in-browser worker or remote server based on backend
- `queryLensMulti(hint, opts?)` — multi-query orchestrator: rewrites the query into N=3 paraphrases via the active LLM, fans out to `queryLens` for each, fuses results with reciprocal-rank scoring (k=60). Falls back to single-query when no AI provider, when rewrite fails, when query is <3 words, or when the toggle is off
- `getLensConfig()` / `saveLensConfig(partial)` / `getLensKey()` / `saveLensKey(key)`
- `getLensSummary()` — synchronous status object `{configured, backend, displayName, docCount, chunkCount, multiQueryOn, aiAvailable}` used by the dashboard KB row
- `openKnowledgeBaseModal()` / `closeKnowledgeBaseModal()` — dedicated modal that wraps `renderCustomLensSection()`. Replaces the previous Settings → AI inline section
- `buildLensSnippet(chunks, sourceName)` — formats retrieved chunks for AI prompt injection
- `testLensConnection()` / `clearLensCache()`
- `renderCustomLensSection()` — full settings markup (URL/key inputs, backend toggle, library picker, ingest UI, multi-query toggle); rendered inside the KB modal
- `_resetRewriteCache()` / `_fuseChunksRRFForTest()` / `_dedupeQueriesForTest()` — test surface

**Window exports:** `hasLens`, `queryLens`, `queryLensMulti`, `buildLensSnippet`, `testLensConnection`, `clearLensCache`, `openKnowledgeBaseModal`, `closeKnowledgeBaseModal`, plus all the in-modal save/toggle/library handlers

---

### `wearable-adapters.js`

Canonical wearable-metric registry + per-vendor adapter registry. Source of truth for OAuth client IDs, redirect URIs, scopes, and metric → endpoint mappings.

**Key exports:**
- `ADAPTERS` — array of `{id, displayName, authType, oauth?, apiHost?, metrics, accountInfo?}` for the 8 supported sources (Oura / Withings / Ultrahuman / WHOOP / Fitbit / Polar / Apple Health / manual)
- `CANONICAL_METRICS` — `{id: {label, sub, unit, worseWhen}}` for every metric the strip can render
- `DEFAULT_METRIC_ORDER` — preferred order when multiple sources contribute
- `adapterById(id)` / `visibleAdapters(connectedIds)` / `adapterSupportsMetric(adapterId, metricId)` / `metricsForSources(sourceIds)` / `canonicalMetric(id)`
- `applyOAuthOverrides(map)` — merges a `{adapterId: clientId}` map into the runtime override store; called from `loadWearableRuntimeConfig()`
- `getOAuthClientId(adapterOrId)` — returns the runtime override if set, falling back to the adapter's hardcoded `oauth.clientId`. Every consumer reads through this helper so self-host overrides apply uniformly
- `_resetOAuthOverrides()` — test surface

**Window exports:** none

---

### `wearables-connect.js`

Connect/disconnect/backfill orchestration. OAuth dispatch table, scheduled stale-source sync, runtime config bootstrap.

**Key exports:**
- `OAUTH_DISPATCH` — `{adapterId: {begin, isCallback, complete, withFreshToken, fetchAccountInfo, fetchRange, displayName, postConnect?, commitAfterWrite?}}` — generic OAuth orchestration table
- `beginConnectOAuth(adapterId)` — kicks off the auth flow; reads `clientId` via `getOAuthClientId(adapter)`
- `handleOAuthCallbackOnLoad()` — runs via `startup-oauth-callbacks.js` init; reads `pending.clientId` from sessionStorage (set at begin time, NOT from runtime config)
- `getConnection(adapterId)` / `listConnectedSources()` / `disconnectAdapter(adapterId)`
- `syncNow(adapterId, opts?)` / `forceBackfill(adapterId, days)`
- `initWearableScheduler()` — visibility-change + 6h interval poll; awaits `runtimeConfigReady()` before first sync to prevent race against override fetch
- `loadWearableRuntimeConfig()` — POSTs `{wearable_runtime_config: true}` to `/api/proxy`, applies the returned `*_CLIENT_ID` overrides via `applyOAuthOverrides`. Memoized as a promise raced against a 1.5s soft timeout

**Window exports:** none

---

### Wearables vendor adapters

Each connected source ships as a pair: `wearables-<vendor>.js` (read API) + `wearables-<vendor>-auth.js` (OAuth dance). Apple Health and Manual skip the auth half — Apple is file-import only, Manual is fully local. Tokens never leave the device; `sync.js` strips `wearableConnections` from the synced payload (and again on pull as defense-in-depth).

**OAuth2 (server-side secret):** `wearables-oura.js` + `…-oura-auth.js`, `…-withings.js` + `…-withings-auth.js`, `…-ultrahuman.js` + `…-ultrahuman-auth.js`, `…-polar.js` + `…-polar-auth.js`. Secrets live in `.env.local` + `/api/proxy`.

**OAuth2 PKCE (no secret):** `wearables-whoop.js` + `…-whoop-auth.js`, `wearables-fitbit.js` + `…-fitbit-auth.js`. Code verifier + S256 challenge per the IETF spec.

**No OAuth:** `wearables-apple-health.js` (file-import — `parseAppleHealthXml` reads the `export.xml` from a Health zip), `wearables-manual.js` (`logManualMetric` / `logManualBP` + `MANUAL_TAGS` whitelist for what users can log by hand).

**L1 storage + summary derivation:** `wearables-store.js` (per-profile IndexedDB at `labcharts-wearables-{profileId}`; two-phase upsertDailyBatch), `wearables-summary.js` (L2 derivation, write gate — 5% d7 shift / trend flip / 14d force-refresh / source flip / metric removal triggers).

**UI surface:** `wearables.js` (dashboard strip + detail modal + reorder mode + Settings → Wearables list + manual-log forms), `brand-assets.js` (per-vendor logo registry — `iconLight/Dark` for in-app rows, `signInLight/Dark` for landing-site Connect buttons, `mono` SVG fallback while a vendor logo is gated).

---

### Knowledge Base in-browser stack

`lens.js` is the dispatcher; the 4 sibling `lens-local-*` modules are the in-browser implementation. The dispatcher routes between in-browser and external-server backends per the user's selection.

- `lens-local.js` — main-thread shell: spawns a module worker, posts ingest/query/list/activate/delete messages, exposes a Promise-based API to `lens.js`.
- `lens-local-worker.js` — module worker. Loads transformers.js (currently from jsdelivr — see `update-vendor.sh` notes), runs WebGPU embedding when available with WASM fallback, owns OPFS persistence (`FileSystemSyncAccessHandle`), library CRUD, MMR re-rank (λ named `MMR_LAMBDA`), per-library model selection from a 4-model catalog.
- `lens-local-utils.js` — pure helpers: `chunkText`, `mmrSelect`, hashing, vector-pack helpers. Importable from both threads.
- `lens-local-parsers.js` — main-thread document parsers (PDF via `pdfjs-loader.js`, DOCX via mammoth, ZIP via JSZip, plus plain text/markdown/CSV).

---

### Other recently-extracted modules

Not separately documented because their exports are best read from source — kept thin on purpose.

- `chat-images.js` — image attachment lifecycle (`getPendingAttachments`, `clearAttachments`, etc.). Owns the `_pendingAttachments` queue. Extracted from `chat.js` in v1.21.9.
- `chat-threads.js` — conversation thread CRUD, list rendering, autoname, `onChatSaved` debounce trigger. Also extracted in v1.21.9.
- `markdown.js` — XSS-safe markdown rendering (`applyInlineMarkdown` for spans, `renderMarkdown` for full blocks). 34 dedicated XSS test assertions.
- `lab-context.js` — lab-data → AI-prompt context assembly; memoized via fingerprint that includes wearable summary, change history, and all 9 context cards.
- `provider-panels.js` — Settings → AI per-provider panels (Venice / OpenRouter / Routstr / PPQ / Local AI / Custom) plus shared model-advisor.
- `pdfjs-loader.js` — cached dynamic import of vendored pdf.js ESM. Pins `isEvalSupported: false` defense-in-depth on every `getDocument` call.
- `supplement-warnings.js` / `food-contaminants.js` — keyword scanners that build "harm flag" lists for the AI context.
- `emf.js` — Baubiologie SBM-2015 EMF assessment as a sub-module of the Environment context card.
- `sync.js` — Evolu CRDT sync orchestration; per-profile push debouncer, chat sync debouncer, relay status tracking, profile delete propagation, messenger token + push-context-to-gateway plumbing.
