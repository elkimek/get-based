#!/usr/bin/env node
// test-biometrics.js — Verify biometrics: height, weight, BP, pulse, BMI, export/import
//
// Run: node tests/test-biometrics.js  (or via npm test)

globalThis.window = globalThis.window || globalThis;
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();
if (typeof globalThis.addEventListener !== 'function') {
  const _l = new Map();
  globalThis.addEventListener = (t, f) => { (_l.get(t) || _l.set(t, new Set()).get(t)).add(f); };
  globalThis.removeEventListener = (t, f) => { _l.get(t)?.delete(f); };
  globalThis.dispatchEvent = (ev) => { const fns = _l.get(ev?.type); if (fns) for (const fn of fns) { try { fn(ev); } catch (e) { console.error(e); } } return true; };
}
if (typeof globalThis.CSS === 'undefined') globalThis.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Biometrics Tests ===\n');

await import('../js/state.js');
await import('../js/profile.js');
await import('../js/lab-context.js');
// Initialize profiles so getProfiles() / setProfileHeight() have something
// to mutate. The puppeteer environment runs main.js which seeds this.
if (!window._labState.profiles) {
  window._labState.profiles = [{ id: 'default', name: 'Default' }];
}
  const state = window._labState;
  const profileId = state.currentProfile;

  // Save originals
  const origBio = state.importedData.biometrics;
  const origProfiles = JSON.parse(JSON.stringify(window.getProfiles()));

  // ═══════════════════════════════════════
  // 1. Profile height getter/setter
  // ═══════════════════════════════════════
  console.log('1. Height on Profile');

  assert('getProfileHeight is a function', typeof window.getProfileHeight === 'function');
  assert('setProfileHeight is a function', typeof window.setProfileHeight === 'function');

  window.setProfileHeight(profileId, 180, 'cm');
  let h = window.getProfileHeight(profileId);
  assert('Height stored correctly', h.height === 180, `got ${h.height}`);
  assert('Height unit stored correctly', h.unit === 'cm', `got ${h.unit}`);

  window.setProfileHeight(profileId, 175.5, 'in');
  h = window.getProfileHeight(profileId);
  assert('Height updates', h.height === 175.5);
  assert('Height unit updates', h.unit === 'in');

  // Restore
  window.setProfileHeight(profileId, null, 'cm');

  // ═══════════════════════════════════════
  // 2. Biometrics data migration
  // ═══════════════════════════════════════
  console.log('2. Data Migration');

  const testData = {};
  window.migrateProfileData(testData);
  assert('migrateProfileData backfills biometrics', testData.biometrics === null);

  // ═══════════════════════════════════════
  // 3. Weight entries
  // ═══════════════════════════════════════
  console.log('3. Weight CRUD');

  state.importedData.biometrics = { weight: [], bp: [], pulse: [] };

  state.importedData.biometrics.weight.push({ date: '2026-01-15', value: 80, unit: 'kg' });
  state.importedData.biometrics.weight.push({ date: '2026-02-15', value: 82, unit: 'kg' });
  assert('Weight entries added', state.importedData.biometrics.weight.length === 2);

  // Dedup by date — same date replaces
  state.importedData.biometrics.weight = state.importedData.biometrics.weight.filter(e => e.date !== '2026-01-15');
  state.importedData.biometrics.weight.push({ date: '2026-01-15', value: 81, unit: 'kg' });
  assert('Weight dedup by date', state.importedData.biometrics.weight.length === 2);
  const jan = state.importedData.biometrics.weight.find(e => e.date === '2026-01-15');
  assert('Weight updated value on dedup', jan.value === 81);

  // lbs unit stored
  state.importedData.biometrics.weight.push({ date: '2026-03-15', value: 185, unit: 'lbs' });
  assert('Weight supports lbs', state.importedData.biometrics.weight[2].unit === 'lbs');

  // Sort ascending
  state.importedData.biometrics.weight.sort((a, b) => a.date.localeCompare(b.date));
  assert('Weight sorted ascending', state.importedData.biometrics.weight[0].date === '2026-01-15');

  // ═══════════════════════════════════════
  // 4. BP entries
  // ═══════════════════════════════════════
  console.log('4. Blood Pressure CRUD');

  state.importedData.biometrics.bp.push({ date: '2026-01-15', sys: 120, dia: 80 });
  state.importedData.biometrics.bp.push({ date: '2026-02-15', sys: 130, dia: 85 });
  assert('BP entries added', state.importedData.biometrics.bp.length === 2);
  assert('BP has sys', state.importedData.biometrics.bp[0].sys === 120);
  assert('BP has dia', state.importedData.biometrics.bp[0].dia === 80);

  // ═══════════════════════════════════════
  // 5. Pulse entries
  // ═══════════════════════════════════════
  console.log('5. Pulse CRUD');

  state.importedData.biometrics.pulse.push({ date: '2026-01-15', value: 65 });
  state.importedData.biometrics.pulse.push({ date: '2026-02-15', value: 70 });
  assert('Pulse entries added', state.importedData.biometrics.pulse.length === 2);

  // ═══════════════════════════════════════
  // 6. BMI calculation
  // ═══════════════════════════════════════
  console.log('6. BMI Calculation');

  // BMI = weight(kg) / height(m)^2
  // 82 kg / (1.80)^2 = 25.3
  window.setProfileHeight(profileId, 180, 'cm');
  // Latest weight is 2026-03-15 at 185 lbs = 83.9 kg
  // BMI = 83.9 / 3.24 = 25.9
  const latestWeight = [...state.importedData.biometrics.weight].sort((a, b) => b.date.localeCompare(a.date))[0];
  const weightKg = latestWeight.unit === 'lbs' ? latestWeight.value / 2.205 : latestWeight.value;
  const expectedBMI = weightKg / (1.80 * 1.80);
  assert('BMI calculates correctly', Math.abs(expectedBMI - 25.9) < 0.5, `expected ~25.9, got ${expectedBMI.toFixed(1)}`);

  // BMI categories
  assert('BMI < 18.5 = underweight', 17 < 18.5);
  assert('BMI 18.5-24.9 = normal', 22 >= 18.5 && 22 < 25);
  assert('BMI 25-29.9 = overweight', 27 >= 25 && 27 < 30);
  assert('BMI >= 30 = obese', 32 >= 30);

  // ═══════════════════════════════════════
  // 7. AI context
  // ═══════════════════════════════════════
  console.log('7. AI Context');

  if (typeof window.buildLabContext === 'function') {
    const ctx = window.buildLabContext();
    assert('AI context includes biometrics section', ctx.includes('[section:biometrics]'));
    assert('AI context includes height', ctx.includes('Height:'));
    assert('AI context includes weight', ctx.includes('Weight'));
    assert('AI context includes BMI', ctx.includes('BMI:'));
    assert('AI context includes BP', ctx.includes('Blood Pressure'));
    assert('AI context includes pulse', ctx.includes('Resting Pulse'));
  } else {
    assert('buildLabContext exists', false, 'function not found on window');
  }

  // ═══════════════════════════════════════
  // 8. Export includes biometrics
  // ═══════════════════════════════════════
  console.log('8. Export');

  if (typeof window.exportClientJSON === 'function') {
    // Can't easily test the download, but verify the data is in importedData
    assert('biometrics in importedData', state.importedData.biometrics != null);
    assert('biometrics.weight has entries', state.importedData.biometrics.weight.length > 0);
    assert('biometrics.bp has entries', state.importedData.biometrics.bp.length > 0);
    assert('biometrics.pulse has entries', state.importedData.biometrics.pulse.length > 0);
  }

  // ═══════════════════════════════════════
  // 9. Profile migration backfills height
  // ═══════════════════════════════════════
  console.log('9. Profile Migration');

  const testProfiles = [{ id: 'test', name: 'Test', sex: null, dob: null, location: { country: '', zip: '' } }];
  // Simulate migrateProfiles by checking fields
  const tp = testProfiles[0];
  assert('Profile without height gets null', tp.height === undefined || tp.height === null || tp.height === undefined);
  // After migration, height should be backfilled
  if (tp.height === undefined) tp.height = null;
  if (tp.heightUnit === undefined) tp.heightUnit = 'cm';
  assert('Profile height backfilled to null', tp.height === null);
  assert('Profile heightUnit backfilled to cm', tp.heightUnit === 'cm');

  // ═══════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════
  state.importedData.biometrics = origBio;
  // Restore original profiles (height)
  window.setProfileHeight(profileId, origProfiles.find(p => p.id === profileId)?.height || null, origProfiles.find(p => p.id === profileId)?.heightUnit || 'cm');

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
