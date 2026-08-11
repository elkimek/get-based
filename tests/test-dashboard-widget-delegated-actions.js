#!/usr/bin/env node
// Static dashboard widget delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const controlsSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-controls.js'), 'utf8');
const runtimeSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-runtime.js'), 'utf8');
const compositionSrc = fs.readFileSync(path.join(root, 'js/dashboard-view-composition.js'), 'utf8');
const renderersSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-renderers.js'), 'utf8');
const labRenderersSrc = fs.readFileSync(path.join(root, 'js/dashboard-lab-widget-renderers.js'), 'utf8');
const allRendererSrc = `${renderersSrc}\n${labRenderersSrc}`;
const dashboardWidgetsCss = fs.readFileSync(path.join(root, 'css/dashboard-widgets.css'), 'utf8');
const biometricOverviewSrc = renderersSrc.slice(
  renderersSrc.indexOf('function renderDashboardBiometricSyncStatus'),
  renderersSrc.indexOf('function getDashboardGenomeImpact'),
);

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

console.log('=== Dashboard Widget Delegated Actions ===');

assert('dashboard widget controls render no inline event attributes',
  !/\bon(?:click|input|dragstart|dragover|drop)=/.test(controlsSrc));
assert('dashboard widget controls import runtime adapter',
  controlsSrc.includes("from './dashboard-widget-runtime.js'"));
assert('dashboard widget runtime owns shell callbacks and explicit note actions',
  runtimeSrc.includes('openSettingsModal') &&
    runtimeSrc.includes('syncWearableNow') &&
    runtimeSrc.includes('configureDashboardWidgetRuntimeDeps') &&
    runtimeSrc.includes('dashboardWidgetRuntimeDeps.navigate') &&
    runtimeSrc.includes('dashboardWidgetRuntimeDeps.openChatPanel') &&
    runtimeSrc.includes('dashboardWidgetRuntimeDeps.showDetailModal') &&
    !runtimeSrc.includes('getViewRuntimeFunction') &&
    runtimeSrc.includes('configureDashboardNoteActions') &&
    runtimeSrc.includes('dashboardNoteActions'));
