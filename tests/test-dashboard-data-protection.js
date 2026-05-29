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
// lives in tests/test-dashboard-data-protection-dom.js on the puppeteer runner.

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Data Protection Dashboard Tests ===\n');

// context-cards.js exposes renderDataProtectionCta + openDataProtectionPicker +
// showEnableEncryptionModal + pickFolderForBackup; showSyncSetupModal is
// bound by settings-sync-panel.js through settings.js (puppeteer gets it for
// free via main.js — in Node we import settings explicitly so the section-7
// window-export check sees it).
const cards = await import('../js/context-cards.js');
await import('../js/settings.js');

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
    /Enable encryption/.test(html) && /showEnableEncryptionModal/.test(html));
  assert('direct CTA does NOT open picker',
    !/openDataProtectionPicker/.test(html));
}
{
  const html = cards.renderDataProtectionCta(make({ encryption: true, sync: false, backup: true }));
  assert('only sync missing: direct Sync to other devices CTA',
    /Sync to other devices/.test(html) && /showSyncSetupModal/.test(html));
}
{
  const html = cards.renderDataProtectionCta(make({ encryption: true, sync: true, backup: false }));
  assert('only backup missing: direct Set up auto-backup CTA',
    /Set up auto-backup/.test(html) && /pickFolderForBackup/.test(html));
}

// ─── 4. Two missing → generic picker CTA ─────────────────
{
  const html = cards.renderDataProtectionCta(make({ encryption: false, sync: false, backup: true }));
  assert('two missing: generic Protect your data CTA',
    /Protect your data/.test(html) && /openDataProtectionPicker/.test(html));
  assert('two missing: NOT a feature-specific direct CTA',
    !/onclick="showEnableEncryptionModal\(\)"/.test(html) && !/onclick="showSyncSetupModal\(\)"/.test(html));
}

// ─── 5. All missing → picker CTA ─────────────────────────
{
  const html = cards.renderDataProtectionCta(make({ encryption: false, sync: false, backup: false }));
  assert('all missing: picker CTA renders',
    /Protect your data/.test(html) && /openDataProtectionPicker/.test(html));
}

// Section 6 (picker open/dismiss — live DOM) lives in
// test-dashboard-data-protection-dom.js.

// ─── 7. Window exports ───────────────────────────────────
{
  assert('window.openDataProtectionPicker exists',
    typeof window.openDataProtectionPicker === 'function');
  assert('window.showSyncSetupModal exists',
    typeof window.showSyncSetupModal === 'function');
  assert('window.showEnableEncryptionModal exists',
    typeof window.showEnableEncryptionModal === 'function');
  assert('window.pickFolderForBackup exists',
    typeof window.pickFolderForBackup === 'function');
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
