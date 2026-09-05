// @ts-check
// chat-discussion-round-request.js - API request helpers for discussion rounds

import { CHAT_SYSTEM_PROMPT } from './chat-system-prompt.js';
import { trackUsage } from './schema.js';
import {
  getAIProvider, getActiveModelId, getActiveModelDisplay, supportsWebSearch,
  isPpqPrivateModeActive, isRoutstrPrivateModeActive, isVeniceE2EEActive,
} from './api.js';
import { injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti } from './lens.js';
import { getActivePersonality, getCustomPersonality } from './chat-personalities.js';
import {
  attachLensSources, buildChatLabContext, buildChatSystemPrompt, buildMultiPersonaInstruction,
  buildPersonalityPrompt, buildTaggedChatMessages, buildWebSearchHint,
} from './chat-prompt-context.js';
import { getChatWebSearchEnabled } from './chat-panel.js';
import { getDirectChatReasoningEffort } from './chat-model-preferences.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { isPersonalAgentTarget } from './agent-chat-context.js';
import { callCodexAgent } from './agent-chat-backend.js';
import {
  CHAT_RESPONSE_MAX_TOKENS, callChatAPIWithContinuation,
} from './chat-continuation.js';
import { getAgentModelDisplay, getCachedAgentModelCatalog } from './agent-model-catalog.js';
import { mergeAgentContextReceipts } from './agent-tool-runtime.js';

export async function buildDiscussionRoundRequest({ msgText, roundHistory, signal }) {
  let labContext = buildChatLabContext(msgText);
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
  const route = getAssistantExecutionRoute();
  const useCodexAgent = route.adapter === 'codex';
  const agentId = useCodexAgent ? route.provider : '';
  const target = useCodexAgent ? route.target : 'local';
  const directProvider = getAIProvider();
  const provider = useCodexAgent
    ? (isPersonalAgentTarget(target) ? 'personal-agent-gateway' : 'codex-agent')
    : directProvider;
  const modelId = useCodexAgent ? (route.model || agentId || 'cli-default') : getActiveModelId(provider);
  const modelDisplay = useCodexAgent
    ? (route.modelDisplay || route.providerDisplay || 'CLI agent')
    : getActiveModelDisplay(provider);
  const reasoningEffort = useCodexAgent ? '' : getDirectChatReasoningEffort(provider, modelId);
  const e2ee = !useCodexAgent && ((provider === 'venice' && isVeniceE2EEActive())
    || (provider === 'ppq' && isPpqPrivateModeActive())
    || (provider === 'routstr' && isRoutstrPrivateModeActive()));
  const webSearchSupported = !useCodexAgent && supportsWebSearch(provider);
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

  const { getContextSummary } = await import('./chat-context-summary.js');
  return {
    apiMessages,
    agentId,
    agentInstructions: `${CHAT_SYSTEM_PROMPT}${personalityPrompt}${multiPersonaInstruction}`,
    context: getContextSummary(labContext),
    e2ee,
    labContext,
    lensResult,
    modelDisplay,
    modelId,
    personality,
    provider,
    reasoningEffort,
    systemPrompt,
    target,
    useCodexAgent,
    webSearch,
    msgText,
  };
}

export async function callDiscussionRoundAssistant({ request, thread, profileId, signal, onStream }) {
  if (!request.useCodexAgent) {
    return callChatAPIWithContinuation({
      system: request.systemPrompt,
      messages: request.apiMessages,
      maxTokens: CHAT_RESPONSE_MAX_TOKENS,
      signal,
      onStream,
      webSearch: request.webSearch,
      provider: request.provider,
      reasoningEffort: request.reasoningEffort,
    });
  }

  const result = await callCodexAgent({
    prompt: request.msgText || 'Continue the discussion.',
    instructions: request.agentInstructions,
    labContext: request.labContext,
    profileId,
    target: request.target,
    threadId: thread?.agentThreadId,
    history: request.apiMessages.slice(0, -1)
      .filter(message => typeof message.content === 'string')
      .map(message => ({ role: message.role, content: message.content })),
    signal,
    onStream,
  });
  if (thread) {
    thread.agentThreadId = result.threadId;
    thread.chatBackend = 'codex';
    thread.agentModel = result.model;
  }
  if (result.model) {
    request.modelId = result.model;
    request.modelDisplay = getAgentModelDisplay(
      result.model,
      getCachedAgentModelCatalog(request.agentId, request.target),
    );
  }
  request.context = mergeAgentContextReceipts(result.toolCalls, request.context);
  request.webSearch = Array.isArray(result.webSearches) && result.webSearches.length > 0;
  return result;
}

export function buildDiscussionAssistantMessage({
  fullText, request, aiResult, responseTruncated, attestation,
}) {
  const assistantMsg = {
    role: 'assistant',
    discussion: true,
    content: fullText,
    context: request.context,
    personalityName: request.personality.name,
    personalityIcon: request.personality.icon,
    provider: request.provider,
    agentId: request.agentId || '',
    modelId: request.modelId,
    modelDisplay: request.modelDisplay,
  };
  if (responseTruncated) {
    assistantMsg.truncated = true;
    assistantMsg.finishReason = aiResult.finishReason || 'length';
  }
  if (request.webSearch) assistantMsg.webSearch = true;
  if (request.useCodexAgent && Array.isArray(aiResult.drafts) && aiResult.drafts.length) {
    assistantMsg.agentDrafts = aiResult.drafts;
  }
  if (request.e2ee) {
    assistantMsg.e2ee = true;
    assistantMsg.attestation = attestation || null;
  }
  attachLensSources(assistantMsg, request.lensResult);
  return assistantMsg;
}

export function trackDiscussionUsage(request, usage) {
  if (request.useCodexAgent || !usage || !(usage.inputTokens || usage.outputTokens)) return;
  trackUsage(request.provider, request.modelId, usage.inputTokens, usage.outputTokens);
}
