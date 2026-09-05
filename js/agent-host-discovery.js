// @ts-check
// Lazy browser runtime for origin-gated standalone companion discovery.

import { agentHostUpgradeRequiredError, checkAgentHost } from './agent-chat-client.js';
import {
  AGENT_HOST_CAPABILITIES, agentHostSupportsCapabilities,
  normalizeAgentHostCapabilities, normalizeAgentHostProtocolVersion,
} from '../shared/agent-host-protocol.js';

const LOOPBACK_AGENT_PORTS = Object.freeze(Array.from({ length: 8 }, (_, index) => 8324 + index));
const LOOPBACK_DISCOVERY_TIMEOUT_MS = 650;

/** @param {{hostname?: string}} [locationLike] */
function isOfficialAgentHostPage(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  return hostname === 'getbased.health' || hostname.endsWith('.getbased.health')
    || hostname === 'get-based.vercel.app'
    || hostname === 'get-based-managed-subscription-v2.vercel.app';
}

/** @param {string} agentId @param {{hostname?: string}} [locationLike] */
export function isAgentAllowedForDeployment(agentId, locationLike = globalThis.location) {
  return !(agentId === 'claude' && isOfficialAgentHostPage(locationLike));
}

/** @param {any} agent */
export function normalizeDiscoveredAgent(agent) {
  const id = String(agent?.id || '');
  const isClaudeAgent = id === 'claude';
  const message = String(agent?.message || '').slice(0, 240);
  const version = String(agent?.version || '').slice(0, 100);
  return {
    id,
    // Older companions advertised the prohibited integration label “Claude
    // Code”. Canonicalize it at the browser boundary so a running companion
    // cannot reintroduce stale third-party branding after an app update.
    name: isClaudeAgent ? 'Claude Agent' : String(agent?.name || ''),
    description: isClaudeAgent
      ? 'Anthropic agent · API/Console billing only'
      : String(agent?.description || '').slice(0, 100),
    version: isClaudeAgent ? version.replace(/\s*\(Claude Code\)\s*/gi, ' ').trim() : version,
    status: String(agent?.status || 'unavailable'),
    compatible: agent?.compatible === true,
    endpoint: String(agent?.endpoint || ''),
    token: String(agent?.token || ''),
    message: isClaudeAgent ? message.replaceAll('Claude Code', 'Claude Agent') : message,
    companionVersion: String(agent?.companionVersion || '').slice(0, 40),
    runtimeMode: ['installed', 'temporary'].includes(String(agent?.runtimeMode)) ? String(agent.runtimeMode) : '',
    platform: String(agent?.platform || '').slice(0, 24),
    paused: agent?.paused === true || agent?.status === 'paused',
    controlAuthorized: agent?.controlAuthorized !== false,
    protocolVersion: normalizeAgentHostProtocolVersion(agent?.protocolVersion),
    capabilities: normalizeAgentHostCapabilities(agent?.capabilities),
  };
}

