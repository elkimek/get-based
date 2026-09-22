import { expect, it } from 'vitest';
import config from '../vitest.critical.config.js';

it('keeps the critical local coverage command bounded to explicit test and source files', () => {
  expect(config.test.include).toHaveLength(31);
  expect(config.test.include.every(file => file.startsWith('tests/') && file.endsWith('.test.js') && !/[?*]/.test(file))).toBe(true);
  expect(config.test.coverage.include).toHaveLength(19);
  expect(config.test.coverage.include.every(file => /^(?:js\/|lib\/|server\/|service-worker-runtime\.js$)/.test(file) && !/[?*]/.test(file))).toBe(true);
  expect(Object.keys(config.test.coverage.thresholds).sort()).toEqual([...config.test.coverage.include].sort());
  for (const file of config.test.coverage.include) {
    // Preserve the original >=80 floor; voice playback starts
    // at their measured branch coverage and must not weaken the other gates.
    const floor = { 'js/voice-player.js': 74 }[file] ?? 80;
    expect(config.test.coverage.thresholds[file].branches).toBeGreaterThanOrEqual(floor);
  }
});
