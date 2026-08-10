#!/usr/bin/env node
// Settings sync delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/settings-sync-panel-impl.js'), 'utf8');
const restoreUiSrc = fs.readFileSync(path.join(root, 'js/settings-sync-restore-ui.js'), 'utf8');
const syncUiSrc = `${src}\n${restoreUiSrc}`;
const agentSrc = fs.readFileSync(path.join(root, 'js/settings-agent-access-panel.js'), 'utf8');

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

assert('settings-sync-panel implementation has no inline event attributes',
  !inlineHandlerRe.test(syncUiSrc));
assert('settings-sync-panel implementation avoids direct event property assignment',
  !directAssignmentRe.test(src));
assert('Settings sync delegates click events',
  /document\.addEventListener\('click', handleSettingsSyncClick\)/.test(src));
assert('Settings sync delegates change events',
  /document\.addEventListener\('change', handleSettingsSyncChange\)/.test(src));
assert('Settings sync delegates input events',
  /document\.addEventListener\('input', handleSettingsSyncInput\)/.test(src));
assert('Settings sync actions are scoped to panel and modal roots',
  /closest\('#sync-section, #messenger-section, #sync-setup-overlay, #sync-restore-overlay'\)/.test(src));
assert('Agent Access runtime refresh listeners use runtime adapter',
  agentSrc.includes("addUtilsRuntimeListener('labcharts-sync-owner-changed'")
    && agentSrc.includes("addUtilsRuntimeListener('labcharts-profile-switched'")
    && !/\bwindow(?:\.|\s*\[)/.test(agentSrc));
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
  'setup-new-direct',
  'setup-restore-direct',
  'pause-sync',
  'resume-sync',
  'disconnect-sync',
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
  'copy-agent-access-setup-command',
  'regenerate-messenger-token',
  'regenerate-messenger-context-key',
  'set-agent-wearable-series-days',
].forEach(action => {
  assert(`Sync action ${action} is rendered`, syncUiSrc.includes(`data-sync-action="${action}"`));
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
assert('Agent Access toggle uses Settings-owned visible slider styles',
  /data-sync-action="toggle-messenger"[\s\S]{0,180}class="chat-toggle-slider sync-settings-toggle-slider"/.test(agentSrc)
    && /class="chat-websearch-toggle-label sync-settings-toggle"/.test(agentSrc));
assert('Agent Access enable checks saveImportedData result before pushing context or success',
  /const saved = await saveImportedData\(\{ reason: 'agent-access-enable' \}\);[\s\S]*if \(saved === false\) throw new Error\('saveImportedData returned false while enabling Agent Access'\);[\s\S]*pushContextToGateway\(\);[\s\S]*showNotification\('Agent Access enabled', 'success'\)/.test(agentSrc));
assert('Agent Access disable checks saveImportedData result before success',
  /const saved = await saveImportedData\(\{ reason: 'agent-access-disable' \}\);[\s\S]*if \(saved === false\) throw new Error\('saveImportedData returned false while disabling Agent Access'\);[\s\S]*showNotification\('Agent Access disabled', 'success'\)/.test(agentSrc));
assert('Agent Access token regeneration checks saveImportedData result before pushing context or success',
  /const saved = await saveImportedData\(\{ reason: 'agent-access-regenerate-token' \}\);[\s\S]*if \(saved === false\) throw new Error\('saveImportedData returned false while regenerating Agent Access token'\);[\s\S]*pushContextToGateway\(\);[\s\S]*showNotification\('Token regenerated/.test(agentSrc));
assert('Agent Access context-key regeneration checks saveImportedData result before pushing context or success',
  /const saved = await saveImportedData\(\{ reason: 'agent-access-regenerate-context-key' \}\);[\s\S]*if \(saved === false\) throw new Error\('saveImportedData returned false while regenerating Agent Access context key'\);[\s\S]*pushContextToGateway\(\);[\s\S]*showNotification\('Context key regenerated/.test(agentSrc));
assert('Agent Access renders one-click private bootstrap command instead of making users assemble env vars',
  /data-sync-action="copy-agent-access-setup-command"/.test(agentSrc)
    && /agent-access-client-grid/.test(agentSrc)
    && /name="agent-access-client"/.test(agentSrc)
    && /id: 'openclaw'/.test(agentSrc)
    && /id: 'codex'/.test(agentSrc)
    && /buildAgentAccessSetupCommand\(client\)/.test(agentSrc)
    && /gbsetup_v1_/.test(agentSrc)
    && agentSrc.includes('curl -fsSL https://getbased.health/install.sh | bash -s -- connect'));
assert('Agent Access setup command carries token, context key, and selected client through setup payload builder',
  /token:\s*token/.test(agentSrc)
    && /contextKey:\s*contextKey/.test(agentSrc)
    && /client:\s*targetClient/.test(agentSrc)
    && /normalizeAgentAccessClient\(client\)/.test(agentSrc)
    && /btoa\(JSON\.stringify\(payload\)\)/.test(agentSrc));
assert('Delegated wearable-series select writes split Agent Access scalar and pushes context only after persisted save',
  /action === 'set-agent-wearable-series-days'[\s\S]*setAgentAccessWearableSeriesDays\(days\)[\s\S]*const saved = await saveImportedData\(\{ reason: 'agent-access-series' \}\)[\s\S]*if \(saved === false\) throw new Error\('saveImportedData returned false while saving Agent Access wearable-series preference'\)[\s\S]*pushContextToGateway/.test(src)
    && !/set-agent-wearable-series-days'[\s\S]*appWindow\.setAgentWearableSeriesDays/.test(src));
assert('Legacy Settings sync actions stay module-only',
  !src.includes('Object.assign(window')
    && !src.includes('window.toggleSync')
    && !src.includes('window.toggleMessenger'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
