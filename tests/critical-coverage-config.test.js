import { expect, it } from 'vitest';
import config from '../vitest.critical.config.js';

it('keeps the critical local coverage command bounded to explicit test and source files', () => {
  expect(config.test.include).toHaveLength(50);
  expect(config.test.include.every(file => file.startsWith('tests/') && file.endsWith('.test.js') && !/[?*]/.test(file))).toBe(true);
  expect(config.test.coverage.include).toHaveLength(28);
  expect(config.test.coverage.include.every(file => /^(?:js\/|lib\/|server\/|service-worker-runtime\.js$)/.test(file) && !/[?*]/.test(file))).toBe(true);
  expect(Object.keys(config.test.coverage.thresholds).sort()).toEqual([...config.test.coverage.include].sort());
  for (const file of config.test.coverage.include) {
    // Preserve existing floors; newly enforced modules start at measured
    // independent branch coverage without weakening other module gates.
    const floor = { 'js/voice-player.js': 74, 'js/nutrition-store.js': 73 }[file] ?? 80;
    expect(config.test.coverage.thresholds[file].branches).toBeGreaterThanOrEqual(floor);
  }
});
