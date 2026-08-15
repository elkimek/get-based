#!/usr/bin/env node
// Static Light Environment delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envSrc = fs.readFileSync(path.join(root, 'js/light-env.js'), 'utf8');
const screenSrc = fs.readFileSync(path.join(root, 'js/light-env-screen-ui.js'), 'utf8');
const actionSrc = fs.readFileSync(path.join(root, 'js/light-env-actions.js'), 'utf8');
const auditSrc = fs.readFileSync(path.join(root, 'js/light-env-audits.js'), 'utf8');
const appEventSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const appUiShellSrc = fs.readFileSync(path.join(root, 'js/app-ui-shell-modules.js'), 'utf8');
const appLightSunSrc = fs.readFileSync(path.join(root, 'js/app-light-sun-modules.js'), 'utf8');
const envShellHooksSrc = fs.readFileSync(path.join(root, 'js/light-env-shell-hooks.js'), 'utf8');
const lightSunLoaderSrc = fs.readFileSync(path.join(root, 'js/light-sun-loader.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'js/nav.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const envUiSrc = `${envSrc}\n${screenSrc}`;

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

console.log('=== Light Environment Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|change|input|submit|blur|toggle)=/g;
const directAssignmentRe = /\.(?:onclick|onchange|oninput|onkeydown)\s*=/;

assert('light environment UI has no inline event attributes',
  !inlineHandlerRe.test(envUiSrc));
assert('light-env-audits.js has no inline event attributes',
  !inlineHandlerRe.test(auditSrc));
assert('light environment UI avoids direct event property assignment',
  !directAssignmentRe.test(envUiSrc));
assert('light-env.js imports and installs the delegated action helper',
  envSrc.includes("from './light-env-actions.js'") &&
    envSrc.includes('installLightEnvActionDelegates({') &&
    envSrc.includes('lightEnvActionAttrs'));
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
    envShellHooksSrc.includes("import { navigate } from './views.js';") &&
    envShellHooksSrc.includes('configureLightEnvironmentLoaderDeps({ navigate });') &&
    envShellHooksSrc.includes('.then(module => module.openLightEnvironmentAssessment())') &&
    envShellHooksSrc.includes('loadLightSunUI()') &&
    appLightSunSrc.includes('configureLightEnv({ getMeasurementsForRoom, navigate });') &&
    lightSunLoaderSrc.includes('applyLightEnvironmentLoaderDeps(module);') &&
    !envSrc.includes('globalThis.navigate') &&
    appUiShellSrc.includes("import './light-env-shell-hooks.js';"));
assert('light-env screen renderer takes AI renderer from options instead of global lookup',
  screenSrc.includes('opts.renderScreenAIBlock') &&
    screenSrc.includes('renderScreenAIBlock(s)') &&
    !screenSrc.includes('globalThis.renderScreenAIBlock'));
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

[
  "lightEnvActionAttrs('set-room-source-archetype', { id: r.id, key: a.key })",
  "lightEnvActionAttrs('update-room-primary-source', { id: r.id })",
  "lightEnvActionAttrs('set-room-daylight-level', { id: r.id, key: level.key })",
  "lightEnvActionAttrs('set-room-hours-bucket', { id: r.id, key: b.key })",
  "lightEnvActionAttrs('update-room-hours', { id: r.id })",
  "lightEnvActionAttrs('set-room-evening-bucket', { id: r.id, key: b.key })",
  "lightEnvActionAttrs('set-today-active', { kind, id, active: flipTo })",
  "lightEnvActionAttrs('toggle-screen-expanded', { id: s.id })",
  "lightEnvActionAttrs('delete-screen-confirm', { id: s.id })",
  "lightEnvActionAttrs('set-screen-hours-bucket', { id: s.id, key: b.key })",
  "lightEnvActionAttrs('set-screen-evening-bucket', { id: s.id, key: b.key })",
  "lightEnvActionAttrs('update-screen-room', { id: s.id })",
  "lightEnvActionAttrs('update-screen-device', { id: s.id })",
  "lightEnvActionAttrs('update-screen-blue-blocker', { id: s.id })",
  "lightEnvActionAttrs('add-room-named', { name })",
  "lightEnvActionAttrs('add-room-custom')",
  "lightEnvActionAttrs('add-screen-with-device', { roomId, device })",
  "lightEnvActionAttrs('add-screen', { roomId })",
  "lightEnvActionAttrs('open-assessment')",
  "lightEnvActionAttrs('open-assessment-save-audit')",
  "lightEnvActionAttrs('close-assessment')",
  "lightEnvActionAttrs('toggle-room-expanded', { id: r.id })",
  "lightEnvActionAttrs('delete-room-confirm', { id: r.id })",
  "lightEnvActionAttrs('update-room-name', { id: r.id })",
  "lightEnvActionAttrs('open-tool', { id: r.id, tool: 'spectrum' })",
  "lightEnvActionAttrs('add-room')",
].forEach(renderedAction => {
  assert(`light environment UI renders ${renderedAction}`,
    envUiSrc.includes(renderedAction));
});

[
  "lightEnvActionAttrs('toggle-audit', { id: a.id })",
  "lightEnvActionAttrs('update-audit-field', { id: a.id, field: 'date' })",
  "lightEnvActionAttrs('update-audit-field', { id: a.id, field: 'label' })",
  "lightEnvActionAttrs('delete-audit-confirm', { id: a.id })",
  "lightEnvActionAttrs('interpret-audit-compare', { oldId: a1.id, newId: a2.id })",
  "lightEnvActionAttrs('toggle-audit-compare')",
  "lightEnvActionAttrs('set-audits-block-open')",
  "lightEnvActionAttrs('save-audit')",
  "lightEnvActionAttrs('toggle-audit-history')",
].forEach(renderedAction => {
  assert(`light-env-audits.js renders ${renderedAction}`,
    auditSrc.includes(renderedAction));
});

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

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
