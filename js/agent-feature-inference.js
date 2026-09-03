// @ts-check
// Structured, capability-gated feature inference through a local CLI adapter.

import { streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import { connectDetectedCodex, getAgentHostEndpoint, getAgentHostToken } from './agent-chat-settings.js';
import { AGENT_HOST_CAPABILITIES } from '../shared/agent-host-protocol.js';

/**
 * @param {{
 *   files: Blob[],
 *   prompt: string,
 *   model: string,
 *   effort?: string,
 *   outputSchema: Record<string, unknown>,
 *   signal?: AbortSignal,
 * }} options
 */
export async function callCodexVisionFeature(options) {
  await connectDetectedCodex({
    signal: options.signal,
    requiredCapabilities: [
      AGENT_HOST_CAPABILITIES.CHAT_STREAM,
      AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD,
      AGENT_HOST_CAPABILITIES.STRUCTURED_OUTPUT,
    ],
  });
  const { requireAIProcessingApproval } = await import('./cloud-ai-consent.js');
  await requireAIProcessingApproval('codex-agent', { kind: 'meal-photo', modelId: options.model });
  const endpoint = getAgentHostEndpoint();
  const token = getAgentHostToken();
  if (!token) throw new Error('Codex is not connected.');
  const files = Array.isArray(options.files) ? options.files.slice(0, 4) : [];
  if (!files.length) throw new Error('At least one image is required.');

  const imageUploadIds = await Promise.all(files.map(file => uploadAgentImage({
    endpoint,
    token,
    file,
    signal: options.signal,
  })));

  return streamAgentTurn({
    endpoint,
    token,
    model: options.model,
    effort: options.effort || 'low',
    prompt: options.prompt,
    instructions: 'Perform only the requested structured feature analysis. Do not use web search or external tools. Return only data matching the supplied output schema.',
    imageUploadIds,
    outputSchema: options.outputSchema,
    purpose: 'feature',
    tools: [],
    signal: options.signal,
  });
}
