// @ts-check
// Durable profile-side completion for wearable disconnects.

import { saveImportedDataForProfile } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';
import { deleteMeta, getMeta } from './wearables-store.js';

const PENDING_DISCONNECT_PREFIX = 'pending-profile-disconnect:v1:';

export function pendingWearableDisconnectMetaKey(adapterId) {
  return `${PENDING_DISCONNECT_PREFIX}${adapterId}`;
}

export function applyWearableDisconnectToProfile(importedData, adapterId, { deleteData = true } = {}) {
  if (!importedData || typeof importedData !== 'object') return false;
  if (!importedData.wearableConnections || typeof importedData.wearableConnections !== 'object') {
    importedData.wearableConnections = {};
  }
  delete importedData.wearableConnections[adapterId];
  if (!deleteData) return true;

  if (adapterId === 'google_health') {
    deleteImportedArrayItems(
      importedData, 'changeHistory',
      event => event?.type === 'wearable' && event?.source === adapterId,
      { forceTombstones: true },
    );
  }
  const summary = importedData.wearableSummary;
  if (summary && typeof summary === 'object') {
    if (summary.sources?.[adapterId]) delete summary.sources[adapterId];
    for (const [metricId, metric] of Object.entries(summary.metrics || {})) {
      if (metric?.primarySource === adapterId) delete summary.metrics[metricId];
    }
    if (Object.keys(importedData.wearableConnections).length === 0) delete importedData.wearableSummary;
  }
  return true;
}

export async function clearPendingWearableDisconnect(profileId, adapterId) {
  try {
    await deleteMeta(profileId, pendingWearableDisconnectMetaKey(adapterId));
    return true;
  } catch {
    // Leaving the journal is safe: recovery is idempotent and retries later.
    return false;
  }
}

export async function recoverPendingWearableDisconnect(profileId, importedData) {
  if (!profileId || !importedData || typeof importedData !== 'object') return false;
  const adapterId = 'google_health';
  const pending = await getMeta(profileId, pendingWearableDisconnectMetaKey(adapterId)).catch(() => null);
  if (!pending || pending.adapterId !== adapterId) return false;
  applyWearableDisconnectToProfile(importedData, adapterId, {
    deleteData: pending.deleteData !== false,
  });
  const persisted = await saveImportedDataForProfile(profileId, importedData);
  if (persisted === false) return false;
  await clearPendingWearableDisconnect(profileId, adapterId);
  return true;
}
