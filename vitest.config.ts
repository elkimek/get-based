// Vitest config — fast unit-test runner for the logic layer.
//
// Default environment is `node`. Individual files can opt into `jsdom`
// via a top-of-file pragma:  // @vitest-environment jsdom
//
// `include` is an EXPLICIT allowlist. Anything not listed here is either a
// browser fixture owned by Playwright or an ad-hoc helper script.
//
// Native *.test.js suites coexist with the legacy script wrapper.

import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import { COVERAGE_INCLUDE } from './scripts/coverage-source.mjs';

export default defineConfig({
  plugins: [{
    name: 'getbased-native-component-coverage',
    enforce: 'pre',
    // Combined coverage uses compiled function ranges, just like Playwright.
    // Keep V8/Istanbul in that coordinate space; the collector separately uses
    // the unchanged external map to identify bundled framework functions.
    load(id) {
      if (!id.endsWith('.svelte.native.js')) return null;
      return { code: fs.readFileSync(id, 'utf8').replace(/\/\/# sourceMappingURL=[^\r\n]*/g, ''), map: null };
    },
  }],
  test: {
    environment: 'node',
    include: [
      'tests/**/*.test.{js,ts}',
    ],
    // Belt-and-suspenders: the `include` glob already excludes vendored
    // and built code by virtue of being scoped to `tests/`, but a future
    // loosening (or someone running Vitest with `--include 'js/**'`)
    // would crawl node_modules + vendor + the built docs. Pin these.
    exclude: [
      '**/node_modules/**',
      'vendor/**',
      'docs/**',
      'dist-docs/**',
    ],
    setupFiles: ['./tests/_vitest-setup.js'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'json'],
      reportsDirectory: 'tests/.vitest-coverage',
      ...{ all: true },
      include: COVERAGE_INCLUDE,
      exclude: [
        '**/node_modules/**',
        'docs/**',
        'dist-docs/**',
        'tests/**',
      ],
    },
  },
});
