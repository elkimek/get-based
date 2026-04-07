# Module Reference

All 30 modules live under `js/`. Grouped by layer — lower layers have no dependencies on higher ones.

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

Parser adapter registry for specialty lab detection and normalization. Single source of truth for all specialty marker definitions (OAT, fatty acids, Metabolomix+).

**Key exports:**
- `ADAPTER_MARKERS` — flat object keyed by `"category.markerKey"`: `{ name, unit, refMin, refMax, categoryLabel, icon, group, singlePoint? }` (194 entries). Re-exported from `schema.js` as `SPECIALTY_MARKER_DEFS`
- `getAllAdapterMarkers()` — returns merged marker map from all registered adapters
- `detectProduct(fileName, pdfText)` — runs all adapter `detect()` functions, returns `{ adapter, product: { prefix, label } }` or `null`
- `normalizeWithAdapter(adapter, markers, fileName, pdfText, product)` — dispatches to `adapter.normalize()` for post-AI marker key/category rewriting
- `getAdapterByTestType(testType)` — looks up adapter by AI-returned test type string

**Adapter registry:** array of `{ id, testTypes[], markers, detect?, normalize? }`:
- `fattyAcids` — 29 markers, detects Spadia/ZinZino/OmegaQuant by filename/text, normalizes to product-prefixed categories under "Fatty Acids" sidebar group
- `metabolomix` — no unique markers (reuses OAT + FA), detects Genova Metabolomix+ reports, routes FA add-on markers to `metabolomixFA` prefix
- `oat` — 165 markers, no detect/normalize (AI handles OAT categorization directly)

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
- `registerRefreshCallback(fn)` — registers the refresh function from `main.js`
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

Supplement and medication timeline.

**Key exports:**
- `openSupplementEditor(index?)` — opens the supplement editor modal
- `saveSupplement()` — saves supplement to `importedData.supplements`
- `deleteSupplement(index)` — removes by index
- `renderSupplementsSection(data)` — renders the supplements dashboard section

**Window exports:** `openSupplementEditor`, `saveSupplement`, `deleteSupplement`

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

All 9 lifestyle context card editors plus AI health dots.

**Key exports:**
- `renderProfileContextCards(data)` — renders the 3-column context card grid on the dashboard
- `loadContextHealthDots()` — async; fetches AI health ratings for stale cards (per-card fingerprint caching)
- `getCardFingerprint(key)` — djb2 hash of lab data + card data + sex + DOB for cache invalidation
- Per-card editor functions: `openDiagnosesEditor`, `openDietEditor`, `openExerciseEditor`, `openSleepEditor`, `openLightEditor`, `openStressEditor`, `openLoveLifeEditor`, `openEnvironmentEditor`, `openHealthGoalsEditor`
- Per-card save functions: `saveDiagnoses`, `saveDiet`, `saveExercise`, `saveSleep`, `saveLight`, `saveStress`, `saveLoveLife`, `saveEnvironment`, `saveHealthGoals`
- `selectCtxOption(el, group, multi)` — shared button-group selection handler
- `getSelectedOption(group)` — reads selected value from a `.ctx-btn-group`
- `summaryFn` implementations — generate the one-line text shown on each collapsed card
- `debounceContextNotes()` — auto-saves the free-form context notes textarea
- `recordChange(field)` — snapshots a context field and appends a timestamped entry to `importedData.changeHistory` (dedup: same-day overwrite, identical skip, 200 cap)

**Window exports:** all open/save functions, `selectCtxOption`, `addCondition`, `deleteCondition`, `addGoal`, `deleteGoal`, `syncDiagnosesNote`, `openInterpretiveLensEditor`, `saveInterpretiveLens`

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
- `renderGeneticsSection()` — dashboard card with APOE + significant/moderate findings
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
- `initDropZone()` — wires the drag-and-drop zone for PDF and JSON files

**Window exports:** `confirmImport`, `skipImport`, `importNextPDF`, `syncImportStatusFab`, `handleImportStatusClick`, `isImportRunning`

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

AI chat panel, context building, and markdown rendering.

**Key exports:**
- `buildLabContext()` — serializes all lab entries + all 9 context cards + interpretiveLens + contextNotes + cycle data + notes into a structured AI context string
- `sendChatMessage()` — sends user message (with optional image attachments) and last 30 messages to the active AI provider, streams response with typewriter trickle
- `renderMarkdown(text)` — block-aware parser: headings, lists, code blocks, HR, paragraphs + inline formatting
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
- `loadBackupSnapshots()` — async; populates the Backup & Restore section with IndexedDB snapshots
- `restoreAutoBackup(id)` — confirm + restore a snapshot, reloads the page

