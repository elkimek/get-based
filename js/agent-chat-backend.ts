import { createAgentToolRuntime, getCodexDynamicTools } from './agent-tool-runtime.js';
import { streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import {
  connectDetectedAgent, getAgentHostAgent, getAgentHostEffort, getAgentHostEndpoint, getAgentHostModel, getAgentHostTarget, getAgentHostToken,
} from './agent-chat-settings.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { AGENT_HOST_CAPABILITIES } from '../shared/agent-host-protocol.js';
import { createBrowserAgentToolDependencies } from './agent-tool-bindings.js';
import { buildAgentChatInstructions } from './agent-chat-context.js';

import type { AgentTurnOptions } from './agent-chat-client.js';
interface AgentChatOptions extends Pick<AgentTurnOptions, 'prompt' | 'target' | 'threadId' | 'history' | 'signal' | 'onStream'> {
  instructions: string; labContext: string; profileId?: string;
  images?: Array<{ base64: string; mediaType: string }>;
}

export async function callCodexAgent(options: AgentChatOptions) {
  const agent = getAgentHostAgent();
  const target = options.target || getAgentHostTarget(agent);
  const model = getAgentHostModel() || getAssistantExecutionRoute().model;
  const effort = getAgentHostEffort();
  const runtime = createAgentToolRuntime({
    readContext: async () => ({
      context: options.labContext,
      profileId: options.profileId || '',
      updatedAt: new Date().toISOString(),
    }),
    ...createBrowserAgentToolDependencies(options.profileId || ''),
  });
  await connectDetectedAgent(agent, {
    signal: options.signal,
    requiredCapabilities: [
      AGENT_HOST_CAPABILITIES.CHAT_STREAM,
      AGENT_HOST_CAPABILITIES.DYNAMIC_TOOLS,
      AGENT_HOST_CAPABILITIES.STRUCTURED_HEALTH_TOOLS,
      ...((options.images || []).length ? [AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD] : []),
    ],
  });
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
  const run = (threadId: string | undefined) => streamAgentTurn({
    endpoint,
    token,
    agent,
    target,
    model,
    effort,
    prompt: options.prompt,
    instructions: buildAgentChatInstructions(options.instructions, options.labContext, target),
    threadId,
    history: options.history,
    imageUploadIds,
    tools: getCodexDynamicTools(),
    toolRuntime: runtime,
    signal: options.signal,
    onStream: options.onStream,
  });
  const withDrafts = (result: Awaited<ReturnType<typeof streamAgentTurn>>) => ({ ...result, drafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: options.profileId || '' })) });
  try {
    const result = await run(options.threadId);
    return withDrafts(result);
  } catch (error) {
    if (!options.threadId || !(error instanceof Error)
      || (!error.message.includes('invalid thread session') && !error.message.includes('thread agent mismatch')
        && !error.message.includes('thread target mismatch'))) throw error;
    const result = await run(undefined);
    return withDrafts(result);
  }
}
