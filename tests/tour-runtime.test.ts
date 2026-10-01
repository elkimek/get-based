import { expect, it } from 'vitest';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import {
  configureTourRuntimeDeps,
  getTourComputedStyle,
  getTourViewportSize,
  openTourChatPanel,
  scheduleTourTask,
} from '../js/tour-runtime.js';

it('retains tour-runtime adapter behavior', async () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

  console.log('=== Tour Runtime Tests ===');

  const runtimeKeys = ['window'];

  const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

  try {
    const calls: unknown[][] = [];
    const previousTourDeps = configureTourRuntimeDeps({
      openChatPanel: () => calls.push(['chat']),
    });
    const target = { id: 'tour-target' };
    const browserRuntime: {
      innerWidth?: number | undefined; innerHeight: number;
      getComputedStyle?: (element: Element) => { display: string; visibility: string; opacity: string };
      setTimeout: (callback: () => void, delay: number) => number;
    } = {
      innerWidth: 390,
      innerHeight: 844,
      getComputedStyle(element) {
        calls.push(['style', element?.id, this === browserRuntime]);
        return { display: 'block', visibility: 'visible', opacity: '1' };
      },
      setTimeout(callback, delay) {
        calls.push(['timeout', delay, this === browserRuntime]);
        callback();
        return 99;
      },
    };
    setRuntimeValue('window', browserRuntime);

    const viewport = getTourViewportSize();
    const style = getTourComputedStyle(target as unknown as Element);
    openTourChatPanel();
    const taskId = scheduleTourTask(() => calls.push(['task']), 250);

    assert('getTourViewportSize reads browser viewport dimensions',
      viewport.width === 390 && viewport.height === 844);
    assert('getTourComputedStyle delegates style reads with browser binding',
      style.display === 'block' &&
        calls.some(call => call[0] === 'style' && call[1] === 'tour-target' && call[2] === true));
    assert('openTourChatPanel delegates chat opening through configured dependency',
      calls.some(call => call[0] === 'chat'));
    assert('scheduleTourTask delegates timers with browser binding',
      taskId === 99 &&
        calls.some(call => call[0] === 'timeout' && call[1] === 250 && call[2] === true) &&
        calls.some(call => call[0] === 'task'));

    browserRuntime.innerWidth = undefined;
    browserRuntime.innerHeight = NaN;
    delete browserRuntime.getComputedStyle;
    configureTourRuntimeDeps({ openChatPanel: null });
    const fallbackViewport = getTourViewportSize();
    const fallbackStyle = getTourComputedStyle(target as unknown as Element);
    const beforeMissingChat = calls.length;
    openTourChatPanel();

    assert('tour viewport helper falls back when browser dimensions are invalid',
      fallbackViewport.width === 1024 && fallbackViewport.height === 768);
    assert('tour style helper returns visible defaults when computed styles are unavailable',
      fallbackStyle.display === '' && fallbackStyle.visibility === '' && fallbackStyle.opacity === '');
    assert('tour chat hook no-ops when callback is missing',
      calls.length === beforeMissingChat);
    assert('tour style helper treats missing elements as hidden',
      getTourComputedStyle(null).display === 'none');

    delete (globalThis as { window?: unknown }).window;
    const noWindowViewport = getTourViewportSize();
    const noWindowStyle = getTourComputedStyle(target as unknown as Element);
    assert('tour runtime adapter handles missing browser window',
      noWindowViewport.width === 1024 &&
        noWindowViewport.height === 768 &&
        noWindowStyle.display === '');
    configureTourRuntimeDeps(previousTourDeps);
  } finally {
    restoreRuntime();
  }

  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  try {
    delete (globalThis as { window?: unknown }).window;
    const probeUrl = '../js/tour-runtime.js?no-window-probe';
    await import(probeUrl);
    assert('tour runtime imports without a browser window', true);
  } catch (error) {
    assert('tour runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);

  expect(legacyAssertions.fail).toBe(0);
});
