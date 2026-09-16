// @ts-check
// Structured, capability-gated feature inference through a local CLI adapter.

import { listAgentExecutionTargets, streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import { connectDetectedAgent, getAgentHostAgent, getAgentHostEffort, getAgentHostEndpoint, getAgentHostTarget, getAgentHostToken } from './agent-chat-settings.js';
import { AGENT_HOST_CAPABILITIES, AGENT_HOST_MAX_PROMPT_CHARS } from '../shared/agent-host-protocol.js';

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
  if (!options.prompt?.trim()) throw new Error('The AI request is empty. Please retry.');
  if (options.prompt.trim().length > AGENT_HOST_MAX_PROMPT_CHARS) throw new Error('This AI request exceeds the Companion’s size limit. Split the assessment into smaller groups and retry.');
  const files = Array.isArray(options.files) ? options.files : [];
  if (files.length > 4) throw new Error('The CLI companion can analyze up to 4 images or rendered PDF pages at once. Split this import into smaller files.');
  const target = getAgentHostTarget();
  const agent = getAgentHostAgent();
  const effort = options.effort ?? getAgentHostEffort();
  if (target !== 'local' && files.length) throw new Error('This gateway supports text explanations. Choose Local CLI for image imports.');
  await connectDetectedAgent(agent, {
    signal: options.signal,
    requiredTextFeatureTarget: target === 'local' ? undefined : target,
    requiredCapabilities: [
      AGENT_HOST_CAPABILITIES.CHAT_STREAM,
      ...(target !== 'local' ? [AGENT_HOST_CAPABILITIES.EXECUTION_TARGETS] : []),
      ...(files.length ? [AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD] : []),
      ...(options.outputSchema ? [AGENT_HOST_CAPABILITIES.STRUCTURED_OUTPUT] : []),
    ],
  });
  const endpoint = getAgentHostEndpoint();
  const token = getAgentHostToken();
  if (!token) throw new Error('The selected agent is not connected.');
  if (target !== 'local') {
    const targets = await listAgentExecutionTargets({ endpoint, token, agent, signal: options.signal });
    if (!targets.some(item => item.id === target && item.supportsTextFeatureJobs === true)) {
      throw new Error('This Companion does not support text explanations on the selected gateway yet. Update the Companion in AI settings.');
    }
  }
  const { requireAIProcessingApproval } = await import('./cloud-ai-consent.js');
  await requireAIProcessingApproval(target === 'local' ? 'codex-agent' : 'personal-agent-gateway', { kind: options.consentKind || (files.length ? 'meal-photo' : 'text'), modelId: options.model });
  const imageUploadIds = await Promise.all(files.map(file => uploadAgentImage({
    endpoint,
    token,
    file,
    signal: options.signal,
  })));

  return streamAgentTurn({
    endpoint,
    token,
    agent,
    target,
    model: options.model,
    effort,
    prompt: options.prompt,
    instructions: options.instructions || (options.outputSchema
      ? 'Perform only the requested structured feature analysis. Do not use web search or external tools. Return only data matching the supplied output schema.'
      : 'Perform only the requested getbased feature analysis. Do not use web search or external tools. Return only the requested answer.'),
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
