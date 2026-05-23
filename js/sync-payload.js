// sync-payload.js - outbound/inbound wire payload helpers for Evolu sync

import { getProfiles } from './profile.js';
import { encryptedGetItem } from './crypto.js';

// AI settings keys to sync (global, not per-profile)
export const AI_SETTINGS_KEYS = [
  'labcharts-ai-provider',
  'labcharts-openrouter-key',    // OpenRouter key (encrypted)
  'labcharts-venice-key',        // Venice key (encrypted)
  'labcharts-routstr-key',       // Routstr key (encrypted)
  'labcharts-ppq-key',           // PPQ key (encrypted)
  'labcharts-ppq-credit-id',     // PPQ credit ID (for balance/topup)
  'labcharts-custom-key',        // Custom API key (encrypted)
  'labcharts-custom-url',        // Custom API base URL
  'labcharts-custom-model',      // Custom API selected model
  'labcharts-custom-models',     // Custom API model list cache
  'labcharts-ollama',            // Local AI server config (encrypted)
  'labcharts-openrouter-model',
  'labcharts-venice-model',
  'labcharts-routstr-model',
  'labcharts-ppq-model',
  'labcharts-venice-e2ee',
  'labcharts-ollama-model',
  'labcharts-ollama-pii-url',
  'labcharts-ollama-pii-model',
  'labcharts-cashu-wallet-mnemonic',  // Wallet seed (encrypted)
  'labcharts-cashu-wallet-mint',       // Wallet mint URL
  'labcharts-routstr-node',           // Selected Routstr node
  'labcharts-lens-config',            // Custom Knowledge Source config (name, url, enabled, topK)
  'labcharts-lens-key',               // Custom Knowledge Source API key (encrypted)
];

export const DISPLAY_PREF_SUFFIXES = ['units', 'rangeMode', 'suppOverlay', 'noteOverlay', 'phaseOverlay'];

export async function collectAISettings() {
  const settings = {};
  for (const key of AI_SETTINGS_KEYS) {
    const val = await encryptedGetItem(key);
    if (val) settings[key] = val;
  }
  return settings;
}

// Per-profile chat keys to sync
export async function collectChatData(profileId) {
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  const threadsRaw = await encryptedGetItem(threadsKey) || localStorage.getItem(threadsKey);
  if (!threadsRaw) return null;
  try {
    const threads = JSON.parse(threadsRaw);
    if (!Array.isArray(threads) || threads.length === 0) return null;
    const messages = {};
    for (const t of threads) {
      const msgKey = `labcharts-${profileId}-chat-t_${t.id}`;
      const msgRaw = await encryptedGetItem(msgKey) || localStorage.getItem(msgKey);
      if (!msgRaw) continue;
      // Per-thread try/catch — a single corrupted thread payload must NOT
      // nuke the entire chat-data collection.
      try { messages[t.id] = JSON.parse(msgRaw); } catch (_) {}
    }
    const customRaw = localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`);
    const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`);
    return {
      threads,
      messages,
      customPersonalities: customRaw ? JSON.parse(customRaw) : undefined,
      activePersonality: personality || undefined,
    };
  } catch { return null; }
}

export function collectDisplayPrefs(profileId) {
  const prefs = {};
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    const val = localStorage.getItem(`labcharts-${profileId}-${suffix}`);
    if (val != null) prefs[suffix] = val;
  }
  return Object.keys(prefs).length > 0 ? prefs : undefined;
}

// Phase 2 cutover flag — when set, buildSyncPayload omits importedData
// from the blob entirely. Per-row CRDT deltas carry every field instead.
function _cutoverFlagKey(profileId) {
  return `labcharts-${profileId}-sync-cutover-v2`;
}

export function isPhase2CutoverEnabled(profileId) {
  if (!profileId) return false;
  try { return localStorage.getItem(_cutoverFlagKey(profileId)) === '1'; } catch { return false; }
}

export function enablePhase2CutoverFlag(profileId) {
  if (!profileId) return false;
  try { localStorage.setItem(_cutoverFlagKey(profileId), '1'); return true; } catch { return false; }
}

export function disablePhase2CutoverFlag(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_cutoverFlagKey(profileId)); return true; } catch { return false; }
}

