#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-manual-entry-flow.js — manual-entry quality-of-life pass.
// Source inspection only — no module imports needed.
//
// Run: node tests/test-manual-entry-flow.js  (or via npm test)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { tsStaticStyles } from '../js/ts-static-ui-inline-style-map.generated.js';
import { renderHTML as renderMarkerHistory } from '../js/components/MarkerDetailHistory.svelte.html.js';
import { renderHTML as renderMarkerChrome } from '../js/components/MarkerDetailChrome.svelte.html.js';
import { renderManualMarkerEntry } from '../js/manual-marker-entry-presentation.js';
import { projectMarkerDetailAction } from '../js/marker-detail-projection.js';
import { installMarkerDetailActionDelegates } from '../js/marker-detail-actions.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');


const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Manual Entry Flow Tests ===\n');

  const viewsSrc = read('js/views.js');
  const markerDetailSrc = [
    read('js/marker-detail-modal-impl.js'),
    read('js/marker-detail-manual-entry.js'),
    read('js/components/ManualMarkerEntry.svelte'),
  ].join('\n');
  const markerDetailEditingSrc = read('js/marker-detail-editing.js').replace(/\s+/g, ' ');
  const markerDetailStoreSrc = read('js/marker-detail-store.js');
  const labEntrySrc = read('js/lab-entry.js');

  // ═══════════════════════════════════════
  // 1. saveManualEntry is async (we await dialogs)
  // ═══════════════════════════════════════
  console.log('%c 1. Async save flow ', 'font-weight:bold;color:#f59e0b');

  assert('saveManualEntry signature is async with opts arg',
    /export async function saveManualEntry\(id, opts = \{\}\)/.test(markerDetailEditingSrc));
  assert('saveAndAddAnotherManualEntry wraps saveManualEntry with keepOpen: true',
    /saveAndAddAnotherManualEntry\(id\)[\s\S]{0,200}saveManualEntry\(id, \{ keepOpen: true \}\)/.test(markerDetailEditingSrc));
  assert('saveAndAddAnotherManualEntry bound to window',
    viewsSrc.includes('saveAndAddAnotherManualEntry,'));

  // ═══════════════════════════════════════
  // 2. Range sanity check
  // ═══════════════════════════════════════
  console.log('%c 2. Range sanity check ', 'font-weight:bold;color:#f59e0b');

  // The regex accepts any var prefixed onto refMax / refMin so the multi-unit
  // feature (which introduces checkRefMax/checkRefMin to shadow with alt-unit
  // ranges) doesn't break pattern pins. Intent is unchanged: a > 10x guard.
  assert('Sanity check triggers when value > refMax * 10',
    /value > \w*[Rr]ef[Mm]ax \* 10/.test(markerDetailEditingSrc));
  // Greptile P2: without `> 0` guard, `refMax === 0` makes the multiplication
  // zero and every positive value triggers the warning.
  assert('Sanity check is guarded against refMax === 0 (no spurious warn)',
    /(\w*[Rr]ef[Mm]ax) != null && \1 > 0 && value > \1 \* 10/.test(markerDetailEditingSrc));
  assert('Sanity check triggers when value < refMin / 10 (and refMin > 0)',
    /(\w*[Rr]ef[Mm]in) > 0 && value < \1 \/ 10/.test(markerDetailEditingSrc));
  assert('Sanity check rejects negative values',
    /value < 0\)\s*warn\s*=/.test(markerDetailEditingSrc) || /if \(value < 0\)/.test(markerDetailEditingSrc));
  assert('Sanity-warn message mentions unit confusion',
    /Did you enter the right unit\?/.test(markerDetailEditingSrc));
  assert('Sanity check awaits showConfirmDialog and bails on cancel',
    /if \(warn && !await showConfirmDialog\(`\$\{warn\}/.test(markerDetailEditingSrc));
  assert('Sanity check uses marker.refMin/refMax (with optional alt-unit overlay)',
    /marker\.refMin[\s\S]{0,200}marker\.refMax/.test(markerDetailEditingSrc));

  // ═══════════════════════════════════════
  // 3. Duplicate-date confirm
  // ═══════════════════════════════════════
  console.log('%c 3. Duplicate-date confirm ', 'font-weight:bold;color:#f59e0b');

  assert('Duplicate check inspects existing entry for the chosen date',
    /existingEntry\s*=\s*state\.importedData\.entries\?\.find\(e => e\.date === date\)/.test(markerDetailEditingSrc));
  assert('Confirm dialog message includes existing value + unit + date',
    /already exists for \$\{date\}\. Overwrite\?/.test(markerDetailEditingSrc));
  assert('Duplicate check uses display-unit value (marker.values[dateIdx]) not raw SI',
    /const dateIdx = data\.dates\.indexOf\(date\)[\s\S]{0,300}marker\.values\[dateIdx\]/.test(markerDetailEditingSrc));
  assert('Manual overwrite remembers imported original for revert',
    /function rememberManualOriginal\(dotKey, date, entry\)/.test(markerDetailStoreSrc) &&
    /manualValues\[key\] = hasImportedOriginal \? current : true/.test(markerDetailStoreSrc) &&
    /saveManualMarkerValue[\s\S]{0,1200}rememberManualOriginal\(dotKey, date, entry\)/.test(markerDetailStoreSrc) &&
    /saveManualEntry[\s\S]{0,6000}saveManualMarkerValue\(\{[\s\S]{0,300}dotKey,[\s\S]{0,300}collectionContext:/.test(markerDetailEditingSrc));
  assert('Manual original detection reads the canonical entry and accepts sourceFiles',
    /function entryMarkerValue\(entry, dotKey\)[\s\S]{0,300}hasOwnProperty\.call\(markers, dotKey\)/.test(markerDetailStoreSrc) &&
    /function entryHasImportedSource\(entry, dotKey\)[\s\S]{0,700}entry\.sourceFiles\.some\(Boolean\)/.test(markerDetailStoreSrc));
  assert('Manual revert uses the canonical marker manual original',
    /export function getManualOriginalForMarker\(dotKey, date\)[\s\S]{0,500}mapKey\(dotKey, date\)/.test(markerDetailStoreSrc) &&
    /revertMarkerValue[\s\S]{0,350}revertManualMarkerValue\(dotKey, date\)/.test(markerDetailEditingSrc));
  assert('Manual value saves stamp lab entry updatedAt for sync freshness',
    /function stampLabEntryUpdated\(entry, now = Date\.now\(\)\)/.test(labEntrySrc)
      && /saveManualMarkerValue[\s\S]{0,1200}setLabEntryMarker\(entry, dotKey, storedValue/.test(markerDetailStoreSrc)
      && /editManualMarkerValue[\s\S]{0,900}setLabEntryMarker\(entry, dotKey, storedValue/.test(markerDetailStoreSrc)
      && /revertManualMarkerValue[\s\S]{0,900}setLabEntryMarker\(entry, dotKey, original/.test(markerDetailStoreSrc));
  assert('Manual marker delete stamps remaining lab entry for sync freshness',
    /deleteMarkerValue[\s\S]{0,1200}deleteManualMarkerValue\(dotKey, date\)/.test(markerDetailEditingSrc)
      && /deleteManualMarkerValue[\s\S]{0,900}deleteLabEntryMarkerFromImportedData\(state\.importedData, entry, dotKey/.test(markerDetailStoreSrc)
      && /deleteLabEntryMarker[\s\S]{0,1800}stampLabEntryUpdated\(entry, now\)/.test(labEntrySrc));
  const actionId = 'biochemistry_glucose', actionDate = '2026-01-01';
  const revertDOM = new JSDOM(renderMarkerHistory({ view: {
    kind: 'manual-revert', actions: projectMarkerDetailAction('revert-marker-value', { id: actionId, date: actionDate }),
  } }));
  const revertCalls: unknown[][] = [];
  installMarkerDetailActionDelegates({ revertMarkerValue: (...args) => revertCalls.push(args) }, revertDOM.window.document);
  const revertButton = revertDOM.window.document.querySelector('[data-marker-detail-action="revert-marker-value"]');
  revertButton?.dispatchEvent(new revertDOM.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('Clickable manual badge reverts to imported value when original exists',
    /canRevert[\s\S]{0,120}kind: "manual-revert"/.test(markerDetailSrc)
      && revertButton?.textContent === 'manual ×'
      && revertButton.getAttribute('aria-label') === 'Revert manual value to imported value'
      && JSON.stringify(revertCalls) === JSON.stringify([[actionId, actionDate]]));
  revertDOM.window.close();
  assert('Manual badge reads the canonical marker original before falling back to plain manual state',
    /function getManualValueForMarker\(dotKey, date\)[\s\S]{0,500}const key = dotKey \+ ':' \+ date/.test(markerDetailSrc) &&
    /map\[key\] != null && map\[key\] !== true/.test(markerDetailSrc) &&
    /const manualVal = rawDate \? getManualValueForMarker\(dotKey, rawDate\) : undefined/.test(markerDetailSrc) &&
    /const isManualSource = !!\(src && src\.file == null && !src\.snapshotId\)/.test(markerDetailSrc));

  // ═══════════════════════════════════════
  // 4. Save & Add Another flow
  // ═══════════════════════════════════════
  console.log('%c 4. Save & Add Another ', 'font-weight:bold;color:#f59e0b');

  assert('keepOpen branch re-opens the manual-entry form with same id + date',
    /if \(keepOpen\)\s*\{[\s\S]{0,300}openManualEntryForm\(id, date\)/.test(markerDetailEditingSrc));
  assert('keepOpen branch still navigate()s to refresh the underlying page',
    /if \(keepOpen\)\s*\{[\s\S]{0,200}markerDetailDeps\.navigate\(navCat\)/.test(markerDetailEditingSrc));
  assert('Save & Add Another button rendered in form actions',
    /Save\s*&amp;\s*Add Another|Save & Add Another/.test(markerDetailSrc));
  const manualDOM = new JSDOM(renderManualMarkerEntry({
    category: () => 'Synthetic', name: () => 'Glucose', unit: () => 'mmol/L', reference: '',
    date: actionDate, today: actionDate, placeholder: '5', sampleTime: '', fasting: 'unknown',
    unitPicker: { multiple: false, rows: [], unit: 'mmol/L' },
    closeAction: () => ({ action: 'show-detail-modal', id: actionId }),
    saveAction: () => ({ action: 'save-manual-entry', id: actionId }),
    addAction: () => ({ action: 'save-and-add-manual-entry', id: actionId }),
    cancelAction: () => ({ action: 'show-detail-modal', id: actionId }),
  }));
  const addCalls: unknown[][] = [];
  installMarkerDetailActionDelegates({ saveAndAddAnotherManualEntry: (...args) => addCalls.push(args) }, manualDOM.window.document);
  const addButton = manualDOM.window.document.querySelector('[data-marker-detail-action="save-and-add-manual-entry"]');
  addButton?.dispatchEvent(new manualDOM.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('Save & Add Another button delegates to saveAndAddAnotherManualEntry',
    addButton?.textContent === 'Save & Add Another' && JSON.stringify(addCalls) === JSON.stringify([[actionId]]));
  manualDOM.window.close();

  // ═══════════════════════════════════════
  // 5. Session-remembered last date
  // ═══════════════════════════════════════
  console.log('%c 5. Session last-date ', 'font-weight:bold;color:#f59e0b');

  assert('saveManualEntry writes the chosen date to sessionStorage',
    /sessionStorage\.setItem\('labcharts-last-manual-date', date\)/.test(markerDetailEditingSrc));
  assert('Write wrapped in try/catch (private-mode browsers)',
    /try \{ sessionStorage\.setItem\('labcharts-last-manual-date'/.test(markerDetailEditingSrc));
  assert('openManualEntryForm reads sessionLast and validates the format',
    /sessionStorage\.getItem\('labcharts-last-manual-date'\)/.test(markerDetailSrc) &&
    /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(raw\)/.test(markerDetailSrc));
  assert('Date fallback chain: prefillDate → sessionLast → today',
    /typeof prefillDate === 'string' && [\s\S]{0,200}sessionLast \|\| today/.test(markerDetailSrc));
  assert('Manual form exposes structured collection time and fasting inputs',
    markerDetailSrc.includes('id="me-sample-time"')
      && markerDetailSrc.includes('id="me-fasting"')
      && markerDetailSrc.includes('not the lab processing or report time'));
  assert('Manual save persists collection context on the date-level lab entry',
    /collectionContext:\s*\{[\s\S]{0,200}sampleTime:[\s\S]{0,120}fasting/.test(markerDetailEditingSrc)
      && /saveManualMarkerValue[\s\S]{0,1400}setLabEntryCollectionContext\(entry, collectionContext/.test(markerDetailStoreSrc));

  // Live behavior: write → openManualEntryForm reads.
  try {
    sessionStorage.setItem('labcharts-last-manual-date', '2099-05-12');
    // We can't easily invoke openManualEntryForm without a real marker; just
    // verify the read shape on a hand-crafted clone of the logic.
    const raw = sessionStorage.getItem('labcharts-last-manual-date');
    assert('sessionStorage round-trip works for last-manual-date', raw === '2099-05-12');
    sessionStorage.removeItem('labcharts-last-manual-date');
  } catch (_) { /* private mode — skip */ }

  // ═══════════════════════════════════════
  // 6. Inline edit — Escape cancel flag + no-change short-circuit
  // ═══════════════════════════════════════
  console.log('%c 6. Inline edit cancel + no-change ', 'font-weight:bold;color:#f59e0b');

  assert('editMarkerValue declares a cancelled flag',
    /let cancelled = false/.test(markerDetailEditingSrc) ||
    /editMarkerValue[\s\S]{0,1500}cancelled\s*=\s*false/.test(markerDetailEditingSrc));
  assert('save() short-circuits when cancelled is true',
    /const save = async \(\) => \{[\s\S]{0,200}if \(cancelled\) return/.test(markerDetailEditingSrc));
  assert('Escape handler sets cancelled = true before re-rendering',
    /else if \(e\.key === 'Escape'\) \{ cancelled = true; showDetailModal/.test(markerDetailEditingSrc));
  assert("No-change save short-circuits (no manual flip on a same-value edit)",
    /newValue === parseFloat\(currentValue\)\)/.test(markerDetailEditingSrc));
  assert('Enter saves inline edits directly instead of relying on blur',
    /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); void save\(\); \}/.test(markerDetailEditingSrc));
  assert('Inline edit guards against double saves from Enter + blur',
    /let saveStarted = false/.test(markerDetailEditingSrc) &&
    /if \(saveStarted\) return;[\s\S]{0,80}saveStarted = true/.test(markerDetailEditingSrc));
  assert('Inline edit awaits persistence before refreshing the modal',
    /await editManualMarkerValue\(\{ dotKey, date, storedValue \}\);[\s\S]{0,180}markerDetailDeps\.navigate/.test(markerDetailEditingSrc));
  assert('revertMarkerValue awaits persistence before refreshing the modal',
    /export async function revertMarkerValue\(id, date\)[\s\S]{0,300}await revertManualMarkerValue\(dotKey, date\)[\s\S]{0,160}markerDetailDeps\.navigate/.test(markerDetailEditingSrc));
  assert('editMarkerValue calls injected navigate() to rebuild Table/Heatmap after save',
    /editMarkerValue[\s\S]{0,2500}markerDetailDeps\.navigate\(state\.currentView \|\| 'dashboard'\)/.test(markerDetailEditingSrc));
  assert('revertMarkerValue also calls injected navigate() to rebuild the underlying view',
    /revertMarkerValue[\s\S]{0,1200}markerDetailDeps\.navigate\(state\.currentView \|\| 'dashboard'\)/.test(markerDetailEditingSrc));

  // ═══════════════════════════════════════
  // 7. Input width fix
  // ═══════════════════════════════════════
  console.log('%c 7. Input width fix ', 'font-weight:bold;color:#f59e0b');

  const editStyleDOM = new JSDOM('<input>');
  const editStyle = editStyleDOM.window.document.querySelector('input')!.style;
  editStyle.cssText = tsStaticStyles.editorInput;
  assert('Edit input uses width:100% with max-width:140px (replaces width:80px)',
    /editMarkerValue[\s\S]{0,1500}input\.style\.cssText = tsStaticStyles\.editorInput/.test(markerDetailEditingSrc)
      && editStyle.width === '100%' && editStyle.maxWidth === '140px');
  editStyleDOM.window.close();
  assert('Old width:80px input style removed from editMarkerValue',
    !/editMarkerValue[\s\S]{0,1500}width:80px/.test(markerDetailEditingSrc));

  // ═══════════════════════════════════════
  // 8. Add Value Manually placement (above Note) + rename
  // ═══════════════════════════════════════
  console.log('%c 8. Add Value Manually placement ', 'font-weight:bold;color:#f59e0b');

  const markerActionsDOM = new JSDOM(renderMarkerChrome({ view: {
    kind: 'actions', primary: {
      kind: 'primary-actions', manualActions: projectMarkerDetailAction('open-manual-entry', { id: actionId }),
      askActions: projectMarkerDetailAction('ask-ai', { id: actionId }),
    }, notes: {
      kind: 'editor', editActions: projectMarkerDetailAction('toggle-marker-note-editor', { dotKey: 'biochemistry.glucose' }),
      editLabel: 'Add note', note: null, text: '',
      saveActions: projectMarkerDetailAction('save-marker-note', { id: actionId, dotKey: 'biochemistry.glucose' }),
      cancelActions: projectMarkerDetailAction('toggle-marker-note-editor', { dotKey: 'biochemistry.glucose' }), delete: null,
    }, recommendations: null,
  } }));
  const manualButton = markerActionsDOM.window.document.querySelector('[data-marker-detail-action="open-manual-entry"]');
  const notesSection = markerActionsDOM.window.document.querySelector('.marker-note-section');
  assert('Add Value Manually button rendered BEFORE the marker-note-section',
    !!manualButton && !!notesSection
      && !!(manualButton.compareDocumentPosition(notesSection) & markerActionsDOM.window.Node.DOCUMENT_POSITION_FOLLOWING));
  assert("Button rename: '+ Add Value' → '+ Add Value Manually'",
    manualButton?.textContent === '+ Add Value Manually');
  markerActionsDOM.window.close();

  // ═══════════════════════════════════════
  // 9. Manual entry form polish — Enter-to-save, max=today, midpoint placeholder
  // ═══════════════════════════════════════
  console.log('%c 9. Form polish ', 'font-weight:bold;color:#f59e0b');

  assert('Date input gains max="${today}" (no future dates)',
    /date: dateValue,\s+today,/.test(markerDetailSrc)
      && /<input type="date" id="me-date" value="\{view\.date\}" max="\{view\.today\}"/.test(read('js/components/ManualMarkerEntry.svelte')));
  assert('Placeholder hint uses midpoint of refMin/refMax when known',
    /placeholderHint = `e\.g\. \$\{formatValue\(\(marker\.refMin \+ marker\.refMax\) \/ 2\)\}`/.test(markerDetailSrc));
  assert('Enter-to-save / Esc-to-cancel handlers on the value input',
    /Enter-to-save \/ Esc-to-cancel/.test(markerDetailSrc) &&
    /if \((?:e|event)\.key === 'Enter'\)[\s\S]{0,100}(?:e|event)\.preventDefault\(\);[\s\S]{0,100}saveManualEntry\(id\)/.test(markerDetailSrc));

  // ═══════════════════════════════════════
  // 10. activeNav sweep — verify the 10-site fix
  // ═══════════════════════════════════════
  console.log('%c 10. activeNav sweep ', 'font-weight:bold;color:#f59e0b');

  const dataSrc = read('js/data-view-controls.js');
  assert('switchUnitSystem uses state.currentView (no .nav-item.active query)',
    /switchUnitSystem[\s\S]{0,800}navigateDataView\(state\.currentView \|\| 'dashboard'/.test(dataSrc) &&
    !/switchUnitSystem[\s\S]{0,800}document\.querySelector\(".nav-item\.active"\)/.test(dataSrc));
  const switchRangeModeBody = dataSrc.match(/export function switchRangeMode\(mode\)[\s\S]*?\n}\s*export function updateHeaderDates/)?.[0] || '';
  assert('switchRangeMode uses state.currentView (no .nav-item.active query)',
    /navigateDataView\(state\.currentView \|\| 'dashboard'/.test(switchRangeModeBody) &&
    !/document\.querySelector\(["']\.nav-item\.active["']\)/.test(switchRangeModeBody));
  assert('setDateRange uses state.currentView',
    /setDateRange[\s\S]{0,1500}navigateDataView\(state\.currentView \|\| 'dashboard'/.test(dataSrc));

  const cryptoSrc = read('js/crypto.js');
  assert('BroadcastChannel cross-tab reload uses state.currentView',
    /state\.currentView \|\| 'dashboard'/.test(cryptoSrc));

  const appEventsSrc = read('js/app-event-listeners.js');
  assert('registerRefreshCallback uses state.currentView',
    /registerRefreshCallback[\s\S]{0,800}state\.currentView \|\| 'dashboard'/.test(appEventsSrc));

  const pdfSrc = read('js/pdf-import.js');
  assert('pdf-import.js no longer uses the buildSidebar+querySelector(.active) antipattern',
    !/buildSidebar\(\);\s*\n\s*const activeNav = document\.querySelector\('\.nav-item\.active'\)/.test(pdfSrc));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
