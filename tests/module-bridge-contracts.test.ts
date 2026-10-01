import { describe, expect, it } from 'vitest';
import { configureModuleBridge, getModuleBridgeFunction } from '../js/runtime-callbacks.js';
import { configureSettingsModuleBridge, getSettingsModuleFunction } from '../js/settings-runtime-bridge.js';
import { configureDnaModuleBridge, getDnaModuleFunction, getDnaModuleValue } from '../js/dna-runtime-bridge.js';

describe('live module bridge contracts', () => {
  it('snapshots own callbacks and new null slots while retaining ordinary snapshot prototypes', () => {
    const original = () => 'original';
    const replacement = () => 'replacement';
    const bridge: Record<string, unknown> = Object.assign(Object.create(null), { present: original });
    const previous = configureModuleBridge(bridge, { present: replacement, added: replacement, ignored: 42 });
    expect(previous).toEqual({ present: original, added: null, ignored: null });
    expect(Object.getPrototypeOf(previous)).toBe(Object.prototype);
    expect(bridge).toEqual({ present: replacement, added: replacement });
    configureModuleBridge(bridge, previous);
    expect(bridge).toEqual({ present: original });
  });

  it('reads every update getter before changing any slot', () => {
    const original = () => 'original';
    const bridge: Record<string, unknown> = Object.assign(Object.create(null), { first: original });
    const error = new Error('read failed');
    expect(() => configureModuleBridge(bridge, {
      first: () => 'replacement',
      get second() { throw error; },
    })).toThrow(error);
    expect(bridge).toEqual({ first: original });
  });

  it('keeps raw undefined and falsy values separately from null deletion', () => {
    const bridge: Record<string, unknown> = Object.assign(Object.create(null), { removed: true });
    configureModuleBridge(bridge, { removed: null, unset: undefined, zero: 0, empty: '', no: false }, 'values');
    expect(bridge).toEqual({ unset: undefined, zero: 0, empty: '', no: false });
    expect(Object.hasOwn(bridge, 'unset')).toBe(true);
    expect(Object.hasOwn(bridge, 'removed')).toBe(false);
  });

  it('preserves callable key coercion twice and receiver identity', () => {
    const first = () => 'first';
    const second = function(this: unknown) { return this; };
    let reads = 0;
    const key = { [Symbol.toPrimitive]() { return ++reads === 1 ? 'first' : 'second'; } };
    const callable = getModuleBridgeFunction({ first, second }, key as unknown as string);
    expect(callable).toBe(second);
    expect(reads).toBe(2);
    const receiver = {};
    expect(callable?.call(receiver)).toBe(receiver);
  });

  it('retains the original inherited-key snapshot rule without changing bridge prototypes', () => {
    const bridge: Record<string, unknown> = Object.create(null);
    const callable = () => 'constructor';
    const previous = configureModuleBridge(bridge, { constructor: callable });
    expect(Object.hasOwn(previous, 'constructor')).toBe(false);
    expect(Object.getPrototypeOf(bridge)).toBeNull();
    expect(getModuleBridgeFunction(bridge, 'constructor')).toBe(callable);
  });
});

it('isolates feature bridges and preserves DNA single-read lookup and present undefined values', () => {
  const key = '__module_bridge_contract_test__';
  const callback = () => 'DNA';
  const dnaPrevious = configureDnaModuleBridge({ [key]: callback, [`${key}value`]: undefined });
  const settingsPrevious = configureSettingsModuleBridge({ [key]: () => 'Settings' });
  try {
    let reads = 0;
    const coercedKey = { [Symbol.toPrimitive]() { reads++; return key; } };
    expect(getDnaModuleFunction(coercedKey as unknown as string)).toBe(callback);
    expect(reads).toBe(1);
    expect(getSettingsModuleFunction(key)?.()).toBe('Settings');
    expect(getDnaModuleValue(`${key}value`, 'fallback')).toBeUndefined();
    const fallback = {};
    expect(getDnaModuleValue(`${key}missing`, fallback)).toBe(fallback);
  } finally {
    configureDnaModuleBridge(dnaPrevious);
    configureSettingsModuleBridge(settingsPrevious);
  }
});
