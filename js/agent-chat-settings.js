// @ts-check
// Browser-side configuration for the optional loopback agent host.

import { encryptedSetCredentialItem } from './crypto.js';
import { getCachedKey } from './crypto-key-cache.js';

export const AGENT_HOST_TOKEN_KEY = 'labcharts-agent-host-token';
const BACKEND_KEY = 'labcharts-chat-backend';
const ENDPOINT_KEY = 'labcharts-agent-host-endpoint';
const MODEL_KEY = 'labcharts-agent-host-model';
const EFFORT_KEY = 'labcharts-agent-host-effort';
const AGENT_KEY = 'labcharts-agent-host-agent';
const TARGET_KEY = 'labcharts-agent-host-target';
export const DEFAULT_AGENT_HOST_ENDPOINT = 'http://127.0.0.1:8324';

function isOfficialAgentChatPage() {
  return /(^|\.)getbased\.health\.?$|^get-based(?:-managed-subscription-v2)?\.vercel\.app\.?$/i
    .test(globalThis.location?.hostname || '');
}

/** @param {unknown} value */
function normalizeAgentId(value) {
  return String(value || '').trim().slice(0, 40) || 'codex';
}

/** @param {unknown} value */
function normalizeTargetId(value) {
  const target = String(value || '').trim().slice(0, 80);
  return /^[a-z0-9-]{1,80}$/.test(target) ? target : 'local';
}

/** @param {string} baseKey @param {string} agentId */
function scopedAgentSettingKey(baseKey, agentId) {
  return `${baseKey}:${encodeURIComponent(normalizeAgentId(agentId))}`;
}

/** @param {string} baseKey @param {string} agentId @param {string} targetId */
function scopedAgentTargetSettingKey(baseKey, agentId, targetId) {
  const scoped = scopedAgentSettingKey(baseKey, agentId);
  const target = normalizeTargetId(targetId);
  return target === 'local' ? scoped : `${scoped}:target:${encodeURIComponent(target)}`;
}

/** @param {string} agentId @param {string} targetId @param {string} modelId */
function scopedAgentModelEffortKey(agentId, targetId, modelId) {
  return `${scopedAgentTargetSettingKey(EFFORT_KEY, agentId, targetId)}:model:${encodeURIComponent(String(modelId || '').trim() || 'default')}`;
}

export function getChatBackend() {
  const blocked = getAgentHostAgent() === 'claude' && isOfficialAgentChatPage();
  return localStorage.getItem(BACKEND_KEY) === 'codex' && !blocked ? 'codex' : 'direct';
}

/** @param {unknown} value */
export function setChatBackend(value) {
  const backend = value === 'codex' ? 'codex' : 'direct';
  localStorage.setItem(BACKEND_KEY, backend);
  globalThis.dispatchEvent?.(new CustomEvent('getbased:chat-backend-changed', { detail: { backend } }));
  return backend;
}

/** @param {string} value */
export function normalizeAgentHostEndpoint(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Enter a valid Agent Host URL.'); }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'http:' || !loopback || url.username || url.password || url.search || url.hash) {
    throw new Error('Agent Host must be an http:// loopback URL.');
  }
  return url.origin;
}

export function getAgentHostEndpoint() {
  try { return normalizeAgentHostEndpoint(localStorage.getItem(ENDPOINT_KEY) || DEFAULT_AGENT_HOST_ENDPOINT); }
  catch { return DEFAULT_AGENT_HOST_ENDPOINT; }
}

export function getAgentHostToken() {
  return getCachedKey(AGENT_HOST_TOKEN_KEY) || '';
}

export function getAgentHostModel() {
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  const scoped = localStorage.getItem(scopedAgentTargetSettingKey(MODEL_KEY, agent, target));
  return (scoped ?? (target === 'local' ? localStorage.getItem(MODEL_KEY) : '') ?? '').trim();
}

export function getAgentHostEffort() {
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  const modelScoped = localStorage.getItem(scopedAgentModelEffortKey(agent, target, getAgentHostModel()));
  if (modelScoped !== null) return modelScoped.trim();
  const scoped = localStorage.getItem(scopedAgentTargetSettingKey(EFFORT_KEY, agent, target));
  return (scoped ?? (target === 'local' ? localStorage.getItem(EFFORT_KEY) : '') ?? '').trim();
}

