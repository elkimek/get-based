#!/usr/bin/env node
// Static client-list delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const clientListSrc = fs.readFileSync(path.join(root, 'js/client-list.js'), 'utf8');

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

console.log('=== Client List Delegated Actions ===');

assert('client-list.js renders no inline event attributes',
  !/\bon(?:click|change|input|search|keydown|keyup|submit)=/.test(clientListSrc));
assert('client-list.js uses data action attributes',
  clientListSrc.includes('data-cl-action') &&
    clientListSrc.includes('data-cl-input-action') &&
    clientListSrc.includes('data-cl-change-action') &&
    clientListSrc.includes('data-cl-submit-action') &&
    clientListSrc.includes('data-cl-key-action'));
assert('client-list.js installs idempotent delegates',
  clientListSrc.includes('let clientListDelegatesInstalled = false') &&
    clientListSrc.includes("document.addEventListener('click', _handleClientClick)") &&
    clientListSrc.includes("document.addEventListener('input', _handleClientInput)") &&
    clientListSrc.includes("document.addEventListener('change', _handleClientChange)") &&
    clientListSrc.includes("document.addEventListener('submit', _handleClientSubmit)") &&
    clientListSrc.includes("document.addEventListener('keydown', _handleClientKeydown)"));
assert('client-list menu buttons are data-driven',
  clientListSrc.includes('function _clMenuButton') &&
    clientListSrc.includes("action: 'pin-profile'") &&
    clientListSrc.includes("action: 'delete-profile'") &&
    !clientListSrc.includes('onclick:'));
assert('dynamic avatar and tag buttons avoid direct onclick assignment',
  clientListSrc.includes("btn.setAttribute('data-cl-action', 'remove-avatar')") &&
    !clientListSrc.includes('.onclick'));

[
  'close',
  'open-form',
  'back-to-list',
  'select-profile',
  'edit-profile',
  'toggle-tools-menu',
  'trigger-json-import',
  'export-all',
  'load-demo',
  'tag-filter',
  'toggle-menu',
  'choose-avatar',
  'remove-avatar',
  'set-sex',
  'remove-tag',
  'height-unit',
  'health-metrics',
  'pin-profile',
  'unpin-profile',
  'flag-profile',
  'unflag-profile',
  'archive-profile',
  'unarchive-profile',
  'export-profile',
  'export-profile-chat',
  'delete-profile',
].forEach(action => {
  assert(`client-list action ${action} is handled`, clientListSrc.includes(`action === '${action}'`));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
