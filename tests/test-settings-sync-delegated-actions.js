#!/usr/bin/env node
// Settings sync delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/settings-sync-panel.js'), 'utf8');

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

console.log('=== Settings Sync Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)=/;
const directAssignmentRe = /\.(?:onclick|onchange|oninput)\s*=/;

assert('settings-sync-panel.js has no inline event attributes',
  !inlineHandlerRe.test(src));
assert('settings-sync-panel.js avoids direct event property assignment',
  !directAssignmentRe.test(src));
assert('Settings sync delegates click events',
  /document\.addEventListener\('click', handleSettingsSyncClick\)/.test(src));
assert('Settings sync delegates change events',
  /document\.addEventListener\('change', handleSettingsSyncChange\)/.test(src));
assert('Settings sync delegates input events',
  /document\.addEventListener\('input', handleSettingsSyncInput\)/.test(src));
assert('Settings sync actions are scoped to panel and modal roots',
  /closest\('#sync-section, #messenger-section, #sync-setup-overlay, #sync-restore-overlay'\)/.test(src));
assert('Setup overlay backdrop nudges instead of closing',
  /target\.id === 'sync-setup-overlay'[\s\S]*nudgeSyncSetupDialog\(\)/.test(src));
assert('Restore overlay backdrop closes restore dialog',
  /target\.id === 'sync-restore-overlay'[\s\S]*closeRestoreMnemonicDialog\(\)/.test(src));
assert('Click delegate lets state controls reach change/input events',
  /SETTINGS_SYNC_STATE_ACTIONS\.has\(action\)[\s\S]*return;[\s\S]*event\.preventDefault\(\);/.test(src)
    && src.indexOf('SETTINGS_SYNC_STATE_ACTIONS.has(action)') < src.indexOf('event.preventDefault();'));

[
  'apply-tombstone',
  'reject-tombstone',
  'toggle-sync',
  'toggle-mnemonic',
  'copy-mnemonic',
  'open-restore-dialog',
  'save-relay',
  'restore-dialog-input',
  'close-restore-dialog',
  'confirm-restore',
  'toggle-messenger',
  'toggle-messenger-token',
  'toggle-messenger-context-key',
  'copy-messenger-token',
  'copy-messenger-context-key',
  'regenerate-messenger-token',
  'regenerate-messenger-context-key',
  'set-agent-wearable-series-days',
].forEach(action => {
  assert(`Sync action ${action} is rendered`, src.includes(`data-sync-action="${action}"`));
});

[
  'setup-new',
  'setup-restore',
  'setup-do-restore',
  'setup-back',
  'setup-cancel',
  'setup-ack',
  'setup-done',
].forEach(action => {
  assert(`Sync setup action ${action} is rendered`, src.includes(`data-sync-setup-action="${action}"`));
});

assert('Delegated sync toggle calls toggleSync with checkbox state',
  /action === 'toggle-sync'[\s\S]*toggleSync\(actionEl\.checked\)/.test(src));
assert('Delegated setup acknowledgment updates Done state',
  /action === 'setup-ack'[\s\S]*updateSyncSetupAck\(actionEl\)/.test(src));
assert('Delegated Agent Access toggle calls toggleMessenger',
  /action === 'toggle-messenger'[\s\S]*toggleMessenger\(actionEl\.checked\)/.test(src));
assert('Delegated wearable-series select pushes context',
  /action === 'set-agent-wearable-series-days'[\s\S]*setAgentWearableSeriesDays[\s\S]*pushContextToGateway/.test(src));
assert('Existing window exports remain for external callers',
  src.includes('Object.assign(window')
    && src.includes('toggleSync,')
    && src.includes('toggleMessenger,'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
