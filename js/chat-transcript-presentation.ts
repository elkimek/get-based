import { state } from './state.js';
import { renderMarkdown } from './markdown.js';
import { calculateCost, formatCost } from './schema.js';
import { getAIProvider, getActiveModelDisplay, getActiveModelId } from './api.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';
import { shouldShowChatPersonaLabel, projectChatMessageAvatar } from './chat-message-avatars.js';
import { projectChatMessageActions } from './chat-message-actions-contract.js';
import { projectChatCitations, projectChatStoredImages } from './chat-message-content-contract.js';
import './chat-attestation.js'; // Preserve the shared tooltip installation side effect.
import { projectAttestationBadge, type AttestationBadgeView } from './chat-attestation-presentation.js';
import { isChatRenderProductRecsEnabled, getChatRecommendationSectionViews } from './chat-render-runtime.js';
import type {TipsSectionView} from './tips-presentation.js';
type ChatMessage = (typeof state.chatHistory)[number];

export interface ChatTranscriptReceipt { readonly badge: AttestationBadgeView | null; }
export interface ChatTranscriptMessage {
  key: object;
  index: number;
  role: 'user' | 'assistant';
  label: string;
  body: string;
  error: string | null;
  auto: boolean;
  stopped: boolean;
  truncated: boolean;
  avatar: ReturnType<typeof projectChatMessageAvatar>;
  actions: ReturnType<typeof projectChatMessageActions>;
  images: ReturnType<typeof projectChatStoredImages>;
  citations: ReturnType<typeof projectChatCitations>;
  usage: { readonly text: string; readonly receipt: ChatTranscriptReceipt | null } | null;
  attribution: string | null;
  emfHint: boolean;
  recommendationAttention: boolean;
  recommendations: { sections: TipsSectionView[]; count: number; open: boolean; isNew: boolean } | null;
}
export type ChatTranscriptEntry = { key: object; joined: string } | { key: object; persona: string | null; message: ChatTranscriptMessage };
export interface ChatTranscriptView {
  entries: ChatTranscriptEntry[];
  earlier: number;
  fork: { name: string | null; threadId: string | null } | null;
}

/** Markdown retains its sanitizer; recommendation sections compose typed catalog views. */
export function projectChatTranscriptMessage(message: ChatMessage, index: number, attention = false): ChatTranscriptMessage {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const provider = message.provider || (message.modelId?.includes('/') ? 'openrouter' : getAIProvider());
  let usage: ChatTranscriptMessage['usage'] = null;
  if (role === 'assistant' && !shouldHideAppExtensionAIUsage(provider)) {
    if (provider === 'codex-agent' || provider === 'personal-agent-gateway') {
      usage = { text: `${message.modelDisplay || 'CLI agent'} · CLI subscription${message.webSearch ? ' · 🌐 web' : ''}`, receipt: null };
    } else if (message.usage && (message.usage.inputTokens || message.usage.outputTokens)) {
      const input = Math.max(0, Number(message.usage.inputTokens) || 0);
      const output = Math.max(0, Number(message.usage.outputTokens) || 0);
      const cost = calculateCost(provider, message.modelId || getActiveModelId(), input, output);
      usage = {
        text: `${message.modelDisplay || getActiveModelDisplay()} · ${formatCost(cost)} · ${(input + output).toLocaleString()} tokens${message.webSearch ? ' · 🌐 web' : ''}`,
        receipt: message.e2ee ? { badge: projectAttestationBadge(message.attestation) } : null,
      };
    }
  }
  const sections = role === 'assistant' ? getChatRecommendationSectionViews(message.recSlots) : [];
  return {
    key: message, index, role, label: role === 'user' ? 'You' : message.personalityName || 'AI response',
    body: message.error ? '' : renderMarkdown(message.content), error: message.error ? String(message.content || '') : null,
    auto: !!message.auto, stopped: !!message.stopped, truncated: !!message.truncated,
    avatar: projectChatMessageAvatar({ role, personalityName: message.personalityName, personalityIcon: message.personalityIcon, agentId: message.agentId }),
    actions: projectChatMessageActions(state.chatHistory, index), images: projectChatStoredImages(message),
    citations: role === 'assistant' ? projectChatCitations(message.lensSources, message.lensSourceName) : null,
    usage, attribution: getAIOutputAttribution(message) === 'Written with Grok' ? 'Written with Grok' : null,
    emfHint: role === 'assistant' && !!message.emfHint && isChatRenderProductRecsEnabled(),
    recommendationAttention: attention,
    recommendations: sections.length ? { sections, count: sections.length, open: !!message.recOpen, isNew: !!message.recNew } : null,
  };
}
export function projectChatTranscript(start: number, attentionMessage?: object): ChatTranscriptView {
  const entries: ChatTranscriptEntry[] = [];
  let previousPersona: string | null = null;
  for (let index = start; index < state.chatHistory.length; index++) {
    const message = state.chatHistory[index]!;
    if (message.joined) { entries.push({ key: message, joined: `${message.joinIcon || ''} ${message.joinName || ''} joined the discussion` }); continue; }
    if (message.hidden) continue;
    const persona = message.role === 'assistant' && shouldShowChatPersonaLabel(message) && message.personalityName !== previousPersona
      ? `${message.personalityIcon || ''} ${message.personalityName}` : null;
    if (message.role === 'assistant') previousPersona = message.personalityName || null;
    entries.push({ key: message, persona, message: projectChatTranscriptMessage(message, index, message === attentionMessage) });
  }
  const thread = state.chatThreads.find(item => item.id === state.currentThreadId);
  const source = state.chatThreads.find(item => item.id === thread?.forkedFromThreadId);
  return { entries, earlier: start, fork: thread?.forkedFromThreadId ? { name: source ? source.name || 'conversation' : null, threadId: source?.id || null } : null };
}
