#!/usr/bin/env node
// Static sun-session UI delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(root, 'js/sun-session-ui.js'), 'utf8');
const actionSrc = fs.readFileSync(path.join(root, 'js/sun-session-actions.js'), 'utf8');

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
    uiSrc.includes('installSunSessionActionDelegates({') &&
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
  actionSrc.includes("actionEl.closest('.sun-channel-chips')?.classList.toggle('sun-chips-expanded')") &&
    !actionSrc.includes("actionEl.parentElement?.classList.toggle('sun-chips-expanded')"));
assert('sun-session-ui direct module actions no longer route through window globals',
  !uiSrc.includes('window.openSunSessionDetail') &&
    !uiSrc.includes('window.deleteSunSession') &&
    !uiSrc.includes('window.editSunSessionDuration'));

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
  "sunSessionActionAttrs('delete-session', { id: sess.id, closeModal: true })",
  "sunSessionActionAttrs('toggle-chips')",
].forEach(renderedAction => {
  assert(`sun-session-ui renders ${renderedAction}`,
    uiSrc.includes(renderedAction));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
