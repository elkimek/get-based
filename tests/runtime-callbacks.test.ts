import { describe, expect, it, vi } from 'vitest';
import { configureRuntimeCallbacks } from '../js/runtime-callbacks.js';

interface Callbacks {
  close: (() => void) | null;
  navigate: ((route: string) => void) | null;
}

describe('runtime callback configuration', () => {
  it('preserves omitted slots and returns independent snapshots that restore callbacks', () => {
    const close = vi.fn(), navigate = vi.fn(), replacement = vi.fn();
    const callbacks: Callbacks = { close, navigate };
    const previous = configureRuntimeCallbacks(callbacks, { close: replacement });
    expect(callbacks).toEqual({ close: replacement, navigate });
    expect(previous).toEqual({ close, navigate });
    configureRuntimeCallbacks(callbacks, previous);
    callbacks.navigate?.('dashboard');
    expect(navigate).toHaveBeenCalledWith('dashboard');
    expect(callbacks.close).toBe(close);
  });

  it('ignores inherited and unknown properties and clears explicitly invalid callbacks', () => {
    const close = vi.fn(), navigate = vi.fn();
    const callbacks: Callbacks = { close, navigate };
    const inherited = Object.create({ close: null });
    inherited.navigate = null;
    inherited.unknown = vi.fn();
    configureRuntimeCallbacks(callbacks, inherited);
    expect(callbacks).toEqual({ close, navigate: null });
    // Configuration remains defensive when a runtime caller supplies corrupt values.
    configureRuntimeCallbacks(callbacks, JSON.parse('{"close":42}'));
    expect(callbacks).toEqual({ close: null, navigate: null });
  });

  it('retains the original validation-then-assignment order for getters', () => {
    const callbacks: Callbacks = { close: null, navigate: null };
    const first = vi.fn(), second = vi.fn();
    let reads = 0;
    const updates = Object.defineProperty({}, 'close', {
      get: () => ++reads === 1 ? first : second,
      enumerable: true,
    });
    configureRuntimeCallbacks(callbacks, updates);
    expect(reads).toBe(2);
    expect(callbacks.close).toBe(second);
  });
});
