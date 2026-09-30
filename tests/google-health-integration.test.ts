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
  withFreshToken,
  withGoogleHealthRefreshLock,
} from '../js/wearables-google-health-auth.js';

interface GoogleProxyRequest {
  url: string;
  headers: Record<string, string>;
  body?: {
    dataSourceFamily: string; windowSizeDays: number; pageSize: number;
    range: { start: { date: ReturnType<typeof _googleHealthInternals.civilDate> };
      end: { date: ReturnType<typeof _googleHealthInternals.civilDate> } };
  };
}

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function googleProxyFetch({ failPath = '', failStatus = 500, failAll = false } = {}) {
  return vi.fn(async (_url: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    const relay: GoogleProxyRequest = JSON.parse(String(init.body || '{}'));
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
  it('serializes refresh and disconnect credential work', async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve; });
    const order: string[] = [];

    const refresh = withGoogleHealthRefreshLock(async () => {
      order.push('refresh-start');
      await refreshGate;
      order.push('refresh-end');
    });
    await vi.waitFor(() => expect(order).toEqual(['refresh-start']));

    const disconnect = withGoogleHealthRefreshLock(() => {
      order.push('disconnect');
    });
    await Promise.resolve();
    expect(order).toEqual(['refresh-start']);

    releaseRefresh();
    await Promise.all([refresh, disconnect]);
    expect(order).toEqual(['refresh-start', 'refresh-end', 'disconnect']);
  });

  it('does not refresh or persist after the connection is removed', async () => {
    const disconnected = Object.assign(new Error('Connection removed'), { code: 'disconnected' });
    const write = vi.fn();
    globalThis.fetch = vi.fn();

    await expect(withFreshToken({
      accessToken: 'expired-access',
      refreshToken: 'refresh-secret',
      expiresAt: Date.now() - 1,
    }, 'google-client', write, () => { throw disconnected; })).rejects.toBe(disconnected);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('registers an optional read-only aggregator without replacing direct providers', () => {
    const adapter = adapterById('google_health');
    expect(adapter).toMatchObject({
      displayName: 'Google Health',
      authType: 'oauth2',
      integrationKind: 'aggregator',
      dataMode: 'reconciled',
    });
    expect(adapter!.privacyNotice).toContain('When enabled by a self-hosted deployment');
    expect(adapter!.privacyNotice).toContain('Independent direct integrations remain available');
    expect(adapter!.manageAccessUrl).toBe('https://myaccount.google.com/connections');
    expect(adapter!.oauth!.scopes).toEqual(DEFAULT_GOOGLE_HEALTH_SCOPES);
    expect(adapter!.oauth!.scopes.every(scope => scope.endsWith('.readonly'))).toBe(true);
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
    expect(authorizeUrl.searchParams.get('scope')!.split(' ')).toEqual(DEFAULT_GOOGLE_HEALTH_SCOPES);

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
    let relay: unknown = JSON.parse((globalThis.fetch as ReturnType<typeof googleProxyFetch>).mock.calls[0]![1]!.body as string);
    expect(relay).toEqual({ google_health_token_exchange: {
      code: 'auth-code',
      redirect_uri: 'https://app.getbased.health/app',
      client_id: 'google-client',
    } });

    await refreshTokens({ clientId: 'google-client', refreshToken: 'refresh-secret' });
    relay = JSON.parse((globalThis.fetch as ReturnType<typeof googleProxyFetch>).mock.calls[1]![1]!.body as string);
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

    const relays = (globalThis.fetch as ReturnType<typeof googleProxyFetch>).mock.calls.map(([, init]) => (JSON.parse(init!.body as string) as GoogleProxyRequest));
    expect(relays.every(relay => relay.url.startsWith('https://health.googleapis.com/v4/users/me/'))).toBe(true);
    expect(relays.every(relay => relay.headers.Authorization === 'Bearer access-secret')).toBe(true);
    const rollup = relays.find(relay => relay.url.includes('/steps/dataPoints:dailyRollUp'))!;
    expect(rollup.body!.dataSourceFamily).toBe('users/me/dataSourceFamilies/all-sources');
    expect(rollup.body!.range.start).toEqual({ date: { year: 2026, month: 7, day: 31 } });
    const sleepRelay = relays.find(relay => relay.url.includes('/sleep/dataPoints:reconcile'))!;
    expect(new URL(sleepRelay.url).searchParams.get('pageSize')).toBe('25');
    expect(new URL(sleepRelay.url).searchParams.get('filter')).toContain('sleep.interval.civil_end_time');
  });

  it.each([
    ['heart-rate', 14, [
      ['2026-01-01', '2026-01-15'],
      ['2026-01-15', '2026-01-29'],
      ['2026-01-29', '2026-02-12'],
      ['2026-02-12', '2026-02-26'],
      ['2026-02-26', '2026-03-12'],
      ['2026-03-12', '2026-03-26'],
      ['2026-03-26', '2026-04-02'],
    ]],
    ['steps', 90, [
      ['2026-01-01', '2026-04-01'],
      ['2026-04-01', '2026-04-02'],
    ]],
  ] as const)('keeps %s rollup requests within API duration limits across a 91-day range', async (type, limit, ranges) => {
    globalThis.fetch = googleProxyFetch();
    await fetchGoogleHealthDailyRange('access-secret', '2026-01-01', '2026-04-01');

    const requests = (globalThis.fetch as ReturnType<typeof googleProxyFetch>).mock.calls
      .map(([, init]) => (JSON.parse(init!.body as string) as GoogleProxyRequest))
      .filter(relay => relay.url.endsWith(`/dataTypes/${type}/dataPoints:dailyRollUp`));

    // End dates are exclusive: these exact boundaries cover every requested
    // day once, including the final partial chunk and month transitions.
    expect(requests.map(relay => relay.body!.range)).toEqual(ranges.map(([start, end]) => ({
      start: { date: _googleHealthInternals.civilDate(start) },
      end: { date: _googleHealthInternals.civilDate(end) },
    })));
    for (const request of requests) {
      expect(request.body!.windowSizeDays).toBe(1);
      expect(request.body!.pageSize).toBe(limit);
      expect(request.body!.windowSizeDays * request.body!.pageSize).toBeLessThanOrEqual(limit);
    }
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
