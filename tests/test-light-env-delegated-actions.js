#!/usr/bin/env node
// Static Light Environment delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envSrc = fs.readFileSync(path.join(root, 'js/light-env.js'), 'utf8');
const actionSrc = fs.readFileSync(path.join(root, 'js/light-env-actions.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

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

const inlineHandlerRe = /\bon(?:click|keydown|change|input|submit)=/g;
const directAssignmentRe = /\.(?:onclick|onchange|oninput|onkeydown)\s*=/;

assert('light-env.js has no inline event attributes',
  !inlineHandlerRe.test(envSrc));
assert('light-env.js avoids direct event property assignment',
  !directAssignmentRe.test(envSrc));
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
assert('light-env-actions installs idempotent click, keyboard, change, and input delegates',
  actionSrc.includes('const lightEnvActionDelegateRoots = new WeakSet();') &&
    actionSrc.includes("root.addEventListener('click', event => handleLightEnvCapturedClick(event, actions), true)") &&
    actionSrc.includes("root.addEventListener('click', event => handleLightEnvClick(event, actions))") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleLightEnvCapturedKeydown(event, actions), true)") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleLightEnvKeydown(event, actions))") &&
    actionSrc.includes("root.addEventListener('change', event => handleLightEnvChange(event, actions))") &&
    actionSrc.includes("root.addEventListener('input', event => handleLightEnvInput(event, actions))"));
assert('light-env-actions preserves old stop-propagation semantics in capture phase',
  actionSrc.includes('const PROPAGATION_STOPPING_CLICK_ACTIONS = new Set') &&
    actionSrc.includes("'set-today-active'") &&
    actionSrc.includes("'delete-screen-confirm'") &&
    actionSrc.includes("'delete-room-confirm'") &&
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
assert('light-env form delegates separate live input from change-only controls',
  actionSrc.includes("'update-room-hours', 'update-room-name'") &&
    actionSrc.includes("'update-screen-blue-blocker'"));
assert('light-env.js captures saveLightAuditFromUI when installing delegates',
  envSrc.includes("const saveLightAuditFromUI = typeof globalThis.saveLightAuditFromUI === 'function'") &&
    envSrc.includes('saveLightAuditFromUI,') &&
    !envSrc.includes('saveLightAuditFromUI: () => globalThis.saveLightAuditFromUI?.()'));
assert('service worker precaches light-env-actions.js',
  swSrc.includes("'/js/light-env-actions.js'"));

[
  'set-room-source-archetype',
  'update-room-primary-source',
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
].forEach(action => {
  assert(`light environment action ${action} is handled`,
    actionSrc.includes(`action === '${action}'`));
});

[
  "lightEnvActionAttrs('set-room-source-archetype', { id: r.id, key: a.key })",
  "lightEnvActionAttrs('update-room-primary-source', { id: r.id })",
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
  assert(`light-env.js renders ${renderedAction}`,
    envSrc.includes(renderedAction));
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
  assert(`light-env.js has no inline handler ${fnName} call`,
    !envSrc.includes(`onclick="${fnName}`) &&
      !envSrc.includes(`onclick="window.${fnName}`) &&
      !envSrc.includes(`onchange="window.${fnName}`) &&
      !envSrc.includes(`oninput="window.${fnName}`));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
