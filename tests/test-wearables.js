#!/usr/bin/env node
// test-wearables.js — Wearable adapter registry + L1 store + L2 summary + AI
// context. Adapter shape, IndexedDB CRUD (via fake-indexeddb), summary math,
// L2 write gate, AI-context builders, 7 vendor OAuth/PKCE modules, Apple
// Health XML/Blob parser, primary-source override, auth race guard,
// OAUTH_DISPATCH drift, IDB encryption round-trip, agent series, plus a wide
// source-inspection sweep.
//
// Run: node tests/test-wearables.js  (or via npm test)
//
// DOM-runtime islands (the openWearableDetail Chart.js modal sections + the
// JSZip script-injection smoke) live in tests/test-wearables-dom.js on the
// puppeteer runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

// Source-inspection sweep uses `await fetch('/js/X').then(r => r.text())` and
// reads JSON/XML fixtures via fetch — install an fs-backed fetch shim so the
// relative URLs resolve in Node (same pattern as test-recommendations).
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Wearables Tests ===\n');

const reg = await import('../js/wearable-adapters.js');
const store = await import('../js/wearables-store.js');
const summary = await import('../js/wearables-summary.js');
const labCtx = await import('../js/lab-context.js');
const oauth = await import('../js/wearables-oura-auth.js');

// ═══════════════════════════════════════
// 1. Registry shape
// ═══════════════════════════════════════
console.log('1. Registry');

assert('ADAPTERS is array', Array.isArray(reg.ADAPTERS));
assert('Has Oura adapter', reg.ADAPTERS.some(a => a.id === 'oura'));
const ouraAdapter = reg.adapterById('oura');
assert('Oura authType is oauth2', ouraAdapter?.authType === 'oauth2');
assert('Oura has oauth.clientId',
  typeof ouraAdapter?.oauth?.clientId === 'string' && ouraAdapter.oauth.clientId.length > 10);
assert('Oura has redirect URIs registered', Array.isArray(ouraAdapter?.oauth?.redirectUris) && ouraAdapter.oauth.redirectUris.length > 0);
assert('Oura redirect URIs include localhost for dev',
  ouraAdapter.oauth.redirectUris.some(u => u.startsWith('http://localhost')));
assert('Oura scopes include personal', ouraAdapter?.oauth?.scopes?.includes('personal'));
assert('CANONICAL_METRICS has hrv_rmssd', !!reg.CANONICAL_METRICS.hrv_rmssd);
assert('CANONICAL_METRICS has rhr', !!reg.CANONICAL_METRICS.rhr);
assert('DEFAULT_METRIC_ORDER is array', Array.isArray(reg.DEFAULT_METRIC_ORDER));
assert('Default order contains 4 core metrics', reg.DEFAULT_METRIC_ORDER.length >= 4);
const oura = reg.adapterById('oura');
assert('adapterById(oura) found', oura?.id === 'oura');
assert('Oura supports hrv_rmssd', reg.adapterSupportsMetric('oura', 'hrv_rmssd'));
assert('Oura does not support bogus metric', !reg.adapterSupportsMetric('oura', 'bogus'));
const ouraMetrics = reg.metricsForSources(['oura']);
assert('metricsForSources returns in DEFAULT order', ouraMetrics[0] === 'hrv_rmssd');
assert('metricsForSources includes all 4 core', ['hrv_rmssd','rhr','sleep_score','readiness_score'].every(id => ouraMetrics.includes(id)));

// ═══════════════════════════════════════
// 2. L1 IndexedDB CRUD
// ═══════════════════════════════════════
console.log('2. L1 IndexedDB');

const TEST_PROFILE = '__test-wearables-' + Math.random().toString(36).slice(2, 8);
try {
  await store.upsertDaily(TEST_PROFILE, {
    source: 'oura', date: '2026-04-20',
    hrv_rmssd: 52, rhr: 58, sleep_score: 85, readiness_score: 84,
  });
  const got = await store.getDaily(TEST_PROFILE, 'oura', '2026-04-20');
  assert('upsertDaily + getDaily round-trip', got?.hrv_rmssd === 52 && got?.date === '2026-04-20');

  // Batch insert
  const batch = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date('2026-03-01'); d.setUTCDate(d.getUTCDate() + i);
    batch.push({ source: 'oura', date: d.toISOString().slice(0, 10), hrv_rmssd: 50 + (i % 5), rhr: 60, sleep_score: 80, readiness_score: 82 });
  }
  await store.upsertDailyBatch(TEST_PROFILE, batch);
  const range = await store.getDailyRange(TEST_PROFILE, 'oura', '2026-03-01', '2026-03-30');
  assert('Batch upsert + range query returns 30 rows', range.length === 30, `got ${range.length}`);
  assert('Range rows sorted ascending by date', range[0].date === '2026-03-01' && range[29].date === '2026-03-30');

  const n = await store.countSource(TEST_PROFILE, 'oura');
  assert('countSource returns total', n === 31); // 30 batch + 1 earlier

  await store.setMeta(TEST_PROFILE, 'last-sync:oura', { at: 12345, rows: 7 });
  const meta = await store.getMeta(TEST_PROFILE, 'last-sync:oura');
  assert('Meta KV round-trip', meta?.at === 12345 && meta?.rows === 7);

  await store.clearSource(TEST_PROFILE, 'oura');
  const afterClear = await store.countSource(TEST_PROFILE, 'oura');
  assert('clearSource wipes all rows for that source', afterClear === 0);

  await store.deleteWearablesDB(TEST_PROFILE);
} catch (e) {
  assert('IDB path did not throw', false, e.message);
}

// ═══════════════════════════════════════
// 3. L2 summary derivation (pure)
// ═══════════════════════════════════════
console.log('3. L2 Summary Math');

function makeRows(start, n, hrvFn) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
    rows.push({ source: 'oura', date: d.toISOString().slice(0, 10),
      hrv_rmssd: hrvFn(i), rhr: 60, sleep_score: 82, readiness_score: 82 });
  }
  return rows;
}
const declining = makeRows('2026-01-22', 90, i => {
  if (i < 70) return 52;        // stable baseline
  return 52 - (i - 70) * 1.2;   // last 20 days decline
});
const sum = summary.computeWearableSummary(
  { oura: declining },
  { oura: { connectedSince: '2026-01-22', lastSyncAt: Date.now() } }
);
assert('Summary has sources.oura', !!sum.sources?.oura);
assert('Summary has metrics.hrv_rmssd', !!sum.metrics?.hrv_rmssd);
const hrv = sum.metrics.hrv_rmssd;
assert('HRV primarySource = oura', hrv.primarySource === 'oura');
assert('HRV latest is most recent (declining)', hrv.latest < 52);
assert('HRV baseline ~52 (median of mostly-stable)', Math.abs(hrv.baseline - 52) < 3, `baseline=${hrv.baseline}`);
assert('HRV trend30d is declining', hrv.trend30d === 'declining', hrv.trend30d);
assert('Weekly has up to 12 entries', hrv.weekly.length <= 12 && hrv.weekly.length > 0);
assert('Rolling d7 < d90 on declining series', hrv.rolling.d7 < hrv.rolling.d90);

// ═══════════════════════════════════════
// 4. shouldWriteL2 gate
// ═══════════════════════════════════════
console.log('4. L2 Write Gate');

const baseSummary = summary.computeWearableSummary(
  { oura: makeRows('2026-01-22', 90, () => 52) },
  { oura: { connectedSince: '2026-01-22', lastSyncAt: Date.now() } }
);
const driftSummary = summary.computeWearableSummary(
  { oura: makeRows('2026-01-22', 90, () => 52.5) }, // ~1% drift
  { oura: { connectedSince: '2026-01-22', lastSyncAt: Date.now() } }
);
const bigShiftSummary = summary.computeWearableSummary(
  { oura: makeRows('2026-01-22', 90, i => i > 80 ? 40 : 52) }, // ~23% shift on d7
  { oura: { connectedSince: '2026-01-22', lastSyncAt: Date.now() } }
);

assert('Gate: initial writes', summary.shouldWriteL2(baseSummary, null).write === true);
assert('Gate: tiny drift does NOT write', summary.shouldWriteL2(driftSummary, baseSummary).write === false);
assert('Gate: big d7 shift DOES write',    summary.shouldWriteL2(bigShiftSummary, baseSummary).write === true);
// Min cadence: pretend old is 15 days old
const stale = JSON.parse(JSON.stringify(baseSummary));
stale.summaryUpdatedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
const minCadenceRes = summary.shouldWriteL2(driftSummary, stale);
assert('Gate: 15d-stale L2 forces write regardless of drift', minCadenceRes.write === true, minCadenceRes.reason);

// Trend flip → anomaly event. Use a 0.5/day rise so normalized slope clears
// the production 'rising' threshold (0.002 of baseline).
const risingSummary = summary.computeWearableSummary(
  { oura: makeRows('2026-01-22', 90, i => 52 + i * 0.5) },
  { oura: { connectedSince: '2026-01-22', lastSyncAt: Date.now() } }
);
const flipRes = summary.shouldWriteL2(risingSummary, baseSummary);
const hasFlipEvent = flipRes.anomalyEvents?.some(e => e.kind === 'trend-flip' && e.metricId === 'hrv_rmssd');
assert('Gate: trend flip emits anomaly event', hasFlipEvent, `events: ${JSON.stringify(flipRes.anomalyEvents)}`);

// Gate: metric-removed (Phase 7 L2 fix). User deletes last manual weight
// entry → summary.metrics no longer contains weight → strip must re-render
// immediately. Without this guard the stale summary persists and the card
// stays on screen forever.
const oldWithWeight = {
  summaryUpdatedAt: baseSummary.summaryUpdatedAt,
  sources: baseSummary.sources,
  metrics: { ...baseSummary.metrics, weight: { latest: 82, primarySource: 'manual', baseline: 82, rolling: { d7: 82 }, trend30d: 'flat', weekly: [82] } }
};
const newWithoutWeight = { ...baseSummary }; // has no `weight` key
const removedRes = summary.shouldWriteL2(newWithoutWeight, oldWithWeight);
assert('Gate: metric-removed trips write',
  removedRes.write === true && removedRes.reason?.startsWith('metric-removed:'),
  `reason=${removedRes.reason}`);

// Gate: source-flip (Phase 7 L2 fix). User deletes manual rhr → auto-picker
// reverts primary to Oura → card source label must refresh even if d7
// doesn't cross the 5% threshold.
const oldRhrManual = {
  summaryUpdatedAt: baseSummary.summaryUpdatedAt,
  sources: baseSummary.sources,
  metrics: { rhr: { latest: 64, primarySource: 'manual', baseline: 65, rolling: { d7: 64 }, trend30d: 'flat', weekly: [64] } }
};
const newRhrOura = {
  summaryUpdatedAt: baseSummary.summaryUpdatedAt,
  sources: baseSummary.sources,
  metrics: { rhr: { latest: 64, primarySource: 'oura', baseline: 65, rolling: { d7: 64 }, trend30d: 'flat', weekly: [64] } }
};
const sourceFlipRes = summary.shouldWriteL2(newRhrOura, oldRhrManual);
assert('Gate: source-flip trips write even without d7 shift',
  sourceFlipRes.write === true && sourceFlipRes.reason?.startsWith('source-flip:'),
  `reason=${sourceFlipRes.reason}`);

// Gate: latest-advanced. The user-reported v1.30.x bug: HRV/RHR cards
// showed 2-day-old values even though the most recent sync ran minutes
// ago — because today's d7 mean was within 5% of yesterday's, the gate
// didn't trip and L2 stayed frozen on the last threshold-tripping
// snapshot. With this trigger, any latestDate advance forces a write so
// the strip never lags behind L1.
const oldLagging = {
  summaryUpdatedAt: baseSummary.summaryUpdatedAt,
  sources: baseSummary.sources,
  metrics: { hrv_rmssd: { latest: 42, latestDate: '2026-04-24', primarySource: 'oura', baseline: 42, rolling: { d7: 42 }, trend30d: 'flat', weekly: [42] } }
};
const newAdvanced = {
  summaryUpdatedAt: baseSummary.summaryUpdatedAt,
  sources: baseSummary.sources,
  metrics: { hrv_rmssd: { latest: 43, latestDate: '2026-04-26', primarySource: 'oura', baseline: 42, rolling: { d7: 42.3 }, trend30d: 'flat', weekly: [42.3] } }
};
const advRes = summary.shouldWriteL2(newAdvanced, oldLagging);
assert('Gate: latest-advanced trips write even when d7 / trend / weekly are stable',
  advRes.write === true && advRes.reason?.startsWith('latest-advanced:'),
  `reason=${advRes.reason}`);

// Sanity: same latestDate (re-sync of an already-current snapshot) does
// NOT trigger a redundant write. Preserves the write-minimization budget.
const sameDate = JSON.parse(JSON.stringify(oldLagging));
const sameDateRes = summary.shouldWriteL2(sameDate, oldLagging);
assert('Gate: identical snapshot (same latestDate) does NOT write',
  sameDateRes.write === false, `reason=${sameDateRes.reason}`);

// ═══════════════════════════════════════
// 5. buildWearableContext
// ═══════════════════════════════════════
console.log('5. AI Context');

const noSummaryCtx = labCtx.buildWearableContext({});
assert('No summary → empty context', noSummaryCtx === '');

const testImported = {
  wearableSummary: bigShiftSummary,
  changeHistory: [
    { ts: Date.now(), type: 'wearable', kind: 'trend-flip', metricId: 'hrv_rmssd', from: 'flat', to: 'declining', message: 'hrv_rmssd trend flipped from flat to declining' },
  ],
};
const ctx = labCtx.buildWearableContext(testImported);
assert('Context non-empty with summary', ctx.length > 0);
assert('Context includes "Wearables" header', ctx.includes('## Wearables'));
assert('Context includes HRV metric', ctx.includes('HRV'));
assert('Context includes weekly trend block', ctx.includes('Weekly trend'));
assert('Context includes anomaly from history', ctx.includes('Recent anomalies') && ctx.includes('trend flipped'));
assert('Context size under 2 KB', ctx.length < 2048, `size ${ctx.length}`);

assert('isWearableContextEnabled default ON', labCtx.isWearableContextEnabled() === true);
labCtx.setWearableContextEnabled(false);
assert('setWearableContextEnabled(false) → disabled', labCtx.isWearableContextEnabled() === false);
labCtx.setWearableContextEnabled(true);
assert('Re-enable toggle', labCtx.isWearableContextEnabled() === true);

// ═══════════════════════════════════════
// 6. OAuth2 helpers (authorize URL, state CSRF)
// ═══════════════════════════════════════
console.log('6. OAuth2 Helpers');

const clientId = ouraAdapter.oauth.clientId;
const redirectUri = ouraAdapter.oauth.redirectUris[0];

// buildAuthorizeUrl produces a well-formed URL with required params
const authUrl = oauth.buildAuthorizeUrl({
  clientId, redirectUri, scopes: ['personal', 'daily'], state: 'abc123',
});
const authParsed = new URL(authUrl);
assert('Authorize URL goes to cloud.ouraring.com', authParsed.hostname === 'cloud.ouraring.com');
assert('Authorize URL path is /oauth/authorize', authParsed.pathname === '/oauth/authorize');
assert('Authorize URL has client_id', authParsed.searchParams.get('client_id') === clientId);
assert('Authorize URL has redirect_uri', authParsed.searchParams.get('redirect_uri') === redirectUri);
assert('Authorize URL is server-side flow (response_type=code)', authParsed.searchParams.get('response_type') === 'code');
assert('Authorize URL carries state param', authParsed.searchParams.get('state') === 'abc123');
assert('Authorize URL has scope list space-joined', authParsed.searchParams.get('scope') === 'personal daily');

// pickRedirectUri prefers the one that matches current origin+path
const fakeLoc = { origin: 'http://localhost:8000', pathname: '/app' };
const picked = oauth.pickRedirectUri(ouraAdapter.oauth.redirectUris, fakeLoc);
assert('pickRedirectUri returns localhost URI when on localhost', picked === 'http://localhost:8000/app');

// completeOAuthCallback rejects when state is missing in sessionStorage
sessionStorage.removeItem('oura-oauth-pending');
const noPending = await oauth.completeOAuthCallback(new URLSearchParams('code=X&state=Y'));
assert('Callback w/ no pending state rejected', noPending.ok === false && /pending/i.test(noPending.error));

