// wearables/core.js — Base class, provider registry, sync orchestrator, auth helpers

import { state } from '../state.js';
import { showNotification } from '../utils.js';
import { saveImportedData } from '../data.js';
import { encryptedSetItem, encryptedGetItem } from '../crypto.js';

// ═══════════════════════════════════════════════
// PROVIDER REGISTRY
// ═══════════════════════════════════════════════
const _providers = new Map();

export function registerProvider(provider) {
  if (!(provider instanceof WearableProvider)) {
    throw new Error('Provider must extend WearableProvider');
  }
  _providers.set(provider.name, provider);
}

export function getProvider(name) {
  return _providers.get(name) || null;
}

export function getAllProviders() {
  return Array.from(_providers.values());
}

export function getConnectedProviders() {
  return getAllProviders().filter(p => p.isConnected());
}

// ═══════════════════════════════════════════════
// WEARABLE PROVIDER BASE CLASS
// ═══════════════════════════════════════════════
export class WearableProvider {
  constructor(name, opts = {}) {
    this.name = name;
    this.storagePrefix = opts.storagePrefix || `wearable_${name}`;
    this.lastSyncKey = `wearable_${name}_last_sync_{profile}`;
    this.oauthStateKey = `wearable_${name}_oauth_state`;
  }

  // Profile-aware storage keys
  _profileId() {
    return state.currentProfile || 'default';
  }

  _storageKey() {
    return `${this.storagePrefix}_${this._profileId()}`;
  }

  _lastSyncKey() {
    return `wearable_${this.name}_last_sync_${this._profileId()}`;
  }

