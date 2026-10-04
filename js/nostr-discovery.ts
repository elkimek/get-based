export interface RoutstrNode {
  id: string;
  pubkey: string;
  name: unknown;
  about: unknown;
  urls: string[];
  onion: string | null;
  mints: Array<string | undefined>;
  version: string | null;
  createdAt: number;
  online: boolean | null;
  models: Array<{ id: unknown; name: unknown }>;
  modelCount: number;
}
interface NodeAnnouncement {
  kind: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
}
interface NodeCatalog { data?: Array<{ id?: unknown; name?: unknown; enabled?: unknown }> }

// nostr-discovery.js — Discover Routstr AI nodes via Nostr relays (NIP-91 / Kind 38421)
// Queries multiple relays in parallel, parses provider announcements, health-checks endpoints.

import { canonicalRoutstrUrl, verifyRoutstrAnnouncement } from './routstr-validation.js';
import { getCachedKey } from './crypto-key-cache.js';
import { isDebugMode } from './utils.js';
import { isValidExternalUrl } from './url-safety.js';
import {
  dispatchAISettingsLocalChangedRuntime,
  touchRoutstrSessionClock,
} from './api-provider-storage-runtime.js';
import { clearRoutstrModelCaches } from './routstr-model-cache.js';

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
let _cachedNodes: RoutstrNode[] | null = null;
let _cacheTime = 0;
let _discoveryInFlight: Promise<RoutstrNode[]> | null = null;

// ═══════════════════════════════════════════════
// RELAY QUERY
// ═══════════════════════════════════════════════

/** Query a single relay for Kind 38421 events */
function _queryRelay(relayUrl: string) {
  return new Promise<unknown[]>((resolve) => {
    const events: unknown[] = [];
    let ws: WebSocket | undefined;
    const timer = setTimeout(() => {
      try { ws?.close(); } catch {}
      resolve(events);
    }, RELAY_TIMEOUT);

    try {
      ws = new WebSocket(relayUrl);
      const subId = 'routstr-' + Math.random().toString(36).slice(2, 8);

      ws.onopen = () => {
        ws!.send(JSON.stringify(['REQ', subId, { kinds: [ROUTSTR_EVENT_KIND], limit: 50 }]));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const verified = verifyRoutstrAnnouncement(data[2]);
          if (data[0] === 'EVENT' && data[1] === subId && events.length < 50 && verified) {
            events.push(data[2]);
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            // End of stored events — close connection
            clearTimeout(timer);
            ws!.close();
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
function _parseNodeEvent(event: NodeAnnouncement): RoutstrNode {
  const tags = event.tags || [];
  const urls = tags.filter(t => t[0] === 'u').map(t => t[1]!);
  const mints = tags.filter(t => t[0] === 'mint').map(t => t[1]);
  const dTag = tags.find(t => t[0] === 'd')?.[1] || event.pubkey;
  const version = tags.find(t => t[0] === 'version')?.[1] || null;

  let name: unknown = dTag;
  let about: unknown = '';
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
    // Filter URLs at parse-time: Nostr events are untrusted, so a malicious
    // relay can advertise a "node" pointing at 127.0.0.1 / RFC1918 / link-local
    // IPs. isValidExternalUrl rejects those + requires https://. Onion URLs
    // are captured separately below for display only — never fetched here.
    urls: urls.filter(u => isValidExternalUrl(u)),
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

/** Keep the newest signed event per operator and addressable event identifier. */
function _deduplicateNodes(events: unknown[]) {
  const byId: Record<string, RoutstrNode> = Object.create(null);
  for (const event of events) {
    if (!verifyRoutstrAnnouncement(event as Parameters<typeof verifyRoutstrAnnouncement>[0])) continue;
    const node = _parseNodeEvent(event as NodeAnnouncement);
    node.id = `${(event as NodeAnnouncement).kind}:${(event as NodeAnnouncement).pubkey}:${node.id}`;
    if (!byId[node.id] || node.createdAt > byId[node.id]!.createdAt) {
      byId[node.id] = node;
    }
  }
  return Object.values(byId);
}

// ═══════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════

/** Check if a node is online and get its models */
async function _healthCheck(node: RoutstrNode) {
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
    const json = await res.json() as NodeCatalog;
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
export async function discoverNodes(forceRefresh?: boolean) {
  if (!forceRefresh && _cachedNodes && (Date.now() - _cacheTime < CACHE_TTL)) {
    return _cachedNodes;
  }

  // Reopening Browse while relay/health checks are running shares that work.
  if (_discoveryInFlight) return _discoveryInFlight;
  const discovery = _discoverNodes();
  _discoveryInFlight = discovery;
  try {
    const nodes = await discovery;
    // A cache clear may have started a newer search; do not replace its result.
    if (_discoveryInFlight === discovery) {
      _cachedNodes = nodes;
      _cacheTime = Date.now();
    }
    return nodes;
  } finally {
    if (_discoveryInFlight === discovery) _discoveryInFlight = null;
  }
}

async function _discoverNodes() {
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

  return nodes;
}

/** Get the currently selected node URL */
export function getSelectedNodeUrl() {
  return localStorage.getItem('labcharts-routstr-node') || null;
}

/** Set the selected node URL */
export function setSelectedNodeUrl(url: string) {
  // Routstr node URLs originate from untrusted Nostr Kind 38421 events
  // (or wallet-backup imports), so a malicious relay can advertise a node
  // pointing at internal services. Block private/loopback/link-local IP
  // literals; HTTPS required so DNS-rebound hosts fail at the TLS layer
  // before our Cashu token leaves the device.
  if (!isValidExternalUrl(url)) {
    if (typeof console !== 'undefined') console.warn('[Nostr] Refusing Routstr node URL — must be public https://', url);
    return;
  }
  url = canonicalRoutstrUrl(url);
  const legacyKey = getCachedKey('labcharts-routstr-key');
  if (getSelectedNodeUrl() && canonicalRoutstrUrl(getSelectedNodeUrl()) !== url && /^(sk-|cashu)/.test(legacyKey || '')) {
    throw new Error('Save the existing node session before switching nodes');
  }
  if (getSelectedNodeUrl() !== url) clearRoutstrModelCaches();
  localStorage.setItem('labcharts-routstr-node', url);
  touchRoutstrSessionClock();
  dispatchAISettingsLocalChangedRuntime();
}

/** Clear node cache (force re-discovery on next call) */
export function clearNodeCache() {
  _cachedNodes = null;
  _cacheTime = 0;
  _discoveryInFlight = null;
}
