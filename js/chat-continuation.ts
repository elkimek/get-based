// chat-continuation.js - response limit detection and automatic continuation

import { callClaudeAPI } from './api.js';
import type { AIProviderRequestOptions } from './api.js';

export interface ChatUsage { inputTokens?: number; outputTokens?: number }
export interface ChatResponse {
  text?: string;
  usage?: ChatUsage;
  truncated?: unknown;
  finishReason?: unknown;
  [field: string]: unknown;
}
export interface ChatContinuationResponse extends ChatResponse {
  text: string;
  usage: ChatUsage;
  continued: number;
  truncated: boolean;
}
export interface ChatContinuationOptions extends AIProviderRequestOptions {
  provider?: string | undefined;
}


export const CHAT_RESPONSE_MAX_TOKENS = 16384;

const CHAT_AUTO_CONTINUE_LIMIT = 2;
const CHAT_CONTINUE_PROMPT = 'Continue exactly where you stopped. Do not repeat anything already written. Finish the interrupted sentence first, then complete the answer.';

export function responseLimitNote() {
  return '<div class="chat-stopped-note">[output limit reached - ask "continue" to finish]</div>';
}

export function isAIResponseTruncated(result: ChatResponse | null | undefined) {
  if (result?.truncated) return true;
  const reason = String(result?.finishReason || '').toLowerCase();
  return reason === 'length'
    || reason === 'max_tokens'
    || reason === 'max_completion_tokens'
    || reason.includes('token_limit')
    || reason.includes('max token');
}

export function isLikelyIncompleteResponse(text: unknown) {
  const t = String(text || '').trim();
  if (t.length < 500 || t.endsWith('```')) return false;
  if (/[.!?)]$/.test(t)) return false;
  const lines = t.split('\n').map(line => line.trim()).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '';
  if (!lastLine) return false;
  if (/^#{1,6}\s+/.test(lastLine)) return true;
  if (/[:,;]$/.test(t)) return true;
  if (/\b(and|or|but|because|with|without|given|especially|that|the|a|an|to|for|of|in|on|by|from)$/i.test(t)) return true;
  return false;
}

export function shouldAutoContinueResponse(result: ChatResponse | null | undefined, text: unknown) {
  return isAIResponseTruncated(result) || isLikelyIncompleteResponse(text);
}

function mergeAIUsage(total: ChatUsage = {}, next: ChatUsage = {}) {
  return {
    inputTokens: (total.inputTokens || 0) + (next.inputTokens || 0),
    outputTokens: (total.outputTokens || 0) + (next.outputTokens || 0),
  };
}

export async function callChatAPIWithContinuation({ system, messages, maxTokens, signal, onStream, webSearch, provider, reasoningEffort }: ChatContinuationOptions): Promise<ChatContinuationResponse> {
  let result = await callClaudeAPI({ system, messages, maxTokens, signal, onStream, webSearch, reasoningEffort }, provider) as ChatResponse;
  let fullText = result.text || '';
  let usage = result.usage || {};
  let continued = 0;

  while (shouldAutoContinueResponse(result, fullText) && continued < CHAT_AUTO_CONTINUE_LIMIT && !signal?.aborted) {
    continued += 1;
    const priorText = fullText;
    const continuationMessages = [
      ...messages,
      { role: 'assistant', content: priorText },
      { role: 'user', content: CHAT_CONTINUE_PROMPT },
    ];
    result = await callClaudeAPI({
      system,
      messages: continuationMessages,
      maxTokens,
      signal,
      onStream(partial) {
        if (onStream) onStream(priorText + partial);
      },
      webSearch,
      reasoningEffort,
    }, provider) as ChatResponse;
    fullText += result.text || '';
    usage = mergeAIUsage(usage, result.usage || {});
  }

  return {
    ...result,
    text: fullText,
    usage,
    continued,
    truncated: shouldAutoContinueResponse(result, fullText),
  };
}
