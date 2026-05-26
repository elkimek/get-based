#!/usr/bin/env node
// test-wearables-sync-flow.js — orchestration end-to-end. Mocks the proxy
// fetch + a fake connection record, drives the actual backfillWearable /
// incrementalSyncWearable / syncWearableSummary / disconnectWearable paths,
// and asserts the IDB / state side-effects + L2 summary recompute + last-sync
// meta.
//
// Run: node tests/test-wearables-sync-flow.js  (or via npm test)
//
// Full port — no DOM. IndexedDB runs via fake-indexeddb; the test mocks
// window.fetch for the /api/proxy path and falls through to the fs-backed
// fetch shim for source-inspection reads.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

// fs-backed fetch shim — installed BEFORE the test body so the test's
// `realFetch = window.fetch` snapshot captures it, and mockFetch's
// non-/api/proxy fall-through resolves `fetch('/js/X')` source reads.
const _nodeFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url) && url !== '/api/proxy') {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _nodeFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Wearables Sync-Flow Tests ===\n');

await import('../js/state.js');
const connect = await import('../js/wearables-connect.js');
const store = await import('../js/wearables-store.js');
const summary = await import('../js/wearables-summary.js');
const manual = await import('../js/wearables-manual.js');
await import('../js/sync.js'); // registers window.pushContextToGateway

// ─────────────────────────────────────────────────────────
// Test profile + harness — isolate state so the live profile is untouched.
// ─────────────────────────────────────────────────────────
const TEST_PROFILE_ID = 'sync-flow-test-' + Date.now().toString(36);
const origActiveProfile = localStorage.getItem('labcharts-active-profile');
// CRITICAL: saveImportedData() keys off state.currentProfile, NOT the
// localStorage active-profile entry. Snapshot AND restore both.
const origCurrentProfile = window._labState.currentProfile;
localStorage.setItem('labcharts-active-profile', TEST_PROFILE_ID);
window._labState.currentProfile = TEST_PROFILE_ID;

const origState = window._labState.importedData;
window._labState.importedData = {
  entries: [],
  wearableConnections: {},
  wearableSummary: null,
  changeHistory: [],
};

const realFetch = window.fetch;
let routes = [];
let calls = [];
function mockFetch(input, init) {
  const url = (typeof input === 'string') ? input : input?.url;
  if (url !== '/api/proxy') return realFetch.call(window, input, init);
  let body = {};
  try { body = JSON.parse(init?.body || '{}'); } catch {}
  calls.push({ url: body.url, method: body.method });
  for (const r of routes) {
    const ok = (typeof r.matcher === 'string') ? body.url?.includes(r.matcher) : r.matcher.test(body.url || '');
    if (ok) {
      return Promise.resolve(new Response(JSON.stringify(r.body), {
        status: r.status || 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
  }
  return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
}
function installRoutes(rs) { routes = rs; calls = []; window.fetch = mockFetch; }
function restore() { window.fetch = realFetch; }

// Fake-connect Oura so wearables-connect.js sees an authenticated state.
function fakeConnect(adapterId) {
  window._labState.importedData.wearableConnections[adapterId] = {
    accessToken: 'test-' + adapterId + '-token',
    refreshToken: 'test-' + adapterId + '-refresh',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h fresh
    connectedAt: new Date().toISOString(),
    lastSyncAt: 0,
    account: { email: 'test@example.invalid' },
  };
}

async function wipeWearableIDB() {
  try { await store.clearSource(TEST_PROFILE_ID, 'manual'); } catch {}
  try { await store.clearSource(TEST_PROFILE_ID, 'oura'); } catch {}
  try { await store.clearSource(TEST_PROFILE_ID, 'fitbit'); } catch {}
}
await wipeWearableIDB();

// ═══════════════════════════════════════
// 0. Manual entries outside vendor window
// ═══════════════════════════════════════
console.log('0. Manual All-History Summary');
const oldManualDate = '2025-05-01';
await manual.logManualMetric(TEST_PROFILE_ID, 'rhr', { date: oldManualDate, value: 57 });
const oldManualRows = await store.getDailyRange(TEST_PROFILE_ID, 'manual', '2025-01-01', '2025-12-31');
assert('Older manual RHR row is persisted in L1',
  oldManualRows.some(r => r.date === oldManualDate && r.rhr === 57));
const oldManualSync = await summary.syncWearableSummary(TEST_PROFILE_ID, connect.listConnectedSources());
const oldManualSummary = window._labState.importedData?.wearableSummary;
assert('Older manual RHR writes an L2 summary metric outside the 90d vendor window',
  oldManualSync.wrote === true &&
  oldManualSummary?.metrics?.rhr?.latest === 57 &&
  oldManualSummary.metrics.rhr.latestDate === oldManualDate,
  JSON.stringify(oldManualSummary?.metrics?.rhr));
assert('Manual source coverage counts the old row',
  oldManualSummary?.sources?.manual?.coverageDays === 1,
  JSON.stringify(oldManualSummary?.sources?.manual));
await store.clearSource(TEST_PROFILE_ID, 'manual');
delete window._labState.importedData.wearableConnections.manual;
window._labState.importedData.wearableSummary = null;

// ═══════════════════════════════════════
// 1. backfillWearable — full pull populates IDB + meta
// ═══════════════════════════════════════
console.log('1. Backfill');
fakeConnect('oura');
try {
  installRoutes([
    { matcher: 'usercollection/sleep', body: {
      data: [
        { day: '2026-04-20', total_sleep_duration: 26000, average_hrv: 38, average_heart_rate: 60, lowest_heart_rate: 54 },
        { day: '2026-04-21', total_sleep_duration: 25000, average_hrv: 42, average_heart_rate: 58, lowest_heart_rate: 52 },
        { day: '2026-04-22', total_sleep_duration: 27000, average_hrv: 40, average_heart_rate: 59, lowest_heart_rate: 53 },
      ], next_token: null,
    }},
    { matcher: 'usercollection/daily_sleep', body: { data: [
      { day: '2026-04-20', score: 78 },
      { day: '2026-04-21', score: 82 },
      { day: '2026-04-22', score: 75 },
    ], next_token: null }},
    { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
    { matcher: /usercollection\//, body: { data: [], next_token: null }},
  ]);

  const result = await connect.backfillWearable('oura', 90);
  assert('backfillWearable returns rows count', typeof result.rows === 'number');
  assert('backfillWearable returns startDate', !!result.startDate);
  assert('backfillWearable returns endDate', !!result.endDate);
  assert('backfillWearable produced ≥3 rows from the sleep payload', result.rows >= 3);

  const rows = await store.getDailyRange(TEST_PROFILE_ID, 'oura', '2026-04-19', '2026-04-25');
  assert('Oura rows persisted to L1 IDB', rows.length >= 3);
  const day20 = rows.find(r => r.date === '2026-04-20');
  assert('Persisted row carries hrv_rmssd from sleep payload', day20?.hrv_rmssd === 38);
  assert('Persisted row carries rhr from sleep lowest_heart_rate', day20?.rhr === 54);
  assert('Persisted row carries sleep_score from daily_sleep', day20?.sleep_score === 78);

  const meta = await store.getMeta(TEST_PROFILE_ID, 'last-sync:oura');
  assert('last-sync meta written after backfill', !!meta);
  assert('last-sync meta carries rows count', typeof meta?.rows === 'number');
  assert('last-sync meta carries startDate + endDate', !!meta?.startDate && !!meta?.endDate);

  const conn = window._labState.importedData.wearableConnections.oura;
  assert('Connection.lastSyncAt updated post-backfill', conn?.lastSyncAt > 0);
} finally { restore(); }

// ═══════════════════════════════════════
// 2. syncWearableSummary — recomputes L2 from L1 rows
// ═══════════════════════════════════════
console.log('2. L2 Recompute');
const sync2 = await summary.syncWearableSummary(TEST_PROFILE_ID, connect.listConnectedSources());
assert('syncWearableSummary writes on first call (initial summary, no prior)',
  sync2.wrote === true && sync2.reason === 'initial');
const sumState = window._labState.importedData?.wearableSummary;
assert('wearableSummary persisted into state.importedData', !!sumState);
assert('wearableSummary.metrics carries hrv_rmssd entry from IDB rows',
  !!sumState?.metrics?.hrv_rmssd);
assert('hrv_rmssd primarySource is oura (auto-picker)',
  sumState?.metrics?.hrv_rmssd?.primarySource === 'oura');
assert('hrv_rmssd weekly array has at least one bucket',
  Array.isArray(sumState?.metrics?.hrv_rmssd?.weekly) &&
  sumState.metrics.hrv_rmssd.weekly.length >= 1);
assert('summary.sources.oura.coverageDays > 0 after backfill',
  sumState?.sources?.oura?.coverageDays > 0);

// ═══════════════════════════════════════
// 3. incrementalSyncWearable — uses lastSync.endDate as start
// ═══════════════════════════════════════
console.log('3. Incremental Sync');
try {
  let observedStart = null;
  installRoutes([
    { matcher: 'usercollection/sleep', body: { data: [], next_token: null }},
    { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
    { matcher: /usercollection\//, body: { data: [], next_token: null }},
  ]);
  const origMockFetch = window.fetch;
  window.fetch = (input, init) => {
    if (input === '/api/proxy' && observedStart === null) {
      try {
        const body = JSON.parse(init.body);
        const m = body.url?.match(/start_date=(\d{4}-\d{2}-\d{2})/);
        if (m) observedStart = m[1];
      } catch {}
    }
    return origMockFetch.call(window, input, init);
  };
  await connect.incrementalSyncWearable('oura');
  assert('incrementalSync requests start_date ≥ 2026-01-01 (no full re-pull)',
    observedStart !== null && observedStart >= '2026-01-01',
    `observed start_date=${observedStart}`);
} finally { restore(); }

// 3b. Force-mode incrementalSync — when the user clicks "Sync now" we pass
// force:true so the window is at least 7 days back.
try {
  let observedStartForce = null;
  installRoutes([
    { matcher: 'usercollection/sleep', body: { data: [], next_token: null }},
    { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
    { matcher: /usercollection\//, body: { data: [], next_token: null }},
  ]);
  const todayIso = new Date().toISOString().slice(0, 10);
  await store.setMeta(TEST_PROFILE_ID, 'last-sync:oura', { at: Date.now(), rows: 5, startDate: todayIso, endDate: todayIso });
  const origMockFetch2 = window.fetch;
  window.fetch = (input, init) => {
    if (input === '/api/proxy' && observedStartForce === null) {
      try {
        const body = JSON.parse(init.body);
        const m = body.url?.match(/start_date=(\d{4}-\d{2}-\d{2})/);
        if (m) observedStartForce = m[1];
      } catch {}
    }
    return origMockFetch2.call(window, input, init);
  };
  await connect.incrementalSyncWearable('oura', { force: true });
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert('Force-mode expands start_date to ≥ 7 days back even when lastSync.endDate is today',
    observedStartForce !== null && observedStartForce <= sevenDaysAgo,
    `observed start_date=${observedStartForce}, expected ≤ ${sevenDaysAgo}`);
} finally { restore(); }

// ═══════════════════════════════════════
// 4. backfill error recovery — rows write even when one endpoint 500s
// ═══════════════════════════════════════
console.log('4. Partial Failure');
try {
  installRoutes([
    { matcher: 'usercollection/sleep', body: {
      data: [{ day: '2026-04-23', total_sleep_duration: 26000, average_hrv: 35, average_heart_rate: 62 }],
      next_token: null,
    }},
    { matcher: 'usercollection/daily_readiness', status: 500, body: { error: 'server' }},
    { matcher: /heartrate.*start_datetime/, body: { data: [], next_token: null }},
    { matcher: /usercollection\//, body: { data: [], next_token: null }},
  ]);
  let err = null;
  try { await connect.backfillWearable('oura', 7); }
  catch (e) { err = e; }
  assert('Backfill swallows per-endpoint 5xx and continues with the rest',
    err === null);
  const rows = await store.getDailyRange(TEST_PROFILE_ID, 'oura', '2026-04-23', '2026-04-23');
  assert('Sleep-derived row persists even when daily_readiness 500s',
    rows.some(r => r.date === '2026-04-23' && r.hrv_rmssd === 35));
} finally { restore(); }

// ═══════════════════════════════════════
// 5. L2 gate — minimum-cadence force-write after 14d silence
// ═══════════════════════════════════════
console.log('5. Gate Min-Cadence');
const old = window._labState.importedData.wearableSummary;
if (old) {
  const fortnightAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  old.summaryUpdatedAt = fortnightAgo;
  window._labState.importedData.wearableSummary = old;
  const result = await summary.syncWearableSummary(TEST_PROFILE_ID, connect.listConnectedSources());
  assert('Gate force-writes after 14d silence (min-cadence)',
    result.wrote === true && result.reason === 'min-cadence');
} else {
  assert('skip min-cadence test (no prior summary)', true);
}

// ═══════════════════════════════════════
// 6. Disconnect — wipes IDB + summary entry
// ═══════════════════════════════════════
console.log('6. Disconnect');
await connect.disconnectWearable('oura');
const remainingRows = await store.getDailyRange(TEST_PROFILE_ID, 'oura', '2026-01-01', '2099-12-31');
assert('disconnectWearable clears L1 rows for that source',
  remainingRows.length === 0);
assert('disconnectWearable removes wearableConnections entry',
  !window._labState.importedData?.wearableConnections?.oura);
assert('disconnectWearable removes the source from wearableSummary.sources',
  !window._labState.importedData?.wearableSummary?.sources?.oura);

// ═══════════════════════════════════════
// 7. Push-to-gateway — exposed function + toggle helpers
// ═══════════════════════════════════════
console.log('7. Gateway Push');
fakeConnect('oura');
try {
  localStorage.setItem('labcharts-messenger-enabled', 'true');
  localStorage.setItem('labcharts-messenger-token', 'test-mock-token-12345');

  const labContextSrc = await fetch('/js/lab-context.js').then(r => r.text());
  assert('buildLabContext emits [section:wearables] block', /\[section:wearables\]/.test(labContextSrc));
  assert('buildLabContext emits [section:wearables-series-{N}d] block', /wearables-series-\$\{days\}d/.test(labContextSrc));

  const syncMod = await import('../js/sync.js');
  assert('isMessengerEnabled returns true after enabling',
    syncMod.isMessengerEnabled() === true);
  assert('getMessengerToken returns the test token',
    syncMod.getMessengerToken() === 'test-mock-token-12345');
  assert('window.pushContextToGateway exposed (toggle handler can fire it)',
    typeof window.pushContextToGateway === 'function');
} finally {
  localStorage.removeItem('labcharts-messenger-enabled');
  localStorage.removeItem('labcharts-messenger-token');
}

// ═══════════════════════════════════════
// 8. stripWearableCredentials — token leak prevention
// ═══════════════════════════════════════
console.log('8. stripWearableCredentials');
const TEST_PROFILE_2 = 'strip-creds-test-' + Date.now().toString(36);
const sentinelToken = 'SENTINEL-TOKEN-' + Math.random().toString(36).slice(2);
const sentinelRefresh = 'SENTINEL-REFRESH-' + Math.random().toString(36).slice(2);
window._labState.importedData = {
  entries: [],
  wearableConnections: {
    oura: {
      accessToken: sentinelToken,
      refreshToken: sentinelRefresh,
      expiresAt: Date.now() + 86400000,
      connectedAt: new Date().toISOString(),
    },
  },
  wearableSummary: {
    summaryUpdatedAt: new Date().toISOString(),
    sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 5 }},
    metrics: { hrv_rmssd: { primarySource: 'oura', latest: 38, baseline: 36, baselineP25: 32, baselineP75: 40, rolling: { d7: 37, d30: 36, d90: 36 }, trend30d: 'flat', weekly: [36, 37, 38] }},
  },
  changeHistory: [],
};
// buildLabContext + the export.js source read use whatever window.fetch is —
// here that's the fs-backed shim (no /api/proxy routes installed). No wrapper
// needed; the original test had a payload-capture wrapper that was never
// asserted on, so it's just dropped.
const origFetch = window.fetch;
try {
  const labCtx = await import('../js/lab-context.js');
  const ctx = labCtx.buildLabContext({ skipGroupFilter: true });
  assert('buildLabContext output does NOT contain accessToken sentinel',
    !ctx.includes(sentinelToken));
  assert('buildLabContext output does NOT contain refreshToken sentinel',
    !ctx.includes(sentinelRefresh));
  const exportSrc = await fetch('/js/export.js').then(r => r.text());
  assert('exportClientJSON shape does NOT include wearableConnections (token-bearing field)',
    !/wearableConnections:\s*data\.wearableConnections/.test(exportSrc));
} finally {
  window.fetch = origFetch;
}

// ═══════════════════════════════════════
// 9. wearableConnections preserve on Evolu pull
// ═══════════════════════════════════════
console.log('9. Pull-Side Token Preserve');
const syncPullSrcContent = await fetch('/js/sync-pull-merge.js').then(r => r.text());
assert('Sync pull preserves localWearableConnections by reading from disk first',
  /localWearableConnections[\s\S]{0,120}state\.importedData\?\.wearableConnections/.test(syncPullSrcContent));
assert('Sync pull writes localWearableConnections back into the merged importedData',
  /importedData\.wearableConnections\s*=\s*localWearableConnections/.test(syncPullSrcContent));
assert('Sync pull falls back to disk read when state.importedData is for a different profile',
  /localImportedForMerge\?\.wearableConnections/.test(syncPullSrcContent));

// ─────────────────────────────────────────────────────────
// Cleanup — restore live state.
// ─────────────────────────────────────────────────────────
await wipeWearableIDB();
localStorage.removeItem(`labcharts-${TEST_PROFILE_ID}-imported`);
if (origActiveProfile) localStorage.setItem('labcharts-active-profile', origActiveProfile);
else localStorage.removeItem('labcharts-active-profile');
window._labState.currentProfile = origCurrentProfile;
window._labState.importedData = origState;
try { const { deleteWearablesDB } = await import('../js/wearables-store.js'); await deleteWearablesDB(TEST_PROFILE_ID); } catch {}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
