#!/usr/bin/env node
// test-context-card-lifestyle-runtime.js - Lifestyle context runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  closeLifestyleContextModalAndNavigateRuntime,
  closeLifestyleContextModalRuntime,
  configureContextCardLifestyleRuntimeDeps,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
  navigateLifestyleContextRuntime,
  openLightSetupFromLifestyleRuntime,
  returnToLifestyleContextModalRuntime,
  updateLifestyleChatHeaderModelRuntime,
} from '../js/context-card-lifestyle-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Context Card Lifestyle Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  '__lifestyleContextDelegatesBound',
  'setTimeout',
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
  const previousChatRuntime = configureChatRuntimeCallbacks({
    updateChatHeaderModel: () => calls.push(['chat-header']),
  });
  const previousContextCardsRuntime = configureContextCardsRuntimeCallbacks({
    openContextModal: () => calls.push(['context-modal']),
  });
  const previousLifestyleRuntime = configureContextCardLifestyleRuntimeDeps({
    closeModal: () => calls.push(['close']),
    navigate: category => calls.push(['navigate', category]),
    openChatPanel: () => calls.push(['chat-panel']),
    useChatPrompt: prompt => calls.push(['prompt', prompt]),
  });
  setRuntimeValue('window', globalThis);
  delete globalThis.__lifestyleContextDelegatesBound;
  setRuntimeValue('setTimeout', (fn, delay) => {
    calls.push(['timer', String(delay)]);
    fn();
    return 1;
  });

  const firstDelegateMark = markLifestyleContextDelegatesBoundRuntime();
  const secondDelegateMark = markLifestyleContextDelegatesBoundRuntime();
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime('dashboard');
  closeLifestyleContextModalAndNavigateRuntime('labs');
  updateLifestyleChatHeaderModelRuntime();
  openLightSetupFromLifestyleRuntime(() => calls.push(['sun-setup']));
  discussDietContaminantsRuntime();
  returnToLifestyleContextModalRuntime();

  assert('lifestyle runtime delegates shell hooks',
    firstDelegateMark === true &&
      secondDelegateMark === false &&
      calls.some(call => call.join('|') === 'close') &&
      calls.some(call => call.join('|') === 'navigate|dashboard') &&
      calls.some(call => call.join('|') === 'navigate|labs') &&
      calls.some(call => call.join('|') === 'chat-header') &&
      calls.some(call => call.join('|') === 'navigate|light') &&
      calls.some(call => call.join('|') === 'sun-setup') &&
      calls.some(call => call.join('|') === 'chat-panel') &&
      calls.some(call => call[0] === 'prompt' && call[1].includes('food contaminants')) &&
      calls.some(call => call.join('|') === 'context-modal'));
  assert('lifestyle runtime preserves delayed shell actions',
    calls.some(call => call.join('|') === 'timer|200') &&
      calls.some(call => call.join('|') === 'timer|300') &&
      calls.some(call => call.join('|') === 'timer|0'));

  configureContextCardsRuntimeCallbacks({ openContextModal: null });
  configureChatRuntimeCallbacks({ updateChatHeaderModel: null });
  configureContextCardLifestyleRuntimeDeps({
    closeModal: null,
    navigate: null,
    openChatPanel: null,
    useChatPrompt: null,
  });
  delete globalThis.window;
  const shellCallCount = calls.filter(call => call[0] !== 'timer').length;
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime('dashboard');
  closeLifestyleContextModalAndNavigateRuntime('labs');
  updateLifestyleChatHeaderModelRuntime();
  openLightSetupFromLifestyleRuntime();
  discussDietContaminantsRuntime();
  returnToLifestyleContextModalRuntime();
  assert('lifestyle runtime no-ops safely when window is missing',
    calls.filter(call => call[0] !== 'timer').length === shellCallCount);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const editorSrc = fs.readFileSync(path.join(root, 'js/context-card-lifestyle-editors-impl.js'), 'utf8');
  const runtimeSrc = fs.readFileSync(path.join(root, 'js/context-card-lifestyle-runtime.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert('lifestyle editor delegates browser globals through runtime adapter',
    editorSrc.includes("from './context-card-lifestyle-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(editorSrc) &&
      swSrc.includes("'/js/context-card-lifestyle-runtime.js'"));
  assert('lifestyle runtime injects view callbacks without the legacy bridge',
    runtimeSrc.includes('lifestyleRuntimeDeps.closeModal?.()') &&
      runtimeSrc.includes('lifestyleRuntimeDeps.navigate?.(category)') &&
      !runtimeSrc.includes('getViewRuntimeFunction'));
  configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
  configureChatRuntimeCallbacks(previousChatRuntime);
  configureContextCardLifestyleRuntimeDeps(previousLifestyleRuntime);
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
