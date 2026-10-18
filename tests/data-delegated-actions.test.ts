import { expect, it } from 'vitest';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

it('retains data delegated-action source contracts', () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions();
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const dataFacadeSrc = read('js/data.js');
  const dataSrc = read('js/data-view-controls.js');
  const headerRangeSrc = read('js/components/HeaderRangeButtons.svelte');
  const headerDateSrc = read('js/components/HeaderDateSummary.svelte');
  const labDateRangeSrc = read('js/components/LabDateRange.svelte');
  const chartLayersSrc = read('js/components/ChartLayersDropdown.svelte');
  const chartLayersAdapter = read('js/chart-layers-presentation.ts');
  const headerAdapterSrc = read('js/header-date-range.js');
  const appShellHooksSrc = read('js/app-shell-hooks.js');
  const eventNames = ['click', 'keydown', 'change', 'input', 'submit', 'blur', 'toggle'];
  const inlineEventPattern = new RegExp(`\\bon(?:${eventNames.join('|')})=["']`);
  console.log('=== Data Delegated Actions Tests ===');
  assert('data view controls renderer emits no inline event attributes', !inlineEventPattern.test(dataSrc));
  const authoredEventPattern = /\s(?:on[a-z][\w-]*|on:[a-z][\w-]*(?:\|[\w-]+)*)(?=\s|=|\/?>)|\{\s*on[a-z][\w-]*\s*\}/i;
  assert('header authored components emit no native or Svelte event attributes',
      !authoredEventPattern.test(headerRangeSrc) && !authoredEventPattern.test(headerDateSrc)
      && !authoredEventPattern.test(labDateRangeSrc) && !authoredEventPattern.test(chartLayersSrc));
  assert('data view controls import escapeAttr for delegated data attributes', /import\s*\{[^}]*\bescapeAttr\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(dataSrc));
  assert('data view callbacks use shell injection instead of bridge or window lookups', !dataSrc.includes("from './views-runtime-bridge.js'")
      && !dataSrc.includes('dataWindow')
      && dataSrc.includes('export function configureDataRuntimeDeps(deps = {})')
      && dataSrc.includes('dataRuntimeDeps.navigate?.(route, data);')
      && dataSrc.includes('dataRuntimeDeps.buildSidebar?.(data);')
      && dataSrc.includes('dataRuntimeDeps.showDetailModal?.(openId);')
      && dataFacadeSrc.includes("from './data-view-controls.js'")
      && /import\s*\{[^}]*\bconfigureDataRuntimeDeps\b[^}]*\}\s*from\s*['"]\.\/data\.js['"]/.test(appShellHooksSrc)
      && appShellHooksSrc.includes('configureDataRuntimeDeps({ buildSidebar, navigate, showDetailModal });'));
  assert('data action attribute helpers are exported', /export function dataActionAttrs\(action, attrs = \{\}\)/.test(dataSrc)
      && /export function dataChangeAttrs\(action, attrs = \{\}\)/.test(dataSrc)
      && dataSrc.includes('data-lab-data-action')
      && dataSrc.includes('data-lab-data-change'));
  assert('data delegates install idempotent click and change listeners', dataSrc.includes('const dataActionDelegateRoots = new WeakSet();')
      && dataSrc.includes("root.addEventListener('click', handleDataClick)")
      && dataSrc.includes("root.addEventListener('change', handleDataChange)")
      && dataSrc.includes('installDataActionDelegates();'));
  assert('date range buttons use delegated click actions', labDateRangeSrc.includes('data-lab-data-action="set-date-range"')
      && labDateRangeSrc.includes('data-lab-data-range={range.key}')
      && labDateRangeSrc.includes('type="button"')
      && dataSrc.includes('return renderLabRange({ view: projectLabDateRange(state.dateRangeFilter, showScope) });')
      && /import\s*\{[^}]*renderHTML\s+as\s+renderLabRange[^}]*\}\s*from\s*['"]\.\/components\/LabDateRange\.svelte\.html\.js['"]/.test(dataSrc)
      && dataSrc.includes("action === 'set-date-range'")
      && dataSrc.includes("setDateRange(actionEl.getAttribute(DATA_RANGE_ATTR) || 'all')"));
  assert('chart layers trigger and rows use delegated click actions', chartLayersSrc.includes('data-lab-data-action="toggle-chart-layers"')
      && chartLayersSrc.includes('data-lab-data-action="chart-layers-row"')
      && dataSrc.includes("action === 'toggle-chart-layers'")
      && dataSrc.includes("action === 'chart-layers-row'"));
  assert('chart layer authored renderer is actually wired', dataSrc.includes("from './chart-layers-presentation.js'")
      && dataSrc.includes('const view = projectChartLayersDropdown();')
      && dataSrc.includes('return view ? renderChartLayersPresentation({ hasNotes: !!view.notes, hasSupps: !!view.supplements, hasCycle: !!view.cycle }, () => view.notes?.checked ? \'on\' : \'off\', () => view.supplements?.checked ? \'on\' : \'off\', () => view.cycle?.checked ? \'on\' : \'off\') : \'\';')
      && dataSrc.includes('return projectChartLayers({ hasNotes, hasSupps, hasCycle }, () => state.noteOverlayMode, () => state.suppOverlayMode, () => state.phaseOverlayMode);')
      && chartLayersAdapter.includes("from './components/ChartLayersDropdown.svelte.html.js'")
      && chartLayersAdapter.includes('renderHTML({view})'));
  assert('chart layer row delegate preserves old propagation containment', dataSrc.includes('function containChartLayersClick(event)')
      && dataSrc.includes('event.stopImmediatePropagation')
      && dataSrc.includes('containChartLayersClick(event);'));
  assert('chart layer checkboxes use delegated change actions', chartLayersSrc.includes('data-lab-data-change="set-note-overlay"')
      && chartLayersSrc.includes('data-lab-data-change="set-supp-overlay"')
      && chartLayersSrc.includes('data-lab-data-change="set-phase-overlay"')
      && dataSrc.includes("setNoteOverlay(mode)")
      && dataSrc.includes("setSuppOverlay(mode)")
      && dataSrc.includes("setPhaseOverlay(mode)"));
  assert('range mode buttons keep data-range and use delegated actions', headerRangeSrc.includes('data-range={button.mode}')
      && headerRangeSrc.includes('data-lab-data-action="switch-range-mode"')
      && headerRangeSrc.includes('data-lab-data-range={button.mode}')
      && headerRangeSrc.includes('type="button"')
      && dataSrc.includes('renderHeaderRangeButtons(modes, () => state.rangeMode)')
      && headerAdapterSrc.includes('export function renderHeaderRangeButtons(')
      && /import\s*\{[^}]*renderHTML\s+as\s+renderRange[^}]*\}\s*from\s*['"]\.\/components\/HeaderRangeButtons\.svelte\.html\.js['"]/.test(headerAdapterSrc)
      && dataSrc.includes("action === 'switch-range-mode'")
      && /action === 'switch-range-mode'[\s\S]{0,220}switchRangeMode\(actionEl\.getAttribute\(DATA_RANGE_ATTR\) \|\| 'optimal'\);[\s\S]{0,60}return;/.test(dataSrc));
  console.log(`\nData delegated actions tests: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed`);

  expect(legacyAssertions.fail).toBe(0);
});
