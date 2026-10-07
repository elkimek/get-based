// Public discussion element helpers project the same authored message view as live/restored chat.
import { state } from './state.js';
import { disposeChatStreamingText, snapshotChatCompatibilityMessage } from './chat-live-message-component.js';
import { isRoundThreadActive } from './chat-discussion-round-state.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
import { createChatThinkingIndicator, stopChatThinkingStatus } from './chat-thinking-status.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';
import type { ChatAvatarDetails } from './chat-message-avatars.js';
import type { AIOutputIdentity } from './cli-agent-brand-assets.js';

type ChatMessage = (typeof state.chatHistory)[number];
export type DiscussionPersonalityReader = { [Key in 'name' | 'icon']?: unknown };
export interface DiscussionUsageReader { inputTokens?: unknown; outputTokens?: unknown }
interface RoundDOMInput { threadId?: unknown; container: Pick<HTMLElement, 'appendChild'>; labelEl: HTMLElement; aiMsgEl: HTMLElement; typingEl: HTMLElement; fullText: unknown; responseTruncated?: unknown }
interface UsageFootnoteInput { threadId?: unknown; aiMsgEl: Pick<HTMLElement, 'appendChild'>; provider: unknown; modelId?: unknown; modelDisplay?: unknown; usage?: DiscussionUsageReader | null; webSearch?: unknown; e2ee?: unknown; attestation?: unknown }
interface OutputAttributionInput extends Pick<AIOutputIdentity, 'provider' | 'agentId' | 'modelId' | 'modelDisplay'> { threadId?: unknown; aiMsgEl: Pick<HTMLElement, 'appendChild'> }
interface RoundErrorInput { threadId?: unknown; container: Pick<HTMLElement, 'appendChild'>; error?: { message?: unknown } | null }
const messages = new WeakMap<object, ChatMessage>();

function refreshMessage(element: Pick<HTMLElement, 'appendChild'>, update: Record<string, unknown>): void {
  const message = { role: 'assistant', content: '', ...messages.get(element), ...update } as ChatMessage;
  messages.set(element, message);
  const snapshot = snapshotChatCompatibilityMessage(message).message;
  if (element instanceof HTMLElement) element.replaceChildren(...snapshot.childNodes);
  else for (const child of Array.from(snapshot.childNodes)) element.appendChild(child);
}

export function createDiscussionTypingIndicator(personality: DiscussionPersonalityReader = {}) {
  return createChatThinkingIndicator({ personalityName: personality.name, personalityIcon: personality.icon } as ChatAvatarDetails);
}
export function createDiscussionPersonaLabel(personality: DiscussionPersonalityReader): HTMLElement {
  return snapshotChatCompatibilityMessage({ role: 'assistant', content: '' }, `${personality.icon || ''} ${personality.name}`).label!;
}
export function appendRoundPersonaLabel(threadId: unknown, container: Pick<HTMLElement, 'appendChild'>, labelEl: HTMLElement): void {
  if (isRoundThreadActive(threadId) && !labelEl.parentNode) container.appendChild(labelEl);
}
export function createDiscussionAiMessage(personality: DiscussionPersonalityReader = {}): HTMLElement {
  const message = { role: 'assistant', content: '', personalityName: personality.name, personalityIcon: personality.icon } as ChatMessage;
  const element = snapshotChatCompatibilityMessage(message).message;
  messages.set(element, message);
  return element;
}
export function renderFinalDiscussionMessage({ threadId, container, labelEl, aiMsgEl, typingEl, fullText, responseTruncated }: RoundDOMInput): boolean {
  if (!isRoundThreadActive(threadId)) return false;
  appendRoundPersonaLabel(threadId, container, labelEl);
  stopChatThinkingStatus(typingEl);
  typingEl.remove();
  if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
  disposeChatStreamingText(aiMsgEl);
  refreshMessage(aiMsgEl, { content: fullText, truncated: !!responseTruncated });
  return true;
}
export function appendDiscussionUsageFootnote({ threadId, aiMsgEl, provider, modelId, modelDisplay, usage, webSearch, e2ee, attestation }: UsageFootnoteInput): boolean {
  if (!isRoundThreadActive(threadId) || !usage || !(usage.inputTokens || usage.outputTokens)
    || shouldHideAppExtensionAIUsage(provider as string)) return false;
  refreshMessage(aiMsgEl, { provider, modelId, modelDisplay, usage, webSearch, e2ee, attestation });
  return true;
}
export function appendDiscussionOutputAttribution({ threadId, aiMsgEl, provider, agentId, modelId, modelDisplay }: OutputAttributionInput): boolean {
  if (!isRoundThreadActive(threadId) || getAIOutputAttribution({ provider, agentId, modelId, modelDisplay }) !== 'Written with Grok') return false;
  refreshMessage(aiMsgEl, { provider, agentId, modelId, modelDisplay });
  return true;
}
export function renderDiscussionRoundError({ threadId, container, error }: RoundErrorInput): boolean {
  if (!isRoundThreadActive(threadId)) return false;
  container.appendChild(snapshotChatCompatibilityMessage({ role: 'assistant', content: `Error: ${error?.message || 'Unknown error'}`, error: true }).message);
  return true;
}
