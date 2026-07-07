// @ts-check
// api-custom.js - custom OpenAI-compatible endpoint adapter.

import {
  getCustomApiKey,
  getCustomApiModel,
  getCustomApiUrl,
  setCustomApiModel,
} from './api-provider-storage.js';
import { findPreferredModel } from './api-models.js';
import {
  callOpenAICompatibleAPI,
  useCustomApiProxy,
} from './api-openai-compatible.js';

const CUSTOM_DEFAULT_CANDIDATES = ['openai/gpt-5.5', 'gpt-5.5', 'anthropic/claude-sonnet-5', 'claude-sonnet-5', 'anthropic/claude-sonnet-4.6', 'claude-sonnet-4.6'];

function _customApiFetchModels(url, key) {
  if (useCustomApiProxy()) {
    return fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method: 'GET', headers: { 'Authorization': 'Bearer ' + key } }),
    });
  }
  return fetch(url, { headers: { 'Authorization': 'Bearer ' + key } });
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
      return { id: m.id, name: m.name || m.id };
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    localStorage.setItem('labcharts-custom-models', JSON.stringify(models));
    if (!getCustomApiModel() && models.length) {
      const preferred = findPreferredModel(models, CUSTOM_DEFAULT_CANDIDATES);
      setCustomApiModel((preferred || models[0]).id);
    }
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
      const probeOpts = {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: probeBody
      };
      const probe = useCustomApiProxy()
        ? await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url + '/chat/completions', headers: { 'Authorization': 'Bearer ' + key }, body: probeBody })
        })
        : await fetch(url + '/chat/completions', probeOpts);
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
    return { valid: false, error: 'Cannot reach endpoint: ' + e.message };
  }
}

export async function callCustomAPI(opts) {
  const baseUrl = getCustomApiUrl().replace(/\/+$/, '');
  const key = getCustomApiKey();
  if (!baseUrl) throw new Error('No Custom API URL configured. Set it in Settings.');
  if (!key) throw new Error('No Custom API key configured. Add your key in Settings.');
  return callOpenAICompatibleAPI(
    baseUrl + '/chat/completions',
    key,
    getCustomApiModel(),
    'Custom',
    opts,
    {}
  );
}
