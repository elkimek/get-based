import { expect, it, vi } from 'vitest';
vi.mock('../js/sync.js', () => ({
  getSyncBlocker: () => null,
  getSyncRelay: () => 'wss://synthetic.example',
  isSyncConfigured: () => true,
  isSyncEnabled: () => false,
  isSyncPaused: () => true,
  listPendingTombstones: () => [],
}));
import { getSyncSettingsSnapshot } from '../js/settings-sync-view.js';
it('copies only public service display values and deletion summaries', () => {
  const pending = [{ id: 'synthetic', name: 'Synthetic profile', at: 1, privatePayload: 'Never render private data' }];
  const snapshot = getSyncSettingsSnapshot(() => pending);
  expect(snapshot).toEqual({ configured: true, enabled: false, paused: true, relay: 'wss://synthetic.example', blocker: null,
    deletions: [{ id: 'synthetic', name: 'Synthetic profile', dateLabel: `flagged ${new Date(1).toLocaleDateString()}` }] });
  pending[0]!.name = 'Later edit';
  expect(snapshot.deletions[0]!.name).toBe('Synthetic profile');
  expect(JSON.stringify(snapshot)).not.toContain('Never render private data');
});
it('accepts the public list callback returning no rows', () => {
  expect(getSyncSettingsSnapshot(() => null).deletions).toEqual([]);
  expect(getSyncSettingsSnapshot().deletions).toEqual([]);
});
