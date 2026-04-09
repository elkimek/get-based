// withings-weight.js — Withings OAuth + weight-only import into biometrics

import { state } from './state.js';
import { showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { encryptedSetItem, encryptedGetItem } from './crypto.js';

const WITHINGS_ENDPOINTS = {
  AUTHORIZE: 'https://account.withings.com/oauth2_user/authorize2',
  TOKEN: 'https://wbsapi.withings.net/v2/oauth2',
  MEASURE_GETMEAS: 'https://wbsapi.withings.net/measure'
};

const STORAGE_KEY = (profileId) => `withings_${profileId}`;
const LAST_SYNC_KEY = (profileId) => `withings_last_sync_${profileId}`;
const OAUTH_STATE_KEY = 'withings_oauth_state';

let _withingsConfig = null;

function profileId() {
  return state.currentProfile || 'default';
}

async function loadWithingsConfig() {
  try {
    const raw = await encryptedGetItem(STORAGE_KEY(profileId()));
    _withingsConfig = raw ? JSON.parse(raw) : null;
  } catch {
    _withingsConfig = null;
  }
  return _withingsConfig;
}

export async function initWithings() {
  await loadWithingsConfig();
}

export function getWithingsConfig() {
  return _withingsConfig;
}

export async function saveWithingsConfig(cfg) {
  _withingsConfig = cfg;
  await encryptedSetItem(STORAGE_KEY(profileId()), JSON.stringify(cfg));
}

export async function clearWithingsConfig() {
  _withingsConfig = null;
  await encryptedSetItem(STORAGE_KEY(profileId()), '');
  localStorage.removeItem(STORAGE_KEY(profileId()));
  localStorage.removeItem(LAST_SYNC_KEY(profileId()));
}

export function getWithingsLastSync() {
  return localStorage.getItem(LAST_SYNC_KEY(profileId())) || null;
}

function setWithingsLastSync(tsIso) {
  localStorage.setItem(LAST_SYNC_KEY(profileId()), tsIso);
}

function randomStateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function getWithingsAuthUrl(config) {
  const st = randomStateToken();
  sessionStorage.setItem(OAUTH_STATE_KEY, st);
  const redirectUri = config.redirectUri || `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: 'user.metrics',
    redirect_uri: redirectUri,
    state: st,
  });
  return `${WITHINGS_ENDPOINTS.AUTHORIZE}?${params.toString()}`;
}

async function exchangeCodeForToken(code, config) {
  const redirectUri = config.redirectUri || `${window.location.origin}${window.location.pathname}`;
  const body = new URLSearchParams({
    action: 'requesttoken',
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri
  });

  const resp = await fetch(WITHINGS_ENDPOINTS.TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await resp.json();
  if (data.status !== 0) throw new Error(`Withings token exchange failed (${data.status})`);

  const expiresAt = Date.now() + ((data.body?.expires_in || 0) * 1000);
  await saveWithingsConfig({
    ...config,
    accessToken: data.body.access_token,
    refreshToken: data.body.refresh_token,
    tokenExpires: expiresAt,
    userId: data.body.userid
  });
}

async function refreshToken(config) {
  const body = new URLSearchParams({
    action: 'requesttoken',
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken
  });

  const resp = await fetch(WITHINGS_ENDPOINTS.TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await resp.json();
  if (data.status !== 0) throw new Error(`Withings token refresh failed (${data.status})`);

  const expiresAt = Date.now() + ((data.body?.expires_in || 0) * 1000);
  const updated = {
    ...config,
    accessToken: data.body.access_token,
    refreshToken: data.body.refresh_token,
    tokenExpires: expiresAt,
  };
  await saveWithingsConfig(updated);
  return updated.accessToken;
}

async function getValidAccessToken() {
  const cfg = getWithingsConfig();
  if (!cfg?.accessToken) throw new Error('Withings is not connected');

  const needsRefresh = !cfg.tokenExpires || (Date.now() + 5 * 60 * 1000) >= cfg.tokenExpires;
  if (needsRefresh && cfg.refreshToken) return refreshToken(cfg);
  return cfg.accessToken;
}

export async function maybeHandleWithingsOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const stateParam = params.get('state');
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const cfg = getWithingsConfig();

  if (!code || !expectedState || stateParam !== expectedState || !cfg?.clientId || !cfg?.clientSecret) return false;

  try {
    await exchangeCodeForToken(code, cfg);
    showNotification('Withings connected', 'success');
  } catch (e) {
    showNotification(`Withings authorization failed: ${e.message}`, 'error');
  } finally {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    const clean = new URL(window.location.href);
    clean.searchParams.delete('code');
    clean.searchParams.delete('state');
    window.history.replaceState({}, '', clean.toString());
  }

  return true;
}

function withingsToWeightKg(meas) {
  if (meas?.type !== 1) return null; // weight
  if (typeof meas.value !== 'number' || typeof meas.unit !== 'number') return null;
  const v = meas.value * Math.pow(10, meas.unit);
  return Number.isFinite(v) ? v : null;
}

export async function syncWithingsWeight() {
  const token = await getValidAccessToken();
  const params = new URLSearchParams({ action: 'getmeas', meastype: '1' });

  const lastSync = getWithingsLastSync();
  if (lastSync) {
    const ts = Math.floor(new Date(lastSync).getTime() / 1000);
    if (Number.isFinite(ts) && ts > 0) params.set('lastupdate', String(ts));
  }

  const resp = await fetch(`${WITHINGS_ENDPOINTS.MEASURE_GETMEAS}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await resp.json();
  if (data.status !== 0) throw new Error(`Withings fetch failed (${data.status})`);

  const groups = data.body?.measuregrps || [];
  if (!state.importedData) state.importedData = { entries: [] };
  if (!state.importedData.biometrics) state.importedData.biometrics = { weight: [], bp: [], pulse: [] };
  if (!Array.isArray(state.importedData.biometrics.weight)) state.importedData.biometrics.weight = [];

  // Map each day to latest measurement in that day (no cross-day copying)
  const latestByDate = new Map();
  for (const grp of groups) {
    if (!Array.isArray(grp?.measures) || typeof grp?.date !== 'number') continue;
    const date = new Date(grp.date * 1000).toISOString().slice(0, 10);
    for (const meas of grp.measures) {
      const kg = withingsToWeightKg(meas);
      if (kg == null) continue;
      const prev = latestByDate.get(date);
      if (!prev || grp.date >= prev.ts) latestByDate.set(date, { ts: grp.date, kg });
    }
  }

  let addedOrUpdated = 0;
  const arr = state.importedData.biometrics.weight;
  for (const [date, { kg }] of latestByDate.entries()) {
    const existingIdx = arr.findIndex(e => e.date === date && e.source === 'withings');
    const record = { date, value: +kg.toFixed(3), unit: 'kg', source: 'withings' };
    if (existingIdx >= 0) arr[existingIdx] = record;
    else arr.push(record);
    addedOrUpdated += 1;
  }

  arr.sort((a, b) => a.date.localeCompare(b.date));
  setWithingsLastSync(new Date().toISOString());
  await saveImportedData();

  return { success: true, count: addedOrUpdated };
}

export async function removeWithingsWeightData() {
  if (!state.importedData?.biometrics?.weight) {
    await clearWithingsConfig();
    return { removed: 0 };
  }
  const before = state.importedData.biometrics.weight.length;
  state.importedData.biometrics.weight = state.importedData.biometrics.weight.filter(e => e.source !== 'withings');
  const removed = before - state.importedData.biometrics.weight.length;
  await clearWithingsConfig();
  await saveImportedData();
  return { removed };
}
