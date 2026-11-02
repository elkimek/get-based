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
  captureChatScrollPosition, followChatLatest, initChatScrollControls, restoreChatScrollPosition,
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

const renderedConversations = new WeakMap<HTMLElement, {
  profile: typeof state.currentProfile; thread: typeof state.currentThreadId; count: number; latestContent: string;
}>();

export function renderChatMessages({ preserveScroll, attentionMessage }: {preserveScroll?:boolean; attentionMessage?: object} = {}) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  initChatScrollControls();
  const previous = renderedConversations.get(container);
  const sameConversation = previous?.profile === state.currentProfile && previous?.thread === state.currentThreadId;
  const position = sameConversation && preserveScroll !== false ? captureChatScrollPosition(container) : null;
  const current = { profile: state.currentProfile, thread: state.currentThreadId,
    count: state.chatHistory.length, latestContent: state.chatHistory.at(-1)?.content || '' };
  const hasNewContent = !!previous && (current.count > previous.count
    || current.count === previous.count && current.latestContent !== previous.latestContent);
  const panel = document.getElementById('chat-panel');
  panel?.classList.remove('chat-onboarding-active');

  if (state.chatHistory.length === 0) {
    disposeChatTranscript();
    resetChatRenderWindow(state.currentThreadId);
    renderEmptyChatState(container, panel);
    renderedConversations.set(container, current);
    followChatLatest(container, { behavior: 'auto' });
    updateDiscussButton();
    return;
  }
  disposeChatProviderSetup();
  disposeChatProfileSetup();
  disposeChatOptionalSetup();
  const renderStart = getChatRenderStart(state.currentThreadId, state.chatHistory.length);
  renderChatTranscript(container, projectChatTranscript(renderStart, attentionMessage));
  renderedConversations.set(container, current);
  if (position) restoreChatScrollPosition(container, position, hasNewContent);
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
