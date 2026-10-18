#!/usr/bin/env node
import { readRepositorySource, readAuthoredRepositorySource } from './helpers/repository-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static Light Environment delegated-action source guards.

const envSrc = readRepositorySource('js/light-env.js', 'utf8');
const screenSrc = readRepositorySource('js/light-env-screen-ui.js', 'utf8');
const actionSrc = readAuthoredRepositorySource('js/light-env-actions.js', 'utf8').replace(/\bactionEl!/g, 'actionEl').replace(/\bevent as KeyboardEvent\b/g, 'event').replace('(event.currentTarget as ActionRoot).contains!', 'event.currentTarget.contains').replace('(event.target as ActionTarget | null)', 'event.target');
const auditSrc = readRepositorySource('js/light-env-audits.js', 'utf8');
const appEventSrc = readRepositorySource('js/app-event-listeners.js', 'utf8');
const appUiShellSrc = readRepositorySource('js/app-ui-shell-modules.js', 'utf8');
const appLightSunSrc = readRepositorySource('js/app-light-sun-modules.js', 'utf8');
const envShellHooksSrc = readRepositorySource('js/light-env-shell-hooks.js', 'utf8');
const lightSunLoaderSrc = readRepositorySource('js/light-sun-loader.js', 'utf8');
const navSrc = readRepositorySource('js/nav.js', 'utf8');
const swSrc = readServiceWorkerSource(relative => readRepositorySource(relative, 'utf8'));
const authored = (name: string) => readAuthoredRepositorySource(`js/components/${name}.svelte`, 'utf8');
const roomSource = authored('LightEnvironmentRoom');
const screenSource = authored('LightEnvironmentScreen');
const pickerSource = authored('LightEnvironmentPicker');
const quickSource = authored('LightEnvironmentQuickPicks');
const todaySource = authored('LightEnvironmentTodayToggle');
const summarySource = authored('LightEnvironmentSummary');
const sectionSource = authored('LightEnvironmentSection');
const modalSource = authored('LightEnvironmentPresentation');
const auditCardSource = authored('LightAuditCard');
const auditDetailSource = authored('LightAuditDetail');
const auditBlockSource = authored('LightAuditBlock');
const auditCompareSource = authored('LightAuditCompare');
const roomProjection = readAuthoredRepositorySource('js/light-environment-room-presentation.ts', 'utf8');
const envUiSrc = [envSrc, screenSrc, roomSource, screenSource, pickerSource, quickSource, todaySource, summarySource, sectionSource, modalSource].join('\n');
const auditUiSrc = [auditSrc, auditCardSource, auditDetailSource, auditBlockSource, auditCompareSource].join('\n');

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Light Environment Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|change|input|submit|blur|toggle)=/g;
const directAssignmentRe = /\.(?:onclick|onchange|oninput|onkeydown)\s*=/;

assert('light environment UI has no inline event attributes',
  !inlineHandlerRe.test(envUiSrc));
assert('light-env-audits.js has no inline event attributes',
  !inlineHandlerRe.test(auditUiSrc));
assert('light environment UI avoids direct event property assignment',
  !directAssignmentRe.test(envUiSrc));
assert('light-env.js imports and installs the delegated action helper',
  envSrc.includes("from './light-env-actions.js'") &&
    envSrc.includes('installLightEnvActionDelegates({') &&
    envSrc.includes("from './components/LightEnvironmentPresentation.svelte.html.js'") && sectionSource.includes('<LightAuditBlock view={view.audits}/>'));
assert('light-env-actions defines one shared action attribute helper',
  (actionSrc.match(/\bfunction\s+lightEnvActionAttrs\b/g) || []).length === 1 &&
    actionSrc.includes('data-light-env-action=') &&
    actionSrc.includes('data-light-env-${escapeAttr(dataAttrName(name))}=') &&
    actionSrc.includes("replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)") &&
    actionSrc.includes('Boolean false means "absent but false"') &&
    actionSrc.includes("value !== false"));
