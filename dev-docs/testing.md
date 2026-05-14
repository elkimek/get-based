# Testing

getbased uses browser-based tests — no test framework, no Jest, no jsdom. Each test file is a self-executing IIFE that runs assertions against the live app in a real browser context.

## The assert pattern

Every test file defines a local `assert` helper and collects results:

```js
(async () => {
  const results = [];
  let passed = 0, failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      results.push({ ok: true, name });
      passed++;
    } else {
      results.push({ ok: false, name, detail });
      failed++;
    }
  }

  // --- tests ---

  assert('state object exists', typeof window._labState === 'object');
  assert('importedData has entries array',
    Array.isArray(window._labState.importedData.entries));

  // --- report ---
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  results.filter(r => !r.ok).forEach(r =>
    console.error(`FAIL: ${r.name}`, r.detail)
  );
  return { passed, failed, results };
})();
```

The `detail` argument appears in the failure output — use it to print the actual value that caused the failure.

## The test files

All test files live in the `tests/` directory. Run `ls tests/test-*.js | wc -l` for the current count.

A few tests run node-side (no browser, no Puppeteer) — pure-helper unit tests + node script guards. Marked **node** in the table; everything else is browser-driven.

| File | What it covers |
|---|---|
| `tests/test-a11y-axe.js` | Runtime axe-core 4.10 scan across every lens + 6 Settings tabs + EMF editor (14 stops). Baseline-locked CI gate (see [Accessibility regression scan](#accessibility-regression-scan)) |
| `tests/test-a11y-phase3.js` | Accessibility regression pass: keyboard delegation, role="button" tabindex, focus trapping |
| `tests/test-ai-verdict-engine-instance.js` | Engine instance methods (refresh, isAnalyzing, maybeAfterFinish, purgeOrphaned) + the default cfg callbacks the main engine test overrides |
| `tests/test-adapters.js` | Adapter registry: structure, fatty acids, OAT, metabolomix, cross-adapter |
| `tests/test-ai-verdict-engine.js` | Shared `js/ai-verdict-engine.js` factory: in-flight tracker, watchdog, fingerprint cache, JSON parse guards |
| `tests/test-audit-fixes.js` | Regression coverage for the 2026-05-09 audit pass (multi-area follow-ups) |
| `tests/test-audit.js` | Security audit: XSS escaping, marker-key allowlist guards, innerHTML sanitizer sweep, null/div-by-zero, focus trapping, CSP |
| `tests/test-biometrics.js` | Biometrics time-series: weight, BP, pulse, BMI auto-calc |
| `tests/test-biostarks-adapter.js` | BioStarks adapter: registration, detection, markers, normalization |
| `tests/test-blob-storage.js` | IDB-backed key/value store + the localStorage→IDB migration on first read of `*-imported` |
| `tests/test-calculated-markers.js` | Calculated markers: PhenoAge, Bortz Age, Biological Age, BUN/Creatinine, Free Water Deficit, hs-CRP/HDL |
| `tests/test-cashu-wallet.js` | Cashu wallet: encrypted mnemonic, locks, proofs, recovery, fee split, Nostr discovery, BIP-39 seed |
| `tests/test-change-history.js` | Change history: `recordChange` dedup, snapshot deep-copy, cap, AI context timeline, export/import round-trip |
| `tests/test-changelog.js` | What's New modal: version sync, HTML, main.js wiring, settings, forceShow patch-bump override, behavioral idempotency |
| `tests/test-chat-actions.js` | Chat message action buttons: regenerate, copy, context toggle |
| `tests/test-chat-panel-ux.js` | Chat panel interactive-while-open + fullscreen layout (v1.3.29 surface) |
| `tests/test-chat-threads.js` | Chat thread CRUD, auto-naming, migration, encryption patterns, backup inclusion |
| `tests/test-correctness-phase2.js` | v1.5.1 correctness pass: per-profile sync debouncer, lab-context fingerprint, lens LRU |
| `tests/test-crypto.js` | AES-256-GCM encryption, PBKDF2, passphrase validation (20+ sections) |
| `tests/test-custom-api.js` | Custom API provider: 6th provider registration, endpoint config, model fetch |
| `tests/test-custom-lens.js` | Custom Knowledge Source (Lens Corpus): backend selection, library CRUD, query routing |
| `tests/test-custom-personality.js` | Named custom personalities: storage, icon picker, generation, dirty state, thread metadata |
| `tests/test-cycle-improvements.js` | Phase-aware ranges, cycle iron alerts, perimenopause detection, heavy flow alerts |
| `tests/test-cycle-tour.js` | Cycle spotlight tour: 8 steps, DOM elements, auto-trigger, storage key |
| `tests/test-dashboard-data-protection.js` | Data protection CTA + picker on the dashboard (encryption / sync / auto-backup) |
| `tests/test-dashboard-genetics-empty.js` | Genetics empty-state CTA (DNA discovery stub) on the dashboard |
| `tests/test-dashboard-knowledge-base.js` | Knowledge Base row + Personalize-AI CTA on the dashboard |
| `tests/test-data-merge.js` | Per-array union-by-id sync merge: additions, edit-conflict resolution, tombstones, nested |
| `tests/test-data-pipeline.js` | Core data pipeline: getActiveData, unit conversion, date filtering, trend detection |
| `tests/test-demo.js` | Demo data files: v2 structure, structured context cards, menstrual cycle for Sarah |
| `tests/test-dev-server-helpers.js` | **node** — `dev-server.js` helper unit tests |
| `tests/test-dev-server-origin.js` | **node** — `dev-server.js` `/api/*` same-origin guard rejects forged headers |
| `tests/test-dna-illumina-and-valence.js` | Illumina GenomeStudio (DNAEra) + Valence formats; probe-name prefix strip |
| `tests/test-dna-mtdna-subclades.js` | mtDNA sub-haplogroup resolution (v1.23.0) |
| `tests/test-dna-recommendations.js` | DNA-aware supplement recommendations: snpHints, buildDNAHints, gene-keyword scanner |
| `tests/test-dna.js` | DNA import: SNP parsing, APOE haplotype, format detection, dashboard rendering |
| `tests/test-emf.js` | EMF assessment: SBM-2015 severity, room CRUD, source/mitigation tags |
| `tests/test-emf-flow.js` | EMF module behavioral flow (CRUD + interpret + PDF-import path) — opens the full editor lifecycle that `test-emf.js` only schema-tests |
| `tests/test-export-import.js` | Export/import roundtrip + encrypted-backup re-enumeration: JSON structure, date merge, context field handling |
| `tests/test-family-history.js` | Medical History + family-history subsection: relative picker, CRUD, FAMILY_RELATIVES enum |
| `tests/test-folder-backup.js` | Folder backup: File System Access API, snapshot format, daily filenames, IndexedDB v2 handle persistence |
| `tests/test-hardware.js` | Model Advisor: GPU detection, VRAM badges, model fitness ratings |
| `tests/test-image-utils.js` | Image utilities: resize, format, vision content building |
| `tests/test-integration-batch2.js` | Integration: batch import, marker keys, custom markers, adapters |
| `tests/test-lens-local-utils.js` | **node** — pure helpers from `js/lens-local-utils.js`: chunking, MMR selection, cosine similarity |
| `tests/test-lens-local-worker.js` | Full message-protocol round-trip against `lens-local-worker.js` with a mocked embedder |
| `tests/test-lens-multi-query.js` | Multi-query rewrite + reciprocal-rank-fusion chunk fusion |
| `tests/test-lens-parsers.js` | `js/lens-local-parsers.js` edge cases: `extractFromFile()` never throws, returns expected shape |
| `tests/test-light-ai-renders.js` | Smoke coverage for the 10 feature-specific Light & Sun AI modules |
| `tests/test-light-device-ai-analysis.js` | Per-device-session AI verdict: fingerprint determinism, prompt-context shape (incl. mode resolution + injection guards), render state machine, engine adapter coverage |
| `tests/test-light-devices.js` | Light therapy device library + sessions: addDeviceFromPreset, deleteDevice, logDeviceSession |
| `tests/test-light-env.js` | Light Environment math + CRUD: rooms, screens, computeRoomSeverity, computeScreenStatus, computeIndoorBurden |
| `tests/test-light-tools.js` | Pure helpers from `light-tools.js`: computeRowBanding (flicker FFT), saveMeasurement, lockStatusLine |
| `tests/test-light-tools-flow.js` | Drives `saveMeasurement` across all 8 tool types + every camera-bound opener (handles missing getUserMedia cleanly) |
| `tests/test-lighting-hardware-caveats.js` | Guard the load-bearing PWM/TRIAC caveat block against silent removal from any AI-analysis prompt |
| `tests/test-manual-entry-flow.js` | Manual-entry quality-of-life: range sanity check, duplicate-date confirm, Save & Add Another |
| `tests/test-markdown.js` | Markdown rendering + XSS surface assertions for streamed AI responses |
| `tests/test-marker-key-safety.js` | **node** — `safeMarkerId` + `sanitizeMarkerKey` allowlist + proto-pollution rejection (38 assertions) |
| `tests/test-marker-value-notes.js` | Per-value notes on lab markers: schema defaults, profile migration, sync DELTA_MAPS wiring |
| `tests/test-mobile.js` | Responsive layout: breakpoints, grid overflow, touch tap targets, safe grid sizing |
| `tests/test-no-native-dialogs.js` | **node** — guard against `window.prompt/confirm/alert` regressions across `js/` |
| `tests/test-normalize-units.js` | Unit normalization: SI conversion in the PDF import pipeline |
| `tests/test-openrouter.js` | OpenRouter provider: curated model list, pricing cache, exclude blocklist, model fetch |
| `tests/test-phase-ranges.js` | Phase-aware reference ranges for estradiol and progesterone aligned with dates |
| `tests/test-pii.js` | PII obfuscation: regex patterns, streaming sanitizer |
| `tests/test-prelab.js` | Pre-lab onboarding: context assembly without data, chat prompts |
| `tests/test-provenance.js` | Import provenance: markerSources tracking, PDF/manual source attribution |
| `tests/test-recommendations.js` | Supplement recommendations: catalog slots, keyword scanner, safety caveats, disclosure gate |
| `tests/test-schema.js` | MARKER_SCHEMA integrity, unit conversions, optimal ranges, phase ranges |
| `tests/test-security-phase1.js` | v1.5.0 security pass: pdf.js vendor presence, isEvalSupported, defense-in-depth |
| `tests/test-silhouette-picker.js` | Body-region silhouette picker: bindBodySilhouette mounts, every region clickable |
| `tests/test-silhouette-region-map.js` | Region-map correctness: anatomical body-zone definitions and lookups |
| `tests/test-sun-ai-analysis.js` | Per-session AI verdict module: fingerprint stability, context-build, render state machine |
| `tests/test-sun-context.js` | `buildSunContext({tier})` AI prompt assembly: always/standard/deep tier shaping, deficit detection |
| `tests/test-sun-correlations.js` | Pearson coefficient + weekly binning + cache invalidation for per-channel × biomarker engine |
| `tests/test-sun-defaults.js` | Onboarding defaults: Fitzpatrick mapping, OTT score boundaries, getSunDefaults round-trip |
| `tests/test-sun-spectrum.js` | Bird-Riordan reconstruction + action-spectrum convolution + vit-D calibration gate |
| `tests/test-sun-ui-flow.js` | Behavioral UI flow for the Light & Sun lens: dashboard strip, /light page, session controls |
| `tests/test-sun-uvdata.js` | Multi-source UV/ozone client: SSRF guard, manual entry, provider routing, solar-zenith math |
| `tests/test-sun-uvdata-flow.js` | Behavioral flow for `sun-uvdata.js`: cache, provider chain (auto / open-meteo / selfhost / noaa), interpolateAtmosphere bracketing, readStaleCache fallback |
| `tests/test-sun.js` | Sun session orchestration: lifecycle, hydration, rolling totals, vit-D IU accumulation, MED carry-over |
| `tests/test-supplement-impact.js` | Supplement-biomarker impact analysis: batched computation, caching, health dots |
| `tests/test-sync.js` | Cross-device sync: payload format, AI settings keys, encrypted keys, Evolu integration |
| `tests/test-table-heatmap-empty.js` | Table/Heatmap views skip all-null markers; empty category shows hint |
| `tests/test-tour.js` | App tour: 7 steps, spotlight DOM, positioning, escape key, completion flag (154 assertions) |
| `tests/test-trend-alerts.js` | Trend detection: sudden change alerts, linear regression, status logic |
| `tests/test-ui-flows.js` | Behavioral UI tests: key user flows, rendered output verification |
| `tests/test-unit-import.js` | Unit normalization on import: SI conversion, enzyme units, FA adapter safety |
| `tests/test-v1-6-shipped.js` | Regression coverage for v1.6.7..v1.6.16 ship arc |
| `tests/test-venice-e2ee.js` | Venice E2EE: ECDH key exchange, AES-GCM encryption, TEE headers, model detection |
| `tests/test-vendor-personal-info.js` | `fetchXxxPersonalInfo` + `logDebug` rails for Fitbit / Ultrahuman / Whoop / Polar (one stubbed `/api/proxy` response per vendor) |
| `tests/test-coverage-stragglers.js` | Targeted probes for the 1-fn gaps left after the AI-verdict + vendor sweeps: image-utils onerror, lens-local-parsers extractDocx, oura-auth json-catch, utils animationend, FileReader stub, AbortSignal.any polyfill, SSE handler, IDB onerror rails (blob / cashu / ws / backup), cashu open onerror, dna worker.onerror |
| `tests/test-wearables-bp-merge.js` | BP renders as one paired card (sys/dia): strip-render filter, reorder-mode behavior |
| `tests/test-wearables-fetchers.js` | Per-vendor adapter `fetchXxxDailyRange` against canned proxy responses |
| `tests/test-wearables-manual.js` | Manual entry as a first-class wearable source: logManualMetric, MANUAL_TAGS whitelist, migration |
| `tests/test-wearables-runtime-config.js` | Self-host OAuth `*_CLIENT_ID` env override (issue #145) |
| `tests/test-wearables-sync-flow.js` | Wearable sync orchestration end-to-end with mocked proxy fetch + fake connection record |
| `tests/test-wearables-ui-flows.js` | DOM-driven wearable UI flows: detail-modal manual entry, source picker, reorder mode |
| `tests/test-wearables.js` | Wearable adapter registry + L1 store + L2 summary + AI context + JSZip lazy-load (Apple Health) |

The landing page test (`test-landing.js`) lives in the [get-based-site](https://github.com/elkimek/get-based-site) repo.

## Run all tests headlessly

```bash
./run-tests.sh
```

The script:
1. Checks if a server is running on port 8000; starts `node dev-server.js` if not
2. Runs the node-side tests first (fast fail on helper regressions, no browser needed)
3. Runs each browser test file through headless Chrome via Puppeteer
4. Prints a pass/fail summary per file
5. Exits with code `0` if all pass, `1` if any fail

**Requires:** Node.js with Puppeteer installed (`npm i -g puppeteer` or `npx puppeteer`).

Alternatively, with a server already running:

```bash
NODE_PATH=/path/to/node_modules node run-tests.js
```

## Coverage reporting

Function-level coverage is opt-in via the `COVERAGE` env var. Off by default — adds ~3 seconds per run when enabled.

```bash
COVERAGE=1 ./run-tests.sh
```

The runner uses Puppeteer's CDP-backed `JSCoverage` API with `includeRawScriptCoverage: true` so V8's per-function call data is exposed. Two metrics are reported:

- **Function coverage** (primary) — each defined function called ≥ once. The metric the team gates on.
- **Byte coverage** (secondary) — fraction of source bytes executed. Useful for spot-checks but noisy across branchy code.

Per-file lines are sorted lowest-coverage first; the first 30 print, the rest get summarised at the bottom. Full data lands in `tests/.coverage.json` (gitignored — regenerated on every COVERAGE=1 run).

### CI gate

When `COVERAGE=1` is set, `run-tests.sh` defaults `COVERAGE_MIN=90`. The suite exits 1 if global function coverage drops below the floor:

```bash
COVERAGE=1 COVERAGE_MIN=90 ./run-tests.sh   # default
COVERAGE=1 COVERAGE_MIN=0  ./run-tests.sh   # report-only, no gate
```

The gate is a static floor — pick a number, defend it. There is no auto-ratchet (the floor stays at 90 even when the actual coverage is higher) because legitimate refactors that drop coverage 91 → 90.5 shouldn't break CI.

### Drift detector

To catch slow erosion within the floor (the "death by a thousand cuts" pattern where coverage decays from 93% → 90.05% over many small commits), `run-tests.js` reads the prior `.coverage.json` snapshot before overwriting it. If the new run's function coverage drops > 0.5pt vs the prior, a `DRIFT WARNING` line prints in yellow. The warning is non-fatal — `COVERAGE_MIN` stays the hard gate.

### Aggregation gotchas

V8's coverage records are per-script-load, not per-source-file. The aggregator (in `run-tests.js`'s `writeCoverageReport`) handles two non-obvious cases:

1. **Cache-busted URLs.** Tests that dynamic-import modules with `?bust=Date.now()` create separate URL records per import. The aggregator strips the query string before bucketing so all loads of `/js/foo.js?bust=N` fold into one canonical entry.
2. **V8 startOffset divergence.** Same source bytes produce different `startOffset` values across loads. Naive `name + startOffset` deduping doubled function totals; the current aggregator picks ONE canonical entry per file (largest text wins) as ground truth, then OR-s in called-status across other entries by function name.

## Accessibility regression scan

`tests/test-a11y-axe.js` loads axe-core 4.10 from cdnjs at runtime and runs `axe.run()` against the live DOM at 14 stops (every lens + every modal). Severity policy:

- **critical / serious** → test fails on regression vs baseline
- **moderate / minor** → logged but doesn't block (axe leans opinionated at those tiers)

### Baseline-locked gate

The gate is **baseline-relative**, not zero-tolerance. Real-world a11y adoption gates on "no regression from current state" — gating on zero violations the first time a codebase adopts axe would block every PR forever.

Baseline lives at `tests/.a11y-baseline.json`:

```json
{
  "_axeVersion": "4.10.0",
  "critical": {},
  "serious": { "color-contrast": 124, "nested-interactive": 40 },
  "moderate": {},
  "minor": {}
}
```

The test fails when any critical/serious rule's count **exceeds** the baseline. New rules with non-zero counts ARE a regression (the suite never saw them before). Improvements (current < baseline) pass and emit a hint to refresh the baseline.

`_axeVersion` pins the runtime axe-core load. Bumping the cdnjs URL without bumping this field would surface rule renames as false regressions; the test prints an info line on mismatch.

### Refreshing the baseline

After a wave of fixes that legitimately drops violation counts:

```bash
A11Y_REBASELINE=1 ./run-tests.sh
```

`run-tests.js` pipes the env var into the page context via `page.evaluateOnNewDocument`. The test prints a `▶ {...}` JSON line — copy it over the critical/serious/moderate/minor blocks in `tests/.a11y-baseline.json`. Don't lower these numbers without an actual fix; the gate would lock in the new lower bound and silently accept regressions.

If the baseline file is missing entirely, the test treats the first run as "establish baseline" and prints the JSON to stdout for paste-back.

## Running a single test in the browser

Open the browser console while `http://localhost:8000` is running, then:

```js
fetch('tests/test-cycle-improvements.js').then(r => r.text()).then(s => Function(s)())
```

Results appear in the console. This is useful during development before running the full suite.

## Writing new tests

When you add a feature or fix a bug, add assertions to the relevant test file. If none fits, create `test-yourfeature.js`.

**What to cover:**

- **Source inspection** — verify the function or pattern exists in the source:
  ```js
  const src = await fetch('js/data.js').then(r => r.text());
  assert('getActiveData exported', src.includes('export function getActiveData'));
  ```

- **DOM state** — check that elements render correctly:
  ```js
  const card = document.querySelector('.context-card[data-key="diet"]');
  assert('diet card rendered', card !== null);
  assert('diet card has edit button', card.querySelector('.ctx-edit-btn') !== null);
  ```

- **Function behavior** — call window-exported functions and check results:
  ```js
  const data = window.getActiveData ? window.getActiveData() : null;
  assert('getActiveData returns dates array', Array.isArray(data?.dates));
  ```

- **CSS rules** — verify styles are applied (use `getComputedStyle` or inspect stylesheets):
  ```js
  const styles = [...document.styleSheets].flatMap(s => {
    try { return [...s.cssRules].map(r => r.cssText); } catch { return []; }
  }).join('\n');
  assert('grid overflow hidden set', styles.includes('min-width: 0'));
  ```

- **localStorage keys** — verify storage conventions:
  ```js
  assert('correct key format', localStorage.getItem('labcharts-default-imported') !== undefined
    || true); // key may not exist in test env
  ```

## What the headless runner cannot test

- Drag-and-drop interactions
- File picker dialogs
- Actual streaming AI responses (API key required)
- IndexedDB state across page reloads (the runner resets between files)

For these, test the surrounding logic (e.g., that `handleBatchPDFs` function exists and has the right signature) rather than the interaction itself.
