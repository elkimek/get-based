#!/usr/bin/env node
// test-sun-context.js — buildSunContext({tier}) AI prompt assembly.
// Always / standard / deep tier shaping, deficit detection citations,
// section markers, token-budget guards.
//
// Run: node tests/test-sun-context.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun Context Tests ===\n');

await import('../js/state.js');
// lab-context.js exposes buildLabContext via window — section 11 below
// gates on its presence. Importing it makes the gate fire.
await import('../js/lab-context.js');
const ctxMod = await import('../js/sun-context.js');
const { buildSunContext } = ctxMod;

  const orig = window._labState.importedData;
  function reset(seed = {}) {
    window._labState.importedData = Object.assign({ entries: [], sunSessions: [] }, seed);
  }

  // ─── 1. Empty path ──────────────────────────────────────────────────
  console.log('%c 1. Empty / no sessions ', 'font-weight:bold;color:#f59e0b');

  reset({ sunSessions: [] });
  assert('No sessions → returns "" (cheap, never injects empty section)',
    buildSunContext({ tier: 'always' }) === '');
  assert('Default tier === "always" (no opts)',
    buildSunContext() === '');

  // ─── 2. Always tier (~520 tok) ───────────────────────────────────────
  console.log('%c 2. Always tier shaping ', 'font-weight:bold;color:#f59e0b');

  // Two recent sessions w/ doses + safety, plus active session
  const recent = Date.now() - 86400 * 1000;
  reset({
    sunSessions: [
      {
        id: 's1',
        startedAt: recent,
        endedAt: recent + 30 * 60000,
        durationMin: 30,
        doses: { vitamin_d: 100, circadian: 8000, no_cv: 50, nir_solar: 30000 },
        safety: { medFraction: 0.3, fitzpatrick: 'III' },
        atmosphere: { uvIndex: 5 },
        bodyExposure: { preset: 'tshirt', fraction: 0.30 },
      },
      {
        id: 's2',
        startedAt: Date.now() - 60000,
        endedAt: null, // active
        bodyExposure: { preset: 'tshirt', fraction: 0.30 },
      },
    ],
    sunDefaults: { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'none', ottScore: 4 },
  });

  const always = buildSunContext({ tier: 'always' });
  assert('Always tier returns non-empty string', always.length > 0);
  assert('Always tier opens with [section:sun] marker (matches getbased_section("sun") agent API)',
    always.startsWith('[section:sun]'));
  assert('Always tier closes with [/section:sun]',
    always.endsWith('[/section:sun]\n\n'));
  assert('Always tier names the lens "Light & Sun"',
    /Light & Sun lens/.test(always));
  assert('Always tier reports total session count',
    /Outdoor sessions: 2/.test(always));
  assert('Always tier surfaces the active session warning',
    /ACTIVE SESSION in progress/.test(always));
  assert('Always tier surfaces 7-day rollup header with tier-dot legend',
    /7-day rollup \(sun \+ devices combined;.*hit weekly target.*moderate.*low.*none/.test(always));
  // 30-day breakdown was dropped from always-tier in v1.7.18 (token compression).
  // It still backs deficit detection internally; the surface moved to standard tier.
  assert('Always tier omits 30-day totals header (compressed in v1.7.18)',
    !/30-day per-channel dose totals/.test(always));
  assert('Always tier serializes Fitzpatrick III from sunDefaults',
    /Fitzpatrick III/.test(always));
  assert('Always tier surfaces Ott self-survey score when ottScore set',
    /Ott self-survey: 6\/10 aligned/.test(always));
  assert('Always tier reports MED',
    /Today's cumulative MED:/.test(always));

  // Token budget — always tier should stay roughly under ~1400 chars
  // (~520 tok) for the canonical small-state user. Hard cap = 4000 chars
  // catches any future regression that bloats the always tier.
  assert('Always tier stays under 4000 chars (token-budget guard)',
    always.length < 4000, `len=${always.length}`);

  // ─── 3. Deficit detection ────────────────────────────────────────────
  console.log('%c 3. Active deficit citations ', 'font-weight:bold;color:#f59e0b');

  // 7 sessions to satisfy the v1.7.18 baseline-window gate (deficits only
  // fire once the user has logged ≥7 events of any kind — otherwise we
  // can't distinguish "user doesn't expose" from "user hasn't logged
  // yet"). All carry only vitamin_d → circadian, nir_solar, no_cv all 0.
  const partialSessions = [];
  for (let i = 0; i < 7; i++) {
    partialSessions.push({
      id: `partial_${i}`,
      startedAt: recent - i * 86400 * 1000,
      endedAt: recent - i * 86400 * 1000 + 60 * 60000,
      durationMin: 60,
      doses: { vitamin_d: 200 },
      safety: { medFraction: 0.4, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 7 },
      bodyExposure: { preset: 'tshirt', fraction: 0.30 },
    });
  }
  reset({ sunSessions: partialSessions });
  const def = buildSunContext({ tier: 'always' });
  assert('Deficit block surfaces the "Active light deficits" header',
    /Active light deficits/.test(def));
  assert('Circadian deficit cites Hattar / Huberman literature',
    /Hattar|Huberman/.test(def));
  assert('NIR-solar deficit cites Wunsch / Jeffery literature',
    /Wunsch|Jeffery/.test(def));
  assert('NO/cardiovascular deficit cites Liu / Oplander pathway',
    /Liu|Oplander|Opländer/.test(def));
  assert('Vit-D deficit absent when vitamin_d > 0',
    !/Channel 1 \(vit D\)/.test(def));

  // Baseline-window gate (v1.7.18) — under 7 logged events the deficit
  // block must NOT fire. Brand-new users get a measurement gap, not 6
  // simultaneous false-positive deficits.
  reset({
    sunSessions: [{
      id: 'lone',
      startedAt: recent, endedAt: recent + 60 * 60000, durationMin: 60,
      doses: { vitamin_d: 200 },
      safety: { medFraction: 0.4, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 7 },
      bodyExposure: { preset: 'tshirt', fraction: 0.30 },
    }],
  });
  const sparse = buildSunContext({ tier: 'always' });
  assert('Deficit block suppressed when fewer than 7 events logged',
    !/Active light deficits/.test(sparse));

  // ─── 4. Standard tier (+1200 tok) ────────────────────────────────────
  console.log('%c 4. Standard tier extra block ', 'font-weight:bold;color:#f59e0b');

  // Build 5 sessions to exercise the table-rendering path
  const sessions = [];
  for (let i = 0; i < 5; i++) {
    sessions.push({
      id: `s_${i}`,
      startedAt: Date.now() - (i + 1) * 86400 * 1000,
      endedAt: Date.now() - (i + 1) * 86400 * 1000 + 30 * 60000,
      durationMin: 30,
      doses: { vitamin_d: 50 + i * 10, circadian: 5000 + i * 1000, no_cv: 30, nir_solar: 20000 },
      safety: { medFraction: 0.2 + i * 0.05, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 4 + i },
      bodyExposure: { preset: 'tshirt', fraction: 0.30 },
      eyeExposure: { mode: 'sunglasses', lensTint: 'polarized', durationSec: 1800 },
    });
  }
  reset({ sunSessions: sessions });
  const standard = buildSunContext({ tier: 'standard' });
  assert('Standard tier strictly longer than always tier',
    standard.length > buildSunContext({ tier: 'always' }).length);
  // Pre-2026-05-10 standard tier emitted per-session tables (~30 rows ×
  // ~120 chars). New shape (matches buildWearableContext): per-channel
  // 6-week trend lines instead of per-event detail. Per-session forensics
  // moved to the getSunSessionsSlice / getSunSessionDetail tool-call APIs.
  assert('Standard tier emits "Weekly trend (last 6w" header (wearables-style)',
    /### Weekly trend \(last 6w/.test(standard));
  assert('Standard tier emits at least one channel weekly-trend line',
    /(Vit-D|Body clock|Cellular repair|Cardiovascular|Mood\/hormones)/.test(standard));
  assert('Standard tier emits "Session cadence" line (last 7d vs prior 7d)',
    /### Session cadence/.test(standard));
  assert('Standard tier no longer renders per-session sun table',
    !/\| Date \| Min \| Skin% \| Regions \|/.test(standard));
  assert('Standard tier no longer renders per-session device-therapy table',
    !/\| Date \| Min \| Device \| Distance \|/.test(standard));
  assert('Standard tier table omits prose glossary (raw-data style)',
    !/Wallace rule of nines/i.test(standard));

  // ─── 5. Per-session detail moved to tool-call API (v1.7.19) ─────────
  // The former `deep` prompt block is gone — per-session detail is the
  // wrong shape for an always-on prompt and now lives in the
  // getSunSessionsSlice / getSunSessionDetail helpers, callable by both
  // chat tool-calls and MCP/agent consumers.
  console.log('%c 5. Tool-call slice + detail APIs ', 'font-weight:bold;color:#f59e0b');

  const { getSunSessionsSlice, getSunSessionDetail } = ctxMod;
  assert('getSunSessionsSlice exported', typeof getSunSessionsSlice === 'function');
  assert('getSunSessionDetail exported', typeof getSunSessionDetail === 'function');

  // Default slice — last 30 days, default field set
  const slice = getSunSessionsSlice();
  assert('Slice returns array', Array.isArray(slice));
  assert('Slice length matches recent ended sessions',
    slice.length === sessions.length);
  assert('Default slice carries date / channels / safety / atmosphere / body',
    slice[0].date && slice[0].channels && slice[0].safety && slice[0].atmosphere && slice[0].body);
  assert('Default slice withholds location (privacy-by-default — sub-11km coords stay opt-in)',
    slice[0].location === undefined);
  assert('Slice ordered most-recent-first',
    slice.length < 2 || slice[0].date >= slice[1].date);

  // Days cap
  const longSlice = getSunSessionsSlice({ days: 365 });
  assert('Slice caps days at 90', longSlice.length <= 90);

  // Field opt-in
  const richSlice = getSunSessionsSlice({ fields: ['date', 'body', 'location'] });
  if (richSlice.length > 0) {
    assert('Slice with fields=[body] surfaces body block',
      richSlice[0].body !== undefined);
  }

  // Single-session detail
  reset({
    sunSessions: [{
      id: 'locked',
      startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      location: { lat: 50.0732, lon: 14.4378, altitudeM: 200 },
      doses: { vitamin_d: 50 },
      safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 },
      bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: ['face', 'hands'] },
    }],
  });
  // Default consent state: body-regions opt-in is off → body block emits
  // preset/fraction/sunscreen but regions[] is stripped to [].
  ctxMod.setBodyRegionsInAIContext(false);
  const detail = getSunSessionDetail('locked');
  assert('getSunSessionDetail: known id → projected session',
    detail && detail.id === 'locked');
  assert('getSunSessionDetail surfaces non-region fields when caller asks by id',
    detail.date && detail.body && detail.atmosphere && detail.safety);
  assert('getSunSessionDetail body block carries preset + fraction even when regions opt-in is off',
    detail.body.preset === 'face_hands' && detail.body.fraction === 0.05);
  assert('getSunSessionDetail strips regions array by default (privacy opt-in off)',
    Array.isArray(detail.body.regions) && detail.body.regions.length === 0);

  // With consent flag on, the regions array surfaces.
  ctxMod.setBodyRegionsInAIContext(true);
  const detailWithRegions = getSunSessionDetail('locked');
  assert('getSunSessionDetail body block carries regions array when consent toggle is on',
    Array.isArray(detailWithRegions.body.regions)
    && detailWithRegions.body.regions.includes('face'));
  // Restore default-off for the rest of the suite.
  ctxMod.setBodyRegionsInAIContext(false);

  assert('getSunSessionDetail unknown id → null',
    getSunSessionDetail('does-not-exist') === null);

  // ─── 6. Privacy: location rounding (slice + detail honor config) ────
  console.log('%c 6. Privacy-aware location rounding ', 'font-weight:bold;color:#f59e0b');

  const origGetMeteoConfig = window.getMeteoConfig;
  window.getMeteoConfig = () => ({ privacyRounding: 0.1 });
  const detailCoarse = getSunSessionDetail('locked');
  assert('Detail rounds lat to 0.1° privacy',
    detailCoarse.location.lat === 50.1 && detailCoarse.location.lon === 14.4);

  window.getMeteoConfig = () => ({ privacyRounding: 0.01 });
  const detailSharp = getSunSessionDetail('locked');
  assert('Detail rounds lat to 0.01° privacy',
    detailSharp.location.lat === 50.07 && detailSharp.location.lon === 14.44);

  // restore
  if (origGetMeteoConfig) window.getMeteoConfig = origGetMeteoConfig;
  else delete window.getMeteoConfig;

  // ─── 7. Section markers always present ───────────────────────────────
  console.log('%c 7. Section marker discipline ', 'font-weight:bold;color:#f59e0b');

  reset({
    sunSessions: [{
      id: 'm', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100, circadian: 5000, no_cv: 30, nir_solar: 20000 },
      safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 },
      bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
  });
  // 'deep' tier collapses to 'standard' since the deep prompt block was
  // retired in v1.7.19 — the section markers should still wrap cleanly.
  for (const tier of ['always', 'standard', 'deep']) {
    const out = buildSunContext({ tier });
    assert(`${tier} tier wraps in matching section markers`,
      out.startsWith('[section:sun]') &&
      out.endsWith('[/section:sun]\n\n'));
  }

  // ─── 8. Calibration anchor (v1.7.19) ─────────────────────────────────
  console.log('%c 8. Calibration anchor ', 'font-weight:bold;color:#f59e0b');

  reset({
    sunSessions: [{
      id: 'cal', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
    entries: [
      { date: '2026-04-01', markers: { 'vitamins.vitaminD': 75 } },  // older
      { date: '2026-04-15', markers: { 'vitamins.vitaminD': 90 } },  // most recent → 36 ng/mL
    ],
    wearableSummary: {
      metrics: {
        sleep_score: { latest: 78, baseline: 82, rolling: { d7: 76 }, trend30d: 'declining' },
      },
    },
  });
  const cal = buildSunContext({ tier: 'always' });
  assert('Calibration block surfaces "Calibration anchor" header',
    /Calibration anchor/.test(cal));
  assert('Calibration shows latest 25-OH-D in ng/mL + nmol/L',
    /25-OH-D 36 ng\/mL \(90 nmol\/L\)/.test(cal));
  assert('Calibration shows 7d sleep score with baseline + trend',
    /7d sleep score 76 \(baseline 82, declining\)/.test(cal));

  // No calibration data → no header
  reset({
    sunSessions: [{
      id: 'cal2', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
  });
  const noCal = buildSunContext({ tier: 'always' });
  assert('No bloodwork + no wearable → no calibration block',
    !/Calibration anchor/.test(noCal));

  // Single-source paths — vit-D-only and sleep-only must each render
  // their lone surviving anchor (P0 from test audit; was uncovered).
  reset({
    sunSessions: [{
      id: 'cal3', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
    entries: [{ date: '2026-04-15', markers: { 'vitamins.vitaminD': 90 } }],
  });
  const calVitOnly = buildSunContext({ tier: 'always' });
  assert('Vit-D bloodwork without wearable → calibration shows vit-D',
    /Calibration anchor/.test(calVitOnly) && /25-OH-D/.test(calVitOnly) && !/sleep score/.test(calVitOnly));

  reset({
    sunSessions: [{
      id: 'cal4', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
    wearableSummary: {
      metrics: { sleep_score: { latest: 78, baseline: 82, rolling: { d7: 76 }, trend30d: 'declining' } },
    },
  });
  const calSleepOnly = buildSunContext({ tier: 'always' });
  assert('Sleep score without bloodwork → calibration shows sleep alone',
    /Calibration anchor/.test(calSleepOnly) && /sleep score 76/.test(calSleepOnly) && !/25-OH-D/.test(calSleepOnly));

  // Note: calibration line previously read entries with e.values?.[cat]?.[m]
  // (wrong shape — entries store e.markers["cat.m"]). Test now uses the
  // correct shape; a regression to the old path would silence vit-D in
  // every prompt for every user with bloodwork logged. The fix above
  // for sun-context.js followed the same lesson.

  // ─── 9. Burden-tier rubric inline ────────────────────────────────────
  console.log('%c 9. Burden tier inline rubric ', 'font-weight:bold;color:#f59e0b');

  // Set up env data so lightEnvironmentBlock fires.
  reset({
    sunSessions: [{
      id: 'b', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
    lightEnvironment: {
      rooms: [{ id: 'r1', name: 'kitchen' }],
      screens: [],
    },
  });
  // Stub the burden helper. Helper returns 3 tiers (0=Light/1=Moderate/
  // 2=Heavy load); the AI line surfaces the helper's label verbatim so
  // it matches the page UI rather than inventing a parallel scale.
  window.computeIndoorBurden = () => ({ tier: 2, label: 'Heavy load', note: 'high' });
  const withRubric = buildSunContext({ tier: 'always' });
  assert('Burden line names the qualitative tier',
    /tier 2\/2/.test(withRubric) && /Heavy load/.test(withRubric));
  assert('Burden line carries inline 0=light … 2=heavy rubric',
    /0=light, 2=heavy/.test(withRubric));
  delete window.computeIndoorBurden;

  // ─── 10. Room-name resolution in tool warnings ───────────────────────
  console.log('%c 10. Tool warning roomId → name ', 'font-weight:bold;color:#f59e0b');

  reset({
    sunSessions: [{
      id: 'w', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
    lightEnvironment: {
      rooms: [{ id: 'room_kitchen', name: 'kitchen' }],
      screens: [],
    },
    lightMeasurements: [
      { tool: 'flicker', value: 3, takenAt: Date.now() - 86400000, roomId: 'room_kitchen' },
    ],
  });
  const withWarning = buildSunContext({ tier: 'always' });
  assert('Warnings name the room rather than expose the opaque roomId',
    /in kitchen/.test(withWarning) && !/roomId=room_kitchen/.test(withWarning));

  // ─── 11. Lab context always includes sun standard tier when sessions exist ───
  // The keyword-based intent detector was removed 2026-05-08; lab-context
  // now mirrors every other section's "if-data-exists" pattern. Verify
  // by checking that buildLabContext output contains the standard-tier
  // session table whenever sun sessions are present.
  console.log('%c 11. Sun standard-tier always included when data exists ', 'font-weight:bold;color:#f59e0b');

  if (typeof window.buildLabContext === 'function') {
    const labCtx = window.buildLabContext({});
    const sessions = window.getSessions ? window.getSessions().filter(s => s.endedAt) : [];
    if (sessions.length > 0) {
      assert('Lab context always carries [section:sun] when sessions exist',
        /\[section:sun\][\s\S]*\[\/section:sun\]/.test(labCtx));
      assert('Lab context always includes weekly-trend (standard tier) when sessions exist',
        /### Weekly trend \(last 6w/.test(labCtx));
    } else {
      assert('Lab context skips [section:sun] when no sessions',
        !/\[section:sun\]/.test(labCtx));
    }
  } else {
    assert('window.buildLabContext exists', false, 'skipped — function missing');
  }

  // ─── 12. Token-budget guard ──────────────────────────────────────────
  console.log('%c 12. Soft + hard budget caps ', 'font-weight:bold;color:#f59e0b');

  // Inflate the always-tier with a fat warnings array + calibration.
  // Each warning is ~60 chars; 200 of them blow past 2500.
  const fatMeasurements = [];
  for (let i = 0; i < 200; i++) {
    fatMeasurements.push({
      tool: 'flicker', value: 3, takenAt: Date.now() - i * 86400000,
      roomId: 'room_kitchen',
    });
  }
  reset({
    sunSessions: [{
      id: 'fat', startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      doses: { vitamin_d: 100 }, safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 }, bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
    entries: [{ date: '2026-04-15', markers: { 'vitamins.vitaminD': 90 } }],
    lightEnvironment: { rooms: [{ id: 'room_kitchen', name: 'kitchen' }], screens: [] },
    lightMeasurements: fatMeasurements,
  });
  const fat = buildSunContext({ tier: 'always' });
  assert('Always tier under hard cap (8500 chars) even when stuffed',
    fat.length < 8500, `len=${fat.length}`);

  // Realistic always-tier with all surfaces populated should fit under
  // the bumped soft cap (~3500). HARD is generous (8500) but SOFT is
  // where most users land — exceeding it triggers the trim cascade.
  assert('Realistic max-state always-tier under soft cap (3500 chars)',
    fat.length < 3500, `len=${fat.length}`);

  // ─── 13. Standard-tier regression — indoor env must survive ──────────
  // Žofka audit 2026-05-08 round 4: a populated user with ~5 device
  // sessions + indoor env + calibration triggered the aggressive trim,
  // which dropped the entire ### Indoor light environment section.
  // This pins the symptom: standard-tier output for a populated user
  // must keep BOTH the indoor env block and calibration anchor.
  console.log('%c 13. Standard-tier indoor env survives populated load ', 'font-weight:bold;color:#f59e0b');

  const populatedDevSessions = [];
  for (let i = 0; i < 5; i++) {
    populatedDevSessions.push({
      id: `dev_${i}`,
      startedAt: recent - i * 3600000,
      endedAt: recent - i * 3600000 + 600000,
      durationMin: 10,
      deviceId: 'd1',
      distanceCm: 15,
      bodyAreas: ['breast-chest', 'torso-front', 'abdomen', 'arms-front'],
      eyesProtected: false,
      doses: { vitamin_d: 4000, pbm_red: 5000, pbm_nir: 3000 },
    });
  }
  reset({
    sunSessions: [{
      id: 'sun1', startedAt: recent, endedAt: recent + 1200000, durationMin: 20,
      doses: { vitamin_d: 200, circadian: 100 }, safety: { medFraction: 0.3, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 6 }, bodyExposure: { preset: 'tshirt', fraction: 0.20 },
    }],
    deviceSessions: populatedDevSessions,
    lightDevices: [{ id: 'd1', brand: 'Mitochondriak', model: 'Maxi UVB', type: 'uvb', peakWavelengths: [295] }],
    sunDefaults: { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'none' },
    entries: [{ date: '2026-04-15', markers: { 'vitamins.vitaminD': 23 } }],
    lightEnvironment: {
      rooms: [{ id: 'r1', name: 'Office', primarySource: 'led-cool' }],
      screens: [
        { id: 's1', device: 'monitor', hoursPerDay: 8, eveningUseAfterSunset: 0, blueBlockerEnabled: true, roomId: 'r1' },
        { id: 's2', device: 'phone', hoursPerDay: 2, eveningUseAfterSunset: 0, blueBlockerEnabled: true },
      ],
    },
    lightAudits: [{
      id: 'a1', date: '2026-05-02', label: 'Audit 1',
      rooms: [{ id: 'r1', name: 'Office' }],
      measurements: [
        { roomId: 'r1', tool: 'lux', value: 5027, capturedAt: Date.now() },
        { roomId: 'r1', tool: 'cct', value: 6014, capturedAt: Date.now() },
        { roomId: 'r1', tool: 'flicker', value: 0, capturedAt: Date.now() },
        { roomId: 'r1', tool: 'spectrum', value: 'Daylight or full-spectrum', capturedAt: Date.now() },
      ],
      createdAt: Date.now(),
    }],
  });
  const populatedStandard = buildSunContext({ tier: 'standard' });
  assert('Populated standard tier keeps ### Indoor light environment',
    /### Indoor light environment/.test(populatedStandard), `len=${populatedStandard.length}`);
  assert('Populated standard tier keeps the audit baseline annotation',
    /baseline — no prior audit to compare/.test(populatedStandard));
  assert('Populated standard tier emits weekly-trend (per-channel last 6w shape)',
    /### Weekly trend \(last 6w/.test(populatedStandard));
  assert('Populated standard tier emits session cadence line',
    /### Session cadence/.test(populatedStandard));
  assert('Populated standard tier points to tool calls for per-session forensics',
    /getSunSessionsSlice|getSunSessionDetail/.test(populatedStandard));
  assert('Populated standard tier omits per-session sun table (shape match w/ wearables)',
    !/Last \d+ sessions \(most recent first\)/.test(populatedStandard));
  assert('Populated standard tier omits per-session device-therapy table (shape match w/ wearables)',
    !/Last \d+ device-therapy sessions/.test(populatedStandard));
  assert('Populated standard tier keeps calibration anchor',
    /### Calibration anchor/.test(populatedStandard));
  assert('Populated standard tier omits prose preambles (skin glossary)',
    !/Wallace rule of nines \+ Lund-Browder/.test(populatedStandard));
  assert('Populated standard tier omits Vit-D formula explainer prose',
    !/Vit-D IU formula:/.test(populatedStandard));
  assert('Populated standard tier under hard cap (8500 chars)',
    populatedStandard.length < 8500, `len=${populatedStandard.length}`);

  // Restore
  window._labState.importedData = orig;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
