import { expect, it } from 'vitest';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import {
  configureCategoryCustomizationRuntimeDeps,
  getCategoryCustomizationBuildSidebar,
  getCategoryCustomizationViewportSize,
  navigateCategoryCustomizationRuntime,
  showCategoryCustomizationPrompt,
} from '../js/category-customization-runtime.js';

it('retains category-customization-runtime adapter behavior', async () => {
  const originalCategoryCustomizationRuntimeDeps = configureCategoryCustomizationRuntimeDeps();

  const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

  console.log('=== Category Customization Runtime Tests ===\n');

  const runtimeKeys = [
    'window',
    'innerWidth',
    'innerHeight',
  ];

  const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

  try {
    const calls: unknown[][] = [];
    const browserRuntime: {
      innerWidth?: number; innerHeight?: number;
      navigate?: (route: string, data?: unknown) => void;
      buildSidebar?: (data?: unknown) => void;
      showPromptDialog: (message: string, options?: import('../js/utils.js').PromptDialogOptions) => Promise<string>;
    } = {
      innerWidth: 812,
      innerHeight: 640,
      navigate(route, data) {
        calls.push(['navigate', route, (data as { category?: unknown } | undefined)?.category]);
      },
      buildSidebar(data) {
        calls.push(['buildSidebar', (data as { category?: unknown } | undefined)?.category, this === browserRuntime]);
      },
      async showPromptDialog(message, options) {
        calls.push(['prompt', message, options?.defaultValue, this === browserRuntime]);
        return '  renamed  ';
      },
    };
    setRuntimeValue('window', browserRuntime);
    configureCategoryCustomizationRuntimeDeps({
      buildSidebar: browserRuntime.buildSidebar!.bind(browserRuntime),
      navigate: browserRuntime.navigate!.bind(browserRuntime),
      showPromptDialog: browserRuntime.showPromptDialog.bind(browserRuntime),
    });

    navigateCategoryCustomizationRuntime('lipids', { category: 'lipids' });
    assert('navigateCategoryCustomizationRuntime delegates to browser navigate',
      calls.some(call => call[0] === 'navigate' && call[1] === 'lipids' && call[2] === 'lipids'));

    getCategoryCustomizationBuildSidebar()?.({ category: 'minerals' });
    assert('getCategoryCustomizationBuildSidebar returns a bound runtime callback',
      calls.some(call => call[0] === 'buildSidebar' && call[1] === 'minerals' && call[2] === true));

    const promptResult = await showCategoryCustomizationPrompt('Rename marker:', {
      defaultValue: 'ApoB',
      okLabel: 'Rename',
    });
    assert('showCategoryCustomizationPrompt delegates and returns prompt value',
      promptResult === '  renamed  '
        && calls.some(call => call[0] === 'prompt' && call[1] === 'Rename marker:' && call[2] === 'ApoB' && call[3] === true));

    const viewport = getCategoryCustomizationViewportSize();
    assert('getCategoryCustomizationViewportSize reads browser dimensions',
      viewport.width === 812 && viewport.height === 640);

    delete browserRuntime.navigate;
    delete browserRuntime.buildSidebar;
    configureCategoryCustomizationRuntimeDeps({
      buildSidebar: null,
      navigate: null,
      showPromptDialog: null,
    });
    delete browserRuntime.innerWidth;
    delete browserRuntime.innerHeight;
    const beforeMissingCalls = calls.length;
    navigateCategoryCustomizationRuntime('missing');
    assert('runtime hooks no-op when browser callbacks are missing',
      getCategoryCustomizationBuildSidebar() === null
        && await showCategoryCustomizationPrompt('Missing callback') === undefined
        && calls.length === beforeMissingCalls);
    const fallbackViewport = getCategoryCustomizationViewportSize();
    assert('viewport helper falls back when dimensions are missing',
      fallbackViewport.width === 1024 && fallbackViewport.height === 768);

    delete (globalThis as { window?: unknown }).window;
    const beforeNoWindowCalls = calls.length;
    navigateCategoryCustomizationRuntime('dashboard');
    assert('runtime callbacks stay no-op when window is missing', calls.length === beforeNoWindowCalls);
  } finally {
    configureCategoryCustomizationRuntimeDeps(originalCategoryCustomizationRuntimeDeps);
    restoreRuntime();
  }

  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  try {
    delete (globalThis as { window?: unknown }).window;
    const probeUrl = '../js/category-customization-runtime.js?no-window-probe';
    await import(probeUrl);
    assert('category customization runtime imports without a browser window', true);
  } catch (error) {
    assert('category customization runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);

  expect(legacyAssertions.fail).toBe(0);
});
