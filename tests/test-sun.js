#!/usr/bin/env node
// test-sun.js — Sun session orchestration: lifecycle, hydration, rolling
// totals, vit-D IU accumulation, MED carry-over.
//
// Run: node tests/test-sun.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun Session Tests ===\n');

await import('../js/state.js');
const sun = await import('../js/sun.js');
const {
  BODY_REGIONS, EXPOSURE_PRESETS, EYE_MODES, LENS_TINTS,
  CHANNEL_DISPLAY,
  channelTier, tierLabel, tierDots, formatChannelUnit,
  SUN_ENGINE_VERSION,
  getSessions, getActiveSession,
  startSession, stopSession, logCompletedSession, deleteSession, updateSession,
  rollingChannelTotals, dailyChannelBreakdown, rollingVitaminDIU,
  cumulativeMEDToday, cumulativeMEDYesterday,
  _applyAtmOverrides,
} = sun;

  // Stash importedData so we don't pollute the host page.
  const orig = window._labState.importedData;
  // Reset to a clean slate per test block.
  function reset(seed = {}) {
    window._labState.importedData = Object.assign({ entries: [], sunSessions: [] }, seed);
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
  // face=0.04 + arms-front=0.05 = 0.09, but min is 0.05
  assert('Region fraction sums + clamped to >=0.05',
    sess2.bodyExposure.fraction >= 0.05 && sess2.bodyExposure.fraction <= 0.10);
  assert('Region path marks preset === "detailed"',
    sess2.bodyExposure.preset === 'detailed');

  // empty regions array must throw (don't silently substitute a phantom default)
  let threw = false;
  try { await startSession({ regions: [] }); } catch (e) { threw = true; }
  assert('startSession({regions: []}) throws (refuses phantom exposure)', threw);

  // delete one
  await stopSession(id2);
  const sessCountBefore = getSessions().length;
  const removed = await deleteSession(id2);
  assert('deleteSession returns true on hit', removed === true);
  assert('deleteSession removes from array', getSessions().length === sessCountBefore - 1);
  assert('deleteSession on unknown id returns false', (await deleteSession('sun_nope')) === false);

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

  // ─── 8. rollingVitaminDIU (gated by window.vitaminDIU presence) ──────
  console.log('%c 8. rollingVitaminDIU ', 'font-weight:bold;color:#f59e0b');

  // Without vitaminDIU wired, the function returns 0 — assert the contract.
  if (typeof window.vitaminDIU !== 'function') {
    assert('rollingVitaminDIU returns 0 when window.vitaminDIU not wired',
      rollingVitaminDIU(7) === 0);
  } else {
    // Real engine wired — assert per-session conversion path.
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

  window._labState.importedData.sunDefaults = {
    overrides: { uvIndex: 9, cloudCover: 50, ozoneDU: 250 },
  };
  const overridden = _applyAtmOverrides(baseAtm);
  assert('Override replaces uvIndex (9 vs 5)', overridden.uvIndex === 9);
  assert('Override replaces cloudCover (50 vs 30)', overridden.cloudCover === 50);
  assert('Override replaces ozoneDU (250 vs 300)', overridden.ozoneDU === 250);
  assert('Override sets _uvOverridden marker', overridden._uvOverridden === true);

  // null/non-finite override is ignored, not blindly applied
  window._labState.importedData.sunDefaults = {
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

  // Restore
  window._labState.importedData = orig;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
