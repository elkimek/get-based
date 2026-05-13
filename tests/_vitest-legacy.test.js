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

import { it, expect } from 'vitest';

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
];

for (const path of LEGACY_TESTS) {
  it(path.replace('./', ''), async () => {
    const fails = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...args) => {
      const line = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
      if (line.includes('FAIL:') || line.startsWith('FAIL ')) fails.push(line);
      origLog(...args);
    };
    console.error = (...args) => {
      const line = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
      if (line.includes('FAIL:') || line.startsWith('FAIL ')) fails.push(line);
      origError(...args);
    };
    try {
      // Cache-bust the dynamic import so re-runs see fresh module state.
      // Vitest's watch mode would otherwise reuse the cached module and
      // skip side effects on the second invocation.
      await import(`${path}?t=${Date.now()}`);
    } finally {
      console.log = origLog;
      console.error = origError;
    }
    expect(fails, fails.join('\n  ')).toHaveLength(0);
  });
}
