// wearables/providers/oura.js — Oura OAuth2/PAT + sleep/readiness/activity/spo2/HR sync

import { state } from '../../state.js';
import { showNotification } from '../../utils.js';
import { saveImportedData } from '../../data.js';
import { encryptedSetItem, encryptedGetItem } from '../../crypto.js';
import { WearableProvider, ensureBiometricsStructure } from '../core.js';

const OURA_ENDPOINTS = {
  AUTHORIZE: 'https://cloud.ouraring.com/oauth/authorize',
  TOKEN: 'https://api.ouraring.com/oauth/token',
  API_BASE: 'https://api.ouraring.com/v2/usercollection',
};

class OuraProvider extends WearableProvider {
  constructor() {
    super('oura');
    this._config = null;
  }

  async init() {
    this._config = await this._loadConfig();
  }

  isConnected() {
    return !!(this._config?.accessToken || this._config?.pat);
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
      redirect_uri: redirectUri,
      scope: 'daily heartrate personal spo2Daily',
      state: st,
    });

    const url = `${OURA_ENDPOINTS.AUTHORIZE}?${params.toString()}`;
    window.location.href = url;
  }

  // ── PAT mode: set personal access token directly ──
  async setPAT(pat) {
    this._config = { ...(this._config || {}), pat, accessToken: pat, patMode: true };
    await this._saveConfig(this._config);
  }

  // ── OAuth: exchange code for token ──
  async exchangeCode(code, config) {
    const redirectUri = config?.redirectUri || this._defaultRedirectUri();
    const clientId = config?.clientId || this._config?.clientId;
    const clientSecret = config?.clientSecret || this._config?.clientSecret;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: OURA_ENDPOINTS.TOKEN,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(`Oura token exchange failed: ${data.error_description || data.error}`);

    const expiresAt = Date.now() + ((data.expires_in || 0) * 1000);
    this._config = {
      ...this._config,
      clientId,
      clientSecret,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpires: expiresAt,
      redirectUri,
      patMode: false,
    };
    await this._saveConfig(this._config);
  }

  // ── Token refresh ──
  async refreshToken() {
    const cfg = this._config;
    if (!cfg?.refreshToken) throw new Error('No refresh token available');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
    });

    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: OURA_ENDPOINTS.TOKEN,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(`Oura token refresh failed: ${data.error_description || data.error}`);

    const expiresAt = Date.now() + ((data.expires_in || 0) * 1000);
    this._config = {
      ...cfg,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpires: expiresAt,
    };
    await this._saveConfig(this._config);
    return this._config.accessToken;
  }

  // ── Get valid (possibly refreshed) access token ──
  async getValidToken() {
    const cfg = this._config;
    if (!cfg?.accessToken) throw new Error('Oura is not connected');

    // PAT mode: token doesn't expire
    if (cfg.patMode) return cfg.pat || cfg.accessToken;

    const needsRefresh = !cfg.tokenExpires || (Date.now() + 5 * 60 * 1000) >= cfg.tokenExpires;
    if (needsRefresh && cfg.refreshToken) {
      return this.refreshToken();
    }
    return cfg.accessToken;
  }

  // ── API fetch helper (routes through /api/proxy to avoid CORS) ──
  async _apiGet(path, params = {}) {
    const token = await this.getValidToken();
    const url = new URL(`${OURA_ENDPOINTS.API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, v);
    }
    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url.toString(),
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Oura API error ${resp.status}: ${errText}`);
    }
    return resp.json();
  }

  // ── Main sync ──
  async sync() {
    ensureBiometricsStructure();
    const bio = state.importedData.biometrics;

    // Determine date range (last sync or 7 days ago minimum, up to 1 year)
    const lastSync = this.getLastSync();
    let startDate;
    if (lastSync) {
      // Go back 2 days from last sync to catch late-arriving data (sleep sessions, etc.)
      const d = new Date(lastSync);
      d.setDate(d.getDate() - 2);
      startDate = d.toISOString().slice(0, 10);
    } else {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().slice(0, 10);
    }
    const endDate = new Date().toISOString().slice(0, 10);

    let totalCount = 0;

    // Fetch all endpoints in parallel
    // Note: /daily_sleep has only score+contributors (not durations)
    //       /sleep has actual session data with durations + average_hrv
    const [dailySleepData, sleepSessionData, readinessData, activityData, spo2Data, hrData] = await Promise.allSettled([
      this._apiGet('/daily_sleep', { start_date: startDate, end_date: endDate }),
      this._apiGet('/sleep', { start_date: startDate, end_date: endDate }),
      this._apiGet('/daily_readiness', { start_date: startDate, end_date: endDate }),
      this._apiGet('/daily_activity', { start_date: startDate, end_date: endDate }),
      this._apiGet('/daily_spo2', { start_date: startDate, end_date: endDate }),
      this._fetchHeartRate(startDate, endDate),
    ]);

    // ── Sleep scores from daily_sleep ──
    const sleepScoreByDay = new Map();
    if (dailySleepData.status === 'fulfilled' && dailySleepData.value?.data) {
      for (const day of dailySleepData.value.data) {
        const dayDate = day.day;
        if (dayDate && day.score != null) sleepScoreByDay.set(dayDate, day.score);
      }
    }

    // ── Sleep sessions from /sleep — aggregate per day ──
    // Pick the longest "sleep" type session per day for duration/HRV data
    const sleepByDay = new Map(); // date → { total_s, deep_s, rem_s, light_s, awake_s, hrv }
    if (sleepSessionData.status === 'fulfilled' && sleepSessionData.value?.data) {
      for (const session of sleepSessionData.value.data) {
        const dayDate = session.day;
        if (!dayDate) continue;
        // Skip deleted or very short sessions
        if (session.type === 'deleted') continue;
        const totalS = session.total_sleep_duration ?? 0;
        const existing = sleepByDay.get(dayDate);
        // Keep the session with the longest total sleep (main sleep)
        if (!existing || totalS > (existing.total_s || 0)) {
          sleepByDay.set(dayDate, {
            total_s: session.total_sleep_duration ?? null,
            deep_s: session.deep_sleep_duration ?? null,
            rem_s: session.rem_sleep_duration ?? null,
            light_s: session.light_sleep_duration ?? null,
            awake_s: session.awake_time ?? null,
            hrv: session.average_hrv ?? null,
            hr_lowest: session.lowest_heart_rate ?? null,
            average_hr: session.average_heart_rate ?? null,
          });
        }
      }
    }

    // ── Merge sleep data: sessions + daily scores ──
    const allSleepDays = new Set([...sleepByDay.keys(), ...sleepScoreByDay.keys()]);
    for (const dayDate of allSleepDays) {
      const session = sleepByDay.get(dayDate) || {};
      const score = sleepScoreByDay.get(dayDate) ?? null;
      const record = {
        date: dayDate,
        total_s: session.total_s ?? null,
        deep_s: session.deep_s ?? null,
        rem_s: session.rem_s ?? null,
        light_s: session.light_s ?? null,
        awake_s: session.awake_s ?? null,
        score,
        source: 'oura',
      };
      if (record.total_s != null || record.score != null) {
        const idx = bio.sleep.findIndex(e => e.date === record.date && e.source === 'oura');
        if (idx >= 0) bio.sleep[idx] = record;
        else bio.sleep.push(record);
        totalCount++;
      }
      // HRV from sleep session (actual ms, not a score)
      if (session.hrv != null) {
        const hrvRecord = { date: dayDate, value: Math.round(session.hrv), source: 'oura' };
        const idx = bio.hrv.findIndex(e => e.date === hrvRecord.date && e.source === 'oura');
        if (idx >= 0) bio.hrv[idx] = hrvRecord;
        else bio.hrv.push(hrvRecord);
        totalCount++;
      }
      // Resting HR from sleep session (lowest HR during sleep)
      const restingHR = session.hr_lowest ?? session.average_hr;
      if (restingHR != null) {
        const pulseRecord = { date: dayDate, value: Math.round(restingHR), source: 'oura' };
        const idx = bio.pulse.findIndex(e => e.date === pulseRecord.date && e.source === 'oura');
        if (idx >= 0) bio.pulse[idx] = pulseRecord;
        else bio.pulse.push(pulseRecord);
        totalCount++;
      }
    }

    // ── Readiness (score only) ──
    if (readinessData.status === 'fulfilled' && readinessData.value?.data) {
      for (const day of readinessData.value.data) {
        const dayDate = day.day;
        if (!dayDate) continue;
        if (day.score != null) {
          const readRecord = { date: dayDate, score: day.score, source: 'oura' };
          const idx = bio.readiness.findIndex(e => e.date === readRecord.date && e.source === 'oura');
          if (idx >= 0) bio.readiness[idx] = readRecord;
          else bio.readiness.push(readRecord);
          totalCount++;
        }
      }
    }

    // Process activity data
    if (activityData.status === 'fulfilled' && activityData.value?.data) {
      for (const day of activityData.value.data) {
        const dayDate = day.day || day.summary_date;
        if (!dayDate) continue;

        // Steps
        if (day.steps != null) {
          const record = { date: dayDate, value: day.steps, source: 'oura' };
          const idx = bio.steps.findIndex(e => e.date === record.date && e.source === 'oura');
          if (idx >= 0) bio.steps[idx] = record;
          else bio.steps.push(record);
          totalCount++;
        }

        // Active calories
        if (day.active_calories != null) {
          const record = { date: dayDate, value: day.active_calories, source: 'oura' };
          const idx = bio.activeCalories.findIndex(e => e.date === record.date && e.source === 'oura');
          if (idx >= 0) bio.activeCalories[idx] = record;
          else bio.activeCalories.push(record);
          totalCount++;
        }

        // Distance
        if (day.equivalent_walking_distance != null) {
          const record = { date: dayDate, value_m: day.equivalent_walking_distance, source: 'oura' };
          const idx = bio.distance.findIndex(e => e.date === record.date && e.source === 'oura');
          if (idx >= 0) bio.distance[idx] = record;
          else bio.distance.push(record);
          totalCount++;
        }

        // Active minutes
        const activeMinutes = ((day.high_activity_time ?? 0) + (day.medium_activity_time ?? 0)) / 60;
        if (activeMinutes > 0) {
          const record = { date: dayDate, value: Math.round(activeMinutes), source: 'oura' };
          const idx = bio.activeMinutes.findIndex(e => e.date === record.date && e.source === 'oura');
          if (idx >= 0) bio.activeMinutes[idx] = record;
          else bio.activeMinutes.push(record);
          totalCount++;
        }
      }
    }

    // Process SpO2 data
    if (spo2Data.status === 'fulfilled' && spo2Data.value?.data) {
      for (const day of spo2Data.value.data) {
        if (!day.day) continue;
        // Oura V2 spo2: spo2_percentage is an object { average: N } or a direct number
        const raw = day.spo2_percentage;
        const spo2Pct = typeof raw === 'object' && raw !== null ? raw.average : (typeof raw === 'number' ? raw : null);
        if (spo2Pct != null) {
          const record = { date: day.day, value: Math.round(spo2Pct * 10) / 10, source: 'oura' };
          const idx = bio.spo2.findIndex(e => e.date === record.date && e.source === 'oura');
          if (idx >= 0) bio.spo2[idx] = record;
          else bio.spo2.push(record);
          totalCount++;
        }
      }
    }

    // Process heart rate data (compute daily resting HR using lowest sustained HR)
    if (hrData.status === 'fulfilled' && hrData.value) {
      const hrByDay = this._aggregateHeartRate(hrData.value);
      for (const [date, restingHR] of hrByDay.entries()) {
        if (restingHR != null) {
          const record = { date, value: restingHR, source: 'oura' };
          const idx = bio.pulse.findIndex(e => e.date === record.date && e.source === 'oura');
          if (idx >= 0) bio.pulse[idx] = record;
          else bio.pulse.push(record);
          totalCount++;
        }
      }
    }

    // Sort all arrays
    for (const key of ['weight', 'bp', 'pulse', 'hrv', 'sleep', 'readiness', 'steps', 'activeCalories', 'distance', 'activeMinutes', 'spo2']) {
      if (Array.isArray(bio[key]) && bio[key].length > 0) {
        bio[key].sort((a, b) => a.date.localeCompare(b.date));
      }
    }

    this._setLastSync(new Date().toISOString());
    if (window.recordChange) window.recordChange('biometrics');
    await saveImportedData();

    return { success: true, count: totalCount };
  }

  // ── Fetch heart rate intraday data ──
  async _fetchHeartRate(startDate, endDate) {
    const startDt = `${startDate}T00:00:00Z`;
    const endDt = `${endDate}T23:59:59Z`;
    try {
      return await this._apiGet('/heartrate', { start_datetime: startDt, end_datetime: endDt });
    } catch (e) {
      // Heart rate endpoint may not be available or may fail
      return null;
    }
  }

  // ── Aggregate intraday HR to daily resting HR (lowest sustained HR) ──
  _aggregateHeartRate(hrResponse) {
    const dailyMap = new Map(); // date → array of HR readings
    const readings = hrResponse?.data || hrResponse || [];
    if (!Array.isArray(readings)) return dailyMap;

    for (const reading of readings) {
      if (reading.bpm == null) continue;
      const ts = reading.timestamp || reading.start_time;
      if (!ts) continue;
      const date = ts.slice(0, 10);
      if (!dailyMap.has(date)) dailyMap.set(date, []);
      dailyMap.get(date).push(reading.bpm);
    }

    // For each day, compute resting HR as the 10th percentile of readings
    // (closest to lowest sustained)
    const restingByDay = new Map();
    for (const [date, readings] of dailyMap.entries()) {
      if (readings.length === 0) continue;
      readings.sort((a, b) => a - b);
      // Use 10th percentile as approximation of lowest sustained
      const idx = Math.max(0, Math.floor(readings.length * 0.1));
      restingByDay.set(date, Math.round(readings[idx]));
    }
    return restingByDay;
  }

  // ── Disconnect ──
  async disconnect() {
    const bio = state.importedData?.biometrics;
    if (bio) {
      for (const key of ['pulse', 'hrv', 'sleep', 'readiness', 'steps', 'activeCalories', 'distance', 'activeMinutes', 'spo2']) {
        if (Array.isArray(bio[key])) {
          bio[key] = bio[key].filter(e => e.source !== 'oura');
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

const oura = new OuraProvider();
export default oura;

Object.assign(window, {
  authorizeOura: (cfg) => oura.authorize(cfg),
  setOuraPAT: (pat) => oura.setPAT(pat),
  syncOura: () => oura.sync(),
  disconnectOura: () => oura.disconnect(),
  getOuraConfig: () => oura.getConfig(),
  isOuraConnected: () => oura.isConnected(),
  getOuraLastSync: () => oura.getLastSync(),
});