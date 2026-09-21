// @ts-check
// Raw menstrual-cycle IndexedDB backup and restore helpers.

import {
  getAllCycleImportMetaRaw,
  getAllCycleObservationsRaw,
  upsertCycleImportMetaBatchRaw,
  upsertCycleObservationBatchRaw,
} from './cycle-store.js';

export async function collectCycleBackup(profileIds) {
  const observations = {};
  const importMeta = {};
  for (const profileId of profileIds) {
    const perSource = {};
    for (const row of await getAllCycleObservationsRaw(profileId)) {
      if (!row?.source || !row?.date) continue;
      (perSource[row.source] ||= []).push(row);
    }
    if (Object.keys(perSource).length > 0) observations[profileId] = perSource;
    const metaRows = await getAllCycleImportMetaRaw(profileId);
    if (metaRows.length > 0) importMeta[profileId] = metaRows;
  }
  return { observations, importMeta };
}

export async function restoreCycleBackup(observations, importMeta) {
  let failures = 0;
  if (observations && typeof observations === 'object') {
    for (const [profileId, sources] of Object.entries(observations)) {
      for (const rows of Object.values(sources)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        try { await upsertCycleObservationBatchRaw(profileId, rows); } catch { failures += 1; }
      }
    }
  }
  if (importMeta && typeof importMeta === 'object') {
    for (const [profileId, rows] of Object.entries(importMeta)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      try { await upsertCycleImportMetaBatchRaw(profileId, rows); } catch { failures += 1; }
    }
  }
  if (failures) throw new Error(`${failures} cycle data batch(es) could not be restored.`);
}
