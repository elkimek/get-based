// @ts-check
// sync-relay-health.js - relay quota, self-service, and push persistence checks

import { getErrorMessage, getErrorName } from './caught-error.js';

/** @typedef {{ id?: string | number, writeKey?: BufferSource }} SyncAppOwner */
/** @typedef {{ bytes: number, cap: number, pct: number, level: string }} RelayQuotaEstimate */
/** @typedef {{ storedBytes: number, messageCount: number, lastWriteToken: string | null, at: number }} RelaySnapshot */
/** @typedef {{ verdict: string, at: number, reason: string | null }} RelayHealthVerdict */

/** @type {() => SyncAppOwner | null} */
let _getAppOwner = () => null;
/** @type {() => string | null} */
let _getSyncRelay = () => null;
/** @type {((quota: RelayQuotaEstimate) => void) | null} */
let _onQuotaThreshold = null;

/** @param {{ getAppOwner?: () => SyncAppOwner | null, getSyncRelay?: () => string | null, onQuotaThreshold?: (quota: RelayQuotaEstimate) => void }} [deps] */
export function configureRelayHealth({ getAppOwner, getSyncRelay, onQuotaThreshold } = {}) {
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof getSyncRelay === 'function') _getSyncRelay = getSyncRelay;
  if (typeof onQuotaThreshold === 'function') _onQuotaThreshold = onQuotaThreshold;
}

function _appOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

// Compatibility fallback for relays that predate /self/owner-storage.
// Current relays return their configured per-owner quota and that value is
// cached below, so the UI does not claim a stale 50 MB limit when an operator
// has configured (for example) 200 MB.
export const RELAY_OWNER_QUOTA_BYTES = 50 * 1024 * 1024;

function _ownerStorageKey() {
  const ownerObj = _appOwner();
  const owner = ownerObj?.id ? String(ownerObj.id) : 'unknown';
  return `labcharts-relay-bytes-${owner}`;
}

function _ownerQuotaKey() {
  const ownerObj = _appOwner();
  const owner = ownerObj?.id ? String(ownerObj.id) : 'unknown';
  return `labcharts-relay-cap-${owner}`;
}

/** @param {number | string | null | undefined} bytes */
export function trackPushBytes(bytes) {
  const safeBytes = _coerceRelayBytes(bytes);
  if (!_appOwner()?.id || safeBytes <= 0) return;
  try {
    const key = _ownerStorageKey();
    const cur = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    localStorage.setItem(key, String(cur + safeBytes));
  } catch {}
  _maybeWarnQuotaThreshold();
}

/** @returns {RelayQuotaEstimate | null} */
export function getRelayQuotaEstimate() {
  if (!_appOwner()?.id) return null;
  let bytes = 0;
  let cap = RELAY_OWNER_QUOTA_BYTES;
  try { bytes = parseInt(localStorage.getItem(_ownerStorageKey()) || '0', 10) || 0; } catch {}
  try {
    const cachedCap = parseInt(localStorage.getItem(_ownerQuotaKey()) || '0', 10) || 0;
    if (cachedCap > 0) cap = cachedCap;
  } catch {}
  const pct = Math.min(100, Math.round((bytes / cap) * 100));
  let level = 'green';
  if (pct >= 95) level = 'red';
  else if (pct >= 80) level = 'amber';
  return { bytes, cap, pct, level };
}

export function resetRelayQuotaEstimate() {
  if (!_appOwner()?.id) return false;
  try {
    localStorage.removeItem(_ownerStorageKey());
    localStorage.removeItem(_ownerQuotaKey());
    return true;
  } catch { return false; }
}

/** @param {number | string | null | undefined} bytes
 * @param {number | string | null | undefined} [quotaBytes]
 */
function _setRelayQuotaBytes(bytes, quotaBytes) {
  const safeBytes = _coerceRelayBytes(bytes);
  if (!_appOwner()?.id || safeBytes < 0) return;
  const safeQuota = _coerceRelayBytes(quotaBytes);
  try {
    localStorage.setItem(_ownerStorageKey(), String(safeBytes));
    if (safeQuota > 0) localStorage.setItem(_ownerQuotaKey(), String(safeQuota));
  } catch {}
  _maybeWarnQuotaThreshold();
}