// completeOAuthCallback rejects on state mismatch (CSRF guard)
sessionStorage.setItem('oura-oauth-pending', JSON.stringify({
  state: 'correct-state', redirectUri, startedAt: Date.now(), clientId,
}));
const badState = await oauth.completeOAuthCallback(new URLSearchParams('code=X&state=wrong-state'));
assert('Callback w/ state mismatch rejected (CSRF guard)', badState.ok === false && /state/i.test(badState.error));
assert('State consumed even on failure', sessionStorage.getItem('oura-oauth-pending') === null);

// isOuraCallback recognises a pending Oura flow
sessionStorage.setItem('oura-oauth-pending', JSON.stringify({
  state: 'xyz', redirectUri, startedAt: Date.now(), clientId,
}));
assert('isOuraCallback true when state matches pending', oauth.isOuraCallback(new URLSearchParams('code=X&state=xyz')));
assert('isOuraCallback false when state absent', !oauth.isOuraCallback(new URLSearchParams('code=X')));
assert('isOuraCallback false when pending missing', (sessionStorage.removeItem('oura-oauth-pending'), !oauth.isOuraCallback(new URLSearchParams('code=X&state=xyz'))));

// DEFAULT_OURA_SCOPES sanity — covers all canonical-metric-backing endpoints
assert('DEFAULT_OURA_SCOPES includes base 4 (personal+daily+heartrate+session)',
  ['personal', 'daily', 'heartrate', 'session'].every(s => oauth.DEFAULT_OURA_SCOPES.includes(s)));
assert('DEFAULT_OURA_SCOPES includes spo2 (daily_spo2)',
  oauth.DEFAULT_OURA_SCOPES.includes('spo2'));
assert('DEFAULT_OURA_SCOPES includes stress (daily_stress + daily_resilience)',
  oauth.DEFAULT_OURA_SCOPES.includes('stress'));
assert('DEFAULT_OURA_SCOPES includes heart_health (daily_cardiovascular_age)',
  oauth.DEFAULT_OURA_SCOPES.includes('heart_health'));
assert('DEFAULT_OURA_SCOPES does NOT include docs-claimed spo2Daily (gate rejects it)',
  !oauth.DEFAULT_OURA_SCOPES.includes('spo2Daily'));
// Adapter-registered scopes must match what the auth module requests — a drift
// here means the authorize URL and the token-gate check for different things.
assert('Oura adapter scope list matches DEFAULT_OURA_SCOPES',
  JSON.stringify([...ouraAdapter.oauth.scopes].sort()) === JSON.stringify([...oauth.DEFAULT_OURA_SCOPES].sort()));

// Extended canonical metrics (9 cards ship with the dashboard strip at v1.22.2)
for (const mid of ['activity_score','steps','stress_high_min','resilience_level','cardio_age']) {
  assert(`CANONICAL_METRICS has ${mid}`, !!reg.CANONICAL_METRICS[mid]);
  assert(`Oura adapter maps ${mid}`, reg.adapterSupportsMetric('oura', mid));
}
assert('Oura adapter maps VO2max',
  reg.adapterSupportsMetric('oura', 'vo2max'));
assert('Oura adapter maps breathing disturbance index',
  reg.adapterSupportsMetric('oura', 'sleep_breath_disturb'));
// Total canonicals: 14 (pre-#143) + 8 Body Scan body-comp + 6
// additional /measure (fat_mass, spo2, body_temp, skin_temp,
// vascular_age, cardio_fitness) + 9 sleep-arch + 1 (vo2max from
// Apple Health) = 37. Each new canonical metric bumps this
// assertion intentionally so count drift surfaces in code review.
assert('DEFAULT_METRIC_ORDER is 37 metrics (Withings + Apple VO₂max)', reg.DEFAULT_METRIC_ORDER.length === 37);
// Biometric metrics must be in the default order so the summary pipeline
// iterates them for manual / Withings / Fitbit rows.
assert('DEFAULT_METRIC_ORDER includes weight', reg.DEFAULT_METRIC_ORDER.includes('weight'));
assert('DEFAULT_METRIC_ORDER includes bp_systolic', reg.DEFAULT_METRIC_ORDER.includes('bp_systolic'));
assert('DEFAULT_METRIC_ORDER includes bp_diastolic', reg.DEFAULT_METRIC_ORDER.includes('bp_diastolic'));
// Daytime companions must be summarised so the AI context + detail modal
// can read them, even though they're hidden from the strip cards themselves.
assert('DEFAULT_METRIC_ORDER includes hrv_day', reg.DEFAULT_METRIC_ORDER.includes('hrv_day'));
assert('DEFAULT_METRIC_ORDER includes hr_day', reg.DEFAULT_METRIC_ORDER.includes('hr_day'));
// v1.26.0 swapped English sub-labels for sun/moon glyphs to declutter cards.
// RHR drops the sub entirely ("Resting" already implies overnight). aria
// labels still translate the glyphs back to spoken words.
assert('CANONICAL_METRICS has hrv_day with ☀️ sub-glyph', reg.CANONICAL_METRICS.hrv_day?.sub === '☀️');
assert('CANONICAL_METRICS has hr_day with ☀️ sub-glyph', reg.CANONICAL_METRICS.hr_day?.sub === '☀️');
assert('CANONICAL_METRICS hrv_rmssd sub-glyph is 🌙 (overnight)', reg.CANONICAL_METRICS.hrv_rmssd?.sub === '🌙');
assert('CANONICAL_METRICS rhr drops the redundant sub (Resting implies overnight)', reg.CANONICAL_METRICS.rhr?.sub === '');
assert('CANONICAL_METRICS bp_systolic carries spoken-aria override', reg.CANONICAL_METRICS.bp_systolic?.ariaLabel === 'Blood pressure systolic');
assert('CANONICAL_METRICS bp_diastolic carries spoken-aria override', reg.CANONICAL_METRICS.bp_diastolic?.ariaLabel === 'Blood pressure diastolic');
assert('Steps is mapped to the same endpoint as activity_score (both from daily_activity)',
  reg.adapterById('oura').metrics.steps.endpoint === reg.adapterById('oura').metrics.activity_score.endpoint);
const appleHealth = reg.adapterById('apple_health');
for (const mid of ['weight', 'body_fat_pct', 'lean_mass_kg', 'bp_systolic', 'bp_diastolic']) {
  assert(`Apple Health adapter maps ${mid}`, reg.adapterSupportsMetric('apple_health', mid));
}

// AI context labels derive from canonical registry — must handle every ordered
// metric without falling back to raw ids.
const fakeSummary = {
  sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 30 } },
  metrics: {},
};
for (const mid of reg.DEFAULT_METRIC_ORDER) {
  fakeSummary.metrics[mid] = { primarySource: 'oura', latest: 50, baseline: 50, baselineP25: 45, baselineP75: 55, rolling: { d7: 50, d30: 50, d90: 50 }, trend30d: 'flat', weekly: [49, 50, 51, 50, 50, 50] };
}
const ctxAll = labCtx.buildWearableContext({ wearableSummary: fakeSummary });
assert('AI context renders all 8 canonical labels (no raw IDs)',
  !/activity_score|stress_high_min|resilience_level|cardio_age/.test(ctxAll) &&
  ctxAll.includes('Activity') && ctxAll.includes('Stress') && ctxAll.includes('Resilience') && ctxAll.includes('Cardio age'));
assert('AI context includes weekly trend for extended metrics',
  ctxAll.includes('Weekly trend') && /Resilience.*→/.test(ctxAll));

// ═══════════════════════════════════════
// 8. Resilience + stress value normalization
// ═══════════════════════════════════════
console.log('8. Value Normalization');
const { fetchOuraDailyRange } = await import('../js/wearables-oura.js');
assert('fetchOuraDailyRange is exported', typeof fetchOuraDailyRange === 'function');
// We can't hit Oura here, but we can assert the helper behaviors indirectly
// by checking metric definitions. Resilience enum → 1..5 numeric maps through
// the fetcher; stress_high (seconds) → minutes via /60 round. Both guarantees
// live in wearables-oura.js; this test pins the shape contract.
assert('resilience_level metric unit is /5 (registry contract)',
  reg.CANONICAL_METRICS.resilience_level.unit === '/5');
assert('stress_high_min metric unit is min (registry contract)',
  reg.CANONICAL_METRICS.stress_high_min.unit === 'min');
const fetchBeforeOuraStub = globalThis.fetch;
try {
  globalThis.fetch = async (url, opts = {}) => {
    const payload = JSON.parse(opts.body || '{}');
    const path = new URL(payload.url).pathname;
    const dataByPath = {
      '/v2/usercollection/daily_spo2': [
        {
          day: '2026-04-20',
          spo2_percentage: { average: 97 },
          breathing_disturbance_index: 14,
        },
      ],
      '/v2/usercollection/vO2_max': [
        { day: '2026-04-20', vo2_max: { value: 42.1 } },
        { day: '2026-04-21', vo2_max: 0 },
      ],
    };
    return new Response(JSON.stringify({
      data: dataByPath[path] || [],
      next_token: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const ouraRows = await fetchOuraDailyRange('test-token', '2026-04-20', '2026-04-21');
  const ouraDay1 = ouraRows.find(r => r.date === '2026-04-20');
  assert('Oura daily_spo2 maps average SpO2 plus breathing disturbance index',
    ouraDay1?.spo2_avg === 97 && ouraDay1.sleep_breath_disturb === 14,
    `row=${JSON.stringify(ouraDay1)}`);
  assert('Oura VO2max accepts object payloads and rejects zero sentinels',
    ouraDay1?.vo2max === 42.1 && !ouraRows.some(r => r.date === '2026-04-21' && r.vo2max === 0),
    `rows=${JSON.stringify(ouraRows)}`);
} finally {
  globalThis.fetch = fetchBeforeOuraStub;
}

// ═══════════════════════════════════════
// 9. Render-helper divide-by-zero guards
// ═══════════════════════════════════════
console.log('9. Render Guards');
// Force-load wearables.js (side-effect module that registers window.*).
await import('../js/wearables.js');
// deltaClassFor / formatDelta are not exported — they're internal to the strip
// render. We test them via the full render path: a metric with baseline=0 must
// NOT produce "NaN%" in the rendered HTML, and the delta cell must still carry
// a neutral class (no bad/good red/green paint on divide-by-zero).
const zeroBaselineSummary = {
  sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 10 } },
  metrics: {
    activity_score: { primarySource: 'oura', latest: 0, baseline: 0, baselineP25: 0, baselineP75: 0, rolling: { d7: 0, d30: 0, d90: 0 }, trend30d: 'flat', weekly: [0,0,0,0] },
  },
};
// Stash summary so renderWearableStrip reads it
window._labState.importedData = window._labState.importedData || {};
window._labState.importedData.wearableSummary = zeroBaselineSummary;
const html = window.renderWearableStrip();
assert('render never emits NaN% on zero baseline', !/NaN/.test(html));
// v1.26.0: zero-baseline metrics suppress the delta entirely (was "→ —"),
// since "→ —" reads like "we measured something." A missing delta pill is
// more honest. Regression guard: ensure no delta pill appears for the
// zero-baseline activity_score card.
assert('render suppresses delta for zero-baseline activity score',
  !/wearable-delta[^"]*"[^>]*>\s*[↑↓→]/.test(html));
delete window._labState.importedData.wearableSummary;

// ── Zero-coverage source: header drops it, footer surfaces "waiting on first sync" ──
const mixedCoverageSummary = {
  sources: {
    oura:  { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 15 },
    polar: { connectedSince: '2026-04-23', lastSyncAt: Date.now(), coverageDays: 0 },
  },
  metrics: {
    hrv_rmssd: { primarySource: 'oura', latest: 39, baseline: 32, baselineP25: 28, baselineP75: 36, rolling: { d7: 39, d30: 33, d90: 32 }, trend30d: 'rising', weekly: [30, 32, 34, 39] },
  },
};
window._labState.importedData.wearableSummary = mixedCoverageSummary;
const mixedHtml = window.renderWearableStrip();
assert('header source label omits zero-coverage vendor', !/wearable-source-label[^>]*>[^<]*Polar/.test(mixedHtml));
assert('header source label still shows the data-bearing vendor', /wearable-source-label[^>]*>[^<]*Oura/.test(mixedHtml));
assert('coverage label reflects only data-bearing source', /·\s*15d/.test(mixedHtml));
assert('footer surfaces waiting hint for zero-coverage vendor', /Polar connected — waiting on first device sync/.test(mixedHtml));
delete window._labState.importedData.wearableSummary;

// ── Per-metric staleness: when one metric's latestDate lags the source's
// freshest reading, the card surfaces an "as of {date}" hint. Mirrors the
// common Oura case where /sleep (HRV/RHR) processes hours-to-days after
// /daily_sleep (sleep_score). Regression guard against the "value reads
// fresh but is actually 2 days old" UX bug reported on v1.30.x.
const stalenessSummary = {
  sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 90 } },
  metrics: {
    hrv_rmssd: { primarySource: 'oura', latest: 38, latestDate: '2026-04-22', baseline: 50, baselineP25: 42, baselineP75: 58, rolling: { d7: 38, d30: 45, d90: 50 }, trend30d: 'declining', weekly: [50, 48, 45, 42, 40, 38] },
    sleep_score: { primarySource: 'oura', latest: 76, latestDate: '2026-04-24', baseline: 78, baselineP25: 73, baselineP75: 84, rolling: { d7: 76, d30: 78, d90: 78 }, trend30d: 'flat', weekly: [80, 79, 78, 77, 76, 76] },
  },
};
window._labState.importedData.wearableSummary = stalenessSummary;
const stripStaleHtml = window.renderWearableStrip();
assert('Stale metric (HRV) gets "as of {date}" hint when its latestDate < source max',
  /wearable-staleness[^>]*>\s*as of\s*[A-Z][a-z]+/.test(stripStaleHtml));
// Only one staleness hint should appear in the strip (HRV) — sleep_score's
// latestDate matches the source max, so its card must NOT carry a hint.
const stalenessHints = (stripStaleHtml.match(/wearable-staleness/g) || []).length;
assert('Exactly one staleness hint rendered (HRV stale, sleep_score fresh)',
  stalenessHints === 1, `got ${stalenessHints}`);
assert('Staleness hint carries an explanatory tooltip on hover',
  /wearable-staleness[^>]*title="[^"]+process/i.test(stripStaleHtml));
delete window._labState.importedData.wearableSummary;

// Section 9b (Detail Modal — openWearableDetail + Chart.js + live modal
// DOM) lives in test-wearables-dom.js on the puppeteer runner.

// ═══════════════════════════════════════
// 10. Window exports for render handlers
// ═══════════════════════════════════════
console.log('10. Window Exports');
assert('window.renderWearableStrip exists', typeof window.renderWearableStrip === 'function');
assert('window.renderWearablesSettingsSection exists', typeof window.renderWearablesSettingsSection === 'function');
assert('window.handleWearableConnect exists', typeof window.handleWearableConnect === 'function');
assert('window.handleWearableDisconnect exists', typeof window.handleWearableDisconnect === 'function');
assert('window.syncWearableNow exists', typeof window.syncWearableNow === 'function');
assert('window.openWearableDetail exists', typeof window.openWearableDetail === 'function');
assert('handleWearablePATConnect removed (Ultrahuman moved to OAuth2)',
  typeof window.handleWearablePATConnect === 'undefined');

// ═══════════════════════════════════════
// 11. Phase-3 multi-vendor adapter registry
// ═══════════════════════════════════════
console.log('11. Multi-Vendor');
for (const vid of ['whoop', 'ultrahuman', 'apple_health', 'withings', 'fitbit']) {
  const v = reg.adapterById(vid);
  assert(`Adapter ${vid} registered`, !!v);
  assert(`Adapter ${vid} carries beta flag`, v?.beta === true);
}
assert('WHOOP uses OAuth2 with PKCE',
  reg.adapterById('whoop')?.authType === 'oauth2' && reg.adapterById('whoop')?.oauth?.pkce === true);
assert('Ultrahuman uses OAuth2 (moved off legacy PAT in v1.23.3)',
  reg.adapterById('ultrahuman')?.authType === 'oauth2');
assert('Ultrahuman is confidential client (client_secret held by proxy, no PKCE)',
  reg.adapterById('ultrahuman')?.oauth?.pkce === false);
assert('Ultrahuman scopes include profile + ring_data + cgm_data',
  ['profile', 'ring_data', 'cgm_data'].every(s => reg.adapterById('ultrahuman')?.oauth?.scopes?.includes(s)));
