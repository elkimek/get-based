import { expect, it } from 'vitest';
import rawConfig from '../vitest.critical.config.js';
import { matchesGlob } from 'node:path';

const config = rawConfig as { test: { include: string[]; coverage: { include: string[]; thresholds: Record<string, { branches: number }> } } };

it('keeps the critical local coverage command bounded to explicit test and source files', () => {
  expect(config.test.include).toHaveLength(65);
  expect(new Set(config.test.include).size).toBe(65);
  expect(config.test.include).toEqual(expect.arrayContaining([
    'tests/service-worker-runtime.test.ts',
    'tests/service-worker-client-cache.test.ts',
    'tests/service-worker-retry-aliases.test.ts',
  ]));
  expect(config.test.include.every(file => file.startsWith('tests/') && /\.test\.[jt]s$/.test(file) && !/[?*]/.test(file))).toBe(true);
  expect(config.test.coverage.include).toHaveLength(32);
  expect(config.test.coverage.include.every(file => /^(?:js\/|lib\/|server\/|service-worker-runtime\.j\[s\]$)/.test(file) && file.endsWith('.j[s]') && !/[?*]/.test(file))).toBe(true);
  expect(Object.keys(config.test.coverage.thresholds).sort()).toEqual([...config.test.coverage.include].sort());
  for (const pattern of config.test.coverage.include) {
    const file = pattern.replace(/\[s\]$/, 's');
    expect(matchesGlob(file, pattern)).toBe(true);
    expect(matchesGlob('nested/' + file, pattern)).toBe(false);
    expect(matchesGlob(file + '/nested.js', pattern)).toBe(false);
    // Preserve existing floors; newly enforced modules start at measured
    // independent branch coverage without weakening other module gates.
    const floor = ({ 'js/voice-player.js': 74, 'js/nutrition-store.js': 73 } as Record<string, number | undefined>)[file] ?? 80;
    expect(config.test.coverage.thresholds[pattern]!.branches).toBeGreaterThanOrEqual(floor);
  }
});