  // ── Token storage (encrypted) ──
  async _loadConfig() {
    try {
      const raw = await encryptedGetItem(this._storageKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async _saveConfig(cfg) {
    await encryptedSetItem(this._storageKey(), JSON.stringify(cfg));
  }

  async _clearConfig() {
    await encryptedSetItem(this._storageKey(), '');
    localStorage.removeItem(this._storageKey());
    localStorage.removeItem(this._lastSyncKey());
  }

  // ── Last sync tracking ──
  getLastSync() {
    return localStorage.getItem(this._lastSyncKey()) || null;
  }

  _setLastSync(tsIso) {
    localStorage.setItem(this._lastSyncKey(), tsIso);
  }

  // ── OAuth state token ──
  _generateStateToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  _saveOAuthState(st) {
    sessionStorage.setItem(this.oauthStateKey, JSON.stringify({ state: st, provider: this.name }));
  }

  _getOAuthState() {
    try {
      return JSON.parse(sessionStorage.getItem(this.oauthStateKey));
    } catch {
      return null;
    }
  }

  _clearOAuthState() {
    sessionStorage.removeItem(this.oauthStateKey);
  }

  // ── Redirect URI ──
  _defaultRedirectUri() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  // ── Methods to be overridden by providers ──
  async authorize(config) { throw new Error('authorize() not implemented'); }
  async exchangeCode(code, config) { throw new Error('exchangeCode() not implemented'); }
  async refreshToken() { throw new Error('refreshToken() not implemented'); }
  async getValidToken() { throw new Error('getValidToken() not implemented'); }
  async sync() { throw new Error('sync() not implemented'); }
  async disconnect() { throw new Error('disconnect() not implemented'); }
  isConnected() { return false; }
}

// ═══════════════════════════════════════════════
// OAUTH CALLBACK HANDLER
// ═══════════════════════════════════════════════
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const stateParam = params.get('state');
  const error = params.get('error');

  if (error) {
    // OAuth error from provider
    const errorDesc = params.get('error_description') || error;
    showNotification(`Authorization failed: ${errorDesc}`, 'error');
    cleanOAuthParams();
    return false;
  }

  if (!code || !stateParam) return false;

  // Try to find matching provider from state (state format: "{provider}:{random}" or just check session)
  // Check all providers' saved OAuth states
  let matchedProvider = null;
  let matchedState = null;

  for (const provider of getAllProviders()) {
    const savedState = provider._getOAuthState();
    if (savedState && savedState.state === stateParam) {
      matchedProvider = provider;
      matchedState = savedState;
      break;
    }
  }

  if (!matchedProvider) {
    // Fallback: try each provider that has any saved state
    for (const provider of getAllProviders()) {
      const savedState = provider._getOAuthState();
      if (savedState) {
        matchedProvider = provider;
        matchedState = savedState;
        break;
      }
    }
  }

  if (!matchedProvider) return false;

  try {
    const cfg = await matchedProvider._loadConfig();
    if (!cfg?.clientId) throw new Error('No provider config found');
    await matchedProvider.exchangeCode(code, cfg);
    showNotification(`${matchedProvider.name.charAt(0).toUpperCase() + matchedProvider.name.slice(1)} connected`, 'success');
    return true;
  } catch (e) {
    showNotification(`${matchedProvider.name} authorization failed: ${e.message}`, 'error');
    return false;
  } finally {
    matchedProvider._clearOAuthState();
    cleanOAuthParams();
  }
}

function cleanOAuthParams() {
  const clean = new URL(window.location.href);
  let changed = false;
  for (const key of ['code', 'state', 'error', 'error_description']) {
    if (clean.searchParams.has(key)) {
      clean.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) window.history.replaceState({}, '', clean.toString());
}

// ═══════════════════════════════════════════════
// SYNC ORCHESTRATOR
// ═══════════════════════════════════════════════
export async function syncAllWearables() {
  const providers = getConnectedProviders();
  if (providers.length === 0) {
    showNotification('No wearables connected', 'info');
    return { results: [] };
  }

  const results = [];
  let totalUpserted = 0;
  let hadError = false;

  for (const provider of providers) {
    try {
      const result = await provider.sync();
      results.push({ provider: provider.name, ...result });
      if (result.count) totalUpserted += result.count;
    } catch (e) {
      results.push({ provider: provider.name, success: false, error: e.message });
      hadError = true;
    }
  }

  // Ensure biometrics structure and sort all arrays
  if (totalUpserted > 0) {
    _ensureBiometricsStructure();
    _sortAllBiometrics();
    if (window.recordChange) window.recordChange('biometrics');
    await saveImportedData();
    window.buildSidebar?.();
  }

  if (hadError) {
    showNotification(`Sync completed with errors (${totalUpserted} records updated)`, 'error');
  } else {
    showNotification(`Sync complete — ${totalUpserted} records updated`, 'success');
  }

  return { results, totalUpserted };
}

// ═══════════════════════════════════════════════
// BIOMETRICS STRUCTURE HELPERS
// ═══════════════════════════════════════════════
export const BIOMETRIC_KEYS = ['weight', 'bp', 'pulse', 'hrv', 'sleep', 'readiness', 'steps', 'activeCalories', 'distance', 'activeMinutes', 'spo2'];

export const NEW_BIOMETRIC_KEYS = ['hrv', 'sleep', 'readiness', 'steps', 'activeCalories', 'distance', 'activeMinutes', 'spo2'];

export function ensureBiometricsStructure(bio) {
  if (!bio) bio = state.importedData?.biometrics;
  if (!bio) return getDefaultBiometrics();
  for (const key of BIOMETRIC_KEYS) {
    if (!Array.isArray(bio[key])) bio[key] = [];
  }
  return bio;
}

export function getDefaultBiometrics() {
  const obj = {};
  for (const key of BIOMETRIC_KEYS) obj[key] = [];
  return obj;
}

function _ensureBiometricsStructure() {
  if (!state.importedData) state.importedData = { entries: [] };
  ensureBiometricsStructure(state.importedData.biometrics);
}

function _sortAllBiometrics() {
  const bio = state.importedData?.biometrics;
  if (!bio) return;
  for (const key of BIOMETRIC_KEYS) {
    if (Array.isArray(bio[key]) && bio[key].length > 0) {
      bio[key].sort((a, b) => a.date.localeCompare(b.date));
    }
  }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
let _initialized = false;

export async function initWearables() {
  if (_initialized) return;
  _initialized = true;
  _ensureBiometricsStructure();

  // Initialize all registered providers
  for (const provider of getAllProviders()) {
    try {
      await provider.init?.();
    } catch (e) {
      console.warn(`[wearables] Failed to init ${provider.name}:`, e);
    }
  }
}

// Export for window binding
Object.assign(window, {
  syncAllWearables,
  handleOAuthCallback,
});