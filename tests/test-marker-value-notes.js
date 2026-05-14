#!/usr/bin/env node
// test-marker-value-notes.js — per-value notes on lab markers
// Covers: schema defaults, profile migration, sync DELTA_MAPS wiring with
// colon-bearing key escape, saveManualEntry storage, editValueNote /
// deleteValueNote handlers, deleteMarkerValue orphan cleanup, value-card
// rendering, AI context emission (section:markerValueNotes).
//
// Run: node tests/test-marker-value-notes.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== markerValueNotes Tests ===\n');

const state = (await import('../js/state.js')).state;
  // ═══════════════════════════════════════
  // 1. Schema defaults & profile migration
  // ═══════════════════════════════════════
  console.log('%c 1. Defaults & Migration ', 'font-weight:bold;color:#f59e0b');

  const stateSrc = read('js/state.js');
  assert('state.js default importedData includes markerValueNotes: {}',
    /markerValueNotes:\s*\{\}/.test(stateSrc));

  const profSrc = read('js/profile.js');
  assert('profile.js migrates markerValueNotes default',
    profSrc.includes('if (data.markerValueNotes === undefined) data.markerValueNotes = {}'));

  // ═══════════════════════════════════════
  // 2. Sync wiring — DELTA_MAPS + colon-key escape
  // ═══════════════════════════════════════
  console.log('%c 2. Sync DELTA_MAPS Wiring ', 'font-weight:bold;color:#f59e0b');

  const syncSrc = read('js/sync.js');
  assert('markerValueNotes present in DELTA_MAPS array',
    /DELTA_MAPS\s*=\s*\[[^\]]*'markerValueNotes'/s.test(syncSrc));
  assert('markerValueNotes has DELTA_MAP_CONFIG.keyIdFn entry',
    /markerValueNotes:\s*\{\s*keyIdFn:/m.test(syncSrc));
  assert('markerValueNotes keyIdFn uses the doubling-escape (matches manualValues)',
    /markerValueNotes:[\s\S]{0,300}rawKey\.replace\(\/_\/g,\s*'__'\)\.replace\(\/:\/g,\s*'_'\)/.test(syncSrc));

  // Simulate the escape locally to confirm a colon-bearing key produces
  // a distinct allowlist-safe id (the manualValues precedent).
  const escapeKey = (rawKey) => {
    if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
    const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
    return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
  };
  const idA = escapeKey('biochemistry.glucose:2024-03-15');
  const idB = escapeKey('biochemistry.glucose:2024-03-16');
  assert('keyIdFn produces non-null allowlist-safe id for normal key', idA && /^[a-zA-Z0-9_.-]+$/.test(idA));
  assert('keyIdFn produces distinct ids for distinct dates', idA !== idB);
  const collidingPlain = escapeKey('hormones.free_T:2024-03-15');
  const collidingWithDash = escapeKey('hormones.freeT:_2024-03-15');
  assert('keyIdFn does NOT collide on `_` vs `:` (doubling guards against v1.7.5 bug)',
    collidingPlain !== collidingWithDash);

  // ═══════════════════════════════════════
  // 3. Export / import round-trip wiring
  // ═══════════════════════════════════════
  console.log('%c 3. Export / Import ', 'font-weight:bold;color:#f59e0b');

  const exportSrc = read('js/export.js');
  assert('export.js exports markerValueNotes in the JSON profile',
    /markerValueNotes:\s*data\.markerValueNotes\s*\|\|\s*\{\}/.test(exportSrc));
  assert('export.js import path merges markerValueNotes',
    exportSrc.includes("if (json.markerValueNotes && typeof json.markerValueNotes === 'object')") &&
    /Object\.assign\(state\.importedData\.markerValueNotes,\s*json\.markerValueNotes\)/.test(exportSrc));

  // ═══════════════════════════════════════
  // 4. saveManualEntry storage path (source-grep — IDB writes are async + browser-y)
  // ═══════════════════════════════════════
  console.log('%c 4. saveManualEntry stores note ', 'font-weight:bold;color:#f59e0b');

  const viewsSrc = read('js/views.js');
  assert('saveManualEntry reads me-note from the form',
    /const\s+noteInput\s*=\s*document\.getElementById\('me-note'\)/.test(viewsSrc));
  assert('saveManualEntry stores noteText in markerValueNotes when non-empty',
    /if \(noteText\) state\.importedData\.markerValueNotes\[noteKey\] = noteText/.test(viewsSrc));
  assert('saveManualEntry clears the entry when noteText is empty (idempotent edit-to-blank)',
    /else delete state\.importedData\.markerValueNotes\[noteKey\]/.test(viewsSrc));
  assert('manual-entry form HTML includes the me-note textarea',
    viewsSrc.includes('id="me-note"') && /placeholder=".*fasted/i.test(viewsSrc));

  // ═══════════════════════════════════════
  // 5. editValueNote / deleteValueNote handlers
  // ═══════════════════════════════════════
  console.log('%c 5. Value-note CRUD handlers ', 'font-weight:bold;color:#f59e0b');

  assert('editValueNote handler exported',
    /export async function editValueNote\(id, date\)/.test(viewsSrc));
  assert('deleteValueNote handler exported',
    /export async function deleteValueNote\(id, date\)/.test(viewsSrc));
  assert('editValueNote bound to window for inline onclicks',
    /editValueNote,\s*$/m.test(viewsSrc) || viewsSrc.includes('editValueNote,'));
  assert('deleteValueNote bound to window for inline onclicks',
    viewsSrc.includes('deleteValueNote,'));
  assert('editValueNote re-renders the detail modal on save',
    /editValueNote[\s\S]{0,1500}showDetailModal\(id\)/.test(viewsSrc));
  assert('deleteValueNote confirms before removing',
    /deleteValueNote[\s\S]{0,400}showConfirmDialog\(/.test(viewsSrc));

  // Direct state manipulation — verify the data model is what render code expects.
  state.importedData = state.importedData || {};
  state.importedData.markerValueNotes = state.importedData.markerValueNotes || {};
  const TEST_KEY = '__test.markerValueNotes:2099-01-01';
  state.importedData.markerValueNotes[TEST_KEY] = 'fasted 14h';
  assert('markerValueNotes accepts colon-bearing string keys without complaint',
    state.importedData.markerValueNotes[TEST_KEY] === 'fasted 14h');
  delete state.importedData.markerValueNotes[TEST_KEY];

  // ═══════════════════════════════════════
  // 6. deleteMarkerValue orphan cleanup
  // ═══════════════════════════════════════
  console.log('%c 6. Orphan cleanup ', 'font-weight:bold;color:#f59e0b');

  assert('deleteMarkerValue drops the per-value note for the same (date, marker)',
    /deleteMarkerValue[\s\S]{0,2000}delete state\.importedData\.markerValueNotes\[dotKey \+ ':' \+ date\]/.test(viewsSrc));

  // Insulin dual-mapping parity: the value mirrors hormones.insulin ↔
  // diabetes.insulin_d, so the per-value note must mirror too. Bidirectional
  // — user may save / edit / delete via either category page (Greptile P1
  // 2026-05-12). Asserted via _insulinMirrorNoteKey helper presence below.

  // 500-char cap defends against runaway paste (matches the wearable note cap).
  assert('saveManualEntry caps the note at 500 chars before storing',
    /noteRaw\.length > 500 \? noteRaw\.slice\(0, 500\) : noteRaw/.test(viewsSrc));
  assert('editValueNote caps the note at 500 chars before storing',
    /editValueNote[\s\S]{0,1200}result\.length > 500 \? result\.slice\(0, 500\) : result/.test(viewsSrc));

  // editValueNote + deleteValueNote also route through _insulinMirrorNoteKey
  // — see the bidirectional helper asserts below.
  assert('deleteValueNote cleans the mirror note for insulin',
    /deleteValueNote[\s\S]{0,800}_insulinMirrorNoteKey\(dotKey, date\)/.test(viewsSrc));

  // Greptile P1: insulin note mirror must be BIDIRECTIONAL — user may
  // edit/delete via the hormones panel OR the diabetes panel.
  assert('_insulinMirrorNoteKey helper defined and bidirectional',
    /_insulinMirrorNoteKey\(dotKey, date\)/.test(viewsSrc) &&
    /if \(dotKey === 'hormones\.insulin'\) return 'diabetes\.insulin_d:' \+ date/.test(viewsSrc) &&
    /if \(dotKey === 'diabetes\.insulin_d'\) return 'hormones\.insulin:' \+ date/.test(viewsSrc));
  assert('saveManualEntry uses bidirectional mirror helper',
    /saveManualEntry[\s\S]{0,2500}_insulinMirrorNoteKey\(dotKey, date\)/.test(viewsSrc));
  assert('deleteMarkerValue uses bidirectional mirror helper',
    /deleteMarkerValue[\s\S]{0,2500}_insulinMirrorNoteKey\(dotKey, date\)/.test(viewsSrc));
  assert('editValueNote uses bidirectional mirror helper',
    /editValueNote[\s\S]{0,1500}_insulinMirrorNoteKey\(dotKey, date\)/.test(viewsSrc));

  // CodeQL js/xss-through-dom: empty-cell onclick must use JSON.stringify
  // so interpolated id/date survive the HTML-attr → JS-string round-trip.
  assert('Empty-cell onclick uses JSON.stringify(id), JSON.stringify(colDate)',
    /openManualEntryForm\(\$\{escapeHTML\(JSON\.stringify\(id\)\)\},\$\{escapeHTML\(JSON\.stringify\(colDate\)\)\}\)/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 7. Value-card rendering
  // ═══════════════════════════════════════
  console.log('%c 7. Value-card render ', 'font-weight:bold;color:#f59e0b');

  assert('Value card reads note from markerValueNotes by mvKey',
    /state\.importedData\.markerValueNotes\?\.\[mvKey\]/.test(viewsSrc));
  assert('Empty card shows "+ note" hint',
    /mv-value-note add-note[\s\S]{0,200}\+ note/.test(viewsSrc));
  assert('Populated card has × delete button',
    /mv-value-note-delete[\s\S]{0,400}deleteValueNote\('/.test(viewsSrc));
  assert('Inline onclicks stopPropagation so cell-edit doesn\'t fire',
    /editValueNote[\s\S]{0,200}event\.stopPropagation\(\)/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 8. AI context emission — section:markerValueNotes
  // ═══════════════════════════════════════
  console.log('%c 8. AI context emission ', 'font-weight:bold;color:#f59e0b');

  const labCtxSrc = read('js/lab-context.js');
  assert('buildLabContext emits [section:markerValueNotes] block',
    labCtxSrc.includes('[section:markerValueNotes]') &&
    labCtxSrc.includes('[/section:markerValueNotes]'));
  assert('Section heading reads "Per-Value Notes"',
    labCtxSrc.includes('## Per-Value Notes'));
  assert('Per-value notes section is gated on map non-empty (no empty-section noise)',
    /mvKeys = Object\.keys\(mvNotes\)[\s\S]{0,200}if \(mvKeys\.length > 0\)/.test(labCtxSrc));
  assert('Notes are grouped by marker for contiguous reading',
    /byMarker\s*=\s*new Map\(\)/.test(labCtxSrc));
  assert('Within-marker entries sorted ascending by date',
    /entries\.sort\(\(a, b\) => a\.date\.localeCompare\(b\.date\)\)/.test(labCtxSrc));
  assert('markerNotes section still emitted (we added without removing)',
    labCtxSrc.includes('[section:markerNotes]'));

  // ═══════════════════════════════════════
  // 9. CSS surface for the new render
  // ═══════════════════════════════════════
  console.log('%c 9. CSS ', 'font-weight:bold;color:#f59e0b');
  const stylesSrc = read('styles.css');
  assert('CSS defines .mv-value-note container',
    /\.mv-value-note\s*\{/.test(stylesSrc));
  assert('CSS defines .mv-value-note.add-note hover-reveal',
    /\.mv-value-note\.add-note/.test(stylesSrc) && /modal-value-card:hover .mv-value-note\.add-note/.test(stylesSrc));
  assert('CSS defines .mv-value-note-delete styling',
    /\.mv-value-note-delete/.test(stylesSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
