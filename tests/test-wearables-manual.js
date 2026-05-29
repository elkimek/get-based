#!/usr/bin/env node
// test-wearables-manual.js — manual entry as a first-class wearable source.
// Module exports, the 'manual' adapter registry entry, logManualMetric /
// logManualBP IDB writes, hasManualData, migrateBiometricsToManual
// (idempotent + lb→kg), deleteManualMetric, context tags + notes, plus a
// source-inspection sweep of wearables.js / client-list.js / CSS bundle /
// lab-context.js.
//
// Run: node tests/test-wearables-manual.js  (or via npm test)
//
// Full port — no DOM rendering. The window-export checks rely on wearables.js
// registering its handlers on window; IndexedDB runs via fake-indexeddb.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
const CSS_FILES = ['styles.css', 'css/wearables.css'];
const fetchCssBundle = async () => (await Promise.all(
  CSS_FILES.map(rel => fetch(rel).then(r => r.text()))
)).join('\n');

// Source-inspection sweep uses `await fetch('js/X').then(r => r.text())` —
// fs-backed fetch shim so the relative URLs resolve in Node.
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

console.log('=== Manual-as-wearable-source Tests ===\n');

// state.js → window._labState; wearables.js registers the openManualLogForm /
// saveManualLog / toggleManualLogChip window handlers the export checks probe.
await import('../js/state.js');
const manual = await import('../js/wearables-manual.js');
const store = await import('../js/wearables-store.js');
const adapters = await import('../js/wearable-adapters.js');
await import('../js/wearables.js');

// ═══════════════════════════════════════
// 1. Module exports
// ═══════════════════════════════════════
console.log('1. Module Exports');

assert('logManualMetric exported', typeof manual.logManualMetric === 'function');
assert('logManualBP exported', typeof manual.logManualBP === 'function');
assert('migrateBiometricsToManual exported', typeof manual.migrateBiometricsToManual === 'function');
assert('hasManualData exported', typeof manual.hasManualData === 'function');
assert('ensureManualConnection exported', typeof manual.ensureManualConnection === 'function');
assert('MANUAL_METRICS exported', Array.isArray(manual.MANUAL_METRICS));
assert('MANUAL_METRICS covers weight/bp/rhr',
  manual.MANUAL_METRICS.includes('weight') &&
  manual.MANUAL_METRICS.includes('bp_systolic') &&
  manual.MANUAL_METRICS.includes('bp_diastolic') &&
  manual.MANUAL_METRICS.includes('rhr'));
assert('MANUAL_TAGS exported', Array.isArray(manual.MANUAL_TAGS));
assert('MANUAL_TAGS includes core context set',
  manual.MANUAL_TAGS.includes('resting') &&
  manual.MANUAL_TAGS.includes('morning-fasted') &&
  manual.MANUAL_TAGS.includes('post-workout') &&
  manual.MANUAL_TAGS.includes('stress'));
assert('deleteManualMetric exported', typeof manual.deleteManualMetric === 'function');
assert('refreshManualSummary exported', typeof manual.refreshManualSummary === 'function');

assert('openManualLogForm on window', typeof window.openManualLogForm === 'function');
assert('saveManualLog on window', typeof window.saveManualLog === 'function');
assert('cancelManualLog on window', typeof window.cancelManualLog === 'function');

const wearablesSrc = await fetch('js/wearables.js').then(r => r.text());
const wearablesSettingsSrc = await fetch('js/wearables-settings-panel.js').then(r => r.text());
assert('wearables.js renders empty manual cards',
  wearablesSrc.includes('renderEmptyManualCard') && wearablesSrc.includes('wearable-card-empty'));
assert('wearables.js MANUAL_EMPTY_METRICS covers weight/bp/rhr',
  /MANUAL_EMPTY_METRICS\s*=\s*\[[^\]]*weight[^\]]*bp_systolic[^\]]*rhr/.test(wearablesSrc));

const clSrc = await fetch('js/client-list.js').then(r => r.text());
assert('Edit Client modal no longer renders the cl-bio-weight container',
  !clSrc.includes('id="cl-bio-weight"'));
assert('Edit Client modal no longer renders the cl-bio-bp container',
  !clSrc.includes('id="cl-bio-bp"'));
assert('Edit Client modal no longer renders the cl-bio-pulse container',
  !clSrc.includes('id="cl-bio-pulse"'));
assert('Edit Client modal links out to Health Metrics on the dashboard',
  clSrc.includes('_clGoToHealthMetrics'));
