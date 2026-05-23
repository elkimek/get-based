// chat-discussion-round-view.js - DOM helpers for live discussion round messages

import { calculateCost, formatCost } from './schema.js';
import { escapeHTML } from './utils.js';
import { renderMarkdown } from './markdown.js';
import { responseLimitNote } from './chat-continuation.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import { isRoundThreadActive } from './chat-discussion-round-state.js';

export function createDiscussionTypingIndicator() {
  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.setAttribute('role', 'status');
  typingEl.setAttribute('aria-live', 'polite');
  typingEl.setAttribute('aria-label', 'AI is responding');
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  return typingEl;
}

export function createDiscussionPersonaLabel(personality) {
  const labelEl = document.createElement('div');
  labelEl.className = 'chat-persona-label';
  labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
  return labelEl;
}

export function appendRoundPersonaLabel(threadId, container, labelEl) {
  if (!isRoundThreadActive(threadId) || labelEl.parentNode) return;
  container.appendChild(labelEl);
}

export function createDiscussionAiMessage() {
  const aiMsgEl = document.createElement('div');
  aiMsgEl.className = 'chat-msg chat-ai';
  aiMsgEl.style.whiteSpace = 'pre-wrap';
  return aiMsgEl;
}

export function renderFinalDiscussionMessage({
  threadId, container, labelEl, aiMsgEl, typingEl, fullText, responseTruncated,
}) {
  if (!isRoundThreadActive(threadId)) return false;
  appendRoundPersonaLabel(threadId, container, labelEl);
  aiMsgEl.style.whiteSpace = '';
  if (typingEl.parentNode) typingEl.remove();
  if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
  aiMsgEl.innerHTML = renderMarkdown(fullText);
  if (responseTruncated) aiMsgEl.insertAdjacentHTML('beforeend', responseLimitNote());
  return true;
}

export function appendDiscussionUsageFootnote({
  threadId, aiMsgEl, provider, modelId, modelDisplay, usage, webSearch, e2ee, attestation,
}) {
  if (!isRoundThreadActive(threadId) || !usage || !(usage.inputTokens || usage.outputTokens)) {
    return false;
  }

  const cost = calculateCost(provider, modelId, usage.inputTokens, usage.outputTokens);
  const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
  const webTag = webSearch ? ' \u00b7 \ud83c\udf10 web' : '';
  const e2eeTag = e2ee ? e2eeLockFootnote(attestation) : '';
  const footnote = document.createElement('div');
  footnote.className = 'chat-cost-footnote';
  footnote.innerHTML = `${escapeHTML(modelDisplay)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}`;
  aiMsgEl.appendChild(footnote);
  return true;
}

export function renderDiscussionRoundError({ threadId, container, error }) {
  if (!isRoundThreadActive(threadId)) return false;
  const errEl = document.createElement('div');
  errEl.className = 'chat-msg chat-ai';
  errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(error?.message || 'Unknown error')}</span>`;
  container.appendChild(errEl);
  return true;
}
