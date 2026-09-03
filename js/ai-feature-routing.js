// @ts-check
// Routes non-chat text features through the selected assistant, including CLI subscriptions.

import { callClaudeAPI, getActiveModelDisplay, getActiveModelId, getAIProvider, hasAIProvider, isAIPaused, supportsVision } from './api.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { getAgentHostEffort } from './agent-chat-settings.js';

export function hasAssistantFeatureProvider() {
  if (isAIPaused()) return false;
  const route = getAssistantExecutionRoute();
  return route.adapter === 'codex' ? route.available : hasAIProvider();
}

/** @param {'text'|'image'} modality */
export function assistantFeatureSupports(modality) {
  if (isAIPaused()) return false;
  const route = getAssistantExecutionRoute();
  if (route.adapter !== 'codex') return modality === 'text' ? hasAIProvider() : supportsVision();
  return route.available && (modality === 'text' || route.inputModalities?.includes(modality));
}

export function getAssistantFeatureIdentity() {
  const route = getAssistantExecutionRoute();
  if (route.adapter === 'codex') {
    return {
      provider: 'codex-agent', modelId: route.model || 'cli-default',
      modelDisplay: route.modelDisplay || route.model || 'CLI default', providerDisplay: route.providerDisplay || 'Codex CLI',
      subscription: true,
    };
  }
  const provider = getAIProvider();
  return {
    provider, modelId: getActiveModelId(provider), modelDisplay: getActiveModelDisplay(provider),
    providerDisplay: provider, subscription: false,
  };
}

function textContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw new Error('This feature includes content the selected CLI adapter cannot process.');
  const texts = content.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text);
  return texts.join('\n\n');
}

function dataUrlBlob(value) {
  // 20 MiB of image bytes expands to under 28 MiB as base64. Reject larger
  // values before decoding so a pasted data URL cannot create an unbounded
  // intermediate string in the browser.
  if (typeof value !== 'string' || value.length > 28_000_000) {
    throw new Error('The selected image is too large for the CLI companion.');
  }
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error('The selected CLI adapter only accepts embedded JPEG, PNG, WebP, or GIF images.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

function featureImages(messages) {
  return (Array.isArray(messages) ? messages : []).flatMap(message => Array.isArray(message?.content)
    ? message.content.flatMap(item => {
      const url = item?.type === 'image_url' ? item?.image_url?.url : '';
      return url ? [dataUrlBlob(url)] : [];
    })
    : []);
}

function featurePrompt(messages) {
  return (Array.isArray(messages) ? messages : []).map(message => {
    const role = message?.role === 'assistant' ? 'Previous assistant response' : 'User request';
    return `${role}:\n${textContent(message?.content)}`;
  }).join('\n\n').trim();
}

/**
 * @param {Record<string, any>} options
 * @param {string} [provider]
 */
export async function callAssistantFeatureAI(options, provider) {
  if (isAIPaused()) throw new Error('AI features are paused.');
  const route = getAssistantExecutionRoute();
  if (route.adapter !== 'codex') return callClaudeAPI(options, provider);
  if (!route.available) throw new Error('The selected CLI agent is not connected.');
  const prompt = featurePrompt(options.messages);
  const files = featureImages(options.messages);
  if (!prompt) throw new Error('The feature request is empty.');
  if (files.length && !route.inputModalities?.includes('image')) {
    throw new Error('The selected CLI model does not report image support.');
  }
  const { callCodexFeature } = await import('./agent-feature-inference.js');
  return callCodexFeature({
    files,
    prompt,
    instructions: String(options.system || '').trim() || undefined,
    model: route.model,
    effort: options.reasoningEffort || getAgentHostEffort() || 'low',
    outputSchema: options.jsonSchema,
    signal: options.signal,
    onStream: options.onStream,
    consentKind: options.consentKind || 'text',
  });
}
