// @ts-check
// Structured, capability-gated feature inference through a local CLI adapter.

import { streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import { connectDetectedCodex, getAgentHostAgent, getAgentHostEndpoint, getAgentHostToken } from './agent-chat-settings.js';
import { AGENT_HOST_CAPABILITIES } from '../shared/agent-host-protocol.js';

/**
 * @param {{
 *   files?: Blob[],
 *   prompt: string,
 *   model: string,
 *   effort?: string,
 *   outputSchema?: Record<string, unknown>,
 *   signal?: AbortSignal,
 *   instructions?: string,
 *   consentKind?: string,
 *   onStream?: (text: string) => void,
 * }} options
 */
export async function callCodexFeature(options) {
  const files = Array.isArray(options.files) ? options.files : [];
  if (files.length > 4) throw new Error('The CLI companion can analyze up to 4 images or rendered PDF pages at once. Split this import into smaller files.');
  await connectDetectedCodex({
    signal: options.signal,
    requiredCapabilities: [
      AGENT_HOST_CAPABILITIES.CHAT_STREAM,
      ...(files.length ? [AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD] : []),
      ...(options.outputSchema ? [AGENT_HOST_CAPABILITIES.STRUCTURED_OUTPUT] : []),
    ],
  });
  const { requireAIProcessingApproval } = await import('./cloud-ai-consent.js');
  await requireAIProcessingApproval('codex-agent', { kind: options.consentKind || (files.length ? 'meal-photo' : 'text'), modelId: options.model });
  const endpoint = getAgentHostEndpoint();
  const token = getAgentHostToken();
  if (!token) throw new Error('The selected CLI agent is not connected.');
  const imageUploadIds = await Promise.all(files.map(file => uploadAgentImage({
    endpoint,
    token,
    file,
    signal: options.signal,
  })));

  return streamAgentTurn({
    endpoint,
    token,
    agent: getAgentHostAgent(),
    model: options.model,
    effort: options.effort || 'low',
    prompt: options.prompt,
    instructions: options.instructions || (options.outputSchema
      ? 'Perform only the requested structured feature analysis. Do not use web search or external tools. Return only data matching the supplied output schema.'
      : 'Perform only the requested Get-based feature analysis. Do not use web search or external tools. Return only the requested answer.'),
    imageUploadIds,
    outputSchema: options.outputSchema,
    purpose: 'feature',
    tools: [],
    signal: options.signal,
    onStream: options.onStream,
  });
}

export async function callCodexVisionFeature(options) {
  const files = Array.isArray(options.files) ? options.files : [];
  if (!files.length) throw new Error('At least one image is required.');
  return callCodexFeature(options);
}