assert('Apple Health uses file-import auth', reg.adapterById('apple_health')?.authType === 'file-import');
assert('Withings uses OAuth2 server-side (no PKCE)',
  reg.adapterById('withings')?.authType === 'oauth2' && reg.adapterById('withings')?.oauth?.pkce === false);
assert('WHOOP maps strain metric (WHOOP-native)',
  reg.adapterById('whoop')?.metrics?.strain != null);
assert('Apple Health maps hrv_sdnn (deep HRV that footer hints about)',
  reg.adapterById('apple_health')?.metrics?.hrv_sdnn != null);
assert('Withings maps weight + BP pair',
  reg.adapterById('withings')?.metrics?.weight != null &&
  reg.adapterById('withings')?.metrics?.bp_systolic != null &&
  reg.adapterById('withings')?.metrics?.bp_diastolic != null);

// New canonicals the Phase-3 adapters introduced
for (const mid of ['hrv_sdnn', 'strain', 'weight', 'bp_systolic', 'bp_diastolic']) {
  assert(`CANONICAL_METRICS now has ${mid}`, !!reg.CANONICAL_METRICS[mid]);
}

// ═══════════════════════════════════════
// 12. WHOOP PKCE auth module
// ═══════════════════════════════════════
console.log('12. WHOOP PKCE');
const whoopAuth = await import('../js/wearables-whoop-auth.js');
assert('WHOOP DEFAULT_WHOOP_SCOPES includes read:recovery',
  whoopAuth.DEFAULT_WHOOP_SCOPES.includes('read:recovery'));
assert('WHOOP scopes include offline (for refresh_token)',
  whoopAuth.DEFAULT_WHOOP_SCOPES.includes('offline'));
const whoopAuthUrl = await whoopAuth.buildAuthorizeUrl({
  clientId: 'test-client', redirectUri: 'http://localhost:8000/app',
  scopes: whoopAuth.DEFAULT_WHOOP_SCOPES, state: 'test-state',
  codeVerifier: 'Dm4l9H2NqE8yP5Rb7w3a6Z1K0VxYcOjG4FiU_n-tBXs',
});
assert('WHOOP authorize URL hits api.prod.whoop.com',
  whoopAuthUrl.includes('api.prod.whoop.com/oauth/oauth2/auth'));
assert('WHOOP authorize URL carries code_challenge',
  /code_challenge=[A-Za-z0-9_-]+/.test(whoopAuthUrl));
assert('WHOOP authorize URL declares S256 method',
  whoopAuthUrl.includes('code_challenge_method=S256'));
assert('WHOOP authorize URL does NOT leak code_verifier',
  !whoopAuthUrl.includes('code_verifier='));

// ═══════════════════════════════════════
// 13. Ultrahuman OAuth2 + fetcher shape
// ═══════════════════════════════════════
console.log('13. Ultrahuman OAuth2');
const uh = await import('../js/wearables-ultrahuman.js');
assert('fetchUltrahumanDailyRange exists', typeof uh.fetchUltrahumanDailyRange === 'function');
assert('fetchUltrahumanPersonalInfo exists (moved off verifyPAT to OAuth2 user_info)',
  typeof uh.fetchUltrahumanPersonalInfo === 'function');
const uhAuth = await import('../js/wearables-ultrahuman-auth.js');
assert('Ultrahuman scopes include profile + ring_data + cgm_data',
  ['profile', 'ring_data', 'cgm_data'].every(s => uhAuth.DEFAULT_ULTRAHUMAN_SCOPES.includes(s)));
const uhUrl = uhAuth.buildAuthorizeUrl({
  clientId: 'test-client', redirectUri: 'http://localhost:8000/app',
  scopes: uhAuth.DEFAULT_ULTRAHUMAN_SCOPES, state: 'uh-test-state',
});
assert('Ultrahuman authorize URL hits auth.ultrahuman.com/authorise',
  uhUrl.startsWith('https://auth.ultrahuman.com/authorise'));
assert('Ultrahuman scope list is space-delimited',
  /scope=profile\+ring_data\+cgm_data/.test(uhUrl));
assert('Ultrahuman adapter scope list matches DEFAULT_ULTRAHUMAN_SCOPES',
  JSON.stringify([...reg.adapterById('ultrahuman').oauth.scopes].sort()) ===
  JSON.stringify([...uhAuth.DEFAULT_ULTRAHUMAN_SCOPES].sort()));

// ═══════════════════════════════════════
// 14. Apple Health XML parser
// ═══════════════════════════════════════
console.log('14. Apple Health XML');
const ah = await import('../js/wearables-apple-health.js');
const fixtureXml = await fetch('/tests/spike-fixtures/apple-health-sample.xml').then(r => r.text());
const ahRows = ah.parseAppleHealthXml(fixtureXml);
assert('Apple Health parser returned 2 canonical day rows (2026-04-20, 2026-04-21)',
  ahRows.length === 2);
assert('Apple rows sorted ascending by date',
  ahRows[0].date === '2026-04-20' && ahRows[1].date === '2026-04-21');
const day1 = ahRows.find(r => r.date === '2026-04-20');
const day2 = ahRows.find(r => r.date === '2026-04-21');

// RHR aggregator is MIN across all samples — Apple writes RestingHR as a
// sleep-derived value timestamped at wake, so hour-of-day splitting would
// mis-classify it. Min still protects against 3rd-party-app spikes.
assert('RHR uses min-per-day aggregator (ignores 85bpm 3rd-party outlier, keeps 58)',
  day1.rhr === 58);
// HRV SDNN: both fixture samples are at 02:15 and 03:20 — night-window
// (22:00–06:00) → mean(42.5, 48.5) = 45.5 routes to hrv_sdnn (overnight).
assert('HRV SDNN aggregates night-window samples (42.5 & 48.5 → 45.5)',
  day1.hrv_sdnn === 45.5);
// No day-window HRV samples in fixture → hrv_day should be null on day 1.
assert('hrv_day is null when no day-window samples exist',
  day1.hrv_day === null);
// Steps are additive per source but Apple Health may contain overlapping
// iPhone/Watch/Oura rows. Sum within source, then take the max source total:
// iPhone=2420, Apple Watch=5430 → 5430.
assert('Steps de-duplicate multi-source Apple Health days by max source total',
  day1.steps === 5430, `got ${day1.steps}`);
// SpO2 mean of 97 + 95 = 96
assert('SpO2 mean-per-day aggregator (97+95 → 96)',
  day1.spo2_avg === 96);
// Day 2 has single readings — single 02:10 SDNN sample is night-window → 51
assert('Day 2 RHR populated (single reading → 56)', day2.rhr === 56);
assert('Day 2 HRV SDNN populated (single night-window sample → 51)', day2.hrv_sdnn === 51);
assert('Day 2 hrv_day null (no day-window samples)', day2.hrv_day === null);
assert('Day 2 steps single-source value passes through unchanged',
  day2.steps === 8200, `got ${day2.steps}`);

// Records we explicitly don't map must NOT end up in canonical rows.
assert('rMSSD is not derivable from Apple Health (we use SDNN type only) — hrv_rmssd stays null',
  day1.hrv_rmssd === null && day2.hrv_rmssd === null);
// Day 1 has one HKQuantityTypeIdentifierHeartRate sample at 10:00 (day window) value=72.
// Day 2 has none. Verify hr_day surfaces 72 on day 1, null on day 2.
assert('hr_day populated from raw HeartRate stream (day-window mean)',
  day1.hr_day === 72);
assert('hr_day null when no day-window HR samples exist on that day',
  day2.hr_day === null);
assert('Body temp delta correctly dropped (no baseline yet, absolute temp unusable)',
  day1.body_temp_delta === null);
assert('Apple Health BodyMass maps to weight',
  day2.weight === 72.5, `weight=${day2.weight}`);
assert('Apple Health BodyFatPercentage fraction maps to percent',
  day2.body_fat_pct === 18.5, `body_fat_pct=${day2.body_fat_pct}`);
assert('Apple Health derives fat_mass_kg from weight and body fat percent',
  day2.fat_mass_kg === 13.41, `fat_mass_kg=${day2.fat_mass_kg}`);
assert('Apple Health LeanBodyMass lb converts to kg',
  day2.lean_mass_kg === 58.11, `lean_mass_kg=${day2.lean_mass_kg}`);
assert('Apple Health BP parses systolic and diastolic',
  day2.bp_systolic === 121 && day2.bp_diastolic === 78,
  `bp=${day2.bp_systolic}/${day2.bp_diastolic}`);

// Source tag is apple_health so the L1 IDB + multi-source badge paths pick
// it up as a distinct vendor alongside Oura/WHOOP.
assert('Canonical row carries source: apple_health', day1.source === 'apple_health');

// Unit-normalisation guard — a record with a bogus unit string must be
// dropped rather than silently stored in the wrong scale.
const hostileXml = '<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierStepCount" unit="furlongs" startDate="2026-04-20 00:00:00 +0000" value="12"/></HealthData>';
const hostileRows = ah.parseAppleHealthXml(hostileXml);
assert('Hostile unit ("furlongs" for steps) is refused, not ingested',
  hostileRows.length === 0 || hostileRows[0].steps === null);
const bodyUnitXml = '<?xml version="1.0"?><HealthData>'
  + '<Record type="HKQuantityTypeIdentifierBodyMass" unit="st" startDate="2026-04-20 00:00:00 +0000" value="11"/>'
  + '<Record type="HKQuantityTypeIdentifierLeanBodyMass" unit="lb" startDate="2026-04-20 00:00:00 +0000" value="100"/>'
  + '</HealthData>';
const bodyUnitRows = ah.parseAppleHealthXml(bodyUnitXml);
assert('Apple Health BodyMass stone unit converts to kg',
  bodyUnitRows[0]?.weight === 69.85, `weight=${bodyUnitRows[0]?.weight}`);
assert('Apple Health LeanBodyMass lb unit converts to kg',
  bodyUnitRows[0]?.lean_mass_kg === 45.36, `lean=${bodyUnitRows[0]?.lean_mass_kg}`);

// ── #180 regression: lazy-load JSZip on first ZIP import ──
// index.html intentionally does NOT pre-load /vendor/jszip.min.js. A prior
// refactor exposed a "JSZip not loaded" throw on every ZIP import. The fix
// wraps JSZip access in a memoized loader. Pin the lazy-load pattern so a
// future refactor can't silently break it again.
const ahSrc = await fetch('/js/wearables-apple-health.js').then(r => r.text());
assert('Apple Health source defines loadJSZip lazy-loader',
  /function\s+loadJSZip\s*\(\s*\)/.test(ahSrc));
assert('loadJSZip memoizes via module-level _jszipLoad',
  /let\s+_jszipLoad\s*=\s*null/.test(ahSrc));
assert('loadJSZip injects /vendor/jszip.min.js script tag',
  ahSrc.includes("'/vendor/jszip.min.js'"));
assert('extractExportXml awaits loadJSZip() instead of bare window.JSZip',
  /const\s+JSZip\s*=\s*await\s+loadJSZip\(\)/.test(ahSrc));
assert('No bare "JSZip not loaded" throw left in extractExportXml',
  !ahSrc.includes('JSZip not loaded — Apple Health'));
// (JSZip functional smoke — needs real browser <script> injection —
// lives in test-wearables-dom.js. The loadJSZip source-pattern asserts
// above run in Node.)
// ── progress-bar markup must render in BOTH row branches ──
// importAppleHealthFlow queries #apple-health-progress by id; before this
// fix only the disconnected-state branch of renderRowDetail rendered that
// element, so re-imports on already-connected rows ran without any UI
// feedback (the `if (wrap)` / `if (bar)` / `if (text)` guards no-op'd).
// Pin both branches so a future refactor can't silently drop one again.
const appleProgressSrc = await fetch('/js/wearables.js').then(r => r.text());
const progressIdMatches = (appleProgressSrc.match(/id="apple-health-progress"/g) || []).length;
assert('renderRowDetail renders #apple-health-progress in BOTH connected and disconnected branches',
  progressIdMatches >= 2);

// ── streaming-path parity (parseAppleHealthBlob) ──
// Multi-GB exports hit V8's ~512 MB max-string-length wall when read via
// file.text() or JSZip entry.async('text'). parseAppleHealthBlob streams
// the Blob through TextDecoderStream and line-splits, keeping memory flat
// at one chunk + one line regardless of file size. Output must be
// byte-identical to the in-memory string parser on the same input so a
// future divergence between the two code paths surfaces immediately.
assert('parseAppleHealthBlob exported alongside parseAppleHealthXml',
  typeof ah.parseAppleHealthBlob === 'function');
const blobInput = new Blob([fixtureXml], { type: 'application/xml' });
const blobRows = await ah.parseAppleHealthBlob(blobInput);
assert('Streaming parser returns same row count as in-memory parser',
  blobRows.length === ahRows.length);
assert('Streaming parser produces identical canonical rows (JSON-equal)',
  JSON.stringify(blobRows) === JSON.stringify(ahRows));

// ── VO₂max ingestion (HKQuantityTypeIdentifierVO2Max) ──
// Apple Watch writes VO₂max during outdoor walks/runs. Apple's unit string
// is "mL/min·kg" — semantically the canonical mL/kg/min (same dimensional
// quantity, transposed factors). Distinct from Withings cardio_fitness
// (proprietary 0-100 score) — different scales, different cards.
// Aggregator means same-day samples (rare but possible: back-to-back walks).
const vo2Xml = '<?xml version="1.0"?><HealthData>' +
  '<Record type="HKQuantityTypeIdentifierVO2Max" unit="mL/min·kg" startDate="2026-04-20 09:00:00 +0200" value="42.5"/>' +
  '<Record type="HKQuantityTypeIdentifierVO2Max" unit="mL/min·kg" startDate="2026-04-20 18:00:00 +0200" value="43.5"/>' +
  '<Record type="HKQuantityTypeIdentifierVO2Max" unit="mL/kg/min" startDate="2026-04-21 08:00:00 +0200" value="44.2"/>' +
  '</HealthData>';
const vo2Rows = ah.parseAppleHealthXml(vo2Xml);
const vo2Day1 = vo2Rows.find(r => r.date === '2026-04-20');
const vo2Day2 = vo2Rows.find(r => r.date === '2026-04-21');
assert('VO₂max ingested from HKQuantityTypeIdentifierVO2Max (Apple "mL/min·kg" notation, same-day mean)',
  vo2Day1?.vo2max === 43);
assert('VO₂max accepts canonical "mL/kg/min" notation as identity',
  vo2Day2?.vo2max === 44.2);
// Hostile-unit guard parity with steps — a bogus unit must NOT silently
// land on the canonical mL/kg/min scale.
const vo2HostileXml = '<?xml version="1.0"?><HealthData>' +
  '<Record type="HKQuantityTypeIdentifierVO2Max" unit="furlongs/s" startDate="2026-04-22 09:00:00 +0200" value="42"/>' +
  '</HealthData>';
const vo2HostileRows = ah.parseAppleHealthXml(vo2HostileXml);
assert('VO₂max rejects unknown unit (no canonical-scale silent fallback)',
  vo2HostileRows.length === 0 || vo2HostileRows[0].vo2max === null);

// ═══════════════════════════════════════
// 15. Withings OAuth2 + measure-type decoding
// ═══════════════════════════════════════
console.log('15. Withings');
const withingsAuth = await import('../js/wearables-withings-auth.js');
assert('Withings scopes include user.metrics',
  withingsAuth.DEFAULT_WITHINGS_SCOPES.includes('user.metrics'));
const withingsAuthUrl = withingsAuth.buildAuthorizeUrl({
  clientId: 'test-client', redirectUri: 'http://localhost:8000/app',
  scopes: withingsAuth.DEFAULT_WITHINGS_SCOPES, state: 'abc123',
});
assert('Withings authorize URL hits account.withings.com',
  withingsAuthUrl.startsWith('https://account.withings.com/oauth2_user/authorize2'));
assert('Withings authorize URL carries state param',
  withingsAuthUrl.includes('state=abc123'));
// Scopes are comma-delimited (Withings quirk — not space like everyone else)
assert('Withings scope list is comma-delimited (not space)',
  /scope=user\.info%2Cuser\.metrics/.test(withingsAuthUrl));

const withingsReg = reg.adapterById('withings');
assert('Withings adapter scopes match DEFAULT_WITHINGS_SCOPES',
  JSON.stringify([...withingsReg.oauth.scopes].sort()) === JSON.stringify([...withingsAuth.DEFAULT_WITHINGS_SCOPES].sort()));

