#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static wearables delegated-action source guards.

const stripSrc = readRepositorySource('js/wearables.js', 'utf8');
const stripBodySrc = readRepositorySource('js/components/WearableStripBody.svelte');
const metricCardSrc = readRepositorySource('js/components/WearableMetricCard.svelte');
const emptyCardSrc = readRepositorySource('js/components/WearableEmptyCard.svelte');
const detailChromeSrc = readRepositorySource('js/components/WearableDetailChrome.svelte');
const entriesSrc = readRepositorySource('js/components/WearableManualEntries.svelte');
const stripActionsSrc = readRepositorySource('js/wearables-strip-actions.js', 'utf8');
const detailModalSrc = readRepositorySource('js/wearables-detail-modal.js', 'utf8');
const manualDetailSrc = readRepositorySource('js/wearables-manual-detail.js', 'utf8');
const detailSrc = `${detailModalSrc}\n${manualDetailSrc}`;
const manualPresentationSrc = readRepositorySource('js/components/WearableManualLog.svelte', 'utf8');
const pickerPresentationSrc = readRepositorySource('js/components/WearableSourcePicker.svelte', 'utf8');
const settingsPanelSrc = readRepositorySource('js/wearables-settings-panel.js', 'utf8');
const settingsComponentSrc = readRepositorySource('js/wearables-settings-component.js', 'utf8');
const settingsViewSrc = readRepositorySource('js/wearables-settings-view.js', 'utf8');
const settingsPresentationSrc = readRepositorySource('js/components/WearablesSettings.svelte', 'utf8');
const stripImportsSharedActionHelper = /import\s*{[^}]*\bwearableActionAttrs\b[^}]*}\s*from\s+'\.\/wearables-detail-modal\.js';/s.test(stripSrc);
const stripActionsImportSharedActionHelper = /import\s*{[^}]*\bwearableActionAttrs\b[^}]*}\s*from\s+'\.\/wearables-detail-modal\.js';/s.test(stripActionsSrc);

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Wearables Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

assert('wearables strip renders no inline event attributes',
  !inlineHandlerRe.test(stripSrc) && !inlineHandlerRe.test(stripActionsSrc) &&
    !inlineHandlerRe.test(manualPresentationSrc) && !inlineHandlerRe.test(pickerPresentationSrc));
assert('wearables detail modal renders no inline event attributes',
  !inlineHandlerRe.test(detailSrc) && !inlineHandlerRe.test(manualPresentationSrc));
assert('wearables settings panel renders no inline event attributes',
  !inlineHandlerRe.test(settingsPanelSrc));
assert('wearables strip renders delegated action attributes',
  stripImportsSharedActionHelper &&
    stripActionsImportSharedActionHelper &&
    emptyCardSrc.includes("'data-wearable-action':'open-manual-log'") && emptyCardSrc.includes("'data-wearable-metric':view.metric") &&
    metricCardSrc.includes("'data-wearable-action':'open-detail'") && metricCardSrc.includes("'data-wearable-metric':view.metric") &&
    stripBodySrc.includes('data-wearable-action="move-card"') && stripBodySrc.includes('data-wearable-metric={item.metric}') &&
    stripActionsSrc.includes("wearableActionAttrs('manual-log-save'"));
assert('wearables detail modal renders delegated action and form attributes',
  detailModalSrc.includes('export function wearableActionAttrs') &&
    manualDetailSrc.includes('function formAttrs') &&
    manualDetailSrc.includes('data-wearable-action=') &&
    manualDetailSrc.includes('data-wearable-form="detail-manual-add"') &&
    detailChromeSrc.includes('data-wearable-action="set-detail-range"') && detailChromeSrc.includes('data-wearable-range={range.range}') && detailModalSrc.includes('ranges,') &&
    entriesSrc.includes('data-wearable-action="delete-detail-manual-entry"') && entriesSrc.includes('data-wearable-date={entry.deleteDate}') && detailModalSrc.includes('projectManualEntriesSection') &&
    manualDetailSrc.includes('formAttrs(metricId, kind)') && manualPresentationSrc.includes('class="wearable-manual-add-form" {...view.form}'));
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
    stripSrc.includes("document.addEventListener('submit', handleWearableFormSubmit, true)") &&
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
  settingsPanelSrc.includes("from './wearables-settings-component.js'") &&
    settingsPanelSrc.includes('mountWearablesSettings(section, buildWearablesSettingsSnapshot(getActiveProfileId(), isWearableStripHidden()))') &&
    settingsComponentSrc.includes("from './components/WearablesSettings.svelte.native.js'") &&
    settingsComponentSrc.includes('mount(WearablesSettings, { target: host, props: { initial } })') &&
    settingsViewSrc.includes('return { action, label, adapter, tone };') &&
    settingsViewSrc.includes("action('manual-dashboard', 'Open dashboard')") &&
    settingsViewSrc.includes("action('sync-now', 'Update now', adapter.id)") &&
    settingsPresentationSrc.includes('data-wearable-settings-action={item.action}') &&
    settingsPresentationSrc.includes('data-wearable-settings-adapter={item.adapter}') &&
    settingsPresentationSrc.includes('data-wearable-settings-stop-propagation="true"') &&
    settingsPresentationSrc.includes('<input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" hidden data-wearable-settings-input="apple-health-file">'));

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
    stripBodySrc.includes('data-wearable-action="move-card"') && metricCardSrc.includes("view.interactive?{'data-wearable-action':'open-detail'") && stripBodySrc.includes('disabled={!item.canLeft}') && stripBodySrc.includes('disabled={!item.canRight}'));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
