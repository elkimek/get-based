// Ordinary editors and reviewed commands share exact panel selection and original-value ownership.
import type { LabEntryDraft, LabMarkerSource } from './lab-entry.js';
import type { LabPanelTombstones } from './lab-panel-deletions.js';
import { deleteImportedArrayItems } from './data-merge.js';
import { labPanelId, migrateLabPanelIdentities, validLabPanelId } from './lab-panel-identity.js';
import { recordLabPanelState } from './lab-panel-deletions.js';
export interface LabPanelMutationData {
  [key: string]: unknown;
  entries?: LabEntryDraft[] | null;
  manualValues?: Record<string, unknown> | null;
  markerValueNotes?: Record<string, unknown> | null;
  labPanelTombstones?: LabPanelTombstones;
}
export interface LabManualOriginal { value: number | true; source: LabMarkerSource | null; }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function selectLabPanel(data: LabPanelMutationData, date: string, panelId?: string): LabEntryDraft | null {
  const panels = (data.entries || []).filter(panel => panel.date === date && (!panelId || labPanelId(panel) === panelId));
  if (panels.length > 1) throw new Error('Choose which sample to edit.');
  return panels[0] || null;
}
export function removeLabPanel(data: LabPanelMutationData, entry: LabEntryDraft, now = Date.now()): boolean {
  if (!data.entries?.includes(entry)) return false;
  migrateLabPanelIdentities(data);
  const index = data.entries.indexOf(entry);
  if (index < 0) throw new Error('Read this sample again before removing it.');
  if (!validLabPanelId(entry.panelId)) deleteImportedArrayItems(data, 'entries', row => row === entry);
  else { recordLabPanelState(data, entry, true, now); data.entries.splice(index, 1); }
  for (const key of Object.keys(entry.markers || {})) {
    if (data.entries.some(row => row.date === entry.date && Object.hasOwn(row.markers || {}, key))) continue;
    for (const map of [data.manualValues, data.markerValueNotes]) if (map && Object.hasOwn(map, `${key}:${entry.date}`)) map[`${key}:${entry.date}`] = null;
  }
  return true;
}
export function restoreLabPanel(data: LabPanelMutationData, entry: LabEntryDraft, now = Date.now()): void {
  const id = labPanelId(entry);
  if ((data.entries || []).some(row => labPanelId(row) === id)) throw new Error('This lab panel is already present.');
  const next = structuredClone(entry); next.panelId = id;
  recordLabPanelState(data, next, false, now); (data.entries ||= []).push(next);
}
export function labManualOriginal(data: LabPanelMutationData, entry: LabEntryDraft, key: string): LabManualOriginal | null {
  if (!Object.hasOwn(entry.markers || {}, key)) return null;
  if (entry.manualOriginals != null && !object(entry.manualOriginals)) throw new Error('Review the saved original values for this sample.');
  const stored = entry.manualOriginals?.[key];
  if (entry.manualOriginals && Object.hasOwn(entry.manualOriginals, key) && stored === null) return null;
  if (stored != null) {
    if (!object(stored) || !(stored.value === true || typeof stored.value === 'number' && Number.isFinite(stored.value)) || stored.source != null && !object(stored.source)) throw new Error('Review the saved original value for this sample.');
    return { ...stored, value: stored.value as number | true, source: stored.source ? structuredClone(stored.source) : null };
  }
  const legacy = data.manualValues?.[`${key}:${entry.date}`];
  if (!(legacy === true || typeof legacy === 'number' && Number.isFinite(legacy))) return null;
  const peers = (data.entries || []).filter(row => row.date === entry.date && Object.hasOwn(row.markers || {}, key));
  return peers.length === 1 ? { value: legacy, source: entry.markerSources?.[key] || null } : null;
}
export function rememberLabManualOriginal(data: LabPanelMutationData, entry: LabEntryDraft, key: string): void {
  migrateLabPanelIdentities(data);
  const old = labManualOriginal(data, entry, key), current = entry.markers?.[key], source = entry.markerSources?.[key];
  const imported = !!(source?.snapshotId || source?.file || !source && (entry.sourceFile || Array.isArray(entry.sourceFiles) && entry.sourceFiles.some(Boolean)));
  // An old edited value without an unambiguous original cannot become its own
  // guessed original simply because another correction was requested.
  if (!old && imported && source?.manuallyEdited) { entry.manualOriginals ||= {}; entry.manualOriginals[key] = null; return; }
  const original = old && !(old.value === true && imported && typeof current === 'number' && !source?.manuallyEdited) ? old
    : { value: imported && typeof current === 'number' && Number.isFinite(current) ? current : true, source: source ? structuredClone(source) : null };
  if (original.source) { original.source = structuredClone(original.source); delete original.source.manuallyEdited; }
  entry.manualOriginals ||= {}; entry.manualOriginals[key] = original;
  const peers = (data.entries || []).filter(row => row.date === entry.date && Object.hasOwn(row.markers || {}, key));
  if (peers.length <= 1) { data.manualValues ||= {}; data.manualValues[`${key}:${entry.date}`] = original.value; }
}
