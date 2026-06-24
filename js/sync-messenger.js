// @ts-check
// sync-messenger.js - Agent Access token and context gateway helpers.

import { state } from './state.js';

const MESSENGER_TOKEN_KEY = 'labcharts-messenger-token';
const MESSENGER_ENABLED_KEY = 'labcharts-messenger-enabled';
const MESSENGER_CONTEXT_KEY_KEY = 'labcharts-agent-context-key';

/** @type {() => string} */
let _getSyncRelay = () => 'wss://sync.getbased.health';
/** @type {() => any} */
let _getAppOwner = () => null;
/** @type {(...args: any[]) => void} */
let _debug = () => {};
/** @type {number | null} */
let _contextPushTimer = null;

/** @param {{ getSyncRelay?: () => string, getAppOwner?: () => any, debug?: (...args: any[]) => void }} [deps] */
export function configureSyncMessenger({ getSyncRelay, getAppOwner, debug } = {}) {
  if (typeof getSyncRelay === 'function') _getSyncRelay = getSyncRelay;
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof debug === 'function') _debug = debug;
}

function currentSyncRelay() {
  try { return _getSyncRelay?.() || 'wss://sync.getbased.health'; } catch { return 'wss://sync.getbased.health'; }
}

function currentAppOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

function dbg(...args) {
  try { _debug(...args); } catch {}
}

const AGENT_CONTEXT_CRYPTO_VERSION = 2;
const AGENT_CONTEXT_AAD_PREFIX = 'getbased-agent-context-v2';

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function ownerIdString(owner) {
  if (!owner?.id) return null;
  return String(owner.id);
}

function ownerWriteKeyBytes(owner) {
  if (!owner?.writeKey) return null;
  return owner.writeKey instanceof Uint8Array ? owner.writeKey : new Uint8Array(owner.writeKey);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(new Uint8Array(digest));
}

async function signAgentContextRequest({ owner, token, profileId, relayContext, timestamp }) {
  if (!crypto?.subtle) throw new Error('Agent Access owner signing requires WebCrypto');
  const ownerId = ownerIdString(owner);
  const writeKey = ownerWriteKeyBytes(owner);
  if (!ownerId || !writeKey) throw new Error('Agent Access requires Sync identity — enable or restore Cross-device Sync first');
  const tokenHash = await sha256Hex(token);
  const contextHash = await sha256Hex(relayContext);
  const key = await crypto.subtle.importKey('raw', writeKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = `agent-context:${ownerId}:${timestamp}:${tokenHash}:${profileId || 'default'}:${contextHash}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return { ownerId, tokenHash, contextHash, signature: bytesToHex(new Uint8Array(signature)) };
}

function base64UrlToBytes(value) {
  const raw = String(value || '').trim();
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function generateAgentContextKeyValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gbctx_v1_${bytesToBase64Url(bytes)}`;
}

function decodeAgentContextKey(keyValue) {
  const trimmed = String(keyValue || '').trim();
  const encoded = trimmed.startsWith('gbctx_v1_') ? trimmed.slice('gbctx_v1_'.length) : trimmed;
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length !== 32) throw new Error('Agent Context key must decode to 32 bytes');
  return bytes;
}

async function agentContextKeyId(rawKeyBytes) {
  const digest = await crypto.subtle.digest('SHA-256', rawKeyBytes);
  return bytesToBase64Url(new Uint8Array(digest).slice(0, 12));
}

async function importAgentContextCryptoKey(rawKeyBytes) {
  if (!crypto?.subtle) throw new Error('Agent Access encryption requires WebCrypto');
  return crypto.subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
}

