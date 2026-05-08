// test-sun-defaults.js — Onboarding defaults: Fitzpatrick mapping, OTT score
// boundaries, option-list shapes, getSunDefaults / saveSunDefaults round-trip,
// isOnboardingComplete gate.
// Run: fetch('tests/test-sun-defaults.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Sun Defaults Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const mod = await import('/js/sun-defaults.js?bust=' + Date.now());
  const {
    FITZPATRICK_OPTIONS,
    HOME_LIGHT_OPTIONS,
    EYEWEAR_OPTIONS,
    OTT_QUESTIONS,
    getSunDefaults,
    saveSunDefaults,
    isOnboardingComplete,
    ottScoreToLabel,
    lightBurdenToLabel,
  } = mod;

  // Stash importedData so we don't pollute the host page.
  const orig = window._labState.importedData;

  // ─── 1. Fitzpatrick options shape ─────────────────────────────────────
  console.log('%c 1. Fitzpatrick options ', 'font-weight:bold;color:#f59e0b');

  // Loosened: at least 6 entries; the I–VI keys must all be present.
  assert('FITZPATRICK_OPTIONS has at least 6 entries (I–VI)',
    FITZPATRICK_OPTIONS.length >= 6, `length=${FITZPATRICK_OPTIONS.length}`);
  const expectedKeys = ['I','II','III','IV','V','VI'];
  for (let i = 0; i < expectedKeys.length; i++) {
    assert(`Option ${i} key === '${expectedKeys[i]}'`, FITZPATRICK_OPTIONS[i].key === expectedKeys[i]);
    assert(`Option ${i} has descriptive label`, typeof FITZPATRICK_OPTIONS[i].label === 'string' && FITZPATRICK_OPTIONS[i].label.length > 0);
  }

  // ─── 2. HOME_LIGHT_OPTIONS / EYEWEAR_OPTIONS shape ───────────────────
  console.log('%c 2. Indoor-light + eyewear option lists ', 'font-weight:bold;color:#f59e0b');

  assert('HOME_LIGHT_OPTIONS includes "unknown" (graceful skip)',
    HOME_LIGHT_OPTIONS.some(o => o.key === 'unknown'));
  assert('HOME_LIGHT_OPTIONS includes both LED variants (cool + warm)',
    HOME_LIGHT_OPTIONS.some(o => o.key === 'led-cool') &&
    HOME_LIGHT_OPTIONS.some(o => o.key === 'led-warm'));
  // Every option has both key + label
  for (const o of HOME_LIGHT_OPTIONS) {
    assert(`HOME_LIGHT option '${o.key}' has label`, typeof o.label === 'string' && o.label.length > 0);
  }
  for (const o of EYEWEAR_OPTIONS) {
    assert(`EYEWEAR option '${o.key}' has label`, typeof o.label === 'string' && o.label.length > 0);
  }
  assert('EYEWEAR_OPTIONS includes "none" baseline',
    EYEWEAR_OPTIONS.some(o => o.key === 'none'));

  // ─── 3. OTT_QUESTIONS ─────────────────────────────────────────────────
  console.log('%c 3. OTT 10-question audit shape ', 'font-weight:bold;color:#f59e0b');

  // Loosened from `=== 10` to `>=` — adding a new audit question is a
  // safe extension. The required keys spot-check below ensures the
  // canonical 10 are still present.
  assert('OTT_QUESTIONS has at least 10 items (per audit definition)',
    OTT_QUESTIONS.length >= 10, `length=${OTT_QUESTIONS.length}`);
  const ottKeys = new Set(OTT_QUESTIONS.map(q => q.key));
  assert('OTT_QUESTIONS keys are unique', ottKeys.size === OTT_QUESTIONS.length);
  for (const q of OTT_QUESTIONS) {
    assert(`OTT question '${q.key}' has prompt text`, typeof q.text === 'string' && q.text.length > 10);
    // v1.7.18: every question carries a one-line "why" sub-label that
    // teaches the photobiology behind the question. The setup card
    // renders it under the prompt so users learn the model rather than
    // just self-reporting.
    assert(`OTT question '${q.key}' carries a 'why' explainer`,
      typeof q.why === 'string' && q.why.length > 20);
  }
  // Spot-check the canonical keys we documented in source
  const requiredOttKeys = [
    'morning-light-deficit', 'glass-mediated-daytime', 'dim-workspace',
    'cool-led-evening', 'evening-screens', 'bright-after-sunset',
    'sleep-not-dark', 'sunscreen-blocks-uvb', 'sunglasses-outside',
    'low-outdoor-time',
  ];
  for (const k of requiredOttKeys) {
    assert(`OTT_QUESTIONS contains '${k}'`, ottKeys.has(k));
  }

  // ─── 4. ottScoreToLabel boundaries ────────────────────────────────────
  console.log('%c 4. Score → label tier mapping ', 'font-weight:bold;color:#f59e0b');

  // Tier boundaries: <=1=tier0, 2-3=tier1, 4-5=tier2, 6-7=tier3, 8-10=tier4
  const tierCases = [
    { score: 0,  expected: 0, desc: '0 → well-aligned (tier 0)' },
    { score: 1,  expected: 0, desc: '1 → still tier 0 (boundary)' },
    { score: 2,  expected: 1, desc: '2 → minor gaps (tier 1)' },
    { score: 3,  expected: 1, desc: '3 → still tier 1 (boundary)' },
    { score: 4,  expected: 2, desc: '4 → moderate (tier 2)' },
    { score: 5,  expected: 2, desc: '5 → still tier 2 (boundary)' },
    { score: 6,  expected: 3, desc: '6 → significant (tier 3)' },
    { score: 7,  expected: 3, desc: '7 → still tier 3 (boundary)' },
    { score: 8,  expected: 4, desc: '8 → severe (tier 4)' },
    { score: 10, expected: 4, desc: '10 → still tier 4 (max)' },
  ];
  for (const c of tierCases) {
    const out = ottScoreToLabel(c.score);
    assert(c.desc, out.tier === c.expected, `tier=${out.tier} label="${out.label}"`);
  }

  // Non-numeric input
  const nan1 = ottScoreToLabel(undefined);
  assert('ottScoreToLabel(undefined) → { label:"—", tier:0 }',
    nan1.label === '—' && nan1.tier === 0);
  const nan2 = ottScoreToLabel('5');
  assert('ottScoreToLabel(non-number string) → tier 0 placeholder',
    nan2.label === '—' && nan2.tier === 0);

  // Alias contract
  assert('lightBurdenToLabel === ottScoreToLabel (alias)', lightBurdenToLabel === ottScoreToLabel);

  // ─── 5. getSunDefaults / saveSunDefaults round-trip ───────────────────
  console.log('%c 5. Defaults persistence ', 'font-weight:bold;color:#f59e0b');

  // Stub a clean importedData with a no-op saveImportedData so we don't
  // hit the real CRDT/IDB save path.
  window._labState.importedData = { entries: [] };
  // saveImportedData is imported by sun-defaults from data.js; the real
  // implementation persists. We don't need to mock it — just keep the
  // test profile id constant so artifacts don't accumulate.

  const empty = getSunDefaults();
  assert('getSunDefaults seeds importedData.sunDefaults when missing',
    empty && typeof empty === 'object' && window._labState.importedData.sunDefaults === empty);

  await saveSunDefaults({ fitzpatrick: 'III', homeLight: 'led-warm' });
  const after1 = getSunDefaults();
  assert('saveSunDefaults patches fitzpatrick', after1.fitzpatrick === 'III');
  assert('saveSunDefaults patches homeLight', after1.homeLight === 'led-warm');

  // Patch is additive (preserves earlier fields)
  await saveSunDefaults({ eyewear: 'sunglasses' });
  const after2 = getSunDefaults();
  assert('Subsequent save preserves earlier fitzpatrick',
    after2.fitzpatrick === 'III' && after2.eyewear === 'sunglasses');

  // ─── 6. isOnboardingComplete gate ─────────────────────────────────────
  console.log('%c 6. Onboarding-complete gate ', 'font-weight:bold;color:#f59e0b');

  // Just fitzpatrick set is not enough — needs completedAt
  assert('isOnboardingComplete falsy without completedAt',
    !isOnboardingComplete());

  await saveSunDefaults({ completedAt: Date.now() });
  assert('isOnboardingComplete truthy once completedAt set',
    !!isOnboardingComplete());

  // Clear fitzpatrick, even with completedAt → falsy (both required)
  await saveSunDefaults({ fitzpatrick: null });
  assert('isOnboardingComplete falsy when fitzpatrick cleared',
    !isOnboardingComplete());

  // Empty importedData → falsy
  window._labState.importedData = null;
  assert('isOnboardingComplete falsy when importedData missing',
    !isOnboardingComplete());

  // ─── 7. getSunDefaults handles missing importedData ──────────────────
  console.log('%c 7. Defensive guards ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData = null;
  assert('getSunDefaults() returns null when importedData missing',
    getSunDefaults() === null);

  // Restore
  window._labState.importedData = orig;

  // ─── 8. getSunCoords country-band path is device-tz-independent ────────
  // Regression: previously lon was derived from `new Date().getTimezoneOffset()`,
  // so the same profile produced different coords on devices in different OS
  // timezones (or DST states), surfaced as cross-device "last UV-A" / UVI
  // mismatches. Country centroid lookup is now fully deterministic.
  console.log('%c 8. getSunCoords cross-device determinism ', 'font-weight:bold;color:#f59e0b');

  const sunMod = await import('/js/sun.js?bust=' + Date.now());
  const { getSunCoords } = sunMod;
  const profileMod = await import('/js/profile.js?bust=' + Date.now());
  const { setProfileLocation, getProfileLocation } = profileMod;

  // Stash original profile location
  const origLoc = getProfileLocation();
  // Ensure we're in country-band mode (no profile-precise coords)
  const stashedSunDefaults = window._labState.importedData?.sunDefaults;
  if (window._labState.importedData) window._labState.importedData.sunDefaults = null;

  setProfileLocation(null, 'czech republic', '');
  const cz = getSunCoords();
  assert("Czech profile resolves to country-band centroid",
    cz && cz.source === 'country-band', `got ${JSON.stringify(cz)}`);
  assert("Czech centroid lat ≈ 49.8 (was tz-stable, now deterministic)",
    cz && Math.abs(cz.lat - 49.8) < 0.5, `lat=${cz?.lat}`);
  assert("Czech centroid lon ≈ 15.5 (was device-tz-derived → divergent)",
    cz && Math.abs(cz.lon - 15.5) < 0.5, `lon=${cz?.lon}`);

  // The lon must NOT depend on the device tz. Repeated calls (which would
  // re-evaluate `new Date().getTimezoneOffset()` under the old code) yield
  // identical lon today.
  const cz2 = getSunCoords();
  assert("getSunCoords is pure for the same profile (no tz drift)",
    cz2 && cz2.lon === cz.lon && cz2.lat === cz.lat);

  // Different country → different centroid.
  setProfileLocation(null, 'japan', '');
  const jp = getSunCoords();
  assert("Japan resolves to its own centroid (lat ~36, lon ~138)",
    jp && Math.abs(jp.lat - 36.2) < 0.5 && Math.abs(jp.lon - 138.3) < 0.5,
    `got ${JSON.stringify(jp)}`);

  // Country known to band table but if centroid map ever loses an entry,
  // we degrade to band-lat + lon=0 — never to a tz-derived guess.
  // (No assertion here for missing-country path since the table is full;
  // the code path is a guarded fallback.)

  // Restore profile location
  setProfileLocation(null, origLoc.country || '', origLoc.zip || '');
  if (window._labState.importedData) window._labState.importedData.sunDefaults = stashedSunDefaults;

  console.log(`%c Sun Defaults: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
