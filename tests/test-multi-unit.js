#!/usr/bin/env node
// Node-side test: multi-unit display + manual-entry helpers in js/schema.js.
//
// Two pure helpers under test (no DOM, no state dep):
//   getAlternateUnit(dotKey, displayValue, isUSMode)
//     → { value, unit } in the other system, or null
//   convertUserInputToSI(dotKey, value, inputUnit)
//     → canonical SI value, regardless of which side the user typed in
//
// Also pins the 5 newly-added UNIT_CONVERSIONS entries (issue #164) so a
// future schema edit doesn't silently drop them.
//
// Run: node tests/test-multi-unit.js

globalThis.window = globalThis.window || {};
const { UNIT_CONVERSIONS, MARKER_SCHEMA, getAlternateUnit, convertUserInputToSI } = await import('../js/schema.js');

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
function approxEq(a, b, tol = 0.01) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

console.log('=== multi-unit helpers ===\n');

// ── 5 newly-added UNIT_CONVERSIONS entries (audit fixed these) ──
console.log('-- new conversion entries pinned --');
const newKeys = [
  ['biochemistry.egfr', 60, 'mL/min/1.73m²'],
  ['biochemistry.gfrCystatin', 60, 'mL/min'],
  ['biochemistry.cystatinC', 0.1, 'mg/dl'],
  ['proteins.hsCRP', 0.1, 'mg/dl'],
  ['proteins.crp', 0.1, 'mg/dl'],
];
for (const [k, factor, unit] of newKeys) {
  const c = UNIT_CONVERSIONS[k];
  assert(`${k} present in UNIT_CONVERSIONS`, !!c);
  if (c) {
    assert(`${k} factor = ${factor}`, c.factor === factor, `got ${c?.factor}`);
    assert(`${k} usUnit = ${unit}`, c.usUnit === unit, `got ${c?.usUnit}`);
  }
}

// ── 16 label-only US-convention entries (factor:1, identical numerical value) ──
// These exist so a US user can recognize e.g. "5 µIU/mL" on a Quest report as
// the same value as the app's "5 mU/L". The number doesn't change — only the
// printed label does. Skipped: true universals (homocysteine, MCV, hematocrit)
// and labels that match exactly across systems (SHBG nmol/L).
console.log('\n-- label-only US-convention entries (factor:1) --');
const labelOnlyKeys = [
  ['hormones.insulin',         'µIU/mL'],
  ['diabetes.insulin_d',       'µIU/mL'],
  ['thyroid.tsh',              'µIU/mL'],
  ['hormones.lh',              'mIU/mL'],
  ['hormones.fsh',             'mIU/mL'],
  ['electrolytes.sodium',      'mEq/L'],
  ['electrolytes.potassium',   'mEq/L'],
  ['electrolytes.chloride',    'mEq/L'],
  ['hematology.wbc',           'K/µL'],
  ['hematology.rbc',           'M/µL'],
  ['hematology.platelets',     'K/µL'],
  ['differential.neutrophils', 'K/µL'],
  ['differential.lymphocytes', 'K/µL'],
  ['differential.monocytes',   'K/µL'],
  ['differential.eosinophils', 'K/µL'],
  ['differential.basophils',   'K/µL'],
];
for (const [k, expectedUnit] of labelOnlyKeys) {
  const c = UNIT_CONVERSIONS[k];
  assert(`${k} present in UNIT_CONVERSIONS`, !!c);
  if (c) {
    assert(`${k} factor = 1`, c.factor === 1, `got ${c?.factor}`);
    assert(`${k} usUnit = ${expectedUnit}`, c.usUnit === expectedUnit, `got "${c?.usUnit}"`);
    // Identity check: value passes through unchanged
    const out = getAlternateUnit(k, 42, false);
    assert(`${k} 42 SI → 42 ${expectedUnit}`, out && out.value === 42 && out.unit === expectedUnit, `got ${JSON.stringify(out)}`);
    const back = convertUserInputToSI(k, 42, expectedUnit);
    assert(`${k} 42 ${expectedUnit} → 42 SI`, back === 42, `got ${back}`);
  }
}

