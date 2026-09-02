// @ts-check
// agent-access-proposals.js — decrypt, validate, persist, and apply external proposals.

import { getAgentActionManifest, runAgentAction, validateAgentActionInput } from './agent-actions/registry.js';
import { saveImportedDataForProfile } from './data.js';
import {
  MAX_PENDING_AGENT_PROPOSALS,
  normalizeAgentProposals,
} from './profile-data-migrations.js';
import { state } from './state.js';
import { getSyncRelay } from './sync-environment.js';
import { getAgentAccessState } from './sync-messenger.js';
import { showNotification } from './utils.js';

export const AGENT_PROPOSAL_AAD_PREFIX = 'getbased-agent-proposal-v1';
const MAX_PROPOSALS_PER_POLL = 50;
const MAX_PROPOSAL_LIFETIME_MS = 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

export function resolveAgentProposalGateway(relayUrl, pageUrl = globalThis.location?.href || '') {
  const relayBase = String(relayUrl || '').replace(/^wss:/u, 'https:').replace(/^ws:/u, 'http:').replace(/\/+$/u, '');
  try {
    const page = new URL(pageUrl);
    const override = page.searchParams.get('agentProposalGateway');
    const loopback = page.hostname === 'localhost' || page.hostname === '127.0.0.1' || page.hostname === '[::1]';
    if (loopback && override?.startsWith('/') && !override.startsWith('//')) {
      return `${page.origin}${override}`.replace(/\/+$/u, '');
    }
  } catch {
    // Use the configured Sync relay when the page URL is unavailable or malformed.
  }
  return relayBase;
}

const proposalDeps = {
  fetchImpl: (input, init) => fetch(input, init),
  getAgentAccessState,
  getRelayUrl: () => resolveAgentProposalGateway(getSyncRelay()),
  now: () => Date.now(),
  notify: (message, type = 'info') => showNotification(message, type, 5000),
  persistImportedData: (profileId, importedData, options) => saveImportedDataForProfile(
    profileId,
    importedData,
    { ...options, forceProfileScope: true },
  ),
  runAction: runAgentAction,
};

/** @param {Partial<typeof proposalDeps>} [deps] */
export function configureAgentAccessProposalDeps(deps = {}) {
  const previous = { ...proposalDeps };
  if (typeof deps.fetchImpl === 'function') proposalDeps.fetchImpl = deps.fetchImpl;
  if (typeof deps.getAgentAccessState === 'function') proposalDeps.getAgentAccessState = deps.getAgentAccessState;
  if (typeof deps.getRelayUrl === 'function') proposalDeps.getRelayUrl = deps.getRelayUrl;
  if (typeof deps.now === 'function') proposalDeps.now = deps.now;
  if (typeof deps.notify === 'function') proposalDeps.notify = deps.notify;
  if (typeof deps.persistImportedData === 'function') proposalDeps.persistImportedData = deps.persistImportedData;
  if (typeof deps.runAction === 'function') proposalDeps.runAction = deps.runAction;
  return previous;
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error('invalid_base64');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('invalid_context_key');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeContextKey(value) {
  const encoded = String(value || '').trim().replace(/^gbctx_v1_/u, '');
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length !== 32) throw new Error('invalid_context_key');
  return bytes;
}

async function contextKeyId(rawKey) {
  const digest = await crypto.subtle.digest('SHA-256', rawKey);
  return bytesToBase64Url(new Uint8Array(digest).slice(0, 12));
}

function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every(key => allowed.includes(key));
}

async function decryptEnvelope(envelope, contextKey) {
  const envelopeKeys = ['version', 'alg', 'keyDerivation', 'keyId', 'proposalId', 'iv', 'ciphertext'];
  if (!exactKeys(envelope, envelopeKeys)
      || envelope.version !== 1
      || envelope.alg !== 'AES-256-GCM'
      || envelope.keyDerivation !== 'raw-256-bit-key'
      || typeof envelope.proposalId !== 'string'
      || !/^proposal_[A-Za-z0-9_-]{6,112}$/u.test(envelope.proposalId)
      || typeof envelope.keyId !== 'string') {
    throw new Error('invalid_envelope');
  }
  const rawKey = decodeContextKey(contextKey);
  if (envelope.keyId !== await contextKeyId(rawKey)) throw new Error('wrong_context_key');
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > 64 * 1024) {
    throw new Error('invalid_envelope');
  }
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const aad = new TextEncoder().encode(`${AGENT_PROPOSAL_AAD_PREFIX}:${envelope.proposalId}`);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      cryptoKey,
      ciphertext,
    );
  } catch {
    throw new Error('proposal_decryption_failed');
  }
  try {
    return { envelopeId: envelope.proposalId, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) };
  } catch {
    throw new Error('invalid_proposal_plaintext');
  }
}

function proposalCapability(actionId) {
  const action = getAgentActionManifest().find(item => item.id === actionId);
  return action?.scopes?.length === 1 ? `${action.scopes[0]}:propose` : null;
}

