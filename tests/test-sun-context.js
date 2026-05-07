// test-sun-context.js — buildSunContext({tier}) AI prompt assembly.
// Always / standard / deep tier shaping, deficit detection citations,
// section markers, token-budget guards.
// Run: fetch('tests/test-sun-context.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Sun Context Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const ctxMod = await import('/js/sun-context.js?bust=' + Date.now());
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
  assert('Always tier opens with [section:sunSessions] marker',
    always.startsWith('[section:sunSessions]'));
  assert('Always tier closes with [/section:sunSessions]',
    always.endsWith('[/section:sunSessions]\n\n'));
  assert('Always tier names the lens "Light & Sun"',
    /Light & Sun lens/.test(always));
  assert('Always tier reports total session count',
    /Outdoor sessions: 2/.test(always));
  assert('Always tier surfaces the active session warning',
    /ACTIVE SESSION in progress/.test(always));
  assert('Always tier surfaces 7-day rollup header',
    /7-day rollup \(sun \+ devices combined; tier vs typical weekly target\)/.test(always));
  // 30-day breakdown was dropped from always-tier in v1.7.18 (token compression).
  // It still backs deficit detection internally; the surface moved to standard tier.
  assert('Always tier omits 30-day totals header (compressed in v1.7.18)',
    !/30-day per-channel dose totals/.test(always));
  assert('Always tier serializes Fitzpatrick III from sunDefaults',
    /Fitzpatrick III/.test(always));
  assert('Always tier mentions Ott baseline when ottScore set',
    /Ott malillumination baseline: 4/.test(always));
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
  assert('Standard tier surfaces session table header (Date | Min | Body% | Regions | Eyes | UV peak | MED% | Vit-D (IU) | Circadian (lux·h))',
    /\| Date \| Min \| Body% \| Regions \| Eyes \| UV peak \| MED% \| Vit-D \(IU\) \| Circadian \(lux·h\) \|/.test(standard));
  // 5 sessions = 5 table rows
  assert('Standard tier renders one row per session',
    (standard.match(/\| s_\d/g) || []).length === 0 && // ids aren't in the row
    (standard.match(/\|\s*\d{4}-\d{2}-\d{2}/g) || []).length === 5);

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
  const detail = getSunSessionDetail('locked');
  assert('getSunSessionDetail: known id → projected session',
    detail && detail.id === 'locked');
  assert('getSunSessionDetail surfaces all fields when caller asks by id',
    detail.date && detail.body && detail.atmosphere && detail.safety);
  assert('getSunSessionDetail body block carries regions array',
    Array.isArray(detail.body.regions) && detail.body.regions.includes('face'));
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
      out.startsWith('[section:sunSessions]') &&
      out.endsWith('[/section:sunSessions]\n\n'));
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

  // ─── 11. Sun-intent detection (lab-context.js) ───────────────────────
  console.log('%c 11. Sun-intent regex ', 'font-weight:bold;color:#f59e0b');

  const { _detectSunIntent } = await import('/js/lab-context.js?bust=' + Date.now());
  assert('Detects "vitamin D" intent', _detectSunIntent('How is my vitamin D?'));
  assert('Detects "circadian" intent', _detectSunIntent('Talk circadian rhythm'));
  assert('Detects "sleep" intent', _detectSunIntent('My sleep is bad'));
  assert('Detects "PBM" intent', _detectSunIntent('Should I do PBM?'));
  assert('Detects "winter" intent', _detectSunIntent('Winter blues'));
  assert('Skips unrelated chat', !_detectSunIntent('What is my HbA1c?'));
  assert('Skips empty / null', !_detectSunIntent('') && !_detectSunIntent(null));

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
  assert('Always tier under hard cap (4000 chars) even when stuffed',
    fat.length < 4000, `len=${fat.length}`);

  // Realistic always-tier with all surfaces populated should also fit
  // comfortably under the soft cap (~2500). If a future feature tips
  // typical users past that line the tier-shaping should be revisited.
  assert('Realistic max-state always-tier under soft cap (2500 chars)',
    fat.length < 2500, `len=${fat.length}`);

  // Restore
  window._labState.importedData = orig;

  console.log(`%c Sun Context: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
