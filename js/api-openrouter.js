// @ts-check
// api-openrouter.js - OpenRouter provider adapter.

import {
  getOpenRouterKey,
  getOpenRouterModel,
  readStoredArray,
} from './api-provider-storage.js';
import { getApiLocationOriginRuntime } from './api-runtime.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';
import {
  authorizeAppExtensionAIRequest,
  callAppExtensionAIProvider,
  getAppExtensionAIRequestOptions,
  isAppExtensionAICredentialOwned,
  mapAppExtensionAIProviderError,
  shouldHideAppExtensionAIUsage,
} from './app-extension-runtime.js';

export async function getOpenRouterBalance() {
  if (shouldHideAppExtensionAIUsage('openrouter')) return null;
  const key = getOpenRouterKey();
  if (!key) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data;
    if (d && d.total_credits != null) {
      return { total: d.total_credits, used: d.total_usage, remaining: d.total_credits - d.total_usage };
    }
    return null;
  } catch {
    return null;
  }
}

function openRouterMandatoryReasoningEffort(modelId) {
  const model = readStoredArray('labcharts-openrouter-models')
    .find(candidate => candidate?.id === modelId);
  const reasoning = model?.reasoning;
  // Two OpenRouter-reported states both mean "this request will run with
  // reasoning active whether or not a reasoning field is sent," and a caller
  // asking for 'none' can't actually get it either way:
  //   - mandatory: true       - reasoning can never be turned off.
  //   - default_enabled: true - reasoning is on by default; verified live
  //     for anthropic/claude-sonnet-5 (mandatory: false, default_enabled:
  //     true, supported_efforts has no 'none'/off value at all) that
  //     omitting the reasoning field does NOT disable it.
  // Only the `mandatory` case was handled before, so a default-enabled-but-
  // not-mandatory model (Sonnet 5) fell through to the "just omit the
  // field" branch, which still left temperature unfixed - see the
  // temperature note below.
  if (reasoning?.mandatory !== true && reasoning?.default_enabled !== true) return null;
  const supported = Array.isArray(reasoning.supported_efforts)
    ? reasoning.supported_efforts
    : [];
  const effort = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    .find(candidate => supported.includes(candidate));
  return { effort };
}

export async function callOpenRouterAPI(opts) {
  const key = getOpenRouterKey();
  const modelId = String(opts?.modelOverride || getOpenRouterModel());
  const reasoningEffortNone = opts?.reasoningEffort === 'none';
  const mandatoryReasoning = reasoningEffortNone
    ? openRouterMandatoryReasoningEffort(modelId)
    : null;
  let requestOpts = opts;
  if (reasoningEffortNone && mandatoryReasoning?.effort) {
    // Models that can't actually drop reasoning (mandatory, or default-on
    // with no off value - see openRouterMandatoryReasoningEffort) need a
    // real supported effort substituted regardless of jsonMode - an
    // existing test already covers this for a plain chat call.
    requestOpts = { ...opts, reasoningEffort: mandatoryReasoning.effort };
    // These models also don't expose a tunable temperature — Anthropic's
    // endpoints for them don't declare `temperature` in supported_parameters
    // at all. Verified live: with require_parameters true, jsonMode +
    // temperature: 0 alone 404s "No endpoints found" for
    // anthropic/claude-sonnet-5; dropping temperature (or dropping
    // require_parameters) succeeds. Callers like pdf-import.js send a
    // hardcoded temperature: 0 for deterministic extraction, which is
    // meaningless for these models anyway since it's never honored.
    delete requestOpts.temperature;
  } else if (reasoningEffortNone && opts?.jsonMode) {
    // 'none' is a caller-side sentinel meaning "no reasoning field at all,"
    // not a real OpenRouter effort tier. For structured (jsonMode) requests
    // it must be resolved away here rather than left to reach the server -
    // jsonMode sets `provider.require_parameters: true` below, which turns
    // an unsupported parameter into an unrecoverable 404 "No endpoints
    // found" from OpenRouter's routing layer, not the 400/422 that
    // reasoningControlRejected (api-openai-compatible.js) can retry past.
    // Plain chat requests (no jsonMode) keep relying on that existing
    // 400-driven retry for the same 'none' leak — an existing test expects
    // exactly that recovery path, so it's left alone here.
    requestOpts = { ...opts };
    delete requestOpts.reasoningEffort;
  }
  if (isAppExtensionAICredentialOwned('openrouter')) {
    const authorized = await authorizeAppExtensionAIRequest({
      provider: 'openrouter',
      model: modelId,
      webSearch: requestOpts.webSearch === true,
      request: requestOpts,
    });
    if (!authorized) throw new Error('This hosted AI request is not authorized. No data was sent.');
  }
  const extensionOptions = getAppExtensionAIRequestOptions({
    provider: 'openrouter',
    model: modelId,
    request: requestOpts,
  });
  const extensionProviderRouting = extensionOptions.provider
    && typeof extensionOptions.provider === 'object'
    && !Array.isArray(extensionOptions.provider)
    ? extensionOptions.provider
    : {};
  const reasoningEffort = String(requestOpts.reasoningEffort || '').trim();
  const extraBody = {
    ...extensionOptions,
    // OpenRouter aggregates parameter support across a model's providers.
    // Structured requests must only use endpoints that can honor the schema.
    ...(requestOpts.jsonMode ? {
      provider: { ...extensionProviderRouting, require_parameters: true },
    } : {}),
    ...(requestOpts.webSearch ? { plugins: [{ id: 'web' }] } : {}),
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
  };
  const transportOpts = reasoningEffort ? { ...requestOpts } : requestOpts;
  if (reasoningEffort) delete transportOpts.reasoningEffort;
  try {
    const extensionCall = await callAppExtensionAIProvider({
      provider: 'openrouter',
      credential: key,
      model: modelId,
      request: requestOpts,
    });
    if (extensionCall.handled) return extensionCall.result;
    if (!key) throw new Error('No OpenRouter API key configured. Add your key in Settings.');
    return await callOpenAICompatibleAPI(
      'https://openrouter.ai/api/v1/chat/completions',
      key,
      modelId,
      'OpenRouter',
      transportOpts,
      { 'HTTP-Referer': getApiLocationOriginRuntime(), 'X-Title': 'getbased' },
      { extraBody }
    );
  } catch (error) {
    const mapped = mapAppExtensionAIProviderError({ provider: 'openrouter', error });
    if (mapped instanceof Error) throw mapped;
    if (typeof mapped === 'string' && mapped) throw new Error(mapped);
    throw error;
  }
}
