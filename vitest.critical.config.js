// Small, independently enforced critical-behavior coverage gate.
// This supplements the complete CI denominator; it does not replace it.
import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tests/agent-draft-claims.test.js',
      'tests/agent-draft-routing.test.js',
      'tests/agent-draft-persistence.test.js',
      'tests/agent-drafts.test.js',
      'tests/notes-safety.test.js',
    ],
    coverage: {
      ...base.test.coverage,
      enabled: true,
      include: ['js/agent-draft-claims.js', 'js/agent-drafts.js', 'js/notes.js'],
      reportsDirectory: 'tests/.critical-coverage',
      reporter: ['json-summary', 'json', 'text'],
      thresholds: {
        'js/agent-draft-claims.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'js/agent-drafts.js': { lines: 100, functions: 100, branches: 89, statements: 100 },
        'js/notes.js': { lines: 97, functions: 86, branches: 82, statements: 92 },
      },
    },
  },
});