assert('light-env-actions installs idempotent click, keyboard, change, input, and toggle delegates',
  actionSrc.includes('const lightEnvActionDelegateRoots = new WeakSet();') &&
    actionSrc.includes("root.addEventListener('click', event => handleLightEnvCapturedClick(event, actions), true)") &&
    actionSrc.includes("root.addEventListener('click', event => handleLightEnvClick(event, actions))") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleLightEnvCapturedKeydown(event, actions), true)") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleLightEnvKeydown(event, actions))") &&
    actionSrc.includes("root.addEventListener('change', event => handleLightEnvChange(event, actions))") &&
    actionSrc.includes("root.addEventListener('input', event => handleLightEnvInput(event, actions))") &&
    actionSrc.includes("root.addEventListener('toggle', event => handleLightEnvToggle(event, actions), true)"));
assert('light-env-actions preserves old stop-propagation semantics in capture phase',
  actionSrc.includes('const PROPAGATION_STOPPING_CLICK_ACTIONS = new Set') &&
    actionSrc.includes("'set-today-active'") &&
    actionSrc.includes("'delete-screen-confirm'") &&
    actionSrc.includes("'delete-room-confirm'") &&
    actionSrc.includes("'toggle-audit-compare'") &&
    actionSrc.includes("'save-audit'") &&
    actionSrc.includes("'toggle-audit-history'") &&
    actionSrc.includes('function handleLightEnvCapturedClick') &&
    actionSrc.includes('if (!PROPAGATION_STOPPING_CLICK_ACTIONS.has(actionName(actionEl))) return;') &&
    actionSrc.includes('if (PROPAGATION_STOPPING_CLICK_ACTIONS.has(actionName(actionEl))) return;') &&
    actionSrc.includes('function handleLightEnvCapturedKeydown') &&
    actionSrc.includes('PROPAGATION_STOPPING_KEYDOWN_ACTIONS.has(actionName(actionEl))'));
assert('light-env delegated actions are scoped to the installed root',
  actionSrc.includes("event.currentTarget.contains(actionEl)"));
assert('light-env keyboard delegate supports role-button rows and ignores form controls',
  actionSrc.includes("event.target?.closest?.('button, a, input, textarea, select')") &&
    actionSrc.includes("actionEl.getAttribute('role') === 'button'"));
assert('light-env click delegate ignores toggle-only details actions',
  actionSrc.includes('const NON_CLICK_ACTIONS = new Set') &&
    actionSrc.includes("'set-audits-block-open'") &&
    actionSrc.includes('!NON_CLICK_ACTIONS.has(actionName(actionEl))'));
assert('light-env internal action handlers are registered through module object, not window facade',
  envSrc.includes('export const lightEnvActionHandlers = Object.freeze({') &&
    envSrc.includes('...lightEnvActionHandlers,') &&
    envSrc.includes('...lightEnvAuditActionHandlers') &&
    actionSrc.includes('actions.saveLightAuditFromUI?.()') &&
    !envSrc.includes('Object.assign(window, {') &&
    !envSrc.includes('getLightEnvironment: getEnvironment') &&
    !envSrc.includes('renderEnvironmentSection,') &&
    !envSrc.includes('renderEnvironmentAssessmentSummary,') &&
    !envSrc.includes('isLightEnvActiveToday: isActiveToday'));
assert('Light environment modal shell actions are wired through startup hooks',
  navSrc.includes('export function configureNavActions') &&
    navSrc.includes('navActionDeps.openLightEnvironmentAssessment()') &&
    navSrc.includes("typeof value === 'function'") &&
    !navSrc.includes('window.openLightEnvironmentAssessment') &&
    appEventSrc.includes('export function configureAppEventListeners') &&
    appEventSrc.includes('appEventListenerDeps.closeLightEnvironmentAssessment()') &&
    appEventSrc.includes("typeof value === 'function'") &&
    !appEventSrc.includes('window.closeLightEnvironmentAssessment') &&
    envShellHooksSrc.includes("import { configureNavActions } from './nav.js';") &&
    envShellHooksSrc.includes("import { configureAppEventListeners } from './app-event-listeners.js';") &&
    !envShellHooksSrc.includes("from './light-env.js'") &&
    envShellHooksSrc.includes('configureLightEnvironmentLoaderDeps,') &&
    envShellHooksSrc.includes('loadLightSunUI,') &&
    !envShellHooksSrc.includes("from './light-tools.js'") &&
    envShellHooksSrc.includes("import { closeModalOverlay } from './modal-lifecycle.js';") &&
    envShellHooksSrc.includes("import { navigate } from './views-runtime.js';") &&
    envShellHooksSrc.includes('configureLightEnvironmentLoaderDeps({ navigate });') &&
    envShellHooksSrc.includes('.then(module => module.openLightEnvironmentAssessment())') &&
    envShellHooksSrc.includes('loadLightSunUI()') &&
    appLightSunSrc.includes('configureLightEnv({ getMeasurementsForRoom, navigate });') &&
    lightSunLoaderSrc.includes('applyLightEnvironmentLoaderDeps(module);') &&
    !envSrc.includes('globalThis.navigate') &&
    appUiShellSrc.includes("import './light-env-shell-hooks.js';"));