// ── Explicit math spot-checks for label-only entries (catches mislabeled SI units) ──
console.log('\n-- math spot-checks --');
{
  // Sodium 140 mmol/L should show as 140 mEq/L
  const na = getAlternateUnit('electrolytes.sodium', 140, false);
  assert('Na 140 mmol/L → 140 mEq/L', na && na.value === 140 && na.unit === 'mEq/L', `got ${JSON.stringify(na)}`);
  // WBC 7.5 ×10⁹/L → 7.5 K/µL
  const wbc = getAlternateUnit('hematology.wbc', 7.5, false);
  assert('WBC 7.5 ×10⁹/L → 7.5 K/µL', wbc && wbc.value === 7.5 && wbc.unit === 'K/µL', `got ${JSON.stringify(wbc)}`);
  // RBC 5.0 ×10¹²/L → 5.0 M/µL (different unit label from WBC!)
  const rbc = getAlternateUnit('hematology.rbc', 5.0, false);
  assert('RBC 5.0 ×10¹²/L → 5.0 M/µL', rbc && rbc.value === 5.0 && rbc.unit === 'M/µL', `got ${JSON.stringify(rbc)}`);
  // TSH 2.5 mU/L → 2.5 µIU/mL
  const tsh = getAlternateUnit('thyroid.tsh', 2.5, false);
  assert('TSH 2.5 mU/L → 2.5 µIU/mL', tsh && tsh.value === 2.5 && tsh.unit === 'µIU/mL', `got ${JSON.stringify(tsh)}`);
  // LH 6.0 U/L → 6.0 mIU/mL (NB: usUnit differs from TSH/insulin: mIU not µIU)
  const lh = getAlternateUnit('hormones.lh', 6.0, false);
  assert('LH 6.0 U/L → 6.0 mIU/mL', lh && lh.value === 6.0 && lh.unit === 'mIU/mL', `got ${JSON.stringify(lh)}`);
}

// ── Negative coverage: markers we deliberately *didn't* add a conversion for ──
console.log('\n-- non-coverage (universal-label markers stay no-toggle) --');
{
  // Homocysteine — identical µmol/L in both systems, no toggle should appear
  assert('homocysteine has no UNIT_CONVERSIONS entry', !UNIT_CONVERSIONS['coagulation.homocysteine']);
  assert('homocysteine → null via getAlternateUnit', getAlternateUnit('coagulation.homocysteine', 8, false) === null);
  // SHBG — universal nmol/L, no toggle needed
  assert('SHBG has no UNIT_CONVERSIONS entry', !UNIT_CONVERSIONS['hormones.shbg']);
  // Hematocrit — universal % in both, no toggle
  assert('hematocrit has no UNIT_CONVERSIONS entry', !UNIT_CONVERSIONS['hematology.hematocrit']);
  // MCV — universal fL
  assert('MCV has no UNIT_CONVERSIONS entry', !UNIT_CONVERSIONS['hematology.mcv']);
}

// ── getAlternateUnit — SI → US (EU display mode, show US) ──
console.log('\n-- getAlternateUnit: SI display, show US --');
{
  // Glucose 5.0 mmol/L → 90.09 mg/dL (factor 18.018)
  const a = getAlternateUnit('biochemistry.glucose', 5.0, false);
  assert('glucose 5.0 mmol/L → mg/dL', a && approxEq(a.value, 90.09, 0.01) && a.unit === 'mg/dl', `got ${JSON.stringify(a)}`);
  // hs-CRP 1.0 mg/L → 0.1 mg/dL
  const c = getAlternateUnit('proteins.hsCRP', 1.0, false);
  assert('hs-CRP 1.0 mg/L → 0.1 mg/dL', c && approxEq(c.value, 0.1, 0.01) && c.unit === 'mg/dl', `got ${JSON.stringify(c)}`);
  // eGFR 1.5 mL/s → 90 mL/min
  const e = getAlternateUnit('biochemistry.egfr', 1.5, false);
  assert('eGFR 1.5 ml/s → 90 mL/min', e && approxEq(e.value, 90, 0.1) && e.unit === 'mL/min/1.73m²', `got ${JSON.stringify(e)}`);
}

// ── getAlternateUnit — US → SI (US display mode, show SI) ──
console.log('\n-- getAlternateUnit: US display, show SI --');
{
  // Glucose 90 mg/dL → 4.995 mmol/L
  const a = getAlternateUnit('biochemistry.glucose', 90, true);
  assert('glucose 90 mg/dL → mmol/L', a && approxEq(a.value, 4.995, 0.01) && a.unit === 'mmol/l', `got ${JSON.stringify(a)}`);
  // hs-CRP 0.3 mg/dL → 3.0 mg/L
  const c = getAlternateUnit('proteins.hsCRP', 0.3, true);
  assert('hs-CRP 0.3 mg/dL → 3.0 mg/L', c && approxEq(c.value, 3.0, 0.01) && c.unit === 'mg/l', `got ${JSON.stringify(c)}`);
}

