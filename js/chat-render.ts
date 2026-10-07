// chat-render.js — chat transcript rendering

import { state } from './state.js';
import { renderChatTranscript, disposeChatTranscript } from './chat-transcript-component.js';
import { projectChatTranscript } from './chat-transcript-presentation.js';
import { updateChatHeaderTitle } from './chat-personalities.js';
import { updateChatInputState } from './chat-panel.js';
import { updateDiscussButton } from './chat-discussion.js';
import { disposeChatOptionalSetup } from './chat-optional-setup-component.js';
import { disposeChatProfileSetup } from './chat-profile-setup-component.js';
import { disposeChatProviderSetup } from './chat-provider-setup-component.js';
import { renderEmptyChatState } from './chat-empty-state.js';
import { renderChatCitations } from './chat-message-content.js';
import {
  followChatLatest, initChatScrollControls, notifyChatContentAdded,
} from './chat-scroll.js';
import {
  expandChatRenderWindow,
  getChatRenderStart,
  resetChatRenderWindow,
  revealChatRenderIndex,
} from './chat-render-range.js';
export { _getNoDataPrompts } from './chat-empty-state.js';

/**
 * Render the collapsible "Sources" block under an assistant message.
 * Shows the excerpts the lens returned for this question — filename, score,
 * and the actual chunk text. Lets users verify what the AI was grounded on
 * (or not, if its answer drifts from the cited sources). Collapsed by
 * default so the chat stays scannable.
 */
export function _renderLensSources(chunks: unknown, sourceName?: unknown) {
  return renderChatCitations(chunks, sourceName);
}

export function renderChatMessages({ preserveScroll = false, attentionMessage }: {preserveScroll?:boolean; attentionMessage?: object} = {}) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  initChatScrollControls();
  const panel = document.getElementById('chat-panel');
  panel?.classList.remove('chat-onboarding-active');

  if (state.chatHistory.length === 0) {
    disposeChatTranscript();
    resetChatRenderWindow(state.currentThreadId);
    renderEmptyChatState(container, panel);
    followChatLatest(container, { behavior: 'auto' });
    updateDiscussButton();
    return;
  }
  disposeChatProviderSetup();
  disposeChatProfileSetup();
  disposeChatOptionalSetup();
  const renderStart = getChatRenderStart(state.currentThreadId, state.chatHistory.length);
  renderChatTranscript(container, projectChatTranscript(renderStart, attentionMessage));
  if (preserveScroll) notifyChatContentAdded(container);
  else followChatLatest(container, { behavior: 'auto' });
  updateDiscussButton();
  updateChatHeaderTitle();
  updateChatInputState();
}

export function showEarlierChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container || !state.currentThreadId) return false;
  const previousHeight = container.scrollHeight;
  const previousTop = container.scrollTop;
  const nextStart = expandChatRenderWindow(state.currentThreadId, state.chatHistory.length);
  renderChatMessages({ preserveScroll: true });
  requestAnimationFrame(() => {
    container.scrollTop = previousTop + Math.max(0, container.scrollHeight - previousHeight);
    if (nextStart > 0) (
      container.querySelector<HTMLElement>('.chat-history-earlier')
    )?.focus();
  });
  return true;
}

export function revealChatMessage(index: number) {
  if (!state.currentThreadId) return false;
  const changed = revealChatRenderIndex(state.currentThreadId, index, state.chatHistory.length);
  if (changed) renderChatMessages({ preserveScroll: true });
  return changed;
}
