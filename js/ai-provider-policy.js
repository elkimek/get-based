// @ts-check
// ai-provider-policy.js — provider-neutral inference destinations and policies.

import {
  getCustomApiUrl,
  getOllamaConfig,
  getOllamaMainModel,
} from './api-provider-storage.js';
import {
  getLocalAiExecutionLocation,
  isCloudModel,
} from './local-ai-provider-shared.js';

const BUILTIN_PROVIDERS = Object.freeze({
  'codex-agent': Object.freeze({
    label: 'OpenAI Codex',
    endpoint: 'https://chatgpt.com',
    privacyUrl: 'https://openai.com/policies/privacy-policy/',
    termsUrl: 'https://openai.com/policies/terms-of-use/',
  }),
  openrouter: Object.freeze({
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    privacyUrl: 'https://openrouter.ai/privacy',
    termsUrl: 'https://openrouter.ai/terms',
  }),
  ppq: Object.freeze({
    label: 'PPQ',
    endpoint: 'https://api.ppq.ai/v1',
    privacyUrl: 'https://ppq.ai/privacy',
    termsUrl: 'https://ppq.ai/terms',
  }),
  venice: Object.freeze({
    label: 'Venice',
    endpoint: 'https://api.venice.ai/api/v1',
    privacyUrl: 'https://venice.ai/legal/privacy-policy',
    termsUrl: 'https://venice.ai/legal/tos',
  }),
  xai: Object.freeze({
    label: 'xAI',
    endpoint: 'https://api.x.ai/v1',
    privacyUrl: 'https://x.ai/legal/data-processing-addendum',
    termsUrl: 'https://x.ai/legal/terms-of-service-enterprise',
  }),
  elevenlabs: Object.freeze({
    label: 'ElevenLabs',
    endpoint: 'https://api.elevenlabs.io/v1',
    privacyUrl: 'https://elevenlabs.io/dpa',
    termsUrl: 'https://elevenlabs.io/elevenapi-terms',
  }),
});

function cleanUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

export function safeInferenceOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch { return ''; }
}

function deploymentProviderMetadata(provider) {
  const configured = /** @type {any} */ (globalThis).GETBASED_DEPLOYMENT_CONFIG?.aiProviders?.[provider] || {};
  return {
    label: String(configured.label || configured.name || '').trim(),
    privacyUrl: cleanUrl(configured.privacyUrl),
    termsUrl: cleanUrl(configured.termsUrl),
  };
}

function selectedEndpoint(provider, explicitEndpoint) {
  if (explicitEndpoint) return cleanUrl(explicitEndpoint) || String(explicitEndpoint || '').trim();
  if (provider === 'custom') return getCustomApiUrl();
  if (provider === 'ollama') return getOllamaConfig().url;
  if (provider === 'routstr') return localStorage.getItem('labcharts-routstr-node') || '';
  return BUILTIN_PROVIDERS[provider]?.endpoint || '';
}

function selectedPolicy(provider, cloudModel) {
  // Routstr is a protocol and its independently selected nodes do not share a
  // central recipient identity or policy set. Static deployment metadata could
  // also misidentify a node after the user switches to a different Nostr
  // discovery result, so always identify the actual endpoint instead.
  if (provider === 'routstr') {
    return { label: '', privacyUrl: '', termsUrl: '' };
  }
  const builtin = BUILTIN_PROVIDERS[provider] || (provider === 'ollama' && cloudModel ? {
    label: 'Ollama Cloud',
    privacyUrl: 'https://ollama.com/privacy',
    termsUrl: 'https://ollama.com/terms',
  } : {});
  const configured = deploymentProviderMetadata(provider);
  return {
    label: configured.label || builtin.label || '',
    privacyUrl: configured.privacyUrl || builtin.privacyUrl || '',
    termsUrl: configured.termsUrl || builtin.termsUrl || '',
  };
}

function destinationLabel(provider, boundary, origin, policyLabel) {
  if (policyLabel) return policyLabel;
  if (provider === 'browser-local') return 'the on-device AI engine';
  if (provider === 'routstr') return origin ? `the Routstr node at ${origin}` : 'the selected Routstr node';
  if (provider === 'custom') return origin ? `the custom API at ${origin}` : 'the configured custom API';
  if (provider === 'ollama') {
    if (boundary === 'same-device') return 'the AI server on this device';
    return origin ? `the AI server at ${origin}` : 'the configured AI server';
  }
  if (provider === 'local-server') {
    if (boundary === 'same-device') return 'the voice server on this device';
    return origin ? `the voice server at ${origin}` : 'the configured voice server';
  }
  return provider || 'the selected AI provider';
}

function scopeFor(provider, boundary, origin, cloudModel) {
  if (boundary === 'same-device') return 'same-device';
  if (BUILTIN_PROVIDERS[provider]) return provider;
  if (provider === 'ollama' && cloudModel) return `ollama-cloud:${origin || 'unconfigured'}`;
  return `${provider || 'unknown'}:${origin || 'unconfigured'}`;
}

/**
 * Resolve the actual inference trust boundary. Frontend hostname is never
 * considered here; only the selected endpoint and explicit cloud-model state
 * affect the result.
 *
 * @param {string} provider
 * @param {{ endpoint?: string, modelId?: string }} [options]
 */
export function getAIProcessingDestination(provider, { endpoint = '', modelId = '' } = {}) {
  const selectedModel = provider === 'ollama' ? (modelId || getOllamaMainModel()) : modelId;
  const cloudModel = provider === 'ollama' && isCloudModel(selectedModel);
  const resolvedEndpoint = selectedEndpoint(provider, endpoint);
  const origin = safeInferenceOrigin(resolvedEndpoint);
  let boundary;
  if (provider === 'browser-local') boundary = 'same-device';
  else if (cloudModel) boundary = 'remote';
  else {
    const execution = getLocalAiExecutionLocation(resolvedEndpoint);
    boundary = execution === 'local'
      ? 'same-device'
      : execution === 'lan'
        ? 'private-network'
        : 'remote';
  }
  const policy = selectedPolicy(provider, cloudModel);
  const label = destinationLabel(provider, boundary, origin, policy.label);
  const route = provider === 'codex-agent'
    ? 'through the local Get-based Agent Host to OpenAI Codex'
    : boundary === 'same-device'
    ? 'on this device'
    : boundary === 'private-network'
      ? `directly from this browser to ${origin || 'the configured endpoint'} on your local network`
      : `directly from this browser to ${origin || 'the configured remote endpoint'}`;
  return {
    provider,
    endpoint: resolvedEndpoint,
    origin,
    boundary,
    scope: scopeFor(provider, boundary, origin, cloudModel),
    label,
    route,
    privacyUrl: policy.privacyUrl,
    termsUrl: policy.termsUrl,
    cloudModel,
  };
}
