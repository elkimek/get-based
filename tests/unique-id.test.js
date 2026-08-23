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

  it('fails closed without Web Crypto instead of using weak randomness', () => {
    vi.stubGlobal('crypto', {});
    const randomSpy = vi.spyOn(Math, 'random');

    expect(() => createUniqueId('record_')).toThrow('Web Crypto is unavailable');
    expect(randomSpy).not.toHaveBeenCalled();
  });
});
