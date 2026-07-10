// @ts-check
// Raw menstrual-cycle IndexedDB backup and restore helpers.

export async function collectCycleBackup(profileIds) {
  const observations = {};
  const importMeta = {};
  let store;
  try { store = await import('./cycle-store.js'); } catch { return { observations, importMeta }; }
  for (const profileId of profileIds) {
    try {
      const perSource = {};
      for (const row of await store.getAllCycleObservationsRaw(profileId)) {
        if (!row?.source || !row?.date) continue;
        (perSource[row.source] ||= []).push(row);
      }
      if (Object.keys(perSource).length > 0) observations[profileId] = perSource;
      const metaRows = await store.getAllCycleImportMetaRaw(profileId);
      if (metaRows.length > 0) importMeta[profileId] = metaRows;
    } catch { /* continue collecting other profiles */ }
  }
  return { observations, importMeta };
}

export async function restoreCycleBackup(observations, importMeta) {
  let store;
  try { store = await import('./cycle-store.js'); } catch { return; }
  if (observations && typeof observations === 'object') {
    for (const [profileId, sources] of Object.entries(observations)) {
      for (const rows of Object.values(sources)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        try { await store.upsertCycleObservationBatchRaw(profileId, rows); } catch { /* continue */ }
      }
    }
  }
  if (importMeta && typeof importMeta === 'object') {
    for (const [profileId, rows] of Object.entries(importMeta)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      try { await store.upsertCycleImportMetaBatchRaw(profileId, rows); } catch { /* continue */ }
    }
  }
}
