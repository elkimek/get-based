import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { dispatchRuntimeCustomEvent } from '../js/utils-runtime.js';

it('dispatches with the original constructor lookup order, receiver and detail identity', () => {
  const trace: string[] = [];
  const detail = { theme: 'glass' };
  const target = {
    get CustomEvent() {
      trace.push('constructor lookup');
      return class {
        constructor(publicType: string, init: CustomEventInit) {
          trace.push(publicType);
          expect(init.detail).toBe(detail);
        }
      } as unknown as typeof CustomEvent;
    },
    get dispatchEvent() {
      trace.push('dispatch lookup');
      return function (this: unknown, _event: Event) {
        expect(this).toBe(target);
        trace.push('dispatch');
        return true;
      };
    },
  };
  dispatchRuntimeCustomEvent(target, 'labcharts-themechange', detail);
  expect(trace).toEqual(['constructor lookup', 'dispatch lookup', 'labcharts-themechange', 'dispatch']);
});

it('does not read dispatch when the event constructor is unavailable', () => {
  dispatchRuntimeCustomEvent({
    get dispatchEvent(): (event: Event) => boolean { throw new Error('dispatch must remain unread'); },
  }, 'labcharts-themechange', {});
  dispatchRuntimeCustomEvent(null, 'labcharts-themechange', {});
});

it('retains the original missing-dispatch exception when a constructor is available', () => {
  const target = { CustomEvent: class {} } as unknown as Parameters<typeof dispatchRuntimeCustomEvent>[0];
  expect(() => dispatchRuntimeCustomEvent(target, 'labcharts-themechange', {})).toThrow(TypeError);
});

it('runs early theme paint as a blocking classic script with original non-strict writes', () => {
  class Meta { content = ''; }
  const meta = new Meta();
  const style = Object.defineProperty({ colorScheme: 'host-control' }, 'colorScheme', { value: 'host-control', writable: false });
  const root = { dataset: {} as Record<string, string>, style };
  const context = {
    localStorage: { getItem: (key: string) => key === 'labcharts-theme' ? 'light' : null },
    document: { documentElement: root, querySelectorAll: () => [meta] },
    HTMLMetaElement: Meta,
  };
  const source = readFileSync(new URL('../js/theme-bootstrap.js', import.meta.url), 'utf8');
  expect(() => vm.runInNewContext(source, context)).not.toThrow();
  expect(root.dataset.theme).toBe('light');
  expect(style.colorScheme).toBe('host-control');
  expect(meta.content).toBe('#ffffff');
});

it('keeps the dark startup paint available when browser storage throws', () => {
  class Meta { content = ''; }
  const meta = new Meta();
  const root = { dataset: { theme: 'old' } as Record<string, string>, style: { colorScheme: '' } };
  vm.runInNewContext(readFileSync(new URL('../js/theme-bootstrap.js', import.meta.url), 'utf8'), {
    localStorage: { getItem: () => { throw new Error('storage unavailable'); } },
    document: { documentElement: root, querySelectorAll: () => [meta] },
    HTMLMetaElement: Meta,
  });
  expect(root.dataset.theme).toBeUndefined();
  expect(root.style.colorScheme).toBe('dark');
  expect(meta.content).toBe('#0a0a12');
});
