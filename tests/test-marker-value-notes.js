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

  const profSrc = read('js/profile-data-migrations.js');
  assert('profile migration owner backfills markerValueNotes',
    profSrc.includes('if (data.markerValueNotes === undefined) data.markerValueNotes = {}'));

  // ═══════════════════════════════════════
  // 2. Sync wiring — DELTA_MAPS + colon-key escape
  // ═══════════════════════════════════════
  console.log('%c 2. Sync DELTA_MAPS Wiring ', 'font-weight:bold;color:#f59e0b');

  const syncDeltaRegistrySrc = [
    read('js/sync-delta-registry.js'),
    read('js/sync-delta-surfaces.js'),
    read('js/sync-delta-surface-config.js'),
  ].join('\n');
  assert('markerValueNotes present in DELTA_MAPS array',
    /DELTA_MAPS\s*=\s*\[[^\]]*'markerValueNotes'/s.test(syncDeltaRegistrySrc));
  assert('markerValueNotes has DELTA_MAP_CONFIG.keyIdFn entry',
    /markerValueNotes:\s*\{\s*keyIdFn:/m.test(syncDeltaRegistrySrc));
  assert('markerValueNotes keyIdFn uses the doubling-escape (matches manualValues)',
    /markerValueNotes:[\s\S]{0,300}rawKey\.replace\(\/_\/g,\s*'__'\)\.replace\(\/:\/g,\s*'_'\)/.test(syncDeltaRegistrySrc));

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
  const exportImportSrc = read('js/export-import.js');
  assert('export.js exports markerValueNotes in the JSON profile',
    /markerValueNotes:\s*data\.markerValueNotes\s*\|\|\s*\{\}/.test(exportSrc));
  assert('export-import.js import path merges markerValueNotes',
    exportImportSrc.includes("if (json.markerValueNotes && typeof json.markerValueNotes === 'object')") &&
    /Object\.assign\(state\.importedData\.markerValueNotes,\s*json\.markerValueNotes\)/.test(exportImportSrc));

  // ═══════════════════════════════════════
  // 4. saveManualEntry storage path (source-grep — IDB writes are async + browser-y)
  // ═══════════════════════════════════════
  console.log('%c 4. saveManualEntry stores note ', 'font-weight:bold;color:#f59e0b');

  const viewsSrc = read('js/views.js');
  const categoryViewRenderersSrc = read('js/category-view-renderers.js');
  const markerDetailActionsSrc = read('js/marker-detail-actions.js');
  const markerDetailSrc = [
    read('js/marker-detail-modal-impl.js'),
    read('js/marker-detail-manual-entry.js'),
  ].join('\n');
  const markerDetailEditingSrc = read('js/marker-detail-editing.js');
  const markerDetailStoreSrc = read('js/marker-detail-store.js');
  const labEntrySrc = read('js/lab-entry.js');
  const labEntryMutationsSrc = read('js/lab-entry-mutations.js');
  assert('saveManualEntry reads me-note from the form',
    /saveManualEntry[\s\S]{0,800}document\.getElementById\('me-note'\)/.test(markerDetailEditingSrc));
  assert('saveManualEntry stores noteText in markerValueNotes when non-empty',
    /saveManualEntry[\s\S]{0,6200}saveManualMarkerValue\(\{[\s\S]{0,250}dotKey,[\s\S]{0,250}noteText,[\s\S]{0,250}collectionContext:/.test(markerDetailEditingSrc)
      && /function writeMarkerValueNote\(dotKey, date, noteText\)[\s\S]{0,500}notes\[key\] = capped/.test(markerDetailStoreSrc));
  assert('saveManualEntry clears the entry when noteText is empty (idempotent edit-to-blank)',
    /function writeMarkerValueNote\(dotKey, date, noteText\)[\s\S]{0,700}clearSyncedMapValue\(notes, key\)/.test(markerDetailStoreSrc));
  assert('manual-entry form HTML includes the me-note textarea',
    markerDetailSrc.includes('id="me-note"') && /placeholder=".*fasted/i.test(markerDetailSrc));

  // ═══════════════════════════════════════
  // 5. editValueNote / deleteValueNote handlers
  // ═══════════════════════════════════════
  console.log('%c 5. Value-note CRUD handlers ', 'font-weight:bold;color:#f59e0b');

  assert('editValueNote handler exported',
    /export async function editValueNote\(id, date\)/.test(markerDetailEditingSrc));
  assert('deleteValueNote handler exported',
    /export async function deleteValueNote\(id, date\)/.test(markerDetailEditingSrc));
  assert('editValueNote remains exported for delegated value-note actions',
    /editValueNote,\s*$/m.test(viewsSrc) || viewsSrc.includes('editValueNote,'));
  assert('deleteValueNote remains exported for delegated value-note actions',
    viewsSrc.includes('deleteValueNote,'));
  assert('editValueNote re-renders the detail modal on save',
    /editValueNote[\s\S]{0,1500}showDetailModal\(id\)/.test(markerDetailEditingSrc));
  assert('deleteValueNote confirms before removing',
    /deleteValueNote[\s\S]{0,400}showConfirmDialog\(/.test(markerDetailEditingSrc));

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
    /deleteMarkerValue[\s\S]{0,1200}deleteManualMarkerValue\(dotKey, date\)/.test(markerDetailEditingSrc)
      && /deleteManualMarkerValue[\s\S]{0,900}deleteLabEntryMarkerFromImportedData\(state\.importedData, entry, dotKey/.test(markerDetailStoreSrc)
      && /function deleteLabEntryMarkerMetadata\(importedData, dotKey, date\)[\s\S]{0,500}importedData\.markerValueNotes\[key\] = null/.test(labEntryMutationsSrc));
  assert('deleteMarkerValue uses one canonical metadata key',
    /deleteManualMarkerValue[\s\S]{0,900}deleteLabEntryMarkerFromImportedData\(state\.importedData, entry, dotKey/.test(markerDetailStoreSrc)
      && !/insulinMirrorMapKey/.test(markerDetailStoreSrc)
      && /function deleteLabEntryMarkerMetadata\(importedData, dotKey, date\)[\s\S]{0,250}importedData\.manualValues\[key\] = null/.test(labEntryMutationsSrc));

  // 500-char cap defends against runaway paste (matches the wearable note cap).
  assert('saveManualEntry caps the note at 500 chars before storing',
    /noteRaw\.length > 500 \? noteRaw\.slice\(0, 500\) : noteRaw/.test(markerDetailEditingSrc));
  assert('editValueNote caps the note at 500 chars before storing',
    /editValueNote[\s\S]{0,1200}result\.length > 500 \? result\.slice\(0, 500\) : result/.test(markerDetailEditingSrc));

  assert('deleteValueNote cleans the canonical marker note',
    /deleteValueNote[\s\S]{0,800}deleteMarkerValueNote\(dotKey, date\)/.test(markerDetailEditingSrc)
      && /deleteMarkerValueNote[\s\S]{0,500}mapKey\(dotKey, date\)/.test(markerDetailStoreSrc));

  assert('legacy insulin keys canonicalize at the lab-entry boundary',
    /CANONICAL_INSULIN_MARKER_KEY = 'diabetes\.insulin'/.test(labEntrySrc)
      && /LEGACY_INSULIN_MARKER_KEYS = Object\.freeze/.test(labEntrySrc)
      && /const storageKey = canonicalMarkerKey\(dotKey\)/.test(labEntrySrc));
  assert('saveManualEntry uses the canonical marker store boundary',
    /saveManualEntry[\s\S]{0,6200}saveManualMarkerValue\(\{[\s\S]{0,250}dotKey,[\s\S]{0,250}noteText,[\s\S]{0,250}collectionContext:/.test(markerDetailEditingSrc)
      && /writeMarkerValueNote[\s\S]{0,500}mapKey\(dotKey, date\)/.test(markerDetailStoreSrc));
  assert('deleteMarkerValue uses the canonical marker store boundary',
    /deleteMarkerValue[\s\S]{0,1200}deleteManualMarkerValue\(dotKey, date\)/.test(markerDetailEditingSrc)
      && /deleteManualMarkerValue[\s\S]{0,900}deleteLabEntryMarkerFromImportedData\(state\.importedData, entry, dotKey/.test(markerDetailStoreSrc));
  assert('editValueNote writes one canonical note',
    /editValueNote[\s\S]{0,1500}saveMarkerValueNote\(dotKey, date, capped\)/.test(markerDetailEditingSrc)
      && /saveMarkerValueNote[\s\S]{0,500}writeMarkerValueNote\(dotKey, date, noteText\)/.test(markerDetailStoreSrc)
      && !/insulinMirrorMapKey/.test(markerDetailStoreSrc));

  assert('Empty-cell manual entry uses delegated id/date attrs',
    categoryViewRenderersSrc.includes("markerDetailActionAttrs('open-manual-entry', { id, date: colDate })") &&
    /open-manual-entry'[\s\S]{0,180}openManualEntryForm\?\.\(id, date \|\| undefined\)/.test(markerDetailActionsSrc));

  // ═══════════════════════════════════════
  // 7. Value-card rendering
  // ═══════════════════════════════════════
  console.log('%c 7. Value-card render ', 'font-weight:bold;color:#f59e0b');

  assert('Value card reads note from markerValueNotes by mvKey',
    /state\.importedData\.markerValueNotes\?\.\[mvKey\]/.test(markerDetailSrc));
  assert('Empty card shows "+ note" hint',
    /mv-value-note add-note[\s\S]{0,200}\+ note/.test(markerDetailSrc));
  assert('Populated card has × delete button',
    /mv-value-note-delete[\s\S]{0,400}markerDetailActionAttrs\('delete-value-note'/.test(markerDetailSrc));
  assert('Value-note actions use delegated click handling so cell-edit does not fire',
    markerDetailSrc.includes("markerDetailActionAttrs('edit-value-note', { id, date: actionDate })"));

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
  assert('Per-value notes section is gated on lab context and map non-empty (no empty-section noise)',
    /mvKeys = Object\.keys\(mvNotes\)[\s\S]{0,240}if \(includeLabMarkers && mvKeys\.length > 0\)/.test(labCtxSrc));
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
  const stylesSrc = read('styles.css') + '\n' + read('css/marker-detail-modal.css');
  assert('CSS defines .mv-value-note container',
    /\.mv-value-note\s*\{/.test(stylesSrc));
  assert('CSS defines .mv-value-note.add-note hover-reveal',
    /\.mv-value-note\.add-note/.test(stylesSrc) && /modal-value-card:hover .mv-value-note\.add-note/.test(stylesSrc));
  assert('CSS defines .mv-value-note-delete styling',
    /\.mv-value-note-delete/.test(stylesSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
