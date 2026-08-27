import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?wearablesProviderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('Fitbit Ultrahuman and Withings provider fetchers normalize proxy responses', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ adaptersUrl, fitbitUrl, ultrahumanUrl, withingsUrl }) => {
    const [{ isoDay }, fitbit, ultrahuman, withings] = await Promise.all([
      import(adaptersUrl),
      import(fitbitUrl),
      import(ultrahumanUrl),
      import(withingsUrl),
    ]);
    const outcomes = {};
    const originalFetch = window.fetch;
    const originalDebug = localStorage.getItem('labcharts-debug');
    const requests = [];

    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const installFetch = (handler) => {
      window.fetch = async (url, options = {}) => {
        const rawBody = String(options.body || '');
        const proxy = rawBody
          ? JSON.parse(rawBody)
          : { url: String(url), method: options.method || 'GET', headers: options.headers || {} };
        requests.push(proxy);
        const reply = await handler(proxy);
        if (reply instanceof Response) return reply;
        return jsonResponse(reply?.body ?? reply, reply?.status || 200);
      };
    };

    try {
      localStorage.setItem('labcharts-debug', 'true');

      installFetch((proxy) => {
        const url = new URL(proxy.url);
        const path = url.pathname;
        if (path.endsWith('/profile.json')) {
          return { body: { user: { email: 'fitbit@example.test', displayName: 'Fit Bit' } } };
        }
        if (path.includes('/hrv/date/')) {
          return { body: { hrv: [
            { dateTime: '2026-06-01', value: { deepRmssd: 52, dailyRmssd: 44 } },
            { dateTime: '2026-06-02', value: { rmssdMilliseconds: 41 } },
          ] } };
        }
        if (path.includes('/activities/heart/date/')) {
          return { body: { 'activities-heart': [
            { dateTime: '2026-06-01', value: { restingHeartRate: 55 } },
          ] } };
        }
        if (path.includes('/activities/steps/date/')) {
          return { body: { 'activities-steps': [
            { dateTime: '2026-06-01', value: '2500' },
            { dateTime: '2026-06-02', value: 'not-a-number' },
          ] } };
        }
        if (path.includes('/sleep/date/')) {
          return { body: { sleep: [
            { dateOfSleep: '2026-06-01', efficiency: 80, duration: 2000 },
            { dateOfSleep: '2026-06-01', efficiency: 94, isMainSleep: true, duration: 1000 },
          ] } };
        }
        if (path.includes('/spo2/date/')) {
          return { status: 500, body: { errors: [{ message: 'spo2 temporarily down' }] } };
        }
        if (path.includes('/temp/skin/date/')) {
          return { body: { tempSkin: [
            { dateTime: '2026-06-01', value: { nightlyRelative: -0.2 } },
          ] } };
        }
        if (path.includes('/body/log/weight/date/')) {
          return { body: { weight: [
            { date: '2026-06-01', weight: 70.1 },
            { date: '2026-06-01', weight: 70.3 },
          ] } };
        }
        return { status: 404, body: { error: `unhandled Fitbit path ${path}` } };
      });
      const fitbitInfo = await fitbit.fetchFitbitPersonalInfo('fitbit-token');
      const fitbitRows = await fitbit.fetchFitbitDailyRange('fitbit-token', '2026-06-01', '2026-06-02');
      const fitbitDay = fitbitRows.find(row => row.date === '2026-06-01');
      outcomes.fitbitNormalizesRange = fitbitInfo.ok === true
        && fitbitInfo.account.email === 'fitbit@example.test'
        && fitbitDay?.hrv_rmssd === 52
        && fitbitDay?.hrv_day === 44
        && fitbitDay?.rhr === 55
        && fitbitDay?.steps === 2500
        && fitbitDay?.sleep_score === 94
        && fitbitDay?.spo2_avg === null
        && fitbitDay?.body_temp_delta === -0.2
        && fitbitDay?.weight === 70.3
        && requests.some(req => req.headers?.Authorization === 'Bearer fitbit-token');
      installFetch(() => ({ status: 401, body: { errors: [{ message: 'profile denied' }] } }));
      const fitbitError = await fitbit.fetchFitbitPersonalInfo('bad-fitbit-token');
      outcomes.fitbitPersonalInfoError = fitbitError.ok === false
        && fitbitError.status === 401
        && fitbitError.error.includes('profile denied');

      installFetch((proxy) => {
        const url = new URL(proxy.url);
        const path = url.pathname;
        if (path.endsWith('/user_info')) {
          return { body: { user: { email: 'uh@example.test', first_name: 'Ultra', last_name: 'Human' } } };
        }
        if (path.endsWith('/metrics')) {
          const day = url.searchParams.get('date');
          if (day === '2026-06-01') {
            return { body: { data: { metric_data: {
              hrv: { sleep: 55, avg: 62 },
              resting_heart_rate: { sleep: 49, avg: 70 },
              sleep_index: { score: 88 },
              recovery_index: { score: 91 },
              steps: { total: 12345 },
              temperature: { deviation: -0.1 },
              glucose: { avg: 102 },
            } } } };
          }
          if (day === '2026-06-02') return { body: { data: { metric_data: {} } } };
          return { status: 503, body: { message: 'metrics unavailable' } };
        }
        return { status: 404, body: { error: `unhandled Ultrahuman path ${path}` } };
      });
      const ultrahumanInfo = await ultrahuman.fetchUltrahumanPersonalInfo('uh-token');
      const ultrahumanRows = await ultrahuman.fetchUltrahumanDailyRange('uh-token', '2026-06-01', '2026-06-03');
      const ultrahumanDay = ultrahumanRows[0];
      outcomes.ultrahumanNormalizesRange = ultrahumanInfo.ok === true
        && ultrahumanInfo.account.email === 'uh@example.test'
        && ultrahumanRows.length === 1
        && ultrahumanDay.date === '2026-06-01'
        && ultrahumanDay.hrv_rmssd === 55
        && ultrahumanDay.hrv_day === 62
        && ultrahumanDay.rhr === 49
        && ultrahumanDay.hr_day === 70
        && ultrahumanDay.sleep_score === 88
        && ultrahumanDay.readiness_score === 91
        && ultrahumanDay.steps === 12345
        && ultrahumanDay.body_temp_delta === -0.1
        && ultrahumanDay.glucose_avg === 102;
      installFetch(() => ({ status: 401, body: { message: 'user info denied' } }));
      const ultrahumanError = await ultrahuman.fetchUltrahumanPersonalInfo('bad-uh-token');
      outcomes.ultrahumanPersonalInfoError = ultrahumanError.ok === false
        && ultrahumanError.status === 401
        && ultrahumanError.error.includes('user info denied');

      outcomes.withingsErrorMapping = withings.withingsErrorMessage(284).includes('Token not found')
        && withings.withingsErrorMessage('not-a-number') === null
        && withings.withingsErrorMessage(999) === null;
      const measureEpoch = Math.floor(new Date('2026-06-01T12:00:00Z').getTime() / 1000);
      const expectedMeasureDay = isoDay(new Date(measureEpoch * 1000));
      installFetch((proxy) => {
        const form = new URLSearchParams(proxy.body || '');
        const action = form.get('action');
        if (action === 'getmeas' && form.has('startdate') && !form.has('category')) {
          return { body: { status: 0, body: { updatetime: measureEpoch } } };
        }
        if (action === 'getmeas') {
          return { body: { status: 0, body: { measuregrps: [{
            date: measureEpoch,
            measures: [
              { type: 1, value: 725, unit: -1 },
              { type: 10, value: 121, unit: 0 },
              { type: 9, value: 78, unit: 0 },
              { type: 11, value: 64, unit: 0 },
              { type: 54, value: 975, unit: -1 },
              { type: 73, value: 334, unit: -1 },
              { type: 169, value: 45, unit: 0 },
              { type: 999, value: 1, unit: 0 },
            ],
          }] } } };
        }
        if (action === 'getsleepsummary') {
          return { body: { status: 0, body: { series: [{
            date: expectedMeasureDay,
            data: {
              sleep_score: 87,
              hr_min: 52,
              hr_average: 59,
              rr_average: 14,
              asleepduration: 7 * 3600,
              deepsleepduration: 90 * 60,
              snoring: 120,
              breathing_disturbances_intensity: 12,
            },
          }] } } };
        }
        return { body: { status: 233, error: `unhandled Withings action ${action}` } };
      });
      const withingsInfo = await withings.fetchWithingsPersonalInfo('withings-token');
      const withingsRows = await withings.fetchWithingsDailyRange('withings-token', '2026-06-01', '2026-06-02');
      const withingsDay = withingsRows.find(row => row.date === expectedMeasureDay);
      outcomes.withingsNormalizesRange = withingsInfo.ok === true
        && withingsInfo.account.lastMeasure === expectedMeasureDay
        && withingsDay?.weight === 72.5
        && withingsDay?.bp_systolic === 121
        && withingsDay?.bp_diastolic === 78
        && withingsDay?.hr_day === 64
        && withingsDay?.spo2_avg === 97.5
        && withingsDay?.skin_temp === 33.4
        && withingsDay?.cardio_fitness === 45
        && withingsDay?.sleep_score === 87
        && withingsDay?.rhr === 52
        && withingsDay?.sleep_total_min === 420
        && withingsDay?.sleep_deep_min === 90
        && withingsDay?.sleep_snoring_min === 2
        && withingsDay?.sleep_breath_disturb === 12;
      installFetch((proxy) => {
        const form = new URLSearchParams(proxy.body || '');
        const action = form.get('action');
        if (action === 'getmeas') return { status: 502, body: { error: 'measure proxy down' } };
        return { body: { status: 284, error: 'token missing' } };
      });
      const emptyWithingsRows = await withings.fetchWithingsDailyRange('withings-token', '2026-06-01', '2026-06-02');
      const withingsError = await withings.fetchWithingsPersonalInfo('withings-token');
      outcomes.withingsErrorPaths = Array.isArray(emptyWithingsRows)
        && emptyWithingsRows.length === 0
        && withingsError.ok === false
        && withingsError.status === 502
        && withingsError.error.includes('measure proxy down');
    } finally {
      window.fetch = originalFetch;
      if (originalDebug == null) localStorage.removeItem('labcharts-debug');
      else localStorage.setItem('labcharts-debug', originalDebug);
    }

    return outcomes;
  }, {
    adaptersUrl: moduleUrl('/js/wearable-adapters.js'),
    fitbitUrl: moduleUrl('/js/wearables-fitbit.js'),
    ultrahumanUrl: moduleUrl('/js/wearables-ultrahuman.js'),
    withingsUrl: moduleUrl('/js/wearables-withings.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Oura and WHOOP provider fetchers collect paginated rows and canonical metrics', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ ouraUrl, whoopUrl }) => {
    const [oura, whoop] = await Promise.all([
      import(ouraUrl),
      import(whoopUrl),
    ]);
    const outcomes = {};
    const originalFetch = window.fetch;
    const originalDebug = localStorage.getItem('labcharts-debug');
    const requests = [];

    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const installFetch = (handler) => {
      window.fetch = async (_url, options = {}) => {
        const proxy = JSON.parse(String(options.body || '{}'));
        requests.push(proxy);
        const reply = await handler(proxy);
        if (reply instanceof Response) return reply;
        return jsonResponse(reply?.body ?? reply, reply?.status || 200);
      };
    };

    try {
      localStorage.setItem('labcharts-debug', 'true');

      installFetch((proxy) => {
        const url = new URL(proxy.url);
        const path = url.pathname;
        if (path.endsWith('/personal_info')) {
          return { body: {
            email: 'oura@example.test',
            age: 40,
            weight: 72,
            height: 180,
            biological_sex: 'male',
          } };
        }
        if (path.endsWith('/sleep')) {
          return { body: { data: [
            {
              day: '2026-01-01',
              total_sleep_duration: 8 * 3600,
              average_hrv: 0,
              hrv: { items: [0, 45, 55] },
              lowest_heart_rate: 0,
              heart_rate: { items: [0, 50, 47] },
            },
            {
              day: '2026-01-01',
              total_sleep_duration: 2 * 3600,
              average_hrv: 99,
              lowest_heart_rate: 41,
            },
            {
              day: '2026-01-02',
              total_sleep_duration: 7 * 3600,
              average_hrv: 0,
              hrv: { items: [0] },
              hrv_samples: [{ value: 30 }, 40, 'bad'],
              lowest_heart_rate: 0,
              heart_rate: { items: [0] },
            },
          ] } };
        }
        if (path.endsWith('/daily_sleep')) {
          return { body: { data: [
            { day: '2026-01-01', score: 86 },
            { day: '2026-01-02', score: 79 },
          ] } };
        }
        if (path.endsWith('/daily_readiness')) {
          return { body: { data: [
            { day: '2026-01-01', score: 91, temperature_deviation: -0.2 },
          ] } };
        }
        if (path.endsWith('/daily_spo2')) {
          return { body: { data: [
            { day: '2026-01-01', spo2_percentage: { average: 98.2 }, breathing_disturbance_index: 3 },
            { day: '2026-01-02', spo2_percentage: 97, breathing_disturbance_index: 0 },
          ] } };
        }
        if (path.endsWith('/daily_activity')) {
          if (url.searchParams.get('next_token') === 'activity-page-2') {
            return { body: { data: [
              { day: '2026-01-02', score: 82, steps: 5000 },
            ] } };
          }
          return { body: { data: [
            { day: '2026-01-01', score: 80, steps: 4000 },
          ], next_token: 'activity-page-2' } };
        }
        if (path.endsWith('/daily_stress')) {
          return { body: { data: [
            { day: '2026-01-01', stress_high: 1860 },
          ] } };
        }
        if (path.endsWith('/daily_resilience')) {
          return { body: { data: [
            { day: '2026-01-01', level: 'strong' },
          ] } };
        }
        if (path.endsWith('/daily_cardiovascular_age')) {
          return { body: { data: [
            { day: '2026-01-01', vascular_age: 39 },
          ] } };
        }
        if (path.endsWith('/vO2_max')) {
          return { body: { data: [
            { day: '2026-01-01', vo2_max: { value: 43 } },
          ] } };
        }
        if (path.endsWith('/heartrate')) {
          if (requests.filter(req => new URL(req.url).pathname.endsWith('/heartrate')).length > 1) {
            return { status: 500, body: { detail: 'heartrate chunk unavailable' } };
          }
          return { body: { data: [
            { timestamp: '2026-01-01T12:00:00Z', source: 'awake', bpm: 80 },
            { timestamp: '2026-01-01T13:00:00Z', source: 'awake', bpm: 82 },
            { timestamp: '2026-01-01T02:00:00Z', source: 'sleep', bpm: 48 },
            { timestamp: '2026-01-01T14:00:00Z', source: 'awake', bpm: 0 },
          ] } };
        }
        return { status: 404, body: { detail: `unhandled Oura path ${path}` } };
      });
      const ouraInfo = await oura.fetchOuraPersonalInfo('oura-token');
      const ouraRows = await oura.fetchOuraDailyRange('oura-token', '2026-01-01', '2026-01-31');
      const ouraDay1 = ouraRows.find(row => row.date === '2026-01-01');
      const ouraDay2 = ouraRows.find(row => row.date === '2026-01-02');
      outcomes.ouraCollectsAndNormalizes = ouraInfo.ok === true
        && ouraInfo.account.email === 'oura@example.test'
        && ouraDay1?.hrv_rmssd === 50
        && ouraDay1?.rhr === 47
        && ouraDay1?.hr_day === 81
        && ouraDay1?.sleep_score === 86
        && ouraDay1?.readiness_score === 91
        && ouraDay1?.activity_score === 80
        && ouraDay1?.steps === 4000
        && ouraDay1?.stress_high_min === 31
        && ouraDay1?.resilience_level === 4
        && ouraDay1?.cardio_age === 39
        && ouraDay1?.spo2_avg === 98.2
        && ouraDay1?.sleep_breath_disturb === 3
        && ouraDay1?.body_temp_delta === -0.2
        && ouraDay1?.vo2max === 43
        && ouraDay2?.hrv_rmssd === 35
        && ouraDay2?.activity_score === 82
        && requests.some(req => new URL(req.url).searchParams.get('next_token') === 'activity-page-2')
        && requests.filter(req => new URL(req.url).pathname.endsWith('/heartrate')).length >= 2;
      installFetch(() => ({ status: 401, body: { detail: 'oura denied' } }));
      const ouraError = await oura.fetchOuraPersonalInfo('bad-oura-token');
      outcomes.ouraPersonalInfoError = ouraError.ok === false
        && ouraError.status === 401
        && ouraError.error.includes('oura denied');

      installFetch((proxy) => {
        const url = new URL(proxy.url);
        const path = url.pathname;
        if (path.endsWith('/profile/basic')) {
          return { body: { email: 'whoop@example.test', first_name: 'Who', last_name: 'Op' } };
        }
        if (path.endsWith('/cycle')) {
          if (url.searchParams.get('nextToken') === 'cycle-page-2') {
            return { body: { records: [
              { id: 424243, start: '2026-06-02T05:00:00.000Z', score: { strain: 9, average_heart_rate: 70 } },
            ] } };
          }
          return { body: { records: [
            { id: 424242, start: '2026-06-01T05:00:00.000Z', score: { strain: 12.3, average_heart_rate: 75 } },
          ], next_token: 'cycle-page-2' } };
        }
        if (path.endsWith('/recovery')) {
          // v2 flat shape: recovery rows carry cycle_id/sleep_id references into
          // the fetched cycle/sleep collections (IDs synthetic). created_at is
          // deliberately the following morning — attribution must come from the
          // cycle join, not the created_at fallback.
          return { body: { records: [
            { cycle_id: 424242, sleep_id: null, created_at: '2026-06-02T06:30:00.000Z', score: { hrv_rmssd_milli: 65, resting_heart_rate: 48, recovery_score: 77 } },
            { cycle_id: 424243, sleep_id: null, created_at: '2026-06-03T06:30:00.000Z', score: { hrv_rmssd_milli: 61, resting_heart_rate: 50, recovery_score: 73 } },
          ] } };
        }
        if (path.endsWith('/activity/sleep')) {
          return { body: { records: [
            { start: '2026-06-01T22:00:00.000Z', score: { sleep_performance_percentage: 88 } },
          ] } };
        }
        return { status: 404, body: { message: `unhandled WHOOP path ${path}` } };
      });
      const whoopInfo = await whoop.fetchWhoopPersonalInfo('whoop-token');
      const whoopRows = await whoop.fetchWhoopDailyRange('whoop-token', '2026-06-01', '2026-06-02');
      const whoopDay1 = whoopRows.find(row => row.date === '2026-06-01');
      const whoopDay2 = whoopRows.find(row => row.date === '2026-06-02');
      outcomes.whoopCollectsAndNormalizes = whoopInfo.ok === true
        && whoopInfo.account.email === 'whoop@example.test'
        && whoopDay1?.hrv_rmssd === 65
        && whoopDay1?.rhr === 48
        && whoopDay1?.readiness_score === 77
        && whoopDay1?.strain === 12.3
        && whoopDay1?.hr_day === 75
        && whoopDay1?.sleep_score === 88
        && whoopDay2?.hrv_rmssd === 61
        && whoopDay2?.strain === 9
        && requests.some(req => new URL(req.url).searchParams.get('nextToken') === 'cycle-page-2');
      installFetch(() => ({ status: 500, body: { message: 'whoop endpoint down' } }));
      const emptyWhoopRows = await whoop.fetchWhoopDailyRange('whoop-token', '2026-06-01', '2026-06-02');
      const whoopError = await whoop.fetchWhoopPersonalInfo('bad-whoop-token');
      outcomes.whoopErrorPaths = emptyWhoopRows.length === 0
        && whoopError.ok === false
        && whoopError.status === 500
        && whoopError.error.includes('whoop endpoint down');
    } finally {
      window.fetch = originalFetch;
      if (originalDebug == null) localStorage.removeItem('labcharts-debug');
      else localStorage.setItem('labcharts-debug', originalDebug);
    }

    return outcomes;
  }, {
    ouraUrl: moduleUrl('/js/wearables-oura.js'),
    whoopUrl: moduleUrl('/js/wearables-whoop.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Polar provider fetcher covers registration transactions commits and guards', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ polarUrl }) => {
    const polar = await import(polarUrl);
    const outcomes = {};
    const originalFetch = window.fetch;
    const originalDebug = localStorage.getItem('labcharts-debug');
    const requests = [];
    let registerConflict = false;

    const textResponse = (body, status = 200) => new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
    const installFetch = (handler) => {
      window.fetch = async (_url, options = {}) => {
        const proxy = JSON.parse(String(options.body || '{}'));
        requests.push(proxy);
        const reply = await handler(proxy);
        if (reply instanceof Response) return reply;
        return textResponse(reply?.body ?? reply, reply?.status || 200);
      };
    };

    try {
      localStorage.setItem('labcharts-debug', 'true');
      installFetch((proxy) => {
        const url = new URL(proxy.url);
        const path = url.pathname;
        if (proxy.method === 'POST' && path.endsWith('/v3/users')) {
          if (registerConflict) return { status: 409, body: { error: 'already registered' } };
          return { body: { 'polar-user-id': 'polar-user-1' } };
        }
        if (proxy.method === 'GET' && path.endsWith('/v3/users/user-1')) {
          return { body: { 'first-name': 'Polar', 'last-name': 'Tester' } };
        }
        if (proxy.method === 'GET' && path.endsWith('/nights/sleep')) {
          return { body: { nights: [
            { date: '2026-06-01', 'sleep-score': 82, 'heart-rate-samples': { min: 50 } },
            { 'calendar-date': '2026-06-03', 'sleep-score': 70, 'heart-rate-samples': { min: 55 } },
          ] } };
        }
        if (proxy.method === 'POST' && path.endsWith('/activity-transactions')) {
          return { body: {
            'transaction-id': 'act-1',
            'activity-log': [
              'https://www.polaraccesslink.com/v3/users/user-1/activity-transactions/act-1/activities/good',
              'https://www.polaraccesslink.com/v3/users/user-1/activity-transactions/act-1/activities/bad',
            ],
          } };
        }
        if (proxy.method === 'GET' && path.endsWith('/activities/good')) {
          return { body: { date: '2026-05-30', 'active-steps': 777, 'heart-rate': { average: 73 } } };
        }
        if (proxy.method === 'GET' && path.endsWith('/activities/bad')) {
          return { status: 500, body: { error: 'activity item failed' } };
        }
        if (proxy.method === 'POST' && path.endsWith('/exercise-transactions')) {
          return { body: {
            'transaction-id': 'ex-1',
            exercises: ['https://www.polaraccesslink.com/v3/users/user-1/exercise-transactions/ex-1/exercises/good'],
          } };
        }
        if (proxy.method === 'GET' && path.endsWith('/exercises/good')) {
          return { body: {
            'start-time': '2026-06-02T10:00:00.000Z',
            'heart-rate-variability-avg': 38,
            'heart-rate': { average: 90 },
          } };
        }
        if (proxy.method === 'PUT' && path.endsWith('/activity-transactions/act-1')) {
          return { body: {} };
        }
        if (proxy.method === 'PUT' && path.endsWith('/exercise-transactions/ex-1')) {
          return { status: 500, body: { error: 'commit exercise failed' } };
        }
        return { status: 404, body: { error: `unhandled Polar ${proxy.method} ${path}` } };
      });

      const registered = await polar.registerPolarUser('polar-token', 'member-1');
      registerConflict = true;
      const alreadyRegistered = await polar.registerPolarUser('polar-token', 'member-1');
      const noUserInfo = await polar.fetchPolarPersonalInfo('polar-token');
      const info = await polar.fetchPolarPersonalInfo('polar-token', 'user-1');
      let missingConnectionError = null;
      try {
        await polar.fetchPolarDailyRange('polar-token', '2026-06-01', '2026-06-02');
      } catch (error) {
        missingConnectionError = error;
      }
      const rows = await polar.fetchPolarDailyRange('polar-token', '2026-06-01', '2026-06-02', { userId: 'user-1' });
      const activityDay = rows.find(row => row.date === '2026-05-30');
      const sleepDay = rows.find(row => row.date === '2026-06-01');
      const exerciseDay = rows.find(row => row.date === '2026-06-02');
      const pending = rows._polarTransactions;
      const committed = await polar.commitPolarTransactions('polar-token', pending);
      const emptyCommit = await polar.commitPolarTransactions('polar-token', []);

      outcomes.polarRegistrationAndInfo = registered.ok === true
        && registered.alreadyRegistered === false
        && alreadyRegistered.ok === true
        && alreadyRegistered.alreadyRegistered === true
        && noUserInfo.ok === false
        && noUserInfo.error.includes('No userId')
        && info.ok === true
        && info.account.userId === 'user-1'
        && info.account.firstName === 'Polar';
      outcomes.polarRangeTransactions = missingConnectionError?.code === 'needs-reauth'
        && rows.length === 3
        && activityDay?.steps === 777
        && activityDay?.hr_day === 73
        && sleepDay?.sleep_score === 82
        && sleepDay?.rhr === 50
        && exerciseDay?.hrv_day === 38
        && exerciseDay?.hr_day === 90
        && Array.isArray(pending)
        && pending.length === 2
        && JSON.stringify(rows).includes('_polarTransactions') === false;
      outcomes.polarCommits = committed.ok === true
        && committed.committed === 1
        && emptyCommit.ok === true
        && emptyCommit.committed === 0
        && requests.some(req => req.method === 'PUT' && req.url.includes('/activity-transactions/act-1'))
        && requests.some(req => req.method === 'PUT' && req.url.includes('/exercise-transactions/ex-1'));
    } finally {
      window.fetch = originalFetch;
      if (originalDebug == null) localStorage.removeItem('labcharts-debug');
      else localStorage.setItem('labcharts-debug', originalDebug);
    }

    return outcomes;
  }, {
    polarUrl: moduleUrl('/js/wearables-polar.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
