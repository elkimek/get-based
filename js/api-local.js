// @ts-check
// Local AI request planning and provider-adapter orchestration.

import { getOllamaConfig, getOllamaMainModel } from './api-provider-storage.js';
import { prepareLocalAiRuntimeHandoff, rememberLocalAiRuntimeUse } from './local-ai-lifecycle.js';
import { getLocalAiProviderAdapter } from './local-ai-provider-registry.js';
import { discoverLocalAI, getCachedLocalAiModelDetail, markCachedLocalAiModelLoaded } from './local-ai-discovery.js';

function contentTokenEstimate(content, charsPerToken) {
  if (typeof content === 'string') return content.length / charsPerToken;
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, block) => {
    if (typeof block?.text === 'string') return total + block.text.length / charsPerToken;
    if (block?.type === 'image' || block?.type === 'image_url') return total + 1600;
    return total;
  }, 0);
}

export function estimateLocalAiPromptTokens({ system, messages, promptCharsPerToken }) {
  // 3.5 chars/token fits prose; dense numeric tables (lab reports) tokenize
  // closer to 3, so callers with that input shape pass promptCharsPerToken.
  const charsPerToken = Number(promptCharsPerToken) > 0 ? Number(promptCharsPerToken) : 3.5;
  const contentTokens = String(system || '').length / charsPerToken
    + (Array.isArray(messages) ? messages.reduce((total, message) => total + contentTokenEstimate(message?.content, charsPerToken), 0) : 0);
  const messageOverhead = (Array.isArray(messages) ? messages.length : 0) * 6 + (system ? 6 : 0);
  return Math.ceil(contentTokens) + messageOverhead;
}

export function planLocalAiRequest(opts, modelDetail) {
  const requestedMaxTokens = Math.max(1, Number(opts.maxTokens) || 4096);
  const estimatedPromptTokens = estimateLocalAiPromptTokens(opts);
  const contextLength = Number(modelDetail?.contextLength) || 0;
  let maxTokens = requestedMaxTokens;
  let availableOutputTokens = null;
  if (contextLength > 0) {
    const safetyTokens = Math.max(256, Math.ceil(contextLength * 0.04));
    availableOutputTokens = contextLength - estimatedPromptTokens - safetyTokens;
    const minimumOutputTokens = Math.max(64, Math.min(requestedMaxTokens, Number(opts.minOutputTokens) || 256));
    if (availableOutputTokens < minimumOutputTokens) {
      const maxContext = Number(modelDetail?.maxContextLength) || 0;
      const maxHint = maxContext > contextLength ? ` This model supports up to ${maxContext.toLocaleString()} tokens.` : '';
      throw new Error(`Local AI context is too small for this request: about ${estimatedPromptTokens.toLocaleString()} prompt tokens plus output, but ${modelDetail?.name || 'the model'} is loaded with ${contextLength.toLocaleString()}.${maxHint} Reload it with a larger context or use a smaller/chunked input.`);
    }
    maxTokens = Math.min(requestedMaxTokens, availableOutputTokens);
  }
  return {
    maxTokens,
    diagnostics: {
      estimatedPromptTokens,
      requestedMaxTokens,
      plannedMaxTokens: maxTokens,
      contextLength,
      maxContextLength: Number(modelDetail?.maxContextLength) || 0,
      quantLevel: modelDetail?.quantLevel || '',
      modelSize: Number(modelDetail?.size) || 0,
      vramAllocated: Number(modelDetail?.vramAllocated) || 0,
      executionLocation: modelDetail?.executionLocation || 'unknown',
    },
  };
}

function publishLoadedModel(config, model, runtimePatch = {}) {
  const result = markCachedLocalAiModelLoaded(config.url, model, config.apiKey, runtimePatch);
  if (result && typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent('local-ai-discovery-updated', { detail: result }));
  }
}

function roundContextLength(required, maximum) {
  const steps = [4096, 8192, 16384, 32768, 65536, 131072, 262144];
  const target = steps.find(step => step >= required) || required;
  return maximum > 0 ? Math.min(target, maximum) : target;
}

/** Legacy native Ollama export retained for existing callers and tests. */
export async function callOllamaChat({ system, messages, maxTokens, onStream, signal }) {
  const config = getOllamaConfig();
  const model = getOllamaMainModel();
  const adapter = getLocalAiProviderAdapter('ollama');
  if (!adapter.infer) throw new Error('Ollama inference adapter is unavailable.');
  await prepareLocalAiRuntimeHandoff({ baseUrl: config.url, model });
  try {
    return await adapter.infer({
      config,
      model,
      opts: { system, messages, maxTokens, onStream, signal },
      plan: { maxTokens: Math.max(1, Number(maxTokens) || 4096) },
      contextLength: 0,
      nativeContextOverride: false,
    });
  } finally {
    rememberLocalAiRuntimeUse({ baseUrl: config.url, providerId: 'ollama', model });
  }
}

