#!/usr/bin/env node
// Static dashboard widget delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const controlsSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-controls.js'), 'utf8');
const compositionSrc = fs.readFileSync(path.join(root, 'js/dashboard-view-composition.js'), 'utf8');

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
    controlsSrc.includes("document.addEventListener('input', handleDashboardWidgetInput)") &&
    controlsSrc.includes("document.addEventListener('dragstart', handleDashboardWidgetDragStart)") &&
    controlsSrc.includes("document.addEventListener('dragover', handleDashboardWidgetDragOver)") &&
    controlsSrc.includes("document.addEventListener('drop', handleDashboardWidgetDrop)"));
assert('dashboard widget picker backdrop stays target-only',
  controlsSrc.includes("target.closest('#dashboard-widget-picker-overlay[data-dashboard-widget-overlay]')") &&
    controlsSrc.includes('overlay && target === overlay'));

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