function validatePlaintext(value, envelopeId, now, profileId) {
  if (!exactKeys(value, ['version', 'proposal']) || value.version !== 1) throw new Error('invalid_proposal_plaintext');
  const proposal = value.proposal;
  const proposalKeys = [
    'id', 'actionId', 'arguments', 'profileId', 'capability', 'source', 'issuedAt', 'expiresAt',
  ];
  if (!exactKeys(proposal, proposalKeys)
      || proposal.id !== envelopeId
      || typeof proposal.actionId !== 'string'
      || typeof proposal.profileId !== 'string'
      || typeof proposal.issuedAt !== 'string'
      || typeof proposal.expiresAt !== 'string'
      || !exactKeys(proposal.source, ['type', 'client'])
      || proposal.source.type !== 'external-agent'
      || typeof proposal.source.client !== 'string'
      || !/^[A-Za-z0-9._-]{1,40}$/u.test(proposal.source.client)) {
    throw new Error('invalid_proposal_plaintext');
  }
  if (proposal.profileId !== profileId) throw new Error('wrong_profile');
  const capability = proposalCapability(proposal.actionId);
  if (!capability || proposal.capability !== capability) throw new Error('capability_mismatch');
  const validation = validateAgentActionInput(proposal.actionId, proposal.arguments);
  if (!validation.ok) throw new Error('invalid_action_arguments');
  const issuedAt = Date.parse(proposal.issuedAt);
  const expiresAt = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
      || issuedAt > now + CLOCK_SKEW_MS
      || expiresAt <= now
      || expiresAt <= issuedAt
      || expiresAt - issuedAt > MAX_PROPOSAL_LIFETIME_MS) {
    throw new Error('expired_or_invalid_time_window');
  }
  return {
    id: proposal.id,
    actionId: proposal.actionId,
    arguments: validation.value,
    profileId: proposal.profileId,
    capability: proposal.capability,
    sourceClient: proposal.source.client,
    status: 'pending',
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

function proposalQueueUrl(baseUrl, proposalId = '') {
  const apiBase = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
  return proposalId
    ? `${apiBase}/agent-proposals/${encodeURIComponent(proposalId)}`
    : `${apiBase}/agent-proposals`;
}

async function acknowledgeProposal(baseUrl, token, proposalId) {
  try {
    await proposalDeps.fetchImpl(proposalQueueUrl(baseUrl, proposalId), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Durable local dedupe makes acknowledgement retries safe.
  }
}

export async function pollAgentAccessProposals() {
  const access = proposalDeps.getAgentAccessState();
  if (!access?.enabled || !access.token || !access.contextKey) {
    return { ingested: 0, rejected: 0, skipped: true };
  }
  const profileId = state.currentProfile;
  const profileData = state.importedData;
  const list = normalizeAgentProposals(profileData);
  const baseUrl = proposalDeps.getRelayUrl();
  let response;
  try {
    response = await proposalDeps.fetchImpl(proposalQueueUrl(baseUrl), {
      headers: { Authorization: `Bearer ${access.token}` },
    });
  } catch {
    return { ingested: 0, rejected: 0, unavailable: true };
  }
  if (response.status === 404) return { ingested: 0, rejected: 0, unavailable: true };
  if (!response.ok) return { ingested: 0, rejected: 0, unavailable: true };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ingested: 0, rejected: 1 };
  }
  if (!Array.isArray(payload?.proposals) || payload.proposals.length > MAX_PROPOSALS_PER_POLL) {
    return { ingested: 0, rejected: 1 };
  }

  const now = proposalDeps.now();
  const existingIds = new Set(list.map(proposal => proposal?.id).filter(Boolean));
  const accepted = [];
  const acknowledged = [];
  let pendingSlots = MAX_PENDING_AGENT_PROPOSALS
    - list.filter(proposal => proposal?.status === 'pending').length;
  let rejected = 0;
  for (const relayProposal of payload.proposals) {
    try {
      if (!exactKeys(relayProposal, ['proposalId', 'envelope', 'createdAt'])
          || relayProposal.proposalId !== relayProposal.envelope?.proposalId) {
        throw new Error('invalid_relay_proposal');
      }
      if (existingIds.has(relayProposal.proposalId)) {
        acknowledged.push(relayProposal.proposalId);
        continue;
      }
      const decrypted = await decryptEnvelope(relayProposal.envelope, access.contextKey);
      const proposal = validatePlaintext(decrypted.value, decrypted.envelopeId, now, profileId);
      if (pendingSlots <= 0) throw new Error('proposal_capacity_reached');
      accepted.push(proposal);
      pendingSlots -= 1;
      existingIds.add(proposal.id);
      acknowledged.push(proposal.id);
    } catch {
      rejected += 1;
    }
  }

  if (accepted.length === 0) {
    for (const proposalId of acknowledged) await acknowledgeProposal(baseUrl, access.token, proposalId);
    return { ingested: 0, rejected };
  }
  const previousProposals = structuredClone(list);
  list.push(...accepted);
  normalizeAgentProposals(profileData);
  const persisted = await proposalDeps.persistImportedData(
    profileId,
    profileData,
    { immediate: true, reason: 'agent-proposal-ingest' },
  );
  if (persisted === false) {
    profileData.agentProposals = previousProposals;
    return { ingested: 0, rejected, persistenceFailed: true };
  }
  for (const proposalId of acknowledged) await acknowledgeProposal(baseUrl, access.token, proposalId);
  const profileStillActive = state.currentProfile === profileId && state.importedData === profileData;
  if (profileStillActive) {
    proposalDeps.notify(
      accepted.length === 1 ? 'New agent proposal ready for review.' : `${accepted.length} new agent proposals ready for review.`,
      'info',
    );
    document.dispatchEvent(new CustomEvent('getbased-agent-proposals-changed'));
  }
  return { ingested: accepted.length, rejected, profileStillActive };
}