export async function callOpenAICompatibleLocalAPI(opts) {
  const config = getOllamaConfig();
  const model = getOllamaMainModel();
  const url = config.url.replace(/\/+$/, '');
  await prepareLocalAiRuntimeHandoff({ baseUrl: url, model });
  let modelDetail = getCachedLocalAiModelDetail(url, model, config.apiKey);
  // Routine chat avoids provider probes before its first token. Imports opt in
  // because adapters need exact context and native capability metadata.
  if (!modelDetail && opts.preferNativeContext) {
    const discovery = await discoverLocalAI(url, config.apiKey);
    modelDetail = discovery.modelDetails?.find(detail => detail.name === model) || null;
  }

  const estimatedPromptTokens = estimateLocalAiPromptTokens(opts);
  const requestedOutput = Math.max(1, Number(opts.maxTokens) || 4096);
  const requiredContext = estimatedPromptTokens
    + requestedOutput
    + Math.max(512, Math.ceil((estimatedPromptTokens + requestedOutput) * 0.04));
  const providerAdapter = getLocalAiProviderAdapter(modelDetail?.source || 'openai-compatible');
  const runtimeProviderId = modelDetail?.source
    || (config.mode === 'lmstudio' || config.mode === 'ollama' ? config.mode : 'openai-compatible');
  const nativeRequest = providerAdapter.prepareNativeRequest?.({
    opts,
    modelDetail,
    requiredContext,
    roundContextLength,
  }) || null;
  let effectiveModelDetail = nativeRequest?.modelDetail || modelDetail;
  let useNativeInfer = !!(nativeRequest && providerAdapter.infer);

  // Prefer load-then-stream: (re)load the model at the target context via the
  // lifecycle hook, then generate over the streaming compatible endpoint. The
  // native chat endpoint is non-streaming, so long generations there would sit
  // behind the initial-response timeout with no progress signal.
  if (nativeRequest && providerAdapter.loadWithContext) {
    try {
      await providerAdapter.loadWithContext({
        baseUrl: url,
        apiKey: config.apiKey,
        model,
        modelDetail,
        contextLength: nativeRequest.contextLength,
      });
      useNativeInfer = false;
      // The server auto-fits context to available memory and may load less (or
      // more) than requested — read back the real value and plan against it.
      const discovery = await discoverLocalAI(url, config.apiKey, { force: true });
      const loadedDetail = discovery.modelDetails?.find(detail => detail.name === model) || null;
      if (loadedDetail) effectiveModelDetail = loadedDetail;
      else effectiveModelDetail = nativeRequest.modelDetail || modelDetail;
    } catch (error) {
      // Older servers have no load route; keep the native chat fallback path.
      if (Number(/** @type {any} */ (error)?.status) !== 404) throw error;
    }
  }

  const plan = planLocalAiRequest(opts, effectiveModelDetail);

  if (useNativeInfer && nativeRequest && providerAdapter.infer) {
    let nativeResult;
    try {
      nativeResult = await providerAdapter.infer({
        config,
        model,
        opts,
        plan,
        modelDetail: effectiveModelDetail,
        contextLength: nativeRequest.contextLength,
        nativeContextOverride: nativeRequest.nativeContextOverride,
      });
    } finally {
      rememberLocalAiRuntimeUse({ baseUrl: config.url, providerId: runtimeProviderId, model });
    }
    publishLoadedModel(config, model, nativeRequest.contextLength > 0
      ? { contextLength: nativeRequest.contextLength }
      : {});
    return {
      ...nativeResult,
      diagnostics: {
        ...nativeResult?.diagnostics,
        localPlan: plan.diagnostics,
      },
    };
  }

  const compatibleAdapter = getLocalAiProviderAdapter('openai-compatible');
  if (!compatibleAdapter.infer) throw new Error('OpenAI-compatible inference adapter is unavailable.');
  let result;
  try {
    result = await compatibleAdapter.infer({ config, model, opts, plan, modelDetail });
  } finally {
    rememberLocalAiRuntimeUse({ baseUrl: config.url, providerId: runtimeProviderId, model });
  }
  publishLoadedModel(config, model);
  return {
    ...result,
    diagnostics: {
      ...result?.diagnostics,
      localPlan: plan.diagnostics,
    },
  };
}
