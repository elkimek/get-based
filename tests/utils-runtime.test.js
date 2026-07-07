import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addUtilsRuntimeListener,
  dispatchUtilsRuntimeEvent,
  getAppVersionRuntime,
  getUtilsElementStyleRuntime,
  hasUtilsRuntime,
  openUtilsRuntimeWindow,
  removeUtilsRuntimeListener,
  registerUtilsRuntimeExports,
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

  it('delegates app version reads and runtime export registration', () => {
    const runtime = { APP_VERSION: '1.2.3' };
    setRuntimeWindow(runtime);

    expect(getAppVersionRuntime()).toBe('1.2.3');
    expect(registerUtilsRuntimeExports({ openExample: () => 'ok' })).toBe(true);
    expect(runtime.openExample()).toBe('ok');
  });

  it('delegates runtime event dispatch and window opening', () => {
    const dispatchEvent = vi.fn();
    const open = vi.fn(() => ({ document: {} }));
    class CustomEventStub {
      constructor(name, options) {
        this.type = name;
        this.detail = options?.detail;
      }
    }
    setRuntimeWindow({ CustomEvent: CustomEventStub, dispatchEvent, open });

    expect(dispatchUtilsRuntimeEvent('demo-event', { ok: true })).toBe(true);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: 'demo-event', detail: { ok: true } });
    expect(openUtilsRuntimeWindow('/demo', '_blank')).toMatchObject({ document: {} });
    expect(open).toHaveBeenCalledWith('/demo', '_blank');
  });

  it('uses safe fallbacks when browser runtime hooks are missing', () => {
    delete globalThis.window;

    expect(hasUtilsRuntime()).toBe(false);
    expect(getAppVersionRuntime('fallback-version')).toBe('fallback-version');
    expect(registerUtilsRuntimeExports({ openExample: () => 'ok' })).toBe(false);
    expect(dispatchUtilsRuntimeEvent('demo-event')).toBe(false);
    expect(openUtilsRuntimeWindow('/demo')).toBeNull();
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
