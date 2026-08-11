#!/usr/bin/env node
// Static marker-detail delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modalFacadeSrc = fs.readFileSync(path.join(root, 'js/marker-detail-modal.js'), 'utf8');
const modalImplSrc = fs.readFileSync(path.join(root, 'js/marker-detail-modal-impl.js'), 'utf8');
const manualEntrySrc = fs.readFileSync(path.join(root, 'js/marker-detail-manual-entry.js'), 'utf8');
const customMarkersSrc = fs.readFileSync(path.join(root, 'js/marker-detail-custom-markers.js'), 'utf8');
const placementSrc = fs.readFileSync(path.join(root, 'js/marker-detail-placement.js'), 'utf8');
const modalSrc = `${modalImplSrc}\n${manualEntrySrc}\n${customMarkersSrc}\n${placementSrc}`;
const editingSrc = fs.readFileSync(path.join(root, 'js/marker-detail-editing.js'), 'utf8');
const actionSrc = fs.readFileSync(path.join(root, 'js/marker-detail-actions.js'), 'utf8');
const runtimeSrc = fs.readFileSync(path.join(root, 'js/marker-detail-runtime.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(root, 'js/dashboard-view-composition.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Marker Detail Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/g;
const inlineHandlers = modalSrc.match(inlineHandlerRe) || [];
const editingInlineHandlers = editingSrc.match(inlineHandlerRe) || [];

assert('marker-detail-modal renders no inline event attributes',
  inlineHandlers.length === 0,
  `found ${inlineHandlers.length}`);
assert('marker-detail-editing renders no inline event attributes',
  editingInlineHandlers.length === 0,
  `found ${editingInlineHandlers.length}`);
assert('marker-detail-modal imports and installs the delegated action helper',
  modalSrc.includes("from './marker-detail-actions.js'") &&
    modalSrc.includes('installMarkerDetailActionDelegates({') &&
    modalSrc.includes('markerDetailActionAttrs'));
assert('marker-detail-actions defines one shared action attribute helper',
  (actionSrc.match(/\bfunction\s+markerDetailActionAttrs\b/g) || []).length === 1 &&
    actionSrc.includes('data-marker-detail-action=') &&
    actionSrc.includes('data-marker-detail-${escapeAttr(dataAttrName(name))}=') &&
    actionSrc.includes("replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)") &&
    actionSrc.includes("value !== false"));
assert('marker-detail-actions installs idempotent click and keyboard delegates',
  actionSrc.includes('const markerDetailActionDelegates = new WeakMap();') &&
    actionSrc.includes('Object.assign(installedActions, actions)') &&
    actionSrc.includes("root.addEventListener('click', event => handleMarkerDetailClick(event, delegatedActions))") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleMarkerDetailKeydown(event, delegatedActions))") &&
    actionSrc.includes("root.addEventListener('change', event => handleMarkerDetailChange(event, delegatedActions))"));
assert('marker-detail facade bridges delegated card clicks before the implementation loads',
  modalFacadeSrc.includes("import { installMarkerDetailActionDelegates } from './marker-detail-actions.js'") &&
    modalFacadeSrc.includes('installMarkerDetailActionDelegates({ showDetailModal });'));
assert('marker-detail delegated actions are scoped to the installed root',
  actionSrc.includes("event.currentTarget.contains(actionEl)"));
assert('marker-detail open manual entry action preserves optional prefill date',
  actionSrc.includes('actions.openManualEntryForm?.(id, date || undefined)'));
assert('marker-detail keyboard delegate supports role-button spans and ignores form controls',
  actionSrc.includes("event.target?.closest?.('button, a, input, textarea, select')") &&
    actionSrc.includes("actionEl.getAttribute('role') !== 'button'"));
assert('history note toggle no longer depends on brittle parentElement chaining',
  actionSrc.includes("actionEl.closest('.marker-history-row')?.querySelector('.mv-note-text')?.classList.toggle('show')") &&
    !modalSrc.includes("this.parentElement.parentElement.querySelector('.mv-note-text')"));
assert('dashboard passes the quick-marker pin dependency instead of relying on an inline window handler',
  dashboardSrc.includes('toggleDashboardQuickMarkerPin, showEmojiPicker') &&
    modalSrc.includes("markerDetailActionAttrs('quick-pin', { id })"));
assert('dashboard composition injects marker detail UI callbacks without runtime lookups',
  dashboardSrc.includes('configureMarkerDetailRuntime({') &&
    dashboardSrc.includes('isDashboardQuickMarkerPinned,\n    navigate,\n    showEmojiPicker,\n    toggleDashboardQuickMarkerPin,'));
assert('service worker precaches marker-detail-actions.js',
  swSrc.includes("'/js/marker-detail-actions.js'"));
assert('service worker precaches marker-detail-runtime.js',
  swSrc.includes("'/js/marker-detail-runtime.js'"));
assert('service worker precaches marker-detail-placement.js',
  swSrc.includes("'/js/marker-detail-placement.js'"));
assert('marker-detail-modal delegates browser globals through runtime adapter',
  modalSrc.includes("from './marker-detail-runtime.js'") &&
    !/\bwindow(?:\.|\s*\[)/.test(modalSrc) &&
    runtimeSrc.includes('export function navigateMarkerDetailRuntime') &&
    runtimeSrc.includes('export function hasRecommendationSectionRendererRuntime') &&
    runtimeSrc.includes('export async function renderRecommendationSectionRuntime') &&
    !runtimeSrc.includes("from './views-runtime-bridge.js'"));
assert('marker-detail-editing delegates browser shell hooks through runtime adapter',
  editingSrc.includes("from './marker-detail-runtime.js'") &&
    editingSrc.includes('buildMarkerDetailSidebarRuntime') &&
    editingSrc.includes('navigateMarkerDetailRuntime') &&
    editingSrc.includes('buildSidebar: buildMarkerDetailSidebarRuntime') &&
    !/\bwindow(?:\.|\s*\[)/.test(editingSrc));
assert('marker-detail-modal only creates recommendation placeholders when renderer can fill them',
  modalSrc.includes('const shouldRenderRecommendations = isProductRecsEnabledRuntime() && hasRecommendationSectionRendererRuntime();') &&
    modalSrc.includes('if (shouldRenderRecommendations)'));

[
  'close-modal',
  'clear-ref-edit-field',
  'save-ref-range',
  'quick-pin',
  'edit-ref-range',
  'revert-ref-range',
  'rename-marker',
  'revert-marker-name',
  'open-marker-placement',
  'save-marker-placement',
  'restore-marker-placement',
  'toggle-history-note',
  'edit-marker-value',
  'delete-marker-value',
  'revert-marker-value',
  'edit-value-note',
  'delete-value-note',
  'show-detail-modal',
  'open-manual-entry',
  'ask-ai',
  'toggle-marker-note-editor',
  'save-marker-note',
  'delete-marker-note',
  'delete-custom-marker',
  'save-manual-entry',
  'save-and-add-manual-entry',
  'toggle-custom-marker-category',
  'pick-new-cat-icon',
  'save-custom-marker',
].forEach(action => {
  assert(`marker detail action ${action} is handled`,
    actionSrc.includes(`action === '${action}'`));
});

[
  "markerDetailActionAttrs('revert-ref-range', { id, type })",
  "markerDetailActionAttrs('edit-ref-range', { id, type })",
  "markerDetailActionAttrs('clear-ref-edit-field', { field: 'min' })",
  "markerDetailActionAttrs('clear-ref-edit-field', { field: 'max' })",
  "markerDetailActionAttrs('save-ref-range', { id, type })",
  "markerDetailActionAttrs('revert-marker-name', { id })",
  "markerDetailActionAttrs('rename-marker', { id })",
  "markerDetailActionAttrs('open-marker-placement', { id })",
  "markerDetailActionAttrs('save-marker-placement', { id })",
  "markerDetailActionAttrs('restore-marker-placement', { id })",
  "markerDetailActionAttrs('quick-pin', { id })",
  "markerDetailActionAttrs('close-modal')",
  "markerDetailActionAttrs('toggle-history-note')",
  "markerDetailActionAttrs('delete-marker-value', { id, date: actionDate })",
  "markerDetailActionAttrs('edit-marker-value', { id, date: actionDate, value: v })",
  "markerDetailActionAttrs('edit-value-note', { id, date: actionDate })",
  "markerDetailActionAttrs('delete-value-note', { id, date: actionDate })",
  "markerDetailActionAttrs('show-detail-modal', { id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true })",
  "markerDetailActionAttrs('open-manual-entry', { id })",
  "markerDetailActionAttrs('ask-ai', { id })",
  "markerDetailActionAttrs('toggle-marker-note-editor', { dotKey })",
  "markerDetailActionAttrs('save-marker-note', { dotKey, id })",
  "markerDetailActionAttrs('delete-marker-note', { dotKey, id })",
  "markerDetailActionAttrs('delete-custom-marker', { id })",
  "markerDetailActionAttrs('save-manual-entry', { id })",
  "markerDetailActionAttrs('save-and-add-manual-entry', { id })",
  "markerDetailActionAttrs('toggle-custom-marker-category')",
  "markerDetailActionAttrs('pick-new-cat-icon')",
  "markerDetailActionAttrs('save-custom-marker')",
].forEach(renderedAction => {
  assert(`marker detail renders ${renderedAction}`,
    modalSrc.includes(renderedAction) || editingSrc.includes(renderedAction));
});

[
  'openManualEntryForm',
  'askAIAboutMarker',
  'deleteMarkerValue',
  'editMarkerValue',
  'editValueNote',
  'deleteValueNote',
  'toggleMarkerNoteEditor',
  'saveMarkerNote',
  'deleteMarkerNote',
  'saveManualEntry',
  'saveAndAddAnotherManualEntry',
  'deleteCustomMarker',
].forEach(fnName => {
  assert(`marker-detail-modal has no inline onclick ${fnName} call`,
    !modalSrc.includes(`onclick="${fnName}`) &&
      !modalSrc.includes(`onclick="event.stopPropagation();${fnName}`) &&
      !modalSrc.includes(`onclick="event.preventDefault();event.stopPropagation();${fnName}`));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
