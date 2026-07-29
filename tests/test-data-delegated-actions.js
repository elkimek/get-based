#!/usr/bin/env node
// Source-inspection coverage for data-view delegated actions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;

function assert(name, condition) {
  if (condition) {
    pass += 1;
    console.log(`  PASS: ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL: ${name}`);
  }
}

const dataFacadeSrc = read('js/data.js');
const dataSrc = read('js/data-view-controls.js');
const appShellHooksSrc = read('js/app-shell-hooks.js');
const eventNames = ['click', 'keydown', 'change', 'input', 'submit', 'blur', 'toggle'];
const inlineEventPattern = new RegExp(`\\bon(?:${eventNames.join('|')})=["']`);

console.log('=== Data Delegated Actions Tests ===');

assert('data view controls renderer emits no inline event attributes',
  !inlineEventPattern.test(dataSrc));

assert('data view controls import escapeAttr for delegated data attributes',
  /import\s*\{[^}]*\bescapeAttr\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(dataSrc));

assert('data view callbacks use shell injection instead of bridge or window lookups',
  !dataSrc.includes("from './views-runtime-bridge.js'")
  && !dataSrc.includes('dataWindow')
  && dataSrc.includes('export function configureDataRuntimeDeps(deps = {})')
  && dataSrc.includes('dataRuntimeDeps.navigate?.(route, data);')
  && dataSrc.includes('dataRuntimeDeps.buildSidebar?.(data);')
  && dataSrc.includes('dataRuntimeDeps.showDetailModal?.(openId);')
  && dataFacadeSrc.includes("from './data-view-controls.js'")
  && /import\s*\{[^}]*\bconfigureDataRuntimeDeps\b[^}]*\}\s*from\s*['"]\.\/data\.js['"]/.test(appShellHooksSrc)
  && appShellHooksSrc.includes('configureDataRuntimeDeps({ buildSidebar, navigate, showDetailModal });'));

assert('data action attribute helpers are exported',
  /export function dataActionAttrs\(action, attrs = \{\}\)/.test(dataSrc)
  && /export function dataChangeAttrs\(action, attrs = \{\}\)/.test(dataSrc)
  && dataSrc.includes('data-lab-data-action')
  && dataSrc.includes('data-lab-data-change'));

assert('data delegates install idempotent click and change listeners',
  dataSrc.includes('const dataActionDelegateRoots = new WeakSet();')
  && dataSrc.includes("root.addEventListener('click', handleDataClick)")
  && dataSrc.includes("root.addEventListener('change', handleDataChange)")
  && dataSrc.includes('installDataActionDelegates();'));

assert('date range buttons use delegated click actions',
  dataSrc.includes("dataActionAttrs('set-date-range', { range: r.key })")
  && dataSrc.includes("action === 'set-date-range'")
  && dataSrc.includes("setDateRange(actionEl.getAttribute(DATA_RANGE_ATTR) || 'all')"));

assert('chart layers trigger and rows use delegated click actions',
  dataSrc.includes("dataActionAttrs('toggle-chart-layers')")
  && dataSrc.includes("dataActionAttrs('chart-layers-row')")
  && dataSrc.includes("action === 'toggle-chart-layers'")
  && dataSrc.includes("action === 'chart-layers-row'"));

assert('chart layer row delegate preserves old propagation containment',
  dataSrc.includes('function containChartLayersClick(event)')
  && dataSrc.includes('event.stopImmediatePropagation')
  && dataSrc.includes('containChartLayersClick(event);'));

assert('chart layer checkboxes use delegated change actions',
  dataSrc.includes("dataChangeAttrs('set-note-overlay')")
  && dataSrc.includes("dataChangeAttrs('set-supp-overlay')")
  && dataSrc.includes("dataChangeAttrs('set-phase-overlay')")
  && dataSrc.includes("setNoteOverlay(mode)")
  && dataSrc.includes("setSuppOverlay(mode)")
  && dataSrc.includes("setPhaseOverlay(mode)"));

assert('range mode buttons keep data-range and use delegated actions',
  dataSrc.includes('data-range="${m}"')
  && dataSrc.includes("dataActionAttrs('switch-range-mode', { range: m })")
  && dataSrc.includes("action === 'switch-range-mode'")
  && /action === 'switch-range-mode'[\s\S]{0,220}switchRangeMode\(actionEl\.getAttribute\(DATA_RANGE_ATTR\) \|\| 'optimal'\);[\s\S]{0,60}return;/.test(dataSrc));

console.log(`\nData delegated actions tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