const applyInFlight = new Map();

export function isStoredAgentProposalApplying(proposalId) {
  return applyInFlight.has(proposalId);
}

export function applyStoredAgentProposal(proposalId) {
  if (applyInFlight.has(proposalId)) return applyInFlight.get(proposalId);
  const task = (async () => {
    const profileId = state.currentProfile;
    const profileData = state.importedData;
    const proposal = normalizeAgentProposals(profileData).find(item => item?.id === proposalId);
    if (!proposal) return { ok: false, code: 'proposal_not_found' };
    if (proposal.status === 'applied') return { ok: true, alreadyApplied: true, result: proposal.result };
    if (proposal.status !== 'pending') return { ok: false, code: 'proposal_not_pending' };
    if (proposal.profileId !== profileId) return { ok: false, code: 'wrong_profile' };
    const capability = proposalCapability(proposal.actionId);
    if (!capability || proposal.capability !== capability) return { ok: false, code: 'capability_mismatch' };
    const validation = validateAgentActionInput(proposal.actionId, proposal.arguments);
    if (!validation.ok) return { ok: false, code: 'invalid_action_arguments', errors: validation.errors };
    const now = proposalDeps.now();
    const issuedAt = Date.parse(proposal.issuedAt || '');
    const expiresAt = Date.parse(proposal.expiresAt || '');
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
        || issuedAt > now + CLOCK_SKEW_MS
        || expiresAt <= now
        || expiresAt <= issuedAt
        || expiresAt - issuedAt > MAX_PROPOSAL_LIFETIME_MS) {
      return { ok: false, code: 'proposal_expired' };
    }
    if (typeof proposal.sourceClient !== 'string'
        || !/^[A-Za-z0-9._-]{1,40}$/u.test(proposal.sourceClient)) {
      return { ok: false, code: 'invalid_proposal_source' };
    }
    const result = await proposalDeps.runAction(proposal.actionId, validation.value, {
      confirmed: true,
      actorId: `external-agent:${proposal.sourceClient || 'unknown'}`,
      idempotencyKey: proposal.id,
    });
    if (!result?.ok) return result;
    const appliedAt = new Date(proposalDeps.now()).toISOString();
    proposal.status = 'applied';
    proposal.result = result.result || null;
    proposal.appliedAt = appliedAt;
    proposal.updatedAt = appliedAt;
    const persisted = await proposalDeps.persistImportedData(
      profileId,
      profileData,
      { immediate: true, reason: 'agent-proposal-applied' },
    );
    if (persisted === false) return { ...result, statusPersistenceFailed: true };
    document.dispatchEvent(new CustomEvent('getbased-agent-proposals-changed'));
    return result;
  })().finally(() => applyInFlight.delete(proposalId));
  applyInFlight.set(proposalId, task);
  return task;
}

export async function dismissStoredAgentProposal(proposalId) {
  const profileId = state.currentProfile;
  const profileData = state.importedData;
  const storedProposal = Array.isArray(profileData?.agentProposals)
    ? profileData.agentProposals.find(item => item?.id === proposalId)
    : null;
  if (!storedProposal) return { ok: false, code: 'proposal_not_found' };
  if (storedProposal.profileId !== profileId) return { ok: false, code: 'wrong_profile' };
  const proposal = normalizeAgentProposals(profileData).find(item => item?.id === proposalId);
  if (!proposal) return { ok: false, code: 'proposal_not_found' };
  if (proposal.status !== 'pending') return { ok: false, code: 'proposal_not_pending' };
  const previous = structuredClone(proposal);
  const dismissedAt = new Date(proposalDeps.now()).toISOString();
  proposal.status = 'dismissed';
  proposal.dismissedAt = dismissedAt;
  proposal.updatedAt = dismissedAt;
  const persisted = await proposalDeps.persistImportedData(
    profileId,
    profileData,
    { immediate: true, reason: 'agent-proposal-dismissed' },
  );
  if (persisted === false) {
    Object.keys(proposal).forEach(key => delete proposal[key]);
    Object.assign(proposal, previous);
    return { ok: false, code: 'persistence_failed' };
  }
  document.dispatchEvent(new CustomEvent('getbased-agent-proposals-changed'));
  return { ok: true };
}
