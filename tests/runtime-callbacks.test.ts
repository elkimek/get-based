import { describe, expect, it, vi } from 'vitest';
import { configureRuntimeCallbacks, configureRuntimeDependencies } from '../js/runtime-callbacks.js';

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

it('accepts inherited slots only when the adapter requests inherited-key configuration', () => {
  const close = vi.fn(), navigate = vi.fn(), replacement = vi.fn();
  const updates: Partial<Callbacks> = Object.create({ close: replacement, navigate: null });
  Object.defineProperty(updates, 'unknown', { get: () => { throw new Error('unknown callback read'); } });
  const callbacks: Callbacks = { close, navigate };
  const previous = configureRuntimeCallbacks(callbacks, updates, 'inherited');
  expect(callbacks).toEqual({ close: replacement, navigate: null });
  configureRuntimeCallbacks(callbacks, previous, 'inherited');
  expect(callbacks).toEqual({ close, navigate });
});

it.each(['own', 'inherited'] as const)('retains %s property checks and validation reads for proxy updates', scope => {
  const close = vi.fn(), trace: string[] = [];
  const callbacks: Callbacks = { close: null, navigate: null };
  const updates = new Proxy({ close }, {
    has(target, key) { trace.push(`has:${String(key)}`); return Reflect.has(target, key); },
    getOwnPropertyDescriptor(target, key) { trace.push(`own:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
    get(target, key, receiver) { trace.push(`get:${String(key)}`); return Reflect.get(target, key, receiver); },
  });
  configureRuntimeCallbacks(callbacks, updates, scope);
  expect(trace).toEqual([`${scope === 'own' ? 'own' : 'has'}:close`, 'get:close', 'get:close', `${scope === 'own' ? 'own' : 'has'}:navigate`]);
  expect(callbacks.close).toBe(close);
});

it.each(['own', 'inherited'] as const)('preserves preceding %s updates when a later getter throws', scope => {
  const close = vi.fn(), navigate = vi.fn(), replacement = vi.fn();
  const callbacks: Callbacks = { close, navigate };
  const updates = Object.defineProperty({ close: replacement }, 'navigate', {
    get: () => { throw new Error('callback getter failure'); },
  });
  expect(() => configureRuntimeCallbacks(callbacks, updates, scope)).toThrow('callback getter failure');
  expect(callbacks).toEqual({ close: replacement, navigate });
});

it.each(['own', 'inherited'] as const)('handles nonenumerable %s slots and explicitly invalid runtime values', scope => {
  const close = vi.fn(), navigate = vi.fn();
  const callbacks: Callbacks = { close, navigate };
  configureRuntimeCallbacks(callbacks, Object.defineProperty({}, 'close', { value: null }), scope);
  expect(callbacks).toEqual({ close: null, navigate });
  configureRuntimeCallbacks(callbacks, JSON.parse('{"navigate":false}'), scope);
  expect(callbacks).toEqual({ close: null, navigate: null });
});


it('keeps required defaults while nullable hooks clear invalid inherited overrides', () => {
  const close = vi.fn(), required = vi.fn(), replacement = vi.fn();
  const callbacks: { close: (() => void) | null; required: () => void } = { close, required };
  const updates = Object.create({ close: false, required: null, unknown: replacement });
  const previous = configureRuntimeDependencies(callbacks, updates, ['close']);
  expect(callbacks).toEqual({ close: null, required });
  expect(previous).toEqual({ close, required });
  configureRuntimeDependencies(callbacks, previous, ['close']);
  expect(callbacks).toEqual({ close, required });
  configureRuntimeDependencies(callbacks, { required: replacement }, ['close']);
  expect(callbacks).toEqual({ close, required: replacement });
});

it('preserves mixed hook validation reads and declaration order with proxy overrides', () => {
  const close = vi.fn(), first = vi.fn(), second = vi.fn(), trace: string[] = [];
  const callbacks = { close, required: first };
  let reads = 0;
  const updates = new Proxy({ close, get required() { return ++reads === 1 ? first : second; } }, {
    has(target, key) { trace.push(`has:${String(key)}`); return Reflect.has(target, key); },
    get(target, key, receiver) { trace.push(`get:${String(key)}`); return Reflect.get(target, key, receiver); },
  });
  configureRuntimeDependencies(callbacks, updates, ['close']);
  expect(trace).toEqual(['has:close', 'get:close', 'get:close', 'get:required', 'get:required']);
  expect(callbacks.required).toBe(second);
});

it('keeps preceding mixed hook updates when a later getter throws', () => {
  const close = vi.fn(), required = vi.fn(), replacement = vi.fn();
  const callbacks = { close, required };
  const updates = Object.defineProperty({ close: replacement }, 'required', {
    get: () => { throw new Error('required hook getter failure'); },
  });
  expect(() => configureRuntimeDependencies(callbacks, updates, ['close'])).toThrow('required hook getter failure');
  expect(callbacks).toEqual({ close: replacement, required });
});
