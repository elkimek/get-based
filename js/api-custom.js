// @ts-check
// api-custom.js - custom OpenAI-compatible endpoint adapter.

import { getErrorMessage } from './caught-error.js';
import {
  getCustomApiKey,
  getCustomApiModel,
  getCustomApiUrl,
  notifyAIModelCatalogChanged,
  setCustomApiModel,
} from './api-provider-storage.js';
import { findPreferredModel, modelMetadataSupportsVision } from './api-models.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';

const CUSTOM_DEFAULT_CANDIDATES = ['openai/gpt-5.5', 'gpt-5.5', 'anthropic/claude-sonnet-5', 'claude-sonnet-5', 'anthropic/claude-sonnet-4.6', 'claude-sonnet-4.6'];

function _customApiFetchModels(url, key) {
  return fetch(url, {
    headers: { 'Authorization': 'Bearer ' + key },
    credentials: 'omit',
  });
}

function customBrowserConnectionError(error) {
  const detail = getErrorMessage(error);
  return new Error(
    'This Custom API could not be reached directly from your browser. '
    + 'The provider may not support browser-based inference. Ask the provider to allow browser access for getbased, '
    + 'or use a self-hosted OpenAI-compatible endpoint that allows browser connections. '
    + 'getbased did not retry the request through its servers.'
    + (detail && !/failed to fetch|load failed|networkerror/i.test(detail) ? ` (${detail})` : ''),
  );
}

export async function fetchCustomApiModels(baseUrl, key) {
  try {
    const url = (baseUrl || getCustomApiUrl()).replace(/\/+$/, '');
    const k = key || getCustomApiKey();
    if (!url || !k) return [];
    let res = await _customApiFetchModels(url + '/models', k);
    if (!res.ok && res.status === 404) {
      const parent = url.replace(/\/[^/]+\/v\d+$/, '/v1');
      if (parent !== url) res = await _customApiFetchModels(parent + '/models', k);
    }
    if (!res.ok) return [];
    const json = await res.json();
    const models = (json.data || []).filter(function(m) { return m.id; }).map(function(m) {
      return {
        id: m.id,
        name: m.name || m.id,
        ...(m.architecture ? { architecture: m.architecture } : {}),
        ...(Array.isArray(m.input_modalities) ? { input_modalities: m.input_modalities } : {}),
        ...(Array.isArray(m.input) ? { input: m.input } : {}),
        ...(m.capabilities ? { capabilities: m.capabilities } : {}),
        ...(m.reasoning && typeof m.reasoning === 'object' ? { reasoning: m.reasoning } : {}),
        ...(Array.isArray(m.supported_parameters) ? { supported_parameters: m.supported_parameters } : {}),
        ...(typeof m.defaultReasoningEffort === 'string' ? { defaultReasoningEffort: m.defaultReasoningEffort } : {}),
      };
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    const visionIds = models.filter(modelMetadataSupportsVision).map(model => model.id);
    localStorage.setItem('labcharts-custom-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-custom-models', JSON.stringify(models));
    if (!getCustomApiModel() && models.length) {
      const preferred = findPreferredModel(models, CUSTOM_DEFAULT_CANDIDATES);
      setCustomApiModel((preferred || models[0]).id);
    }
    notifyAIModelCatalogChanged();
    return models;
  } catch (e) {
    return [];
  }
}

export async function validateCustomApiKey(baseUrl, key) {
  try {
    const url = baseUrl.replace(/\/+$/, '');
    const res = await _customApiFetchModels(url + '/models', key);
    let noModels = false;
    if (res.status === 401 || res.status === 403) return { valid: false, error: 'Invalid API key' };
    if (res.status === 404) noModels = true;
    else if (!res.ok) return { valid: false, error: 'Server returned status ' + res.status };
    if (res.ok || noModels) {
      const probeBody = JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 });
      /** @type {RequestInit} */
      const probeOpts = {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: probeBody,
        credentials: 'omit',
      };
      const probe = await fetch(url + '/chat/completions', probeOpts);
      if (probe.status === 401 || probe.status === 403) {
        try {
          const errBody = await probe.json();
          const errType = errBody?.error?.type || '';
          if (errType === 'AuthError' || errType === 'authentication_error') return { valid: false, error: 'Invalid API key' };
        } catch {}
      }
    }
    return noModels ? { valid: true, noModels: true } : { valid: true };
  } catch (e) {
    return { valid: false, error: customBrowserConnectionError(e).message };
  }
}

export async function callCustomAPI(opts) {
  const baseUrl = getCustomApiUrl().replace(/\/+$/, '');
  const key = getCustomApiKey();
  if (!baseUrl) throw new Error('No Custom API URL configured. Set it in Settings.');
  if (!key) throw new Error('No Custom API key configured. Add your key in Settings.');
  try {
    return await callOpenAICompatibleAPI(
      baseUrl + '/chat/completions',
      key,
      String(opts?.modelOverride || getCustomApiModel()),
      'Custom',
      opts,
      {},
      { useProxy: false },
    );
  } catch (error) {
    if (/Cannot reach Custom API/i.test(getErrorMessage(error))) {
      throw customBrowserConnectionError(error);
    }
    throw error;
  }
}
