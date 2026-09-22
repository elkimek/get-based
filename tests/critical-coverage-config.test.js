import { expect, it } from 'vitest';
import config from '../vitest.critical.config.js';

it('keeps the critical local coverage command bounded to explicit test and source files', () => {
  expect(config.test.include).toHaveLength(15);
  expect(config.test.include.every(file => file.startsWith('tests/') && file.endsWith('.test.js') && !/[?*]/.test(file))).toBe(true);
  expect(config.test.coverage.include).toHaveLength(11);
  expect(config.test.coverage.include.every(file => /^(?:js\/|lib\/|service-worker-runtime\.js$)/.test(file) && !/[?*]/.test(file))).toBe(true);
  expect(Object.keys(config.test.coverage.thresholds).sort()).toEqual([...config.test.coverage.include].sort());
  for (const file of config.test.coverage.include) {
    // Preserve the original >=80 floor; the two newly enrolled modules start
    // at their measured branch coverage and must not weaken the other gates.
    const floor = { 'js/voice-player.js': 73, 'lib/codex-app-server-client.js': 77 }[file] ?? 80;
    expect(config.test.coverage.thresholds[file].branches).toBeGreaterThanOrEqual(floor);
  }
});
