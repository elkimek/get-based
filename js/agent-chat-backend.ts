import type { ChatToolActivity } from '../shared/chat-tool-activity.js';
import { claimsPreparedChatProposal, requestsChatProposal, CHAT_PROPOSAL_REPAIR, CHAT_PROPOSAL_MISSING, CHAT_PROPOSAL_NONE } from '../shared/chat-tool-instructions.js';
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
import { getContextDisclosureFingerprint } from './lab-context-settings.js';

import type { AgentTurnOptions } from './agent-chat-client.js';
interface AgentChatOptions extends Pick<AgentTurnOptions, 'prompt' | 'target' | 'threadId' | 'history' | 'signal' | 'onStream'>, Pick<BrowserKnowledgeSearchOptions, 'onKnowledgeResult'> {
  onToolActivity?: ((activity: ChatToolActivity) => void) | undefined;
  instructions: string; labContext: string; profileId?: string;
  images?: Array<{ base64: string; mediaType: string }>;
  isCurrent?: () => boolean;
  appControlSession?: import('./app-control-session.js').AppControlSession | undefined;
}

export async function callCodexAgent(options: AgentChatOptions) {
  const owner = { profile: state.currentProfile, root: state.importedData, history: state.chatHistory, thread: state.currentThreadId, disclosure: getContextDisclosureFingerprint() };
  const assertCurrent = () => {
    options.signal?.throwIfAborted();
    if (state.currentProfile !== owner.profile || state.importedData !== owner.root || state.chatHistory !== owner.history || state.currentThreadId !== owner.thread || getContextDisclosureFingerprint() !== owner.disclosure || options.isCurrent?.() === false) throw new DOMException('The chat request is no longer current.', 'AbortError');
  };
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
    ...createBrowserAgentToolDependencies(options.profileId || '', { signal: options.signal, isCurrent: () => { try { assertCurrent(); return true; } catch { return false; } }, onKnowledgeResult: options.onKnowledgeResult,
      appControlSession: !isPersonalAgentTarget(target) ? options.appControlSession : undefined }),
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
    tools: authorization.current() ? getCodexDynamicTools() : [],
    chatControlsEnabled: authorization.current(),
    toolRuntime,
    signal: options.signal,
    onStream: options.onStream,
  }); };
  const withDrafts = (result: Awaited<ReturnType<typeof streamAgentTurn>>) => { assertCurrent(); return { ...result, drafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: options.profileId || '' })) }; };
  let result: Awaited<ReturnType<typeof streamAgentTurn>>;
  try { result = await run(options.threadId); }
  catch (error) {
    if (!options.threadId || !(error instanceof Error)
      || (!error.message.includes('invalid thread session') && !error.message.includes('thread agent mismatch')
        && !error.message.includes('thread target mismatch'))) throw error;
    result = await run(undefined);
  }
  const hasReview = () => authorization.current() && (runtime.getDrafts().length > 0 || options.appControlSession?.hasPreparedReview() === true);
  assertCurrent();
  const reviewRequested = local && requestsChatProposal(options.prompt);
  if (!hasReview() && (reviewRequested || claimsPreparedChatProposal(result.text))) {
    if (local && authorization.current() && toolCount < 32) {
      options.onStream?.('');
      const repaired = await run(result.threadId, true); assertCurrent();
      result = { ...repaired, toolCalls: [...result.toolCalls, ...repaired.toolCalls], webSearches: [...result.webSearches, ...repaired.webSearches],
        usage: { inputTokens: (result.usage?.inputTokens || 0) + (repaired.usage?.inputTokens || 0), outputTokens: (result.usage?.outputTokens || 0) + (repaired.usage?.outputTokens || 0) } };
    }
    if (!hasReview()) result = { ...result, text: claimsPreparedChatProposal(result.text, reviewRequested) || !toolCount ? CHAT_PROPOSAL_MISSING : `${CHAT_PROPOSAL_NONE}\n\n${result.text}` };
    options.onStream?.(result.text);
  }
  return withDrafts(result);
}
