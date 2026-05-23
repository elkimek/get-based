// sync-relay-health.js - relay quota, self-service, and push persistence checks

let _getAppOwner = () => null;
let _getSyncRelay = () => null;
let _onQuotaThreshold = null;

export function configureRelayHealth({ getAppOwner, getSyncRelay, onQuotaThreshold } = {}) {
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof getSyncRelay === 'function') _getSyncRelay = getSyncRelay;
  if (typeof onQuotaThreshold === 'function') _onQuotaThreshold = onQuotaThreshold;
}

function _appOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

// The relay caps each owner at 50 MB of evolu_message rows; once that
// fills, writes are silently rejected and clients see "push committed"
// with no actual durable write.
export const RELAY_OWNER_QUOTA_BYTES = 50 * 1024 * 1024;

function _ownerStorageKey() {
  const ownerObj = _appOwner();
  const owner = ownerObj?.id ? String(ownerObj.id) : 'unknown';
  return `labcharts-relay-bytes-${owner}`;
}

export function trackPushBytes(bytes) {
  if (!_appOwner()?.id || !Number.isFinite(bytes) || bytes <= 0) return;
  try {
    const key = _ownerStorageKey();
    const cur = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    localStorage.setItem(key, String(cur + bytes));
  } catch {}
  _maybeWarnQuotaThreshold();
}

export function getRelayQuotaEstimate() {
  if (!_appOwner()?.id) return null;
  let bytes = 0;
  try { bytes = parseInt(localStorage.getItem(_ownerStorageKey()) || '0', 10) || 0; } catch {}
  const cap = RELAY_OWNER_QUOTA_BYTES;
  const pct = Math.min(100, Math.round((bytes / cap) * 100));
  let level = 'green';
  if (pct >= 95) level = 'red';
  else if (pct >= 80) level = 'amber';
  return { bytes, cap, pct, level };
}

export function resetRelayQuotaEstimate() {
  if (!_appOwner()?.id) return false;
  try { localStorage.removeItem(_ownerStorageKey()); return true; } catch { return false; }
}

function _setRelayQuotaBytes(bytes) {
  if (!_appOwner()?.id || !Number.isFinite(bytes) || bytes < 0) return;
  try { localStorage.setItem(_ownerStorageKey(), String(Math.round(bytes))); } catch {}
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
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const body = await r.json();
    if (!body || typeof body.storedBytes !== 'number') return null;
    _setRelayQuotaBytes(body.storedBytes);
    return {
      storedBytes: body.storedBytes,
      quotaBytes: body.quotaBytes ?? null,
      messageCount: typeof body.messageCount === 'number' ? body.messageCount : null,
      lastWriteToken: typeof body.lastWriteToken === 'string' ? body.lastWriteToken : null,
    };
  } catch { return null; }
}

let _lastRelaySnapshot = null;
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
    const reason = fetchErr?.name === 'AbortError'
      ? 'request timed out'
      : (fetchErr?.message || fetchErr?.name || 'NetworkError');
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
    if (!q || q.level === 'green') return;
    const ownerObj = _appOwner();
    const owner = ownerObj?.id ? String(ownerObj.id) : 'unknown';
    const key = `labcharts-${owner}-relay-quota-warned`;
    const prev = localStorage.getItem(key) || '';
    const want = q.level;
    const order = { '': 0, green: 0, amber: 1, red: 2 };
    if (order[want] <= order[prev]) return;
    localStorage.setItem(key, want);
    _onQuotaThreshold?.(q);
  } catch {}
}
