import { getSyncBlocker, getSyncRelay, isSyncConfigured, isSyncEnabled, isSyncPaused, listPendingTombstones } from './sync.js';
import type { SyncSettingsSnapshot } from './settings-sync-contract.js';
export type PendingTombstoneList = () => Readonly<ReturnType<typeof listPendingTombstones>> | null | undefined;
export function getSyncSettingsSnapshot(list: PendingTombstoneList = listPendingTombstones): SyncSettingsSnapshot {
  return {
    enabled: isSyncEnabled(), configured: isSyncConfigured(), paused: isSyncPaused(),
    relay: getSyncRelay(), blocker: getSyncBlocker(),
    deletions: (list() || []).map(row => ({
      id: String(row.id), name: String(row.name || ''),
      dateLabel: row.at ? `flagged ${new Date(row.at as string | number).toLocaleDateString()}` : '',
    })),
  };
}