assert('_clUpdateBMI reads weight from wearableSummary (single source of truth)',
  clSrc.includes('wearableSummary?.metrics?.weight'));

// ═══════════════════════════════════════
// 2. 'manual' adapter registered
// ═══════════════════════════════════════
console.log('2. Adapter Registry');

const manualAdapter = adapters.ADAPTERS.find(a => a.id === 'manual');
assert('manual adapter present in ADAPTERS', manualAdapter != null);
assert('manual authType = "manual"', manualAdapter?.authType === 'manual');
assert('manual has weight metric', !!manualAdapter?.metrics?.weight);
assert('manual has bp_systolic metric', !!manualAdapter?.metrics?.bp_systolic);
assert('manual has bp_diastolic metric', !!manualAdapter?.metrics?.bp_diastolic);
assert('manual has rhr metric', !!manualAdapter?.metrics?.rhr);
assert('manual has no apiHost', manualAdapter?.apiHost === null);

// ═══════════════════════════════════════
// 3. logManualMetric writes to IDB + flips connection
// ═══════════════════════════════════════
console.log('3. logManualMetric');

const TEST_PROFILE = 'test-manual-' + Math.random().toString(36).slice(2, 8);
// Every sub-profile that gets real IDB writes — torn down in the finally
// so a reused Vitest worker (or a standalone re-run) doesn't accumulate.
const _idbProfiles = [TEST_PROFILE];
const origProfile = window._labState.currentProfile;
const origImported = window._labState.importedData;
window._labState.currentProfile = TEST_PROFILE;
window._labState.importedData = { wearableConnections: {} };

