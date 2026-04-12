// wearables/providers/withings.js — Withings OAuth2 + weight/BP/pulse sync

import { state } from '../../state.js';
import { showNotification } from '../../utils.js';
import { saveImportedData } from '../../data.js';
import { encryptedSetItem, encryptedGetItem } from '../../crypto.js';
import { WearableProvider, ensureBiometricsStructure, BIOMETRIC_KEYS } from '../core.js';

const WITHINGS_ENDPOINTS = {
  AUTHORIZE: 'https://account.withings.com/oauth2_user/authorize2',
  TOKEN: 'https://wbsapi.withings.net/v2/oauth2',
  MEASURE: 'https://wbsapi.withings.net/measure',
};

// Withings meastype values
const MEAS_TYPE = {
  WEIGHT: 1,
  HEIGHT: 4,
  FAT_FREE_MASS: 5,
  FAT_RATIO: 6,
  FAT_MASS_WEIGHT: 8,
  DIASTOLIC_BP: 9,
  SYSTOLIC_BP: 10,
  HEART_PULSE: 11,
};

class WithingsProvider extends WearableProvider {
  constructor() {
    super('withings');
    this._config = null;
  }

  async init() {
    this._config = await this._loadConfig();
  }

  isConnected() {
    return !!(this._config?.accessToken);
  }

  getConfig() {
    return this._config;
  }

