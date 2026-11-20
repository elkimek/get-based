// Lazy browser runtime for origin-gated standalone companion discovery.

import { agentHostUpgradeRequiredError, checkAgentHost, listAgentExecutionTargets } from './agent-chat-client.js';
import {
  agentHostSupportsCapabilities,
  normalizeAgentHostCapabilities, normalizeAgentHostProtocolVersion,
} from '../shared/agent-host-protocol.js';

export type DiscoveredAgent = ReturnType<typeof normalizeDiscoveredAgent>;
export interface AgentDiscoveryOptions {
  requiredToolContractVersion?: number | undefined;
  refresh?: boolean | undefined;
  signal?: AbortSignal | undefined;
  ports?: number[] | undefined;
  requiredTextFeatureTarget?: string | undefined;
  requiredAgentId?: string | undefined;
}
export interface AgentConnectionOptions {
  /** A bound feature may refresh a credential privately without changing chat settings. */
  persistConnection?: boolean | undefined;
  requiredEndpoint?: string | undefined;
  requiredToolContractVersion?: number | undefined;
  /** Optional initiating-owner guard, checked before publishing a discovered credential. */
  isCurrent?: (() => boolean) | undefined;
  signal?: AbortSignal | undefined;
  requiredCapabilities?: string[] | undefined;
  requiredTextFeatureTarget?: string | undefined;
}
interface DiscoveryPayload extends Record<string, unknown> {
  endpoint?: string;
  agents?: Record<string, unknown>[];
}

export function companionPairingEndpoint(code: string) {
  const match = /^gbchat1\.([1-9]\d{0,4})\.[0-9a-f]{64}$/.exec(code);
  return match && Number(match[1]) <= 65535 ? `http://127.0.0.1:${match[1]}` : null;
}

async function verifyCompanionEndpoint(endpoint: string, code: string, signal: AbortSignal) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
  const challenge = hex(bytes);
  const response = await fetch(`${endpoint}/v1/pairing?challenge=${challenge}`, {signal, cache:'no-store', redirect:'error'});
  if (!response.ok) return false;
  const result = await response.json() as {proof?: string};
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(['companion-proof-v1',endpoint,location.origin,challenge])));
  return result.proof === hex(new Uint8Array(expected));
}
const LOOPBACK_DISCOVERY_TIMEOUT_MS = 650;

function isOfficialAgentHostPage(locationLike: {hostname?: string} = globalThis.location) {
  const hostname = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  return hostname === 'getbased.health' || hostname.endsWith('.getbased.health')
    || hostname === 'get-based.vercel.app'
    || hostname === 'get-based-managed-subscription-v2.vercel.app';
}

export function isAgentAllowedForDeployment(agentId: string, locationLike: {hostname?: string} = globalThis.location) {
  return !(agentId === 'claude' && isOfficialAgentHostPage(locationLike));
}

export function normalizeDiscoveredAgent(agent: Record<string, unknown> | null | undefined) {
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
    runtimeMode: ['installed', 'temporary'].includes(String(agent?.runtimeMode)) ? String(agent!.runtimeMode) : '',
    platform: String(agent?.platform || '').slice(0, 24),
    paused: agent?.paused === true || agent?.status === 'paused',
    controlAuthorized: agent?.controlAuthorized !== false,
    protocolVersion: normalizeAgentHostProtocolVersion(agent?.protocolVersion),
    ...(normalizeAgentHostProtocolVersion(agent?.toolContractVersion) ? { toolContractVersion: normalizeAgentHostProtocolVersion(agent?.toolContractVersion) } : {}),
    capabilities: normalizeAgentHostCapabilities(agent?.capabilities),
  };
}

async function probeLoopbackAgentHost(endpoint: string, code: string, parentSignal: AbortSignal | undefined, normalizeEndpoint: (value: string) => string, refresh = false) {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), LOOPBACK_DISCOVERY_TIMEOUT_MS);
  const abort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', abort, { once: true });
  try {
    if (!await verifyCompanionEndpoint(endpoint, code, controller.signal)) return [];
    const readDiscovery = async (query = '') => {
      const response = await fetch(`${endpoint}/v1/discovery${query}`, {
        cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', Authorization: `Bearer ${code}` },
      });
      if (!response.ok) return null;
      const payload = await response.json() as DiscoveryPayload;
      const token = String(payload?.token || '');
      return payload?.service === 'getbased-agent-host' && token.length >= 16 && token.length <= 256 ? payload : null;
    };
    let payload = await readDiscovery();
    if (!payload) return [];
    if (refresh) {
      // Keep unused-port probes fast. Only an identified Companion gets the
      // longer deadline needed for concurrent, bounded CLI version probes.
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), 6_000);
      const discovered = payload;
      try { payload = await readDiscovery('?refresh=true'); }
      catch { payload = null; }
      if (!payload) {
        if (parentSignal?.aborted) return [];
        payload = { ...discovered, agents: Array.isArray(discovered.agents)
          ? discovered.agents.map(agent => ({ ...agent, version: '' })) : [] };
      }
    }
    if (parentSignal?.aborted) return [];
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    if (payload.endpoint !== normalizedEndpoint) return [];
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
      toolContractVersion: row?.toolContractVersion || payload.toolContractVersion,
      capabilities: row?.capabilities || capabilities,
    })).filter(agent => agent.id);
  } catch { return []; }
  finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

