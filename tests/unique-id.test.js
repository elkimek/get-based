import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUniqueId } from '../js/unique-id.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createUniqueId', () => {
  it('creates allowlist-safe, collision-resistant ids under burst load', () => {
    const ids = Array.from({ length: 1_000 }, () => createUniqueId('record_'));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => /^record_[a-z0-9_]+$/i.test(id))).toBe(true);
  });

  it('keeps the fallback unique with a frozen clock without weak randomness', () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const randomSpy = vi.spyOn(Math, 'random');

    const first = createUniqueId('fallback_');
    const second = createUniqueId('fallback_');

    expect(randomSpy).not.toHaveBeenCalled();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^fallback_[a-z0-9_]+$/i);
    expect(second).toMatch(/^fallback_[a-z0-9_]+$/i);
  });
});
