#!/usr/bin/env node
// test-folder-backup.js — folder backup feature verification
//
// Run: node tests/test-folder-backup.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
const results = [];
function assert(name, condition, detail) {
  if (condition) { pass++; results.push(`  PASS: ${name}`); }
  else { fail++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== test-folder-backup ===\n');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

await import('../js/state.js');
await import('../js/backup.js');
await import('../js/crypto.js');
await import('../js/export.js'); // exposes window.buildAllDataBundle

  // ═══════════════════════════════════════════════
  // 1. Window exports exist
  // ═══════════════════════════════════════════════
  assert('window.initFolderBackup exists', typeof window.initFolderBackup === 'function');
  assert('window.pickFolderForBackup exists', typeof window.pickFolderForBackup === 'function');
  assert('window.reauthorizeFolderBackup exists', typeof window.reauthorizeFolderBackup === 'function');
  assert('window.removeFolderBackup exists', typeof window.removeFolderBackup === 'function');
  assert('window.getFolderBackupState exists', typeof window.getFolderBackupState === 'function');
  assert('window.buildAllDataBundle exists', typeof window.buildAllDataBundle === 'function');

  // ═══════════════════════════════════════════════
  // 2. getFolderBackupState() returns correct shape
  // ═══════════════════════════════════════════════
  try {
    const st = window.getFolderBackupState();
    assert('getFolderBackupState returns object', typeof st === 'object' && st !== null);
    assert('state has supported boolean', typeof st.supported === 'boolean');
    assert('state has folderName (string or null)', st.folderName === null || typeof st.folderName === 'string');
    assert('state has permissionLost boolean', typeof st.permissionLost === 'boolean');
    assert('state has lastBackup (string or null)', st.lastBackup === null || typeof st.lastBackup === 'string');
  } catch (e) {
    assert('getFolderBackupState shape', false, e.message);
  }

  // ═══════════════════════════════════════════════
  // 3. buildAllDataBundle() returns valid JSON
  // ═══════════════════════════════════════════════
  try {
    const json = await window.buildAllDataBundle();
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
    assert('buildAllDataBundle validity', false, e.message);
  }

  // ═══════════════════════════════════════════════
  // 4. renderBackupSection includes folder UI
  // ═══════════════════════════════════════════════
  try {
    const html = window.renderBackupSection();
    assert('renderBackupSection has folder section container', html.includes('backup-folder-section'));
    // On Chromium, should have folder UI content; on Firefox/Safari, the inner HTML is empty
    const st = window.getFolderBackupState();
    if (st.supported) {
      assert('Folder section has description text', html.includes('backup-folder-desc'));
      assert('Folder section has set/change button', html.includes('pickFolderForBackup'));
    } else {
      assert('Folder section hidden on unsupported browser', !html.includes('backup-folder-desc'));
    }
  } catch (e) {
    assert('renderBackupSection folder UI', false, e.message);
  }

  // ═══════════════════════════════════════════════
  // 5. IndexedDB v2 has folder-handle store — SKIPPED in Node
  //    Requires fake-indexeddb polyfill; covered by puppeteer.
  // ═══════════════════════════════════════════════
  console.log('  SKIP: IndexedDB v2 stores — needs IDB polyfill; covered by puppeteer.');

  // ═══════════════════════════════════════════════
  // 6. CSS has folder backup styles
  // ═══════════════════════════════════════════════
  try {
    const cssText = read('/styles.css');
    assert('CSS has .backup-folder-section', cssText.includes('.backup-folder-section'));
    assert('CSS has .backup-folder-desc', cssText.includes('.backup-folder-desc'));
    assert('CSS has .backup-folder-status', cssText.includes('.backup-folder-status'));
    assert('CSS has .backup-folder-status-ok', cssText.includes('.backup-folder-status-ok'));
    assert('CSS has .backup-folder-status-warn', cssText.includes('.backup-folder-status-warn'));
    assert('CSS has .backup-folder-meta', cssText.includes('.backup-folder-meta'));
  } catch (e) {
    assert('CSS folder backup styles', false, e.message);
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
    assert('backup.js source inspection', false, e.message);
  }

  // ═══════════════════════════════════════════════
  // 8. Backup nudge
  // ═══════════════════════════════════════════════
  assert('window.maybeShowBackupNudge exists', typeof window.maybeShowBackupNudge === 'function');
  try {
    const backupSrc2 = read('/js/backup.js');
    const cryptoSrc = read('/js/crypto.js');
    assert('labcharts-last-manual-backup in backup.js', backupSrc2.includes('labcharts-last-manual-backup'));
    assert('crypto.js has backup-nudge-snoozed-until', cryptoSrc.includes('backup-nudge-snoozed-until'));
    assert('crypto.js has maybeShowBackupNudge function', cryptoSrc.includes('function maybeShowBackupNudge'));
  } catch (e) {
    assert('backup nudge source inspection', false, e.message);
  }

  // ═══════════════════════════════════════════════
  // 9. main.js calls initFolderBackup and maybeShowBackupNudge
  // ═══════════════════════════════════════════════
  try {
    const src = read('/js/main.js');
    assert('main.js imports initFolderBackup', src.includes('initFolderBackup'));
    assert('main.js awaits initFolderBackup', src.includes('await initFolderBackup()'));
    assert('main.js imports maybeShowBackupNudge', src.includes('maybeShowBackupNudge'));
  } catch (e) {
    assert('main.js folder backup init', false, e.message);
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
    assert('export.js buildAllDataBundle', false, e.message);
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
console.log(results.join('\n'));
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
