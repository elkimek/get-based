import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  addTouchTooltipWindowListenersRuntime,
  getTouchTooltipViewportRuntime,
  hasTouchTooltipRuntime,
  isTouchTooltipTouchRuntime,
} from '../js/touch-tooltip-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
});

describe('touch tooltip runtime adapter', () => {
  it('delegates media queries viewport reads and window listeners', () => {
    const addEventListener = vi.fn();
    const matchMedia = vi.fn(query => ({
      matches: query === '(pointer: coarse)',
      media: query,
    }));
    const onScroll = vi.fn();
    const onResize = vi.fn();
    setRuntimeWindow({
      innerWidth: 360,
      innerHeight: 640,
      matchMedia,
      addEventListener,
    });

    expect(hasTouchTooltipRuntime()).toBe(true);
    expect(isTouchTooltipTouchRuntime()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(hover: none)');
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
    expect(getTouchTooltipViewportRuntime()).toEqual({ width: 360, height: 640 });
    expect(addTouchTooltipWindowListenersRuntime({ onScroll, onResize })).toBe(true);
    expect(addEventListener).toHaveBeenCalledWith('scroll', onScroll, true);
    expect(addEventListener).toHaveBeenCalledWith('resize', onResize);
  });

  it('uses safe fallbacks when browser runtime hooks are unavailable', () => {
    delete globalThis.window;

    expect(hasTouchTooltipRuntime()).toBe(false);
    expect(isTouchTooltipTouchRuntime()).toBe(false);
    expect(getTouchTooltipViewportRuntime()).toEqual({ width: 1024, height: 768 });
    expect(addTouchTooltipWindowListenersRuntime({ onScroll: vi.fn(), onResize: vi.fn() })).toBe(false);
  });

  it('keeps touch-tooltip.js browser globals behind the adapter', () => {
    const tooltipSrc = readFileSync(new URL('../js/touch-tooltip.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(tooltipSrc).toContain("from './touch-tooltip-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(tooltipSrc)).toBe(false);
    expect(swSrc).toContain("'/js/touch-tooltip-runtime.js'");
  });
});