assert('light-env screen renderer takes AI renderer from options instead of global lookup',
  screenSrc.includes('opts.getScreenAIView') &&
    (screenSrc.includes('(opts.getScreenAIView as ScreenAIReader)(screen)') || screenSrc.includes('opts.getScreenAIView(screen)')) &&
    !screenSrc.includes('globalThis.renderScreenAIBlock') && !screenSrc.includes('globalThis.getScreenAIView'));
assert('light-env form delegates separate live input from change-only controls',
  actionSrc.includes("'update-room-hours', 'update-room-name'") &&
    actionSrc.includes("'update-screen-blue-blocker'") &&
    actionSrc.includes("'update-audit-field'"));
assert('light-env audit callbacks install from module handlers instead of global capture',
  auditSrc.includes('export const lightEnvAuditActionHandlers = Object.freeze({') &&
    envSrc.includes("import {") &&
    envSrc.includes('lightEnvAuditActionHandlers') &&
    envSrc.includes('...lightEnvAuditActionHandlers') &&
    !envSrc.includes('globalThis.saveLightAuditFromUI') &&
    !envSrc.includes('globalThis.toggleLightAudit') &&
    !envSrc.includes('globalThis.updateLightAuditField') &&
    !auditSrc.includes('window.openChatPanel'));
assert('service worker precaches light environment action/render modules',
  swSrc.includes("'/js/light-env-actions.js'") &&
    swSrc.includes("'/js/light-env-shell-hooks.js'") &&
    swSrc.includes("'/js/light-env-screen-ui.js'"));

[
  'set-room-source-archetype',
  'update-room-primary-source',
  'set-room-daylight-level',
  'set-room-hours-bucket',
  'update-room-hours',
  'set-room-evening-bucket',
  'set-today-active',
  'toggle-screen-expanded',
  'delete-screen-confirm',
  'set-screen-hours-bucket',
  'set-screen-evening-bucket',
  'update-screen-room',
  'update-screen-device',
  'update-screen-blue-blocker',
  'add-room-named',
  'add-room-custom',
  'add-screen-with-device',
  'add-screen',
  'open-assessment',
  'open-assessment-save-audit',
  'close-assessment',
  'toggle-room-expanded',
  'delete-room-confirm',
  'update-room-name',
  'open-tool',
  'add-room',
  'toggle-audit',
  'update-audit-field',
  'delete-audit-confirm',
  'interpret-audit-compare',
  'toggle-audit-compare',
  'save-audit',
  'toggle-audit-history',
].forEach(action => {
  assert(`light environment action ${action} is handled`,
    actionSrc.includes(`action === '${action}'`));
});

// Authored render contracts: action identity and every action-specific datum.
assert("authored environment renders set-room-source-archetype with its required bindings",
  roomProjection.includes("action:'set-room-source-archetype'") &&
  pickerSource.includes("data-light-env-action={view.action}") &&
  pickerSource.includes("data-light-env-id={view.id}") &&
  pickerSource.includes("data-light-env-key={choice.key}"));
assert("authored environment renders set-room-daylight-level with its required bindings",
  roomProjection.includes("action:'set-room-daylight-level'") &&
  pickerSource.includes("data-light-env-action={view.action}") &&
  pickerSource.includes("data-light-env-id={view.id}") &&
  pickerSource.includes("data-light-env-key={choice.key}"));