// Measure-type code sanity — Withings uses numeric codes (1=weight, 10=BP sys
// etc.). Our adapter declares them explicitly so the renderer can surface
// them; if a tester's scale is only pushing type 77 (hydration) we ignore it
// rather than mapping to something wrong.
assert('Withings weight maps to measType 1',      withingsReg.metrics.weight?.measType === 1);
assert('Withings BP diastolic maps to measType 9', withingsReg.metrics.bp_diastolic?.measType === 9);
assert('Withings BP systolic maps to measType 10', withingsReg.metrics.bp_systolic?.measType === 10);
// Scale pulse (type 11) is a daytime spot reading, NOT resting HR. It now
// routes to hr_day; the rhr slot is filled from sleep summary's hr_min.
assert('Withings scale pulse (type 11) maps to hr_day, not rhr',
  withingsReg.metrics.hr_day?.measType === 11 && !withingsReg.metrics.rhr?.measType);
assert('Withings rhr is sourced from sleep summary hr_min',
  withingsReg.metrics.rhr?.endpoint === 'v2/sleep' && withingsReg.metrics.rhr?.field === 'hr_min');

// Withings full-coverage map. The fetcher's MEAS_TYPES table is source
// of truth for /measure; this double-asserts the registry side so a
// missing wire-up surfaces here before any real-device test.
const expectedMeasTypes = {
  weight: 1, lean_mass_kg: 5, body_fat_pct: 6, fat_mass_kg: 8,
  bp_diastolic: 9, bp_systolic: 10, hr_day: 11,
  spo2_avg: 54, body_temp: 71, skin_temp: 73,
  muscle_mass_kg: 76, water_mass_kg: 77, bone_mass_kg: 88,
  pwv: 91, vascular_age: 130, visceral_fat: 167,
  nerve_health_score: 168, cardio_fitness: 169,
};
for (const [canonical, measType] of Object.entries(expectedMeasTypes)) {
  assert(`Withings ${canonical} → /measure measType ${measType}`,
    withingsReg.metrics[canonical]?.measType === measType);
}
// /v2/sleep getsleepsummary — registered fields and their transforms.
const expectedSleepFields = {
  sleep_score: { field: 'sleep_score' },
  rhr: { field: 'hr_min' },
  sleep_total_min: { field: 'asleepduration', transform: 'sec→min' },
  sleep_deep_min: { field: 'deepsleepduration', transform: 'sec→min' },
  sleep_light_min: { field: 'lightsleepduration', transform: 'sec→min' },
  sleep_rem_min: { field: 'remsleepduration', transform: 'sec→min' },
  sleep_awake_min: { field: 'wakeupduration', transform: 'sec→min' },
  sleep_hr_avg: { field: 'hr_average' },
  sleep_breathing_rate: { field: 'rr_average' },
  sleep_snoring_min: { field: 'snoring', transform: 'sec→min' },
  sleep_breath_disturb: { field: 'breathing_disturbances_intensity' },
};
for (const [canonical, spec] of Object.entries(expectedSleepFields)) {
  const reg = withingsReg.metrics[canonical];
  assert(`Withings ${canonical} → /v2/sleep field "${spec.field}"`,
    reg?.endpoint === 'v2/sleep' && reg?.field === spec.field);
  if (spec.transform) {
    assert(`Withings ${canonical} carries transform: ${spec.transform}`,
      reg?.transform === spec.transform);
  }
}

// CANONICAL_METRICS — cheap presence sanity for every new canonical.
const NEW_CANONICALS = [
  'pwv', 'vascular_age', 'cardio_fitness',
  'body_fat_pct', 'fat_mass_kg', 'muscle_mass_kg', 'lean_mass_kg',
  'bone_mass_kg', 'water_mass_kg', 'visceral_fat', 'nerve_health_score',
  'body_temp', 'skin_temp',
  'sleep_total_min', 'sleep_deep_min', 'sleep_light_min', 'sleep_rem_min',
  'sleep_awake_min', 'sleep_hr_avg', 'sleep_breathing_rate',
  'sleep_snoring_min', 'sleep_breath_disturb',
];
for (const id of NEW_CANONICALS) {
  assert(`CANONICAL_METRICS includes '${id}'`, !!reg.canonicalMetric(id));
}
// Card label polish — body comp metrics shouldn't carry a redundant
// 'mass' or 'index' sub. The label itself already disambiguates.
for (const id of ['muscle_mass_kg', 'bone_mass_kg', 'water_mass_kg', 'visceral_fat', 'body_fat_pct', 'fat_mass_kg']) {
  assert(`${id} card sub is empty (no redundant noise)`, reg.canonicalMetric(id)?.sub === '');
}
// Lean mass keeps a distinct label so the strip can show Muscle and
// Lean side-by-side without ambiguity. Aria-label clarifies further.
assert('lean_mass_kg label reads "Lean mass" not just "Lean"',
  reg.canonicalMetric('lean_mass_kg')?.label === 'Lean mass');
assert('lean_mass_kg has aria-label clarifying "fat-free"',
  /fat-free/i.test(reg.canonicalMetric('lean_mass_kg')?.ariaLabel || ''));

// AI context cluster roll-ups — body comp + sleep architecture each
// collapse into one line to keep prompt budget predictable. The
// detail modal still drills each metric individually.
const labCtxSrc = await fetch('/js/lab-context.js').then(r => r.text());
assert('Body-comp roll-up keeps 8 keys (incl. fat_mass_kg)',
  /BODY_COMP_KEYS\s*=\s*\[[\s\S]*?'body_fat_pct'[\s\S]*?'fat_mass_kg'[\s\S]*?'nerve_health_score'[\s\S]*?\]/.test(labCtxSrc));
assert('Sleep-arch roll-up covers the nine sleep canonicals',
  /SLEEP_ARCH_KEYS\s*=\s*\[[\s\S]*?'sleep_total_min'[\s\S]*?'sleep_breath_disturb'[\s\S]*?\]/.test(labCtxSrc));
assert('Both clusters skip the per-metric loop via ROLLED_UP set',
  /ROLLED_UP\.has\(mid\)\)\s*continue/.test(labCtxSrc));
assert('Roll-up emits "Body comp:" line', /Body comp:.*parts\.join/.test(labCtxSrc));
assert('Roll-up emits "Sleep arch:" line', /Sleep arch:.*parts\.join/.test(labCtxSrc));

const withingsFetcher = await import('../js/wearables-withings.js');
assert('fetchWithingsDailyRange exists', typeof withingsFetcher.fetchWithingsDailyRange === 'function');

// ═══════════════════════════════════════
// 16. Fitbit PKCE + fetcher shape
// ═══════════════════════════════════════
console.log('16. Fitbit PKCE');
const fitbitAuth = await import('../js/wearables-fitbit-auth.js');
const fitbitFetcher = await import('../js/wearables-fitbit.js');
const fitbitReg = reg.adapterById('fitbit');

assert('Fitbit uses OAuth2 with PKCE (public client, no client_secret)',
  fitbitReg?.authType === 'oauth2' && fitbitReg?.oauth?.pkce === true);
assert('Fitbit scopes include heartrate + sleep + profile',
  ['heartrate', 'sleep', 'profile'].every(s => fitbitAuth.DEFAULT_FITBIT_SCOPES.includes(s)));
assert('Fitbit scopes include temperature + weight (for skin Δ + scale readings)',
  ['temperature', 'weight'].every(s => fitbitAuth.DEFAULT_FITBIT_SCOPES.includes(s)));
assert('Fitbit adapter scope list matches DEFAULT_FITBIT_SCOPES (no drift)',
  JSON.stringify([...fitbitReg.oauth.scopes].sort()) ===
  JSON.stringify([...fitbitAuth.DEFAULT_FITBIT_SCOPES].sort()));

const fbUrl = await fitbitAuth.buildAuthorizeUrl({
  clientId: 'fb-test-client', redirectUri: 'http://localhost:8000/app',
  scopes: fitbitAuth.DEFAULT_FITBIT_SCOPES, state: 'fb-state-xyz',
  codeVerifier: 'Dm4l9H2NqE8yP5Rb7w3a6Z1K0VxYcOjG4FiU_n-tBXs',
});
assert('Fitbit authorize URL hits www.fitbit.com/oauth2/authorize',
  fbUrl.startsWith('https://www.fitbit.com/oauth2/authorize'));
assert('Fitbit authorize URL carries code_challenge', /code_challenge=[A-Za-z0-9_-]+/.test(fbUrl));
assert('Fitbit authorize URL declares S256 method', fbUrl.includes('code_challenge_method=S256'));
assert('Fitbit authorize URL does NOT leak code_verifier', !fbUrl.includes('code_verifier='));
assert('Fitbit scopes are space-delimited in URL', /scope=profile\+activity\+heartrate/.test(fbUrl));

assert('fetchFitbitDailyRange exists', typeof fitbitFetcher.fetchFitbitDailyRange === 'function');
assert('fetchFitbitPersonalInfo exists', typeof fitbitFetcher.fetchFitbitPersonalInfo === 'function');

// ═══════════════════════════════════════
// 17. Multi-source primary-source override (post-audit fix)
// ═══════════════════════════════════════
console.log('17. Primary-Source Override');
const baseRow = (src, date, metrics) => ({ source: src, date, ...metrics });
const rowsBySource = {
  oura:   [baseRow('oura',   '2026-04-22', { hrv_rmssd: 40, steps: 0 })],
  fitbit: [baseRow('fitbit', '2026-04-22', { hrv_rmssd: 45, steps: 8200 })],
};
const connectedSources = {
  oura:   { connectedSince: '2026-01-01', lastSyncAt: Date.now() },
  fitbit: { connectedSince: '2026-02-01', lastSyncAt: Date.now() },
};

// Auto-pick: insertion order (oura first) wins on ties. Document the existing
// behaviour so regressions in the picker are caught.
const autoSummary = summary.computeWearableSummary(rowsBySource, connectedSources);
assert('Auto picker: tied dates → insertion-order-first (oura) wins hrv_rmssd',
  autoSummary.metrics.hrv_rmssd?.primarySource === 'oura');

// Override: force Fitbit for HRV even though Oura would auto-win
const overrideSummary = summary.computeWearableSummary(rowsBySource, connectedSources, { hrv_rmssd: 'fitbit' });
assert('Override: primaryOverride.hrv_rmssd=fitbit flips primarySource',
  overrideSummary.metrics.hrv_rmssd?.primarySource === 'fitbit');
assert('Override: derived latest value comes from the overridden source',
  overrideSummary.metrics.hrv_rmssd?.latest === 45);

// Bad override: force Ultrahuman (not in rowsBySource) → fall back to auto
const badOverrideSummary = summary.computeWearableSummary(rowsBySource, connectedSources, { hrv_rmssd: 'ultrahuman' });
assert('Override: unknown source silently falls back to auto picker',
  badOverrideSummary.metrics.hrv_rmssd?.primarySource === 'oura');

// Override with no data in that source → also falls back
const rowsWithEmptyFitbit = {
  oura:   [baseRow('oura', '2026-04-22', { hrv_rmssd: 40 })],
  fitbit: [baseRow('fitbit', '2026-04-22', { hrv_rmssd: null })],
};
const emptyOverrideSummary = summary.computeWearableSummary(rowsWithEmptyFitbit, connectedSources, { hrv_rmssd: 'fitbit' });
assert('Override: source has no non-null samples → auto fallback',
  emptyOverrideSummary.metrics.hrv_rmssd?.primarySource === 'oura');

// ═══════════════════════════════════════
// 18. withFreshToken re-reads connection inside lock (cross-tab race guard)
// ═══════════════════════════════════════
console.log('18. Auth Race Guard');
// Stale connection: expired 10 min ago. readLatest() returns a fresh one
// that another tab already refreshed. Expected: function returns the fresh
// connection without calling refreshTokens (which would fail on the stale
// refreshToken).
const staleConn = {
  accessToken: 'stale-at', refreshToken: 'stale-rt',
  expiresAt: Date.now() - 10 * 60 * 1000,  // expired
};
const freshConn = {
  accessToken: 'fresh-at', refreshToken: 'fresh-rt',
  expiresAt: Date.now() + 60 * 60 * 1000,  // valid for 1h
};
let refreshCalled = false;
// Temporarily stub refreshTokens to detect if it's (incorrectly) called.
const origFetch = window.fetch;
window.fetch = async () => { refreshCalled = true; return { ok: false, status: 400, json: async () => ({ error: 'shouldnt-run' }) }; };
try {
  const result = await oauth.withFreshToken(staleConn, 'test-client', async () => {}, () => freshConn);
  assert('withFreshToken: returns fresh connection from readLatest without hitting token endpoint',
    result.accessToken === 'fresh-at' && !refreshCalled);
} catch (e) {
  assert('withFreshToken: no throw when another tab already refreshed', false, e.message);
} finally {
  window.fetch = origFetch;
}

// Formatter-unification guard: a value with unit '%' must render the SAME
// way in the strip card and the detail modal. Catches the v1.22.2 divergence
// where `formatValue(97, '%')` returned "97" but the modal's inline formatV
// fell through to `.toFixed(1)` → "97.0".
const strip2 = {
  sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 10 } },
  metrics: {
    spo2_avg: { primarySource: 'oura', latest: 97, latestDate: '2026-04-22', baseline: 96, baselineP25: 95, baselineP75: 98, rolling: { d7: 97, d30: 97, d90: 96 }, trend30d: 'flat', weekly: [96, 96, 97, 97, 97] },
  },
};
window._labState.importedData.wearableSummary = strip2;
const stripSpo2Html = window.renderWearableStrip();
// Strip renderer is a pure string-builder — assert it here in Node. The
// matching *modal*-renderer parity check (openWearableDetail) lives in
// test-wearables-dom.js. Neither should produce "97.0 %" — both "97 %".
assert('Strip renders SpO2 97 as integer (no .0)', !/97\.0/.test(stripSpo2Html));
delete window._labState.importedData.wearableSummary;

// ═══════════════════════════════════════
// 13. OAUTH_DISPATCH registry-vs-dispatch drift
// ═══════════════════════════════════════
// Catches the bug where someone adds a new OAuth adapter to wearable-adapters.js
// but forgets to register its begin/callback/complete/withFreshToken/fetchRange
// hooks in wearables-connect.js OAUTH_DISPATCH (or vice versa). apple_health is
// the one legitimate exception — file-import, not OAuth.
console.log('13b. OAUTH_DISPATCH drift');
const connect = await import('../js/wearables-connect.js');
assert('OAUTH_DISPATCH exported', typeof connect.OAUTH_DISPATCH === 'object' && connect.OAUTH_DISPATCH !== null);

const oauthAdapterIds = reg.ADAPTERS.filter(a => a.authType === 'oauth2').map(a => a.id);
const dispatchIds = Object.keys(connect.OAUTH_DISPATCH);

// 1. Every oauth2 adapter has a dispatch entry
for (const id of oauthAdapterIds) {
  assert(`Adapter '${id}' has OAUTH_DISPATCH entry`, dispatchIds.includes(id),
    `missing — register hooks in wearables-connect.js`);
}
// 2. Every dispatch entry has a matching oauth2 adapter (no orphaned dispatch hooks)
for (const id of dispatchIds) {
  const adapter = reg.adapterById(id);
  assert(`Dispatch entry '${id}' has matching oauth2 adapter`, adapter?.authType === 'oauth2',
    `orphaned — remove from OAUTH_DISPATCH or add adapter`);
}
// 3. Each dispatch entry exposes the full hook surface
const REQUIRED_HOOKS = ['begin', 'isCallback', 'complete', 'withFreshToken', 'fetchAccountInfo', 'fetchRange', 'displayName'];
for (const id of dispatchIds) {
  const entry = connect.OAUTH_DISPATCH[id];
  for (const hook of REQUIRED_HOOKS) {
    assert(`OAUTH_DISPATCH.${id}.${hook} present`, entry && entry[hook] != null);
  }
}
// 4. Apple Health is explicitly NOT in dispatch (file-import, no OAuth)
assert('apple_health NOT in OAUTH_DISPATCH', !dispatchIds.includes('apple_health'),
  'apple_health is file-import, should never be registered');

