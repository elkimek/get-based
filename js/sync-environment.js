// @ts-check
// sync-environment.js - relay URL and browser capability helpers.

import { getUtilsRuntimeHostname } from './utils-runtime.js';

const SYNC_RELAY_KEY = 'labcharts-sync-relay';
const DEFAULT_RELAY = 'wss://sync.getbased.health';
const ONION_RELAY = 'ws://udou6gehyfpfccdjpibmuttaoauawmh5cgzszffnskbvczppvr2sfjad.onion';

export function getSyncRelay() {
  const custom = localStorage.getItem(SYNC_RELAY_KEY);
  // On .onion, always use the onion relay (ignore stored clearnet relay)
  if (getUtilsRuntimeHostname().endsWith('.onion')) return ONION_RELAY;
  return custom || DEFAULT_RELAY;
}

export function setSyncRelay(url) {
  localStorage.setItem(SYNC_RELAY_KEY, url);
}

// Probe relay connectivity via a test WebSocket
export function checkRelayConnection(timeout = 4000) {
  return new Promise(resolve => {
    const relay = getSyncRelay();
    try {
      const ws = new WebSocket(relay + '/ping');
      const timer = setTimeout(() => { ws.close(); resolve(false); }, timeout);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
      ws.onerror = () => { clearTimeout(timer); ws.close(); resolve(false); };
    } catch { resolve(false); }
  });
}

/**
 * Returns null when sync is supported, or a human-readable reason string
 * when it isn't. Used to fail-fast with a clear message instead of letting
 * Evolu's worker hang for 30s on a missing primitive.
 *
 * Evolu 7 uses dedicated Workers coordinated via BroadcastChannel and Web
 * Locks. Evolu 8 uses SharedWorker when available and installs a Web Worker
 * one-tab fallback when it is not. Both paths still require locks, OPFS, and
 * WebCrypto, so SharedWorker itself is not a capability gate.
 */
export function getSyncBlocker() {
  if (!navigator.locks?.request) return 'navigator.locks not available — browser missing Web Locks API';
  if (!navigator.storage) return 'navigator.storage not available — browser missing StorageManager API. Upgrade to a current browser (Chrome 86+, Firefox 105+, Safari 15.2+) for cross-device sync.';
  if (!navigator.storage.getDirectory) return 'OPFS (Origin Private File System) not available. Upgrade to a current browser for cross-device sync.';
  if (!crypto?.subtle) return 'crypto.subtle (WebCrypto) not available';
  return null;
}
