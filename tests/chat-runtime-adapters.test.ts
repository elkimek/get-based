import { expect, it } from 'vitest';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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


it('retains chat-runtime adapter behavior', async () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

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
  const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

  try {
    const calls: string[][] = [];
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
    delete (globalThis as { window?: unknown }).window;
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
    delete (globalThis as { window?: unknown }).window;
    await import('../js/chat-runtime.js?no-window-probe' as string);
    assert('chat runtime imports without a browser window', true);
  } catch (error) {
    assert('chat runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    restoreRuntime();
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
  expect(legacyAssertions.fail).toBe(0);
});
