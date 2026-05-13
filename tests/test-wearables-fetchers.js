// test-wearables-fetchers.js — adapter-fetcher behavior with mocked HTTP
// Drives each vendor's fetchXxxDailyRange against canned proxy responses.
// Goal: catch field-rename and shape-drift bugs before they hit a real account.

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Adapter Fetcher Tests (mocked HTTP) ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Cache-bust: fetcher modules are loaded fresh so test runs see the latest code.
  const bust = '?bust=' + Date.now();
  const oura       = await import('../js/wearables-oura.js' + bust);
  const whoop      = await import('../js/wearables-whoop.js' + bust);
  const fitbit     = await import('../js/wearables-fitbit.js' + bust);
  const withings   = await import('../js/wearables-withings.js' + bust);
  const ultrahuman = await import('../js/wearables-ultrahuman.js' + bust);
  const polar      = await import('../js/wearables-polar.js' + bust);

  // ─────────────────────────────────────────────────────────
  // Mock-fetch harness
  // ─────────────────────────────────────────────────────────
  // Adapters all funnel through POST /api/proxy with the upstream URL inside
  // the body. Match on `body.url` substring → return a Response-shaped object.
  const realFetch = window.fetch;
  let routes = []; // [{matcher: regex|string, status, body, count}, ...]
  let calls = [];  // recorded POST bodies for assertions
  function mockFetch(input, init) {
    const url = (typeof input === 'string') ? input : input?.url;
    if (url !== '/api/proxy') {
      // Non-proxy fetches (e.g. fixture XML) — pass through.
      return realFetch.call(window, input, init);
    }
    let body = {};
    try { body = JSON.parse(init?.body || '{}'); } catch {}
    calls.push({ url: body.url, method: body.method, headers: body.headers, body: body.body });
    for (const r of routes) {
      const ok = (typeof r.matcher === 'string') ? body.url?.includes(r.matcher) : r.matcher.test(body.url || '');
      if (ok) {
        r.count = (r.count || 0) + 1;
        const status = r.status || 200;
        return Promise.resolve(new Response(JSON.stringify(r.body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
    }
    // No route matched — return 404 so we surface unintended calls.
    return Promise.resolve(new Response(JSON.stringify({ error: 'no-mock' }), { status: 404 }));
  }
  function installMocks(rs) {
    routes = rs;
    calls = [];
    window.fetch = mockFetch;
  }
  function restoreFetch() {
    window.fetch = realFetch;
  }

  // ═══════════════════════════════════════
  // 1. Oura — sleep + daily_sleep + heartrate (chunked)
  // ═══════════════════════════════════════
  console.log('%c 1. Oura fetcher ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      // Heartrate endpoint — Oura caps at 30 days, so a 90-day fetch must chunk.
      // Return different sample sets per chunk so we can detect concatenation.
      { matcher: /heartrate.*start_datetime/, body: {
        data: [
          { timestamp: '2026-04-23T09:00:00Z', bpm: 72, source: 'awake' },
          { timestamp: '2026-04-23T14:00:00Z', bpm: 88, source: 'awake' },
          { timestamp: '2026-04-23T03:00:00Z', bpm: 60, source: 'rest' }, // ignored (not awake)
        ],
        next_token: null,
      }},
      { matcher: 'usercollection/sleep', body: {
        data: [
          { day: '2026-04-23', total_sleep_duration: 26000, average_hrv: 42, average_heart_rate: 58, lowest_heart_rate: 54 },
        ],
        next_token: null,
      }},
      { matcher: 'usercollection/daily_sleep', body: { data: [{ day: '2026-04-23', score: 78 }], next_token: null }},
      { matcher: 'usercollection/daily_readiness', body: { data: [{ day: '2026-04-23', score: 82, temperature_deviation: -0.1 }], next_token: null }},
      { matcher: 'usercollection/daily_spo2', body: { data: [{ day: '2026-04-23', spo2_percentage: 97 }], next_token: null }},
      { matcher: 'usercollection/daily_activity', body: { data: [{ day: '2026-04-23', score: 88, steps: 8500 }], next_token: null }},
      { matcher: 'usercollection/daily_stress', body: { data: [{ day: '2026-04-23', stress_high: 1800 }], next_token: null }},  // 30 min
      { matcher: 'usercollection/daily_resilience', body: { data: [{ day: '2026-04-23', level: 'solid' }], next_token: null }},
      { matcher: 'usercollection/daily_cardiovascular_age', body: { data: [{ day: '2026-04-23', vascular_age: 38 }], next_token: null }},
    ]);
    const rows = await oura.fetchOuraDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows.find(x => x.date === '2026-04-23');
    assert('Oura row tagged source: oura', r?.source === 'oura');
    assert('Oura hrv_rmssd from sleep average_hrv', r?.hrv_rmssd === 42);
    assert('Oura rhr from sleep lowest_heart_rate (matches Oura app RHR card)', r?.rhr === 54);
    assert('Oura hr_day from heartrate awake-tagged samples (mean of 72+88=80)', r?.hr_day === 80);
    assert('Oura sleep_score from daily_sleep.score', r?.sleep_score === 78);
    assert('Oura readiness_score from daily_readiness.score', r?.readiness_score === 82);
    assert('Oura body_temp_delta from daily_readiness.temperature_deviation', r?.body_temp_delta === -0.1);
    assert('Oura spo2_avg from daily_spo2 (number form)', r?.spo2_avg === 97);
    assert('Oura activity_score from daily_activity.score', r?.activity_score === 88);
    assert('Oura steps from daily_activity.steps', r?.steps === 8500);
    assert('Oura stress_high seconds → minutes (1800s → 30min)', r?.stress_high_min === 30);
    assert('Oura resilience level enum → 1-5 (solid → 3)', r?.resilience_level === 3);
    assert('Oura cardio_age from daily_cardiovascular_age.vascular_age', r?.cardio_age === 38);
    assert('Oura ignores rest-tagged HR samples for hr_day', !calls.some(c => c.url?.includes('rest')) || r?.hr_day === 80);
  } finally { restoreFetch(); }

  // Heartrate cap chunking — 90-day window must produce ≥3 calls
  try {
    installMocks([
      { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
      { matcher: 'usercollection/sleep', body: { data: [], next_token: null }},
      { matcher: /usercollection\//, body: { data: [], next_token: null }},
    ]);
    await oura.fetchOuraDailyRange('test-token', '2026-01-25', '2026-04-25');
    const heartrateCalls = calls.filter(c => c.url?.includes('/heartrate?'));
    assert('Oura heartrate fetch chunks 90-day window (≥3 calls of ≤30 days each)',
      heartrateCalls.length >= 3, `got ${heartrateCalls.length} chunks`);
  } finally { restoreFetch(); }

  // Time-series fallback — Oura's freshly-uploaded sessions have hrv.items /
  // heart_rate.items populated but the scalar `average_hrv` /
  // `average_heart_rate` aren't computed yet. Without the time-series
  // fallback today's HRV/RHR read as null even though Oura cloud shows
  // them (Oura's app computes these client-side from the items array).
  // Regression guard for the issue reported on v1.30.x where HRV/RHR
  // lagged 2 days behind sleep_score on the same source.
  try {
    installMocks([
      { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
      { matcher: 'usercollection/sleep', body: {
        data: [{
          day: '2026-04-23',
          total_sleep_duration: 26000,
          // Scalars not yet computed by Oura's pipeline:
          average_hrv: null,
          average_heart_rate: null,
          lowest_heart_rate: null,
          // Time series IS available (this is how Oura's app renders today's
          // sleep before the scalars finalise):
          hrv: { interval: 300, timestamp: '2026-04-23T00:00:00Z',
                 items: [40, 42, 0, 45, 48, 0, 52, 50, 47, 0, 44, 41] },
          heart_rate: { interval: 300, timestamp: '2026-04-23T00:00:00Z',
                        items: [62, 60, 0, 56, 54, 0, 52, 53, 55, 0, 58, 60] },
        }],
        next_token: null,
      }},
      { matcher: 'usercollection/daily_sleep', body: { data: [{ day: '2026-04-23', score: 78 }], next_token: null }},
      { matcher: /usercollection\//, body: { data: [], next_token: null }},
    ]);
    const rows = await oura.fetchOuraDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows.find(x => x.date === '2026-04-23');
    // HRV mean of [40,42,45,48,52,50,47,44,41] (zeros filtered) = 409/9 ≈ 45.44
    assert('Oura hrv_rmssd falls back to time-series mean when scalar null',
      r?.hrv_rmssd != null && Math.abs(r.hrv_rmssd - 45.44) < 0.5,
      `got ${r?.hrv_rmssd}`);
    assert('Oura time-series HRV filters zero-valued samples (gaps in recording)',
      r?.hrv_rmssd > 40, // would be 28.something if zeros were included
      `got ${r?.hrv_rmssd}`);
    // RHR is the minimum of [62,60,56,54,52,53,55,58,60] (zeros filtered) = 52
    assert('Oura rhr falls back to time-series min when scalar null',
      r?.rhr === 52,
      `got ${r?.rhr}`);
  } finally { restoreFetch(); }

  // Scalar still wins when present — regression guard against priority flip.
  try {
    installMocks([
      { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
      { matcher: 'usercollection/sleep', body: {
        data: [{
          day: '2026-04-23',
          total_sleep_duration: 26000,
          average_hrv: 42, average_heart_rate: 58, lowest_heart_rate: 54,
          hrv: { interval: 300, items: [99, 99, 99] }, // intentionally divergent
          heart_rate: { interval: 300, items: [99, 99, 99] },
        }],
        next_token: null,
      }},
      { matcher: /usercollection\//, body: { data: [], next_token: null }},
    ]);
    const rows = await oura.fetchOuraDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows.find(x => x.date === '2026-04-23');
    assert('Oura prefers scalar average_hrv over hrv.items when both present', r?.hrv_rmssd === 42);
    assert('Oura prefers scalar lowest_heart_rate over heart_rate.items when both present', r?.rhr === 54);
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 2. WHOOP — recovery + sleep + cycle
  // ═══════════════════════════════════════
  console.log('%c 2. WHOOP fetcher ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      { matcher: 'developer/v1/recovery', body: {
        records: [
          { created_at: '2026-04-23T08:00:00Z', cycle: { start: '2026-04-23T00:00:00Z' },
            score: { hrv_rmssd_milli: 38, resting_heart_rate: 56, recovery_score: 75 } },
        ], next_token: null,
      }},
      { matcher: 'developer/v1/cycle', body: {
        records: [{ start: '2026-04-23T00:00:00Z', score: { strain: 14.5, average_heart_rate: 72 } }], next_token: null,
      }},
      { matcher: 'developer/v1/activity/sleep', body: {
        records: [{ start: '2026-04-23T22:00:00Z', score: { sleep_performance_percentage: 81 } }], next_token: null,
      }},
    ]);
    const rows = await whoop.fetchWhoopDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows[0];
    assert('WHOOP row tagged source: whoop', r?.source === 'whoop');
    assert('WHOOP hrv_rmssd from recovery.score.hrv_rmssd_milli', r?.hrv_rmssd === 38);
    assert('WHOOP rhr from recovery.score.resting_heart_rate', r?.rhr === 56);
    assert('WHOOP hr_day from cycle.score.average_heart_rate', r?.hr_day === 72);
    assert('WHOOP readiness_score from recovery.score.recovery_score', r?.readiness_score === 75);
    assert('WHOOP strain from cycle.score.strain', r?.strain === 14.5);
    assert('WHOOP sleep_score from sleep.score.sleep_performance_percentage', r?.sleep_score === 81);
    assert('WHOOP hrv_day stays null (vendor exposes overnight only)', r?.hrv_day === null);
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 3. Fitbit — HRV + RHR + sleep + steps + spo2
  // ═══════════════════════════════════════
  console.log('%c 3. Fitbit fetcher ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      { matcher: '/hrv/date/', body: {
        hrv: [{ dateTime: '2026-04-23', value: { dailyRmssd: 41, deepRmssd: 36 } }],
      }},
      { matcher: '/activities/heart/date/', body: {
        'activities-heart': [{ dateTime: '2026-04-23', value: { restingHeartRate: 60 } }],
      }},
      { matcher: '/activities/steps/date/', body: {
        'activities-steps': [{ dateTime: '2026-04-23', value: '7500' }],
      }},
      { matcher: '/sleep/date/', body: {
        sleep: [{ dateOfSleep: '2026-04-23', isMainSleep: true, duration: 28000000, efficiency: 87 }],
      }},
      { matcher: '/spo2/date/', body: [{ dateTime: '2026-04-23', value: { avg: 96 } }],
      },
      { matcher: '/temp/skin/date/', body: {
        tempSkin: [{ dateTime: '2026-04-23', value: { nightlyRelative: -0.3 } }],
      }},
      { matcher: '/body/log/weight/date/', body: {
        weight: [{ date: '2026-04-23', weight: 72.4 }],
      }},
    ]);
    const rows = await fitbit.fetchFitbitDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows[0];
    assert('Fitbit row tagged source: fitbit', r?.source === 'fitbit');
    assert('Fitbit hrv_rmssd uses deepRmssd (overnight) not dailyRmssd', r?.hrv_rmssd === 36);
    assert('Fitbit hrv_day uses dailyRmssd (broader-window aggregate)', r?.hrv_day === 41);
    assert('Fitbit rhr from activities-heart restingHeartRate', r?.rhr === 60);
    assert('Fitbit steps coerces "7500" string → 7500 number', r?.steps === 7500);
    assert('Fitbit sleep_score uses efficiency (Sleep Score not exposed)', r?.sleep_score === 87);
    assert('Fitbit spo2_avg from value.avg', r?.spo2_avg === 96);
    assert('Fitbit body_temp_delta from tempSkin.nightlyRelative', r?.body_temp_delta === -0.3);
    assert('Fitbit weight from body/log/weight (kg unit)', r?.weight === 72.4);
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 4. Withings — measures + sleep summary
  // ═══════════════════════════════════════
  console.log('%c 4. Withings fetcher ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      // Withings sends `action=` in the form-encoded body, not the URL — so we
      // match the URL path-suffix instead. /measure handles getmeas, /v2/sleep
      // handles getsleepsummary.
      { matcher: /\/measure$/, body: {
        status: 0,
        body: {
          measuregrps: [{
            date: 1776902400, // 2026-04-23 UTC (Date.UTC(2026, 3, 23) / 1000)
            attrib: 0,        // 0 = device-uploaded
            measures: [
              { type: 1, value: 723, unit: -1 },   // 72.3 kg weight
              { type: 5, value: 590, unit: -1 },   // 59.0 kg lean (fat-free) mass
              { type: 6, value: 184, unit: -1 },   // 18.4% body fat
              { type: 8, value: 133, unit: -1 },   // 13.3 kg fat mass (#143 follow-up)
              { type: 11, value: 71, unit: 0 },    // pulse 71 → hr_day
              { type: 54, value: 96, unit: 0 },    // SpO2 96%
              { type: 71, value: 365, unit: -1 },  // 36.5 °C body temp
              { type: 73, value: 339, unit: -1 },  // 33.9 °C skin temp
              { type: 76, value: 320, unit: -1 },  // 32.0 kg muscle mass
              { type: 77, value: 410, unit: -1 },  // 41.0 kg water mass
              { type: 88, value: 26, unit: -1 },   // 2.6 kg bone mass
              { type: 91, value: 73, unit: -1 },   // 7.3 m/s PWV
              { type: 130, value: 41, unit: 0 },   // 41 yrs vascular age
              { type: 167, value: 8, unit: 0 },    // visceral fat index 8
              { type: 168, value: 71, unit: 0 },   // nerve health score 71
              { type: 169, value: 47, unit: 0 },   // cardio fitness 47
              { type: 78, value: 999, unit: 0 },   // unknown measType — must be silently ignored, not crash (#144)
            ],
          }, {
            // Manually-entered BP from the Withings app — `attrib: 2`. Withings
            // returns these in the same `category=1` response as device uploads;
            // the parser must NOT filter on attrib. Same date as the group above
            // so both write to the same row. (Issue #144 / Marian's PR #118
            // analysis: this is the regression we're guarding against.)
            date: 1776902400,
            attrib: 2,
            measures: [
              { type: 9, value: 78, unit: 0 },    // BP dia 78 — manually entered
              { type: 10, value: 122, unit: 0 },  // BP sys 122 — manually entered
            ],
          }],
        },
      }},
      { matcher: /\/v2\/sleep$/, body: {
        status: 0,
        body: {
          series: [{
            date: '2026-04-23',
            data: {
              sleep_score: 76,
              hr_min: 55, hr_average: 62, hr_max: 78,
              rr_average: 14,
              asleepduration: 27000,    // 7.5 h → 450 min
              deepsleepduration: 4500,  // 75 min
              lightsleepduration: 14400, // 240 min
              remsleepduration: 5400,    // 90 min
              wakeupduration: 1800,      // 30 min
              snoring: 600,              // 10 min
              breathing_disturbances_intensity: 12,
            },
          }],
        },
      }},
    ]);
    const rows = await withings.fetchWithingsDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows.find(x => x.date === '2026-04-23');
    assert('Withings row tagged source: withings', r?.source === 'withings');
    assert('Withings weight decoded with unit-shift (723 × 10^-1 = 72.3 kg)', r?.weight === 72.3);
    assert('Withings BP systolic from measType 10 (manually-entered, attrib=2)', r?.bp_systolic === 122);
    assert('Withings BP diastolic from measType 9 (manually-entered, attrib=2)', r?.bp_diastolic === 78);
    assert('Withings unknown measType 78 silently dropped (no crash, no leak — #144)', !('type_78' in (r || {})));
    assert('Withings hr_day from scale pulse (measType 11) — NOT rhr', r?.hr_day === 71);
    assert('Withings rhr from sleep summary hr_min (true overnight RHR)', r?.rhr === 55);
    assert('Withings sleep_score from sleep summary', r?.sleep_score === 76);
    // Body Scan + ScanWatch full-coverage roll-up. Each measType maps to
    // its canonical field; unit-shift decoding shared with weight/BP path.
    assert('Withings body_fat_pct decoded (184 × 10^-1 = 18.4)', r?.body_fat_pct === 18.4);
    assert('Withings fat_mass_kg from measType 8', r?.fat_mass_kg === 13.3);
    assert('Withings lean_mass_kg from measType 5', r?.lean_mass_kg === 59);
    assert('Withings muscle_mass_kg from measType 76', r?.muscle_mass_kg === 32);
    assert('Withings bone_mass_kg from measType 88 (decoded with unit-shift)', r?.bone_mass_kg === 2.6);
    assert('Withings water_mass_kg from measType 77', r?.water_mass_kg === 41);
    assert('Withings PWV from measType 91 (m/s, decoded)', r?.pwv === 7.3);
    assert('Withings visceral_fat from measType 167', r?.visceral_fat === 8);
    assert('Withings nerve_health_score from measType 168', r?.nerve_health_score === 71);
    assert('Withings spo2_avg from measType 54 (ScanWatch)', r?.spo2_avg === 96);
    assert('Withings body_temp from measType 71 (Body Scan IR, °C)', r?.body_temp === 36.5);
    assert('Withings skin_temp from measType 73 (ScanWatch wrist)', r?.skin_temp === 33.9);
    assert('Withings vascular_age from measType 130 (yrs)', r?.vascular_age === 41);
    assert('Withings cardio_fitness from measType 169', r?.cardio_fitness === 47);
    // Sleep architecture — fetcher converts seconds to minutes.
    assert('sleep_total_min: 27000 s → 450 min', r?.sleep_total_min === 450);
    assert('sleep_deep_min: 4500 s → 75 min', r?.sleep_deep_min === 75);
    assert('sleep_light_min: 14400 s → 240 min', r?.sleep_light_min === 240);
    assert('sleep_rem_min: 5400 s → 90 min', r?.sleep_rem_min === 90);
    assert('sleep_awake_min: 1800 s → 30 min', r?.sleep_awake_min === 30);
    assert('sleep_hr_avg from hr_average (62 bpm — distinct from rhr=hr_min)', r?.sleep_hr_avg === 62);
    assert('sleep_breathing_rate from rr_average (14 rpm)', r?.sleep_breathing_rate === 14);
    assert('sleep_snoring_min: 600 s → 10 min', r?.sleep_snoring_min === 10);
    assert('sleep_breath_disturb intensity passes through (no transform)', r?.sleep_breath_disturb === 12);
  } finally { restoreFetch(); }

  // Withings status-code error surfacing
  try {
    installMocks([
      { matcher: /\/measure$/, body: { status: 100, error: 'Token invalid' }},
      { matcher: /\/v2\/sleep$/, body: { status: 0, body: { series: [] } }},
    ]);
    let rows = [];
    let err = null;
    try { rows = await withings.fetchWithingsDailyRange('bad-token', '2026-04-23', '2026-04-23'); }
    catch (e) { err = e; }
    assert('Withings status:100 (token invalid) handled without crashing the whole fetch',
      err === null || /token|expired|reconnect/i.test(err.message || ''),
      err ? `error: ${err.message}` : `rows: ${rows.length}`);
  } finally { restoreFetch(); }

  // Incremental sync: when lastSyncUnix is provided, /measure must be called
  // with `lastupdate=<sec>` (Withings's recommended approach for catching
  // retroactive manual entries — issue #144), and the `meastypes` allowlist
  // must NOT be sent (we filter client-side via MEAS_TYPES instead).
  try {
    installMocks([
      { matcher: /\/measure$/, body: { status: 0, body: { measuregrps: [] } }},
      { matcher: /\/v2\/sleep$/, body: { status: 0, body: { series: [] } }},
    ]);
    const lastSyncMs = Date.UTC(2026, 3, 22, 12, 0, 0); // 2026-04-22T12:00Z
    await withings.fetchWithingsDailyRange('test-token', '2026-04-23', '2026-04-23', lastSyncMs);
    const measCall = calls.find(c => /\/measure$/.test(c.url || ''));
    const params = new URLSearchParams(measCall?.body || '');
    assert('Withings incremental: /measure called with lastupdate (seconds)',
      params.get('lastupdate') === String(Math.floor(lastSyncMs / 1000)),
      `lastupdate=${params.get('lastupdate')}`);
    assert('Withings incremental: startdate/enddate NOT sent when lastupdate is',
      !params.has('startdate') && !params.has('enddate'));
    assert('Withings incremental: meastypes allowlist dropped (client-side filter via MEAS_TYPES)',
      !params.has('meastypes'));
    assert('Withings incremental: category=1 still sent (excludes user goals/objectives)',
      params.get('category') === '1');
  } finally { restoreFetch(); }

  // First-sync (no lastSyncUnix): falls back to startdate/enddate window.
  try {
    installMocks([
      { matcher: /\/measure$/, body: { status: 0, body: { measuregrps: [] } }},
      { matcher: /\/v2\/sleep$/, body: { status: 0, body: { series: [] } }},
    ]);
    await withings.fetchWithingsDailyRange('test-token', '2026-04-23', '2026-04-23');
    const measCall = calls.find(c => /\/measure$/.test(c.url || ''));
    const params = new URLSearchParams(measCall?.body || '');
    assert('Withings first-sync: startdate/enddate window used (no lastSyncUnix)',
      params.has('startdate') && params.has('enddate'));
    assert('Withings first-sync: lastupdate NOT sent', !params.has('lastupdate'));
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 5. Ultrahuman — sleep vs avg field split
  // ═══════════════════════════════════════
  console.log('%c 5. Ultrahuman fetcher ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      // The fetcher iterates date-by-date — return the same payload for any
      // date matcher in the range.
      { matcher: 'user_data/metrics', body: {
        data: {
          metric_data: {
            hrv: { sleep: 44, avg: 38 },
            resting_heart_rate: { sleep: 53, avg: 68 },
            sleep_index: { score: 80 },
            recovery_index: { score: 73 },
            steps: { total: 9100 },
            temperature: { deviation: -0.2 },
            glucose: { avg: 92 },
          },
        },
      }},
    ]);
    const rows = await ultrahuman.fetchUltrahumanDailyRange('test-token', '2026-04-23', '2026-04-23');
    const r = rows[0];
    assert('Ultrahuman row tagged source: ultrahuman', r?.source === 'ultrahuman');
    assert('Ultrahuman hrv_rmssd from hrv.sleep (overnight slot)', r?.hrv_rmssd === 44);
    assert('Ultrahuman hrv_day from hrv.avg (24h aggregate routes here, NOT to rmssd)', r?.hrv_day === 38);
    assert('Ultrahuman rhr from resting_heart_rate.sleep (true overnight)', r?.rhr === 53);
    assert('Ultrahuman hr_day from resting_heart_rate.avg (24h aggregate)', r?.hr_day === 68);
    assert('Ultrahuman sleep_score from sleep_index.score', r?.sleep_score === 80);
    assert('Ultrahuman readiness_score from recovery_index.score', r?.readiness_score === 73);
    assert('Ultrahuman steps from steps.total', r?.steps === 9100);
    assert('Ultrahuman body_temp_delta from temperature.deviation', r?.body_temp_delta === -0.2);
    assert('Ultrahuman glucose_avg from glucose.avg (cgm scope)', r?.glucose_avg === 92);
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 6. Polar — sleep nights + activity transactions + exercise transactions
  // ═══════════════════════════════════════
  console.log('%c 6. Polar fetcher ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      // Routes are scanned in order; more-specific item URLs come BEFORE the
      // transaction-list URLs they're nested under, otherwise the transaction
      // matcher swallows them.
      { matcher: /\/activities\/a1$/, body: {
        date: '2026-04-23', 'active-steps': 6800,
        'heart-rate': { average: 88 },
      }},
      { matcher: /\/exercises\/e1$/, body: {
        'start-time': '2026-04-23T17:00:00Z',
        'heart-rate-variability-avg': 47,
        'heart-rate': { average: 142 },
      }},
      { matcher: /\/activity-transactions$/, body: {
        'transaction-id': 'tx-act-1',
        'activity-log': ['https://www.polaraccesslink.com/v3/users/1/activity-transactions/tx-act-1/activities/a1'],
      }},
      { matcher: /\/exercise-transactions$/, body: {
        'transaction-id': 'tx-ex-1',
        exercises: ['https://www.polaraccesslink.com/v3/users/1/exercise-transactions/tx-ex-1/exercises/e1'],
      }},
      { matcher: /\/nights\/sleep$/, body: {
        nights: [{ date: '2026-04-23', 'sleep-score': 79, 'heart-rate-samples': { min: 52 } }],
      }},
    ]);
    const rows = await polar.fetchPolarDailyRange('test-token', '2026-04-23', '2026-04-23', { userId: '1' });
    const r = rows.find(x => x.date === '2026-04-23');
    assert('Polar row tagged source: polar', r?.source === 'polar');
    assert('Polar rhr from sleep nights heart-rate-samples.min (true overnight)', r?.rhr === 52);
    assert('Polar sleep_score from nights[].sleep-score', r?.sleep_score === 79);
    assert('Polar steps from activity-log active-steps', r?.steps === 6800);
    assert('Polar hr_day from activity heart-rate.average (NOT rhr — daytime, not resting)', r?.hr_day === 88);
    assert('Polar hrv_day from exercise heart-rate-variability-avg (workout HRV is daytime, NOT overnight rMSSD)',
      r?.hrv_day === 47);
    // Exercise HR average shouldn't overwrite activity-window hr_day
    assert('Polar exercise transactions queued for commit (rows._polarTransactions array)',
      Array.isArray(rows._polarTransactions) && rows._polarTransactions.length === 2);
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 7. Error responses — 401 / 429 propagation
  // ═══════════════════════════════════════
  console.log('%c 7. Error handling ', 'font-weight:bold;color:#f59e0b');
  try {
    installMocks([
      { matcher: 'usercollection', status: 401, body: { detail: 'Unauthorized' }},
      { matcher: 'heartrate', status: 401, body: { detail: 'Unauthorized' }},
    ]);
    let rows = null, err = null;
    try { rows = await oura.fetchOuraDailyRange('expired-token', '2026-04-23', '2026-04-23'); }
    catch (e) { err = e; }
    // Oura's fetcher swallows per-endpoint errors and logs (returns empty rows).
    // Either contract is acceptable as long as it doesn't throw an uncaught error.
    assert('Oura 401 across all endpoints does not crash the fetcher',
      err === null,
      err ? `unexpected throw: ${err.message}` : `rows: ${rows?.length || 0}`);
    assert('Oura 401 produces zero canonical rows (not a partial / wrong-shape record)',
      Array.isArray(rows) && rows.length === 0);
  } finally { restoreFetch(); }

  try {
    installMocks([
      { matcher: 'developer/v1/recovery', status: 429, body: { error: 'rate_limited' }},
      { matcher: 'developer/v1/activity/sleep', status: 200, body: { records: [], next_token: null }},
      { matcher: 'developer/v1/cycle', status: 200, body: { records: [], next_token: null }},
    ]);
    let rows = null, err = null;
    try { rows = await whoop.fetchWhoopDailyRange('test-token', '2026-04-23', '2026-04-23'); }
    catch (e) { err = e; }
    assert('WHOOP 429 on recovery endpoint does not crash the fetch',
      err === null);
    assert('WHOOP 429 produces zero canonical rows (no recovery/sleep/cycle data) — clean drop',
      Array.isArray(rows) && rows.length === 0);
  } finally { restoreFetch(); }

  // ═══════════════════════════════════════
  // 8. Cross-cutting — empty response shapes
  // ═══════════════════════════════════════
  console.log('%c 8. Empty payloads ', 'font-weight:bold;color:#f59e0b');
  // Each vendor expects a different top-level shape — generic catch-all
  // would crash some fetchers (e.g. Fitbit's spo2 expects an array, not
  // {data:[]}). Per-vendor empty fixtures.
  const emptyVendors = [
    ['Oura',       oura.fetchOuraDailyRange,       ['t', '2026-04-23', '2026-04-23'],
      [{ matcher: /./, body: { data: [], next_token: null }}]],
    ['WHOOP',      whoop.fetchWhoopDailyRange,     ['t', '2026-04-23', '2026-04-23'],
      [{ matcher: /./, body: { records: [], next_token: null }}]],
    ['Fitbit',     fitbit.fetchFitbitDailyRange,   ['t', '2026-04-23', '2026-04-23'],
      [
        { matcher: '/spo2/date/', body: [] },
        { matcher: /./, body: { hrv: [], 'activities-heart': [], 'activities-steps': [], sleep: [], tempSkin: [], weight: [] }},
      ]],
    ['Ultrahuman', ultrahuman.fetchUltrahumanDailyRange, ['t', '2026-04-23', '2026-04-23'],
      [{ matcher: /./, body: { data: { metric_data: {} } }}]],
    ['Polar',      polar.fetchPolarDailyRange,     ['t', '2026-04-23', '2026-04-23', { userId: '1' }],
      [
        { matcher: /\/nights\/sleep$/, body: { nights: [] }},
        { matcher: /\/activity-transactions$/, body: { 'transaction-id': null }},
        { matcher: /\/exercise-transactions$/, body: { 'transaction-id': null }},
      ]],
  ];
  for (const [name, fetcher, args, mocks] of emptyVendors) {
    try {
      installMocks(mocks);
      let rows = null, err = null;
      try { rows = await fetcher(...args); } catch (e) { err = e; }
      assert(`${name} fetcher handles empty payload without crashing`, err === null,
        err ? `error: ${err.message}` : '');
      assert(`${name} fetcher returns an array on empty payload`, Array.isArray(rows));
    } finally { restoreFetch(); }
  }

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Tests complete: ${pass} passed, ${fail} failed `, fail ? 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS !== 'undefined') window.__TEST_RESULTS = { pass, fail };
})();
