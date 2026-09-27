// @ts-check
// OpenRouter capability shaping and recovery from stale routing metadata.

import { createInitialResponseTimeout, fetchWithRetry } from './api-transport.js';

const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const refreshedModels = new Map();
const METADATA_TTL_MS = 60000;

export function getOpenRouterRequestModel(modelId, cachedModels) {
  const fresh = refreshedModels.get(modelId);
  if (fresh && fresh.expires > Date.now()) return fresh.model;
  return cachedModels.find(model => model?.id === modelId);
}

export function shapeOpenRouterRequest(opts, model) {
  const shaped = { ...opts };
  const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters : null;
  const reasoning = model?.reasoning;
  const efforts = Array.isArray(reasoning?.supported_efforts) ? reasoning.supported_efforts : null;
  if (parameters && !parameters.includes('temperature')) delete shaped.temperature;
  if (parameters && !parameters.includes('reasoning') && !parameters.includes('reasoning_effort')) {
    delete shaped.reasoningEffort;
  } else if (shaped.reasoningEffort === 'none'
      && (reasoning?.mandatory === true || (efforts && !efforts.includes('none')))) {
    // An effort allowlist without `none` does not make thinking mandatory.
    // Optional models (e.g. Sonnet 5) use the separate enabled switch.
    const optional = reasoning?.mandatory === false;
    const effort = optional ? 'none' : EFFORTS.find(value => efforts?.includes(value));
    if (optional) shaped.reasoningEnabled = false;
    if (effort) shaped.reasoningEffort = effort;
    else delete shaped.reasoningEffort;
  }
  // Missing metadata is unknown, not evidence that an option is unsupported.
  // In particular, null supported_efforts accepts all gateway effort values.
  return shaped;
}

async function refreshRequestModel(modelId, signal) {
  const state = createInitialResponseTimeout({ signal }, 5000);
  try {
    // Public capability lookup only: never forward credentials or prompts,
    // and do not replace the curated/edition-controlled model picker catalog.
    const response = await fetch('https://openrouter.ai/api/v1/models', state.fetchOptions);
    if (!response.ok) return null;
    const payload = await response.json();
    const model = Array.isArray(payload?.data) ? payload.data.find(item => item?.id === modelId) : null;
    if (model) refreshedModels.set(modelId, { model, expires: Date.now() + METADATA_TTL_MS });
    return model;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  } finally {
    state.clearRequestTimeout();
  }
}

/** @param {any} body @param {any} model */
function reshapeBody(body, model) {
  const shaped = shapeOpenRouterRequest({
    reasoningEffort: body.reasoning?.effort,
    temperature: body.temperature,
  }, model);
  const next = { ...body };
  if (shaped.temperature === undefined) delete next.temperature;
  if (body.reasoning && typeof body.reasoning === 'object') {
    next.reasoning = { ...body.reasoning };
    if (shaped.reasoningEnabled === false) next.reasoning.enabled = false;
    if (shaped.reasoningEnabled === false || shaped.reasoningEffort === undefined) delete next.reasoning.effort;
    else next.reasoning.effort = shaped.reasoningEffort;
    if (!Object.keys(next.reasoning).length) delete next.reasoning;
  }
  return next;
}

export function createOpenRouterRequestFetch(opts) {
  let recoveryModel = null;
  return async (url, init) => {
    const send = request => {
      // The shared transport may subsequently retry a rejected schema or
      // effort. Keep fresh capability shaping on those attempts as well.
      if (recoveryModel) request = { ...request, body: JSON.stringify(reshapeBody(JSON.parse(request.body), recoveryModel)) };
      return fetchWithRetry(url, request, {
        retries: Number.isInteger(opts.requestRetries) ? Math.max(0, opts.requestRetries) : 2,
        requestTimeoutMs: opts.requestTimeoutMs,
        useProxy: false,
      });
    };
    const response = await send(init);
    // Only this routing error establishes that no inference ran. Never
    // weaken schema/provider/privacy restrictions or retry arbitrary 404s.
    if (recoveryModel || response.status !== 404
        || !/No endpoints found that can handle the requested parameters/i.test(await response.clone().text())) {
      return response;
    }
    const body = JSON.parse(init.body);
    const model = await refreshRequestModel(body.model, init.signal);
    if (!model) return response;
    const next = reshapeBody(body, model);
    if (JSON.stringify(next) === JSON.stringify(body)) return response;
    recoveryModel = model;
    return send(init);
  };
}
