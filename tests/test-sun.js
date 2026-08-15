#!/usr/bin/env node
// test-sun.js — Sun session orchestration: lifecycle, hydration, rolling
// totals, vit-D IU accumulation, MED carry-over.
//
// Run: node tests/test-sun.js  (or via npm test)

import './_node-shim.js';

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun Session Tests ===\n');

const { state } = await import('../js/state.js');
const sun = await import('../js/sun.js');
const sunChannelMetrics = await import('../js/sun-channel-metrics.js');
const sunSessionModel = await import('../js/sun-session-model.js');
const sunSessionsStore = await import('../js/sun-sessions-store.js');
const {
  BODY_REGIONS, EXPOSURE_PRESETS, EYE_MODES, LENS_TINTS,
  CHANNEL_DISPLAY,
  channelTier, tierLabel, tierDots, formatChannelUnit,
  SUN_ENGINE_VERSION,
  getSessions, getActiveSession,
  startSession, stopSession, logCompletedSession, deleteSession, pauseSession, resumeSession,
  markSessionRotated, setSessionSunscreen, setSessionCoverage, updateSession,
  hydrateSession, rehydrateStaleSessions,
  rollingChannelTotals, dailyChannelBreakdown, dailyVitaminDIUBreakdown, rollingVitaminDIU,
  cumulativeVitaminDIUToday, vitaminDBudgetStatus,
  cumulativeMEDToday, cumulativeMEDYesterday,
  _applyAtmOverrides,
} = sun;

  // Stash importedData so we don't pollute the host page.
  const orig = state.importedData;
  // Reset to a clean slate per test block.
  function reset(seed = {}) {
    state.importedData = Object.assign({ entries: [], sunSessions: [] }, seed);
  }

  // ─── 1. Constant shape ───────────────────────────────────────────────
  console.log('%c 1. Constants + display metadata ', 'font-weight:bold;color:#f59e0b');

  // length >= 16 + content spot-check, so adding a new region (e.g.
  // "ankles") doesn't fail this assert as long as the canonical keys
  // are still present.
  const REGION_KEYS = BODY_REGIONS.map(r => r.key);
  const REQUIRED_REGIONS = ['face', 'breast-chest', 'arms-front', 'arms-back', 'torso-front', 'torso-back', 'legs-front', 'legs-back', 'feet-front', 'feet-back'];
  assert('BODY_REGIONS is non-empty array',
    Array.isArray(BODY_REGIONS) && BODY_REGIONS.length >= 16,
    `length=${BODY_REGIONS.length}`);
  const missingRegions = REQUIRED_REGIONS.filter(k => !REGION_KEYS.includes(k));
  assert('BODY_REGIONS contains the canonical region keys',
    missingRegions.length === 0, `missing: ${missingRegions.join(',')}`);
  const fracSum = BODY_REGIONS.reduce((s, r) => s + r.fraction, 0);
  // Sums to ~0.95 — the missing ~0.05 is scalp + anatomical seams
  // (clavicle / shoulder transitions). Assertion guards against any
  // single region drifting wildly or the table being half-deleted.
  assert('BODY_REGIONS fractions sum within 0.85–1.05 (sane full-body coverage)',
    fracSum > 0.85 && fracSum < 1.05, `sum=${fracSum.toFixed(3)}`);

  // Same loosening for EXPOSURE_PRESETS — new presets ("athletic"?) won't
  // break this; canonical 4 must remain.
  const PRESET_KEYS = EXPOSURE_PRESETS.map(p => p.key);
  const REQUIRED_PRESETS = ['face_hands', 'tshirt', 'swimwear', 'sunbathing'];
  const missingPresets = REQUIRED_PRESETS.filter(k => !PRESET_KEYS.includes(k));
  assert('EXPOSURE_PRESETS contains face_hands / tshirt / swimwear / sunbathing',
    EXPOSURE_PRESETS.length >= 4 &&
    missingPresets.length === 0 &&
    EXPOSURE_PRESETS.every(p => typeof p.fraction === 'number'),
    missingPresets.length ? `missing: ${missingPresets.join(',')}` : '');
  assert('sun.js re-exports shared session model constants',
    EXPOSURE_PRESETS === sunSessionModel.EXPOSURE_PRESETS &&
    sun.POSTURE_OPTIONS === sunSessionModel.POSTURE_OPTIONS &&
    sun.SURFACE_OPTIONS === sunSessionModel.SURFACE_OPTIONS &&
    sun.PHOTOSENSITIVE_MED_TIERS === sunSessionModel.PHOTOSENSITIVE_MED_TIERS);
  assert('sun.js re-exports persisted session store API',
    getSessions === sunSessionsStore.getSessions &&
    startSession === sunSessionsStore.startSession &&
    pauseSession === sunSessionsStore.pauseSession &&
    resumeSession === sunSessionsStore.resumeSession &&
    markSessionRotated === sunSessionsStore.markSessionRotated &&
    setSessionSunscreen === sunSessionsStore.setSessionSunscreen &&
    setSessionCoverage === sunSessionsStore.setSessionCoverage &&
    SUN_ENGINE_VERSION === sunSessionsStore.SUN_ENGINE_VERSION);
  assert('sun.js re-exports channel metrics facade API',
    formatChannelUnit === sunChannelMetrics.formatChannelUnit &&
    rollingVitaminDIU === sunChannelMetrics.rollingVitaminDIU &&
    sun.dailyVitaminDIUBreakdown === sunChannelMetrics.dailyVitaminDIUBreakdown &&
    sun.cumulativeVitaminDIUToday === sunChannelMetrics.cumulativeVitaminDIUToday &&
    sun.vitaminDBudgetStatus === sunChannelMetrics.vitaminDBudgetStatus);
  {
    const sunSrc = read('js/sun.js');
    const storeSrc = read('js/sun-sessions-store.js');
    assert('mid-session sunSession writes are owned by sun-sessions-store.js',
      !/sess\.bodyExposure\.(?:rotatedSides|sunscreenSPF|regions|fraction|preset)\s*=/.test(sunSrc)
        && storeSrc.includes('export async function markSessionRotated')
        && storeSrc.includes('export async function setSessionSunscreen')
        && storeSrc.includes('export async function setSessionCoverage'));
  }

  assert('EYE_MODES includes "direct" + "sunglasses" + "indoor"',
    EYE_MODES.some(e => e.key === 'direct') &&
    EYE_MODES.some(e => e.key === 'sunglasses') &&
    EYE_MODES.some(e => e.key === 'indoor'));

  assert('LENS_TINTS includes "clear" baseline',
    LENS_TINTS.some(l => l.key === 'clear'));

  // CHANNEL_DISPLAY entries used by the AI context + dashboard
  for (const k of ['vitamin_d', 'circadian', 'no_cv', 'pomc', 'violet_eye', 'nir_solar', 'pbm_red', 'pbm_nir']) {
    assert(`CHANNEL_DISPLAY has '${k}' (icon + label + dailyTarget + what)`,
      CHANNEL_DISPLAY[k] && CHANNEL_DISPLAY[k].icon && CHANNEL_DISPLAY[k].label &&
      typeof CHANNEL_DISPLAY[k].dailyTarget === 'number' && CHANNEL_DISPLAY[k].what);
  }

  // ─── 2. Tier helpers ─────────────────────────────────────────────────
  console.log('%c 2. channelTier / tierLabel / tierDots ', 'font-weight:bold;color:#f59e0b');

  // dailyTarget for vitamin_d is 300 → boundaries 60/165/300
  assert('channelTier(0, *) → 0 (none)', channelTier(0, 'vitamin_d') === 0);
  assert('channelTier(NaN, *) → 0', channelTier(NaN, 'vitamin_d') === 0);
  assert('channelTier(-5, *) → 0 (no negatives)', channelTier(-5, 'vitamin_d') === 0);
  assert('channelTier(20, vitamin_d) → 1 (low, 20/300=0.07)', channelTier(20, 'vitamin_d') === 1);
  assert('channelTier(100, vitamin_d) → 2 (moderate, 100/300≈0.33)', channelTier(100, 'vitamin_d') === 2);
  assert('channelTier(200, vitamin_d) → 3 (good, 200/300≈0.67)', channelTier(200, 'vitamin_d') === 3);
  assert('channelTier(400, vitamin_d) → 4 (strong, >=target)', channelTier(400, 'vitamin_d') === 4);
  assert('channelTier with unknown channel uses default 1000 target',
    channelTier(150, 'unknown_channel') === 1);

  assert('tierLabel(0) === "none"', tierLabel(0) === 'none');
  assert('tierLabel(4) === "strong"', tierLabel(4) === 'strong');
  assert('tierLabel(99) → "none" (out-of-range fallback)', tierLabel(99) === 'none');

  assert('tierDots(0) shows all empty', tierDots(0) === '○○○○');
  assert('tierDots(4) shows all filled', tierDots(4) === '●●●●');

  // formatChannelUnit gracefully degrades with no math fns wired
  // (which is the case in this test environment until main.js wiring runs)
  assert('formatChannelUnit returns empty for non-positive input',
    formatChannelUnit('vitamin_d', 0) === '' && formatChannelUnit('pbm_red', -1) === '');

  // ─── 3. Session storage + lifecycle ──────────────────────────────────
  console.log('%c 3. Session lifecycle ', 'font-weight:bold;color:#f59e0b');

  reset();
  assert('getSessions on empty importedData returns [] (lazy init)',
    Array.isArray(getSessions()) && getSessions().length === 0);
  assert('getActiveSession with no sessions → null', getActiveSession() === null);

  // start with preset
  const id1 = await startSession({ exposurePreset: 'tshirt', eyeMode: 'sunglasses' });
  assert('startSession returns string id', typeof id1 === 'string' && id1.startsWith('sun_'));
  assert('Session is persisted into importedData.sunSessions',
    getSessions().length === 1 && getSessions()[0].id === id1);
  assert('Session has no endedAt (in progress)', getSessions()[0].endedAt === null);
  assert('Active session is marked pending until its dose slices are finalized',
    getSessions()[0].calculationStatus === 'pending');
  assert('getActiveSession finds the in-progress one',
    getActiveSession() && getActiveSession().id === id1);
  assert('Body fraction matches preset (tshirt = 0.20)',
    Math.abs(getSessions()[0].bodyExposure.fraction - 0.20) < 1e-9);
  assert('Eye mode threaded through (sunglasses)',
    getSessions()[0].eyeExposure.mode === 'sunglasses');

  // stop populates durationMin + endedAt + clears active
  await new Promise(r => setTimeout(r, 30));
  await stopSession(id1);
  const stopped = getSessions().find(s => s.id === id1);
  assert('stopSession populates endedAt', stopped.endedAt && stopped.endedAt > stopped.startedAt);
  assert('stopSession populates durationMin', typeof stopped.durationMin === 'number');
  assert('stopSession assigns eyeExposure.durationSec from elapsed time',
    Number.isFinite(stopped.eyeExposure.durationSec) && stopped.eyeExposure.durationSec >= 0);
  assert('After stop, getActiveSession → null', getActiveSession() === null);

  // start with regions (anatomical picker path)
  const id2 = await startSession({ regions: ['face', 'arms-front'], eyeMode: 'direct' });
  const sess2 = getSessions().find(s => s.id === id2);
  assert('startSession accepts regions array',
    Array.isArray(sess2.bodyExposure.regions) && sess2.bodyExposure.regions.length === 2);
  // face=0.04 + arms-front=0.05 = 0.09 exactly; local-dose calculations
  // must not inflate small selected areas to a hidden 5% floor.
  assert('Region fraction sums exact selected anatomical areas',
    Math.abs(sess2.bodyExposure.fraction - 0.09) < 1e-9);
  assert('Region path marks preset === "detailed"',
    sess2.bodyExposure.preset === 'detailed');

  // empty regions array must throw (don't silently substitute a phantom default)
  let threw = false;
  try { await startSession({ regions: [] }); } catch (e) { threw = true; }
  assert('startSession({regions: []}) throws (refuses phantom exposure)', threw);

  // pause/resume boundary lives in the extracted store and must remain
  // callable through the public sun.js facade.
  await pauseSession(id2);
  assert('pauseSession marks active session paused',
    sess2.paused === true && Number.isFinite(sess2.pausedAt));
  await resumeSession(id2);
  assert('resumeSession clears paused state',
    sess2.paused === false && sess2.pausedAt === undefined);
  const beforeRotate = Date.now() - 1;
  await markSessionRotated(id2);
  assert('markSessionRotated sets rotatedSides and stamps updatedAt',
    sess2.bodyExposure.rotatedSides === true && sess2.updatedAt >= beforeRotate);
  const rotatedAt = sess2.updatedAt;
  await markSessionRotated(id2);
  assert('markSessionRotated is idempotent once already rotated',
    sess2.updatedAt === rotatedAt);
  await setSessionSunscreen(id2, 30);
  assert('setSessionSunscreen writes SPF and stamps updatedAt',
    sess2.bodyExposure.sunscreenSPF === 30 && sess2.updatedAt >= rotatedAt);
  await setSessionSunscreen(id2, 0);
  assert('setSessionSunscreen stores zero SPF as null',
    sess2.bodyExposure.sunscreenSPF === null);
  const beforeInvalidSpfAt = sess2.updatedAt;
  const invalidSpf = await setSessionSunscreen(id2, 101);
  assert('setSessionSunscreen rejects out-of-range SPF at the store boundary',
    invalidSpf === null && sess2.updatedAt === beforeInvalidSpfAt);
  await setSessionCoverage(id2, ['face', 'arms-front', 'face', 'unknown-region']);
  assert('setSessionCoverage stores deduped allowlisted regions',
    JSON.stringify(sess2.bodyExposure.regions) === JSON.stringify(['face', 'arms-front']));
  assert('setSessionCoverage recalculates body fraction',
    Math.abs(sess2.bodyExposure.fraction - 0.09) < 1e-9);
  assert('setSessionCoverage uses detailed preset for selected regions',
    sess2.bodyExposure.preset === 'detailed');
  await setSessionCoverage(id2, []);
  assert('setSessionCoverage accepts fully clothed zero-fraction state',
    Array.isArray(sess2.bodyExposure.regions)
      && sess2.bodyExposure.regions.length === 0
      && sess2.bodyExposure.fraction === 0
      && sess2.bodyExposure.preset === 'covered');

  // delete one
  await stopSession(id2);
  const sessCountBefore = getSessions().length;
  const removed = await deleteSession(id2);
  assert('deleteSession returns true on hit', removed === true);
  assert('deleteSession removes from array', getSessions().length === sessCountBefore - 1);
  assert('deleteSession on unknown id returns false', (await deleteSession('sun_nope')) === false);

  // Paused wall-clock time must not leak into duration or eye exposure.
  reset();
  const pausedId = await startSession({ exposurePreset: 'tshirt', eyeMode: 'direct' });
  const pausedSess = getSessions().find(s => s.id === pausedId);
  pausedSess.startedAt = Date.now() - 10 * 60000;
  await pauseSession(pausedId);
  pausedSess.pausedAt = Date.now() - 5 * 60000;
  await stopSession(pausedId);
  assert('stopSession excludes paused wall-clock time from saved duration',
    pausedSess.durationMin > 4.9 && pausedSess.durationMin < 5.1,
    `duration=${pausedSess.durationMin}`);
  assert('Eye exposure duration also excludes paused wall-clock time',
    pausedSess.eyeExposure.durationSec >= 294 && pausedSess.eyeExposure.durationSec <= 306,
    `eye seconds=${pausedSess.eyeExposure.durationSec}`);

  // ─── 4. logCompletedSession (after-the-fact entry) ────────────────────
  console.log('%c 4. logCompletedSession ', 'font-weight:bold;color:#f59e0b');

  reset();
  const startedAt = Date.now() - 3600 * 1000; // 1h ago
  const endedAt = Date.now() - 1800 * 1000;   // 30min ago
  const idLog = await logCompletedSession({
    startedAt, endedAt,
    bodyExposure: { preset: 'swimwear', fraction: 0.65, regions: [], sunscreenSPF: 30, glassBetween: false },
    eyeExposure: { mode: 'sunglasses', lensTint: 'polarized', durationSec: 1800 },
    notes: 'pool day',
  });
  const sLog = getSessions().find(s => s.id === idLog);
  assert('logCompletedSession persists the session', sLog && sLog.notes === 'pool day');
  assert('logCompletedSession derives durationMin from start/end',
    sLog && Math.abs(sLog.durationMin - 30) < 0.01);
  assert('logCompletedSession preserves SPF',
    sLog.bodyExposure.sunscreenSPF === 30);

  // ─── 5. updateSession ─────────────────────────────────────────────────
  console.log('%c 5. updateSession ', 'font-weight:bold;color:#f59e0b');

  // patch only allowed fields
  await updateSession(idLog, { notes: 'updated', durationMin: 45, _evil: 'should not stick' });
  const upd = getSessions().find(s => s.id === idLog);
  assert('updateSession patches notes', upd.notes === 'updated');
  assert('updateSession patches durationMin', upd.durationMin === 45);
  assert('updateSession derives new endedAt when durationMin patched',
    Math.abs(upd.endedAt - (upd.startedAt + 45 * 60000)) < 5);
  assert('updateSession ignores non-whitelisted keys (no _evil)',
    upd._evil === undefined);
  assert('updateSession stamps updatedAt for cross-device merge',
    Number.isFinite(upd.updatedAt) && upd.updatedAt > 0);
  // Eye-exposure duration should mirror new session duration
  assert('updateSession syncs eyeExposure.durationSec to new duration',
    upd.eyeExposure.durationSec === Math.round(45 * 60));

  // updateSession on unknown id → null
  const nullPatch = await updateSession('sun_nope', { notes: 'x' });
  assert('updateSession on unknown id → null', nullPatch === null);

  // ─── 6. rollingChannelTotals ─────────────────────────────────────────
  console.log('%c 6. rollingChannelTotals ', 'font-weight:bold;color:#f59e0b');

  reset();
  // Within 7d
  await logCompletedSession({
    startedAt: Date.now() - 2 * 86400 * 1000,
    endedAt: Date.now() - 2 * 86400 * 1000 + 30 * 60000,
    doses: { vitamin_d: 50, circadian: 8000, no_cv: 30 },
  });
  await logCompletedSession({
    startedAt: Date.now() - 4 * 86400 * 1000,
    endedAt: Date.now() - 4 * 86400 * 1000 + 30 * 60000,
    doses: { vitamin_d: 80, circadian: 12000, no_cv: 50 },
  });
  // Outside 7d
  await logCompletedSession({
    startedAt: Date.now() - 20 * 86400 * 1000,
    endedAt: Date.now() - 20 * 86400 * 1000 + 30 * 60000,
    doses: { vitamin_d: 999, circadian: 99999, no_cv: 999 },
  });
  const tot7 = rollingChannelTotals(7);
  assert('rollingChannelTotals(7) sums in-window vitamin_d (50+80=130)',
    Math.abs(tot7.vitamin_d - 130) < 1e-9, `got ${tot7.vitamin_d}`);
  assert('rollingChannelTotals(7) sums in-window circadian (8000+12000)',
    Math.abs(tot7.circadian - 20000) < 1e-9);
  assert('rollingChannelTotals(7) excludes 20-day-old session (no 999)',
    !tot7.vitamin_d || tot7.vitamin_d < 200);
  const tot30 = rollingChannelTotals(30);
  assert('rollingChannelTotals(30) includes the 20d session',
    tot30.vitamin_d >= 1000);

  // sessions with no doses should be ignored, not crash
  await logCompletedSession({
    startedAt: Date.now() - 1 * 86400 * 1000,
    endedAt: Date.now() - 1 * 86400 * 1000 + 30 * 60000,
    doses: null,
  });
  const tot7B = rollingChannelTotals(7);
  assert('rollingChannelTotals tolerates session with null doses (no NaN)',
    Number.isFinite(tot7B.vitamin_d), `got ${tot7B.vitamin_d}`);

  // ─── 7. dailyChannelBreakdown ────────────────────────────────────────
  console.log('%c 7. dailyChannelBreakdown ', 'font-weight:bold;color:#f59e0b');

  reset();
  // Today + yesterday + a week-old session
  await logCompletedSession({
    startedAt: Date.now(), endedAt: Date.now() + 1,
    doses: { vitamin_d: 100 },
  });
  await logCompletedSession({
    startedAt: Date.now() - 86400 * 1000, endedAt: Date.now() - 86400 * 1000 + 1,
    doses: { vitamin_d: 50 },
  });
  const buckets = dailyChannelBreakdown('vitamin_d', 7);
  assert('dailyChannelBreakdown returns array length === days',
    buckets.length === 7);
  assert('Most recent bucket = today, holds today\'s session',
    Math.abs(buckets[6].sun - 100) < 1e-9, `got ${buckets[6].sun}`);
  assert('Yesterday bucket holds yesterday\'s session',
    Math.abs(buckets[5].sun - 50) < 1e-9, `got ${buckets[5].sun}`);
  assert('Bucket has device split field (=0 with no device sessions)',
    buckets.every(b => b.device === 0));

  // ─── 8. rollingVitaminDIU ────────────────────────────────────────────
  console.log('%c 8. rollingVitaminDIU ', 'font-weight:bold;color:#f59e0b');

  reset();
  await logCompletedSession({
    startedAt: Date.now() - 86400 * 1000,
    endedAt: Date.now() - 86400 * 1000 + 1800 * 1000,
    doses: { vitamin_d: 100 },
    atmosphere: { uvIndex: 7 },
    safety: { fitzpatrick: 'III' },
  });
  const iu = rollingVitaminDIU(7);
  assert('rollingVitaminDIU returns finite non-negative IU sum',
    Number.isFinite(iu) && iu >= 0, `iu=${iu}`);
  {
    const localKey = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    reset();
    const now = new Date();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const beforeMidnight = yesterdayStart - 10 * 60 * 1000;
    const afterMidnight = yesterdayStart + 10 * 60 * 1000;
    await logCompletedSession({
      startedAt: beforeMidnight,
      endedAt: afterMidnight,
      doses: { vitamin_d: 40 },
      atmosphere: { uvIndex: 7 },
      safety: { fitzpatrick: 'III' },
      bodyExposure: { fraction: 0.2, rotatedSides: false },
    });
    const breakdown = dailyVitaminDIUBreakdown(4);
    const startBucket = breakdown.find(b => b.key === localKey(beforeMidnight));
    const endBucket = breakdown.find(b => b.key === localKey(afterMidnight));
    assert('dailyVitaminDIUBreakdown keys match local bucket dates',
      breakdown.every(b => b.key === localKey(b.date.getTime())));
    assert('completed midnight-crossing sessions stay on their start-day bucket',
      startBucket?.sun > 0 && (endBucket?.sun || 0) === 0,
      `start=${startBucket?.sun || 0} end=${endBucket?.sun || 0}`);
  }
  {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    reset();
    await logCompletedSession({
      startedAt: todayStart + 60 * 1000,
      endedAt: todayStart + 2 * 60 * 1000,
      doses: { vitamin_d: 60 },
      atmosphere: { uvIndex: 7 },
      safety: { fitzpatrick: 'III' },
      bodyExposure: { fraction: 0.2, rotatedSides: false },
    });
    assert('cumulativeVitaminDIUToday counts same-day sun-session buckets',
      cumulativeVitaminDIUToday() > 0);
    state.importedData.supplements = [{
      name: 'D3',
      startDate: `${new Date(todayStart).getFullYear()}-${String(new Date(todayStart).getMonth() + 1).padStart(2, '0')}-${String(new Date(todayStart).getDate()).padStart(2, '0')}`,
      ingredients: [{ name: 'Vitamin D3', amount: '25 mcg', timesPerDay: 1 }],
    }];
    const separatedBudget = vitaminDBudgetStatus();
    assert('vitamin-D budget never adds sunlight IU-equivalent to oral intake',
      separatedBudget.supplementIU === 1000
      && separatedBudget.sunIU > 0
      && separatedBudget.sunIUEquivalent === separatedBudget.sunIU
      && separatedBudget.totalIntakeIU === 1000
      && separatedBudget.total === 1000,
      JSON.stringify(separatedBudget));
    reset();
    const beforeMidnight = todayStart - 10 * 60 * 1000;
    const afterMidnight = todayStart + 60 * 1000;
    await logCompletedSession({
      startedAt: beforeMidnight,
      endedAt: afterMidnight,
      doses: { vitamin_d: 6000 },
      atmosphere: { uvIndex: 7 },
      safety: { fitzpatrick: 'III' },
      bodyExposure: { fraction: 0.2, rotatedSides: false },
    });
    const breakdown = dailyVitaminDIUBreakdown(2);
    assert('today vitamin-D budget follows the same start-day bucket as the chart',
      cumulativeVitaminDIUToday() === 0 &&
      vitaminDBudgetStatus().sunIU === 0 &&
      (breakdown.at(-2)?.sun || 0) > 0 &&
      (breakdown.at(-1)?.sun || 0) === 0,
      `budget=${cumulativeVitaminDIUToday()} todayBucket=${breakdown.at(-1)?.sun || 0}`);
    const boundaryScript = `
      import './tests/_node-shim.js';
      const { state } = await import('./js/state.js');
      const { vitaminDBudgetStatus } = await import('./js/sun.js');
      Date.now = () => Date.parse('2026-07-04T06:30:00Z');
      state.importedData = {
        entries: [],
        sunSessions: [],
        supplements: [{
          name: 'UTC boundary D3',
          startDate: '2026-07-04',
          ingredients: [{ name: 'Vitamin D3', amount: '25 mcg', timesPerDay: 1 }],
        }],
      };
      const budget = vitaminDBudgetStatus();
      if (budget.supplementIU !== 1000) {
        console.error(JSON.stringify(budget));
        process.exit(1);
      }
    `;
    const boundary = spawnSync(process.execPath, ['--input-type=module', '-e', boundaryScript], {
      cwd: ROOT,
      env: { ...process.env, TZ: 'America/Los_Angeles' },
      encoding: 'utf8',
    });
    assert('vitamin-D supplement budget includes legacy UTC-date defaults near local boundary',
      boundary.status === 0,
      (boundary.stderr || boundary.stdout || '').trim());
  }

  // ─── 9. MED today / yesterday ─────────────────────────────────────────
  console.log('%c 9. cumulativeMEDToday / Yesterday ', 'font-weight:bold;color:#f59e0b');

  reset();
  // Today = local midnight to now. Use very-near-now times to be inside today.
  await logCompletedSession({
    startedAt: Date.now() - 60000, endedAt: Date.now() - 1,
    safety: { medFraction: 0.4 },
  });
  await logCompletedSession({
    startedAt: Date.now() - 120000, endedAt: Date.now() - 90000,
    safety: { medFraction: 0.3 },
  });
  const todayMED = cumulativeMEDToday();
  assert('cumulativeMEDToday sums today\'s sessions (0.4+0.3=0.7)',
    Math.abs(todayMED - 0.7) < 1e-9, `got ${todayMED}`);

  // Yesterday's session — startedAt = midnight - 1h, endedAt = midnight - 1s
  const now = new Date();
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  await logCompletedSession({
    startedAt: todayStartMs - 3600 * 1000,
    endedAt: todayStartMs - 1000,
    safety: { medFraction: 0.6 },
  });
  const yMED = cumulativeMEDYesterday();
  assert('cumulativeMEDYesterday picks up yesterday-ended session',
    Math.abs(yMED - 0.6) < 1e-9, `got ${yMED}`);
  // today total still includes only today's sessions
  assert('Today\'s MED unchanged after adding a yesterday-ended session',
    Math.abs(cumulativeMEDToday() - 0.7) < 1e-9);

  // Sessions without safety must not crash either accumulator
  await logCompletedSession({
    startedAt: Date.now() - 30000, endedAt: Date.now() - 1,
    safety: null,
  });
  assert('cumulativeMEDToday tolerant of session with null safety',
    Number.isFinite(cumulativeMEDToday()));

  // ─── 10. _applyAtmOverrides ───────────────────────────────────────────
  console.log('%c 10. _applyAtmOverrides ', 'font-weight:bold;color:#f59e0b');

  reset();
  const baseAtm = { uvIndex: 5, ozoneDU: 300, cloudCover: 30 };
  // No overrides → returns input unchanged
  assert('_applyAtmOverrides with no sunDefaults returns input unchanged',
    _applyAtmOverrides(baseAtm).uvIndex === 5);

  state.importedData.sunDefaults = {
    overrides: { uvIndex: 9, cloudCover: 50, ozoneDU: 250 },
  };
  const overridden = _applyAtmOverrides(baseAtm);
  assert('Legacy UVI override is ignored', overridden.uvIndex === 5);
  assert('Override replaces cloudCover (50 vs 30)', overridden.cloudCover === 50);
  assert('Override replaces ozoneDU (250 vs 300)', overridden.ozoneDU === 250);
  assert('Legacy _uvOverridden marker is absent', overridden._uvOverridden == null);

  // null/non-finite override is ignored, not blindly applied
  state.importedData.sunDefaults = {
    overrides: { uvIndex: null, cloudCover: 'abc', ozoneDU: NaN },
  };
  const overridden2 = _applyAtmOverrides(baseAtm);
  assert('null/NaN/string override values are ignored (input passes through)',
    overridden2.uvIndex === 5 && overridden2.cloudCover === 30 && overridden2.ozoneDU === 300);

  // _applyAtmOverrides(null) → null (no crash)
  assert('_applyAtmOverrides(null) returns null', _applyAtmOverrides(null) === null);

  // ─── 11. SUN_ENGINE_VERSION is monotonic ─────────────────────────────
  console.log('%c 11. SUN_ENGINE_VERSION ', 'font-weight:bold;color:#f59e0b');

  assert('SUN_ENGINE_VERSION is a positive integer (current = 3)',
    Number.isInteger(SUN_ENGINE_VERSION) && SUN_ENGINE_VERSION >= 3);

  // ─── 12. rehydrateStaleSessions dedupe ──────────────────────────────
  console.log('%c 12. rehydrateStaleSessions dedupe ', 'font-weight:bold;color:#f59e0b');

  reset();
  let fetchCalls = 0;
  let releaseFetch;
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  sunSessionsStore.configureSunSessionsStore({
    fetchAtmosphere: async () => {
      fetchCalls++;
      await fetchGate;
      return { uvIndex: 6, ozoneDU: 300, cloudCover: 10, airQuality: { aod: 0.1 } };
    },
    reconstructSpectrum: () => ({ wavelengths: [300, 305], irradiance: [1, 1] }),
    computeChannelDoses: () => ({ vitamin_d: 42, circadian: 10 }),
    erythemalSED: () => 12,
    fractionOfMED: () => 0.2,
    retinalUVdose: () => 0.01,
    solarZenithAngle: () => 30,
  });
  const staleId = await logCompletedSession({
    startedAt: Date.now() - 45 * 60000,
    endedAt: Date.now() - 15 * 60000,
    location: { lat: 50.1, lon: 14.4 },
    engineVersion: SUN_ENGINE_VERSION - 1,
  });
  const rehydrateA = rehydrateStaleSessions();
  const rehydrateB = rehydrateStaleSessions();
  for (let attempt = 0; attempt < 50 && fetchCalls === 0; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert('Concurrent rehydrate batches share one atmosphere fetch per stale session',
    fetchCalls === 1, `fetchCalls=${fetchCalls}`);
  releaseFetch();
  const [resultA, resultB] = await Promise.all([rehydrateA, rehydrateB]);
  const staleSess = getSessions().find(s => s.id === staleId);
  assert('Both concurrent rehydrate callers observe the shared completed work',
    resultA.rehydrated === 1 && resultB.rehydrated === 1,
    `A=${resultA.rehydrated}, B=${resultB.rehydrated}`);
  assert('Shared rehydrate stamps the session with current engine output',
    staleSess.engineVersion === SUN_ENGINE_VERSION &&
    staleSess.doses?.vitamin_d === 42 &&
    staleSess.safety?.medFraction === 0.2);

  const fetchCallsBeforeSegmentFinalize = fetchCalls;
  const segmentedId = await logCompletedSession({
    startedAt: Date.now() - 12 * 60000,
    endedAt: Date.now(),
    exposureSegments: [
      {
        startedAt: Date.now() - 12 * 60000,
        endedAt: Date.now() - 9 * 60000,
        durationMin: 3,
        doses: { vitamin_d: 10, circadian: 5 },
        sed: 0.4,
        ocularActinicUV: 1.5,
        atmosphere: { uvIndex: 4 },
      },
      {
        startedAt: Date.now() - 4 * 60000,
        endedAt: Date.now() - 2 * 60000,
        durationMin: 2,
        doses: { vitamin_d: 7, no_cv: 3 },
        sed: 0.6,
        ocularActinicUV: 2.5,
        atmosphere: { uvIndex: 7 },
      },
    ],
  });
  const segmentedSess = await hydrateSession(segmentedId);
  assert('Persisted exposure segments finalize without location or a replacement atmosphere fetch',
    segmentedSess?.calculationStatus === 'computed'
      && fetchCalls === fetchCallsBeforeSegmentFinalize
      && segmentedSess.durationMin === 5);
  assert('Segment finalization preserves and sums dose, SED, and ocular actinic UV slices',
    segmentedSess.doses.vitamin_d === 17
      && segmentedSess.doses.circadian === 5
      && segmentedSess.doses.no_cv === 3
      && segmentedSess.safety.sed === 1
      && segmentedSess.safety.ocularActinicUV === 4
      && segmentedSess.atmosphere.uvIndex === 7);
  assert('Unset skin type is explicitly persisted as a conservative Type I assumption',
    segmentedSess.safety.fitzpatrick === 'I'
      && segmentedSess.safety.fitzpatrickAssumed === true);

  // ─── 13. Source split guardrails ─────────────────────────────────────
  console.log('%c 13. Sun session module boundaries ', 'font-weight:bold;color:#f59e0b');

  const fs = await import('node:fs/promises');
  const sunSrc = await fs.readFile(new URL('../js/sun.js', import.meta.url), 'utf8');
  const metricsSrc = await fs.readFile(new URL('../js/sun-channel-metrics.js', import.meta.url), 'utf8');
  const locationSrc = await fs.readFile(new URL('../js/sun-location.js', import.meta.url), 'utf8');
  const modelSrc = await fs.readFile(new URL('../js/sun-session-model.js', import.meta.url), 'utf8');
  const storeSrc = await fs.readFile(new URL('../js/sun-sessions-store.js', import.meta.url), 'utf8');
  const runtimeSrc = await fs.readFile(new URL('../js/sun-runtime.js', import.meta.url), 'utf8');
  const appLightSunSrc = await fs.readFile(new URL('../js/app-light-sun-modules.js', import.meta.url), 'utf8');
  const aiHooksSrc = await fs.readFile(new URL('../js/light-sun-ai-hooks.js', import.meta.url), 'utf8');
  const swSrc = await fs.readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert('Sun session model owns shared option/safety constants',
    sunSrc.includes("from './sun-session-model.js'") &&
    modelSrc.includes('export const EXPOSURE_PRESETS') &&
    modelSrc.includes('export const POSTURE_MULTIPLIERS') &&
    modelSrc.includes('export const PHOTOSENSITIVE_MED_TIERS'));
  assert('Sun sessions store owns persisted lifecycle and hydration',
    sunSrc.includes("from './sun-sessions-store.js'") &&
    storeSrc.includes('export async function startSession') &&
    storeSrc.includes('export async function hydrateSession') &&
    storeSrc.includes('fetchAtmosphere: async () => null') &&
    !storeSrc.includes('window.fetchAtmosphere') &&
    !storeSrc.includes('window.reconstructSpectrum') &&
    storeSrc.includes('export function getSessions') &&
    !storeSrc.includes('showPromptDialog') &&
    !storeSrc.includes('renderBodySilhouette'));
  assert('Sun sessions store routes analyzer hook through startup wiring',
    !storeSrc.includes('window.maybeAnalyzeSessionAfterFinish') &&
    aiHooksSrc.includes("import { configureSunSessionsStore } from './sun-sessions-store.js';") &&
    aiHooksSrc.includes("import { maybeAnalyzeSessionAfterFinish } from './sun-ai-analysis.js';") &&
    aiHooksSrc.includes('configureSunSessionsStore({ maybeAnalyzeSessionAfterFinish })') &&
    appLightSunSrc.includes("import './light-sun-ai-hooks.js';"));
  assert('Sun channel metrics owns unit formatting and vitamin-D rollups',
    sunSrc.includes("from './sun-channel-metrics.js'") &&
    metricsSrc.includes("import { ingredientDailyTotal } from './supplement-impact.js';") &&
    metricsSrc.includes("import { getSessions } from './sun-sessions-store.js';") &&
    metricsSrc.includes('export function formatChannelUnit') &&
    metricsSrc.includes('export function rollingVitaminDIU') &&
    metricsSrc.includes('export function dailyVitaminDIUBreakdown') &&
    metricsSrc.includes('const ts = getSunSessionBucketTs(sess);') &&
    metricsSrc.includes('localDayKey(bucketTs) !== todayKey') &&
    metricsSrc.includes('function currentDateKeyRange') &&
    !metricsSrc.includes('toISOString().slice(0, 10)') &&
    !metricsSrc.includes('window.'));
  assert('Sun browser hooks are isolated in runtime adapter',
    sunSrc.includes("from './sun-runtime.js'") &&
    !/\bwindow(?:\.|\s*\[)/.test(sunSrc) &&
    !sunSrc.includes('exposeSunRuntimeBindings') &&
    !runtimeSrc.includes('exposeSunRuntimeBindings') &&
    runtimeSrc.includes('export function getSunDeviceSessionsRuntime') &&
    runtimeSrc.includes('export function renderLightTodayStripRuntime') &&
    runtimeSrc.includes('export function requestSunGeolocationPositionRuntime') &&
    swSrc.includes("'/js/sun-runtime.js'"));
  assert('Sun coordinate policy and precise-location upgrade have one owner',
    sunSrc.includes("from './sun-location.js'") &&
    sunSrc.includes('export { clearCurrentLocation, getSunCoords, requestCurrentLocation, requestPreciseLocation };') &&
    locationSrc.includes('export function getSunCoords()') &&
    locationSrc.includes('export async function requestPreciseLocation()') &&
    locationSrc.includes('COUNTRY_CENTROIDS') &&
    !sunSrc.includes('const BAND_CENTROID_LAT') &&
    swSrc.includes("'/js/sun-location.js'"));
  const formerSunGlobals = [
    'SUN_ENGINE_VERSION', '_refreshSunSurfaces', 'quickLogSunSession', 'startSession', 'stopSession',
    'pauseSession', 'resumeSession', 'pauseSunSession', 'resumeSunSession', 'applySunscreenMidSession',
    'changeCoverageMidSession', 'flipSidesMidSession', 'setOzoneOverrideMidSession', '_forgotStopPrompt',
    'logCompletedSession', 'updateSession', 'editSunSessionDuration', 'deleteSunSession', 'hydrateSession',
    'rehydrateStaleSessions', 'getSessions', 'getActiveSession', 'rollingChannelTotals', 'dailyChannelBreakdown',
    'dailyVitaminDIUBreakdown', 'rollingVitaminDIU', 'cumulativeMEDToday', 'cumulativeMEDYesterday',
    'cumulativeVitaminDIUToday', 'vitaminDBudgetStatus', '_applyAtmOverrides', 'renderSessionsList',
    'renderSunSessionRow', 'getSunCoords', 'requestPreciseLocation', 'openDetailedSessionDialog',
    'openStartSunSessionDialog', 'openSunSessionDetail', 'renderBodySilhouette', 'bindBodySilhouette',
    '_testLoadRegionMap', '_testRegionAtSource', '_testRegionColorRGB', '_testStockImg',
    '_testRegionBandLandmarks', 'trapModalFocus', '_wireBackdropClose', '_resumeActiveTickerIfNeeded',
    '_ensureActiveTicker', 'BODY_REGIONS', 'EXPOSURE_PRESETS', 'EYE_MODES', 'LENS_TINTS',
    'CHANNEL_DISPLAY', 'channelTier', 'weeklyChannelTier', 'tierLabel', 'formatChannelUnit', 'tierDots',
  ];
  assert('Sun facade stays module-only after import',
    formerSunGlobals.every(name => !(name in window)));
  assert('Service worker precaches extracted sun session modules',
    swSrc.includes("'/js/sun-session-model.js'") &&
    swSrc.includes("'/js/sun-sessions-store.js'") &&
    swSrc.includes("'/js/sun-channel-metrics.js'") &&
    swSrc.includes("'/js/light-sun-ai-hooks.js'"));

  // Restore
  state.importedData = orig;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
