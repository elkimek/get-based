#!/usr/bin/env node
// test-folder-backup.js — folder backup feature verification
//
// Run: node tests/test-folder-backup.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
const results: string[] = [];
function assert(name: string, condition: unknown, detail?: unknown) {
  if (condition) { pass++; results.push(`  PASS: ${name}`); }
  else { fail++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== test-folder-backup ===\n');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

await import('../js/state.js');
const backupModule = await import('../js/backup.js');
const cryptoModule = await import('../js/crypto.js');
const exportModule = await import('../js/export.js');

  // ═══════════════════════════════════════════════
  // 1. Module exports exist without legacy window globals
  // ═══════════════════════════════════════════════
  const folderBackupExports = [
    'initFolderBackup', 'pickFolderForBackup', 'reauthorizeFolderBackup',
    'removeFolderBackup', 'getFolderBackupState',
  ] as const;
  for (const name of folderBackupExports) {
    assert(`backup.${name} exists`, typeof backupModule[name] === 'function');
    assert(`window.${name} stays module-only`, !(name in window));
  }
  assert('export module exposes buildAllDataBundle', typeof exportModule.buildAllDataBundle === 'function');
  assert('buildAllDataBundle stays module-only', !('buildAllDataBundle' in window));

  // ═══════════════════════════════════════════════
  // 2. getFolderBackupState() returns correct shape
  // ═══════════════════════════════════════════════
  try {
    const st = backupModule.getFolderBackupState();
    assert('getFolderBackupState returns object', typeof st === 'object' && st !== null);
    assert('state has supported boolean', typeof st.supported === 'boolean');
    assert('state has folderName (string or null)', st.folderName === null || typeof st.folderName === 'string');
    assert('state has permissionLost boolean', typeof st.permissionLost === 'boolean');
    assert('state has lastBackup (string or null)', st.lastBackup === null || typeof st.lastBackup === 'string');
  } catch (e) {
    assert('getFolderBackupState shape', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 3. buildAllDataBundle() returns valid JSON
  // ═══════════════════════════════════════════════
  try {
    const json = await exportModule.buildAllDataBundle();
    if (json) {
      assert('buildAllDataBundle returns string', typeof json === 'string');
      const parsed = JSON.parse(json);
      assert('bundle has version field', parsed.version === 2);
      assert('bundle has type database', parsed.type === 'database');
      assert('bundle has exportedAt', typeof parsed.exportedAt === 'string');
      assert('bundle has profiles array', Array.isArray(parsed.profiles));
    } else {
      assert('buildAllDataBundle returns null (no profiles)', true);
    }
  } catch (e) {
    assert('buildAllDataBundle validity', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 4. Folder ownership and capability contract (live states: settings-protection.test.ts)
  // ═══════════════════════════════════════════════
  try {
    const html = cryptoModule.renderBackupSection();
    const view = read('js/components/BackupSettings.svelte');
    const folder = read('js/components/FolderBackupSettings.svelte');
    assert('renderBackupSection exposes the owned component mount', html.includes('data-backup-settings-root'));
    assert('Backup component includes the folder section container', view.includes('id="backup-folder-section"'));
    assert('Folder component has description text', folder.includes('backup-folder-desc'));
    assert('Folder component has delegated set/change button', folder.includes('data-backup-action="pick-folder"'));
    assert('Folder component has no inline click handlers', !folder.includes('onclick='));
    assert('Folder component gates unsupported browsers', folder.includes('{#if snapshot.supported}'));
    if (!backupModule.getFolderBackupState().supported) {
      assert('Standalone folder renderer is empty when unsupported', backupModule.renderFolderBackupSection() === '');
    }
  } catch (e) {
    assert('renderBackupSection folder UI', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 5. IndexedDB v2 has folder-handle store — SKIPPED in Node
  //    Requires fake-indexeddb polyfill; covered by Playwright.
  // ═══════════════════════════════════════════════
  console.log('  SKIP: IndexedDB v2 stores — needs IDB polyfill; covered by Playwright.');

  // ═══════════════════════════════════════════════
  // 6. CSS has folder backup styles
  // ═══════════════════════════════════════════════
  try {
    const cssText = read('/css/data-protection.css');
    const folder = read('js/components/FolderBackupSettings.svelte');
    const classes = read('js/settings-protection-classes.ts');
    assert('Svelte/Tailwind owns backup-folder-section', (folder + classes).includes('backup-folder-section') && folder.includes('gb:protection:') && !cssText.includes('.backup-folder-section'));
    assert('Svelte/Tailwind owns backup-folder-desc', (folder + classes).includes('backup-folder-desc') && folder.includes('gb:protection:') && !cssText.includes('.backup-folder-desc'));
    assert('Svelte/Tailwind owns backup-folder-status', (folder + classes).includes('backup-folder-status') && folder.includes('gb:protection:') && !cssText.includes('.backup-folder-status'));
    assert('Svelte/Tailwind owns backup-folder-status-ok', (folder + classes).includes('backup-folder-status-ok') && folder.includes('gb:protection:') && !cssText.includes('.backup-folder-status-ok'));
    assert('Svelte/Tailwind owns backup-folder-status-warn', (folder + classes).includes('backup-folder-status-warn') && folder.includes('gb:protection:') && !cssText.includes('.backup-folder-status-warn'));
    assert('Svelte/Tailwind owns backup-folder-meta', (folder + classes).includes('backup-folder-meta') && folder.includes('gb:protection:') && !cssText.includes('.backup-folder-meta'));
  } catch (e) {
    assert('CSS folder backup styles', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 7. backup.js source has folder backup functions
  // ═══════════════════════════════════════════════
  try {
    const src = read('/js/backup.js');
    assert('backup.js has initFolderBackup', src.includes('async function initFolderBackup'));
    assert('backup.js has pickFolderForBackup', src.includes('async function pickFolderForBackup'));
    assert('backup.js has reauthorizeFolderBackup', src.includes('async function reauthorizeFolderBackup'));
    assert('backup.js has removeFolderBackup', src.includes('function removeFolderBackup'));
    assert('backup.js has getFolderBackupState', src.includes('function getFolderBackupState'));
    assert('backup.js has writeFolderBackup', src.includes('async function writeFolderBackup'));
    assert('backup.js has showDirectoryPicker check', src.includes('showDirectoryPicker'));
    assert('backup.js has folder-handle store constant', src.includes("'folder-handle'"));
    assert('performAutoBackup calls writeFolderBackup', src.includes('writeFolderBackup()'));
    assert('writeFolderBackup uses buildBackupSnapshot', src.includes('buildBackupSnapshot()'));
  } catch (e) {
    assert('backup.js source inspection', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 8. Backup nudge
  // ═══════════════════════════════════════════════
  assert('crypto.maybeShowBackupNudge module export exists', typeof cryptoModule.maybeShowBackupNudge === 'function');
  assert('window.maybeShowBackupNudge stays module-only', !('maybeShowBackupNudge' in window));
  try {
    const backupSrc2 = read('/js/backup.js');
    const cryptoSrc = read('/js/crypto.js');
    const cryptoUiSrc = read('/js/crypto-ui.js');
    const cryptoSurfaceSrc = `${cryptoSrc}\n${cryptoUiSrc}`;
    assert('labcharts-last-manual-backup in backup.js', backupSrc2.includes('labcharts-last-manual-backup'));
    assert('crypto surface has backup-nudge-snoozed-until', cryptoSurfaceSrc.includes('backup-nudge-snoozed-until'));
    assert('crypto UI has maybeShowBackupNudge function', cryptoUiSrc.includes('function maybeShowBackupNudge'));
  } catch (e) {
    assert('backup nudge source inspection', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 9. Startup calls initFolderBackup and maybeShowBackupNudge
  // ═══════════════════════════════════════════════
  try {
    const foundationSrc = read('/js/startup-foundation.js');
    const startupUiSrc = read('/js/startup-ui.js');
    assert('startup-foundation.js imports initFolderBackup', foundationSrc.includes('initFolderBackup'));
    assert('startup-foundation.js awaits initFolderBackup', foundationSrc.includes('await initFolderBackup()'));
    assert('startup-ui.js imports maybeShowBackupNudge', startupUiSrc.includes('maybeShowBackupNudge'));
  } catch (e) {
    assert('startup folder backup init', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // 10. export.js has buildAllDataBundle
  // ═══════════════════════════════════════════════
  try {
    const src = read('/js/export.js');
    assert('export.js has buildAllDataBundle function', src.includes('async function buildAllDataBundle'));
    assert('export.js exposes buildAllDataBundle on window', src.includes('buildAllDataBundle'));
    assert('exportAllDataJSON uses buildAllDataBundle', src.includes('await buildAllDataBundle()'));
  } catch (e) {
    assert('export.js buildAllDataBundle', false, (e as {message?: unknown}).message);
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
console.log(results.join('\n'));
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
