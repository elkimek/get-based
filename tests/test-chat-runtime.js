#!/usr/bin/env node
// Chat shared browser adapter behavior.

import './_node-shim.js';
import {
  closeChatModalRuntime,
  configureChatRuntimeCallbacks,
  getChatProviderAttestation,
  getChatRegenerateCallbacks,
  isChatRuntimeStreaming,
  openChatContextModalRuntime,
  refreshChatWebSearchToggleRuntime,
  renderChatMessagesRuntime,
  resumeChatAIRuntime,
  updateChatHeaderModelRuntime,
  updateChatNudgeRuntime,
  updateDiscussButtonRuntime,
} from '../js/chat-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';

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
  '_routstrAttestation',
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
  const previousContextCardsRuntime = configureContextCardsRuntimeCallbacks({
    openContextModal: () => calls.push(['context']),
  });
  const previousChatRuntime = configureChatRuntimeCallbacks({
    closeModal: () => calls.push(['close']),
    isChatStreaming: () => false,
    refreshWebSearchToggle: () => calls.push(['web-search']),
    renderChatMessages: () => calls.push(['render']),
    resumeAI: () => calls.push(['resume']),
    sendChatMessage: () => calls.push(['send']),
    updateChatHeaderModel: () => calls.push(['header-model']),
    updateChatNudge: () => calls.push(['nudge']),
    updateDiscussButton: () => calls.push(['discuss']),
  });
  const ppqAttestation = { provider: 'ppq', verified: true };
  const routstrAttestation = { provider: 'routstr', verified: true };
  const veniceAttestation = { provider: 'venice', verified: true };
  setRuntimeValue('window', globalThis);
  setRuntimeValue('openContextModal', () => calls.push(['legacy-context']));
  setRuntimeValue('_ppqAttestation', ppqAttestation);
  setRuntimeValue('_routstrAttestation', routstrAttestation);
  setRuntimeValue('_veniceAttestation', veniceAttestation);

  renderChatMessagesRuntime();
  updateDiscussButtonRuntime();
  openChatContextModalRuntime();
  closeChatModalRuntime();
  refreshChatWebSearchToggleRuntime();
  resumeChatAIRuntime();
  updateChatHeaderModelRuntime();
  updateChatNudgeRuntime();
  assert('chat runtime invokes render/discuss/context/close callbacks',
    calls.some(call => call[0] === 'render') &&
      calls.some(call => call[0] === 'discuss') &&
      calls.some(call => call[0] === 'context') &&
      calls.some(call => call[0] === 'close'));
  assert('chat runtime invokes configured refresh callbacks',
    calls.some(call => call[0] === 'web-search') &&
      calls.some(call => call[0] === 'resume') &&
      calls.some(call => call[0] === 'header-model') &&
      calls.some(call => call[0] === 'nudge'));

  assert('chat runtime reports non-streaming state',
    isChatRuntimeStreaming() === false);
  configureChatRuntimeCallbacks({ isChatStreaming: () => true });
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

  configureChatRuntimeCallbacks({ sendChatMessage: null });
  assert('chat runtime requires send callback for regeneration',
    getChatRegenerateCallbacks() === null);

  assert('chat runtime reads provider attestations',
    getChatProviderAttestation('ppq') === ppqAttestation &&
      getChatProviderAttestation('routstr') === routstrAttestation &&
      getChatProviderAttestation('venice') === veniceAttestation);

  configureContextCardsRuntimeCallbacks({ openContextModal: null });
  configureChatRuntimeCallbacks({
    closeModal: null,
    isChatStreaming: null,
    refreshWebSearchToggle: null,
    renderChatMessages: null,
    resumeAI: null,
    sendChatMessage: null,
    updateChatHeaderModel: null,
    updateChatNudge: null,
    updateDiscussButton: null,
  });
  delete globalThis.window;
  assert('chat runtime no-ops without a browser window',
    isChatRuntimeStreaming() === false &&
      getChatRegenerateCallbacks() === null &&
      getChatProviderAttestation('ppq') === undefined);
  configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
  configureChatRuntimeCallbacks(previousChatRuntime);
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