/** @param {number | string | null | undefined} bytes */
function _coerceRelayBytes(bytes) {
  const value = Number(bytes);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : -1;
}

// Mirrors the /self/* endpoints introduced in getbased-relay 1.2.0.
// Each request is HMAC-SHA256 signed with the user's own writeKey
// (the same Evolu secret the client already holds for pushes).
const SELF_URL_OVERRIDE_KEY = 'labcharts-self-url';

function _getSelfBaseUrl() {
  try {
    const override = localStorage.getItem(SELF_URL_OVERRIDE_KEY);
    if (override && /^https?:\/\//i.test(override)) {
      return override.replace(/\/+$/, '');
    }
  } catch {}
  const wss = _getSyncRelay();
  if (typeof wss !== 'string' || !wss) return null;
  try {
    const u = new URL(wss);
    if (u.protocol === 'wss:') u.protocol = 'https:';
    else if (u.protocol === 'ws:') u.protocol = 'http:';
    else return null;
    u.pathname = '';
    u.search = '';
    u.hash = '';
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.port = '4003';
    }
    return u.toString().replace(/\/$/, '');
  } catch { return null; }
}

/** @param {string} context */
async function _signSelfRequest(context) {
  const owner = _appOwner();
  if (!owner?.id || !owner?.writeKey) {
    throw new Error('owner_not_ready');
  }
  if (!globalThis.crypto?.subtle?.importKey) {
    throw new Error('subtle_crypto_unavailable');
  }
  const ownerId = String(owner.id);
  const timestamp = Date.now();
  const message = `${context}:${ownerId}:${timestamp}`;
  const key = await crypto.subtle.importKey(
    'raw',
    owner.writeKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return { ownerId, timestamp, signature };
}

export async function fetchOwnerStorageFromRelay() {
  const base = _getSelfBaseUrl();
  if (!base) return null;
  try {
    const { ownerId, timestamp, signature } = await _signSelfRequest('storage');
    const url = `${base}/self/owner-storage?ownerId=${encodeURIComponent(ownerId)}&timestamp=${timestamp}&signature=${signature}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    let r;
    try {
      r = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) return null;
    const body = await r.json();
    if (!body || typeof body.storedBytes !== 'number') return null;
    _setRelayQuotaBytes(body.storedBytes, body.quotaBytes);
    return {
      storedBytes: body.storedBytes,
      quotaBytes: body.quotaBytes ?? null,
      messageCount: typeof body.messageCount === 'number' ? body.messageCount : null,
      lastWriteToken: typeof body.lastWriteToken === 'string' ? body.lastWriteToken : null,
    };
  } catch { return null; }
}

let _ownerStorageRefreshTimer = null;

// Debounce authoritative probes across a burst of profile/itemRow commits.
// Push accounting remains immediate; the probe replaces that estimate with
// the relay's actual storedBytes and configured quota shortly afterward.
/** @param {number} [delayMs] */
export function scheduleOwnerStorageRefresh(delayMs = 1500) {
  if (!_appOwner()?.id) return;
  if (_ownerStorageRefreshTimer !== null) return;
  _ownerStorageRefreshTimer = setTimeout(() => {
    _ownerStorageRefreshTimer = null;
    void fetchOwnerStorageFromRelay();
  }, Math.max(0, delayMs));
}

/** @type {RelaySnapshot | null} */
let _lastRelaySnapshot = null;
/** @type {RelayHealthVerdict} */
let _lastVerifyVerdict = { verdict: 'unknown', at: 0, reason: null };
let _lastPushCommittedAt = 0;

export function getRelayHealthVerdict() {
  return { ..._lastVerifyVerdict };
}

// Exported for sync.js push acknowledgement wiring; not part of the public UI surface.
export function notePushCommitted() {
  _lastPushCommittedAt = Date.now();
}

export async function verifyPushLanded() {
  const fresh = await fetchOwnerStorageFromRelay();
  if (!fresh) {
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'relay-unreachable' };
    return _lastVerifyVerdict;
  }
  if (fresh.messageCount === null) {
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'pre-1.2.3-relay' };
    return _lastVerifyVerdict;
  }
  if (_lastPushCommittedAt > 0 && fresh.messageCount === 0 && fresh.storedBytes === 0) {
    _lastVerifyVerdict = {
      verdict: 'wedged',
      at: Date.now(),
      reason: 'pushes committed locally but relay reports zero messages and zero bytes',
    };
    return _lastVerifyVerdict;
  }
  if (!_lastRelaySnapshot) {
    _lastRelaySnapshot = {
      storedBytes: fresh.storedBytes,
      messageCount: fresh.messageCount,
      lastWriteToken: fresh.lastWriteToken,
      at: Date.now(),
    };
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'no-baseline-yet' };
    return _lastVerifyVerdict;
  }
  if (_lastPushCommittedAt <= _lastRelaySnapshot.at) {
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'no-push-since-baseline' };
    return _lastVerifyVerdict;
  }
  const advanced =
    fresh.storedBytes > _lastRelaySnapshot.storedBytes
    || fresh.messageCount > _lastRelaySnapshot.messageCount
    || (fresh.lastWriteToken && fresh.lastWriteToken !== _lastRelaySnapshot.lastWriteToken);
  if (advanced) {
    _lastVerifyVerdict = { verdict: 'healthy', at: Date.now(), reason: null };
  } else {
    _lastVerifyVerdict = {
      verdict: 'wedged',
      at: Date.now(),
      reason: `pushed at ${new Date(_lastPushCommittedAt).toISOString()} but relay still reports storedBytes=${fresh.storedBytes} messageCount=${fresh.messageCount}`,
    };
  }
  _lastRelaySnapshot = {
    storedBytes: fresh.storedBytes,
    messageCount: fresh.messageCount,
    lastWriteToken: fresh.lastWriteToken,
    at: Date.now(),
  };
  return _lastVerifyVerdict;
}

export async function compactOwnerSelfServe() {
  const base = _getSelfBaseUrl();
  if (!base) throw new Error('No relay configured');
  const { ownerId, timestamp, signature } = await _signSelfRequest('compact');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let r;
  try {
    r = await fetch(`${base}/self/compact-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, timestamp, signature }),
      signal: ctrl.signal,
    });
  } catch (fetchErr) {
    const reason = getErrorName(fetchErr) === 'AbortError'
      ? 'request timed out'
      : getErrorMessage(fetchErr, getErrorName(fetchErr) || 'NetworkError');
    throw new Error(`Relay request failed: ${reason}`);
  } finally { clearTimeout(timer); }
  if (!r.ok) {
    let detail = '';
    try { const body = await r.json(); detail = body?.error ? ` (${body.error})` : ''; } catch {}
    throw new Error(`Relay returned ${r.status}${detail}`);
  }
  const body = await r.json();
  if (typeof body?.afterStoredBytes === 'number') {
    _setRelayQuotaBytes(body.afterStoredBytes);
  } else {
    resetRelayQuotaEstimate();
  }
  try { localStorage.removeItem('labcharts-relay-quota-warned'); } catch {}
  try { localStorage.removeItem(`labcharts-${ownerId}-relay-quota-warned`); } catch {}
  return body;
}

function _maybeWarnQuotaThreshold() {
  try {
    const q = getRelayQuotaEstimate();
    if (!q) return;
    const ownerObj = _appOwner();
    const owner = ownerObj?.id ? String(ownerObj.id) : 'unknown';
    const key = `labcharts-${owner}-relay-quota-warned`;
    if (q.level === 'green') {
      // A fresh authoritative quota can legitimately downgrade an old
      // hardcoded-limit warning. Clear it so future real thresholds notify.
      localStorage.removeItem(key);
      return;
    }
    const prev = localStorage.getItem(key) || '';
    const want = q.level;
    const order = { '': 0, green: 0, amber: 1, red: 2 };
    if (order[want] <= order[prev]) return;
    localStorage.setItem(key, want);
    _onQuotaThreshold?.(q);
  } catch {}
}