  // ── OAuth: authorize ──
  async authorize(config) {
    // config: { clientId, clientSecret, redirectUri? }
    const redirectUri = config.redirectUri || this._defaultRedirectUri();
    await this._saveConfig({ ...config, redirectUri });

    const st = this._generateStateToken();
    this._saveOAuthState(st);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      scope: 'user.metrics',
      redirect_uri: redirectUri,
      state: st,
    });

    const url = `${WITHINGS_ENDPOINTS.AUTHORIZE}?${params.toString()}`;
    window.location.href = url;
  }

  // ── OAuth: exchange code for token ──
  async exchangeCode(code, config) {
    const redirectUri = config?.redirectUri || this._defaultRedirectUri();
    const clientId = config?.clientId || this._config?.clientId;
    const clientSecret = config?.clientSecret || this._config?.clientSecret;

    const body = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const resp = await fetch(WITHINGS_ENDPOINTS.TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await resp.json();
    if (data.status !== 0) throw new Error(`Withings token exchange failed (${data.status})`);

    const expiresAt = Date.now() + ((data.body?.expires_in || 0) * 1000);
    this._config = {
      ...this._config,
      clientId,
      clientSecret,
      accessToken: data.body.access_token,
      refreshToken: data.body.refresh_token,
      tokenExpires: expiresAt,
      userId: data.body.userid,
      redirectUri,
    };
    await this._saveConfig(this._config);
  }

  // ── Token refresh ──
  async refreshToken() {
    const cfg = this._config;
    if (!cfg?.refreshToken) throw new Error('No refresh token available');

    const body = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
    });

    const resp = await fetch(WITHINGS_ENDPOINTS.TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await resp.json();
    if (data.status !== 0) throw new Error(`Withings token refresh failed (${data.status})`);

    const expiresAt = Date.now() + ((data.body?.expires_in || 0) * 1000);
    this._config = {
      ...cfg,
      accessToken: data.body.access_token,
      refreshToken: data.body.refresh_token,
      tokenExpires: expiresAt,
    };
    await this._saveConfig(this._config);
    return this._config.accessToken;
  }

  // ── Get valid (possibly refreshed) access token ──
  async getValidToken() {
    const cfg = this._config;
    if (!cfg?.accessToken) throw new Error('Withings is not connected');

    const needsRefresh = !cfg.tokenExpires || (Date.now() + 5 * 60 * 1000) >= cfg.tokenExpires;
    if (needsRefresh && cfg.refreshToken) {
      return this.refreshToken();
    }
    return cfg.accessToken;
  }

  // ── Fetch measurements ──
  async sync() {
    ensureBiometricsStructure();
    const bio = state.importedData.biometrics;
    const token = await this.getValidToken();

    // Determine start date from last sync or 1 year ago
    const lastSync = this.getLastSync();
    let startDate = null;
    if (lastSync) {
      startDate = Math.floor(new Date(lastSync).getTime() / 1000);
    } else {
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      startDate = Math.floor(yearAgo.getTime() / 1000);
    }

    // Fetch weight, BP, and pulse measurements
    const params = new URLSearchParams({
      action: 'getmeas',
      meastype: [MEAS_TYPE.WEIGHT, MEAS_TYPE.SYSTOLIC_BP, MEAS_TYPE.DIASTOLIC_BP, MEAS_TYPE.HEART_PULSE].join(','),
      lastupdate: String(startDate),
    });

    const resp = await fetch(`${WITHINGS_ENDPOINTS.MEASURE}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.status !== 0) throw new Error(`Withings fetch failed (${data.status})`);

    const groups = data.body?.measuregrps || [];

    // Group measurements by date, then process
    const weightsByDate = new Map();  // date → { ts, kg }
    const bpByDate = new Map();       // date → { ts, sys, dia }
    const pulseByDate = new Map();    // date → { ts, bpm }

    for (const grp of groups) {
      if (!Array.isArray(grp?.measures) || typeof grp?.date !== 'number') continue;
      const date = new Date(grp.date * 1000).toISOString().slice(0, 10);
      const ts = grp.date;

      for (const meas of grp.measures) {
        const value = meas.value * Math.pow(10, meas.unit);
        if (!Number.isFinite(value)) continue;

        switch (meas.type) {
          case MEAS_TYPE.WEIGHT: {
            const prev = weightsByDate.get(date);
            if (!prev || ts >= prev.ts) weightsByDate.set(date, { ts, kg: value });
            break;
          }
          case MEAS_TYPE.SYSTOLIC_BP: {
            const prev = bpByDate.get(date);
            const entry = prev || { ts, sys: value, dia: 0 };
            entry.sys = value;
            if (ts >= entry.ts) entry.ts = ts;
            bpByDate.set(date, entry);
            break;
          }
          case MEAS_TYPE.DIASTOLIC_BP: {
            const prev = bpByDate.get(date);
            const entry = prev || { ts, dia: value, sys: 0 };
            entry.dia = value;
            if (ts >= entry.ts) entry.ts = ts;
            bpByDate.set(date, entry);
            break;
          }
          case MEAS_TYPE.HEART_PULSE: {
            const prev = pulseByDate.get(date);
            if (!prev || ts >= prev.ts) pulseByDate.set(date, { ts, bpm: Math.round(value) });
            break;
          }
        }
      }
    }

    // Upsert into biometrics
    let count = 0;

    // Weight
    for (const [date, { kg }] of weightsByDate.entries()) {
      const idx = bio.weight.findIndex(e => e.date === date && e.source === 'withings');
      const record = { date, value: +kg.toFixed(3), unit: 'kg', source: 'withings' };
      if (idx >= 0) bio.weight[idx] = record;
      else bio.weight.push(record);
      count++;
    }

    // Blood Pressure (only if both sys and dia exist)
    for (const [date, { sys, dia }] of bpByDate.entries()) {
      if (sys > 0 && dia > 0) {
        const idx = bio.bp.findIndex(e => e.date === date && e.source === 'withings');
        const record = { date, sys: Math.round(sys), dia: Math.round(dia), source: 'withings' };
        if (idx >= 0) bio.bp[idx] = record;
        else bio.bp.push(record);
        count++;
      }
    }

    // Pulse
    for (const [date, { bpm }] of pulseByDate.entries()) {
      const idx = bio.pulse.findIndex(e => e.date === date && e.source === 'withings');
      const record = { date, value: bpm, source: 'withings' };
      if (idx >= 0) bio.pulse[idx] = record;
      else bio.pulse.push(record);
      count++;
    }

    // Sort all arrays
    for (const key of ['weight', 'bp', 'pulse']) {
      if (Array.isArray(bio[key])) bio[key].sort((a, b) => a.date.localeCompare(b.date));
    }

    this._setLastSync(new Date().toISOString());
    if (window.recordChange) window.recordChange('biometrics');
    await saveImportedData();

    return { success: true, count };
  }

  // ── Disconnect ──
  async disconnect() {
    // Remove Withings-sourced data from biometrics
    const bio = state.importedData?.biometrics;
    if (bio) {
      for (const key of ['weight', 'bp', 'pulse']) {
        if (Array.isArray(bio[key])) {
          bio[key] = bio[key].filter(e => e.source !== 'withings');
        }
      }
      if (window.recordChange) window.recordChange('biometrics');
      await saveImportedData();
    }
    this._config = null;
    await this._clearConfig();
    window.buildSidebar?.();
  }
}

const withings = new WithingsProvider();
export default withings;

Object.assign(window, {
  authorizeWithings: (cfg) => withings.authorize(cfg),
  syncWithings: () => withings.sync(),
  disconnectWithings: () => withings.disconnect(),
  getWithingsConfig: () => withings.getConfig(),
  isWithingsConnected: () => withings.isConnected(),
  getWithingsLastSync: () => withings.getLastSync(),
});