#!/usr/bin/env node
// test-onboarding-view-runtime.js - Dashboard onboarding runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  configureOnboardingViewRuntimeDeps,
  createOnboardingChatThreadRuntime,
  navigateOnboardingRuntime,
  openOnboardingChatPanelRuntime,
  openOnboardingProviderChatRuntime,
  rebuildOnboardingSidebarRuntime,
  renderOnboardingChatMessagesRuntime,
} from '../js/onboarding-view-runtime.js';
import { configureViewRuntime } from '../js/views-runtime-bridge.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Onboarding View Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'navigate',
  'openChatPanel',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function setRuntimeValue(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreRuntime() {
  for (const key of runtimeKeys) {
    const descriptor = savedDescriptors.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

try {
  const calls = [];
  let previousViewRuntime = null;
  const previousDeps = configureOnboardingViewRuntimeDeps({
    createNewThread: () => calls.push(['createNewThread']),
    toggleChatPanel: () => calls.push(['toggleChatPanel']),
  });
  const previousChatRuntime = configureChatRuntimeCallbacks({
    renderChatMessages: () => calls.push(['renderChatMessages']),
  });
  setRuntimeValue('window', globalThis);
  previousViewRuntime = configureViewRuntime({
    buildSidebar: data => calls.push(['buildSidebar', data?.id]),
  });
  setRuntimeValue('navigate', (route, data) => calls.push(['navigate', route, data?.id]));
  setRuntimeValue('openChatPanel', () => {
    calls.push(['openChatPanel']);
    return 'opened';
  });
  rebuildOnboardingSidebarRuntime({ id: 'sidebar-data' });
  navigateOnboardingRuntime('labs', { id: 'fallback-data' });
  navigateOnboardingRuntime('dashboard', { id: 'preferred-data' }, (route, data) => calls.push(['preferredNavigate', route, data.id]));
  const openResult = await openOnboardingChatPanelRuntime();
  const providerOpened = openOnboardingProviderChatRuntime();
  const createdThread = createOnboardingChatThreadRuntime();
  renderOnboardingChatMessagesRuntime();

  assert('onboarding runtime delegates shell and chat hooks',
    openResult === 'opened' &&
      providerOpened === true &&
      createdThread === true &&
      calls.map(call => call.join('|')).join(',') === [
        'buildSidebar|sidebar-data',
        'navigate|labs|fallback-data',
        'preferredNavigate|dashboard|preferred-data',
        'openChatPanel',
        'openChatPanel',
        'createNewThread',
        'renderChatMessages',
      ].join(','));

  delete globalThis.openChatPanel;
  assert('onboarding provider chat falls back to toggle',
    openOnboardingProviderChatRuntime() === true &&
      calls.at(-1)?.join('|') === 'toggleChatPanel');

  configureOnboardingViewRuntimeDeps({ toggleChatPanel: null });
  assert('onboarding provider chat reports unavailable shell hooks',
    openOnboardingProviderChatRuntime() === false);

  configureOnboardingViewRuntimeDeps({ createNewThread: null });
  assert('onboarding runtime reports unavailable thread creation',
    createOnboardingChatThreadRuntime() === false);

  delete globalThis.window;
  configureViewRuntime({ buildSidebar: null });
  configureChatRuntimeCallbacks({ renderChatMessages: null });
  const beforeNoWindowCalls = calls.length;
  rebuildOnboardingSidebarRuntime({ id: 'ignored' });
  navigateOnboardingRuntime('labs', { id: 'ignored' });
  assert('onboarding runtime no-ops safely when window is missing',
    openOnboardingChatPanelRuntime() === null &&
      openOnboardingProviderChatRuntime() === false &&
      createOnboardingChatThreadRuntime() === false &&
      renderOnboardingChatMessagesRuntime() === undefined &&
      calls.length === beforeNoWindowCalls);

  configureOnboardingViewRuntimeDeps(previousDeps);
  configureChatRuntimeCallbacks(previousChatRuntime);
  configureViewRuntime({ buildSidebar: null, ...previousViewRuntime });

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const onboardingSrc = fs.readFileSync(path.join(root, 'js/onboarding-view.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert('onboarding view delegates browser globals through runtime adapter',
    onboardingSrc.includes("from './onboarding-view-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(onboardingSrc) &&
      swSrc.includes("'/js/onboarding-view-runtime.js'"));
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
