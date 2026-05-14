// Vitest entrypoint for legacy node-side test files.
//
// Each LEGACY_TEST file was originally written to be runnable via
// `node tests/foo.js`: it uses a bespoke `assert(name, cond)` pattern,
// writes pass/fail to console.log, and exits with code 0/1.
//
// Rather than rewrite every file to use `it()`/`expect()`, we import
// each one as a module side effect from inside a single Vitest test.
// FAIL lines are captured from console.log and re-raised so Vitest
// surfaces them. `process.exit(0)` is intercepted by the shim in
// _vitest-setup.js so the suite proceeds to the next file.
//
// To add a file to the Vitest suite, append it to LEGACY_TESTS.

import { it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Capture the canonical globalThis.fetch at module-load time, BEFORE
// any LEGACY_TEST has a chance to overwrite it. Some ported tests
// (test-light-devices, test-calculated-markers, test-data-pipeline)
// install relative-URL → fs read-through fetch shims for their own
// runtime needs and don't restore them. Without a beforeEach reset,
// those shims leaked into every test that ran after them — a latent
// trap flagged by Greptile in PR #199.
const _origFetch = globalThis.fetch;

// Reset shared module-level state between legacy tests. localStorage /
// sessionStorage / fetch / addEventListener listeners are all wired up
// on globalThis in _vitest-setup.js — if one legacy test sets a key
// (or overwrites fetch) and the next test reads it, results leak.
//
// IndexedDB: fake-indexeddb/auto installs ONE global IDBFactory for the
// whole worker lifetime, so without a reset, an IDB-backed test (batch
// 32+: test-wearables, test-blob-storage, …) could read stale databases
// a prior test wrote. Swapping in a fresh IDBFactory each time gives
// every legacy test an empty IDB. No-op for the current suite (nothing
// touches IDB yet) — this just makes the shim ready for the IDB ports.
beforeEach(() => {
  if (typeof globalThis.localStorage?.clear === 'function') globalThis.localStorage.clear();
  if (typeof globalThis.sessionStorage?.clear === 'function') globalThis.sessionStorage.clear();
  globalThis.fetch = _origFetch;
  globalThis.indexedDB = new IDBFactory();
});

const LEGACY_TESTS = [
  // Pre-existing node-side tests.
  './test-no-native-dialogs.js',
  './test-lens-local-utils.js',
  './test-marker-key-safety.js',
  './test-dev-server-helpers.js',
  // Batch 1 — pure-logic ports from puppeteer.
  './test-sun-spectrum.js',
  './test-lighting-hardware-caveats.js',
  './test-markdown.js',
  // Batch 2 — incremental ports.
  './test-data-merge.js',
  './test-security-phase1.js',
  './test-correctness-phase2.js',
  // Batch 3 — more pure-logic ports.
  './test-lens-multi-query.js',
  './test-adapters.js',
  './test-biostarks-adapter.js',
  './test-trend-alerts.js',
  './test-supplement-impact.js',
  // Batch 4 — more pure-logic ports.
  './test-provenance.js',
  './test-dna-mtdna-subclades.js',
  './test-vendor-personal-info.js',
  './test-normalize-units.js',
  // Batch 5 — module imports + source inspection.
  './test-pii.js',
  './test-schema.js',
  './test-ai-verdict-engine-instance.js',
  './test-phase-ranges.js',
  // Batch 6 — more module imports + source inspection.
  './test-prelab.js',
  './test-venice-e2ee.js',
  './test-unit-import.js',
  // Batch 7 — wearables fetchers + hardware advisor.
  './test-wearables-fetchers.js',
  './test-wearables-runtime-config.js',
  './test-hardware.js',
  // Batch 8 — lens parsers + a11y phase 3 + marker value notes.
  './test-lens-parsers.js',
  './test-a11y-phase3.js',
  './test-marker-value-notes.js',
  // Batch 9 — data pipeline + calculated markers (uses state.js + data.js).
  './test-calculated-markers.js',
  './test-data-pipeline.js',
  // Batch 10 — sun + light pure-logic ports.
  './test-sun-correlations.js',
  './test-sun-defaults.js',
  './test-sun.js',
  './test-light-env.js',
  './test-light-devices.js',
  './test-sun-context.js',
  './test-sun-uvdata.js',
  // Batch 11 — cycle + change-history + light-tools + biometrics.
  './test-light-tools.js',
  './test-cycle-improvements.js',
  './test-change-history.js',
  './test-biometrics.js',
  // Batch 12 — sun/light AI-analysis + flow tests.
  './test-sun-uvdata-flow.js',
  './test-light-tools-flow.js',
  './test-sun-ai-analysis.js',
  './test-light-device-ai-analysis.js',
  './test-light-ai-renders.js',
  // Batch 13 — source inspection + light module ports.
  './test-cycle-tour.js',
  './test-folder-backup.js',
  './test-table-heatmap-empty.js',
  './test-manual-entry-flow.js',
  // Batch 14 — demo + integration source inspection.
  './test-demo.js',
  './test-integration-batch2.js',
  // Batch 15 — v1.6 regression coverage.
  './test-v1-6-shipped.js',
  // Batch 16 — sync + small dashboard tests.
  './test-dashboard-genetics-empty.js',
  './test-sync.js',
  // Batch 17 — recommendations module.
  './test-recommendations.js',
  // Batch 19 — DNA-aware recommendation integration + image utils
  // (DOM-runtime sections extracted to test-image-utils-dom.js, kept
  // in the puppeteer runner).
  './test-dna-recommendations.js',
  './test-image-utils.js',
  // Batch 20 — changelog modal source-inspection + hasCardContent
  // (DOM-runtime sections in test-changelog-dom.js stay on puppeteer).
  './test-changelog.js',
  // Batch 21 — OpenRouter integration source-inspection + behavioral
  // (DOM section in test-openrouter-dom.js stays on puppeteer).
  './test-openrouter.js',
  // Batch 22 — pre-release audit source-inspection + innerHTML sweep
  // (section-3b functional guard probes in test-audit-dom.js stay on puppeteer).
  './test-audit.js',
  // Batch 23 — custom personality behavioral + source-inspection
  // (DOM sections 11/12/17/21 in test-custom-personality-dom.js stay on puppeteer).
  './test-custom-personality.js',
  // Batch 24 — custom API provider behavioral + source-inspection
  // (DOM sections 13/14 in test-custom-api-dom.js stay on puppeteer).
  './test-custom-api.js',
  // Batch 25 — custom lens (Knowledge Source) behavioral + source-inspection
  // (DOM sections 15/16 in test-custom-lens-dom.js stay on puppeteer).
  './test-custom-lens.js',
  // Batch 26 — EMF assessment (full port, no DOM split — pure-logic +
  // module imports: SBM-2015 thresholds, severity tiers, affiliate catalog).
  './test-emf.js',
  // Batch 27 — dashboard KB / Personalize-AI CTA HTML-string rendering
  // (section 5 picker open/dismiss in test-dashboard-knowledge-base-dom.js
  // stays on puppeteer).
  './test-dashboard-knowledge-base.js',
  // Batch 28 — dashboard data-protection CTA HTML-string rendering
  // (section 6 picker open/dismiss in test-dashboard-data-protection-dom.js
  // stays on puppeteer).
  './test-dashboard-data-protection.js',
  // Batch 29 — chat action buttons + context summary source-inspection
  // (DOM sections 4/10/12 in test-chat-actions-dom.js stay on puppeteer).
  './test-chat-actions.js',
  // Batch 30 — multi-port: tour source-inspection, chat-threads behavioral,
  // wearables-bp-merge source-inspection. DOM remnants in the matching
  // *-dom.js files stay on puppeteer.
  './test-tour.js',
  './test-chat-threads.js',
  './test-wearables-bp-merge.js',
  // Batch 32 — test-wearables (~549 asserts: registry, IDB CRUD via
  // fake-indexeddb, summary math, write gate, 7 vendor OAuth/PKCE modules,
  // Apple Health parser, source-inspection sweep). The openWearableDetail
  // Chart.js modal islands stay on puppeteer in test-wearables-dom.js.
  './test-wearables.js',
  // Batch 33 — the remaining IDB tail, full ports (no DOM): blob-storage
  // (IDB k/v + localStorage→IDB migration), wearables-manual (manual-source
  // logging + biometrics migration), wearables-sync-flow (backfill /
  // incremental / disconnect orchestration with a mocked /api/proxy fetch).
  './test-blob-storage.js',
  './test-wearables-manual.js',
  './test-wearables-sync-flow.js',
];

for (const path of LEGACY_TESTS) {
  it(path.replace('./', ''), async () => {
    const fails = [];
    const origLog = console.log;
    const origError = console.error;
    // Greptile P2.2: tests that buffer results and emit them with
    // `console.log(results.join('\n'))` send one multi-line arg.
    // Split on \n before FAIL-detection so each failing assertion
    // becomes its own entry, not a wedged blob.
    function capture(args) {
      const joined = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
      for (const line of joined.split('\n')) {
        if (line.includes('FAIL:') || line.startsWith('FAIL ')) fails.push(line);
      }
    }
    console.log = (...args) => { capture(args); origLog(...args); };
    console.error = (...args) => { capture(args); origError(...args); };
    let importError;
    try {
      // NOTE: dynamic-import query-string cache-bust is silently ignored
      // by Vite/Vitest — verified empirically (same module reference
      // returned across two `${path}?t=${Date.now()}` calls). Modules
      // run once per worker. Watch-mode reruns only re-execute when
      // Vitest invalidates the module graph via file change. The
      // legacy tests are idempotent (side effects gated by `if`),
      // so this hasn't bitten us, but it's worth knowing.
      //
      // Greptile P2.3 (watch-mode caveat): Vitest's module cache is
      // shared across tests in the same worker. If two legacy tests
      // transitively import e.g. state.js, only the first runs
      // state.js's top-level side effects. Side effects in our legacy
      // files are idempotent, but a contributor writing a new test
      // that depends on freshly-loaded module state should be aware.
      await import(path);
    } catch (e) {
      importError = e;
    } finally {
      console.log = origLog;
      console.error = origError;
    }
    // Greptile P2.1: when the process.exit shim throws ("Test file
    // called process.exit(1)"), the structured detail of WHICH
    // assertion failed is only in the captured FAIL lines. Attach
    // them to the thrown error so Vitest's reporter shows the
    // specifics, not just the exit-code message.
    if (importError) {
      if (fails.length > 0) {
        throw new Error(`${importError.message}\n\nCaptured failures:\n  ${fails.join('\n  ')}`);
      }
      throw importError;
    }
    expect(fails, fails.join('\n  ')).toHaveLength(0);
  });
}
