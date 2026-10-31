import { captureChatTurnScope } from './chat-turn-scope.js';
import { captureChatTurnFailure, projectChatTurnReviews } from './chat-turn-recovery.js';
import type { ChatToolActivity } from '../shared/chat-tool-activity.js';
import { requestsChatProposal, CHAT_PROPOSAL_REPAIR } from '../shared/chat-tool-instructions.js';
import { needsChatReviewRepair, chatReviewCompletionText } from '../shared/chat-review-contract.js';
import { captureChatControlAuthorization } from './chat-control-settings.js';
import { createAgentToolRuntime, getCodexDynamicTools, AGENT_TOOL_CONTRACT_VERSION } from './agent-tool-runtime.js';
import { streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import {
  connectDetectedAgent, getAgentHostAgent, getAgentHostEffort, getAgentHostEndpoint, getAgentHostModel, getAgentHostTarget, getAgentHostToken,
} from './agent-chat-settings.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { agentChatRequiredCapabilities } from '../shared/agent-host-protocol.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from './agent-tool-bindings.js';
import type { BrowserKnowledgeSearchOptions } from './agent-tool-bindings.js';
import { buildAgentChatInstructions, buildAgentApplicationContext, isPersonalAgentTarget } from './agent-chat-context.js';
import { state } from './state.js';

import type { AgentTurnOptions } from './agent-chat-client.js';
interface AgentChatOptions extends Pick<AgentTurnOptions, 'prompt' | 'target' | 'threadId' | 'history' | 'signal' | 'onStream'>, Pick<BrowserKnowledgeSearchOptions, 'onKnowledgeResult'> {
  onToolActivity?: ((activity: ChatToolActivity) => void) | undefined;
  instructions: string; labContext: string; profileId?: string;
  images?: Array<{ base64: string; mediaType: string }>;
  isCurrent?: () => boolean;
}

export async function callCodexAgent(options: AgentChatOptions) {
  const scope = captureChatTurnScope(state.currentProfile, () => options.isCurrent?.() !== false);
  const assertCurrent = () => scope.assert(options.signal);
  assertCurrent();
  const agent = getAgentHostAgent();
  const target = options.target || getAgentHostTarget(agent);
  const model = getAgentHostModel() || getAssistantExecutionRoute().model;
  const effort = getAgentHostEffort();
  const authorization = captureChatControlAuthorization();
  const runtime = createAgentToolRuntime({
    userMessage: options.prompt,
    readContext: async () => ({
      context: options.labContext,
      profileId: options.profileId || '',
      updatedAt: new Date().toISOString(),
    }),
    ...createBrowserAgentToolDependencies(options.profileId || '', { signal: options.signal, isCurrent: () => { try { assertCurrent(); return true; } catch { return false; } }, onKnowledgeResult: options.onKnowledgeResult }),
    canUseTools: authorization.current, createId: authorization.createId, onToolActivity: options.onToolActivity,
  });
  const local = !isPersonalAgentTarget(target);
  await connectDetectedAgent(agent, {
    signal: options.signal,
    requiredToolContractVersion: !isPersonalAgentTarget(target) && authorization.current() ? AGENT_TOOL_CONTRACT_VERSION : undefined,
    requiredCapabilities: agentChatRequiredCapabilities(local, (options.images || []).length > 0, authorization.current()),
  });
  assertCurrent();
  const applicationContext = local ? buildAgentApplicationContext(options.labContext, state.chatHistory, canDiscloseAgentDraftReview) : undefined;
  const endpoint = getAgentHostEndpoint();
  const token = getAgentHostToken();
  const uploadImages = async () => Promise.all((options.images || []).slice(0, 4).map(image => {
    const binary = atob(image.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return uploadAgentImage({
      endpoint,
      token,
      file: new Blob([bytes], { type: image.mediaType }),
      signal: options.signal,
    });
  }));
  const imageUploadIds = await uploadImages();
  let toolCount = 0;
  const toolRuntime = { execute: async (call: Parameters<typeof runtime.execute>[0]) => { assertCurrent(); if (++toolCount > 32) throw new Error('This chat exceeded its tool-call limit.'); const result = await runtime.execute(call); assertCurrent(); return result; } };
  const run = (threadId: string | undefined, repair = false) => { assertCurrent(); return streamAgentTurn({
    endpoint,
    token,
    agent,
    target,
    model,
    effort,
    prompt: repair ? CHAT_PROPOSAL_REPAIR : options.prompt,
    instructions: buildAgentChatInstructions(options.instructions, local ? '' : options.labContext, target, local, authorization.current()),
    applicationContext,
    threadId,
    history: options.history,
    imageUploadIds,
    tools: authorization.current() ? getCodexDynamicTools(runtime.tools) : [],
    chatControlsEnabled: authorization.current(),
    toolRuntime,
    signal: options.signal,
    onStream: options.onStream,
  }); };
  const withDrafts = (result: Awaited<ReturnType<typeof streamAgentTurn>>) => { assertCurrent(); const reviews = projectChatTurnReviews(runtime, options.profileId || ''); return { ...result, drafts: reviews.agentDrafts, turnOutcome: reviews.outcome }; };
  try {
    let result: Awaited<ReturnType<typeof streamAgentTurn>>;
    try { result = await run(options.threadId); }
    catch (error) {
      if (!options.threadId || !(error instanceof Error)
        || (!error.message.includes('invalid thread session') && !error.message.includes('thread agent mismatch')
          && !error.message.includes('thread target mismatch'))) throw error;
      result = await run(undefined);
    }
    const reviews = () => authorization.current() ? projectChatTurnReviews(runtime, options.profileId || '').outcome.reviews : [];
    assertCurrent();
    const reviewRequested = local && requestsChatProposal(options.prompt);
    if (needsChatReviewRepair(result.text, reviews(), reviewRequested)) {
      if (local && authorization.current() && toolCount < 32) {
        options.onStream?.('');
        const repaired = await run(result.threadId, true); assertCurrent();
        result = { ...repaired, toolCalls: [...result.toolCalls, ...repaired.toolCalls], webSearches: [...result.webSearches, ...repaired.webSearches],
          usage: { inputTokens: (result.usage?.inputTokens || 0) + (repaired.usage?.inputTokens || 0), outputTokens: (result.usage?.outputTokens || 0) + (repaired.usage?.outputTokens || 0) } };
      }
      result = { ...result, text: chatReviewCompletionText(result.text, reviews(), reviewRequested, toolCount) };
      options.onStream?.(result.text);
    }
    return withDrafts(result);
  } catch (error) { throw captureChatTurnFailure(error, runtime, options.profileId || '', scope.current, options.signal); }
}
