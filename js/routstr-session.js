// @ts-check
// A single encrypted credential value binds each bearer key to its node.
import { getCachedKey, updateKeyCache } from './crypto-key-cache.js';
import { encryptedGetItem } from './crypto.js';
import { encryptedSetProviderItemRuntime, touchRoutstrSessionClock, dispatchAISettingsLocalChangedRuntime } from './api-provider-storage-runtime.js';
import { canonicalRoutstrUrl } from './routstr-validation.js';
export const ROUTSTR_SESSIONS_KEY = 'labcharts-routstr-sessions';
const KEY = ROUTSTR_SESSIONS_KEY;
const LEGACY_KEY = 'labcharts-routstr-key';
let writes = Promise.resolve();

export function parseRoutstrSessions(raw, legacyNode, legacyClock = 0) {
  const sessions = {};
  if (!raw) return sessions;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.sessions || typeof parsed.sessions !== 'object') return sessions;
    for (const [url, record] of Object.entries(parsed.sessions)) {
      if (canonicalRoutstrUrl(url) !== url || typeof record?.key !== 'string' || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 0) continue;
      if (record.key && !/^(sk-|cashu)/.test(record.key)) continue;
      sessions[url] = { key: record.key, updatedAt: record.updatedAt };
    }
  } catch {
    if (typeof raw === 'string' && /^(sk-|cashu)/.test(raw) && legacyNode) {
      try { sessions[canonicalRoutstrUrl(legacyNode)] = { key: raw, updatedAt: Number(legacyClock) || 0 }; } catch {}
    }
  }
  return sessions;
}
export function getRoutstrSessionKey(nodeUrl = localStorage.getItem('labcharts-routstr-node')) {
  try {
    const sessions = parseRoutstrSessions(getCachedKey(KEY) || getCachedKey(LEGACY_KEY), localStorage.getItem('labcharts-routstr-node'), Number(localStorage.getItem('labcharts-routstr-session-updated-at')));
    return sessions[canonicalRoutstrUrl(nodeUrl)]?.key || '';
  } catch { return ''; }
}
export function encodeMergedRoutstrSessions(localRaw, localNode, remoteRaw, remoteNode, localClock, remoteClock) {
  const merged = parseRoutstrSessions(localRaw, localNode, localClock);
  const incoming = parseRoutstrSessions(remoteRaw, remoteNode, remoteClock);
  if (!remoteRaw && remoteNode) {
    try { incoming[canonicalRoutstrUrl(remoteNode)] = { key: '', updatedAt: Number(remoteClock) || 0 }; } catch {}
  }
  for (const [node, record] of Object.entries(incoming)) {
    if (!merged[node] || record.updatedAt >= merged[node].updatedAt) merged[node] = record;
  }
  return JSON.stringify({ version: 1, sessions: merged });
}
export function withRoutstrSessionLock(run) {
  const result = writes.then(() => navigator.locks?.request ? navigator.locks.request('getbased-routstr-session', run) : run());
  writes = result.catch(() => {});
  return result;
}

export function saveRoutstrSessionKey(key, nodeUrl = localStorage.getItem('labcharts-routstr-node'), expectedKey = undefined) {
  const node = canonicalRoutstrUrl(nodeUrl);
  if (key && !/^(sk-|cashu)/.test(key)) throw new Error('Invalid Routstr credential');
  const run = async () => {
    const fresh = await encryptedGetItem(KEY) || await encryptedGetItem(LEGACY_KEY);
    const sessions = parseRoutstrSessions(fresh, localStorage.getItem('labcharts-routstr-node'), Number(localStorage.getItem('labcharts-routstr-session-updated-at')));
    const currentKey = sessions[node]?.key || '';
    if (expectedKey !== undefined && currentKey !== expectedKey && currentKey !== key) throw new Error('Node session changed during this deposit. Both the current session and deposit recovery record have been retained.');
    const updatedAt = Math.max(Date.now(), ...Object.values(sessions).map(record => record.updatedAt + 1));
    sessions[node] = { key, updatedAt };
    const value = JSON.stringify({ version: 1, sessions });
    await encryptedSetProviderItemRuntime(KEY, value);
    updateKeyCache(KEY, value);
    // Old clients must never interpret the whole credential map as a bearer key.
    await encryptedSetProviderItemRuntime(LEGACY_KEY, '');
    updateKeyCache(LEGACY_KEY, '');
    touchRoutstrSessionClock();
    dispatchAISettingsLocalChangedRuntime();
  };
  return withRoutstrSessionLock(run);
}
