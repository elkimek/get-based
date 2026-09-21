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
import { COVERAGE_INCLUDE } from './scripts/coverage-source.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/**/*.test.js',
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
      all: true,
      include: COVERAGE_INCLUDE,
      exclude: [
        '**/node_modules/**',
        'vendor/**',
        'docs/**',
        'dist-docs/**',
        'tests/**',
      ],
    },
  },
});