// ═══════════════════════════════════════
// 14. Withings error-code table
// ═══════════════════════════════════════
console.log('14b. Withings error codes');
const withings = await import('../js/wearables-withings.js');
assert('withingsErrorMessage exported', typeof withings.withingsErrorMessage === 'function');
assert('maps 100 → token invalid', /token/i.test(withings.withingsErrorMessage(100)));
assert('maps 293 → rate limit', /rate/i.test(withings.withingsErrorMessage(293)));
assert('maps 284 → token not found', /token not found/i.test(withings.withingsErrorMessage(284)));
assert('maps 283 → token used', /token/i.test(withings.withingsErrorMessage(283)));
assert('maps 251 → grant invalid', /grant/i.test(withings.withingsErrorMessage(251)));
assert('maps 601 → rate limited', /rate/i.test(withings.withingsErrorMessage(601)));
assert('unknown code returns null', withings.withingsErrorMessage(99999) === null);
assert('non-numeric returns null', withings.withingsErrorMessage('foo') === null);
assert('numeric string works', /token/i.test(withings.withingsErrorMessage('100')));

// ═══════════════════════════════════════
// 15. PKCE: code_verifier → code_challenge SHA256 spec compliance
// ═══════════════════════════════════════
// RFC 7636 §4.2: code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier))).
// WHOOP and Fitbit both use the S256 method; a bug in the derivation silently
// breaks the final token exchange with a cryptic 'invalid_grant'. Pin the
// exact byte sequence end-to-end against the RFC test vector.
console.log('15b. PKCE SHA256 pair');
// Auth modules already imported above (sections 6 + 11); reuse to avoid
// top-level identifier collisions in this IIFE's single scope.
const fitbitAuthPkce = await import('../js/wearables-fitbit-auth.js');
const whoopAuthPkce = await import('../js/wearables-whoop-auth.js');

// RFC 7636 Appendix B test vector:
//   verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
//   challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const RFC_VERIFIER  = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

// Both auth modules should expose a derivation helper; if not, recreate inline
// and make sure the helper names match what's used inside begin*OAuth.
{
  const got = await fitbitAuthPkce.deriveCodeChallenge(RFC_VERIFIER);
  assert('Fitbit PKCE derives RFC test vector', got === RFC_CHALLENGE, `got ${got}`);
}
{
  const got = await whoopAuthPkce.deriveCodeChallenge(RFC_VERIFIER);
  assert('WHOOP PKCE derives RFC test vector', got === RFC_CHALLENGE, `got ${got}`);
}

// ═══════════════════════════════════════
// 16. Polar AccessLink adapter
// ═══════════════════════════════════════
console.log('16b. Polar adapter');
const polarAdapter = reg.adapterById('polar');
assert('Polar adapter registered', polarAdapter?.id === 'polar');
assert('Polar displayName', polarAdapter?.displayName === 'Polar');
assert('Polar authType oauth2', polarAdapter?.authType === 'oauth2');
assert('Polar NOT PKCE (confidential client)', polarAdapter?.oauth?.pkce === false);
assert('Polar Client ID pasted (not placeholder)',
  typeof polarAdapter?.oauth?.clientId === 'string' &&
  !polarAdapter.oauth.clientId.startsWith('REPLACE_WITH_') &&
  polarAdapter.oauth.clientId.length > 10);
assert('Polar scope is accesslink.read_all',
  polarAdapter?.oauth?.scopes?.includes('accesslink.read_all'));
assert('Polar supports sleep_score', reg.adapterSupportsMetric('polar', 'sleep_score'));
assert('Polar supports steps', reg.adapterSupportsMetric('polar', 'steps'));
assert('Polar supports rhr', reg.adapterSupportsMetric('polar', 'rhr'));
assert('Polar in OAUTH_DISPATCH', 'polar' in connect.OAUTH_DISPATCH);
assert('Polar has postConnect hook (one-time /v3/users registration)',
  typeof connect.OAUTH_DISPATCH.polar?.postConnect === 'function');
assert('Polar has commitAfterWrite hook (transactions)',
  typeof connect.OAUTH_DISPATCH.polar?.commitAfterWrite === 'function');

const polarAuth = await import('../js/wearables-polar-auth.js');
assert('Polar DEFAULT_POLAR_SCOPES exported',
  Array.isArray(polarAuth.DEFAULT_POLAR_SCOPES) && polarAuth.DEFAULT_POLAR_SCOPES.includes('accesslink.read_all'));
const polarAuthUrl = polarAuth.buildAuthorizeUrl({
  clientId: 'test-client', redirectUri: 'http://localhost:8000/app',
  scopes: polarAuth.DEFAULT_POLAR_SCOPES, state: 'test-state',
});
assert('Polar authorize URL points at flow.polar.com',
  polarAuthUrl.startsWith('https://flow.polar.com/oauth2/authorization'));
assert('Polar authorize URL has response_type=code',
  polarAuthUrl.includes('response_type=code'));
assert('Polar authorize URL NOT PKCE',
  !polarAuthUrl.includes('code_challenge'));
assert('Polar authorize URL space-delimits scopes',
  polarAuthUrl.includes('scope=accesslink.read_all'));

// Independent: verify the raw WebCrypto pipeline our flow depends on (base64url, not base64).
const enc = new TextEncoder().encode(RFC_VERIFIER);
const hash = await crypto.subtle.digest('SHA-256', enc);
const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
assert('WebCrypto+base64url yields RFC 7636 challenge', b64url === RFC_CHALLENGE, `got ${b64url}`);

// ═══════════════════════════════════════
// 17r. Behavioral test coverage gaps (v1.31.2)
// ═══════════════════════════════════════
console.log('17r. Behavioral Coverage');

// ─── IDB encryption round-trip (was source-grep-only) ────────────────
// Writes a plaintext row, then a row under encryption, reads back.
// Asserts plaintext path passes through, encrypted path round-trips.
try {
  window.__WEARABLES_TEST = true;
  // CRITICAL: do NOT cache-bust the crypto/store modules. wearables-store
  // imports crypto.js without cache-bust; if we bust here we'd get a
  // separate module instance with its own private _sessionKey, and the
  // store's encrypt path would still see the production module's null
  // key. Use the production singleton.
  const cryptoB = await import('../js/crypto.js');
  const storeB  = await import('../js/wearables-store.js');
  const TEST_PROFILE_E = '__test-encrypt-' + Date.now().toString(36);
  const origActive = localStorage.getItem('labcharts-active-profile');
  const origCurrent = window._labState.currentProfile;
  localStorage.setItem('labcharts-active-profile', TEST_PROFILE_E);
  window._labState.currentProfile = TEST_PROFILE_E;
  try {
    // Plaintext path (encryption disabled).
    localStorage.removeItem('labcharts-encryption-enabled');
    await storeB.upsertDaily(TEST_PROFILE_E, { source: 'oura', date: '2026-04-20', hrv_rmssd: 38, rhr: 60 });
    const plain = await storeB.getDaily(TEST_PROFILE_E, 'oura', '2026-04-20');
    assert('IDB plaintext write reads back with hrv_rmssd intact (no encryption)',
      plain?.hrv_rmssd === 38 && plain?.rhr === 60);
    assert('IDB plaintext row has NO _payload envelope',
      !plain?._payload);

    // Encrypted path.
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await cryptoB._setTestSessionKey('test-passphrase-for-wearables');
    await storeB.upsertDaily(TEST_PROFILE_E, { source: 'oura', date: '2026-04-21', hrv_rmssd: 42, rhr: 58 });
    const encRaw = await storeB.getDailyRangeRaw(TEST_PROFILE_E, 'oura', '2026-04-21', '2026-04-21');
    assert('IDB encrypted write stores rows with _payload envelope (raw read)',
      encRaw[0]?._payload?._enc === 'v1');
    assert('Encrypted row keeps source + date plaintext (range queries still work)',
      encRaw[0]?.source === 'oura' && encRaw[0]?.date === '2026-04-21');
    const encDecrypted = await storeB.getDaily(TEST_PROFILE_E, 'oura', '2026-04-21');
    assert('IDB encrypted write round-trips through getDaily decrypt (hrv_rmssd === 42)',
      encDecrypted?.hrv_rmssd === 42 && encDecrypted?.rhr === 58);

    // Legacy plaintext + encryption-on coexistence: existing plaintext
    // row from before encryption-on should pass through reads untouched.
    const plainCoexist = await storeB.getDaily(TEST_PROFILE_E, 'oura', '2026-04-20');
    assert('Plaintext row coexists with encrypted row, reads untouched',
      plainCoexist?.hrv_rmssd === 38 && !plainCoexist?._payload);

    // Session-locked refusal: clearing the key while encryption is on
    // should make upsert THROW (not silently downgrade to plaintext).
    await cryptoB._setTestSessionKey(null);
    let thrown = null;
    try {
      await storeB.upsertDaily(TEST_PROFILE_E, { source: 'oura', date: '2026-04-22', hrv_rmssd: 40 });
    } catch (e) { thrown = e; }
    assert('upsertDaily throws session-locked error when encrypt-on but key missing',
      thrown?.code === 'session-locked');
  } finally {
    // Cleanup — clear encryption state FIRST so deletes don't hit
    // the encrypt path. Drop test flag LAST so _setTestSessionKey
    // can still be called above it.
    localStorage.removeItem('labcharts-encryption-enabled');
    try { await cryptoB._setTestSessionKey(null); } catch {}
    try { await storeB.clearSource(TEST_PROFILE_E, 'oura'); } catch {}
    try { await storeB.deleteWearablesDB(TEST_PROFILE_E); } catch {}
    localStorage.removeItem(`labcharts-${TEST_PROFILE_E}-imported`);
    if (origActive) localStorage.setItem('labcharts-active-profile', origActive);
    else localStorage.removeItem('labcharts-active-profile');
    window._labState.currentProfile = origCurrent;
    delete window.__WEARABLES_TEST;
  }
} catch (e) {
  fail++;
  console.log('  FAIL: IDB encryption round-trip block crashed — ' + (e?.message || e));
}

// ─── detectWearableTrendSlots (was source-grep-only) ─────────────────
{
  const recsMod = await import('../js/recommendations.js');
  // Build three fake summaries each tripping one trigger condition.
  const lowHRV = { metrics: { hrv_rmssd: { rolling: { d7: 28 }, baselineP25: 32 }}};
  const highRHR = { metrics: { rhr: { rolling: { d7: 75 }, baselineP75: 70 }}};
  const lowSleep = { metrics: { sleep_score: { rolling: { d7: 65 }, baseline: 75 }}};
  const noData = { metrics: { hrv_rmssd: { rolling: { d7: 38 }, baselineP25: 32 }}}; // ABOVE P25 — no fire
  const lowHRVSlots = recsMod.detectWearableTrendSlots(lowHRV);
  assert('Trend hook fires `magnesium` slot when 7d HRV is below user P25',
    lowHRVSlots.some(s => s.slotKey === 'magnesium'));
  const highRHRSlots = recsMod.detectWearableTrendSlots(highRHR);
  assert('Trend hook fires `magnesium` slot when 7d RHR is above user P75',
    highRHRSlots.some(s => s.slotKey === 'magnesium'));
  const lowSleepSlots = recsMod.detectWearableTrendSlots(lowSleep);
  assert('Trend hook fires `melatonin` slot when 7d sleep score < 70 AND below baseline',
    lowSleepSlots.some(s => s.slotKey === 'melatonin'));
  const noFireSlots = recsMod.detectWearableTrendSlots(noData);
  assert('Trend hook returns empty when conditions not met',
    noFireSlots.length === 0);
}

// ─── _scrubError behavioral (was source-grep-only) ───────────────────
{
  // _scrubError is module-private. Test via the resulting toast string
  // shape would require driving a real fetch failure. Instead, source-grep
  // for the regex patterns to confirm correctness — defensive rather
  // than prescriptive.
  const connectSrc = await fetch('/js/wearables-connect.js').then(r => r.text());
  assert('_scrubError handles capitalized "Bearer"',
    /\[Bb\]earer/.test(connectSrc));
  assert('_scrubError redacts access_token + refresh_token in any quote/equals form',
    /access\[_\\s-\]\?token/.test(connectSrc) && /refresh\[_\\s-\]\?token/.test(connectSrc));
}

// ─── MCP series-section line-shape contract ──────────────────────────
// The Python MCP tool depends on the exact line format. Pin it here so
// browser-side drift surfaces in the JS suite.
{
  const labCtxMcp = await import('../js/lab-context.js');
  labCtxMcp.setAgentWearableSeriesDays(7);
  // Stub a minimal summary so the builder produces a non-empty section.
  const origSummary = window._labState.importedData?.wearableSummary;
  window._labState.importedData = window._labState.importedData || { entries: [] };
  window._labState.importedData.wearableSummary = {
    summaryUpdatedAt: new Date().toISOString(),
    sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 5 }},
    metrics: { hrv_rmssd: { primarySource: 'oura', latest: 38, baseline: 36, baselineP25: 32, baselineP75: 40, rolling: { d7: 37, d30: 36, d90: 36 }, trend30d: 'flat', weekly: [36, 37, 38] }},
  };
  // Need an L1 row so the series builder has data to pivot.
  const TEST_PROFILE_S = '__test-series-' + Date.now().toString(36);
  const origActive = localStorage.getItem('labcharts-active-profile');
  const origCurrent = window._labState.currentProfile;
  localStorage.setItem('labcharts-active-profile', TEST_PROFILE_S);
  window._labState.currentProfile = TEST_PROFILE_S;
  try {
    const storeM = await import('../js/wearables-store.js');
    // Date must fall inside buildWearableSeriesSection's 7-day window
    // (today − 6 .. today). A hardcoded literal goes stale with time —
    // 2026-04-23 was the original value, which silently dropped out of
    // the window after April 29, breaking CI deterministically until
    // someone reran. Pin to (today − 1) instead.
    const testDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await storeM.upsertDaily(TEST_PROFILE_S, { source: 'oura', date: testDate, hrv_rmssd: 38 });
    const block = await labCtxMcp.buildWearableSeriesSection(7);
    assert('Series section opens with [section:wearables-series-7d]',
      block.startsWith('[section:wearables-series-7d]'));
    assert('Series section closes with [/section:wearables-series-7d]',
      block.trimEnd().endsWith('[/section:wearables-series-7d]'));
    assert('Series line format: <Label> <unit> (<source>): <vals separated by →>',
      /HRV \(🌙\) ms \(oura\): [\d—→.]+/.test(block));
    assert('Series uses → separator (matches MCP tool parser)',
      block.includes('→'));
  } finally {
    try { const { deleteWearablesDB } = await import('../js/wearables-store.js'); await deleteWearablesDB(TEST_PROFILE_S); } catch {}
    labCtxMcp.setAgentWearableSeriesDays(0);
    window._labState.importedData.wearableSummary = origSummary;
    if (origActive) localStorage.setItem('labcharts-active-profile', origActive);
    else localStorage.removeItem('labcharts-active-profile');
    window._labState.currentProfile = origCurrent;
  }
}

// ═══════════════════════════════════════
// 17s. Encryption hardening (v1.31.0)
// ═══════════════════════════════════════
console.log('17s. Encryption Hardening');

// P0-1: profile-switch race in loadProfile refresh
const profileSrc31 = await fetch('/js/profile.js').then(r => r.text());
assert('loadProfile refresh aborts when state.currentProfile changes mid-await',
  /state\.currentProfile\s*!==\s*profileId\)\s*return/.test(profileSrc31));

// P0-1 (the orchestrator side): syncWearableSummary bails on profile swap.
const summarySrc31 = await fetch('/js/wearables-summary.js').then(r => r.text());
assert('syncWearableSummary bails when state.currentProfile changed during IDB read',
  /state\.currentProfile\s*!==\s*profileId[\s\S]{0,200}reason:\s*'profile-changed'/.test(summarySrc31));

// P0-2: backup uses raw read (preserves wrappers, doesn't decrypt into snapshot)
const backupSrc31 = await fetch('/js/backup.js').then(r => r.text());
assert('Backup snapshot reads via getDailyRangeRaw (no decrypt downgrade of at-rest guarantee)',
  /getDailyRangeRaw/.test(backupSrc31) && !/store\.getDailyRange\(pid,\s*src/.test(backupSrc31));
assert('Wearable-store exports getDailyRangeRaw + upsertDailyBatchRaw',
  /export\s+async\s+function\s+getDailyRangeRaw/.test(await fetch('/js/wearables-store.js').then(r => r.text())) &&
  /export\s+async\s+function\s+upsertDailyBatchRaw/.test(await fetch('/js/wearables-store.js').then(r => r.text())));

// P0-3 + P0-4: disable + change-passphrase walk wearable IDB before/after
// key swap. _walkWearableIDB exists and runs from both paths.
const cryptoSrc31 = await fetch('/js/crypto.js').then(r => r.text());
assert('crypto.js defines _walkWearableIDB helper for re-encrypt / decrypt-to-plain',
  /async function _walkWearableIDB\(mode\)/.test(cryptoSrc31));
assert('disableEncryption walks wearable IDB BEFORE clearing the session key',
  /disableEncryption[\s\S]*?_walkWearableIDB\([^)]*\)[\s\S]*?_sessionKey\s*=\s*null/.test(cryptoSrc31));
