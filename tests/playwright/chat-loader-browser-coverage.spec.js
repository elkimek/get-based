import { expect, test } from './coverage-fixture.js';

const chatLoaderUrl = () =>
  `/js/chat-loader.js?facadeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

const syntheticChatModule = `
  const record = (name, args = []) => {
    window.__chatFacadeCalls ||= [];
    window.__chatFacadeCalls.push([name, ...args]);
    return { name, args };
  };
  export function configureAppChatHooks(deps) {
    window.__chatFacadeConfigKeys = Object.keys(deps).sort();
  }
  export function openChatPanel(...args) { return record('openChatPanel', args); }
  export function toggleChatPanel(...args) { return record('toggleChatPanel', args); }
  export function createNewThread(...args) { return record('createNewThread', args); }
  export function createThreadProject(...args) { return record('createThreadProject', args); }
  export function clearChatHistory(...args) { return record('clearChatHistory', args); }
  export function filterThreadList(...args) { return record('filterThreadList', args); }
  export function sendChatMessage(...args) { return record('sendChatMessage', args); }
  export function setChatPersonality(...args) { return record('setChatPersonality', args); }
  export function setChatWebSearchEnabled(...args) { return record('setChatWebSearchEnabled', args); }
  export function startDiscussion(...args) { return record('startDiscussion', args); }
  export function summarizeThread(...args) { return record('summarizeThread', args); }
  export function setChatThreadSort(...args) { return record('setChatThreadSort', args); }
  export function toggleChatFullscreen(...args) { return record('toggleChatFullscreen', args); }
  export function togglePersonalityBar(...args) { return record('togglePersonalityBar', args); }
  export function toggleThreadRail(...args) { return record('toggleThreadRail', args); }
  export function useChatPrompt(...args) { return record('useChatPrompt', args); }
  export function askAIAboutCorrelations(...args) { return record('askAIAboutCorrelations', args); }
  export function askAIAboutMarker(...args) { return record('askAIAboutMarker', args); }
  export function closeChatPanel(...args) { return record('closeChatPanel', args); }
  export function closeSummaryModal(...args) { return record('closeSummaryModal', args); }
  export function isChatStreaming(...args) { record('isChatStreaming', args); return true; }
  export function ensureActiveThread(...args) { return record('ensureActiveThread', args); }
  export function loadChatHistory(...args) { return record('loadChatHistory', args); }
  export function loadChatThreads(...args) { return record('loadChatThreads', args); }
  export function renderThreadList(...args) { return record('renderThreadList', args); }
  export function updateChatContextStatus(...args) { return record('updateChatContextStatus', args); }
  export function updateChatHeaderModel(...args) { return record('updateChatHeaderModel', args); }
  export function onContextCardSaved(...args) { return record('onContextCardSaved', args); }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/chat-loader-facade-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="fixture"></div></body></html>',
  }));
  await page.goto('/chat-loader-facade-coverage');
});

