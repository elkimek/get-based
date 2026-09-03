// @ts-check

import { createAgentToolRuntime, getCodexDynamicTools } from './agent-tool-runtime.js';
import { streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import {
  connectDetectedCodex, getAgentHostEffort, getAgentHostEndpoint, getAgentHostModel, getAgentHostToken,
} from './agent-chat-settings.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { AGENT_HOST_CAPABILITIES } from '../shared/agent-host-protocol.js';

/**
 * @param {{
 *   prompt: string,
 *   instructions: string,
 *   labContext: string,
 *   profileId?: string,
 *   threadId?: string,
 *   history?: Array<{role: 'user'|'assistant', content: string}>,
 *   images?: Array<{base64: string, mediaType: string}>,
 *   signal?: AbortSignal,
 *   onStream?: (text: string) => void,
 * }} options
 */
export async function callCodexAgent(options) {
  const runtime = createAgentToolRuntime({
    readContext: async () => ({
      context: options.labContext,
      profileId: options.profileId || '',
      updatedAt: new Date().toISOString(),
    }),
  });
  await connectDetectedCodex({
    signal: options.signal,
    requiredCapabilities: [
      AGENT_HOST_CAPABILITIES.CHAT_STREAM,
      AGENT_HOST_CAPABILITIES.DYNAMIC_TOOLS,
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
  const run = threadId => streamAgentTurn({
    endpoint,
    token,
    model: getAgentHostModel() || getAssistantExecutionRoute().model,
    effort: getAgentHostEffort(),
    prompt: options.prompt,
    instructions: options.instructions,
    threadId,
    history: options.history,
    imageUploadIds,
    tools: getCodexDynamicTools(),
    toolRuntime: runtime,
    signal: options.signal,
    onStream: options.onStream,
  });
  try {
    return await run(options.threadId);
  } catch (error) {
    if (!options.threadId || !(error instanceof Error) || !error.message.includes('invalid thread session')) throw error;
    return run(undefined);
  }
}