export async function buildSyncPayload(profileId, importedData) {
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  const aiSettings = await collectAISettings();
  const chatData = await collectChatData(profileId);
  const displayPrefs = collectDisplayPrefs(profileId);
  // Strip wearable OAuth credentials before sync. Per-row LWW would let a stale
  // device resurrect a disconnected vendor or overwrite a freshly-rotated
  // refresh token. Wearable summary (the L2 dashboard data) still syncs; the
  // tokens stay local. Users connect each wearable per-device.
  const safeImported = stripGeneticsSnpsFromBlob(stripWearableCredentials(importedData));
  // Phase 2: when cutover is enabled (readiness-gated), drop importedData
  // from the blob. Per-row deltas carry every field.
  const cutover = isPhase2CutoverEnabled(profileId);
  const inner = JSON.stringify({
    _v: cutover ? 4 : 3,
    importedData: cutover ? undefined : safeImported,
    profile: profile || null,
    aiSettings: Object.keys(aiSettings).length > 0 ? aiSettings : undefined,
    chatData: chatData || undefined,
    displayPrefs: displayPrefs || undefined,
  });
  // Gzip + base64 envelope. v3 plain-JSON pushes were averaging ~500 KB,
  // hitting the relay's 50 MB per-owner cap in ~95 pushes. Gzip drops typical
  // payloads ~70%, base64 reinflates ~33%, net ~3x more pushes per quota.
  if (typeof CompressionStream !== 'undefined' && inner.length > 1024) {
    try {
      const gz = await _gzipString(inner);
      return `GZ|v1|${_bytesToBase64(gz)}`;
    } catch {
      // Fall through to plain JSON. Never block a push on compression.
    }
  }
  return inner;
}

export async function _gzipString(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// v1.7.12 audit fix: decompression-bomb defence for per-row payloads.
export const _PER_ROW_DECOMPRESSED_CAP_BYTES = 1024 * 1024;

export async function _gunzipToStringCapped(bytes, maxBytes = _PER_ROW_DECOMPRESSED_CAP_BYTES) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(`per-row payload exceeds ${maxBytes} bytes after gunzip — refusing to trust (decompression-bomb defence)`);
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

if (typeof window !== 'undefined') {
  window._syncTestHooks = Object.assign(window._syncTestHooks || {}, {
    gunzipCapped: _gunzipToStringCapped,
    perRowCapBytes: _PER_ROW_DECOMPRESSED_CAP_BYTES,
  });
}

export function _bytesToBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function _base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function stripWearableCredentials(importedData) {
  if (!importedData?.wearableConnections) return importedData;
  const { wearableConnections, ...rest } = importedData;
  return rest;
}

// Strip `genetics.snps` from the legacy blob payload so the only carrier
// for SNP membership is the per-key `genetics.snps` delta map path.
export function stripGeneticsSnpsFromBlob(importedData) {
  if (!importedData?.genetics || typeof importedData.genetics !== 'object') return importedData;
  const { snps, ...geneticsMetadata } = importedData.genetics;
  return { ...importedData, genetics: geneticsMetadata };
}

// 5 MB cap. Normal payloads are well under 1 MB, so this is already generous.
export const MAX_SYNC_PAYLOAD_BYTES = 5_000_000;

export async function parseSyncPayload(dataJson) {
  if (typeof dataJson !== 'string' || dataJson.length > MAX_SYNC_PAYLOAD_BYTES) {
    throw new Error('Invalid sync payload: bad type or too large');
  }
  let inner = dataJson;
  if (dataJson.startsWith('GZ|v1|')) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Invalid sync payload: gzip envelope but no DecompressionStream');
    }
    const b64 = dataJson.slice(6);
    const bytes = _base64ToBytes(b64);
    inner = await _gunzipToStringCapped(bytes, MAX_SYNC_PAYLOAD_BYTES);
  }
  const parsed = JSON.parse(inner);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid sync payload');
  }
  // Defence-in-depth: strip wearableConnections from any incoming blob,
  // regardless of producer version.
  function safe(imp) {
    if (!imp || typeof imp !== 'object') return imp;
    if ('wearableConnections' in imp) {
      const { wearableConnections: _drop, ...rest } = imp;
      return rest;
    }
    return imp;
  }
  if (parsed._v === 4) {
    return { importedData: null, profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
  }
  if (parsed._v === 3) {
    return { importedData: safe(parsed.importedData), profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
  }
  if (parsed._v === 2) {
    return { importedData: safe(parsed.importedData), profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: null, displayPrefs: null };
  }
  if (parsed.entries || parsed.notes || parsed.supplements) {
    return { importedData: safe(parsed), profile: null, aiSettings: null, chatData: null, displayPrefs: null };
  }
  throw new Error('Invalid sync payload: unknown shape');
}
