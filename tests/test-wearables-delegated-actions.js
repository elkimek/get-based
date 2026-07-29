#!/usr/bin/env node
// Static wearables delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const stripSrc = fs.readFileSync(path.join(root, 'js/wearables.js'), 'utf8');
const stripActionsSrc = fs.readFileSync(path.join(root, 'js/wearables-strip-actions.js'), 'utf8');
const detailModalSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-modal.js'), 'utf8');
const manualDetailSrc = fs.readFileSync(path.join(root, 'js/wearables-manual-detail.js'), 'utf8');
const detailSrc = `${detailModalSrc}\n${manualDetailSrc}`;
const settingsPanelSrc = fs.readFileSync(path.join(root, 'js/wearables-settings-panel.js'), 'utf8');
const stripImportsSharedActionHelper = /import\s*{[^}]*\bwearableActionAttrs\b[^}]*}\s*from\s+'\.\/wearables-detail-modal\.js';/s.test(stripSrc);
const stripActionsImportSharedActionHelper = /import\s*{[^}]*\bwearableActionAttrs\b[^}]*}\s*from\s+'\.\/wearables-detail-modal\.js';/s.test(stripActionsSrc);

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

console.log('=== Wearables Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

assert('wearables strip renders no inline event attributes',
  !inlineHandlerRe.test(stripSrc) && !inlineHandlerRe.test(stripActionsSrc));
assert('wearables detail modal renders no inline event attributes',
  !inlineHandlerRe.test(detailSrc));
assert('wearables settings panel renders no inline event attributes',
  !inlineHandlerRe.test(settingsPanelSrc));
assert('wearables strip renders delegated action attributes',
  stripImportsSharedActionHelper &&
    stripActionsImportSharedActionHelper &&
    stripSrc.includes("wearableActionAttrs('open-manual-log'") &&
    stripSrc.includes("wearableActionAttrs('open-detail'") &&
    stripSrc.includes("wearableActionAttrs('move-card'") &&
    stripActionsSrc.includes("wearableActionAttrs('manual-log-save'"));
assert('wearables detail modal renders delegated action and form attributes',
  detailModalSrc.includes('export function wearableActionAttrs') &&
    manualDetailSrc.includes('function formAttrs') &&
    manualDetailSrc.includes('data-wearable-action=') &&
    manualDetailSrc.includes('data-wearable-form="detail-manual-add"') &&
    detailModalSrc.includes("wearableActionAttrs('set-detail-range'") &&
    detailModalSrc.includes("wearableActionAttrs('delete-detail-manual-entry'") &&
    manualDetailSrc.includes('formAttrs(metricId, kind)'));
assert('wearables detail modal opens through shared overlay lifecycle helper',
  detailSrc.includes("from './modal-lifecycle.js'") &&
    detailSrc.includes('openModalOverlay(overlay)'));
assert('wearable action attr helper has one shared definition',
  (stripSrc.match(/\bfunction\s+wearableActionAttrs\b/g) || []).length === 0 &&
    (stripActionsSrc.match(/\bfunction\s+wearableActionAttrs\b/g) || []).length === 0 &&
    (detailModalSrc.match(/\bfunction\s+wearableActionAttrs\b/g) || []).length === 1 &&
    stripImportsSharedActionHelper &&
    stripActionsImportSharedActionHelper);
assert('wearables module installs idempotent click keydown and submit delegates',
  stripSrc.includes('let wearableDelegatesInstalled = false') &&
    stripSrc.includes("document.addEventListener('click', handleWearableActionClick)") &&
    stripSrc.includes("document.addEventListener('keydown', handleWearableActionKeydown)") &&
    stripSrc.includes("document.addEventListener('submit', handleWearableFormSubmit)") &&
    stripSrc.includes('installWearableDelegates();'));
assert('wearables delegated clicks are scoped to wearables surfaces',
  stripSrc.includes("closest('.wearable-strip, #detail-modal, .db-biometric-overview-grid')"));
assert('wearables detail opens reset any active manual inline form',
  stripSrc.includes('export function openWearableDetail') &&
    stripSrc.includes('resetOpenManualLogForms();') &&
    stripSrc.includes('configureWearablesModuleBridge({') &&
    stripSrc.includes('openWearableDetail,'));
assert('wearables delegated manual log open bypasses only the legacy inline-card guard',
  stripSrc.includes("openManualLogForm(metricId, event, { delegated: true })") &&
    stripActionsSrc.includes("!opts.delegated && event?.target?.closest?.('[data-wearable-action]')") &&
    !stripActionsSrc.includes("if (event?.target?.closest?.('[data-wearable-action]')) return;"));
assert('wearables delegated keyboard ignores form controls',
  stripSrc.includes("target.closest('input, textarea, select, button, a')"));
assert('wearables settings panel installs delegated click change and drop handlers',
  settingsPanelSrc.includes('let wearableSettingsDelegatesInstalled = false') &&
    settingsPanelSrc.includes("root.addEventListener('click', handleWearableSettingsClick, true)") &&
    settingsPanelSrc.includes("root.addEventListener('change', handleWearableSettingsChange)") &&
    settingsPanelSrc.includes("root.addEventListener('drop', handleWearableSettingsDrop)") &&
    settingsPanelSrc.includes('installWearableSettingsDelegates();'));
assert('wearables settings panel renders delegated action and input attributes',
  settingsPanelSrc.includes('function wearableSettingsActionAttrs') &&
    settingsPanelSrc.includes('function wearableSettingsInputAttrs') &&
    settingsPanelSrc.includes('data-wearable-settings-action=') &&
    settingsPanelSrc.includes('data-wearable-settings-input=') &&
    settingsPanelSrc.includes("wearableSettingsActionAttrs('manual-dashboard'") &&
    settingsPanelSrc.includes("wearableSettingsActionAttrs('sync-now'") &&
    settingsPanelSrc.includes("wearableSettingsInputAttrs('apple-health-file'"));

[
  'open-manual-log',
  'open-detail',
  'choose-source',
  'open-settings-wearables',
  'dismiss-stub',
  'toggle-strip',
  'sync-now',
  'toggle-reorder',
  'move-card',
  'manual-log-save',
  'manual-log-cancel',
  'modal-close',
  'set-detail-range',
  'open-detail-manual-add',
  'delete-detail-manual-entry',
  'close-detail-manual-add',
  'open-emf-assessment',
].forEach(action => {
  assert(`wearables action ${action} is handled`, stripSrc.includes(`action === '${action}'`));
});

assert('reorder mode renders non-interactive cards and delegated arrows',
  stripSrc.includes('interactive: !reorderMode') &&
    !stripSrc.includes('replace(/ onclick=') &&
    stripSrc.includes("wearableActionAttrs('move-card'"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