test('Chat lazy facade preserves every public action before and after first load', async ({ page }) => {
  let implementationRequests = 0;
  await page.route('**/js/app-ai-interaction-modules.js*', route => {
    implementationRequests += 1;
    return route.fulfill({
      contentType: 'text/javascript',
      body: syntheticChatModule,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    const coldFallbacks = [
      loader.closeChatPanel(),
      loader.closeSummaryModal(),
      loader.isChatStreaming(),
      loader.ensureActiveThreadIfLoaded(),
      loader.loadChatHistoryIfLoaded(),
      loader.loadChatThreadsIfLoaded(),
      loader.renderThreadListIfLoaded(),
      loader.onContextCardSavedIfLoaded(),
      loader.updateChatContextStatusIfLoaded(),
      loader.updateChatHeaderModelIfLoaded(),
    ];

    loader.configureChatLoader({
      marker: 'configured',
      prepareLightSunContext: () => Promise.reject(new Error('optional Light context unavailable')),
      prepareHealthDataContext: () => ({ ready: true }),
    });
    const [first, second] = await Promise.all([
      loader.loadChatModule(),
      loader.loadChatModule(),
    ]);

    const lazyResults = await Promise.all([
      loader.openChatPanel('open'),
      loader.toggleChatPanel('toggle'),
      loader.createNewThread('thread'),
      loader.createThreadProject('project'),
      loader.clearChatHistory('history'),
      loader.filterThreadList('filter'),
      loader.sendChatMessage('send'),
      loader.setChatPersonality('analyst'),
      loader.setChatWebSearchEnabled(true),
      loader.startDiscussion('discussion'),
      loader.summarizeThread('summary'),
      loader.setChatThreadSort('name'),
      loader.toggleChatFullscreen('fullscreen'),
      loader.togglePersonalityBar('personality'),
      loader.toggleThreadRail('rail'),
      loader.useChatPrompt('prompt'),
      loader.askAIAboutCorrelations('correlations'),
      loader.askAIAboutMarker('marker'),
    ]);

    const loadedResults = [
      loader.closeChatPanel('close'),
      loader.closeSummaryModal('close-summary'),
      loader.isChatStreaming('streaming'),
      loader.ensureActiveThreadIfLoaded('ensure'),
      loader.loadChatHistoryIfLoaded('load-history'),
      loader.loadChatThreadsIfLoaded('load-threads'),
      loader.renderThreadListIfLoaded('render-threads'),
      loader.updateChatContextStatusIfLoaded('context-status'),
      loader.updateChatHeaderModelIfLoaded('header-model'),
      loader.onContextCardSavedIfLoaded('context-saved'),
    ];

    let enterPrevented = false;
    const ignoredKey = loader.handleChatKeydown({ key: 'Escape' });
    const ignoredShiftEnter = loader.handleChatKeydown({ key: 'Enter', shiftKey: true });
    const handledEnter = await loader.handleChatKeydown({
      key: 'Enter',
      shiftKey: false,
      preventDefault() { enterPrevented = true; },
    });

    return {
      startsCold: coldFallbacks.every(value => value === false),
      sharedModule: first === second,
      loaded: loader.isChatModuleLoaded(),
      configKeys: window.__chatFacadeConfigKeys,
      lazyResultNames: lazyResults.map(result => result.name),
      loadedResultNames: loadedResults.map(result => (
        typeof result === 'boolean' ? 'isChatStreaming' : result.name
      )),
      ignoredKey,
      ignoredShiftEnter,
      handledEnterName: handledEnter.name,
      enterPrevented,
      calls: window.__chatFacadeCalls,
    };
  }, chatLoaderUrl());

  expect(implementationRequests).toBe(1);
  expect(outcomes).toMatchObject({
    startsCold: true,
    sharedModule: true,
    loaded: true,
    configKeys: [
      'marker',
      'prepareHealthDataContext',
      'prepareLightSunContext',
    ],
    lazyResultNames: [
      'openChatPanel',
      'toggleChatPanel',
      'createNewThread',
      'createThreadProject',
      'clearChatHistory',
      'filterThreadList',
      'sendChatMessage',
      'setChatPersonality',
      'setChatWebSearchEnabled',
      'startDiscussion',
      'summarizeThread',
      'setChatThreadSort',
      'toggleChatFullscreen',
      'togglePersonalityBar',
      'toggleThreadRail',
      'useChatPrompt',
      'askAIAboutCorrelations',
      'askAIAboutMarker',
    ],
    loadedResultNames: [
      'closeChatPanel',
      'closeSummaryModal',
      'isChatStreaming',
      'ensureActiveThread',
      'loadChatHistory',
      'loadChatThreads',
      'renderThreadList',
      'updateChatContextStatus',
      'updateChatHeaderModel',
      'onContextCardSaved',
    ],
    ignoredKey: false,
    ignoredShiftEnter: false,
    handledEnterName: 'sendChatMessage',
    enterPrevented: true,
  });
  expect(outcomes.calls.map(call => call[0])).toContain('sendChatMessage');
});