// ── getAlternateUnit — hba1c special case ──
console.log('\n-- getAlternateUnit: hba1c (non-multiply formula) --');
{
  // 42 mmol/mol → ~6.0% (formula: (42/10.929) + 2.15)
  const a = getAlternateUnit('diabetes.hba1c', 42, false);
  assert('hba1c 42 mmol/mol → ~6.0%', a && approxEq(a.value, 6.0, 0.05) && a.unit === '%', `got ${JSON.stringify(a)}`);
  // 6.0% → ~42 mmol/mol (inverse)
  const b = getAlternateUnit('diabetes.hba1c', 6.0, true);
  assert('hba1c 6.0% → ~42 mmol/mol', b && approxEq(b.value, 42, 0.5) && b.unit === 'mmol/mol', `got ${JSON.stringify(b)}`);
}

// ── getAlternateUnit — edge cases ──
console.log('\n-- getAlternateUnit: edge cases --');
{
  assert('null value → null', getAlternateUnit('biochemistry.glucose', null, false) === null);
  assert('undefined value → null', getAlternateUnit('biochemistry.glucose', undefined, false) === null);
  assert('NaN value → null', getAlternateUnit('biochemistry.glucose', NaN, false) === null);
  assert('no UNIT_CONVERSIONS entry → null', getAlternateUnit('hormones.shbg', 50, false) === null, 'shbg has no usUnit');
  assert('unknown dotKey → null', getAlternateUnit('bogus.marker', 1, false) === null);
  assert('malformed dotKey (no dot) → null', getAlternateUnit('glucose', 5, false) === null);
}

// ── convertUserInputToSI — user types in SI unit ──
console.log('\n-- convertUserInputToSI: SI input passes through --');
{
  const v = convertUserInputToSI('biochemistry.glucose', 5.0, 'mmol/l');
  assert('5.0 mmol/L → 5.0 (stored as-is)', approxEq(v, 5.0), `got ${v}`);
  const v2 = convertUserInputToSI('proteins.hsCRP', 1.5, 'mg/l');
  assert('1.5 mg/L → 1.5 (hs-CRP stored as-is)', approxEq(v2, 1.5), `got ${v2}`);
}

// ── convertUserInputToSI — user types in US unit ──
console.log('\n-- convertUserInputToSI: US input → SI --');
{
  const v = convertUserInputToSI('biochemistry.glucose', 90, 'mg/dl');
  assert('90 mg/dL → ~5.0 mmol/L', approxEq(v, 4.995, 0.01), `got ${v}`);
  const v2 = convertUserInputToSI('proteins.hsCRP', 0.3, 'mg/dl');
  assert('0.3 mg/dL → 3.0 mg/L (hs-CRP)', approxEq(v2, 3.0, 0.01), `got ${v2}`);
  // hba1c: 6.0% → ~42 mmol/mol
  const v3 = convertUserInputToSI('diabetes.hba1c', 6.0, '%');
  assert('hba1c 6.0% → ~42 mmol/mol', approxEq(v3, 42, 0.5), `got ${v3}`);
}

// ── Round-trip integrity: SI → alt → input → SI should preserve precision ──
console.log('\n-- round-trip integrity --');
{
  // Start in SI, get alt, treat as user input, convert back to SI — should match.
  for (const dotKey of ['biochemistry.glucose', 'lipids.cholesterol', 'iron.ferritin', 'proteins.hsCRP']) {
    const siStart = 5.0;
    const alt = getAlternateUnit(dotKey, siStart, false);
    if (!alt) { console.log(`  SKIP: ${dotKey} (no conversion)`); continue; }
    const back = convertUserInputToSI(dotKey, alt.value, alt.unit);
    assert(`${dotKey} round-trip SI→alt→SI`, approxEq(back, siStart, 0.01), `siStart=${siStart}, alt=${alt.value} ${alt.unit}, back=${back}`);
  }
}

// ── Edge: convertUserInputToSI when no conversion exists ──
console.log('\n-- convertUserInputToSI: passthrough cases --');
{
  // SHBG has no conversion — input should pass through regardless of inputUnit
  assert('SHBG no-conv → passthrough', convertUserInputToSI('hormones.shbg', 50, 'nmol/l') === 50);
  assert('unknown dotKey → passthrough', convertUserInputToSI('bogus.marker', 42, 'whatever') === 42);
}

// ── 5 new conversions surface in helpers (smoke test) ──
console.log('\n-- new conversions reachable via helpers --');
{
  // Each new conversion should produce a non-null result via getAlternateUnit.
  for (const [k] of newKeys) {
    const got = getAlternateUnit(k, 1, false);
    assert(`${k} reachable via getAlternateUnit`, got && got.value != null, `got ${JSON.stringify(got)}`);
  }
}

