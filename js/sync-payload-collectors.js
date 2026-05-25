// sync-payload-collectors.js - local settings/chat/display collection for sync payloads.

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

export function chatDeletedThreadsKey(profileId) {
  return `labcharts-${profileId}-chat-deleted-threads`;
}

const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function readChatDeletedThreads(profileId) {
  try {
    const raw = localStorage.getItem(chatDeletedThreadsKey(profileId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = Object.create(null);
    for (const [threadId, deletedAt] of Object.entries(parsed)) {
      if (typeof threadId !== 'string' || !threadId) continue;
      if (CHAT_DELETED_PROTO_KEYS.has(threadId)) continue;
      const ts = Number(deletedAt);
      if (Number.isFinite(ts) && ts > 0) out[threadId] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function parseCustomPersonalities(raw) {
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

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
  const deletedThreads = readChatDeletedThreads(profileId);
  const threadsRaw = await encryptedGetItem(threadsKey) || localStorage.getItem(threadsKey);
  if (!threadsRaw) {
    return Object.keys(deletedThreads).length > 0
      ? { threads: [], messages: {}, deletedThreads }
      : null;
  }
  try {
    const threads = JSON.parse(threadsRaw);
    if (!Array.isArray(threads)) {
      return Object.keys(deletedThreads).length > 0
        ? { threads: [], messages: {}, deletedThreads }
        : null;
    }
    if (threads.length === 0 && Object.keys(deletedThreads).length === 0) return null;
    const messages = {};
    for (const t of threads) {
      const msgKey = `labcharts-${profileId}-chat-t_${t.id}`;
      const msgRaw = await encryptedGetItem(msgKey) || localStorage.getItem(msgKey);
      if (!msgRaw) {
        if ((Number(t.messageCount) || 0) === 0) messages[t.id] = [];
        continue;
      }
      // Per-thread try/catch - a single corrupted thread payload must NOT
      // nuke the entire chat-data collection.
      try { messages[t.id] = JSON.parse(msgRaw); } catch (_) {}
    }
    const customRaw = localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`);
    const customPersonalities = parseCustomPersonalities(customRaw);
    const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`);
    return {
      threads,
      messages,
      deletedThreads: Object.keys(deletedThreads).length > 0 ? deletedThreads : undefined,
      customPersonalities,
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
