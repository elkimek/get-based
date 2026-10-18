import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {configureSettingsModuleBridge, switchSettingsAIProvider} from '../js/settings-runtime-bridge.js';

beforeEach(() => {configureSettingsModuleBridge({switchAIProvider: null});});
afterEach(() => {configureSettingsModuleBridge({switchAIProvider: null});});

it('does not load or invoke a provider owner before Settings registers one', () => {
  expect(switchSettingsAIProvider('venice')).toBeUndefined();
});

it('forwards the original value in the same turn and preserves the public void return', () => {
  const calls: unknown[] = [], value = {provider: 'custom'};
  configureSettingsModuleBridge({switchAIProvider: (provider: unknown) => {calls.push(provider); return 'private result';}});
  const result = switchSettingsAIProvider(value);
  expect(calls).toEqual([value]); expect(calls[0]).toBe(value);
  expect(result).toBeUndefined();
});

it('uses the latest registered owner and stops immediately when its slot is removed', () => {
  const previous = vi.fn(), latest = vi.fn();
  configureSettingsModuleBridge({switchAIProvider: previous});
  switchSettingsAIProvider('openrouter');
  configureSettingsModuleBridge({switchAIProvider: latest});
  switchSettingsAIProvider('venice');
  configureSettingsModuleBridge({switchAIProvider: null});
  switchSettingsAIProvider('custom');
  expect(previous).toHaveBeenCalledExactlyOnceWith('openrouter');
  expect(latest).toHaveBeenCalledExactlyOnceWith('venice');
});

it('propagates a synchronous owner failure unchanged rather than hiding it in a promise', () => {
  const failure = new Error('controlled owner failure');
  configureSettingsModuleBridge({switchAIProvider: () => {throw failure;}});
  let caught: unknown;
  try {switchSettingsAIProvider('venice');} catch (error) {caught = error;}
  expect(caught).toBe(failure);
});
