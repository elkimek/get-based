import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addUtilsRuntimeListener,
  callUtilsRuntimeFunction,
  dispatchUtilsRuntimeEvent,
  getAppVersionRuntime,
  getUtilsElementStyleRuntime,
  getUtilsRuntimeFunction,
  getUtilsRuntimeHostname,
  getUtilsRuntimeValue,
  hasUtilsRuntime,
  openUtilsRuntimeWindow,
  removeUtilsRuntimeListener,
  registerUtilsRuntimeExports,
  scheduleUtilsAfterNextPaint,
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
  vi.useRealTimers();
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

  it('delegates hostname reads named runtime values and named runtime function calls', () => {
    const openSettingsModal = vi.fn(section => `opened:${section}`);
    const mammoth = { extractRawText: vi.fn() };
    setRuntimeWindow({
      location: { hostname: 'localhost' },
      mammoth,
      openSettingsModal,
    });

    expect(getUtilsRuntimeHostname()).toBe('localhost');
    expect(getUtilsRuntimeValue('mammoth')).toBe(mammoth);
    expect(getUtilsRuntimeFunction('openSettingsModal')?.('data')).toBe('opened:data');
    expect(callUtilsRuntimeFunction('openSettingsModal', 'data')).toBe('opened:data');
    expect(openSettingsModal).toHaveBeenCalledTimes(2);
    expect(openSettingsModal).toHaveBeenCalledWith('data');
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

  it('schedules callbacks after the next paint when requestAnimationFrame is available', () => {
    vi.useFakeTimers();
    const requestAnimationFrame = vi.fn(callback => {
      callback();
      return 1;
    });
    const callback = vi.fn();
    setRuntimeWindow({ requestAnimationFrame });

    expect(scheduleUtilsAfterNextPaint(callback)).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer when requestAnimationFrame is unavailable', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    setRuntimeWindow({});

    expect(scheduleUtilsAfterNextPaint(callback)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('uses safe fallbacks when browser runtime hooks are missing', () => {
    delete globalThis.window;

    expect(hasUtilsRuntime()).toBe(false);
    expect(getAppVersionRuntime('fallback-version')).toBe('fallback-version');
    expect(getUtilsRuntimeHostname('fallback-host')).toBe('fallback-host');
    expect(getUtilsRuntimeValue('mammoth', 'fallback-value')).toBe('fallback-value');
    expect(getUtilsRuntimeFunction('openExample')).toBeNull();
    expect(registerUtilsRuntimeExports({ openExample: () => 'ok' })).toBe(false);
    expect(callUtilsRuntimeFunction('openExample')).toBeUndefined();
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
