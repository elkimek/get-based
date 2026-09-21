import { expect, it } from 'vitest';
import config from '../vitest.critical.config.js';

it('keeps the critical local coverage command bounded to explicit test and source files', () => {
  expect(config.test.include).toHaveLength(5);
  expect(config.test.include.every(file => file.startsWith('tests/') && file.endsWith('.test.js') && !/[?*]/.test(file))).toBe(true);
  expect(config.test.coverage.include).toHaveLength(3);
  expect(config.test.coverage.include.every(file => file.startsWith('js/') && !/[?*]/.test(file))).toBe(true);
  for (const file of config.test.coverage.include) {
    expect(config.test.coverage.thresholds[file].branches).toBeGreaterThanOrEqual(80);
  }
});
