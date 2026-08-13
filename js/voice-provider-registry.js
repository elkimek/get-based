// @ts-check
// voice-provider-registry.js — literal lazy imports for independent voice providers.

export { getVoiceProviderDefinition } from './voice-provider-catalog.js';

export async function loadVoiceProvider(providerId) {
  if (providerId === 'openrouter') {
    return (await import('./voice-provider-ai-cloud.js')).openRouterVoiceProvider;
  }
  if (providerId === 'ppq') {
    return (await import('./voice-provider-ai-cloud.js')).ppqVoiceProvider;
  }
  if (providerId === 'venice') {
    return (await import('./voice-provider-ai-cloud.js')).veniceVoiceProvider;
  }
  if (providerId === 'local-server') {
    return (await import('./voice-provider-local-server.js')).localServerVoiceProvider;
  }
  if (providerId === 'xai') {
    return (await import('./voice-provider-xai.js')).xaiVoiceProvider;
  }
  if (providerId === 'elevenlabs') {
    return (await import('./voice-provider-elevenlabs.js')).elevenLabsVoiceProvider;
  }
  return (await import('./voice-provider-browser-local.js')).browserLocalVoiceProvider;
}
