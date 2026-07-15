#!/usr/bin/env node
// test-context-card-lifestyle-runtime.js - Lifestyle context runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  closeLifestyleContextModalAndNavigateRuntime,
  closeLifestyleContextModalRuntime,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
  navigateLifestyleContextRuntime,
  openLightSetupFromLifestyleRuntime,
  returnToLifestyleContextModalRuntime,
  updateLifestyleChatHeaderModelRuntime,
} from '../js/context-card-lifestyle-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Context Card Lifestyle Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'closeModal',
  'navigate',
  'updateChatHeaderModel',
  'openChatPanel',
  'useChatPrompt',
  'openContextModal',
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
  const previousContextCardsRuntime = configureContextCardsRuntimeCallbacks({
    openContextModal: () => calls.push(['context-modal']),
  });
  setRuntimeValue('window', globalThis);
  setRuntimeValue('closeModal', () => calls.push(['close']));
  setRuntimeValue('navigate', category => calls.push(['navigate', category]));
  setRuntimeValue('updateChatHeaderModel', () => calls.push(['chat-header']));
  setRuntimeValue('openChatPanel', () => calls.push(['chat-panel']));
  setRuntimeValue('useChatPrompt', prompt => calls.push(['prompt', prompt]));
  setRuntimeValue('openContextModal', () => calls.push(['legacy-context-modal']));
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
  const editorSrc = fs.readFileSync(path.join(root, 'js/context-card-lifestyle-editors.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert('lifestyle editor delegates browser globals through runtime adapter',
    editorSrc.includes("from './context-card-lifestyle-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(editorSrc) &&
      swSrc.includes("'/js/context-card-lifestyle-runtime.js'"));
  configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