export async function discoverLoopbackAgentHostsRuntime(options: AgentDiscoveryOptions & {pairingCode?: string; savedEndpoint: string; normalizeEndpoint: (value: string) => string}) {
  const code = options.pairingCode || '';
  const paired = companionPairingEndpoint(code);
  if (!paired || options.ports && !options.ports.includes(Number(new URL(paired).port))) return [];
  if (options.signal?.aborted) return [];
  const agents = await probeLoopbackAgentHost(paired, code, options.signal, options.normalizeEndpoint, options.refresh);
  const allowed = agents.filter(agent => isAgentAllowedForDeployment(agent.id));
  if (!options.requiredTextFeatureTarget) return allowed;
  const capable: DiscoveredAgent[] = [];
  for (const agent of allowed.filter(agent => !options.requiredAgentId || agent.id === options.requiredAgentId)) {
    try {
      await requireTextFeatureTarget(agent, options.requiredTextFeatureTarget, options.signal);
      capable.push(agent);
    } catch { /* The selected agent does not support this target. */ }
  }
  return capable;
}

export function mergeDiscoveredAgents(primary: DiscoveredAgent[], companions: DiscoveredAgent[], requiredToolContractVersion = 0) {
  const merged = [...primary];
  for (const candidate of companions) {
    const index = merged.findIndex(agent => agent.id === candidate.id);
    if (index < 0) merged.push(candidate);
    else if (candidate.compatible && ['available', 'paused'].includes(candidate.status)) {
      const direct = merged[index]!;
      if (requiredToolContractVersion && (direct.toolContractVersion || 0) >= requiredToolContractVersion
        && (candidate.toolContractVersion || 0) < requiredToolContractVersion) continue;
      // A same-origin dev inventory may already hold this exact host's
      // installation credential. Do not replace it with lesser discovery
      // authority, and never carry it to a different companion endpoint.
      merged[index] = direct.endpoint === candidate.endpoint && direct.token && direct.controlAuthorized
        && ['available', 'paused'].includes(direct.status)
        ? { ...candidate, token: direct.token, controlAuthorized: true } : candidate;
    }
  }
  return merged;
}

export const normalizeRequiredCapabilities = normalizeAgentHostCapabilities;

async function requireTextFeatureTarget(candidate: DiscoveredAgent, target: string, signal: AbortSignal | undefined) {
  const targets = await listAgentExecutionTargets({ endpoint: candidate.endpoint, token: candidate.token, agent: candidate.id, signal: signal || AbortSignal.timeout(5000) });
  if (!targets.some(item => item.id === target && item.supportsTextFeatureJobs === true && item.status !== 'unavailable')) {
    throw new Error('No connected Companion supports text explanations on this gateway yet. Update the Companion in AI settings.');
  }
}

export async function connectAgentHostCandidate(options: AgentConnectionOptions & {candidate: DiscoveredAgent; requiredCapabilities: string[]; attempts: number; normalizeEndpoint: (value: string) => string; onConnected: (settings: {endpoint: string; token: string}) => Promise<unknown>}) {
  const current = () => options.isCurrent?.() !== false;
  const obsolete = () => new Error('CLI connection request was superseded.');
  if (!current()) throw obsolete();
  const endpoint = options.normalizeEndpoint(options.candidate.endpoint);
  if (options.candidate.token.length < 16 || options.candidate.token.length > 256) {
    throw new Error('CLI agent connection is not ready yet.');
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    if (!current()) throw obsolete();
    try {
      const status = await checkAgentHost({ endpoint, token: options.candidate.token, signal: options.signal });
      if (status?.paused === true || status?.state === 'paused') throw new Error('The getbased Companion is paused. Resume it in AI settings.');
      if (!agentHostSupportsCapabilities(status, options.requiredCapabilities)) {
        throw agentHostUpgradeRequiredError(options.requiredCapabilities[0] || 'requested-feature');
      }
      if (options.requiredToolContractVersion && normalizeAgentHostProtocolVersion(status.toolContractVersion) < options.requiredToolContractVersion) {
        throw agentHostUpgradeRequiredError('context-change-proposals');
      }
      if (options.requiredTextFeatureTarget) await requireTextFeatureTarget({ ...options.candidate, endpoint }, options.requiredTextFeatureTarget, options.signal);
      if (!current()) throw obsolete();
      await options.onConnected({ endpoint, token: options.candidate.token });
      return normalizeDiscoveredAgent({
        ...options.candidate, ...status, endpoint, token: options.candidate.token,
        status: 'available', compatible: true,
      });
    } catch (error) {
      lastError = error;
      if (!current()) throw obsolete();
      if ((error as {code?: unknown} | null | undefined)?.code === 'agent_host_upgrade_required') throw error;
      if (attempt < options.attempts - 1) await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('CLI agent connection is unavailable.');
}