try {
  await manual.logManualMetric(TEST_PROFILE, 'weight', { date: '2026-04-24', value: 82.1 });
  const row = await store.getDaily(TEST_PROFILE, 'manual', '2026-04-24');
  assert('weight row written with source=manual', row?.source === 'manual');
  assert('weight row has correct date', row?.date === '2026-04-24');
  assert('weight row has correct value', row?.weight === 82.1);
  assert('ensureManualConnection populated wearableConnections.manual',
    window._labState.importedData.wearableConnections?.manual != null);
  assert('manual connection has connectedAt',
    !!window._labState.importedData.wearableConnections.manual.connectedAt);

  // ═══════════════════════════════════════
  // 4. logManualBP writes combined row
  // ═══════════════════════════════════════
  console.log('4. logManualBP');

  await manual.logManualBP(TEST_PROFILE, { date: '2026-04-24', systolic: 118, diastolic: 76, pulse: 64 });
  const bpRow = await store.getDaily(TEST_PROFILE, 'manual', '2026-04-24');
  assert('BP row merges with same-day weight row',
    bpRow?.weight === 82.1 && bpRow?.bp_systolic === 118);
  assert('BP row has diastolic', bpRow?.bp_diastolic === 76);
  assert('BP row has pulse (rhr)', bpRow?.rhr === 64);

  await manual.logManualBP(TEST_PROFILE, { date: '2026-04-25', systolic: 120 });
  const partialBP = await store.getDaily(TEST_PROFILE, 'manual', '2026-04-25');
  assert('partial BP (syst only) writes just that field', partialBP?.bp_systolic === 120 && partialBP?.bp_diastolic == null);

  let threw = false;
  try { await manual.logManualMetric(TEST_PROFILE, 'bogus_metric', { value: 1 }); }
  catch { threw = true; }
  assert('logManualMetric rejects unknown metric', threw);

  threw = false;
  try { await manual.logManualMetric(TEST_PROFILE, 'weight', { value: NaN }); }
  catch { threw = true; }
  assert('logManualMetric rejects NaN', threw);

  // ═══════════════════════════════════════
  // 5. hasManualData
  // ═══════════════════════════════════════
  console.log('5. hasManualData');

  const has = await manual.hasManualData(TEST_PROFILE);
  assert('hasManualData returns true after log', has === true);

  const MISSING_PROFILE = 'test-missing-' + Math.random().toString(36).slice(2, 8);
  const hasNone = await manual.hasManualData(MISSING_PROFILE);
  assert('hasManualData returns false for empty profile', hasNone === false);

  // ═══════════════════════════════════════
  // 6. migrateBiometricsToManual — idempotent + shape
  // ═══════════════════════════════════════
  console.log('6. Biometrics Migration');

  const MIGRATE_PROFILE = 'test-mig-' + Math.random().toString(36).slice(2, 8);
  _idbProfiles.push(MIGRATE_PROFILE);
  window._labState.currentProfile = MIGRATE_PROFILE;
  window._labState.importedData = { wearableConnections: {} };
  const legacyBiometrics = {
    weight: [
      { date: '2026-04-20', value: 82.5, unit: 'kg', source: 'manual' },
      { date: '2026-04-22', value: 81.9, unit: 'kg', source: 'manual' },
      { date: '2026-04-23', value: 180, unit: 'lb', source: 'manual' }, // lb → kg
    ],
    bp: [
      { date: '2026-04-22', systolic: 120, diastolic: 78, source: 'manual' },
    ],
    pulse: [
      { date: '2026-04-22', value: 68, source: 'manual' },
    ],
  };
  const result = await manual.migrateBiometricsToManual(MIGRATE_PROFILE, legacyBiometrics);
  assert('migration runs (not skipped)', result.migrated === true);
  assert('migration counted 3 weight + 1 bp + 1 pulse entries',
    result.counts.weight === 3 && result.counts.bp === 1 && result.counts.pulse === 1);
  assert('migration wrote 3 rows (by-date dedup)', result.counts.rows === 3);

  const migRow22 = await store.getDaily(MIGRATE_PROFILE, 'manual', '2026-04-22');
  assert('migrated 04-22 row has weight + BP + pulse merged',
    migRow22?.weight === 81.9 && migRow22?.bp_systolic === 120 && migRow22?.rhr === 68);

  const migRow23 = await store.getDaily(MIGRATE_PROFILE, 'manual', '2026-04-23');
  const lbInKg = 180 / 2.20462;
  assert('lb → kg unit conversion on migration',
    Math.abs((migRow23?.weight || 0) - lbInKg) < 0.01);

  const rerun = await manual.migrateBiometricsToManual(MIGRATE_PROFILE, legacyBiometrics);
  assert('migration is idempotent (second run skipped)', rerun.skipped === 'already-migrated');

  const EMPTY_PROFILE = 'test-empty-' + Math.random().toString(36).slice(2, 8);
  const emptyRes = await manual.migrateBiometricsToManual(EMPTY_PROFILE, null);
  assert('migration handles null biometrics', emptyRes.skipped === 'no-biometrics');

  // ═══════════════════════════════════════
  // 7. deleteManualMetric
  // ═══════════════════════════════════════
  console.log('7. deleteManualMetric');

  const DEL_PROFILE = 'test-del-' + Math.random().toString(36).slice(2, 8);
  _idbProfiles.push(DEL_PROFILE);
  window._labState.currentProfile = DEL_PROFILE;
  window._labState.importedData = { wearableConnections: {} };
  await manual.logManualMetric(DEL_PROFILE, 'weight', { date: '2026-04-24', value: 82 });
  await manual.logManualBP(DEL_PROFILE, { date: '2026-04-24', systolic: 118, diastolic: 76, pulse: 64 });

  await manual.deleteManualMetric(DEL_PROFILE, 'weight', '2026-04-24');
  const afterWeightDel = await store.getDaily(DEL_PROFILE, 'manual', '2026-04-24');
  assert('weight deleted but row kept (BP remains)',
    afterWeightDel?.weight == null && afterWeightDel?.bp_systolic === 118);

  await manual.deleteManualMetric(DEL_PROFILE, 'bp_systolic', '2026-04-24');
  await manual.deleteManualMetric(DEL_PROFILE, 'bp_diastolic', '2026-04-24');
  await manual.deleteManualMetric(DEL_PROFILE, 'rhr', '2026-04-24');
  const afterAllDel = await store.getDaily(DEL_PROFILE, 'manual', '2026-04-24');
  assert('all-metrics-deleted row is removed from IDB (no stub)',
    afterAllDel == null);

  let threwDel = false;
  try { await manual.deleteManualMetric(DEL_PROFILE, 'bogus', '2026-04-24'); }
  catch { threwDel = true; }
  assert('deleteManualMetric rejects unknown metric', threwDel);
  await manual.deleteManualMetric(DEL_PROFILE, 'weight', '2099-01-01'); // no-op
  assert('deleteManualMetric on missing date is a no-op', true);

  // ═══════════════════════════════════════
  // 8. Context tags
  // ═══════════════════════════════════════
  console.log('8. Context Tags');

  const TAG_PROFILE = 'test-tags-' + Math.random().toString(36).slice(2, 8);
  _idbProfiles.push(TAG_PROFILE);
  window._labState.currentProfile = TAG_PROFILE;
  window._labState.importedData = { wearableConnections: {} };
  await manual.logManualBP(TAG_PROFILE, {
    date: '2026-04-24', systolic: 145, diastolic: 92,
    tags: ['post-workout', 'stress']
  });
  const taggedRow = await store.getDaily(TAG_PROFILE, 'manual', '2026-04-24');
  assert('BP row persists tags array', Array.isArray(taggedRow?.tags));
  assert('tags contain post-workout + stress',
    taggedRow?.tags?.includes('post-workout') && taggedRow?.tags?.includes('stress'));

  await manual.logManualMetric(TAG_PROFILE, 'weight', {
    date: '2026-04-25', value: 81,
    tags: ['morning-fasted', 'bogus-tag', 'resting', 'post-workout']
  });
  const weightRow = await store.getDaily(TAG_PROFILE, 'manual', '2026-04-25');
  assert('unknown tags are filtered out',
    !weightRow?.tags?.includes('bogus-tag'));
  assert('valid tags survive the filter',
    weightRow?.tags?.includes('morning-fasted') &&
    weightRow?.tags?.includes('resting') &&
    weightRow?.tags?.includes('post-workout'));

  assert('wearables.js renders tag chips on bp form', wearablesSrc.includes('_renderTagChips'));
  assert('toggleManualLogChip on window', typeof window.toggleManualLogChip === 'function');

  const saveFn = wearablesSrc.match(/async function saveManualEntryFromDetail[\s\S]*?\n\}\s*\n/)?.[0] || '';
  const delFn = wearablesSrc.match(/async function deleteManualEntryFromDetail[\s\S]*?\n\}\s*\n/)?.[0] || '';
  assert('saveManualEntryFromDetail re-renders dashboard strip',
    /window\.navigate\([^)]*\)/.test(saveFn) && /['"]dashboard['"]/.test(saveFn));
  assert('deleteManualEntryFromDetail re-renders dashboard strip',
    /window\.navigate\([^)]*\)/.test(delFn) && /['"]dashboard['"]/.test(delFn));
  assert('deleteManualEntryFromDetail closes modal when last reading is removed',
    /closeModal/.test(delFn));

  const handleDisconnectFn = wearablesSettingsSrc.match(/async function handleManualDisconnect[\s\S]*?\n\}\s*\n/)?.[0] || '';
  assert('deleteManualEntryFromDetail uses promise-style showConfirmDialog',
    /await\s+window\.showConfirmDialog\(/.test(delFn));
  assert('handleManualDisconnect uses promise-style showConfirmDialog',
    /await\s+window\.showConfirmDialog\(/.test(handleDisconnectFn));

  // ═══════════════════════════════════════
  // Note + chip parity (this-branch additions)
  // ═══════════════════════════════════════
  console.log('Note + chip parity');

  const manualLibSrc = await fetch('js/wearables-manual.js').then(r => r.text());

  assert('logManualMetric signature accepts note param',
    /export async function logManualMetric\(profileId, metric, \{ date, value, tags, note \}\)/.test(manualLibSrc));
  assert('logManualBP signature accepts note param',
    /export async function logManualBP\(profileId, \{ date, systolic, diastolic, pulse, tags, note \}\)/.test(manualLibSrc));
  assert('Both helpers write the note onto the row patch via _sanitizeNote',
    /const noteClean = _sanitizeNote\(note\);[\s\S]{0,200}if \(noteClean\) patch\.note = noteClean/.test(manualLibSrc) &&
    /const noteClean = _sanitizeNote\(note\);[\s\S]{0,200}if \(noteClean\) row\.note = noteClean/.test(manualLibSrc));

  assert('_sanitizeNote function defined',
    /function _sanitizeNote\(note\)/.test(manualLibSrc));
  assert('_sanitizeNote trims whitespace',
    /const trimmed = note\.trim\(\)/.test(manualLibSrc));
  assert('_sanitizeNote caps at 500 chars',
    /trimmed\.length > 500 \? trimmed\.slice\(0, 500\)/.test(manualLibSrc));
  assert("_sanitizeNote returns '' for non-string",
    /if \(typeof note !== 'string'\) return ''/.test(manualLibSrc));

  // Live behavior: write + read a manual metric with note, verify persistence.
  const probeProfile = 'test-note-' + Date.now();
  _idbProfiles.push(probeProfile);
  window._labState.currentProfile = probeProfile;
  await manual.logManualMetric(probeProfile, 'rhr', {
    date: '2099-05-12', value: 60, tags: ['resting'], note: 'morning, just woke'
  });
  const rows = await store.getDailyRange(probeProfile, 'manual', '2099-05-12', '2099-05-12');
  assert('logManualMetric persists note on the row',
    rows.length === 1 && rows[0].note === 'morning, just woke');
  assert('logManualMetric still persists tags alongside note',
    Array.isArray(rows[0].tags) && rows[0].tags.includes('resting'));
  const longNote = 'x'.repeat(800);
  await manual.logManualMetric(probeProfile, 'weight', {
    date: '2099-05-13', value: 70, note: longNote
  });
  const rows2 = await store.getDailyRange(probeProfile, 'manual', '2099-05-13', '2099-05-13');
  assert('Note capped at 500 chars',
    rows2[0].note && rows2[0].note.length === 500);
  await manual.logManualMetric(probeProfile, 'weight', {
    date: '2099-05-14', value: 71, note: '   '
  });
  const rows3 = await store.getDailyRange(probeProfile, 'manual', '2099-05-14', '2099-05-14');
  assert('Whitespace-only note is dropped (no note field on row)',
    rows3[0].note === undefined);

  await manual.logManualBP(probeProfile, {
    date: '2099-05-15', systolic: 120, diastolic: 80, tags: ['post-workout'], note: 'after run'
  });
  const rows4 = await store.getDailyRange(probeProfile, 'manual', '2099-05-15', '2099-05-15');
  assert('logManualBP persists note on the row',
    rows4[0].note === 'after run' && rows4[0].tags?.includes('post-workout'));

  // Detail-modal form has chips for rhr + bp (parity with empty-card form).
  const rhrChipMatches = (wearablesSrc.match(/_renderTagChips\('rhr'\)/g) || []).length;
  const bpChipMatches = (wearablesSrc.match(/_renderTagChips\('bp_systolic'\)/g) || []).length;
  assert("_renderTagChips('rhr') called from both empty-card AND detail-modal forms",
    rhrChipMatches >= 2, `count=${rhrChipMatches}`);
  assert("_renderTagChips('bp_systolic') called from both empty-card AND detail-modal forms",
    bpChipMatches >= 2, `count=${bpChipMatches}`);
  const openDetailStart = wearablesSrc.indexOf('function openManualAddFromDetail');
  const closeManualFnStart = wearablesSrc.indexOf('function closeManualAddFromDetail');
  const openDetailFn = (openDetailStart !== -1 && closeManualFnStart !== -1)
    ? wearablesSrc.slice(openDetailStart, closeManualFnStart) : '';
  assert('Detail-modal RHR branch renders tag chips',
    /kind === 'rhr'[\s\S]{0,800}_renderTagChips\('rhr'\)/.test(openDetailFn));
  assert('Detail-modal BP branch renders tag chips',
    /kind === 'bp'[\s\S]{0,1500}_renderTagChips\('bp_systolic'\)/.test(openDetailFn));
  assert('Detail-modal weight branch does NOT render tag chips (matches empty-card convention)',
    !/kind === 'weight'[\s\S]{0,400}_renderTagChips/.test(openDetailFn));

  assert('Detail-modal form renders the wlad-note textarea',
    /openManualAddFromDetail[\s\S]{0,3000}_renderNoteField\('wlad-note'\)/.test(wearablesSrc));
  assert('Empty-card weight form renders wl-weight-note textarea',
    /metricId === 'weight'[\s\S]{0,1000}_renderNoteField\('wl-weight-note'\)/.test(wearablesSrc));
  assert('Empty-card BP form renders wl-bp-note textarea',
    /metricId === 'bp_systolic'[\s\S]{0,1500}_renderNoteField\('wl-bp-note'\)/.test(wearablesSrc));
  assert('Empty-card RHR form renders wl-rhr-note textarea',
    /metricId === 'rhr'[\s\S]{0,1000}_renderNoteField\('wl-rhr-note'\)/.test(wearablesSrc));

  assert('_renderNoteField helper defined',
    /function _renderNoteField\(idSuffix = 'wl-note'\)/.test(wearablesSrc));
  assert('_renderNoteField outputs a wearable-log-note textarea',
    /<textarea class="wearable-log-note"/.test(wearablesSrc));

  const saveLogFn = wearablesSrc.match(/async function saveManualLog[\s\S]*?\n\}\s*\n/)?.[0] || '';
  assert('saveManualLog reads note from `wl-${kind}-note` (or `wl-bp-note`)',
    /document\.getElementById\(`wl-\$\{kind === 'bp' \? 'bp' : kind\}-note`\)/.test(saveLogFn));
  assert('saveManualLog passes note to logManualMetric (weight + rhr) and logManualBP',
    /logManualMetric\(profileId, 'weight', \{[^}]*note\s*\}\)/.test(saveLogFn) &&
    /logManualMetric\(profileId, 'rhr', \{[^}]*note\s*\}\)/.test(saveLogFn) &&
    /logManualBP\(profileId, \{[^}]*note\s*\}\)/.test(saveLogFn));

  const saveFromDetailFn = wearablesSrc.match(/async function saveManualEntryFromDetail[\s\S]*?\n\}\s*\n/)?.[0] || '';
  assert('saveManualEntryFromDetail reads wlad-note from the detail-modal form',
    /document\.getElementById\('wlad-note'\)/.test(saveFromDetailFn));
  assert('saveManualEntryFromDetail scopes chip collection to the form element',
    /const formEl = document\.querySelector\('\.wearable-manual-add-form'\)[\s\S]{0,200}_collectActiveChips\(formEl\)/.test(saveFromDetailFn));
  assert('saveManualEntryFromDetail passes tags + note to log helpers',
    /logManualMetric\(profileId, 'weight', \{[^}]*tags, note\s*\}\)/.test(saveFromDetailFn) &&
    /logManualMetric\(profileId, 'rhr', \{[^}]*tags, note\s*\}\)/.test(saveFromDetailFn) &&
    /logManualBP\(profileId, \{[^}]*tags, note\s*\}\)/.test(saveFromDetailFn));

  const entriesSectionFn = wearablesSrc.match(/function buildManualEntriesSection[\s\S]*?\n\}\s*\n/)?.[0] || '';
  assert('manualEntries map pulls note: r.note from the IDB row',
    /\.map\(r => \(\{ date: r\.date, v: r\[metricId\], tags: r\.tags, note: r\.note \}\)\)/.test(wearablesSrc));
  assert('Entries-list row renders the note (.wearable-manual-entry-note) when present',
    /typeof e\.note === 'string' && e\.note\.trim\(\)[\s\S]{0,200}wearable-manual-entry-note/.test(entriesSectionFn));
  assert("Row gains 'has-note' modifier class for layout when note is present",
    /wearable-manual-entry\$\{noteRow \? ' has-note' : ''\}/.test(entriesSectionFn));

  const stylesSrc = await fetchCssBundle();
  assert('CSS defines .wearable-log-note',
    /\.wearable-log-note\s*\{/.test(stylesSrc));
  assert('CSS defines .wearable-manual-entry-note',
    /\.wearable-manual-entry-note\s*\{/.test(stylesSrc));
  assert('CSS defines .wearable-manual-entry.has-note { flex-wrap: wrap }',
    /\.wearable-manual-entry\.has-note\s*\{[^}]*flex-wrap:\s*wrap/.test(stylesSrc));

  const labCtxSrc = await fetch('js/lab-context.js').then(r => r.text());
  assert('buildWearableSeriesSection emits a "Manual-entry context" sub-block',
    /### Manual-entry context \(qualifies same-day values above\)/.test(labCtxSrc));
  assert('Context sub-block filters to manual rows with tags or notes in the date window',
    /const manualRows = rowsBySource\['manual'\] \|\| \[\];[\s\S]{0,600}hasTags \|\| hasNote/.test(labCtxSrc));
  assert('Context sub-block surfaces tags + note text per row',
    /tags: \$\{r\.tags\.join\(', '\)\}/.test(labCtxSrc) &&
    /note: "\$\{r\.note\.trim\(\)\}"/.test(labCtxSrc));
  assert('Wearable series section degrades gracefully when only context rows exist',
    /if \(lines\.length === 0 && !contextBlock\) return ''[\s\S]{0,200}if \(lines\.length === 0\)/.test(labCtxSrc));

} finally {
  // Tear down every test sub-profile's IDB (consistent with
  // test-wearables-sync-flow.js — keeps a reused worker clean).
  for (const pid of _idbProfiles) {
    try { await store.deleteWearablesDB(pid); } catch {}
  }
  // Restore live profile
  window._labState.currentProfile = origProfile;
  window._labState.importedData = origImported;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
