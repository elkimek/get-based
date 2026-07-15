import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchAIVerdictUpdatedRuntime,
  getAIVerdictConcurrencyCapRuntime,
  hasAIVerdictRuntime,
  isAIVerdictEngineDisabledRuntime,
  refreshSunSurfacesRuntime,
} from '../js/ai-verdict-engine-runtime.js';

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

describe('ai verdict engine runtime adapter', () => {
  it('reads feature flag and concurrency cap from the browser runtime', () => {
    setRuntimeWindow({ DISABLE_AI_VERDICTS: true, _aiConcurrencyCap: 5 });

    expect(hasAIVerdictRuntime()).toBe(true);
    expect(isAIVerdictEngineDisabledRuntime()).toBe(true);
    expect(getAIVerdictConcurrencyCapRuntime(2)).toBe(5);
  });

  it('delegates refresh plus update events', () => {
    const refreshSunSurfaces = vi.fn();
    const dispatchEvent = vi.fn();
    class TestCustomEvent {
      constructor(type) {
        this.type = type;
      }
    }
    const runtime = {
      _refreshSunSurfaces: refreshSunSurfaces,
      CustomEvent: TestCustomEvent,
      dispatchEvent,
    };
    setRuntimeWindow(runtime);

    expect(refreshSunSurfacesRuntime('[data-id="session-1"]')).toBe(true);
    expect(dispatchAIVerdictUpdatedRuntime()).toBe(true);
    expect(refreshSunSurfaces).toHaveBeenCalledWith('[data-id="session-1"]');
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'labcharts-ai-verdict-updated' }));
  });

  it('uses safe fallbacks when browser runtime hooks are missing', () => {
    delete globalThis.window;

    expect(hasAIVerdictRuntime()).toBe(false);
    expect(isAIVerdictEngineDisabledRuntime()).toBe(false);
    expect(getAIVerdictConcurrencyCapRuntime(2)).toBe(2);
    expect(refreshSunSurfacesRuntime(null)).toBe(false);
    expect(dispatchAIVerdictUpdatedRuntime()).toBe(false);
  });

  it('keeps counted ai verdict browser globals behind the adapter', () => {
    const engineSrc = readFileSync(new URL('../js/ai-verdict-engine.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(engineSrc).toContain("from './ai-verdict-engine-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(engineSrc)).toBe(false);
    expect(swSrc).toContain("'/js/ai-verdict-engine-runtime.js'");
  });
});
