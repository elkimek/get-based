// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncRuntime = vi.hoisted(() => ({
  closeModalOverlay: vi.fn(),
  confirmAction: vi.fn(async () => true),
  currentSyncEnabled: vi.fn(() => false),
  enableSync: vi.fn(async () => {}),
  ensureBip39: vi.fn(),
  ensureQRCode: vi.fn(),
  openModalOverlay: vi.fn(overlay => overlay.classList.add('show')),
  restoreMnemonic: vi.fn(async () => true),
  showNotification: vi.fn(),
}));

vi.mock('../js/utils.js', () => ({
  escapeHTML: value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;'),
  showNotification: syncRuntime.showNotification,
}));
vi.mock('../js/sync-identity.js', () => ({
  ensureBip39: syncRuntime.ensureBip39,
  ensureQRCode: syncRuntime.ensureQRCode,
}));
vi.mock('../js/modal-lifecycle.js', () => ({
  closeModalOverlay: syncRuntime.closeModalOverlay,
  openModalOverlay: syncRuntime.openModalOverlay,
}));
vi.mock('../js/sync-diagnose-actions-context.js', () => ({
  currentSyncEnabled: syncRuntime.currentSyncEnabled,
  enableSyncForDiagnose: syncRuntime.enableSync,
  restoreMnemonicForDiagnose: syncRuntime.restoreMnemonic,
}));
vi.mock('../js/sync-diagnose-runtime.js', () => ({
  confirmSyncDiagnoseActionRuntime: syncRuntime.confirmAction,
}));

const { confirmRotateIdentity } = await import('../js/sync-diagnose-identity-actions.js');
const { _evoluDiagnosticsText } = await import('../js/sync-diagnostics-text.js');

function click(selector) {
  const element = document.querySelector(selector);
  expect(element).not.toBeNull();
  element.click();
  return element;
}

describe('sync recovery runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    syncRuntime.confirmAction.mockResolvedValue(true);
    syncRuntime.currentSyncEnabled.mockReturnValue(false);
    syncRuntime.restoreMnemonic.mockResolvedValue(true);
    document.execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error('clipboard denied'); }) },
    });
  });

  it('rotates identity only after confirmation, saved-word acknowledgement, and a successful local restore', async () => {
    syncRuntime.ensureBip39.mockRejectedValueOnce(new Error('loader failed'));
    await confirmRotateIdentity(null);
    expect(syncRuntime.showNotification).toHaveBeenCalledWith(
      'BIP-39 library not loaded — cannot rotate identity',
      'error',
    );

    const mnemonic = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ');
    syncRuntime.ensureBip39.mockResolvedValue({
      generateMnemonic: vi.fn(async () => mnemonic),
    });
    syncRuntime.ensureQRCode.mockResolvedValue(() => ({
      addData: vi.fn(),
      createSvgTag: vi.fn(() => '<svg aria-label="mnemonic QR"></svg>'),
      make: vi.fn(),
    }));

    const existing = document.createElement('div');
    existing.className = 'modal-overlay show';
    const trigger = document.createElement('button');
    existing.appendChild(trigger);
    document.body.appendChild(existing);

    await confirmRotateIdentity(trigger);

    expect(existing.isConnected).toBe(false);
    expect(syncRuntime.closeModalOverlay).toHaveBeenCalledWith(existing);
    expect(document.querySelectorAll('#rotate-words span')).toHaveLength(48);
    const apply = document.querySelector('#rotate-apply-btn');
    expect(apply.disabled).toBe(true);

    click('#rotate-copy-btn');
    await vi.waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(document.querySelector('#rotate-copy-btn').textContent).toBe('✓ Copied');
    });

    const saved = document.querySelector('#rotate-saved-check');
    saved.checked = true;
    saved.dispatchEvent(new Event('change', { bubbles: true }));
    expect(apply.disabled).toBe(false);

    apply.click();
    await vi.waitFor(() => expect(syncRuntime.restoreMnemonic).toHaveBeenCalledWith(
      mnemonic,
      { seedLocal: true },
    ));

    expect(syncRuntime.enableSync).toHaveBeenCalledWith({ skipPush: true });
    expect(syncRuntime.showNotification).toHaveBeenCalledWith(
      'Sync identity rotated. Enter the new mnemonic on your other devices to keep them syncing.',
      'success',
    );
    expect(document.querySelector('#rotate-apply-btn')).toBeNull();
  });

  it('formats a complete, support-ready diagnostics snapshot without dropping blockers or telemetry', () => {
    const text = _evoluDiagnosticsText({
      syncEnabled: true,
      relay: 'wss://relay.example',
      ownerId: 'owner-1',
      mnemonicConfigured: true,
      activeProfileId: 'profile-1',
      activeImported: { sunSessions: 2, lightDevices: 1 },
      rowParseFailureCount: 1,
      rowsReadFailed: true,
      rowsError: 'Patient Jane Example payload was malformed',
      rows: [{
        profileId: 'profile-1',
        isDeleted: false,
        syncedAtMs: 12345,
        sun: 2,
        dev: 1,
        bytes: 420,
        format: 'delta',
        profileIdSource: 'row',
      }],
      rowsError: 'one stale row could not be read',
      deltaTelemetry: {
        summary: {
          ratio: 0.03,
          count: 2,
          totalBlobBytes: 1000,
          totalDeltaBytes: 30,
          totalOps: 4,
        },
        pushes: [{
          at: '2026-01-10T12:00:00.000Z',
          blobBytes: 1000,
          totalDeltaBytes: 30,
          totalOps: 4,
          perArray: {
            sunSessions: { ins: 1, upd: 1, tom: 0 },
            empty: { ins: 0, upd: 0, tom: 0 },
          },
        }],
        pull: {
          mergedAt: '2026-01-10T12:01:00.000Z',
          perArray: {
            sunSessions: { live: 2, tombstones: 0 },
            notes: { live: 1, tombstones: 1 },
          },
        },
      },
      cutoverReadiness: {
        ready: false,
        blockerCount: 1,
        surfaceCount: 3,
        surfaces: {
          sunSessions: {
            status: 'ok',
            shape: 'array',
            localCount: 2,
            rowCount: 2,
          },
          notes: {
            status: 'missing-rows',
            shape: 'array',
            localCount: 1,
            rowCount: 0,
          },
          settings: {
            status: 'ok',
            shape: 'object',
            localCount: 1,
            rowCount: 1,
          },
        },
      },
    });

    expect(text).toContain('Sync enabled: yes');
    expect(text).toContain('Recovery phrase configured: yes');
    expect(text).not.toContain('alpha beta');
    expect(text).toContain('Unreadable row payloads: 1');
    expect(text).toContain('Row query status: failed');
    expect(text).not.toContain('Patient Jane Example');
    expect(text).toContain('profile-1');
    expect(text).toContain('sunSessions(1/1/0)');
    expect(text).not.toContain('empty(0/0/0)');
    expect(text).toContain('notes                live=1 tombstones=1');
    expect(text).toContain('BLOCKED — 1 surface(s) missing rows');
    expect(text).toContain('notes                shape=array local=1 rows=0');
    expect(text).toContain('✓ ok (2): sunSessions, settings');
  });
});
