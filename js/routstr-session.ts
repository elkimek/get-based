interface RoutstrSession { key: string; updatedAt: number; archivedKeys?: string[] }

// A single encrypted credential value binds each bearer key to its node.
import { getCachedKey, updateKeyCache } from './crypto-key-cache.js';
import { encryptedGetItem } from './crypto.js';
import { encryptedSetProviderItemRuntime, touchRoutstrSessionClock, dispatchAISettingsLocalChangedRuntime } from './api-provider-storage-runtime.js';
import { canonicalRoutstrUrl } from './url-safety.js';
export const ROUTSTR_SESSIONS_KEY = 'labcharts-routstr-sessions';
const KEY = ROUTSTR_SESSIONS_KEY;
const LEGACY_KEY = 'labcharts-routstr-key';
let writes: Promise<unknown> = Promise.resolve();

function normalizeArchivedKeys(value: unknown, activeKey: string) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key): key is string => typeof key === 'string' && /^(sk-|cashu)/.test(key) && key !== activeKey))].sort();
}

export function parseRoutstrSessions(raw: unknown, legacyNode: unknown, legacyClock = 0) {
  const sessions: Record<string, RoutstrSession> = {};
  if (!raw) return sessions;
  try {
    const parsed = JSON.parse(raw as string);
    if (parsed?.version !== 1 || !parsed.sessions || typeof parsed.sessions !== 'object') return sessions;
    for (const [url, record] of Object.entries(parsed.sessions as Record<string, { key: string; updatedAt: number; archivedKeys?: unknown }>)) {
      if (canonicalRoutstrUrl(url) !== url || typeof record?.key !== 'string' || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 0) continue;
      if (record.key && !/^(sk-|cashu)/.test(record.key)) continue;
      const archivedKeys = normalizeArchivedKeys(record.archivedKeys, record.key);
      sessions[url] = { key: record.key, updatedAt: record.updatedAt, ...(archivedKeys.length ? { archivedKeys } : {}) };
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
export function getArchivedRoutstrSessionKeys(nodeUrl = localStorage.getItem('labcharts-routstr-node')): string[] {
  try {
    const sessions = parseRoutstrSessions(getCachedKey(KEY) || getCachedKey(LEGACY_KEY), localStorage.getItem('labcharts-routstr-node'), Number(localStorage.getItem('labcharts-routstr-session-updated-at')));
    return sessions[canonicalRoutstrUrl(nodeUrl)]?.archivedKeys || [];
  } catch { return []; }
}
export function encodeMergedRoutstrSessions(localRaw: unknown, localNode: unknown, remoteRaw: unknown, remoteNode: unknown, localClock: number, remoteClock: number) {
  const merged = parseRoutstrSessions(localRaw, localNode, localClock);
  const incoming = parseRoutstrSessions(remoteRaw, remoteNode, remoteClock);
  if (!remoteRaw && remoteNode) {
    try { incoming[canonicalRoutstrUrl(remoteNode)] = { key: '', updatedAt: Number(remoteClock) || 0 }; } catch {}
  }
  for (const [node, record] of Object.entries(incoming)) {
    const local = merged[node];
    const winner = !local || record.updatedAt >= local.updatedAt ? record : local;
    const archivedKeys = normalizeArchivedKeys([...(local?.archivedKeys || []), ...(record.archivedKeys || [])], winner.key);
    merged[node] = { key: winner.key, updatedAt: winner.updatedAt, ...(archivedKeys.length ? { archivedKeys } : {}) };
  }
  return JSON.stringify({ version: 1, sessions: merged });
}
export function withRoutstrSessionLock<Value>(run: () => Value | PromiseLike<Value>) {
  const result = writes.then(() => navigator.locks?.request ? navigator.locks.request('getbased-routstr-session', run) : run());
  writes = result.catch(() => {});
  return result;
}

export function saveRoutstrSessionKey(key: string, nodeUrl = localStorage.getItem('labcharts-routstr-node'), expectedKey: string | undefined = undefined, archivePrevious = false) {
  const node = canonicalRoutstrUrl(nodeUrl);
  if (key && !/^(sk-|cashu)/.test(key)) throw new Error('Invalid Routstr credential');
  const run = async () => {
    const fresh = await encryptedGetItem(KEY) || await encryptedGetItem(LEGACY_KEY);
    const sessions = parseRoutstrSessions(fresh, localStorage.getItem('labcharts-routstr-node'), Number(localStorage.getItem('labcharts-routstr-session-updated-at')));
    const currentKey = sessions[node]?.key || '';
    if (expectedKey !== undefined && currentKey !== expectedKey && currentKey !== key) throw new Error('Node session changed during this deposit. Both the current session and deposit recovery record have been retained.');
    const updatedAt = Math.max(Date.now(), ...Object.values(sessions).map(record => record.updatedAt + 1));
    const archivedKeys = normalizeArchivedKeys([...(sessions[node]?.archivedKeys || []), ...(archivePrevious === true && currentKey ? [currentKey] : [])], key);
    sessions[node] = { key, updatedAt, ...(archivedKeys.length ? { archivedKeys } : {}) };
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