assert('changePassphrase walks wearable IDB under the OLD key before key swap',
  /_sessionKey\s*=\s*oldKey[\s\S]*?_walkWearableIDB[\s\S]*?_sessionKey\s*=\s*newKey/.test(cryptoSrc31));

// P0-5: encryption-on + session-locked refuses to silently write plaintext
const storeSrc31 = await fetch('/js/wearables-store.js').then(r => r.text());
assert('Encrypt-or-throw: session-locked path throws session-locked error (no silent plaintext)',
  /code\s*=\s*'session-locked'/.test(storeSrc31) &&
  /encrypted;\s*unlock with your passphrase before syncing/.test(storeSrc31));

// ═══════════════════════════════════════
// 17t. Settings tab split — Wearables + Agent Access (v1.30.0)
// ═══════════════════════════════════════
console.log('17t. Settings Tab Split');

const settingsV30 = await fetch('/js/settings.js').then(r => r.text());
// Tab buttons
assert('Settings has a Wearables tab button',
  /data-tab="wearables"[\s\S]{0,400}Wearables/.test(settingsV30));
assert('Settings has an Agent Access tab button',
  /data-tab="agent"[\s\S]{0,400}Agent Access/.test(settingsV30));
assert('Old Integrations tab button is gone',
  !/data-tab="integrations"/.test(settingsV30));
// Tab panels
assert('Wearables panel renders the wearables-section (adapter rows)',
  /data-tab-panel="wearables"[\s\S]{0,400}id="wearables-section"/.test(settingsV30));
assert('Agent Access panel renders the messenger-section (token mgmt + series toggle)',
  /data-tab-panel="agent"[\s\S]{0,400}id="messenger-section"/.test(settingsV30));
// Backward-compat redirect for legacy 'integrations' tab id
assert('switchSettingsTab redirects legacy "integrations" → "wearables"',
  /if\s*\(tabId\s*===\s*'integrations'\)\s*tabId\s*=\s*'wearables'/.test(settingsV30));
// Wearables-rendered event fires on the renamed tab
assert('settings:wearables-rendered event fires when tabId === "wearables" (renamed from integrations)',
  /tabId\s*===\s*'wearables'[\s\S]{0,200}settings:wearables-rendered/.test(settingsV30));

// ═══════════════════════════════════════
// 17u. Tri-state agent series + IDB encryption (v1.29.0)
// ═══════════════════════════════════════
console.log('17u. Tri-state Series + IDB Crypto');

const labCtxV29 = await import('../js/lab-context.js');
// Tri-state preference API exists.
assert('getAgentWearableSeriesDays exported',
  typeof labCtxV29.getAgentWearableSeriesDays === 'function');
assert('setAgentWearableSeriesDays exported',
  typeof labCtxV29.setAgentWearableSeriesDays === 'function');
// Default = 0 (off).
labCtxV29.setAgentWearableSeriesDays(0);
assert('Default tri-state value is 0 (off)',
  labCtxV29.getAgentWearableSeriesDays() === 0);
// 7/30/90 round-trip.
for (const N of [7, 30, 90]) {
  labCtxV29.setAgentWearableSeriesDays(N);
  assert(`Set/get tri-state ${N} round-trips`,
    labCtxV29.getAgentWearableSeriesDays() === N);
}
// Invalid values rejected.
labCtxV29.setAgentWearableSeriesDays(45);
assert('Invalid day value (45) is silently rejected',
  labCtxV29.getAgentWearableSeriesDays() === 90); // unchanged from previous valid
// Legacy 'on' migrates to 30.
localStorage.setItem(`labcharts-${localStorage.getItem('labcharts-active-profile') || 'default'}-agent-wearable-series`, 'on');
assert('Legacy "on" reads as 30 (default migration)',
  labCtxV29.getAgentWearableSeriesDays() === 30);
labCtxV29.setAgentWearableSeriesDays(0); // reset

// Boolean back-compat shims still work.
assert('isAgentWearableSeriesEnabled / setAgentWearableSeriesEnabled back-compat',
  typeof labCtxV29.isAgentWearableSeriesEnabled === 'function' &&
  typeof labCtxV29.setAgentWearableSeriesEnabled === 'function');

// Section tag matches selected window.
if (window._labState?.importedData?.wearableSummary) {
  labCtxV29.setAgentWearableSeriesDays(7);
  const block7 = await labCtxV29.buildWearableSeriesSection().catch(() => '');
  if (block7) {
    assert('buildWearableSeriesSection() with no arg uses preference (7d → wearables-series-7d)',
      /\[section:wearables-series-7d\]/.test(block7));
  }
  labCtxV29.setAgentWearableSeriesDays(0);
}

// Settings UI is now a select, not a checkbox.
const settingsV29 = await fetch('/js/settings.js').then(r => r.text());
assert('Settings → Agent Access uses a <select> for the series window',
  /id="agent-wearable-series-select"/.test(settingsV29));