assert("authored environment renders set-room-hours-bucket with its required bindings",
  roomProjection.includes("action:'set-room-hours-bucket'") &&
  pickerSource.includes("data-light-env-action={view.action}") &&
  pickerSource.includes("data-light-env-id={view.id}") &&
  pickerSource.includes("data-light-env-key={choice.key}"));
assert("authored environment renders set-room-evening-bucket with its required bindings",
  roomProjection.includes("action:'set-room-evening-bucket'") &&
  pickerSource.includes("data-light-env-action={view.action}") &&
  pickerSource.includes("data-light-env-id={view.id}") &&
  pickerSource.includes("data-light-env-key={choice.key}"));
assert("authored environment renders update-room-primary-source with its required bindings",
  pickerSource.includes("data-light-env-action=\"update-room-primary-source\"") &&
  pickerSource.includes("data-light-env-id={view.id}"));
assert("authored environment renders update-room-hours with its required bindings",
  pickerSource.includes("data-light-env-action=\"update-room-hours\"") &&
  pickerSource.includes("data-light-env-id={view.id}"));
assert("authored environment renders set-today-active with its required bindings",
  todaySource.includes("data-light-env-action=\"set-today-active\"") &&
  todaySource.includes("data-light-env-kind={view.kind}") &&
  todaySource.includes("data-light-env-id={view.id}") &&
  todaySource.includes("data-light-env-active={view.active ? 'false' : 'true'}"));
assert("authored environment renders toggle-screen-expanded with its required bindings",
  screenSource.includes("data-light-env-action=\"toggle-screen-expanded\"") &&
  screenSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders delete-screen-confirm with its required bindings",
  screenSource.includes("data-light-env-action=\"delete-screen-confirm\"") &&
  screenSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders update-screen-room with its required bindings",
  screenSource.includes("data-light-env-action=\"update-screen-room\"") &&
  screenSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders update-screen-device with its required bindings",
  screenSource.includes("data-light-env-action=\"update-screen-device\"") &&
  screenSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders update-screen-blue-blocker with its required bindings",
  screenSource.includes("data-light-env-action=\"update-screen-blue-blocker\"") &&
  screenSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders set-screen-hours-bucket with its required bindings",
  screenSource.includes("action: 'set-screen-hours-bucket'") &&
  screenSource.includes("data-light-env-action={picker.action}") &&
  screenSource.includes("data-light-env-id={view.actionId}") &&
  screenSource.includes("data-light-env-key={bucket.key}"));
assert("authored environment renders set-screen-evening-bucket with its required bindings",
  screenSource.includes("action: 'set-screen-evening-bucket'") &&
  screenSource.includes("data-light-env-action={picker.action}") &&
  screenSource.includes("data-light-env-id={view.actionId}") &&
  screenSource.includes("data-light-env-key={bucket.key}"));
assert("authored environment renders add-room-named with its required bindings",
  quickSource.includes("'add-room-named'") &&
  quickSource.includes("data-light-env-room-id={view.roomId}") &&
  quickSource.includes("data-light-env-name={choice.name}"));
assert("authored environment renders add-room-custom with its required bindings",
  quickSource.includes("'add-room-custom'") &&
  quickSource.includes("data-light-env-room-id={view.roomId}"));
assert("authored environment renders add-screen-with-device with its required bindings",
  quickSource.includes("'add-screen-with-device'") &&
  quickSource.includes("data-light-env-room-id={view.roomId}") &&
  quickSource.includes("data-light-env-device={choice.device}"));
assert("authored environment renders add-screen with its required bindings",
  quickSource.includes("'add-screen'") &&
  quickSource.includes("data-light-env-room-id={view.roomId}"));
assert("authored environment renders open-assessment with its required bindings",
  summarySource.includes("data-light-env-action=\"open-assessment\""));
assert("authored environment renders open-assessment-save-audit with its required bindings",
  summarySource.includes("data-light-env-action=\"open-assessment-save-audit\""));
assert("authored environment renders close-assessment with its required bindings",
  modalSource.includes("data-light-env-action=\"close-assessment\""));
