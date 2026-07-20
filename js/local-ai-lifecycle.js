// @ts-check
// Provider-neutral lifecycle orchestration for loaded Local AI models.

import { clearLocalAiDiscovery, discoverLocalAI } from './local-ai-discovery.js';
import { getLocalAiProviderAdapter } from './local-ai-provider-registry.js';
import { isCloudModel, normalizeLocalAiBaseUrl } from './local-ai-provider-shared.js';

const LOCAL_AI_RUNTIME_USE_KEY = 'labcharts-local-ai-runtime-use';
let runtimeCredential = null;
/** @type {Promise<any>} */
let handoffQueue = Promise.resolve();

function loadedModelDetails(discovery) {
  return (Array.isArray(discovery?.modelDetails) ? discovery.modelDetails : [])
    .filter(model => model?.loaded === true
      && model?.name
      && model?.executionLocation !== 'cloud'
      && !isCloudModel(model.name));
}

function modelMatches(detail, modelName) {
  if (!modelName) return true;
  return detail?.name === modelName
    || detail?.loadedInstanceId === modelName
    || detail?.nativeModelKey === modelName;
}

export function getLocalAiReleasePlan(discovery, { modelName = '' } = {}) {
  const providerId = String(discovery?.provider || 'openai-compatible');
  const adapter = getLocalAiProviderAdapter(providerId);
  const models = loadedModelDetails(discovery).filter(model => modelMatches(model, modelName));
  return {
    providerId,
    providerLabel: adapter.label,
    supported: typeof adapter.unload === 'function',
    models,
    allocatedVram: models.reduce((total, model) => total + (Number(model.vramAllocated) || 0), 0),
  };
}

function readLocalAiRuntimeUse() {
  try {
    const raw = sessionStorage.getItem(LOCAL_AI_RUNTIME_USE_KEY);
    if (!raw) {
      runtimeCredential = null;
      return null;
    }
    const stored = JSON.parse(raw);
    if (!stored?.baseUrl || !stored?.model || !stored?.providerId) return null;
    const apiKey = runtimeCredential?.baseUrl === stored.baseUrl ? runtimeCredential.apiKey : '';
    return { ...stored, apiKey };
  } catch {
    runtimeCredential = null;
    return null;
  }
}

export function rememberLocalAiRuntimeUse({ baseUrl, apiKey = '', providerId, model }) {
  const runtimeUse = {
    baseUrl: normalizeLocalAiBaseUrl(baseUrl),
    providerId: String(providerId || 'openai-compatible'),
    model: String(model || ''),
  };
  if (!runtimeUse.baseUrl || !runtimeUse.model) return;
  runtimeCredential = { baseUrl: runtimeUse.baseUrl, apiKey };
  try { sessionStorage.setItem(LOCAL_AI_RUNTIME_USE_KEY, JSON.stringify(runtimeUse)); } catch {}
}

export function clearLocalAiRuntimeUse(baseUrl = '') {
  const runtimeUse = readLocalAiRuntimeUse();
  if (baseUrl && runtimeUse?.baseUrl !== normalizeLocalAiBaseUrl(baseUrl)) return;
  runtimeCredential = null;
  try { sessionStorage.removeItem(LOCAL_AI_RUNTIME_USE_KEY); } catch {}
}

async function runLocalAiRuntimeHandoff({ baseUrl, model }) {
  const previous = readLocalAiRuntimeUse();
  const nextBaseUrl = normalizeLocalAiBaseUrl(baseUrl);
  if (!previous || (previous.baseUrl === nextBaseUrl && previous.model === model)) {
    return { released: false, reason: 'same-runtime' };
  }
  if (!localAiEndpointsShareMachine(previous.baseUrl, nextBaseUrl)) {
    clearLocalAiRuntimeUse();
    return { released: false, reason: 'different-machine' };
  }

  const discovery = await discoverLocalAI(previous.baseUrl, previous.apiKey, { force: true });
  if (!discovery.available) {
    clearLocalAiRuntimeUse(previous.baseUrl);
    return { released: false, reason: 'previous-server-unavailable' };
  }
  const plan = getLocalAiReleasePlan(discovery, { modelName: previous.model });
  if (plan.models.length === 0) {
    clearLocalAiRuntimeUse(previous.baseUrl);
    return { released: false, reason: 'already-released' };
  }
  if (!plan.supported) {
    clearLocalAiRuntimeUse(previous.baseUrl);
    return { released: false, reason: 'unsupported' };
  }

  const outcome = await releaseLocalAiModels({
    baseUrl: previous.baseUrl,
    apiKey: previous.apiKey,
    discovery: { provider: plan.providerId, modelDetails: plan.models },
  });
  if (!outcome.complete) {
    throw new Error(`Could not release ${plan.providerLabel} model ${previous.model} before switching Local AI backends. Unload it in ${plan.providerLabel}, then retry.`);
  }
  clearLocalAiDiscovery(previous.baseUrl);
  clearLocalAiRuntimeUse(previous.baseUrl);
  return { released: true, providerLabel: plan.providerLabel, models: outcome.releasedModels };
}

export function prepareLocalAiRuntimeHandoff(nextRuntime) {
  const handoff = handoffQueue.then(() => runLocalAiRuntimeHandoff(nextRuntime));
  handoffQueue = handoff.catch(() => {});
  return handoff;
}

export function localAiEndpointsShareMachine(firstUrl, secondUrl) {
  try {
    const first = new URL(normalizeLocalAiBaseUrl(firstUrl));
    const second = new URL(normalizeLocalAiBaseUrl(secondUrl));
    const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
    return first.hostname === second.hostname
      || (loopback.has(first.hostname) && loopback.has(second.hostname));
  } catch {
    return false;
  }
}

export async function releaseLocalAiModels({ baseUrl, apiKey = '', discovery }) {
  const plan = getLocalAiReleasePlan(discovery);
  const adapter = getLocalAiProviderAdapter(plan.providerId);
  const releasedModels = [];
  const failedModels = [];
  if (!plan.supported || plan.models.length === 0) {
    return { ...plan, releasedModels, failedModels, complete: plan.models.length === 0 };
  }
  for (const modelDetail of plan.models) {
    try {
      const released = await adapter.unload({
        baseUrl: normalizeLocalAiBaseUrl(baseUrl),
        apiKey,
        model: modelDetail.name,
        modelDetail,
      });
      if (released) releasedModels.push(modelDetail.name);
      else failedModels.push(modelDetail.name);
    } catch {
      failedModels.push(modelDetail.name);
    }
  }
  return {
    ...plan,
    releasedModels,
    failedModels,
    complete: failedModels.length === 0 && releasedModels.length === plan.models.length,
  };
}