export function getAgentHostAgent() {
  return normalizeAgentId(localStorage.getItem(AGENT_KEY));
}

/** @param {string} [agentId] */
export function getAgentHostTarget(agentId = getAgentHostAgent()) {
  return normalizeTargetId(localStorage.getItem(scopedAgentSettingKey(TARGET_KEY, agentId)) || 'local');
}

/**
 * @param {{endpoint?: string, token?: string, model?: string, effort?: string, agent?: string, target?: string}} settings
 */
export async function saveAgentChatSettings(settings) {
  const previousAgent = getAgentHostAgent();
  const previousTarget = getAgentHostTarget(previousAgent);
  const previousModel = getAgentHostModel();
  const previousEffort = getAgentHostEffort();
  const nextAgent = settings.agent === undefined ? previousAgent : normalizeAgentId(settings.agent);
  const nextTarget = settings.target === undefined
    ? (nextAgent === previousAgent ? previousTarget : getAgentHostTarget(nextAgent))
    : normalizeTargetId(settings.target);
  if (settings.endpoint !== undefined) {
    localStorage.setItem(ENDPOINT_KEY, normalizeAgentHostEndpoint(settings.endpoint));
  }
  if (nextAgent !== previousAgent) {
    const previousModelKey = scopedAgentSettingKey(MODEL_KEY, previousAgent);
    const previousEffortKey = scopedAgentSettingKey(EFFORT_KEY, previousAgent);
    if (localStorage.getItem(previousModelKey) === null) {
      localStorage.setItem(previousModelKey, (localStorage.getItem(MODEL_KEY) || '').trim().slice(0, 160));
    }
    if (localStorage.getItem(previousEffortKey) === null) {
      localStorage.setItem(previousEffortKey, (localStorage.getItem(EFFORT_KEY) || '').trim().slice(0, 40));
    }
  }
  const previousModelEffortKey = scopedAgentModelEffortKey(previousAgent, previousTarget, previousModel);
  if (localStorage.getItem(previousModelEffortKey) === null && previousEffort) {
    localStorage.setItem(previousModelEffortKey, previousEffort.slice(0, 40));
  }
  if (settings.agent !== undefined) localStorage.setItem(AGENT_KEY, nextAgent);
  if (settings.target !== undefined) localStorage.setItem(scopedAgentSettingKey(TARGET_KEY, nextAgent), nextTarget);
  const model = settings.model === undefined
    ? (nextAgent !== previousAgent || nextTarget !== previousTarget
      ? localStorage.getItem(scopedAgentTargetSettingKey(MODEL_KEY, nextAgent, nextTarget)) || '' : null)
    : settings.model.trim().slice(0, 160);
  const targetModel = model === null ? getAgentHostModel() : model;
  const targetModelEffort = localStorage.getItem(scopedAgentModelEffortKey(nextAgent, nextTarget, targetModel));
  const effort = settings.effort === undefined
    ? (nextAgent !== previousAgent || nextTarget !== previousTarget || model !== null
      ? targetModelEffort ?? ((nextAgent !== previousAgent || nextTarget !== previousTarget)
        ? localStorage.getItem(scopedAgentTargetSettingKey(EFFORT_KEY, nextAgent, nextTarget)) || '' : '')
      : null)
    : settings.effort.trim().slice(0, 40);
  if (model !== null) {
    if (nextTarget === 'local') localStorage.setItem(MODEL_KEY, model);
    localStorage.setItem(scopedAgentTargetSettingKey(MODEL_KEY, nextAgent, nextTarget), model);
  }
  if (effort !== null) {
    if (nextTarget === 'local') localStorage.setItem(EFFORT_KEY, effort);
    localStorage.setItem(scopedAgentTargetSettingKey(EFFORT_KEY, nextAgent, nextTarget), effort);
    localStorage.setItem(scopedAgentModelEffortKey(nextAgent, nextTarget, targetModel), effort);
  }
  if (settings.token !== undefined) await encryptedSetCredentialItem(AGENT_HOST_TOKEN_KEY, settings.token.trim());
  globalThis.dispatchEvent?.(new CustomEvent('getbased:agent-host-settings-changed'));
}

export function hasAgentChatConnection() {
  return Boolean(getAgentHostToken());
}

