#!/usr/bin/env node
// Static sun-session UI delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(root, 'js/sun-session-ui.js'), 'utf8');
const actionSrc = fs.readFileSync(path.join(root, 'js/sun-session-actions.js'), 'utf8');
const sunSrc = fs.readFileSync(path.join(root, 'js/sun.js'), 'utf8');
const sunAiSrc = fs.readFileSync(path.join(root, 'js/sun-ai-analysis.js'), 'utf8');
const aiHookSrc = fs.readFileSync(path.join(root, 'js/sun-session-ai-render-hooks.js'), 'utf8');
const uiHookSrc = fs.readFileSync(path.join(root, 'js/sun-session-ui-hooks.js'), 'utf8');
const lightSunAiHooksSrc = fs.readFileSync(path.join(root, 'js/light-sun-ai-hooks.js'), 'utf8');
const appLightSunSrc = fs.readFileSync(path.join(root, 'js/app-light-sun-modules.js'), 'utf8');
const appUiShellSrc = fs.readFileSync(path.join(root, 'js/app-ui-shell-modules.js'), 'utf8');
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

console.log('=== Sun Session UI Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

assert('sun-session-ui renders no inline event attributes',
  !inlineHandlerRe.test(uiSrc));
assert('sun-session-actions defines one shared action attribute helper',
  (actionSrc.match(/\bfunction\s+sunSessionActionAttrs\b/g) || []).length === 1 &&
    actionSrc.includes('data-sun-session-action=') &&
    actionSrc.includes('data-sun-session-${escapeAttr(dataAttrName(name))}=') &&
    actionSrc.includes("replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)") &&
    actionSrc.includes("value !== false"));
assert('sun-session-ui imports and installs idempotent action delegates',
  uiSrc.includes("from './sun-session-actions.js'") &&
    uiSrc.includes('const sunSessionDelegateActions = {') &&
    uiSrc.includes('installSunSessionActionDelegates(sunSessionDelegateActions)') &&
    actionSrc.includes('const sunSessionActionDelegateRoots = new WeakSet();') &&
    actionSrc.includes("root.addEventListener('click', event => handleSunSessionClick(event, actions))") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleSunSessionKeydown(event, actions))"));
assert('sun-session-actions scopes delegated actions to the installed root',
  actionSrc.includes('event.currentTarget?.contains(actionEl)'));
assert('sun-session-actions keyboard delegate supports role-button rows and ignores form controls',
  actionSrc.includes('const SUN_SESSION_KEYBOARD_ACTIONS = new Set') &&
    actionSrc.includes("'open-detail'") &&
    actionSrc.includes("'forgot-stop'") &&
    actionSrc.includes("'open-channel'") &&
    actionSrc.includes("event.target?.closest?.('button, a, input, textarea, select')"));
assert('sun-session-actions expands chips via the owning chips container',
  actionSrc.includes("const container = actionEl.closest('.sun-channel-chips')") &&
    actionSrc.includes('setSunChannelChipsExpanded(container, !container.classList.contains(\'sun-chips-expanded\'))') &&
    !actionSrc.includes("actionEl.parentElement?.classList.toggle('sun-chips-expanded')"));
assert('sun-session-actions closes overlays through the shared lifecycle removal helper',
  actionSrc.includes("import { removeModalOverlay } from './modal-lifecycle.js';") &&
    actionSrc.includes('removeModalOverlay(overlay)') &&
    !actionSrc.includes("closest('.modal-overlay')?.remove()"));
assert('sun-session-actions routes active controls through injected actions',
  !actionSrc.includes('window.') &&
    actionSrc.includes('actions.quickLogSunSession') &&
    actionSrc.includes('actions.pauseSunSession') &&
    actionSrc.includes('actions.resumeSunSession') &&
    actionSrc.includes('actions.flipSidesMidSession') &&
    actionSrc.includes('actions.changeCoverageMidSession') &&
    actionSrc.includes('actions.applySunscreenMidSession') &&
    actionSrc.includes('actions.setOzoneOverrideMidSession') &&
    actionSrc.includes('actions.forgotStopPrompt') &&
    actionSrc.includes('actions.openChannelOnLightPage'));
assert('sun-session-ui direct module actions no longer route through window globals',
  !uiSrc.includes('window.openSunSessionDetail') &&
    !uiSrc.includes('window.deleteSunSession') &&
    !uiSrc.includes('window.editSunSessionDuration') &&
    !uiSrc.includes('window.renderSessionAIInline') &&
    !uiSrc.includes('window.renderSessionAIDetail') &&
    !uiSrc.includes('window.navigate'));
assert('sun-session-ui runtime render and navigate callbacks are startup-wired',
  uiSrc.includes('renderSessionAIDetail: () =>') &&
    uiSrc.includes('navigate: () =>') &&
    !uiSrc.includes('uiDeps.renderSessionAIInline(sess)') &&
    uiSrc.includes('uiDeps.renderSessionAIDetail(sess)') &&
    uiSrc.includes('function refreshLightView()') &&
    sunAiSrc.includes('registerAIActionHandler') &&
    !sunAiSrc.includes('Object.assign(window, {') &&
    !sunAiSrc.includes('window.refreshSessionAIAnalysis') &&
    !sunAiSrc.includes('window.analyzeSunSessionAI') &&
    !sunAiSrc.includes('window.maybeAnalyzeSessionAfterFinish') &&
    !sunAiSrc.includes('window.renderSessionAIInline') &&
    !sunAiSrc.includes('window.renderSessionAIDetail') &&
    aiHookSrc.includes("import { renderSessionAIDetail } from './sun-ai-analysis.js';") &&
    aiHookSrc.includes('configureSunSessionUI({ renderSessionAIDetail })') &&
    lightSunAiHooksSrc.includes("import { maybeAnalyzeSessionAfterFinish } from './sun-ai-analysis.js';") &&
    lightSunAiHooksSrc.includes('configureSunSessionsStore({ maybeAnalyzeSessionAfterFinish })') &&
    uiHookSrc.includes("import { navigate } from './views.js';") &&
    uiHookSrc.includes('configureSunSessionUI({ navigate })') &&
    appLightSunSrc.includes("import './sun-session-ai-render-hooks.js';") &&
    appLightSunSrc.includes('configureSunSessionUI({ navigate });') &&
    !appUiShellSrc.includes("import './sun-session-ui-hooks.js';") &&
    swSrc.includes("'/js/sun-session-ai-render-hooks.js'") &&
    swSrc.includes("'/js/sun-session-ui-hooks.js'"));
assert('sun.js configures active sun-session delegated actions',
  sunSrc.includes('quickLogSunSession,') &&
    sunSrc.includes('pauseSunSession,') &&
    sunSrc.includes('resumeSunSession,') &&
    sunSrc.includes('flipSidesMidSession,') &&
    sunSrc.includes('changeCoverageMidSession,') &&
    sunSrc.includes('applySunscreenMidSession,') &&
    sunSrc.includes('setOzoneOverrideMidSession,') &&
    sunSrc.includes('forgotStopPrompt: _forgotStopPrompt') &&
    sunSrc.includes('openChannelOnLightPage: openSunChannelOnLightPageRuntime') &&
    sunSrc.includes("from './sun-runtime.js'"));

[
  'ignore',
  'open-detail',
  'delete-session',
  'quick-log-sun',
  'pause-session',
  'resume-session',
  'flip-sides',
  'change-coverage',
  'apply-sunscreen',
  'override-ozone',
  'forgot-stop',
  'open-channel',
  'close-modal',
  'edit-duration',
  'retry-calculation',
  'toggle-chips',
].forEach(action => {
  assert(`sun session action ${action} is handled`,
    actionSrc.includes(`action === '${action}'`));
});

[
  "sunSessionActionAttrs('open-detail', { id: sess.id })",
  "sunSessionActionAttrs('delete-session', { id: sess.id })",
  "sunSessionActionAttrs('quick-log-sun')",
  'sunSessionActionAttrs(pauseAction, { id: sess.id })',
  "sunSessionActionAttrs('flip-sides', { id: sess.id })",
  "sunSessionActionAttrs('change-coverage', { id: sess.id })",
  "sunSessionActionAttrs('apply-sunscreen', { id: sess.id })",
  "sunSessionActionAttrs('forgot-stop', { id: sess.id })",
  "sunSessionActionAttrs('open-channel', { channel: k })",
  "sunSessionActionAttrs('edit-duration', { id: sess.id })",
  "sunSessionActionAttrs('retry-calculation', { id: sess.id })",
  "sunSessionActionAttrs('delete-session', { id: sess.id, closeModal: true })",
  "sunSessionActionAttrs('toggle-chips', { hiddenCount })",
].forEach(renderedAction => {
  assert(`sun-session-ui renders ${renderedAction}`,
    uiSrc.includes(renderedAction));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
