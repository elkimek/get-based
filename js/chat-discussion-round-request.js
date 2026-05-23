// chat-discussion-round-request.js - API request helpers for discussion rounds

import { CHAT_SYSTEM_PROMPT } from './constants.js';
import { trackUsage } from './schema.js';
import {
  getAIProvider, getActiveModelId, getActiveModelDisplay, supportsWebSearch,
  isVeniceE2EEActive,
} from './api.js';
import { buildLabContext, injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti } from './lens.js';
import { getActivePersonality, getCustomPersonality } from './chat-personalities.js';
import {
  attachLensSources, buildChatSystemPrompt, buildMultiPersonaInstruction,
  buildPersonalityPrompt, buildTaggedChatMessages, buildWebSearchHint,
} from './chat-prompt-context.js';
import { getChatWebSearchEnabled } from './chat-panel.js';

export async function buildDiscussionRoundRequest({ msgText, roundHistory, signal }) {
  let labContext = buildLabContext({ userMessage: msgText });
  let lensResult = null;
  if (hasLens()) {
    lensResult = await queryLensMulti(msgText, { signal });
    if (lensResult) {
      labContext = injectLensChunks(labContext, lensResult);
    }
  }

  const personality = getActivePersonality();
  const personalityPrompt = buildPersonalityPrompt(personality, getCustomPersonality());
  const multiPersonaInstruction = buildMultiPersonaInstruction(roundHistory, personality.name);
  const provider = getAIProvider();
  const modelId = getActiveModelId(provider);
  const modelDisplay = getActiveModelDisplay(provider);
  const e2ee = provider === 'venice' && isVeniceE2EEActive();
  const webSearchSupported = supportsWebSearch(provider);
  const webSearch = getChatWebSearchEnabled() && webSearchSupported;

  const webHint = buildWebSearchHint({
    isE2EE: e2ee,
    webSearchEnabled: webSearch,
    webSearchSupported,
    includeActiveSearchHints: false,
  });
  const systemPrompt = buildChatSystemPrompt({
    basePrompt: CHAT_SYSTEM_PROMPT,
    labContext,
    personalityPrompt,
    multiPersonaInstruction,
    webHint,
  });
  const apiMessages = buildTaggedChatMessages(roundHistory, personality.name);

  return {
    apiMessages,
    e2ee,
    lensResult,
    modelDisplay,
    modelId,
    personality,
    provider,
    systemPrompt,
    webSearch,
  };
}

export function buildDiscussionAssistantMessage({
  fullText, request, aiResult, responseTruncated, attestation,
}) {
  const assistantMsg = {
    role: 'assistant',
    content: fullText,
    personalityName: request.personality.name,
    personalityIcon: request.personality.icon,
    provider: request.provider,
    modelId: request.modelId,
    modelDisplay: request.modelDisplay,
  };
  if (responseTruncated) {
    assistantMsg.truncated = true;
    assistantMsg.finishReason = aiResult.finishReason || 'length';
  }
  if (request.webSearch) assistantMsg.webSearch = true;
  if (request.e2ee) {
    assistantMsg.e2ee = true;
    assistantMsg.attestation = attestation || null;
  }
  attachLensSources(assistantMsg, request.lensResult);
  return assistantMsg;
}

export function trackDiscussionUsage(request, usage) {
  if (!usage || !(usage.inputTokens || usage.outputTokens)) return;
  trackUsage(request.provider, request.modelId, usage.inputTokens, usage.outputTokens);
}
