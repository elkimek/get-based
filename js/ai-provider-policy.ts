// ai-provider-policy.js — provider-neutral inference destinations and policies.

import { getAgentHostAgent, getAgentHostModel } from './agent-chat-settings.js';

import {
  getCustomApiUrl,
  getOllamaConfig,
  getOllamaMainModel,
} from './api-provider-storage.js';
import {
  getLocalAiExecutionLocation,
  isCloudModel,
} from './local-ai-provider-shared.js';

interface ProviderPolicy {
  label: string;
  endpoint: string;
  privacyUrl: string;
  termsUrl: string;
}
export interface AIProcessingOptions {
  endpoint?: string | undefined;
  modelId?: unknown;
}
export interface AIProcessingDestination {
  provider: string;
  endpoint: string;
  origin: string;
  boundary: 'same-device' | 'private-network' | 'remote';
  cloudModel: boolean;
  scope: string;
  label: string;
  route: string;
  privacyUrl: string;
  termsUrl: string;
}
interface ProviderDeploymentConfig {
  GETBASED_DEPLOYMENT_CONFIG?: {aiProviders?: Record<string, Partial<Record<'label' | 'name' | 'privacyUrl' | 'termsUrl', unknown>>>};
}

function providerPolicy(label: string, endpoint: string, privacyUrl: string, termsUrl: string) {
  return Object.freeze({label, endpoint, privacyUrl, termsUrl});
}

const BUILTIN_PROVIDERS: Readonly<Record<string, Readonly<ProviderPolicy>>> = Object.freeze({
  'personal-agent-gateway': providerPolicy('Personal agent gateway', '', '', ''),
  'codex-agent': providerPolicy(
    'OpenAI Codex',
    'https://chatgpt.com',
    'https://openai.com/policies/privacy-policy/',
    'https://openai.com/policies/terms-of-use/',
  ),
  openrouter: providerPolicy(
    'OpenRouter',
    'https://openrouter.ai/api/v1',
    'https://openrouter.ai/privacy',
    'https://openrouter.ai/terms',
  ),
  ppq: providerPolicy(
    'PPQ',
    'https://api.ppq.ai/v1',
    'https://ppq.ai/privacy',
    'https://ppq.ai/terms',
  ),
  venice: providerPolicy(
    'Venice',
    'https://api.venice.ai/api/v1',
    'https://venice.ai/legal/privacy-policy',
    'https://venice.ai/legal/tos',
  ),
  xai: providerPolicy(
    'xAI',
    'https://api.x.ai/v1',
    'https://x.ai/legal/data-processing-addendum',
    'https://x.ai/legal/terms-of-service-enterprise',
  ),
  elevenlabs: providerPolicy(
    'ElevenLabs',
    'https://api.elevenlabs.io/v1',
    'https://elevenlabs.io/dpa',
    'https://elevenlabs.io/elevenapi-terms',
  ),
});

function cleanUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

export function safeInferenceOrigin(value: unknown) {
  try { return new URL(String(value || '')).origin; } catch { return ''; }
}

function deploymentProviderMetadata(provider: string) {
  const configured = (globalThis as unknown as ProviderDeploymentConfig).GETBASED_DEPLOYMENT_CONFIG?.aiProviders?.[provider] || {};
  return {
    label: String(configured.label || configured.name || '').trim(),
    privacyUrl: cleanUrl(configured.privacyUrl),
    termsUrl: cleanUrl(configured.termsUrl),
  };
}

function selectedEndpoint(provider: string, explicitEndpoint: string) {
  if (explicitEndpoint) return cleanUrl(explicitEndpoint) || String(explicitEndpoint || '').trim();
  if (provider === 'custom') return getCustomApiUrl();
  if (provider === 'ollama') return getOllamaConfig().url;
  if (provider === 'routstr') return localStorage.getItem('labcharts-routstr-node') || '';
  return BUILTIN_PROVIDERS[provider]?.endpoint || '';
}

function selectedPolicy(provider: string, cloudModel: boolean) {
  // Routstr is a protocol and its independently selected nodes do not share a
  // central recipient identity or policy set. Static deployment metadata could
  // also misidentify a node after the user switches to a different Nostr
  // discovery result, so always identify the actual endpoint instead.
  if (provider === 'routstr') {
    return { label: '', privacyUrl: '', termsUrl: '' };
  }
  const builtin: Partial<ProviderPolicy> = BUILTIN_PROVIDERS[provider] || (provider === 'ollama' && cloudModel ? {
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

function destinationLabel(provider: string, boundary: AIProcessingDestination['boundary'], origin: string, policyLabel: string) {
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

function scopeFor(provider: string, boundary: AIProcessingDestination['boundary'], origin: string, cloudModel: boolean) {
  if (boundary === 'same-device') return 'same-device';
  if (BUILTIN_PROVIDERS[provider]) return provider;
  if (provider === 'ollama' && cloudModel) return `ollama-cloud:${origin || 'unconfigured'}`;
  return `${provider || 'unknown'}:${origin || 'unconfigured'}`;
}

export function getAIProcessingDestination(provider: string, { endpoint = '', modelId = '' }: AIProcessingOptions = {}): AIProcessingDestination {
  const agent = provider === 'codex-agent' ? getAgentHostAgent() : '';
  if (agent && agent !== 'codex') {
    const model = modelId || getAgentHostModel() || 'default';
    return {
      provider, endpoint: '', origin: '', boundary: 'remote', cloudModel: false,
      scope: `cli-agent:${encodeURIComponent(agent)}:${encodeURIComponent(model as string)}`,
      label: `CLI adapter ${agent} and its configured model provider`,
      route: `through the local getbased Companion to CLI adapter ${agent} (model: ${model}) and its configured model provider; processing may occur remotely`,
      privacyUrl: '', termsUrl: '',
    };
  }
  const selectedModel = provider === 'ollama' ? (modelId || getOllamaMainModel()) : modelId;
  const cloudModel = provider === 'ollama' && isCloudModel(selectedModel);
  const resolvedEndpoint = selectedEndpoint(provider, endpoint);
  const origin = safeInferenceOrigin(resolvedEndpoint);
  let boundary: AIProcessingDestination['boundary'];
  if (provider === 'personal-agent-gateway') boundary = 'remote';
  else if (provider === 'browser-local') boundary = 'same-device';
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
  const route = provider === 'personal-agent-gateway'
    ? 'through the local getbased Companion to your selected personal agent gateway and its configured model provider'
    : provider === 'codex-agent'
    ? 'through the local getbased Agent Host to OpenAI Codex'
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
