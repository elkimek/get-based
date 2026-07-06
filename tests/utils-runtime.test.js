import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addUtilsRuntimeListener,
  getUtilsElementStyleRuntime,
  hasUtilsRuntime,
  removeUtilsRuntimeListener,
} from '../js/utils-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  if (savedWindow) {
    Object.defineProperty(globalThis, 'window', savedWindow);
  } else {
    delete globalThis.window;
  }
});

describe('utils runtime adapter', () => {
  it('delegates event listeners and computed style to the browser runtime', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const style = { display: 'block', visibility: 'visible', opacity: '1' };
    const getComputedStyle = vi.fn(() => style);
    const el = { id: 'nudge' };
    const listener = vi.fn();
    setRuntimeWindow({ addEventListener, removeEventListener, getComputedStyle });

    expect(hasUtilsRuntime()).toBe(true);
    expect(addUtilsRuntimeListener('labcharts-sync-applied', listener)).toBe(true);
    expect(removeUtilsRuntimeListener('labcharts-sync-applied', listener)).toBe(true);
    expect(getUtilsElementStyleRuntime(el)).toBe(style);
    expect(addEventListener).toHaveBeenCalledWith('labcharts-sync-applied', listener, undefined);
    expect(removeEventListener).toHaveBeenCalledWith('labcharts-sync-applied', listener, undefined);
    expect(getComputedStyle).toHaveBeenCalledWith(el);
  });

  it('uses safe fallbacks when browser runtime hooks are missing', () => {
    delete globalThis.window;

    expect(hasUtilsRuntime()).toBe(false);
    expect(addUtilsRuntimeListener('labcharts-sync-applied', vi.fn())).toBe(false);
    expect(removeUtilsRuntimeListener('labcharts-sync-applied', vi.fn())).toBe(false);
    expect(getUtilsElementStyleRuntime({})).toBeNull();
  });

  it('keeps counted utils.js browser globals behind the adapter', () => {
    const utilsSrc = readFileSync(new URL('../js/utils.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(utilsSrc).toContain("from './utils-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(utilsSrc)).toBe(false);
    expect(swSrc).toContain("'/js/utils-runtime.js'");
  });
});
