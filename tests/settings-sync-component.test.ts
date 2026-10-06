// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { disposeSyncSettings, mountSyncSettings, getSyncSettingsView } from '../js/settings-sync-component.js';
import type { SyncSettingsSnapshot } from '../js/settings-sync-contract.js';
const initial: SyncSettingsSnapshot = { enabled: false, configured: false, paused: false, relay: 'wss://synthetic.example', blocker: null, deletions: [] };
beforeEach(() => { document.body.innerHTML = '<section id="sync-section"><div data-sync-settings-root></div></section>'; });
afterEach(() => { disposeSyncSettings(); document.body.replaceChildren(); });
function mounted(patch: Partial<SyncSettingsSnapshot> = {}) { return mountSyncSettings(document.querySelector('[data-sync-settings-root]')!, { ...initial, ...patch }); }
it('owns the off, blocked, paused and enabled variants with original actions', () => {
  const view = mounted();
  expect(document.querySelector('[data-sync-action="setup-new-direct"]')).not.toBeNull();
  expect(document.querySelector('[data-sync-action="setup-restore-direct"]')).not.toBeNull();
  view.refresh({ ...initial, blocker: 'Synthetic browser limitation' });
  expect(document.querySelector('[role="status"]')!.textContent).toContain('Synthetic browser limitation');
  expect((document.querySelector('[data-sync-action="setup-new-direct"]') as HTMLButtonElement).disabled).toBe(true);
  view.refresh({ ...initial, configured: true, paused: true });
  expect(document.querySelector('.sync-settings-badge')!.textContent).toBe('Paused');
  expect(document.querySelector('[data-sync-action="resume-sync"]')).not.toBeNull();
  view.refresh({ ...initial, enabled: true, configured: true });
  expect((document.querySelector('[data-sync-action="toggle-sync"]') as HTMLInputElement).checked).toBe(true);
  expect(document.querySelector('[data-sync-action="pause-sync"]')).not.toBeNull();
  expect(document.querySelector('[data-sync-action="open-restore-dialog"]')).not.toBeNull();
});
it('keeps hidden recovery words out of snapshots and markup until explicitly revealed, and remasks on refresh', () => {
  const view = mounted({ enabled: true });
  const secret = 'synthetic private recovery words';
  view.setMnemonicStatus(true);
  expect(document.body.innerHTML).not.toContain(secret);
  expect(document.querySelector('#sync-mnemonic')!.getAttribute('data-masked')).toBe('true');
  view.toggleMnemonic(secret);
  expect(document.querySelector('#sync-mnemonic')!.textContent).toBe(secret);
  expect(document.querySelector('#sync-mnemonic-toggle')!.getAttribute('aria-pressed')).toBe('true');
  view.refresh({ ...initial, enabled: true });
  expect(document.body.innerHTML).not.toContain(secret);
  expect(document.querySelector('#sync-mnemonic-toggle')!.textContent).toBe('Show');
});
it('retains focused controls and unsaved relay input while status updates arrive', () => {
  const view = mounted({ enabled: true });
  const input = document.querySelector('#sync-relay-input') as HTMLInputElement;
  input.value = 'wss://edited.example'; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  view.setRelay(true); view.setIdentity('A94F-2C71-B803'); view.setMnemonicStatus(true);
  expect(document.querySelector('#sync-relay-input')).toBe(input); expect(document.activeElement).toBe(input);
  expect(input.value).toBe('wss://edited.example'); expect(document.querySelector('#sync-status-text')!.textContent).toBe('Connected to relay');
  expect((document.querySelector('#sync-identity-copy') as HTMLButtonElement).disabled).toBe(false);
});
it('escapes deletion summaries and preserves exact action IDs without inline handlers', () => {
  mounted({ deletions: [{ id: 'synthetic"id', name: '<img src=x onerror=alert(1)>', dateLabel: 'flagged today' }] });
  expect(document.querySelector('.sync-tombstone-row')!.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(document.querySelector('.sync-tombstone-row img')).toBeNull();
  expect((document.querySelector('[data-sync-action="apply-tombstone"]') as HTMLElement).dataset.tombId).toBe('synthetic"id');
  expect(document.querySelector('[onclick]')).toBeNull();
});
it('rejects late updates to a removed or replaced owner and releases secrets on disposal', () => {
  const old = mounted({ enabled: true }); old.toggleMnemonic('Old synthetic secret');
  document.querySelector('#sync-section')!.innerHTML = '<div data-sync-settings-root></div>';
  const next = mounted({ enabled: true });
  old.setIdentity('STALE'); old.setRelay(true); old.toggleMnemonic('Old synthetic secret');
  expect(old.isCurrent()).toBe(false); expect(next.isCurrent()).toBe(true);
  expect(document.body.innerHTML).not.toContain('STALE'); expect(document.body.innerHTML).not.toContain('Old synthetic secret');
  disposeSyncSettings(); expect(getSyncSettingsView()).toBeNull(); expect(document.querySelector('[data-sync-settings-view]')).toBeNull();
});