**Window exports:** `openSettingsModal`, `closeSettingsModal`, `saveProfileSettings`, `setUnitSystem`, `setAIProvider`, `restoreAutoBackup`, `startTour`

---

### `glossary.js`

Searchable marker glossary modal.

**Key exports:**
- `openGlossaryModal()` / `closeGlossaryModal()`
- `renderGlossary(data, query)` — renders all markers grouped by category, filtered by search query, with latest values and ref ranges

**Window exports:** `openGlossaryModal`, `closeGlossaryModal`

---

### `feedback.js`

In-app feedback modal.

**Key exports:**
- `openFeedbackModal()` / `closeFeedbackModal()`
- `submitFeedback()` — validates and submits feedback (bug report or feature request)

**Window exports:** `openFeedbackModal`, `closeFeedbackModal`, `submitFeedback`

---

### `nav.js`

Sidebar navigation and chart layer controls.

**Key exports:**
- `renderSidebar(data)` — renders category navigation with marker counts
- `renderDateRangeFilter()` — renders the date range pills
- `renderLayersDropdown(data)` — renders the Layers dropdown (shown only when profile has notes/supplements/cycle data)
- `setDateRangeFilter(range)` — updates `state.dateRangeFilter` and refreshes
- `toggleLayer(layer)` — toggles `noteOverlayMode`, `suppOverlayMode`, or `phaseOverlayMode`

**Window exports:** `setDateRangeFilter`, `toggleLayer`, `navigateTo`

---

## Layer 6 — Orchestration

### `views.js`

All dashboard and category rendering. The largest module.

**Key exports:**
- `navigate(section, params)` — main router; calls the appropriate render function
- `showDashboard(data?)` — renders the full dashboard: drop zone → interpretive lens → focus card → context cards → cycle → supplements → key trends → alerts → data & notes
- `showCategory(catKey, data?)` — renders a single category with chart grid and data table
- `showCompare(data?)` — renders the date-comparison view
- `showCorrelations(data?)` — renders the correlation matrix
- `showDetailModal(markerKey, data?)` — opens the marker detail modal
- `showManualEntry(data?)` — renders the manual data entry form
- `showFocusCard(data?)` — renders the AI focus card with cache management
- `refreshDashboard()` — convenience function: calls `getActiveData()` and `showDashboard(data)`

**Window exports:** `navigate`, `showDashboard`, `showCategory`, `showDetailModal`, `showManualEntry`, `refreshDashboard`, `openMenstrualCycleEditor` (re-exported)

---

### `main.js`

Entry point. Runs once on `DOMContentLoaded`.

**Responsibilities:**
- Imports all feature modules (side-effect imports for window exports)
- Registers `registerRefreshCallback(() => window.refreshDashboard())`
- Attaches global event listeners: keyboard shortcuts, modal backdrop clicks, drop zone, profile selector
- Calls initial `navigate('dashboard')`

**Window exports:** none (all exports come from other modules)

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

Supplement and lifestyle recommendations driven by a lazy-loaded catalog.

**Key exports:**
- `loadRecommendations()` — lazy-loads `data/recommendations-czsk.json` on first call
- `getMarkerRecommendations(markerKey, status)` — returns food sources, supplements, and lifestyle tips for a flagged marker
- `scanChatForRecommendations(text)` — keyword scanner that maps AI chat text to recommendation slots
- `renderRecommendationCards(markerKey, status)` — renders the "What can help" section in the detail modal

**Window exports:** none (called via imports from `views.js`, `chat.js`, `context-cards.js`)

---

### `crypto.js`

Data encryption at rest, IndexedDB auto-backup, and folder backup.

**Key exports:**
- `encryptedSetItem(key, value)` / `encryptedGetItem(key)` — AES-256-GCM via PBKDF2 passphrase
- `getEncryptionEnabled()` / `setEncryptionEnabled(bool)` — encryption toggle
- `validatePassphrase(p)` — checks 4 strength rules (8+ chars, lowercase, uppercase, special), returns `{ valid, message }`
- `scheduleAutoBackup()` — debounced 60s trigger; saves up to 5 snapshots to IndexedDB + writes to folder backup if configured
- `buildBackupSnapshot()` — captures all importedData + per-profile preferences
- `restoreAutoBackup(id)` — writes snapshot to localStorage, reloads
- `saveFolderBackup(snapshot)` — writes `getbased-backup-latest.json` + daily dated snapshot to user-selected folder via File System Access API
- `broadcastDataChanged(profileId)` — BroadcastChannel message for multi-tab sync
- `SENSITIVE_PATTERNS` — array of localStorage key pattern strings that get encrypted

**Window exports:** `setEncryptionEnabled`, `changePassphrase`, `restoreAutoBackup`, `exportBackup`, `importBackup`, `pickBackupFolder`, `showBackupReminder`
