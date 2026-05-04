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
  assert('Always tier surfaces 7-day per-channel totals header',
    /7-day per-channel dose totals/.test(always));
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
  assert('Standard tier surfaces session table header (Date | Min | Body% …)',
    /\| Date \| Min \| Body% \| Eyes \| UV \| MED% \| Vit-D \| Circ \|/.test(standard));
  // 5 sessions = 5 table rows
  assert('Standard tier renders one row per session',
    (standard.match(/\| s_\d/g) || []).length === 0 && // ids aren't in the row
    (standard.match(/\|\s*\d{4}-\d{2}-\d{2}/g) || []).length === 5);

  // ─── 5. Deep tier (+2500 tok) ────────────────────────────────────────
  console.log('%c 5. Deep tier per-session detail ', 'font-weight:bold;color:#f59e0b');

  const deep = buildSunContext({ tier: 'deep' });
  assert('Deep tier strictly longer than standard tier',
    deep.length > standard.length);
  assert('Deep tier surfaces "Detailed session records" header',
    /Detailed session records/.test(deep));
  assert('Deep tier renders per-session "Session <id>" markers',
    /#### Session s_/.test(deep));
  assert('Deep tier surfaces per-session Window / Body / Eyes / Channels / Safety',
    /Window:/.test(deep) && /Body:/.test(deep) && /Eyes:/.test(deep) &&
    /Channels:/.test(deep) && /Safety:/.test(deep));

  // ─── 6. Privacy: location rounding ───────────────────────────────────
  console.log('%c 6. Privacy-aware location rounding ', 'font-weight:bold;color:#f59e0b');

  // Stub a privacyRounding config so the deep tier rounds to 0.1° (~11 km)
  const origGetMeteoConfig = window.getMeteoConfig;
  window.getMeteoConfig = () => ({ privacyRounding: 0.1 });
  reset({
    sunSessions: [{
      id: 'locked',
      startedAt: recent, endedAt: recent + 60000, durationMin: 1,
      location: { lat: 50.0732, lon: 14.4378, altitudeM: 200 },
      doses: { vitamin_d: 50 },
      safety: { medFraction: 0.1, fitzpatrick: 'III' },
      atmosphere: { uvIndex: 5 },
      bodyExposure: { preset: 'face_hands', fraction: 0.05 },
    }],
  });
  const deepLoc = buildSunContext({ tier: 'deep' });
  // 0.1° rounding → 50.1, 14.4 (one decimal)
  assert('Deep tier rounds lat to 1 decimal at 0.1° privacy',
    /Location: 50\.1, 14\.4/.test(deepLoc), 'expected "Location: 50.1, 14.4"');

  // 0.01° (sharper) → two decimals
  window.getMeteoConfig = () => ({ privacyRounding: 0.01 });
  const deepLocSharp = buildSunContext({ tier: 'deep' });
  assert('Deep tier rounds lat to 2 decimals at 0.01° privacy',
    /Location: 50\.07, 14\.44/.test(deepLocSharp));

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
  for (const tier of ['always', 'standard', 'deep']) {
    const out = buildSunContext({ tier });
    assert(`${tier} tier wraps in matching section markers`,
      out.startsWith('[section:sunSessions]') &&
      out.endsWith('[/section:sunSessions]\n\n'));
  }

  // Restore
  window._labState.importedData = orig;

  console.log(`%c Sun Context: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