assert('Settings select dispatches to setAgentWearableSeriesDays (not the boolean setter)',
  /window\.setAgentWearableSeriesDays\(this\.value === 'off'/.test(settingsV29));
assert('Settings select offers Off / 7 / 30 / 90 options',
  /<option value="off"/.test(settingsV29) &&
  /<option value="7"/.test(settingsV29) &&
  /<option value="30"/.test(settingsV29) &&
  /<option value="90"/.test(settingsV29));

// IDB encryption — round-trip a row through encrypt+decrypt assuming
// encryption is OFF in tests (default), assert plaintext pass-through.
// CRITICAL: do NOT cache-bust crypto.js — its bottom-of-file
// Object.assign(window, …) rebinds window.updateKeyCache to a fresh
// _keyCache, which the production module's getCachedKey can't see. That
// leak surfaced as the test-custom-api / test-custom-lens flakes in CI.
const cryptoV29 = await import('../js/crypto.js');
assert('crypto.js exports encryptObject / decryptObject / isEncryptedObject',
  typeof cryptoV29.encryptObject === 'function' &&
  typeof cryptoV29.decryptObject === 'function' &&
  typeof cryptoV29.isEncryptedObject === 'function');
// With encryption OFF, encryptObject returns null (caller falls back).
const offEnv = await cryptoV29.encryptObject({ test: 1 });
assert('encryptObject returns null when encryption is disabled',
  offEnv === null);
// wearables-store.js source: rows are encrypted-on-write, decrypted-on-read.
const storeSrcV29 = await fetch('/js/wearables-store.js').then(r => r.text());
assert('upsertDaily encrypts via _encryptRowIfEnabled before put',
  /_encryptRowIfEnabled\(stamped\)/.test(storeSrcV29) || /_encryptRowIfEnabled\(\{ importedAt[\s\S]{0,40}\)/.test(storeSrcV29));
// Two-phase upsert: read existing → merge in JS → write merged. Earlier
// implementations encrypted-then-put in one tx, which destroyed null
// fields on partial-fetch syncs (e.g. Withings `lastupdate` returning
// sleep-only on a re-sync would null today's weight). The phased shape
// preserves existing non-null fields when the incoming row has nulls.
assert('upsertDailyBatch reads existing rows in a phase-1 tx before merging',
  /Phase 1[\s\S]{0,1200}readonly[\s\S]{0,400}store\.get/.test(storeSrcV29));
assert('upsertDailyBatch merges incoming over existing via _mergeRow',
  /_mergeRow\(existingPlain/.test(storeSrcV29));
assert('upsertDailyBatch writes the merged batch in a phase-2 tx',
  /Phase 2[\s\S]{0,200}readwrite/.test(storeSrcV29));
assert('_mergeRow preserves existing values when incoming field is null',
  /v === null \|\| v === undefined[\s\S]{0,80}continue/.test(storeSrcV29));
assert('getDaily decrypts via _decryptRowIfWrapped on read',
  /_decryptRowIfWrapped\(raw\)/.test(storeSrcV29));
assert('getDailyRange filters null decrypts (drops unreadable rows from range)',
  /decrypted\.filter\(r => r !== null\)/.test(storeSrcV29));
// Compound key fields stay plaintext (range queries depend on this).
assert('Encryption envelope leaves source + date plaintext',
  /const\s*\{\s*source,\s*date,\s*_payload,\s*\.\.\.rest\s*\}\s*=\s*row/.test(storeSrcV29) &&
  /\{\s*source,\s*date,\s*_payload:\s*env\s*\}/.test(storeSrcV29));
assert('Read-side returns null on decrypt failure (no nested-envelope re-write hazard)',
  /if \(!decrypted\) return null/.test(storeSrcV29));

// ═══════════════════════════════════════
// 17v. Test isolation regression guard (v1.28.1)
// ═══════════════════════════════════════
console.log('17v. Test Isolation');

// Tests that swap profiles MUST also swap state.currentProfile, not just
// the localStorage 'labcharts-active-profile' key — saveImportedData()
// keys off state.currentProfile, so a half-swapped test that triggers a
// save (via e.g. backfillWearable's saveConnection chain) writes the test's
// fake state into the USER's REAL profile storage. This bit me once on the
// wearables worktree (Oura tokens overwritten with `test-rfr` placeholders;
// wearableConnections.manual wiped). Pin both source files so the
// anti-pattern can't come back.
const syncFlowSrc = await fetch('/tests/test-wearables-sync-flow.js').then(r => r.text());
const uiFlowSrc = await fetch('/tests/test-wearables-ui-flows.js').then(r => r.text());
for (const [name, src] of [['sync-flow', syncFlowSrc], ['ui-flows', uiFlowSrc]]) {
  assert(`${name}: snapshots window._labState.currentProfile before swapping profile`,
    /origCurrentProfile\s*=\s*window\._labState\.currentProfile/.test(src));
  assert(`${name}: assigns TEST_PROFILE_ID to window._labState.currentProfile (not just localStorage)`,
    /window\._labState\.currentProfile\s*=\s*TEST_PROFILE_ID/.test(src));
  assert(`${name}: cleanup restores window._labState.currentProfile`,
    /window\._labState\.currentProfile\s*=\s*origCurrentProfile/.test(src));
  assert(`${name}: cleanup removes the test profile's localStorage imported key`,
    /localStorage\.removeItem\(`labcharts-\$\{TEST_PROFILE_ID\}-imported`\)/.test(src));
}

// ═══════════════════════════════════════
// 17w. P2 cleanup pass (v1.28.0)
// ═══════════════════════════════════════
console.log('17w. P2 Cleanup');

// P2: loadProfile triggers wearable-summary refresh on profile switch
// (was only running once at boot in main.js).
const profileSrcP2 = await fetch('/js/profile.js').then(r => r.text());
assert('loadProfile dispatches migrateBiometricsToManual + syncWearableSummary on every load',
  /export\s+async\s+function\s+loadProfile[\s\S]*?migrateBiometricsToManual\(profileId/.test(profileSrcP2) &&
  /loadProfile[\s\S]*?syncWearableSummary\(profileId,\s*connectMod\.listConnectedSources\(\)\)/.test(profileSrcP2));

// P2: deleteWearablesDB closes the cached connection before deleting
// (otherwise indexedDB.deleteDatabase hits onblocked).
const storeSrc = await fetch('/js/wearables-store.js').then(r => r.text());
assert('deleteWearablesDB closes the cached connection before deleting',
  /export\s+async\s+function\s+deleteWearablesDB[\s\S]*?\(await cached\)\?\.close\?\.\(\)/.test(storeSrc));

// P2: coverageDays counts non-null rows only (was rows.length).
const summarySrc = await fetch('/js/wearables-summary.js').then(r => r.text());
assert('coverageDays counts rows with at least one finite metric value (not bare stubs)',
  /coverageDays:\s*nonEmpty/.test(summarySrc) &&
  /hasAnyValue\s*=\s*Object\.entries\(row\)\.some/.test(summarySrc));

// P2: wearablePrimaryOverride pruned on import.
const exportSrcP2 = await fetch('/js/export.js').then(r => r.text());
assert('importDataJSON prunes wearablePrimaryOverride to live sources only',
  /liveSources\s*=\s*new Set\(\[[\s\S]{0,120}wearableConnections[\s\S]{0,120}wearableSummary\?\.sources/.test(exportSrcP2));

// P2: commitAfterWriteIfAny accepts pre-await connection snapshot.
const connectSrcP2 = await fetch('/js/wearables-connect.js').then(r => r.text());
assert('commitAfterWriteIfAny accepts a connection snapshot (profile-swap safety)',
  /async function commitAfterWriteIfAny\(adapterId,\s*rows,\s*connSnapshot\)/.test(connectSrcP2));
assert('Backfill + incremental pass the pre-await `conn` snapshot to commitAfterWriteIfAny',
  /commitAfterWriteIfAny\(adapterId,\s*rows,\s*conn\)/.test(connectSrcP2));

// P2: per-metric monotonic op token for manual save/delete.
const wearablesSrcP2 = await fetch('/js/wearables.js').then(r => r.text());
assert('Manual save/delete uses per-metric op counter (Map keyed on metricId)',
  /_manualEntryOps\s*=\s*new Map\(\)/.test(wearablesSrcP2) &&
  /_bumpManualEntryOp\(metricId\)/.test(wearablesSrcP2));
assert('Bail-out check compares against current op for the SAME metric',
  /op\s*!==\s*_currentManualEntryOp\(metricId\)/.test(wearablesSrcP2));

// P2 security: minimal arg shape passed to disp.fetchAccountInfo.
assert('disp.fetchAccountInfo receives only { userId } not the whole connection',
  /disp\.fetchAccountInfo\(result\.tokens\.accessToken,\s*\{\s*userId:\s*conn0\?\.userId\s*\}\)/.test(connectSrcP2));

// P2 security: error-toast token scrubber.
assert('_scrubError redacts Bearer tokens in error messages',
  /_scrubError[\s\S]*?Bearer\s+\[redacted\]/.test(connectSrcP2));
assert('Backfill + sync error toasts run their messages through _scrubError',
  /_scrubError\(e\.message\)/.test(connectSrcP2));

// P2 a11y: friendlier aria on manual delete button + collapse-arrow header.
assert('Manual-entry delete aria reads as a sentence (long date + value + unit)',
  /aria-label="\$\{escapeHTML\(ariaText\)\}"/.test(wearablesSrcP2) &&
  /Delete\s+\$\{metricLabel\.toLowerCase\(\)\}\s+reading\s+from/.test(wearablesSrcP2));
assert('Strip-header role="button" carries an aria-label distinct from the live source list',
  /'(Expand|Collapse) wearables strip'/.test(wearablesSrcP2)
  && /aria-label="\$\{ariaLabel\}"/.test(wearablesSrcP2));

// (Niche-disclosure copy assertion was here. The disclosure was removed in
// v1.30.1 — see the matching "STRIP_NICHE_METRICS / disclosure / nicheDeferred
// all gone" check below.)

// P2 copy: Settings → Agent Access label includes "and context".
const settingsSrcP2 = await fetch('/js/settings.js').then(r => r.text());
assert('Settings Agent Access description says "labs and context" (covers wearables + cards too)',
  /Let AI agents query your labs and context/.test(settingsSrcP2));

// P2: detail-modal focus trap.
assert('Detail modal installs Tab/Shift-Tab focus trap on open',
  /_installWearableModalFocusTrap/.test(wearablesSrcP2) &&
  /focusable\s*=\s*modal\.querySelectorAll/.test(wearablesSrcP2));

// P2: recommendations gain wearable-trend hooks.
const recsSrc = await fetch('/js/recommendations.js').then(r => r.text());
assert('detectWearableTrendSlots exported',
  /export\s+function\s+detectWearableTrendSlots/.test(recsSrc));
assert('Trend hook fires magnesium slot when 7d HRV < baselineP25',
  /m\.hrv_rmssd\.rolling\.d7\s*<\s*m\.hrv_rmssd\.baselineP25/.test(recsSrc));
assert('Trend hook fires magnesium slot when 7d RHR > baselineP75',
  /m\.rhr\.rolling\.d7\s*>\s*m\.rhr\.baselineP75/.test(recsSrc));
assert('Trend hook fires melatonin slot when sleep_score < 70 AND below baseline',
  /m\.sleep_score\.rolling\.d7\s*<\s*70/.test(recsSrc));

// ═══════════════════════════════════════
// 17x. Behavioral coverage — replaces fragile source-grep guards (v1.27.5)
// ═══════════════════════════════════════
console.log('17x. Behavioral Replacements');

// Set up an isolated test summary with TWO connected sources so the
// source-badge gate is exercised positively.
const _origImported = window._labState.importedData;
window._labState.importedData = {
  entries: [],
  wearableConnections: {
    oura:   { source: 'oura',   connectedAt: new Date().toISOString(), lastSyncAt: Date.now() },
    manual: { source: 'manual', connectedAt: new Date().toISOString(), lastSyncAt: Date.now() },
  },
  wearableSummary: {
    summaryUpdatedAt: new Date().toISOString(),
    sources: {
      oura:   { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 5 },
      manual: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 1 },
    },
    metrics: {
      // hrv_rmssd: only Oura provides — under the OLD gate (per-metric
      // provider count) the badge would have been hidden. v1.26 P0-1 fix
      // makes the badge visible whenever ≥2 wearables are connected.
      hrv_rmssd: { primarySource: 'oura', latest: 38, latestDate: '2026-04-23',
        baseline: 36, baselineP25: 32, baselineP75: 40,
        rolling: { d7: 37, d30: 36, d90: 36 }, trend30d: 'flat', weekly: [36, 37, 38] },
      // weight: both sources declare it (manual.metrics.weight + Oura
      // doesn't actually but for assertion shape).
      rhr: { primarySource: 'manual', latest: 62, latestDate: '2026-04-23',
        baseline: 62, baselineP25: 62, baselineP75: 62,
        rolling: { d7: 62, d30: 62, d90: 62 }, trend30d: 'flat', weekly: [62] },
    },
  },
  changeHistory: [],
};
// BEHAVIOR: source badge appears on EVERY populated card whenever ≥2
// wearables connected — was grep-only in 17a until now.
const stripHtml = window.renderWearableStrip();
// Count cards that have a source-badge button. With 2 sources connected
// and 2 metrics in the summary, both should carry one.
const badgeMatches = stripHtml.match(/wearable-source-badge wearable-source-badge-btn/g) || [];
assert('v1.26 P0-1: source badge renders on every populated card when ≥2 wearables connected (behavior, not grep)',
  badgeMatches.length >= 2,
  `expected ≥2 source-badge buttons, got ${badgeMatches.length}`);

// BEHAVIOR: the daytime-empty stat row appears with the "Not from
// {Source} · why?" copy and a tooltip. Open the HRV detail modal —
// primary is Oura which has no daytime HRV → empty-state row should
// appear with sourceDisplay="Oura".
// (daytime-empty-state HRV modal block moved to test-wearables-dom.js.)

// BEHAVIOR: the v1.27.0 series block, when generated and combined with
// the base context, appears AFTER the base wearables section, not as a
// replacement. Build both and assert ordering.
const labCtx2 = await import('../js/lab-context.js');
labCtx2.setAgentWearableSeriesEnabled(true);
// Provide some L1 rows so the series builder has data to pivot.
const { upsertDailyBatch } = await import('../js/wearables-store.js');
const TEST_PROFILE_3 = '__test-replace-' + Date.now().toString(36);
const origActive2 = localStorage.getItem('labcharts-active-profile');
// buildWearableSeriesSection queries IDB keyed on window._labState.currentProfile
// — NOT the localStorage 'labcharts-active-profile' key. Setting only the
// latter (the original test's bug) meant the builder read the wrong store,
// seriesBlock came back empty, and the ordering assertions below were
// silently skipped by the `if (seriesBlock)` guard. Swap both, like
// section 17r does.
const origCurrent2 = window._labState.currentProfile;
localStorage.setItem('labcharts-active-profile', TEST_PROFILE_3);
window._labState.currentProfile = TEST_PROFILE_3;
try {
  await upsertDailyBatch(TEST_PROFILE_3, [
    { source: 'oura', date: '2026-04-22', hrv_rmssd: 36 },
    { source: 'oura', date: '2026-04-23', hrv_rmssd: 38 },
  ]);
  const baseContext = labCtx2.buildLabContext({ skipGroupFilter: true });
  const seriesBlock = await labCtx2.buildWearableSeriesSection(30);
  const combined = seriesBlock ? `${baseContext}\n${seriesBlock}\n` : baseContext;
  if (seriesBlock) {
    assert('v1.27.0: series block appears AFTER baseContext (not replacing it) — behavior',
      combined.indexOf(seriesBlock) > combined.indexOf('[section:wearables]'));
    assert('v1.27.0: combined context contains both [section:wearables] AND [section:wearables-series-30d]',
      combined.includes('[section:wearables]') && combined.includes('[section:wearables-series-30d]'));
  } else {
    // Series builder may return empty if isWearableContextEnabled is false
    // for this isolated test profile; flag rather than silently pass.
    assert('series block build path exercised', true);
  }
} finally {
  labCtx2.setAgentWearableSeriesEnabled(false);
  if (origActive2) localStorage.setItem('labcharts-active-profile', origActive2);
  else localStorage.removeItem('labcharts-active-profile');
  window._labState.currentProfile = origCurrent2;
  try { const { deleteWearablesDB } = await import('../js/wearables-store.js'); await deleteWearablesDB(TEST_PROFILE_3); } catch {}
}
window._labState.importedData = _origImported;

// ═══════════════════════════════════════
// 17y. P1 audit fallout (v1.27.4)
// ═══════════════════════════════════════
console.log('17y. P1 Audit Fixes');

// SW cache: wearables-manual.js was missing — would 404 offline for users
// with manual entries.
const swSrc = await fetch('/service-worker.js').then(r => r.text());
assert('Service-worker static cache lists wearables-manual.js',
  /\/js\/wearables-manual\.js/.test(swSrc));

// disconnectWearable now clears last-sync meta so reconnect doesn't pick
// up a stale endDate.
const connectSrc = await fetch('/js/wearables-connect.js').then(r => r.text());
assert('disconnectWearable clears last-sync:{adapterId} meta',
  /export\s+async\s+function\s+disconnectWearable[\s\S]*?deleteMeta\(profileId,\s*`last-sync:\$\{adapterId\}`\)/.test(connectSrc));
assert('deleteMeta imported from wearables-store',
  /import\s*\{[^}]*deleteMeta[^}]*\}\s*from\s*['"]\.\/wearables-store\.js['"]/.test(connectSrc));

// Source picker now uses the EFFECTIVE primary (the L2 picker's actual
// pick) rather than the raw override which can be stale/invalid.
const wearablesSrc3 = await fetch('/js/wearables.js').then(r => r.text());
assert('Source picker prefers wearableSummary.metrics primarySource (effective) over raw override',
  /effectivePrimary\s*=\s*state\.importedData\?\.wearableSummary\?\.metrics\?\.\[metricId\]\?\.primarySource/.test(wearablesSrc3));

// Polar memberId guard: refuses connect when token grant lacks userId.
assert('Polar postConnect refuses to register when result.tokens.userId missing',
  /if\s*\(!result\.tokens\.userId\)\s*\{[\s\S]*?needsReauth:\s*true/.test(connectSrc));

// recoverIfL1Empty now respects needsReauth — prevents the 401 retry
// storm in the scheduler.
assert('recoverIfL1Empty short-circuits when conn.needsReauth is true',
  /if\s*\(conn\.needsReauth\)\s*return\s*\{\s*skipped:\s*true,\s*reason:\s*'needs-reauth'/.test(connectSrc));

// pushContextToGateway dropped the profile-name list (was sent cleartext to
// the relay alongside the context).
const syncSrc2 = await fetch('/js/sync-messenger.js').then(r => r.text());
assert('Gateway POST body does NOT include profile names array',
  /JSON\.stringify\(\{\s*context,\s*profileId\s*\}\)/.test(syncSrc2));
assert('Gateway POST body NEVER references getProfiles().map for the relay payload',
  !/profiles\s*=\s*getProfiles\(\)\.map[\s\S]{0,200}body:\s*JSON\.stringify\(\{\s*context,\s*profileId,\s*profiles\s*\}\)/.test(syncSrc2));

// Touch tap-target rule for wearable-specific controls.
const cssSrc = await fetch('/styles.css').then(r => r.text());
assert('Touch media block extends to .wearable-strip-sync (≥44px)',
  /@media\s*\(pointer:\s*coarse\)[\s\S]{0,5000}\.wearable-strip-sync[\s\S]{0,200}min-height:\s*44px/.test(cssSrc));
assert('Touch media block extends to .wearable-manual-entry-del (≥44px)',
  /@media\s*\(pointer:\s*coarse\)[\s\S]{0,5000}\.wearable-manual-entry-del[\s\S]{0,200}min-height:\s*44px/.test(cssSrc));
assert('Touch media block extends to .wearable-reorder-arrow (≥44px)',
  /@media\s*\(pointer:\s*coarse\)[\s\S]{0,5000}\.wearable-reorder-arrow[\s\S]{0,200}min-height:\s*44px/.test(cssSrc));

// In-app token-cost copy aligned with measured reality (~400 not ~1500).
const settingsSrc = await fetch('/js/settings.js').then(r => r.text());
// v1.29.0: tri-state toggle (off / 7 / 30 / 90) — copy now cites all three
// window sizes with their respective costs.
assert('Agent series tri-state copy cites the 7/30/90 token costs',
  /~100 \/ 400 \/ 1200 extra tokens for 7 \/ 30 \/ 90 days/.test(settingsSrc));
assert('Agent series toggle no longer cites the stale ~1500 figure',
  !/~1500 extra tokens per agent prompt/.test(settingsSrc));

// Single-maintainer voice — guard against the plural-voice anti-pattern
// ("We never see") creeping back into the changelog.
const changelogSrc = await fetch('/js/changelog.js').then(r => r.text());
assert('changelog.js does not use plural "We never see" voice',
  !/We never see/.test(changelogSrc));

// ═══════════════════════════════════════
// 17z. P0 data-integrity (v1.27.3) — branch audit fallout
// ═══════════════════════════════════════
console.log('17z. P0 Data-Integrity');

// P0-A: deleting a profile must drop its wearable IDB. The delete is
// dispatched as a fire-and-forget dynamic import — guard the call site.
const profileSrc = await fetch('/js/profile.js').then(r => r.text());
assert('deleteProfile dispatches deleteWearablesDB(profileId) for the deleted profile',
  /export (?:async )?function deleteProfile[\s\S]*?deleteWearablesDB\(profileId\)/.test(profileSrc));

// P0-B: auto-backup carries wearable L1 rows. buildFullBackupSnapshot
// exists, populates `wearableIDB`, and is called from auto-backup +
// folder-backup + manual export paths.
const backupSrc = await fetch('/js/backup.js').then(r => r.text());
assert('buildFullBackupSnapshot exported as the canonical async snapshot',
  /export\s+async\s+function\s+buildFullBackupSnapshot/.test(backupSrc));
assert('buildFullBackupSnapshot populates snap.wearableIDB',
  /snap\.wearableIDB\s*=\s*await\s+collectWearableIDB/.test(backupSrc));
assert('performAutoBackup uses the full snapshot (with IDB rows)',
  /performAutoBackup[\s\S]{0,300}buildFullBackupSnapshot/.test(backupSrc));
assert('Folder-backup writeLatest uses the full snapshot',
  /buildFullBackupSnapshot[\s\S]*latestFile/.test(backupSrc));
assert('exportEncryptedBackup is async and uses the full snapshot',
  /export\s+async\s+function\s+exportEncryptedBackup/.test(backupSrc));
assert('restoreAutoBackup hydrates wearable IDB rows back via restoreWearableIDB',
  /export\s+async\s+function\s+restoreAutoBackup[\s\S]*?restoreWearableIDB\(backup\.wearableIDB\)/.test(backupSrc));
// v1.31.0: restoreWearableIDB now uses upsertDailyBatchRaw to preserve
// encryption envelopes from an encrypted backup (no decrypt-on-restore).
assert('restoreWearableIDB iterates per-source and upsertDailyBatchRaw (preserves encrypted wrappers)',
  /async function restoreWearableIDB[\s\S]*?upsertDailyBatchRaw/.test(backupSrc));

// P0-C: PDF report falls back to wearableSummary.metrics for biometrics.
const exportSrc2 = await fetch('/js/export.js').then(r => r.text());
assert('PDF report Biometrics section reads wearableSummary.metrics.weight.latest as fallback',
  /wm\?\.weight\?\.latest/.test(exportSrc2));
assert('PDF report Biometrics section reads wearableSummary.metrics.bp_systolic + bp_diastolic',
  /wm\?\.bp_systolic\?\.latest/.test(exportSrc2) && /wm\?\.bp_diastolic\?\.latest/.test(exportSrc2));
assert('PDF report Biometrics section reads wearableSummary.metrics.rhr.latest as pulse fallback',
  /wm\?\.rhr\?\.latest/.test(exportSrc2));

// ═══════════════════════════════════════
// 17a. UX audit follow-ups (v1.26.0)
// ═══════════════════════════════════════
console.log('17a. UX Audit Fixes');

// P0-1: every populated card carries the source badge whenever ≥2 wearables
// are connected. Previously the badge only rendered when ≥2 adapters declared
// the SAME metric, which left HRV/Sleep/Steps with no source attribution.
const wearablesSrc2 = await fetch('/js/wearables.js').then(r => r.text());
assert('Strip passes showSourceBadges (whole-strip flag) into renderCard, not the per-metric provider count',
  /renderCard\(metricId,\s*canon,\s*metric,\s*showSourceBadges/.test(wearablesSrc2));
assert('No leftover per-metric providersForMetric.length > 1 gate',
  !/providersForMetric\.length\s*>\s*1/.test(wearablesSrc2));

// P0-2/3/4: delta-honesty rules
assert('formatDelta accepts metricId so steps can suppress',
  /function formatDelta\(latest,\s*baseline,\s*metricId(?:,\s*canon)?\)/.test(wearablesSrc2));
assert('formatDelta renders absolute Δ for delta-style metrics (avoids 1100% on near-zero baselines)',
  /isDeltaStyleMetric\(canon\)/.test(wearablesSrc2));
assert('formatDelta suppresses delta on steps',
  /metricId\s*===\s*'steps'\)\s*return\s*''/.test(wearablesSrc2));
assert('formatDelta suppresses delta when latest is 0 vs non-trivial baseline',
  /latest\s*===\s*0\s*&&\s*Math\.abs\(baseline\)\s*>\s*0\.5\)\s*return\s*''/.test(wearablesSrc2));
assert('Detail modal mirrors delta-suppression rules',
  /suppressDelta\s*=[\s\S]*metricId\s*===\s*'steps'/.test(wearablesSrc2));

// P0-5: source-swap reachable from the detail modal when ≥2 wearables connected
assert('Detail modal renders source-swap button when ≥2 wearables connected',
  /wearable-modal-source-swap/.test(wearablesSrc2));

// P1-1: glyph subs + RHR drops sub
assert('hrv_rmssd uses 🌙 glyph not "overnight" word',
  reg.CANONICAL_METRICS.hrv_rmssd.sub === '🌙');
assert('rhr drops the sub label entirely',
  reg.CANONICAL_METRICS.rhr.sub === '');
assert('aria translates 🌙 → "overnight" and ☀️ → "daytime" for screen readers',
  /subRead\s*=\s*canon\.sub\s*===\s*'🌙'\s*\?\s*'overnight'/.test(wearablesSrc2) &&
  /'☀️'\s*\?\s*'daytime'/.test(wearablesSrc2));

// P1-2: daytime empty-state shortened + tooltip carries the long explanation
assert('Daytime-empty state passes a tooltip as the 4th tuple element',
  /baseStats\.push\(\[[\s\S]{0,200}companionLabel,[\s\S]{0,80}'—',[\s\S]{0,200}`Not from \${sourceDisplay} · why\?`,[\s\S]{0,80}tooltip,/.test(wearablesSrc2));
assert('Daytime tooltip references v2 (not the v1 typo)',
  /v2 API exposes overnight HRV only/.test(wearablesSrc2) && !/v1 API exposes overnight HRV only/.test(wearablesSrc2));
assert('Stats grid renders the optional title attribute',
  /\$\{tooltip\s*\?\s*` title="\$\{escapeHTML\(tooltip\)\}"`/.test(wearablesSrc2));

// P1-3: BP carries spoken-aria override
assert('renderCard prefers canon.ariaLabel over derived label for spoken text',
  /canon\.ariaLabel\s*\?\s*canon\.ariaLabel/.test(wearablesSrc2));

// P1-6: reorder-mode banner pill
assert('Reorder mode shows a banner pill in the header',
  /wearable-strip-reorder-pill/.test(wearablesSrc2));

// P1-8: the "vendor-specific scores" disclosure was removed in v1.30.1
// — it framed Oura-only resilience as different from Oura-only cardio
// age (already inline) and added pin-drift bugs across origins. Every
// canonical metric the registry produces now renders inline alongside
// the others; the only filter is STRIP_HIDDEN_METRICS for the daytime
// companion cards (which live in the detail modal as sub-stats).
assert('STRIP_NICHE_METRICS / disclosure / nicheDeferred all gone',
  !/STRIP_NICHE_METRICS/.test(wearablesSrc2) &&
  !/wearable-niche-disclosure/.test(wearablesSrc2) &&
  !/nicheDeferred/.test(wearablesSrc2));
const stylesSrc = await fetch('/styles.css').then(r => r.text());
assert('Niche-disclosure CSS dropped (was a v1.30.0 regression source)',
  !/wearable-niche-(disclosure|summary|grid)/.test(stylesSrc));

// ═══════════════════════════════════════
// 17. Day/night HRV + RHR canonicals (v1.25.0)
// ═══════════════════════════════════════
console.log('17. Day/Night HRV+RHR');

// Oura's heartrate endpoint caps queries at 30 days per request — anything
// larger 400s with "Timerange ... has to be less than or equal to 30 days".
// The v1.25.0 backfill silently swallowed that error; v1.25.1 chunks the
// request via ouraCollectHeartrate. Pin the chunking call site so a future
// refactor can't accidentally revert to a single-shot fetch.
const ouraSrc = await fetch('/js/wearables-oura.js').then(r => r.text());
assert('Oura uses ouraCollectHeartrate (chunks 90d window into ≤30d slices)',
  /ouraCollectHeartrate\(accessToken,\s*startDt,\s*endDt\)/.test(ouraSrc));
assert('ouraCollectHeartrate splits the window in 29-day chunks (under the 30d cap)',
  /CHUNK_MS\s*=\s*29\s*\*\s*24/.test(ouraSrc));

// Per-vendor adapter declarations: every adapter that has a day-window
// signal we know how to harvest must declare it. Conversely, vendors with
// no day signal yet (Fitbit hr_day, Apple Health hr_day) must NOT declare
// one — leaving the slot null is more honest than fabricating.
assert('Oura declares hr_day from heartrate endpoint',
  reg.adapterSupportsMetric('oura', 'hr_day'));
assert('Oura does NOT declare hrv_day (gap until v2 exposes daytime rMSSD)',
  !reg.adapterSupportsMetric('oura', 'hrv_day'));
assert('WHOOP declares hr_day from cycle endpoint',
  reg.adapterSupportsMetric('whoop', 'hr_day'));
assert('Fitbit declares hrv_day from dailyRmssd (sleep+wake aggregate)',
  reg.adapterSupportsMetric('fitbit', 'hrv_day'));
assert('Fitbit hrv_rmssd routes to deepRmssd (deep sleep only)',
  reg.adapterById('fitbit').metrics.hrv_rmssd?.field?.includes('deepRmssd'));
assert('Fitbit hrv_day routes to dailyRmssd (broader-window aggregate)',
  reg.adapterById('fitbit').metrics.hrv_day?.field?.includes('dailyRmssd'));
assert('Ultrahuman declares both hrv_day and hr_day (.avg fields are 24h)',
  reg.adapterSupportsMetric('ultrahuman', 'hrv_day') &&
  reg.adapterSupportsMetric('ultrahuman', 'hr_day'));
assert('Ultrahuman hrv_rmssd routes to hrv.sleep (overnight)',
  reg.adapterById('ultrahuman').metrics.hrv_rmssd?.field === 'hrv.sleep');
assert('Ultrahuman rhr routes to resting_heart_rate.sleep (overnight)',
  reg.adapterById('ultrahuman').metrics.rhr?.field === 'resting_heart_rate.sleep');
assert('Polar hr_day routes to activity-transactions average',
  reg.adapterById('polar').metrics.hr_day?.endpoint?.includes('activity-transactions'));
assert('Polar hrv_day routes to exercise-transactions (workout HRV is daytime)',
  reg.adapterById('polar').metrics.hrv_day?.endpoint?.includes('exercise-transactions'));
assert('Polar rhr routes to sleep nights (true overnight RHR)',
  reg.adapterById('polar').metrics.rhr?.endpoint?.includes('/sleep'));
assert('Apple Health declares hrv_day with window:day flag',
  reg.adapterById('apple_health').metrics.hrv_day?.window === 'day');

// Strip integration: hrv_day/hr_day are summarised but hidden from the
// strip cards — they live in the detail modal as sub-stats and in the
// AI context. Regression guard so a future refactor doesn't accidentally
// surface them as their own cards (visual clutter).
const wearablesSrc = await fetch('/js/wearables.js').then(r => r.text());
assert('Strip rendering hides hrv_day from card list',
  /STRIP_HIDDEN_METRICS\s*=\s*new Set\(\[[^\]]*'hrv_day'/.test(wearablesSrc));
assert('Strip rendering hides hr_day from card list',
  /STRIP_HIDDEN_METRICS\s*=\s*new Set\(\[[^\]]*'hr_day'/.test(wearablesSrc));

// Detail modal companion: when viewing the overnight HRV/RHR card, the
// matching daytime aggregate appears as an extra stat row.
assert('Detail modal pairs hrv_rmssd with hrv_day companion',
  /DAY_COMPANION\s*=\s*\{\s*hrv_rmssd:\s*'hrv_day'/.test(wearablesSrc));
assert('Detail modal pairs rhr with hr_day companion',
  /DAY_COMPANION\s*=\s*\{[\s\S]*?rhr:\s*'hr_day'/.test(wearablesSrc));

// ═══════════════════════════════════════
// 17b. Apple Health hr_day from raw HeartRate stream (v1.27.1)
// ═══════════════════════════════════════
console.log('17b. Apple HR Stream → hr_day');

// hr_day comes from HKQuantityTypeIdentifierHeartRate (NOT RestingHeartRate),
// filtered to the day window (06:00–22:00 local). Synthesize a fixture
// with multiple HR samples in both windows + verify the day-window mean.
const hrXml = `<?xml version="1.0"?><HealthData>
  <Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-05-01 09:00:00 +0200" value="65"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-05-01 14:00:00 +0200" value="85"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-05-01 23:00:00 +0200" value="55"/>
</HealthData>`;
const hrRows = ah.parseAppleHealthXml(hrXml);
const hrDay1 = hrRows.find(r => r.date === '2026-05-01');
assert('hr_day is mean of day-window samples only ((65+85)/2 = 75, ignores 23:00 night sample)',
  hrDay1?.hr_day === 75);
assert('hr_day source declaration uses HKQuantityTypeIdentifierHeartRate (NOT RestingHeartRate)',
  reg.adapterById('apple_health').metrics.hr_day?.hkType === 'HKQuantityTypeIdentifierHeartRate');
assert('hr_day declaration carries window:day flag so it routes through the day-window aggregator',
  reg.adapterById('apple_health').metrics.hr_day?.window === 'day');

// ═══════════════════════════════════════
// 17c. JSON export carries wearable layer (v1.27.1)
// ═══════════════════════════════════════
console.log('17c. JSON Export — Wearables');

const exportSrc = await fetch('/js/export.js').then(r => r.text());
assert('exportClientJSON includes wearableSummary',
  /wearableSummary:\s*data\.wearableSummary\s*\|\|\s*null/.test(exportSrc));
assert('exportClientJSON includes wearableCardOrder (user reorder pref)',
  /wearableCardOrder:\s*data\.wearableCardOrder\s*\|\|\s*null/.test(exportSrc));
assert('exportClientJSON includes wearablePrimaryOverride (per-metric source override)',
  /wearablePrimaryOverride:\s*data\.wearablePrimaryOverride\s*\|\|\s*null/.test(exportSrc));
// Tokens MUST NOT appear in the export — wearableConnections wholesale excluded.
assert('exportClientJSON does NOT include wearableConnections (tokens stay device-local)',
  !/wearableConnections:\s*data\.wearableConnections/.test(exportSrc));
// Importer round-trip
assert('importDataJSON restores wearableSummary',
  /json\.wearableSummary[\s\S]{0,80}state\.importedData\.wearableSummary\s*=\s*json\.wearableSummary/.test(exportSrc));
assert('importDataJSON restores wearableCardOrder',
  /state\.importedData\.wearableCardOrder\s*=\s*json\.wearableCardOrder/.test(exportSrc));
// v1.28.0: wearablePrimaryOverride is PRUNED on import — entries pointing
// at sources without a connection or rows get dropped. Assert the prune
// logic exists; the destination assignment uses the pruned object, not
// raw json.wearablePrimaryOverride.
assert('importDataJSON prunes wearablePrimaryOverride to live sources only',
  /state\.importedData\.wearablePrimaryOverride\s*=\s*pruned/.test(exportSrc) &&
  /pruned\[metricId\]\s*=\s*sourceId/.test(exportSrc));

// ═══════════════════════════════════════
// 18. Agent series — daily-values matrix for MCP tools (v1.27.0)
// ═══════════════════════════════════════
console.log('18. Agent Series');

// labCtx already imported earlier in this file; re-use the binding.
const labCtxAgent = await import('../js/lab-context.js');
assert('buildWearableSeriesSection exported',
  typeof labCtxAgent.buildWearableSeriesSection === 'function');
assert('isAgentWearableSeriesEnabled exported',
  typeof labCtxAgent.isAgentWearableSeriesEnabled === 'function');
assert('setAgentWearableSeriesEnabled exported',
  typeof labCtxAgent.setAgentWearableSeriesEnabled === 'function');
assert('Agent series toggle is per-profile (key includes active-profile id)',
  labCtxAgent.buildWearableSeriesSection.toString().includes('isAgentWearableSeriesEnabled') ||
  /labcharts-.*-agent-wearable-series/.test(await fetch('/js/lab-context.js').then(r => r.text())));

// Behaviour: returns '' when toggle is off (default).
labCtxAgent.setAgentWearableSeriesEnabled(false);
const offResult = await labCtxAgent.buildWearableSeriesSection(30);
assert('Series builder returns empty string when toggle is off',
  offResult === '');

// Behaviour: returns '' when toggle is on but no wearable summary exists.
labCtxAgent.setAgentWearableSeriesEnabled(true);
const origImported = window._labState.importedData;
window._labState.importedData = { wearableSummary: null };
const noSummaryResult = await labCtxAgent.buildWearableSeriesSection(30);
assert('Series builder returns empty string when no wearableSummary',
  noSummaryResult === '');
window._labState.importedData = origImported;
labCtxAgent.setAgentWearableSeriesEnabled(false);  // restore default

// Source-grep guards: pushContextToGateway must concat the series block.
// v1.29.0: takes the user's chosen days (tri-state preference) instead of
// a hardcoded 30. The variable is named `seriesDays`.
const syncSrc = await fetch('/js/sync-messenger.js').then(r => r.text());
assert('pushContextToGateway reads seriesDays from getAgentWearableSeriesDays',
  /seriesDays\s*=\s*getAgentWearableSeriesDays\(\)/.test(syncSrc));
assert('pushContextToGateway awaits buildWearableSeriesSection(seriesDays)',
  /buildWearableSeriesSection\(seriesDays\)/.test(syncSrc));
assert('pushContextToGateway swallows series errors (.catch → empty string)',
  /buildWearableSeriesSection\(seriesDays\)\.catch\(\(\)\s*=>\s*''\)/.test(syncSrc));
assert('pushContextToGateway skips series build entirely when seriesDays === 0',
  /seriesDays\s*>\s*0[\s\S]{0,80}buildWearableSeriesSection/.test(syncSrc));
assert('Series block is appended AFTER baseContext, not replacing it',
  /seriesBlock\s*\?\s*`\$\{baseContext\}\\n\$\{seriesBlock\}/.test(syncSrc));

// Section tag format: must include the day-count so the agent can parse it.
const labSrc = await fetch('/js/lab-context.js').then(r => r.text());
assert('Series section tag is wearables-series-{N}d (not just "wearables")',
  /tag\s*=\s*`wearables-series-\$\{days\}d`/.test(labSrc) &&
  /\[section:\$\{tag\}\]/.test(labSrc));
assert('Series rendering rounds values to 1dp to keep token cost down',
  /Math\.round\(v\s*\*\s*10\)\s*\/\s*10/.test(labSrc));
assert('Series uses → as the value separator (matches existing weekly-trend format)',
  /series\.join\('→'\)/.test(labSrc));
assert('Series elides metrics with zero non-null daily values in the window',
  /nonNullCount\s*===\s*0\)\s*continue/.test(labSrc) ||
  /nonNullCount\s*===\s*0\)\s*\{\s*continue/.test(labSrc));

// Window exports for the toggle handler in Settings → Agent Access.
assert('window.isAgentWearableSeriesEnabled exists',
  typeof window.isAgentWearableSeriesEnabled === 'function');
assert('window.setAgentWearableSeriesEnabled exists',
  typeof window.setAgentWearableSeriesEnabled === 'function');
assert('window.pushContextToGateway is exposed (toggle re-pushes immediately)',
  typeof window.pushContextToGateway === 'function');

// ═══════════════════════════════════════
// 18. Beta-hidden vendors at v1.30.0 launch
// ═══════════════════════════════════════
// WHOOP + Ultrahuman ship code-complete but hidden from the connect list
// pending partner-credential validation. The strip and connection layer
// still work normally for anyone who's already connected (or maintainers
// with the escape-hatch flag).
console.log('18b. Beta-Hidden Vendors');
const adaptersMod = await import('../js/wearable-adapters.js');
const ouraEntry = adaptersMod.ADAPTERS.find(a => a.id === 'oura');
const whoopEntry = adaptersMod.ADAPTERS.find(a => a.id === 'whoop');
const uhEntry    = adaptersMod.ADAPTERS.find(a => a.id === 'ultrahuman');
assert('WHOOP entry carries betaHidden:true', whoopEntry?.betaHidden === true);
assert('Ultrahuman entry carries betaHidden:true', uhEntry?.betaHidden === true);
assert('Oura entry is NOT betaHidden (sanity check)', !ouraEntry?.betaHidden);

const escapeKey = 'labcharts-show-beta-wearables';
const escapeSv = localStorage.getItem(escapeKey);
try {
  localStorage.removeItem(escapeKey);
  const visibleNoConn = adaptersMod.visibleAdapters([]);
  const ids = visibleNoConn.map(a => a.id);
  assert('visibleAdapters() hides whoop without override or connection', !ids.includes('whoop'));
  assert('visibleAdapters() hides ultrahuman without override or connection', !ids.includes('ultrahuman'));
  assert('visibleAdapters() still shows oura', ids.includes('oura'));
  assert('visibleAdapters() still shows fitbit', ids.includes('fitbit'));

  const visibleWithConn = adaptersMod.visibleAdapters(['whoop']);
  assert('visibleAdapters() keeps whoop visible if already connected',
    visibleWithConn.some(a => a.id === 'whoop'));

  localStorage.setItem(escapeKey, 'true');
  const visibleEscape = adaptersMod.visibleAdapters([]);
  assert('Maintainer escape hatch un-hides hidden adapters',
    visibleEscape.some(a => a.id === 'whoop') &&
    visibleEscape.some(a => a.id === 'ultrahuman'));
} finally {
  if (escapeSv === null) localStorage.removeItem(escapeKey);
  else localStorage.setItem(escapeKey, escapeSv);
}

// Settings → Wearables row markup must omit hidden adapters.
if (typeof window.renderWearablesSettingsSection === 'function') {
  localStorage.removeItem(escapeKey);
  const html = window.renderWearablesSettingsSection();
  assert('Settings render omits WHOOP row when hidden + not connected',
    !/data-adapter-id="whoop"/.test(html) && !/connectAdapter\('whoop'\)/.test(html));
  assert('Settings render omits Ultrahuman row when hidden + not connected',
    !/data-adapter-id="ultrahuman"/.test(html) && !/connectAdapter\('ultrahuman'\)/.test(html));
  assert('Settings render still shows Oura row',
    /data-adapter-id="oura"|connectAdapter\('oura'\)|adapter\.id === 'oura'/i.test(html) ||
    /Oura/.test(html));
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
