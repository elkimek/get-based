// Presentation snapshots keep persistence, provenance and calculations in services.
import { state } from './state.js';
import { isSnapshotDerivedHOMAIR } from './lab-entry.js';
import { formatCost, getProfileUsage, getGlobalUsage } from './schema.js';
import type { StoredProfileRecord } from './profile-list-store.js';
import type { DataEntriesSnapshot, AIUsageSnapshot, UsageRowView } from './settings-records-contract.js';

interface StoredImportRecord {
  id?: unknown; date?: unknown; markerCount?: unknown; markers?: readonly unknown[];
  fileName?: unknown; type?: unknown; importedAt?: unknown; costInfo?: { modelId?: unknown };
}
function text(value: unknown): string { return value == null ? '' : String(value); }
function displayDate(value: unknown): string {
  return new Date(text(value || '') + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function markerCount(value: unknown): string { return `${value} marker${value === 1 ? '' : 's'}`; }
export function formatSettingsTokens(value: unknown): string {
  if ((value as number) >= 1_000_000) return ((value as number) / 1_000_000).toFixed(1) + 'M';
  if ((value as number) >= 1_000) return ((value as number) / 1_000).toFixed(1) + 'k';
  return String(value);
}

export function getDataEntriesSnapshot(): DataEntriesSnapshot {
  const data = state.importedData;
  const snapshots = (data?.importSnapshots || []) as readonly StoredImportRecord[];
  const entries = (data?.entries || []).filter(entry => Object.keys(entry?.markers || {}).length > 0);
  const imports = [...snapshots].sort((a, b) => Number(b.importedAt || 0) - Number(a.importedAt || 0)).map(snap => ({
    id: text(snap.id), date: displayDate(snap.date), count: markerCount(snap.markerCount || (snap.markers || []).length),
    fileName: text(snap.fileName || 'Unknown file'), type: text(snap.type || 'import'),
    model: text(snap.costInfo?.modelId || ''),
    importedTime: Number.isFinite(snap.importedAt)
      ? new Date(snap.importedAt as number).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
  }));
  const manualValues: Record<string, unknown> = data?.manualValues || {};
  const manual = entries.flatMap(entry => {
    const keys = Object.keys(entry.markers || {});
    const manualKeys = keys.filter(key => manualValues[key + ':' + entry.date]);
    const otherKeys = keys.filter(key => !isSnapshotDerivedHOMAIR(entry, key) && !entry.markerSources?.[key]?.snapshotId);
    if (!otherKeys.length) return [];
    const isManual = otherKeys.length === manualKeys.length;
    return [{ date: entry.date, dateLabel: displayDate(entry.date), count: markerCount(otherKeys.length),
      source: isManual ? 'manual markers not tied to an import file'
        : `legacy markers not tied to an import file${entry.sourceFile ? ' · ' + text(entry.sourceFile) : ''}`,
      manual: isManual, dateLocked: keys.some(key => !!entry.markerSources?.[key]?.snapshotId) }];
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { empty: !snapshots.length && !entries.length, imports, manual };
}

function usageRow(label: string, usage: ReturnType<typeof getProfileUsage>): UsageRowView {
  return { label, cost: formatCost(usage.totalCost),
    requests: `${usage.requestCount} request${usage.requestCount !== 1 ? 's' : ''}`,
    tokens: formatSettingsTokens(usage.totalInputTokens + usage.totalOutputTokens) };
}
export function getAIUsageSnapshot(): AIUsageSnapshot {
  const profile = getProfileUsage(state.currentProfile);
  const profiles: readonly StoredProfileRecord[] = state.profiles || [];
  const name = text(profiles.find(item => item.id === state.currentProfile)?.name || 'Current profile');
  return { profile: usageRow(name, profile), global: usageRow('All profiles', getGlobalUsage()), canReset: profile.requestCount > 0 };
}
