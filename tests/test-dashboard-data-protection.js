#!/usr/bin/env node
// test-dashboard-data-protection.js — Data protection CTA + picker (v1.3.26)
//
// Surfaces three Settings → Data features (Encryption, Sync, Auto-backup)
// onto the dashboard via a single inline CTA. UX contract:
//   - All three configured (or unsupported) → no pill renders
//   - Exactly one missing → direct CTA with feature-specific copy
//   - Two or three missing → generic "Protect your data" pill → picker
//   - Picker shows all three cards, configured ones are non-clickable
//
// renderDataProtectionCta() accepts a state override so we don't have
// to stub module-level state-checkers (which can't be reassigned on
// frozen ES module namespaces).
//
// Run: node tests/test-dashboard-data-protection.js  (or via npm test)
//
// Section 6 (picker open/dismiss — needs a live DOM overlay + click events)
// lives in tests/playwright/dashboard-data-protection.spec.js.

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Data Protection Dashboard Tests ===\n');

// context-cards.js exposes the dashboard APIs; backup stays module-only.
const cards = await import('../js/context-cards.js');
const backupModule = await import('../js/backup.js');
const cryptoModule = await import('../js/crypto.js');
const settingsSyncPanel = await import('../js/settings-sync-panel.js');

const make = (overrides) => ({
  encryption: false,
  sync: false,
  backup: false,
  backupSupported: true,
  ...overrides,
});

// ─── 1. All configured → no pill ─────────────────────────
{
  const html = cards.renderDataProtectionCta(make({ encryption: true, sync: true, backup: true }));
  assert('all configured: empty string returned', html === '', JSON.stringify(html));
}

// ─── 2. Backup unsupported (Safari) → treat as configured ─
{
  const html = cards.renderDataProtectionCta(make({ encryption: true, sync: true, backup: false, backupSupported: false }));
  assert('unsupported backup is not nagged', html === '', JSON.stringify(html));
}

// ─── 3. Single missing → direct CTA with feature-specific copy ─
{
  const html = cards.renderDataProtectionCta(make({ encryption: false, sync: true, backup: true }));
  assert('only encryption missing: direct CTA',
    /Enable encryption/.test(html) && /data-dashboard-ai-action="enable-encryption"/.test(html));
  assert('direct CTA does NOT open picker',
    !/data-dashboard-ai-action="open-data-protection-picker"/.test(html));
}
{
  const html = cards.renderDataProtectionCta(make({ encryption: true, sync: false, backup: true }));
  assert('only sync missing: direct Sync to other devices CTA',
    /Sync to other devices/.test(html) && /data-dashboard-ai-action="setup-sync"/.test(html));
}
{
  const html = cards.renderDataProtectionCta(make({ encryption: true, sync: true, backup: false }));
  assert('only backup missing: direct Set up auto-backup CTA',
    /Set up auto-backup/.test(html) && /data-dashboard-ai-action="setup-backup"/.test(html));
}

// ─── 4. Two missing → generic picker CTA ─────────────────
{
  const html = cards.renderDataProtectionCta(make({ encryption: false, sync: false, backup: true }));
  assert('two missing: generic Protect your data CTA',
    /Protect your data/.test(html) && /data-dashboard-ai-action="open-data-protection-picker"/.test(html));
  assert('two missing: NOT a feature-specific direct CTA',
    !/data-dashboard-ai-action="enable-encryption"/.test(html) && !/data-dashboard-ai-action="setup-sync"/.test(html));
}

// ─── 5. All missing → picker CTA ─────────────────────────
{
  const html = cards.renderDataProtectionCta(make({ encryption: false, sync: false, backup: false }));
  assert('all missing: picker CTA renders',
    /Protect your data/.test(html) && /data-dashboard-ai-action="open-data-protection-picker"/.test(html));
  assert('data protection CTA renders without inline handlers', !/on(click|keydown)=/.test(html));
}

// Section 6 (picker open/dismiss — live DOM) lives in
// tests/playwright/dashboard-data-protection.spec.js.

// ─── 7. Public APIs ──────────────────────────────────────
{
  assert('cards.openDataProtectionPicker exists',
    typeof cards.openDataProtectionPicker === 'function');
  assert('window.openDataProtectionPicker stays module-only',
    !('openDataProtectionPicker' in window));
  assert('settings-sync-panel.showSyncSetupModal exists',
    typeof settingsSyncPanel.showSyncSetupModal === 'function');
  assert('window.showSyncSetupModal stays module-only',
    !('showSyncSetupModal' in window));
  assert('crypto.showEnableEncryptionModal module export exists',
    typeof cryptoModule.showEnableEncryptionModal === 'function');
  assert('window.showEnableEncryptionModal stays module-only',
    !('showEnableEncryptionModal' in window));
  assert('backup.pickFolderForBackup module export exists',
    typeof backupModule.pickFolderForBackup === 'function');
  assert('window.pickFolderForBackup stays module-only',
    !('pickFolderForBackup' in window));
  assert('dashboard backup dependency is configurable for tests',
    typeof cards.configureDashboardAIDataProtectionDeps === 'function');
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
