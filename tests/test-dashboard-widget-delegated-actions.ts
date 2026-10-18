#!/usr/bin/env node
import {parse} from 'svelte/compiler';
import { readRepositorySource } from './helpers/repository-source.js';
import { sourceFunctionHasStatement } from './helpers/native-source-contracts.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static dashboard widget delegated-action source guards.

const controlsSrc = readRepositorySource('js/dashboard-widget-controls.js', 'utf8');
const actionBarSrc = readRepositorySource('js/components/DashboardActionBar.svelte', 'utf8');
const widgetFrameSrc = readRepositorySource('js/components/DashboardWidgetFrame.svelte', 'utf8');
const keyTrendsSrc = readRepositorySource('js/components/DashboardKeyTrends.svelte', 'utf8');
const alertsSrc = readRepositorySource('js/components/DashboardAlerts.svelte', 'utf8');
const pickerSrc = readRepositorySource('js/components/DashboardPickerPresentation.svelte', 'utf8');
const pickerModelSrc = readRepositorySource('js/dashboard-picker-presentation.js', 'utf8');
const runtimeSrc = readRepositorySource('js/dashboard-widget-runtime.js', 'utf8');
const compositionSrc = readRepositorySource('js/dashboard-view-composition.js', 'utf8');
const renderersSrc = readRepositorySource('js/dashboard-widget-renderers.js', 'utf8');
const labRenderersSrc = readRepositorySource('js/dashboard-lab-widget-renderers.js', 'utf8');
const allRendererSrc = `${renderersSrc}\n${labRenderersSrc}`;
const dashboardWidgetsCss = readRepositorySource('css/dashboard-widgets.css', 'utf8');
const biometricOverviewSrc = renderersSrc.slice(
  renderersSrc.indexOf('function projectDashboardBiometricSyncStatus'),
  renderersSrc.indexOf('function getDashboardGenomeImpact'),
);

const biometricPresentationSources = ['DashboardBiometricSyncStatus','DashboardBiometricTile','DashboardBiometricsOverview'].map(name=>readRepositorySource('js/components/'+name+'.svelte','utf8'));
const biometricPresentationSource=biometricPresentationSources.join('\n');
const notesPresentationSource=readRepositorySource('js/components/DashboardLabNotes.svelte','utf8');

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Dashboard Widget Delegated Actions ===');

assert('dashboard widget controls render no inline event attributes',
  !/\bon(?:click|input|dragstart|dragover|drop)=/.test(controlsSrc + pickerSrc));

/** Inspect authored Svelte attributes/directives; literal text and comments are not handlers. */
function hasAuthoredEventHandler(source: string): boolean {
  const root = parse(source, {modern: true});
  function visit(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(visit);
    const node = value as Record<string, unknown>;
    if (node.type === 'OnDirective') return true;
    if (node.type === 'Attribute' && typeof node.name === 'string' && /^on[a-z]/i.test(node.name)) return true;
    return Object.values(node).some(visit);
  }
  return visit(root.fragment);
}

assert('dashboard action bar authors no event-handler attributes or directives',
  !hasAuthoredEventHandler(actionBarSrc));
assert('authored event guard distinguishes text, comments and delegated data attributes',
  !hasAuthoredEventHandler('<button data-action="onclick">on:click</button><!-- onclick={handler} -->'));
[
  ['quoted handler with spaced assignment', 'onclick = "handler()"'],
  ['braced handler', 'onclick = {() => {}}'],
  ['legacy directive', 'on:click={handler}'],
  ['legacy directive modifier', 'on:click|preventDefault={handler}'],
  ['forwarded legacy event', 'on:click'],
].forEach(([label, attribute]) => {
  const changed = actionBarSrc.replace('type="button"', `type="button" ${attribute}`);
  assert(`authored event guard rejects ${label}`, changed !== actionBarSrc && hasAuthoredEventHandler(changed));
});

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
    sourceFunctionHasStatement(controlsSrc, 'dashboardWidgetActionAttrs', "return actionAttributes('dashboard-widget', action, attrs);") &&
    actionBarSrc.includes('data-dashboard-widget-action="toggle-organize"') &&
    actionBarSrc.includes('data-dashboard-widget-action="open-picker"') &&
    widgetFrameSrc.includes('data-dashboard-widget-action="move-widget"') && widgetFrameSrc.includes('data-dashboard-widget-direction="-1"') && widgetFrameSrc.includes('data-dashboard-widget-direction="1"') && controlsSrc.includes('projectDashboardWidgetFrame') &&
    widgetFrameSrc.includes('data-dashboard-widget-action="hide-widget"') && widgetFrameSrc.includes('data-dashboard-widget-id={view.tools.removeId ?? undefined}') &&
    pickerModelSrc.includes("action: 'show-widget'") &&
    pickerSrc.includes('data-dashboard-widget-action={option.action}') &&
    pickerSrc.includes('data-dashboard-widget-id={option.id}') &&
    controlsSrc.includes('renderDashboardPickerPresentation({'));
assert('dashboard widget controls render delegated picker inputs',
  controlsSrc.includes('function dashboardWidgetInputAttrs') &&
    controlsSrc.includes('data-dashboard-widget-input=') &&
    pickerSrc.includes('data-dashboard-widget-input="filter-biometric-picker"') &&
    pickerSrc.includes('data-dashboard-widget-input="filter-marker-picker"'));
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
assert('genuine biometric owners keep native delegated actions without authored event handlers', biometricPresentationSources.every(source=>!hasAuthoredEventHandler(source)));
assert('dashboard biometric overview renders delegated widget actions',
  biometricPresentationSources.every(source=>!hasAuthoredEventHandler(source)) &&
    biometricPresentationSource.includes('data-dashboard-widget-action="sync-biometric-now"') &&
    biometricPresentationSource.includes('data-dashboard-widget-action="remove-biometric-metric"') &&
    biometricPresentationSource.includes('data-dashboard-widget-action="open-biometric-manual-log"') &&
    biometricPresentationSource.includes('data-dashboard-widget-action="open-biometric-detail"') &&
    biometricPresentationSource.includes('data-dashboard-widget-action="open-biometric-picker"'));
assert('dashboard renderer body actions use the shared dashboard delegate contract',
  keyTrendsSrc.includes('data-dashboard-widget-action="open-marker-detail"') && keyTrendsSrc.includes('data-dashboard-widget-id={row.id}') &&
    alertsSrc.includes('data-dashboard-widget-action="navigate"') && alertsSrc.includes('data-dashboard-widget-route={flag.route ?? undefined}') &&
    notesPresentationSource.includes('data-dashboard-widget-action="open-note-editor"') &&
    notesPresentationSource.includes('data-dashboard-widget-action="delete-note"'));
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

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