assert("authored environment renders toggle-room-expanded with its required bindings",
  roomSource.includes("data-light-env-action=\"toggle-room-expanded\"") &&
  roomSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders delete-room-confirm with its required bindings",
  roomSource.includes("data-light-env-action=\"delete-room-confirm\"") &&
  roomSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders update-room-name with its required bindings",
  roomSource.includes("data-light-env-action=\"update-room-name\"") &&
  roomSource.includes("data-light-env-id={view.actionId}"));
assert("authored environment renders open-tool with its required bindings",
  roomSource.includes("data-light-env-action=\"open-tool\"") &&
  roomSource.includes("data-light-env-id={view.actionId}") &&
  roomSource.includes("data-light-env-tool={tool.key}"));
assert("authored environment renders add-room with its required bindings",
  sectionSource.includes("data-light-env-action=\"add-room\""));
assert("authored audit renders toggle-audit with its required bindings",
  auditCardSource.includes("data-light-env-action=\"toggle-audit\"") &&
  auditCardSource.includes("data-light-env-id={view.actionId}"));
assert("authored audit renders update-audit-field/date with its required bindings",
  auditDetailSource.includes("data-light-env-action=\"update-audit-field\"") &&
  auditDetailSource.includes("data-light-env-id={actionId}") &&
  auditDetailSource.includes("data-light-env-field=\"date\""));
assert("authored audit renders update-audit-field/label with its required bindings",
  auditDetailSource.includes("data-light-env-action=\"update-audit-field\"") &&
  auditDetailSource.includes("data-light-env-id={actionId}") &&
  auditDetailSource.includes("data-light-env-field=\"label\""));
assert("authored audit renders delete-audit-confirm with its required bindings",
  auditDetailSource.includes("data-light-env-action=\"delete-audit-confirm\"") &&
  auditDetailSource.includes("data-light-env-id={actionId}"));
assert("authored audit renders interpret-audit-compare with its required bindings",
  auditCompareSource.includes("data-light-env-action=\"interpret-audit-compare\"") &&
  auditCompareSource.includes("data-light-env-old-id={view.oldId}") &&
  auditCompareSource.includes("data-light-env-new-id={view.newId}"));
assert("authored audit renders toggle-audit-compare with its required bindings",
  auditBlockSource.includes("data-light-env-action=\"toggle-audit-compare\""));
assert("authored audit renders toggle-audits-block with its required bindings",
  auditBlockSource.includes("data-light-env-action=\"toggle-audits-block\"") &&
  auditBlockSource.includes("aria-expanded={view.open}"));
assert("authored audit renders save-audit with its required bindings",
  auditBlockSource.includes("data-light-env-action=\"save-audit\""));
assert("authored audit renders toggle-audit-history with its required bindings",
  auditBlockSource.includes("data-light-env-action=\"toggle-audit-history\""));
assert('native block action and legacy details action both remain supported',
  actionSrc.includes("action === 'toggle-audits-block'") &&
  actionSrc.includes('actions.toggleLightAuditsBlock?.(event)') &&
  actionSrc.includes('actions.setLightAuditsBlockOpen?.(!!actionEl.open)'));

[
  'setLightEnvRoomSourceArchetype',
  'updateLightEnvRoomAndRender',
  'setLightEnvRoomHoursBucket',
  'updateLightEnvRoom',
  'setLightEnvRoomEveningBucket',
  'setLightEnvTodayActive',
  'toggleLightEnvScreenExpanded',
  'deleteLightEnvScreenConfirm',
  'addLightEnvRoomNamed',
  'addLightEnvScreenWithDevice',
  'openLightEnvironmentAssessment',
  'closeLightEnvironmentAssessment',
  'openLightEnvTool',
].forEach(fnName => {
  assert(`light environment UI has no inline handler ${fnName} call`,
    !envUiSrc.includes(`onclick="${fnName}`) &&
      !envUiSrc.includes(`onclick="window.${fnName}`) &&
      !envUiSrc.includes(`onchange="window.${fnName}`) &&
      !envUiSrc.includes(`oninput="window.${fnName}`));
});

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
