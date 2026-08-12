// @ts-check
// pdf-import-persistence.js - durable imported-data save helpers for PDF import flows

import { state } from './state.js';
import { showNotification, showPromptDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { clearTombstone, deleteImportedArrayItems, recordTombstone } from './data-merge.js';
import { deleteLabEntryMarker, isSnapshotDerivedHOMAIR } from './lab-entry.js';
import { refreshImportedDataViewsRuntime } from './pdf-import-review-runtime.js';

export function snapshotImportedData() {
  try { return JSON.stringify(state.importedData || {}); } catch { return null; }
}

export function restoreImportedDataSnapshot(snapshot) {
  if (!snapshot) return;
  try { state.importedData = JSON.parse(snapshot); } catch {}
}

export function refreshImportedDataViews() {
  // buildSidebar resets .active to Dashboard; use state.currentView.
  refreshImportedDataViewsRuntime(state.currentView || 'dashboard');
}

function isValidISOCalendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}


export async function removeImportedEntry(date) {
  if (!date) return false;
  const entries = state.importedData?.entries || [];
  const entry = entries.find(e => e.date === date);
  if (!entry) return false;
  const rollback = snapshotImportedData();
  const now = Date.now();
  const markerKeys = Object.keys(entry.markers || {});
  let removedCount = 0;
  const removedKeys = markerKeys.filter(k => {
    if (isSnapshotDerivedHOMAIR(entry, k)) return false;
    const src = entry.markerSources?.[k];
    return !src || !src.snapshotId;
  });
  // Only delete markers NOT tagged with a snapshotId (legacy/manual markers)
  if (removedKeys.length > 0) {
    for (const k of removedKeys) {
      const result = deleteLabEntryMarker(entry, k, { now });
      if (result.changed) removedCount++;
    }
  }
  // Delete manual values only for markers that were actually removed
  const manualValues = state.importedData.manualValues || {};
  for (const k of Object.keys(manualValues)) {
    if (k.endsWith(':' + date) && removedKeys.includes(k.split(':')[0])) {
      delete manualValues[k];
    }
  }
  // If no markers remain, delete the whole entry; otherwise keep it for remaining snapshots
  if (Object.keys(entry.markers).length === 0) {
    recordTombstone(state.importedData, 'entries', date);
    deleteImportedArrayItems(state.importedData, 'entries', e => e.date === date);
  } else {
    entry.updatedAt = now;
  }
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    return false;
  }
  refreshImportedDataViews();
  showNotification(`Removed ${removedCount} marker${removedCount !== 1 ? 's' : ''} from ${date}`, 'info');
  return true;
}

export async function renameImportedEntryDate(oldDate) {
  const entries = state.importedData?.entries;
  const entry = entries?.find(e => e.date === oldDate);
  if (!entry) return false;
  // Prevent renaming entries that contain snapshot-tagged markers — use Review & Edit on the snapshot instead
  const hasSnapshotMarkers = Object.keys(entry.markers || {}).some(k => {
    const src = entry.markerSources?.[k];
    return !!src?.snapshotId;
  });
  if (hasSnapshotMarkers) {
    showNotification('Entries with AI-imported markers cannot be renamed from here. Use Review & Edit on the import snapshot.', 'error', 5000);
    return false;
  }
  const newDate = await showPromptDialog(
    `Edit collection date (was ${oldDate})`,
    { defaultValue: oldDate, inputType: 'date', okLabel: 'Save' }
  );
  if (!newDate || newDate === oldDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    showNotification('Date must be YYYY-MM-DD', 'error');
    return false;
  }
  // Format-only regex accepts logically invalid dates. Round-trip through Date
  // to reject those without applying the local timezone.
  if (!isValidISOCalendarDate(newDate)) {
    showNotification('That date doesn\'t exist on the calendar.', 'error');
    return false;
  }
  if (entries.some(e => e.date === newDate)) {
    showNotification(`Another entry already exists on ${newDate} \u2014 remove it first, then try again.`, 'error', 5000);
    return false;
  }
  const rollback = snapshotImportedData();
  recordTombstone(state.importedData, 'entries', oldDate);
  clearTombstone(state.importedData, 'entries', newDate);
  entry.date = newDate;
  entry.updatedAt = Date.now();
  // manualValues are keyed markerKey:date; remap to preserve provenance.
  const manualValues = state.importedData.manualValues;
  if (manualValues) {
    const suffixOld = ':' + oldDate;
    const suffixNew = ':' + newDate;
    for (const k of Object.keys(manualValues)) {
      if (k.endsWith(suffixOld)) {
        manualValues[k.slice(0, -suffixOld.length) + suffixNew] = manualValues[k];
        delete manualValues[k];
      }
    }
  }
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    return false;
  }
  refreshImportedDataViews();
  showNotification(`Date changed from ${oldDate} to ${newDate}`, 'success');
  return true;
}
