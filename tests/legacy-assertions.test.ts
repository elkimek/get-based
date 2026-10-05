import { describe, expect, it, vi } from 'vitest';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';

describe('legacy assertion reporting', () => {
  it.each([' — ', ' -- ', ' - '])('preserves truthiness, counters and the %j detail separator', separator => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { assert, results } = createLegacyAssertions(separator);
      assert('success', {});
      assert('failure', 0, 'reason');
      assert('no detail', false, '');
      expect(results).toEqual({ pass: 1, fail: 2 });
      expect(log.mock.calls).toEqual([
        ['  PASS: success'], [`  FAIL: failure${separator}reason`], ['  FAIL: no detail'],
      ]);
    } finally { log.mockRestore(); }
  });

  it('keeps reports independent and retains default-hint coercion of failure details', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const first = createLegacyAssertions(), second = createLegacyAssertions();
      first.assert('detail', false, { valueOf: () => 'primitive detail', toString: () => 'different detail' });
      expect(first.results).toEqual({ pass: 0, fail: 1 });
      expect(second.results).toEqual({ pass: 0, fail: 0 });
      expect(log).toHaveBeenCalledWith('  FAIL: detail — primitive detail');
    } finally { log.mockRestore(); }
  });
});
