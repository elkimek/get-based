#!/usr/bin/env node
// Chat shared browser adapter behavior.

import './_node-shim.js';
import {
  getChatProviderAttestation,
  getChatRegenerateCallbacks,
  isChatRuntimeStreaming,
  openChatContextModalRuntime,
  renderChatMessagesRuntime,
  updateDiscussButtonRuntime,
} from '../js/chat-runtime.js';

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Chat Runtime Tests ===');

const runtimeKeys = [
  'window',
  'renderChatMessages',
  'updateDiscussButton',
  'openContextModal',
  'isChatStreaming',
  'sendChatMessage',
  '_ppqAttestation',
  '_veniceAttestation',
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
  const ppqAttestation = { provider: 'ppq', verified: true };
  const veniceAttestation = { provider: 'venice', verified: true };
  setRuntimeValue('window', globalThis);
  setRuntimeValue('renderChatMessages', () => calls.push(['render']));
  setRuntimeValue('updateDiscussButton', () => calls.push(['discuss']));
  setRuntimeValue('openContextModal', () => calls.push(['context']));
  setRuntimeValue('isChatStreaming', () => false);
  setRuntimeValue('sendChatMessage', () => calls.push(['send']));
  setRuntimeValue('_ppqAttestation', ppqAttestation);
  setRuntimeValue('_veniceAttestation', veniceAttestation);

  renderChatMessagesRuntime();
  updateDiscussButtonRuntime();
  openChatContextModalRuntime();
  assert('chat runtime invokes render/discuss/context callbacks',
    calls.some(call => call[0] === 'render') &&
      calls.some(call => call[0] === 'discuss') &&
      calls.some(call => call[0] === 'context'));

  assert('chat runtime reports non-streaming state',
    isChatRuntimeStreaming() === false);
  setRuntimeValue('isChatStreaming', () => true);
  assert('chat runtime reports streaming state',
    isChatRuntimeStreaming() === true);

  const callbacks = getChatRegenerateCallbacks();
  callbacks?.renderChatMessages();
  callbacks?.sendChatMessage();
  assert('chat runtime returns regenerate callbacks when both are present',
    typeof callbacks?.renderChatMessages === 'function' &&
      typeof callbacks?.sendChatMessage === 'function' &&
      calls.filter(call => call[0] === 'render').length === 2 &&
      calls.filter(call => call[0] === 'send').length === 1);

  delete globalThis.sendChatMessage;
  assert('chat runtime requires send callback for regeneration',
    getChatRegenerateCallbacks() === null);

  assert('chat runtime reads provider attestations',
    getChatProviderAttestation('ppq') === ppqAttestation &&
      getChatProviderAttestation('venice') === veniceAttestation);

  delete globalThis.window;
  assert('chat runtime no-ops without a browser window',
    isChatRuntimeStreaming() === false &&
      getChatRegenerateCallbacks() === null &&
      getChatProviderAttestation('ppq') === undefined);
} finally {
  restoreRuntime();
}

try {
  delete globalThis.window;
  await import('../js/chat-runtime.js?no-window-probe');
  assert('chat runtime imports without a browser window', true);
} catch (error) {
  assert('chat runtime imports without a browser window', false, error?.message || String(error));
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