export async function encryptAgentContextForRelay(context, contextKey, profileId) {
  const rawKey = decodeAgentContextKey(contextKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAgentContextCryptoKey(rawKey);
  const aad = new TextEncoder().encode(`${AGENT_CONTEXT_AAD_PREFIX}:${profileId || 'default'}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    new TextEncoder().encode(String(context || '')),
  );
  return {
    version: AGENT_CONTEXT_CRYPTO_VERSION,
    alg: 'AES-256-GCM',
    keyDerivation: 'raw-256-bit-key',
    keyId: await agentContextKeyId(rawKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export function isMessengerEnabled() {
  return localStorage.getItem(MESSENGER_ENABLED_KEY) === 'true';
}

export function getMessengerToken() {
  return localStorage.getItem(MESSENGER_TOKEN_KEY) || null;
}

export function getMessengerContextKey() {
  return localStorage.getItem(MESSENGER_CONTEXT_KEY_KEY) || null;
}

export function ensureMessengerContextKey() {
  const existing = getMessengerContextKey();
  if (existing) return existing;
  const key = generateAgentContextKeyValue();
  localStorage.setItem(MESSENGER_CONTEXT_KEY_KEY, key);
  return key;
}

export function generateMessengerContextKey() {
  const key = generateAgentContextKeyValue();
  localStorage.setItem(MESSENGER_CONTEXT_KEY_KEY, key);
  return key;
}

function revokeMessengerTokenRemote(token) {
  if (!token) return;
  const owner = currentAppOwner();
  const relay = currentSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  const profileId = 'default';
  const relayContext = '';
  const timestamp = Date.now();
  signAgentContextRequest({ owner, token, profileId, relayContext, timestamp })
    .then(ownerProof => fetch(`${relay}/api/context`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ownerId: ownerProof.ownerId,
        profileId,
        context: relayContext,
        timestamp,
        signature: ownerProof.signature,
      }),
    }))
    .then(res => {
      if (res && !res.ok) dbg(`Agent Access revoke returned ${res.status}`);
    })
    .catch(e => {
      // Local revocation still wins; the relay mapping expires by token
      // rotation/owner limits, and the user can delete relay data from the
      // server if this browser has already lost the Sync identity.
      console.warn('[sync] Agent Access remote revoke failed:', e);
    });
}

export function generateMessengerToken() {
  const previousToken = getMessengerToken();
  if (previousToken) revokeMessengerTokenRemote(previousToken);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(MESSENGER_TOKEN_KEY, token);
  ensureMessengerContextKey();
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'true');
  return token;
}

export function revokeMessengerToken() {
  const token = getMessengerToken();
  revokeMessengerTokenRemote(token);
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.removeItem(MESSENGER_CONTEXT_KEY_KEY);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'false');
}

export function pushContextToGateway() {
  if (!isMessengerEnabled()) return;
  const token = getMessengerToken();
  if (!token) return;
  const contextKey = ensureMessengerContextKey();

  clearTimeout(_contextPushTimer);
  _contextPushTimer = setTimeout(async () => {
    try {
      const { buildLabContext, buildWearableSeriesSection, getAgentWearableSeriesDays } = await import('./lab-context.js');
      const baseContext = buildLabContext({ skipGroupFilter: true });
      // Optional wearable daily-series section - user picks 0 (off) / 7 /
      // 30 / 90 days in Settings -> Agent Access. Reads L1 IDB on the
      // browser. Before anything touches the relay, encrypt the rendered
      // context locally with a dedicated Agent Context key. The Agent Access
      // token authorizes relay fetches; it is not AES key material.
      // Append AFTER the rest so the section parser treats it as a sibling.
      const seriesDays = getAgentWearableSeriesDays();
      const seriesBlock = seriesDays > 0
        ? await buildWearableSeriesSection(seriesDays).catch(() => '')
        : '';
      const context = seriesBlock ? `${baseContext}\n${seriesBlock}\n` : baseContext;
      const profileId = state.currentProfile || 'default';
      const encryptedContext = await encryptAgentContextForRelay(context, contextKey, profileId);
      // The gateway only needs the active profileId - do not leak the full
      // profile-name list. Profile names can include real names; keep them
      // out of the relay envelope entirely.
      const relay = currentSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

      const relayContext = JSON.stringify({ encryptedContext });
      const timestamp = Date.now();
      const ownerProof = await signAgentContextRequest({
        owner: currentAppOwner(),
        token,
        profileId,
        relayContext,
        timestamp,
      });
      const res = await fetch(`${relay}/api/context`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId,
          context: relayContext,
          ownerId: ownerProof.ownerId,
          timestamp,
          signature: ownerProof.signature,
        }),
      });
      if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
      dbg(`Encrypted context pushed to gateway (profile: ${profileId}, series: ${seriesBlock ? 'yes' : 'no'})`);
    } catch (e) {
      console.warn('[sync] Context push failed:', e);
    }
  }, 5000); // 5s debounce - less urgent than sync
}
