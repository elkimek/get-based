import type { ChatToolActivity } from '../shared/chat-tool-activity.js';
import { captureChatControlAuthorization, CHAT_CONTROLS_OFF_INSTRUCTIONS } from './chat-control-settings.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
// Direct providers share the browser's semantic tool runtime and approval cards.
import { callClaudeAPI, getAIProvider, getActiveModelId, getVeniceE2EE, isE2EEModel,
  getVeniceKey, getOpenRouterKey, getPpqKey, getRoutstrKey, getRoutstrNodeUrl,
  getCustomApiUrl, getCustomApiKey, getOllamaConfig } from './api.js';
import { state } from './state.js';
import { createAgentToolRuntime, getAgentToolCatalog } from './agent-tool-runtime.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from './agent-tool-bindings.js';
import type { BrowserKnowledgeSearchOptions } from './agent-tool-bindings.js';
import { buildAgentDraftReviewContext } from './agent-chat-context.js';
import { CHAT_TOOL_INSTRUCTIONS } from '../shared/chat-tool-instructions.js';
import { runChatToolLoop } from './chat-tool-loop.js';
import type { ToolCompletion } from './chat-tool-loop.js';
import type { ProviderRequestOptions } from './api-openai-compatible.js';

export interface DirectChatToolOptions extends ProviderRequestOptions, Pick<BrowserKnowledgeSearchOptions, 'onKnowledgeResult'> {
  onToolActivity?: ((activity: ChatToolActivity) => void) | undefined;
  provider: string; prompt: string; labContext: string; profileId: string;
  isCurrent?: () => boolean;
  appControlSession?: import('./app-control-session.js').AppControlSession | undefined;
}
/** Compared only in memory; credentials never enter a tool, prompt or persisted receipt. */
function recipientIdentity(provider: string) {
  if (provider === 'ollama') return JSON.stringify(getOllamaConfig());
  if (provider === 'venice') return JSON.stringify([getVeniceKey(), getVeniceE2EE()]);
  if (provider === 'openrouter') return getOpenRouterKey();
  if (provider === 'ppq') return getPpqKey();
  if (provider === 'routstr') return JSON.stringify([getRoutstrNodeUrl(), getRoutstrKey()]);
  if (provider === 'custom') return JSON.stringify([getCustomApiUrl(), getCustomApiKey()]);
  return '';
}

export async function callDirectChatWithTools(options: DirectChatToolOptions) {
  const { provider, prompt, labContext, profileId, isCurrent: ownerCurrent, onKnowledgeResult, appControlSession, onToolActivity: _activity, ...request } = options;
  const model = String(options.modelOverride || getActiveModelId(provider));
  const selectedModel = getActiveModelId(provider), recipient = recipientIdentity(provider);
  const history = state.chatHistory, thread = state.currentThreadId, disclosure = getContextDisclosureFingerprint();
  const current = () => state.currentProfile === profileId && state.chatHistory === history && state.currentThreadId === thread
    && getContextDisclosureFingerprint() === disclosure && getAIProvider() === provider && getActiveModelId(provider) === selectedModel && recipientIdentity(provider) === recipient && (!ownerCurrent || ownerCurrent());
  const authorization = captureChatControlAuthorization();
  const runtime = createAgentToolRuntime({ userMessage: prompt,
    readContext: () => ({ context: labContext, profileId }),
    ...createBrowserAgentToolDependencies(profileId, { signal: options.signal, isCurrent: current, onKnowledgeResult, appControlSession }),
    canUseTools: authorization.current, createId: authorization.createId, onToolActivity: options.onToolActivity,
  });
  const result = await runChatToolLoop({ ...request, tools: (authorization.current() ? getAgentToolCatalog() : []).map(tool => ({ type: 'function', function: {
    name: tool.name, description: tool.description, parameters: tool.inputSchema,
  } })),
    system: `${String(options.system || '')}\n\n${authorization.current() ? CHAT_TOOL_INSTRUCTIONS + buildAgentDraftReviewContext(history, canDiscloseAgentDraftReview) : CHAT_CONTROLS_OFF_INSTRUCTIONS}`,
    // Venice's encrypted route carries actions inside encrypted message content.
    protocol: provider === 'venice' && (getVeniceE2EE() || isE2EEModel(model)) ? 'structured' : 'native',
    canRepair: authorization.current,
    hasPreparedReview: () => authorization.current() && (runtime.getDrafts().length > 0 || appControlSession?.hasPreparedReview() === true),
    isCurrent: current, execute: call => runtime.execute(call),
    complete: async round => {
      const response: unknown = await callClaudeAPI({ ...round, requestCurrent: current, modelOverride: model }, provider);
      if (!response || typeof response !== 'object' || !('text' in response) || typeof response.text !== 'string') throw new Error('The provider returned an invalid chat response.');
      return response as ToolCompletion;
    },
  });
  return { ...result, drafts: runtime.getDrafts().map(draft => ({ ...draft, profileId })) };
}
