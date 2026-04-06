// nostr-discovery.js — Discover Routstr AI nodes via Nostr relays (NIP-91 / Kind 38421)
// Queries multiple relays in parallel, parses provider announcements, health-checks endpoints.

import { isDebugMode } from './utils.js';

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const ROUTSTR_EVENT_KIND = 38421;
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.routstr.com',
];
const RELAY_TIMEOUT = 5000; // ms per relay
const HEALTH_TIMEOUT = 4000;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════
let _cachedNodes = null;
let _cacheTime = 0;

// ═══════════════════════════════════════════════
// RELAY QUERY
// ═══════════════════════════════════════════════

/** Query a single relay for Kind 38421 events */
function _queryRelay(relayUrl) {
  return new Promise((resolve) => {
    const events = [];
    let ws;
    const timer = setTimeout(() => {
      try { ws?.close(); } catch {}
      resolve(events);
    }, RELAY_TIMEOUT);

    try {
      ws = new WebSocket(relayUrl);
      const subId = 'routstr-' + Math.random().toString(36).slice(2, 8);

      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', subId, { kinds: [ROUTSTR_EVENT_KIND], limit: 50 }]));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
            events.push(data[2]);
          } else if (data[0] === 'EOSE') {
            // End of stored events — close connection
            clearTimeout(timer);
            ws.close();
            resolve(events);
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timer);
        resolve(events);
      };

      ws.onclose = () => {
        clearTimeout(timer);
        resolve(events);
      };
    } catch {
      clearTimeout(timer);
      resolve(events);
    }
  });
}

/** Parse a Nostr event into a node descriptor */
function _parseNodeEvent(event) {
  const tags = event.tags || [];
  const urls = tags.filter(t => t[0] === 'u').map(t => t[1]);
  const mints = tags.filter(t => t[0] === 'mint').map(t => t[1]);
  const dTag = tags.find(t => t[0] === 'd')?.[1] || event.pubkey;
  const version = tags.find(t => t[0] === 'version')?.[1] || null;

  let name = dTag;
  let about = '';
  try {
    const content = JSON.parse(event.content || '{}');
    if (content.name) name = content.name;
    if (content.about) about = content.about;
  } catch {}

  return {
    id: dTag,
    pubkey: event.pubkey,
    name,
    about,
    urls: urls.filter(u => u.startsWith('http')),
    onion: urls.find(u => u.includes('.onion')) || null,
    mints,
    version,
    createdAt: event.created_at,
    // Populated by health check:
    online: null,
    models: [],
    modelCount: 0,
  };
}

/** Deduplicate nodes by `d` tag (keep most recent) */
function _deduplicateNodes(events) {
  const byId = {};
  for (const event of events) {
    const node = _parseNodeEvent(event);
    if (!byId[node.id] || node.createdAt > byId[node.id].createdAt) {
      byId[node.id] = node;
    }
  }
  return Object.values(byId);
}

// ═══════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════

/** Check if a node is online and get its models */
async function _healthCheck(node) {
  const url = node.urls[0];
  if (!url) { node.online = false; return node; }
  // Skip URLs that can't be reached from a browser (reduces console noise)
  if (url.includes('.onion') || url.startsWith('http://localhost') || url.includes('//v1')) {
    node.online = false; return node;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
    const res = await fetch(url.replace(/\/+$/, '') + '/v1/models', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) { node.online = false; return node; }
    const json = await res.json();
    const models = (json.data || []).filter(m => m.id && m.enabled !== false);
    node.online = true;
    node.models = models.map(m => ({ id: m.id, name: m.name || m.id }));
    node.modelCount = models.length;
  } catch {
    node.online = false;
  }
  return node;
}

// ═══════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════

/** Discover Routstr nodes from Nostr relays.
 *  Returns array of node descriptors with health status.
 *  Caches results for 5 minutes. */
export async function discoverNodes(forceRefresh) {
  if (!forceRefresh && _cachedNodes && (Date.now() - _cacheTime < CACHE_TTL)) {
    return _cachedNodes;
  }

  if (isDebugMode()) console.log('[nostr] Discovering Routstr nodes from', DEFAULT_RELAYS.length, 'relays');

  // Query all relays in parallel
  const results = await Promise.all(DEFAULT_RELAYS.map(r => _queryRelay(r)));
  const allEvents = results.flat();

  if (isDebugMode()) console.log('[nostr] Found', allEvents.length, 'events');

  // Deduplicate by provider ID
  const nodes = _deduplicateNodes(allEvents);

  if (isDebugMode()) console.log('[nostr] Unique nodes:', nodes.length);

  // Health check all nodes in parallel
  await Promise.all(nodes.map(n => _healthCheck(n)));

  // Sort: online first, then by model count
  nodes.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return b.modelCount - a.modelCount;
  });

  _cachedNodes = nodes;
  _cacheTime = Date.now();

  return nodes;
}

/** Get the currently selected node URL */
export function getSelectedNodeUrl() {
  return localStorage.getItem('labcharts-routstr-node') || null;
}

/** Set the selected node URL */
export function setSelectedNodeUrl(url) {
  localStorage.setItem('labcharts-routstr-node', url);
}

/** Clear node cache (force re-discovery on next call) */
export function clearNodeCache() {
  _cachedNodes = null;
  _cacheTime = 0;
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════
Object.assign(window, {
  nostrDiscoverNodes: discoverNodes,
  nostrGetSelectedNode: getSelectedNodeUrl,
  nostrSetSelectedNode: setSelectedNodeUrl,
  nostrClearNodeCache: clearNodeCache,
});
