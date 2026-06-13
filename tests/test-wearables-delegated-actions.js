#!/usr/bin/env node
// Static wearables delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const stripSrc = fs.readFileSync(path.join(root, 'js/wearables.js'), 'utf8');
const detailSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-modal.js'), 'utf8');
const stripImportsSharedActionHelper = /import\s*{[^}]*\bwearableActionAttrs\b[^}]*}\s*from\s+'\.\/wearables-detail-modal\.js';/s.test(stripSrc);

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
  !inlineHandlerRe.test(stripSrc));
assert('wearables detail modal renders no inline event attributes',
  !inlineHandlerRe.test(detailSrc));
assert('wearables strip renders delegated action attributes',
  stripImportsSharedActionHelper &&
    stripSrc.includes("wearableActionAttrs('open-manual-log'") &&
    stripSrc.includes("wearableActionAttrs('open-detail'") &&
    stripSrc.includes("wearableActionAttrs('move-card'") &&
    stripSrc.includes("wearableActionAttrs('manual-log-save'"));
assert('wearables detail modal renders delegated action and form attributes',
  detailSrc.includes('export function wearableActionAttrs') &&
    detailSrc.includes('function wearableFormAttrs') &&
    detailSrc.includes('data-wearable-action=') &&
    detailSrc.includes('data-wearable-form=') &&
    detailSrc.includes("wearableActionAttrs('set-detail-range'") &&
    detailSrc.includes("wearableActionAttrs('delete-detail-manual-entry'") &&
    detailSrc.includes("wearableFormAttrs('detail-manual-add'"));
assert('wearables detail modal opens through shared overlay lifecycle helper',
  detailSrc.includes("from './modal-lifecycle.js'") &&
    detailSrc.includes('openModalOverlay(overlay)'));
assert('wearable action attr helper has one shared definition',
  (stripSrc.match(/\bfunction\s+wearableActionAttrs\b/g) || []).length === 0 &&
    (detailSrc.match(/\bfunction\s+wearableActionAttrs\b/g) || []).length === 1 &&
    stripImportsSharedActionHelper);
assert('wearables module installs idempotent click keydown and submit delegates',
  stripSrc.includes('let wearableDelegatesInstalled = false') &&
    stripSrc.includes("document.addEventListener('click', handleWearableActionClick)") &&
    stripSrc.includes("document.addEventListener('keydown', handleWearableActionKeydown)") &&
    stripSrc.includes("document.addEventListener('submit', handleWearableFormSubmit)") &&
    stripSrc.includes('installWearableDelegates();'));
assert('wearables delegated clicks are scoped to wearables surfaces',
  stripSrc.includes("closest('.wearable-strip, #detail-modal, .db-biometric-overview-grid')"));
assert('wearables detail opens reset any active manual inline form',
  stripSrc.includes('function openWearableDetailFromDashboard') &&
    stripSrc.includes('resetOpenManualLogForms();') &&
    stripSrc.includes('openWearableDetail: openWearableDetailFromDashboard'));
assert('wearables delegated manual log open bypasses only the legacy inline-card guard',
  stripSrc.includes("openManualLogForm(metricId, event, { delegated: true })") &&
    stripSrc.includes("!opts.delegated && event?.target?.closest?.('[data-wearable-action]')") &&
    !stripSrc.includes("if (event?.target?.closest?.('[data-wearable-action]')) return;"));
assert('wearables delegated keyboard ignores form controls',
  stripSrc.includes("target.closest('input, textarea, select, button, a')"));

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