/**
 * Discover a separately running companion without asking for a URL or token.
 * The fixed, narrow port range is intentionally bounded to getbased hosts.
 * @param {{signal?: AbortSignal, ports?: number[]}} [options]
 */
export async function discoverLoopbackAgentHosts(options = {}) {
  const runtime = await import('./agent-host-discovery.js');
  return runtime.discoverLoopbackAgentHostsRuntime({
    ...options, savedEndpoint: getAgentHostEndpoint(), normalizeEndpoint: normalizeAgentHostEndpoint,
  });
}

/** @param {{signal?: AbortSignal, refresh?: boolean}} [options] */
export async function discoverLocalChatAgents(options = {}) {
  const runtime = await import('./agent-host-discovery.js');
  const url = options.refresh ? '/api/local-agents?refresh=1' : '/api/local-agents';
  let direct = [];
  try {
    const response = await fetch(url, { cache: 'no-store', signal: options.signal });
    if (response.ok) {
      const payload = await response.json();
      direct = Array.isArray(payload?.agents)
        ? payload.agents.filter(agent => agent && typeof agent === 'object').map(runtime.normalizeDiscoveredAgent)
        : [];
    }
  } catch { /* hosted/static builds fall back to direct loopback discovery */ }
  // Prefer a separately installed companion when one exists. The development
  // server can expose its own temporary host, but service-level controls such
  // as restart belong to the installed companion on the standard loopback
  // port. The bounded probe also lets a current host replace a legacy result.
  const companions = await discoverLoopbackAgentHosts({ signal: options.signal }).catch(() => []);
  return runtime.mergeDiscoveredAgents(direct, companions);
}

/** @param {{signal?: AbortSignal, requiredCapabilities?: string[]}} [options] */
export async function connectDetectedAgent(agentId = getAgentHostAgent(), options = {}) {
  const runtime = await import('./agent-host-discovery.js');
  const savedToken = getAgentHostToken();
  const requiredCapabilities = runtime.normalizeRequiredCapabilities(options.requiredCapabilities);
  let agents = [];
  try {
    agents = await discoverLocalChatAgents(options);
  } catch { /* use a saved local host or direct companion scan below */ }
  const candidates = agents.filter(agent => agent.id === agentId && agent.compatible && agent.status !== 'login_required');
  const knownAgent = agents.find(agent => agent.id === agentId);
  if (savedToken && knownAgent?.status !== 'login_required'
    && !candidates.some(agent => agent.endpoint === getAgentHostEndpoint())) {
    candidates.push(runtime.normalizeDiscoveredAgent({
      id: agentId, name: agentId, status: 'available', compatible: true,
      endpoint: getAgentHostEndpoint(), token: savedToken,
    }));
  }
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return await runtime.connectAgentHostCandidate({
        candidate, requiredCapabilities, signal: options.signal,
        attempts: candidate.status === 'starting' ? 12 : 1,
        normalizeEndpoint: normalizeAgentHostEndpoint,
        onConnected: saveAgentChatSettings,
      });
    } catch (error) { lastError = error; }
  }
  // A dev server can keep advertising an older child process while a newer
  // standalone companion is already available on the next bounded port.
  const recovered = await discoverLoopbackAgentHosts({ signal: options.signal });
  for (const candidate of recovered.filter(agent => agent.id === agentId && agent.compatible && agent.status !== 'login_required')) {
    if (candidates.some(existing => existing.endpoint === candidate.endpoint && existing.token === candidate.token)) continue;
    try {
      return await runtime.connectAgentHostCandidate({
        candidate, requiredCapabilities, signal: options.signal, attempts: 1,
        normalizeEndpoint: normalizeAgentHostEndpoint,
        onConnected: saveAgentChatSettings,
      });
    } catch (error) { lastError = error; }
  }
  const installed = [...agents, ...recovered].find(agent => agent.id === agentId);
  if (installed?.status === 'login_required') throw new Error(installed.message || `${installed.name || agentId} requires sign-in.`);
  if (!candidates.length && !recovered.length) throw new Error(`${installed?.name || agentId} was not detected on this computer.`);
  throw lastError instanceof Error ? lastError : new Error(`${installed?.name || agentId} connection is unavailable.`);
}

/** Backwards-compatible name while the surrounding chat modules are renamed. */
export function connectDetectedCodex(options = {}) {
  return connectDetectedAgent(getAgentHostAgent(), options);
}
