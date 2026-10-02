interface SyncSchemaTypes<Definition> {
  id: (name: string) => Definition;
  nullOr: (definition: Definition) => Definition;
  NonEmptyString: Definition;
}
interface SyncQuerySelection {
  selectAll(): SyncQuerySelection;
  where(column: 'isDeleted', operator: 'is not' | '=', value: number): SyncQuerySelection;
}
interface SyncQueryDatabase {
  selectFrom(table: 'profileData' | 'itemRow'): SyncQuerySelection;
}
interface SyncQueryClient<Query> {
  createQuery(select: (db: SyncQueryDatabase) => SyncQuerySelection): Query;
}

// sync-schema.js - Evolu schema and query setup for sync.

export function createSyncSchema<Definition>({
  id,
  nullOr,
  NonEmptyString,
}: SyncSchemaTypes<Definition>) {
  const ProfileDataId = id("ProfileData");
  const ItemRowId = id("ItemRow");

  // Per-array delta table (Phase 1 of the CRDT-delta refactor). Each row
  // holds one item from one importedData surface. Push side dual-writes
  // changed items; pull side overlays rows before the fat-blob merge.
  return {
    profileData: {
      id: ProfileDataId,
      profileId: NonEmptyString,
      dataJson: NonEmptyString,
      syncedAt: nullOr(NonEmptyString),
    },
    itemRow: {
      id: ItemRowId,
      profileId: NonEmptyString,
      arrayName: NonEmptyString,
      itemId: NonEmptyString,
      payload: NonEmptyString,
      syncedAt: nullOr(NonEmptyString),
    },
  };
}

export function createSyncQueries<Query>(evolu: SyncQueryClient<Query>) {
  // Query all live profile data rows.
  const profileQuery = evolu.createQuery((db) =>
    db.selectFrom("profileData")
      .selectAll()
      .where("isDeleted", "is not", 1)
  );

  // Companion query that returns only tombstoned rows. Used during pull to
  // apply remote profile deletes locally.
  const tombstoneQuery = evolu.createQuery((db) =>
    db.selectFrom("profileData")
      .selectAll()
      .where("isDeleted", "=", 1)
  );

  // Per-array delta rows, live and tombstoned. profileId is filtered later
  // at merge time so one subscribed query can cover current-profile changes.
  const itemRowQuery = evolu.createQuery((db) =>
    db.selectFrom("itemRow").selectAll()
  );

  return { profileQuery, tombstoneQuery, itemRowQuery };
}
