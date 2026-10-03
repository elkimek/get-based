import { expect, it } from 'vitest';
import rawConfig from '../vitest.critical.config.js';

const config = rawConfig as { test: { include: string[]; coverage: { include: string[]; thresholds: Record<string, { branches: number }> } } };

it('keeps the critical local coverage command bounded to explicit test and source files', () => {
  expect(config.test.include).toHaveLength(58);
  expect(config.test.include.every(file => file.startsWith('tests/') && /\.test\.[jt]s$/.test(file) && !/[?*]/.test(file))).toBe(true);
  expect(config.test.coverage.include).toHaveLength(32);
  expect(config.test.coverage.include.every(file => /^(?:js\/|lib\/|server\/|service-worker-runtime\.js$)/.test(file) && !/[?*]/.test(file))).toBe(true);
  expect(Object.keys(config.test.coverage.thresholds).sort()).toEqual([...config.test.coverage.include].sort());
  for (const file of config.test.coverage.include) {
    // Preserve existing floors; newly enforced modules start at measured
    // independent branch coverage without weakening other module gates.
    const floor = ({ 'js/voice-player.js': 74, 'js/nutrition-store.js': 73 } as Record<string, number | undefined>)[file] ?? 80;
    expect(config.test.coverage.thresholds[file]!.branches).toBeGreaterThanOrEqual(floor);
  }
});
