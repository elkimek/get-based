// chat-discussion-round-view.js - DOM helpers for live discussion round messages

import { calculateCost, formatCost } from './schema.js';
import { escapeHTML } from './utils.js';
import { renderMarkdown } from './markdown.js';
import { responseLimitNote } from './chat-continuation.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import { isRoundThreadActive } from './chat-discussion-round-state.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
import { applyChatMessageAvatar } from './chat-message-avatars.js';
import {
  createChatThinkingIndicator, stopChatThinkingStatus,
} from './chat-thinking-status.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';
import type { ChatAvatarDetails } from './chat-message-avatars.js';
import type { AIOutputIdentity } from './cli-agent-brand-assets.js';

export type DiscussionPersonalityReader = { [Key in 'name' | 'icon']?: unknown };
type DiscussionAvatarReader = { [Key in keyof ChatAvatarDetails]?: unknown };
export interface DiscussionUsageReader { inputTokens?: unknown; outputTokens?: unknown }
interface RoundDOMInput { threadId?: unknown; container: Pick<HTMLElement, 'appendChild'>; labelEl: HTMLElement; aiMsgEl: HTMLElement; typingEl: HTMLElement; fullText: unknown; responseTruncated?: unknown }
interface UsageFootnoteInput { threadId?: unknown; aiMsgEl: Pick<HTMLElement, 'appendChild'>; provider: unknown; modelId?: unknown; modelDisplay?: unknown; usage?: DiscussionUsageReader | null; webSearch?: unknown; e2ee?: unknown; attestation?: unknown }
interface OutputAttributionInput extends Pick<AIOutputIdentity, 'provider' | 'agentId' | 'modelId' | 'modelDisplay'> { threadId?: unknown; aiMsgEl: Pick<HTMLElement, 'appendChild'> }
interface RoundErrorInput { threadId?: unknown; container: Pick<HTMLElement, 'appendChild'>; error?: { message?: unknown } | null }


export function createDiscussionTypingIndicator(personality: DiscussionPersonalityReader = {}) {
  return (createChatThinkingIndicator as (identity: DiscussionAvatarReader) => ReturnType<typeof createChatThinkingIndicator>)({
    personalityName: personality.name,
    personalityIcon: personality.icon,
  });
}

export function createDiscussionPersonaLabel(personality: DiscussionPersonalityReader) {
  const labelEl = document.createElement('div');
  labelEl.className = 'chat-persona-label';
  labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
  return labelEl;
}

export function appendRoundPersonaLabel(threadId: unknown, container: Pick<HTMLElement, 'appendChild'>, labelEl: HTMLElement) {
  if (!isRoundThreadActive(threadId) || labelEl.parentNode) return;
  container.appendChild(labelEl);
}

export function createDiscussionAiMessage(personality: DiscussionPersonalityReader = {}) {
  const aiMsgEl = document.createElement('div');
  aiMsgEl.className = 'chat-msg chat-ai';
  aiMsgEl.setAttribute('role', 'article');
  aiMsgEl.setAttribute('aria-label', 'AI response');
  aiMsgEl.style.whiteSpace = 'pre-wrap';
  (applyChatMessageAvatar as (element: Parameters<typeof applyChatMessageAvatar>[0], identity: DiscussionAvatarReader & { role: 'assistant' }) => ReturnType<typeof applyChatMessageAvatar>)(aiMsgEl, {
    role: 'assistant',
    personalityName: personality.name,
    personalityIcon: personality.icon,
  });
  return aiMsgEl;
}

export function renderFinalDiscussionMessage({
  threadId, container, labelEl, aiMsgEl, typingEl, fullText, responseTruncated,
}: RoundDOMInput) {
  if (!isRoundThreadActive(threadId)) return false;
  appendRoundPersonaLabel(threadId, container, labelEl);
  aiMsgEl.style.whiteSpace = '';
  stopChatThinkingStatus(typingEl);
  if (typingEl.parentNode) typingEl.remove();
  if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
  aiMsgEl.innerHTML = renderMarkdown(fullText);
  if (responseTruncated) aiMsgEl.insertAdjacentHTML('beforeend', responseLimitNote());
  return true;
}

export function appendDiscussionUsageFootnote({
  threadId, aiMsgEl, provider, modelId, modelDisplay, usage, webSearch, e2ee, attestation,
}: UsageFootnoteInput) {
  if (!isRoundThreadActive(threadId) || !usage || !(usage.inputTokens || usage.outputTokens)
    || (shouldHideAppExtensionAIUsage as (provider: unknown) => ReturnType<typeof shouldHideAppExtensionAIUsage>)(provider)) {
    return false;
  }

  const cost = (calculateCost as (provider: unknown, modelId: unknown, inputTokens: unknown, outputTokens: unknown) => ReturnType<typeof calculateCost>)(provider, modelId, usage.inputTokens, usage.outputTokens);
  // The arithmetic consumer retains JavaScript coercion of raw token fields.
  const totalTokens = ((usage.inputTokens || 0) as number) + ((usage.outputTokens || 0) as number);
  const webTag = webSearch ? ' \u00b7 \ud83c\udf10 web' : '';
  const e2eeTag = e2ee ? e2eeLockFootnote(attestation) : '';
  const footnote = document.createElement('div');
  footnote.className = 'chat-cost-footnote';
  footnote.innerHTML = `${escapeHTML(modelDisplay)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}`;
  aiMsgEl.appendChild(footnote);
  return true;
}

export function appendDiscussionOutputAttribution({
  threadId, aiMsgEl, provider, agentId, modelId, modelDisplay,
}: OutputAttributionInput) {
  if (!isRoundThreadActive(threadId)) return false;
  const attribution = getAIOutputAttribution({ provider, agentId, modelId, modelDisplay });
  // Live discussion output follows the same display rule as restored chat.
  if (attribution !== 'Written with Grok') return false;
  const element = document.createElement('div');
  element.className = 'chat-provider-attribution';
  element.textContent = attribution;
  aiMsgEl.appendChild(element);
  return true;
}

export function renderDiscussionRoundError({ threadId, container, error }: RoundErrorInput) {
  if (!isRoundThreadActive(threadId)) return false;
  const errEl = document.createElement('div');
  errEl.className = 'chat-msg chat-ai';
  errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(error?.message || 'Unknown error')}</span>`;
  container.appendChild(errEl);
  return true;
}