/** @param {string} endpoint @param {AbortSignal|undefined} parentSignal @param {(value: string) => string} normalizeEndpoint */
async function probeLoopbackAgentHost(endpoint, parentSignal, normalizeEndpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOPBACK_DISCOVERY_TIMEOUT_MS);
  const abort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${endpoint}/v1/discovery`, {
      cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (payload?.service !== 'getbased-agent-host') return [];
    const normalizedEndpoint = normalizeEndpoint(payload.endpoint || endpoint);
    const token = String(payload.token || '');
    if (token.length < 16 || token.length > 256) return [];
    const protocolVersion = normalizeAgentHostProtocolVersion(payload.protocolVersion);
    const capabilities = normalizeAgentHostCapabilities(payload.capabilities);
    const rows = Array.isArray(payload.agents) && payload.agents.length
      ? payload.agents
      : [{ id: payload.agent || 'codex', name: 'Codex CLI', compatible: true, status: 'available' }];
    return rows.map(row => normalizeDiscoveredAgent({
      ...row, endpoint: normalizedEndpoint, token,
      companionVersion: row?.companionVersion || payload.companionVersion,
      runtimeMode: row?.runtimeMode || payload.runtimeMode,
      platform: row?.platform || payload.platform,
      paused: row?.paused === true || payload.paused === true,
      // Discovery never conveys the installation credential, including on
      // older companions that omitted the explicit authority field.
      controlAuthorized: false,
      protocolVersion: row?.protocolVersion || protocolVersion,
      capabilities: row?.capabilities || capabilities,
    })).filter(agent => agent.id);
  } catch { return []; }
  finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

/**
 * @param {{savedEndpoint: string, normalizeEndpoint: (value: string) => string, signal?: AbortSignal, ports?: number[]}} options
 */
export async function discoverLoopbackAgentHostsRuntime(options) {
  const ports = Array.isArray(options.ports) ? options.ports : LOOPBACK_AGENT_PORTS;
  const boundedEndpoints = ports.filter(port => Number.isInteger(port) && port >= 1 && port <= 65535)
    .map(port => `http://127.0.0.1:${port}`);
  // Probe in port order and stop at the first companion. Browsers report a
  // caught connection refusal in DevTools, so fanning out to every unused
  // port made a successful discovery look broken. Keep a custom saved port
  // first, but let the standard range retain its predictable 8324-first order.
  const savedIsBounded = boundedEndpoints.includes(options.savedEndpoint);
  const endpoints = [...new Set([
    ...(savedIsBounded ? [] : [options.savedEndpoint]),
    ...boundedEndpoints,
  ].filter(Boolean))];
  let legacyCompanion = [];
  for (const endpoint of endpoints) {
    if (options.signal?.aborted) return [];
    const agents = await probeLoopbackAgentHost(endpoint, options.signal, options.normalizeEndpoint);
    const allowedAgents = agents.filter(agent => isAgentAllowedForDeployment(agent.id));
    if (!allowedAgents.length) continue;
    const current = allowedAgents.some(agent => agent.capabilities.includes(AGENT_HOST_CAPABILITIES.COMPANION_CONTROL));
    if (current) return allowedAgents;
    if (!legacyCompanion.length) legacyCompanion = allowedAgents;
  }
  return legacyCompanion;
}

export function mergeDiscoveredAgents(primary, companions) {
  const merged = [...primary];
  for (const candidate of companions) {
    const index = merged.findIndex(agent => agent.id === candidate.id);
    if (index < 0) merged.push(candidate);
    else if (candidate.compatible && ['available', 'paused'].includes(candidate.status)) merged[index] = candidate;
  }
  return merged;
}

export const normalizeRequiredCapabilities = normalizeAgentHostCapabilities;

/**
 * @param {{
 *   candidate: ReturnType<typeof normalizeDiscoveredAgent>,
 *   requiredCapabilities: string[],
 *   signal?: AbortSignal,
 *   attempts: number,
 *   normalizeEndpoint: (value: string) => string,
 *   onConnected: (settings: {endpoint: string, token: string}) => Promise<unknown>,
 * }} options
 */
export async function connectAgentHostCandidate(options) {
  const endpoint = options.normalizeEndpoint(options.candidate.endpoint);
  if (options.candidate.token.length < 16 || options.candidate.token.length > 256) {
    throw new Error('CLI agent connection is not ready yet.');
  }
  let lastError = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      const status = await checkAgentHost({ endpoint, token: options.candidate.token, signal: options.signal });
      if (status?.paused === true || status?.state === 'paused') throw new Error('The getbased Companion is paused. Resume it in AI settings.');
      if (!agentHostSupportsCapabilities(status, options.requiredCapabilities)) {
        throw agentHostUpgradeRequiredError(options.requiredCapabilities[0] || 'requested-feature');
      }
      await options.onConnected({ endpoint, token: options.candidate.token });
      return normalizeDiscoveredAgent({
        ...options.candidate, ...status, endpoint, token: options.candidate.token,
        status: 'available', compatible: true,
      });
    } catch (error) {
      lastError = error;
      if (/** @type {any} */ (error)?.code === 'agent_host_upgrade_required') throw error;
      if (attempt < options.attempts - 1) await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('CLI agent connection is unavailable.');
}