// ── Source-shape pins: keep the view + settings + data integration intact ──
console.log('\n-- source-shape pins (UI wiring) --');
{
  const fs = await import('node:fs');
  const views = fs.readFileSync(new URL('../js/views.js', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../js/settings.js', import.meta.url), 'utf8');
  const data = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8');
  const state = fs.readFileSync(new URL('../js/state.js', import.meta.url), 'utf8');
  const profile = fs.readFileSync(new URL('../js/profile.js', import.meta.url), 'utf8');

  // Detail modal gates alt rendering on state.showAltUnits
  assert('views.js gates alt-unit summary on state.showAltUnits',
    /hasConv && state\.showAltUnits/.test(views));
  assert('views.js gates per-value alt line on state.showAltUnits',
    /\(hasConv && state\.showAltUnits\) \? getAlternateUnit/.test(views));
  // openManualEntryForm rebuilds the unit picker on every open + renders the <select id="me-unit">
  assert('views.js manual-entry form renders #me-unit select when conversion exists',
    /<select id="me-unit" class="me-unit-select"/.test(views));
  // saveManualEntry reads the unit picker + branches to convertUserInputToSI
  assert('views.js saveManualEntry reads #me-unit + branches to convertUserInputToSI on alt-unit input',
    /document\.getElementById\('me-unit'\)[\s\S]{0,6000}convertUserInputToSI\(dotKey, value, inputUnit\)/.test(views));
  // Stale-marker fix: openManualEntryForm always reads from getActiveData (not state.markerRegistry)
  assert('openManualEntryForm always re-resolves from getActiveData (no markerRegistry fallback first)',
    /export function openManualEntryForm[\s\S]{0,800}const data = getActiveData\(\);\s+const marker = data\.categories/.test(views));
  // Greptile P1 fix: closeModal must clear state._activeDetailMarkerId so a
  // toggleAltUnits fired from Settings → Display after the user closed the
  // detail modal doesn't re-open it on top of Settings.
  assert('closeModal clears state._activeDetailMarkerId',
    /export function closeModal\(\)[\s\S]{0,1000}state\._activeDetailMarkerId = null/.test(views));

  // Settings → Display has the Alternate Units row + both buttons
  assert('settings.js renders Alternate Units row in Display tab',
    /label class="settings-label"[^>]*>Alternate Units</.test(settings));
  assert('settings.js Off button maps to toggleAltUnits(false)',
    /data-alt-units="off"[^>]*onclick="toggleAltUnits\(false\)/.test(settings));
  assert('settings.js Show-both button maps to toggleAltUnits(true)',
    /data-alt-units="on"[^>]*onclick="toggleAltUnits\(true\)/.test(settings));
  assert('settings.js updateSettingsUI refreshes alt-units active state',
    /unit-toggle-btn\[data-alt-units\][^)]*\)\.forEach[\s\S]{0,300}state\.showAltUnits/.test(settings));
  assert('settings.js unit-toggle scope is narrowed to [data-unit] (so alt-units buttons aren\'t deactivated)',
    /unit-toggle-btn\[data-unit\]/.test(settings));

  // data.js: toggleAltUnits accepts force arg, persists, refreshes detail modal
  assert('data.js toggleAltUnits accepts force arg',
    /export function toggleAltUnits\(force\)/.test(data));
  assert('data.js toggleAltUnits persists to localStorage',
    /localStorage\.setItem\(profileStorageKey\(state\.currentProfile, 'showAltUnits'\)/.test(data));
  assert('data.js toggleAltUnits refreshes open detail modal via state._activeDetailMarkerId',
    /state\._activeDetailMarkerId[\s\S]{0,200}window\.showDetailModal/.test(data));
  assert('data.js exports toggleAltUnits on window',
    /Object\.assign\(window, \{[^}]*toggleAltUnits/.test(data));

  // state.js: showAltUnits default off
  assert('state.js declares showAltUnits: false',
    /showAltUnits:\s*false/.test(state));
  // profile.js: load + cleanup
  assert('profile.js loads showAltUnits from localStorage on profile switch',
    /state\.showAltUnits = localStorage\.getItem\(profileStorageKey\(profileId, 'showAltUnits'\)\) === 'on'/.test(profile));
  assert('profile.js cleans up showAltUnits key on deleteProfile',
    /localStorage\.removeItem\(profileStorageKey\(profileId, 'showAltUnits'\)\)/.test(profile));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
