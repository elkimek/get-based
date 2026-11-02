// Panels keep their own identity; a collection date is only the sync transport address.
import { sha256 } from '../vendor/sha256.js';
import type { LabEntryDraft } from './lab-entry.js';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const bundleKey = 'labPanelBundle';
export const labPanelJSON = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => object(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const validLabPanelId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
function digest(value: string): string { return [...sha256(new TextEncoder().encode(value))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function withoutIdentity(entry: LabEntryDraft) { const { panelId: _id, ...rest } = entry; return rest; }
export function labPanelId(entry: LabEntryDraft): string { return validLabPanelId(entry.panelId) ? entry.panelId : `legacy_${digest(labPanelJSON(withoutIdentity(entry)))}`; }
export function labSampleIdentityRows(data: { entries?: LabEntryDraft[] | null }, id: string) {
  return identifyLabPanels(data.entries || []).filter(entry => labPanelId(entry) === id);
}
export function labPanelEvidence(entry: LabEntryDraft): string | null {
  const snapshots = [...new Set(Object.values(entry.markerSources || {}).flatMap(source => typeof source?.snapshotId === 'string' && source.snapshotId ? [source.snapshotId] : []))].sort();
  const files = [...new Set([entry.sourceFile, ...(Array.isArray(entry.sourceFiles) ? entry.sourceFiles : []),
    ...Object.values(entry.markerSources || {}).map(source => source?.file)].filter((value): value is string => typeof value === 'string' && !!value))].sort();
  if (!snapshots.length && !files.length) return null;
  return labPanelJSON({ snapshots, files });
}
export function labPanelsHaveDistinctCollections(a: LabEntryDraft, b: LabEntryDraft): boolean {
  for (const [left, right] of [[a.specimen, b.specimen], [a.context?.sampleTime, b.context?.sampleTime]]) {
    if (typeof left === 'string' && left.trim() && typeof right === 'string' && right.trim() && left.trim().toLowerCase() !== right.trim().toLowerCase()) return true;
  }
  // A legacy date row can aggregate several reports. Different filenames alone
  // do not establish a different specimen; named panels never use this fallback.
  return false;
}
/** Reject unknown/recursive wire bundles rather than silently keeping just their first panel. */
export function expandLabPanelRows(entries: readonly LabEntryDraft[]): LabEntryDraft[] {
  return entries.flatMap(entry => {
    if (!object(entry) || !Object.hasOwn(entry, bundleKey)) return [entry];
    const bundle = entry[bundleKey];
    if (!object(bundle) || bundle.version !== 1 || !Array.isArray(bundle.additional) || bundle.additional.some(value => !object(value) || value.date !== entry.date || Object.hasOwn(value, bundleKey))) throw new Error('Unsupported lab panel bundle. No panels were merged.');
    const { labPanelBundle: _bundle, ...first } = entry;
    return [first, ...bundle.additional as LabEntryDraft[]];
  });
}
/** Deterministic on old replicas; once assigned, IDs survive values/context/source corrections. */
export function identifyLabPanels(entries: readonly LabEntryDraft[]): LabEntryDraft[] {
  const rows = expandLabPanelRows(entries).map(entry => ({ ...entry })), days = new Map<unknown, LabEntryDraft[]>();
  for (const row of rows) { if (!days.has(row.date)) days.set(row.date, []); days.get(row.date)!.push(row); }
  for (const panels of days.values()) {
    if (panels.length < 2) continue;
    const missing = panels.filter(panel => !validLabPanelId(panel.panelId)), counts = new Map<string, number>();
    for (const panel of missing) {
      const identity = labPanelJSON(withoutIdentity(panel)), hash = digest(identity), occurrence = counts.get(hash) || 0;
      counts.set(hash, occurrence + 1);
      panel.panelId = `legacy_${hash}${occurrence ? `_${occurrence}` : ''}`;
    }
  }
  return rows;
}
export function migrateLabPanelIdentities(data: { entries?: LabEntryDraft[] | null }): void {
  if (!Array.isArray(data.entries)) return;
  const next = identifyLabPanels(data.entries);
  // Existing editor references remain attached during normal in-memory migrations.
  if (next.length === data.entries.length && !data.entries.some(entry => Object.hasOwn(entry, bundleKey))) {
    next.forEach((entry, index) => { if (validLabPanelId(entry.panelId)) data.entries![index]!.panelId = entry.panelId; });
  } else data.entries = next;
}
/** One date carrier per sync row; its top panel also remains legible to older readers. */
export function packLabPanelRows(entries: readonly LabEntryDraft[]): LabEntryDraft[] {
  const days = new Map<unknown, LabEntryDraft[]>(), loose: LabEntryDraft[] = [];
  for (const panel of identifyLabPanels(entries)) {
    if (typeof panel.date !== 'string' || !panel.date) { loose.push(panel); continue; }
    if (!days.has(panel.date)) days.set(panel.date, []); days.get(panel.date)!.push(panel);
  }
  return [...days.values()].map(panels => panels.length === 1 ? panels[0]!
    : { ...panels[0]!, labPanelBundle: { version: 1, additional: panels.slice(1) } }).concat(loose);
}
