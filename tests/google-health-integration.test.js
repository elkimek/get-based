import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adapterById, visibleAdapters } from '../js/wearable-adapters.js';
import {
  _googleHealthInternals,
  fetchGoogleHealthDailyRange,
  fetchGoogleHealthPersonalInfo,
} from '../js/wearables-google-health.js';
import {
  DEFAULT_GOOGLE_HEALTH_SCOPES,
  buildAuthorizeUrl,
  completeOAuthCallback,
  refreshTokens,
} from '../js/wearables-google-health-auth.js';
import {
  deleteWearableCredentials,
  loadWearableCredentials,
  saveWearableCredentials,
} from '../js/wearables-credential-vault.js';
import {
  clearSource,
  getDailyRange,
  getDailyRangeRaw,
  getMeta,
  upsertDailyBatch,
} from '../js/wearables-store.js';
import { computeWearableSummary } from '../js/wearables-summary.js';

const realFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function googleProxyFetch({ failPath = '', failStatus = 500, failAll = false } = {}) {
  return vi.fn(async (_url, init = {}) => {
    const relay = JSON.parse(String(init.body || '{}'));
    const upstream = new URL(relay.url);
    const path = upstream.pathname;
    if (failAll || (failPath && path.includes(failPath))) {
      return jsonResponse({ error: { message: 'scope denied' } }, failStatus);
    }

    if (path.endsWith('/identity')) {
      return jsonResponse({ healthUserId: 'health-user-1', legacyUserId: 'fitbit-user-1' });
    }
    if (path.includes('/steps/dataPoints:dailyRollUp')) {
      return jsonResponse({ rollupDataPoints: [{
        civilStartTime: { date: { year: 2026, month: 7, day: 31 } },
        steps: { countSum: '8765' },
      }] });
    }
    if (path.includes('/heart-rate/dataPoints:dailyRollUp')) {
      return jsonResponse({ rollupDataPoints: [{
        civilStartTime: { date: { year: 2026, month: 7, day: 31 } },
        heartRate: { beatsPerMinuteAvg: 73.5 },
      }] });
    }
    if (path.includes('/weight/dataPoints:dailyRollUp')) {
      return jsonResponse({ rollupDataPoints: [{
        civilStartTime: { date: { year: 2026, month: 7, day: 31 } },
        weight: { weightGramsAvg: 81250 },
      }] });
    }
    if (path.includes('/body-fat/dataPoints:dailyRollUp')) {
      return jsonResponse({ rollupDataPoints: [{
        civilStartTime: { date: { year: 2026, month: 7, day: 31 } },
        bodyFat: { bodyFatPercentageAvg: 18.2 },
      }] });
    }

    const daily = { date: { year: 2026, month: 7, day: 31 } };
    if (path.includes('/daily-heart-rate-variability/')) {
      return jsonResponse({ dataPoints: [{ dailyHeartRateVariability: {
        ...daily,
        averageHeartRateVariabilityMilliseconds: 41,
        deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 47,
      } }] });
    }
    if (path.includes('/daily-resting-heart-rate/')) {
      return jsonResponse({ dataPoints: [{ dailyRestingHeartRate: { ...daily, beatsPerMinute: '58' } }] });
    }
    if (path.includes('/daily-oxygen-saturation/')) {
      return jsonResponse({ dataPoints: [{ dailyOxygenSaturation: { ...daily, averagePercentage: 96.7 } }] });
    }
    if (path.includes('/daily-respiratory-rate/')) {
      return jsonResponse({ dataPoints: [{ dailyRespiratoryRate: { ...daily, breathsPerMinute: 14.4 } }] });
    }
    if (path.includes('/daily-sleep-temperature-derivations/')) {
      return jsonResponse({ dataPoints: [{ dailySleepTemperatureDerivations: {
        ...daily,
        nightlyTemperatureCelsius: 34.4,
        baselineTemperatureCelsius: 34.1,
      } }] });
    }
    if (path.includes('/daily-vo2-max/')) {
      return jsonResponse({ dataPoints: [{ dailyVo2Max: { ...daily, vo2Max: 44.8 } }] });
    }
    if (path.includes('/sleep/')) {
      return jsonResponse({ dataPoints: [{ sleep: {
        interval: {
          endTime: '2026-07-31T06:30:00Z',
          civilEndTime: { date: { year: 2026, month: 7, day: 31 } },
        },
        metadata: { nap: false },
        summary: {
          minutesInSleepPeriod: '465',
          minutesAsleep: '430',
          minutesAwake: '35',
          stagesSummary: [
            { type: 'DEEP', minutes: '90' },
            { type: 'LIGHT', minutes: '250' },
            { type: 'REM', minutes: '90' },
          ],
        },
      } }] });
    }
    return jsonResponse({ dataPoints: [], rollupDataPoints: [] });
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('Google Health adapter and OAuth', () => {
  it('registers an optional read-only aggregator without replacing direct providers', () => {
    const adapter = adapterById('google_health');
    expect(adapter).toMatchObject({
      displayName: 'Google Health',
      authType: 'oauth2',
      integrationKind: 'aggregator',
      dataMode: 'reconciled',
    });
    expect(adapter.privacyNotice).toContain('Independent direct integrations remain available');
    expect(adapter.oauth.scopes).toEqual(DEFAULT_GOOGLE_HEALTH_SCOPES);
    expect(adapter.oauth.scopes.every(scope => scope.endsWith('.readonly'))).toBe(true);
    const visibleIds = visibleAdapters([]).map(item => item.id);
    expect(visibleIds).not.toContain('fitbit');
    expect(visibleAdapters(['fitbit']).map(item => item.id)).toContain('fitbit');
    expect(adapterById('fitbit')).toMatchObject({
      legacyMigrationOnly: true,
      replacementAdapterId: 'google_health',
    });
    expect(visibleIds.indexOf('google_health')).toBeGreaterThan(visibleIds.indexOf('polar'));
    expect(visibleIds.indexOf('google_health')).toBeLessThan(visibleIds.indexOf('manual'));
  });

  it('builds the confidential web-server authorize request and relays code/refresh grants', async () => {
    const authorizeUrl = new URL(buildAuthorizeUrl({
      clientId: 'google-client',
      redirectUri: 'https://app.getbased.health/app',
      state: 'csrf-state',
    }));
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authorizeUrl.searchParams.get('access_type')).toBe('offline');
    expect(authorizeUrl.searchParams.get('prompt')).toBe('consent');
    expect(authorizeUrl.searchParams.get('scope').split(' ')).toEqual(DEFAULT_GOOGLE_HEALTH_SCOPES);

    sessionStorage.setItem('google_health-oauth-pending', JSON.stringify({
      state: 'csrf-state',
      redirectUri: 'https://app.getbased.health/app',
      startedAt: Date.now(),
      clientId: 'google-client',
      profileId: 'profile-1',
    }));
    globalThis.fetch = vi.fn(async () => jsonResponse({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      expires_in: 3600,
      scope: DEFAULT_GOOGLE_HEALTH_SCOPES.join(' '),
    }));

    const result = await completeOAuthCallback(new URLSearchParams('code=auth-code&state=csrf-state'));
    expect(result.ok).toBe(true);
    expect(result.profileId).toBe('profile-1');
    let relay = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(relay).toEqual({ google_health_token_exchange: {
      code: 'auth-code',
      redirect_uri: 'https://app.getbased.health/app',
      client_id: 'google-client',
    } });

    await refreshTokens({ clientId: 'google-client', refreshToken: 'refresh-secret' });
    relay = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(relay).toEqual({ google_health_token_refresh: {
      refresh_token: 'refresh-secret',
      client_id: 'google-client',
    } });
  });

  it('maps Google Health v4 rollups and reconciled daily data to canonical rows', async () => {
    globalThis.fetch = googleProxyFetch({ failPath: '/body-fat/', failStatus: 403 });
    const rows = await fetchGoogleHealthDailyRange('access-secret', '2026-07-31', '2026-07-31');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'google_health',
      date: '2026-07-31',
      hrv_rmssd: 47,
      rhr: 58,
      hr_day: 73.5,
      steps: 8765,
      weight: 81.25,
      body_fat_pct: null,
      spo2_avg: 96.7,
      body_temp_delta: expect.closeTo(0.3),
      vo2max: 44.8,
      sleep_total_min: 430,
      sleep_deep_min: 90,
      sleep_light_min: 250,
      sleep_rem_min: 90,
      sleep_awake_min: 35,
      sleep_breathing_rate: 14.4,
      _provenance: {
        provider: 'google_health',
        stream: 'reconciled',
        dataSourceFamily: 'all-sources',
      },
    });

    const relays = globalThis.fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(relays.every(relay => relay.url.startsWith('https://health.googleapis.com/v4/users/me/'))).toBe(true);
    expect(relays.every(relay => relay.headers.Authorization === 'Bearer access-secret')).toBe(true);
    const rollup = relays.find(relay => relay.url.includes('/steps/dataPoints:dailyRollUp'));
    expect(rollup.body.dataSourceFamily).toBe('users/me/dataSourceFamilies/all-sources');
    expect(rollup.body.range.start).toEqual({ date: { year: 2026, month: 7, day: 31 } });
    const sleepRelay = relays.find(relay => relay.url.includes('/sleep/dataPoints:reconcile'));
    expect(new URL(sleepRelay.url).searchParams.get('pageSize')).toBe('25');
    expect(new URL(sleepRelay.url).searchParams.get('filter')).toContain('sleep.interval.civil_end_time');
  });

  it('reads account identity and chunks API ranges within Google limits', async () => {
    globalThis.fetch = googleProxyFetch();
    await expect(fetchGoogleHealthPersonalInfo('access-secret')).resolves.toEqual({
      ok: true,
      account: {
        identity: 'Google Health user health-user-1',
        userId: 'health-user-1',
        legacyFitbitUserId: 'fitbit-user-1',
      },
    });
    expect(_googleHealthInternals.chunks('2026-01-01', '2026-04-01', 14))
      .toEqual(expect.arrayContaining([
        { start: '2026-01-01', end: '2026-01-14' },
        { start: '2026-03-26', end: '2026-04-01' },
      ]));
    expect(_googleHealthInternals.chunks('2026-01-01', '2026-04-01', 90)).toEqual([
      { start: '2026-01-01', end: '2026-03-31' },
      { start: '2026-04-01', end: '2026-04-01' },
    ]);
  });

  it('reports an authorization error when every requested health family is denied', async () => {
    globalThis.fetch = googleProxyFetch({ failAll: true, failStatus: 403 });
    await expect(fetchGoogleHealthDailyRange('access-secret', '2026-07-31', '2026-07-31'))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('Google Health privacy and source precedence', () => {
  it('encrypts credentials in a device-local vault and deletes them on request', async () => {
    const profileId = `google-vault-${crypto.randomUUID()}`;
    await saveWearableCredentials(profileId, 'google_health', {
      accessToken: 'access-plaintext-must-not-leak',
      refreshToken: 'refresh-plaintext-must-not-leak',
    });

    const stored = await getMeta(profileId, 'credential-vault-record:v1:google_health');
    expect(stored).toMatchObject({ version: 1 });
    expect(stored.iv).toBeInstanceOf(Uint8Array);
    expect(stored.ciphertext).toBeInstanceOf(ArrayBuffer);
    expect(JSON.stringify(stored)).not.toContain('plaintext-must-not-leak');
    await expect(loadWearableCredentials(profileId, 'google_health')).resolves.toEqual({
      accessToken: 'access-plaintext-must-not-leak',
      refreshToken: 'refresh-plaintext-must-not-leak',
    });

    await deleteWearableCredentials(profileId, 'google_health');
    await expect(loadWearableCredentials(profileId, 'google_health')).resolves.toBeNull();
  });

  it('always encrypts Google Health daily rows even when app passphrase encryption is off', async () => {
    const profileId = `google-rows-${crypto.randomUUID()}`;
    localStorage.removeItem('labcharts-encryption-enabled');
    await upsertDailyBatch(profileId, [{
      source: 'google_health',
      date: '2026-07-31',
      hrv_rmssd: 47,
      steps: 8765,
    }]);

    const raw = await getDailyRangeRaw(profileId, 'google_health', '2026-07-31', '2026-07-31');
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({
      source: 'google_health',
      date: '2026-07-31',
      _devicePayload: { version: 1 },
    });
    expect(raw[0]).not.toHaveProperty('hrv_rmssd');
    expect(JSON.stringify(raw[0])).not.toContain('8765');

    await expect(getDailyRange(profileId, 'google_health', '2026-07-31', '2026-07-31'))
      .resolves.toEqual([expect.objectContaining({ hrv_rmssd: 47, steps: 8765 })]);
    await clearSource(profileId, 'google_health');
  });

  it('prefers independent direct sources but migrates tied legacy Fitbit data to Google Health', () => {
    const rows = {
      google_health: [{ source: 'google_health', date: '2026-07-31', hrv_rmssd: 40 }],
      oura: [{ source: 'oura', date: '2026-07-31', hrv_rmssd: 42 }],
    };
    const connections = {
      google_health: { connectedSince: '2026-07-01', lastSyncAt: 1 },
      oura: { connectedSince: '2026-07-01', lastSyncAt: 1 },
    };

    expect(computeWearableSummary(rows, connections).metrics.hrv_rmssd.primarySource).toBe('oura');
    expect(computeWearableSummary(rows, connections, { hrv_rmssd: 'google_health' })
      .metrics.hrv_rmssd.primarySource).toBe('google_health');

    const migrationRows = {
      google_health: rows.google_health,
      fitbit: [{ source: 'fitbit', date: '2026-07-31', hrv_rmssd: 41 }],
    };
    const migrationConnections = {
      google_health: connections.google_health,
      fitbit: { connectedSince: '2026-07-01', lastSyncAt: 1 },
    };
    expect(computeWearableSummary(migrationRows, migrationConnections).metrics.hrv_rmssd.primarySource)
      .toBe('google_health');
    expect(computeWearableSummary(migrationRows, migrationConnections, { hrv_rmssd: 'fitbit' })
      .metrics.hrv_rmssd.primarySource).toBe('fitbit');
  });
});