assert('dashboard widget controls has no direct window refs',
  !/\bwindow(\.|\s*\[)/.test(controlsSrc));
assert('dashboard widget renderers import runtime adapter',
  renderersSrc.includes("from './dashboard-widget-runtime.js'"));
assert('dashboard widget renderers have no direct window refs',
  !/\bwindow(\.|\s*\[)/.test(allRendererSrc));
assert('dashboard widget renderers render no inline event attributes',
  !/\bon(?:click|input|change|keydown|keyup|submit)=/.test(allRendererSrc));
assert('dashboard widget controls render delegated action attributes',
  controlsSrc.includes('function dashboardWidgetActionAttrs') &&
    controlsSrc.includes('data-dashboard-widget-action=') &&
    controlsSrc.includes("dashboardWidgetActionAttrs('toggle-organize'") &&
    controlsSrc.includes("dashboardWidgetActionAttrs('open-picker'") &&
    controlsSrc.includes("dashboardWidgetActionAttrs('move-widget'") &&
    controlsSrc.includes("dashboardWidgetActionAttrs('hide-widget'") &&
    controlsSrc.includes("dashboardWidgetActionAttrs('show-widget'"));
assert('dashboard widget controls render delegated picker inputs',
  controlsSrc.includes('function dashboardWidgetInputAttrs') &&
    controlsSrc.includes('data-dashboard-widget-input=') &&
    controlsSrc.includes("dashboardWidgetInputAttrs('filter-biometric-picker')") &&
    controlsSrc.includes("dashboardWidgetInputAttrs('filter-marker-picker')"));
assert('dashboard widget controls render delegated drag/drop attributes',
  controlsSrc.includes('function dashboardWidgetDragAttrs') &&
    controlsSrc.includes('data-dashboard-widget-drag-id') &&
    controlsSrc.includes('data-dashboard-widget-drop-id'));
assert('dashboard widget controls install idempotent click/input/drag delegates',
  controlsSrc.includes('let dashboardWidgetDelegatesInstalled = false') &&
    controlsSrc.includes("document.addEventListener('click', handleDashboardWidgetClick)") &&
    controlsSrc.includes("document.addEventListener('keydown', handleDashboardWidgetKeydown)") &&
    controlsSrc.includes("document.addEventListener('input', handleDashboardWidgetInput)") &&
    controlsSrc.includes("document.addEventListener('dragstart', handleDashboardWidgetDragStart)") &&
    controlsSrc.includes("document.addEventListener('dragover', handleDashboardWidgetDragOver)") &&
    controlsSrc.includes("document.addEventListener('drop', handleDashboardWidgetDrop)"));
assert('dashboard biometric overview renders no inline event attributes',
  !/\bon(?:click|keydown|submit|change|input)=/.test(biometricOverviewSrc));
assert('dashboard biometric overview renders delegated widget actions',
  renderersSrc.includes("import { dashboardWidgetActionAttrs } from './dashboard-widget-controls.js'") &&
    biometricOverviewSrc.includes("dashboardWidgetActionAttrs('sync-biometric-now'") &&
    biometricOverviewSrc.includes("dashboardWidgetActionAttrs('remove-biometric-metric'") &&
    biometricOverviewSrc.includes("dashboardWidgetActionAttrs('open-biometric-manual-log'") &&
    biometricOverviewSrc.includes("dashboardWidgetActionAttrs('open-biometric-detail'") &&
    biometricOverviewSrc.includes("dashboardWidgetActionAttrs('open-biometric-picker'"));
assert('dashboard renderer body actions use the shared dashboard delegate contract',
  allRendererSrc.includes("dashboardWidgetActionAttrs('open-marker-detail'") &&
    allRendererSrc.includes("dashboardWidgetActionAttrs('navigate'") &&
    allRendererSrc.includes("dashboardWidgetActionAttrs('open-note-editor'") &&
    allRendererSrc.includes("dashboardWidgetActionAttrs('delete-note'"));
assert('dashboard renderer no longer duplicates the Genome lens DNA import CTA',
  !renderersSrc.includes("dashboardWidgetActionAttrs('trigger-dna-picker'"));
assert('dashboard widget click delegate lets nested wearable actions handle inline forms',
  controlsSrc.includes("target.closest('[data-wearable-action]')") &&
    controlsSrc.includes('actionEl.contains(wearableActionEl)') &&
    controlsSrc.includes("actionEl.click();"));
assert('dashboard widget picker backdrop stays target-only',
  controlsSrc.includes("target.closest('#dashboard-widget-picker-overlay[data-dashboard-widget-overlay]')") &&
    controlsSrc.includes('overlay && target === overlay'));
assert('dashboard organize mode disables dense grid packing',
  /\.dashboard-widgets\.is-organizing\s*\{[^}]*grid-auto-flow:\s*row;[^}]*\}/.test(dashboardWidgetsCss));

[
  'toggle-organize',
  'open-picker',
  'reset-widgets',
  'move-widget',
  'hide-widget',
  'show-widget',
  'add-marker-widget',
  'add-biometric-metric',
  'close-picker',
  'customize-layout',
  'reset-layout',
  'connect-source',
  'open-biometric-picker',
  'sync-biometric-now',
  'remove-biometric-metric',
  'open-biometric-detail',
  'open-biometric-manual-log',
  'open-marker-detail',
  'ask-genome-snp',
  'navigate',
  'trigger-dna-picker',
  'open-note-editor',
  'delete-note',
].forEach(action => {
  assert(`dashboard widget action ${action} is handled`, controlsSrc.includes(`action === '${action}'`));
});

[
  'toggleDashboardOrganizeMode',
  'moveDashboardWidget',
  'hideDashboardWidget',
  'showDashboardWidget',
  'addDashboardMarkerWidget',
  'addDashboardBiometricMetric',
  'openDashboardWidgetPicker',
  'openDashboardBiometricPicker',
  'closeDashboardWidgetPicker',
  'startDashboardWidgetDrag',
  'allowDashboardWidgetDrop',
  'dropDashboardWidget',
].forEach(name => {
  assert(`${name} remains forwarded through dashboard composition`,
    compositionSrc.includes(`${name}: (...args) => dashboardWidgetControls.${name}(...args)`));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
