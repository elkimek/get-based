import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureBrowserStorage } from './helpers/browser-storage.js';

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('shared browser storage shim', () => {
  it('replaces missing Storage methods and retains independent map operations', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {} });
    ensureBrowserStorage('localStorage');
    const storage = globalThis.localStorage;
    Reflect.apply(storage.setItem, storage, ['first', 42]);
    storage.setItem('second', 'value');
    expect(storage.length).toBe(2);
    expect(storage.getItem('first')).toBe('42');
    expect(storage.key(0)).toBe('first');
    expect(storage.key(2)).toBeNull();
    storage.removeItem('first');
    expect(storage.getItem('first')).toBeNull();
    storage.clear();
    expect(storage.length).toBe(0);
    ensureBrowserStorage('localStorage');
    expect(globalThis.localStorage).toBe(storage);
  });

  it('replaces a configurable getter that throws', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('unavailable'); } });
    expect(() => ensureBrowserStorage('localStorage')).not.toThrow();
    expect(globalThis.localStorage.getItem('missing')).toBeNull();
  });

  it('preserves usable native storage and probes without writing or clearing it', () => {
    const storage: Storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(() => null), length: 0 };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    ensureBrowserStorage('localStorage');
    expect(globalThis.localStorage).toBe(storage);
    expect(storage.getItem).toHaveBeenCalledWith('__storage_shim_probe__');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it('replaces a Storage implementation whose availability probe fails', () => {
    const storage = { getItem() { throw new Error('disabled'); }, setItem() {}, removeItem() {}, clear() {}, key() {} };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    ensureBrowserStorage('localStorage');
    expect(globalThis.localStorage).not.toBe(storage);
    expect(globalThis.localStorage.getItem('missing')).toBeNull();
  });
});
