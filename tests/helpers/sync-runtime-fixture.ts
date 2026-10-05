import type { DeltaItemRow } from '../../js/sync-delta-row-codec.js';

export const PROFILE_ID = 'profile-runtime';
export const PROFILE_QUERY = Symbol('profile-query');
export const ITEM_ROW_QUERY = Symbol('item-row-query');

// Incomplete fixture rows exercise the existing planners' conservative handling.
export type SyncFixtureRow = Record<string, unknown> & {
  id?: unknown;
  itemId?: string | undefined;
  payload?: string | undefined;
  isDeleted?: unknown;
};
type SyncFixtureCall = { table: string; args: SyncFixtureRow };
interface SyncFixtureOptions {
  profileRows?: SyncFixtureRow[];
  itemRows?: SyncFixtureRow[];
  completeProfileWrites?: boolean;
  failItemRows?: boolean;
}

export function deltaKey(profileId: string, arrayName: string) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

export function writeSnapshot(profileId: string, arrayName: string, snapshot: unknown) {
  localStorage.setItem(deltaKey(profileId, arrayName), JSON.stringify(snapshot));
}

export function makeEvolu({
  profileRows = [], itemRows = [], completeProfileWrites = true, failItemRows = false,
}: SyncFixtureOptions = {}) {
  const calls: { insert: SyncFixtureCall[]; update: SyncFixtureCall[] } = { insert: [], update: [] };
  const evolu = {
    getQueryRows(query: unknown) {
      if (query === PROFILE_QUERY) return profileRows as DeltaItemRow[];
      if (query === ITEM_ROW_QUERY) return itemRows as DeltaItemRow[];
      return [];
    },
    insert(table: string, args: SyncFixtureRow, options: { onComplete?: () => void } = {}) {
      calls.insert.push({ table, args });
      if (table === 'profileData') {
        profileRows.push({ id: `profile-row-${profileRows.length + 1}`, ...args });
        if (completeProfileWrites) options.onComplete?.();
        return;
      }
      if (failItemRows) throw new Error('item insert failed');
      itemRows.push({ id: `item-row-${itemRows.length + 1}`, ...args });
    },
    update(table: string, args: SyncFixtureRow, options: { onComplete?: () => void } = {}) {
      calls.update.push({ table, args });
      if (table === 'profileData') {
        const idx = profileRows.findIndex(row => row.id === args.id);
        if (idx >= 0) {
          profileRows[idx] = { ...profileRows[idx], ...args };
          if (completeProfileWrites) options.onComplete?.();
        }
        return;
      }
      if (failItemRows) throw new Error('item update failed');
      const idx = itemRows.findIndex(row => row.id === args.id);
      if (idx >= 0) itemRows[idx] = { ...itemRows[idx], ...args };
      else itemRows.push({ ...args });
    },
  };
  return { evolu, calls, profileRows, itemRows };
}
