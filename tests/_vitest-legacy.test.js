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

// Reset shared module-level state between legacy tests. localStorage /
// sessionStorage / fetch / addEventListener listeners are all wired up
// on globalThis in _vitest-setup.js — if one legacy test sets a key
// and the next test reads it, results leak. Clear at the boundary.
beforeEach(() => {
  if (typeof globalThis.localStorage?.clear === 'function') globalThis.localStorage.clear();
  if (typeof globalThis.sessionStorage?.clear === 'function') globalThis.sessionStorage.clear();
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
