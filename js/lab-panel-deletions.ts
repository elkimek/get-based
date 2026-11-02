// Per-panel remove/restore state is independent of the existing whole-date tombstone.
import type { LabEntryDraft } from './lab-entry.js';
import { identifyLabPanels, labPanelId, validLabPanelId } from './lab-panel-identity.js';
export interface LabPanelTombstone { deletedAt: number; restoredAt: number; updatedAt: number; }
export type LabPanelTombstones = Record<string, LabPanelTombstone>;
export function labDateDeletionState(data: Record<string, unknown>, date: string) {
  const deleted = data._deleted as Record<string, unknown> | undefined, stamps = data._deletedAt as Record<string, Record<string, unknown>> | undefined, clears = data._deletedClearedAt as Record<string, Record<string, unknown>> | undefined;
  return { deleted: Array.isArray(deleted?.entries) && deleted.entries.includes(date), deletedAt: stamps?.entries?.[date] ?? null, clearedAt: clears?.entries?.[date] ?? null };
}
export function filterRemovedLabDates(entries: readonly LabEntryDraft[], data: Record<string, unknown>) {
  return entries.filter(entry => {
    if (typeof entry.date !== 'string') return true;
    const status = labDateDeletionState(data, entry.date);
    const deletedAt = typeof status.deletedAt === 'number' && Number.isFinite(status.deletedAt) ? status.deletedAt : 0;
    const clearedAt = typeof status.clearedAt === 'number' && Number.isFinite(status.clearedAt) ? status.clearedAt : 0;
    return !status.deleted || clearedAt > deletedAt;
  });
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function labPanelTombstoneKey(panelId: string, date: unknown): string {
  if (!validLabPanelId(panelId) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('The lab panel address is invalid.');
  return `${panelId}.${date}`;
}
export function parseLabPanelTombstone(key: string, value: unknown): LabPanelTombstone {
  const dot = key.lastIndexOf('.'); labPanelTombstoneKey(key.slice(0, dot), key.slice(dot + 1));
  if (!object(value) || ![value.deletedAt, value.restoredAt, value.updatedAt].every(time => typeof time === 'number' && Number.isFinite(time) && time >= 0)
    || value.updatedAt !== Math.max(Number(value.deletedAt), Number(value.restoredAt))) throw new Error('Review the lab panel deletion history before editing.');
  return value as unknown as LabPanelTombstone;
}
export function mergeLabPanelTombstone(key: string, a: unknown, b: unknown): LabPanelTombstone {
  const left = a == null ? { deletedAt: 0, restoredAt: 0, updatedAt: 0 } : parseLabPanelTombstone(key, a);
  const right = b == null ? { deletedAt: 0, restoredAt: 0, updatedAt: 0 } : parseLabPanelTombstone(key, b);
  const deletedAt = Math.max(left.deletedAt, right.deletedAt), restoredAt = Math.max(left.restoredAt, right.restoredAt);
  return { ...(left.updatedAt > right.updatedAt ? { ...right, ...left } : { ...left, ...right }), deletedAt, restoredAt, updatedAt: Math.max(deletedAt, restoredAt) };
}
export function mergeLabPanelTombstones(a: unknown, b: unknown): LabPanelTombstones {
  if (a != null && !object(a) || b != null && !object(b)) throw new Error('Review the lab panel deletion history before editing.');
  const left = a as Record<string, unknown> | null | undefined, right = b as Record<string, unknown> | null | undefined;
  return Object.fromEntries([...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].map(key => [key, mergeLabPanelTombstone(key, left?.[key], right?.[key])]));
}
export function filterRemovedLabPanels(entries: readonly LabEntryDraft[], tombstones: unknown): LabEntryDraft[] {
  if (tombstones == null) return [...entries];
  const states = mergeLabPanelTombstones(tombstones, null);
  const identified = identifyLabPanels(entries);
  return identified.flatMap((panel, index) => {
    if (typeof panel.date !== 'string') return [panel];
    const status = states[labPanelTombstoneKey(labPanelId(panel), panel.date)];
    if (status && status.deletedAt >= status.restoredAt && status.deletedAt > 0) return [];
    const original = entries[index];
    return [original && entries.length === identified.length && original.panelId === panel.panelId && !Object.hasOwn(original, 'labPanelBundle') ? original : panel];
  });
}
export function recordLabPanelState(data: { labPanelTombstones?: LabPanelTombstones }, panel: LabEntryDraft, removed: boolean, now = Date.now()): void {
  if (!Number.isFinite(now) || now < 0) throw new Error('The lab panel change time is invalid.');
  const key = labPanelTombstoneKey(labPanelId(panel), panel.date), states = mergeLabPanelTombstones(data.labPanelTombstones, null), before = states[key];
  const time = Math.max(1, now, (before?.updatedAt || 0) + 1), next = { deletedAt: before?.deletedAt || 0, restoredAt: before?.restoredAt || 0, updatedAt: time };
  if (removed) next.deletedAt = time; else next.restoredAt = time;
  states[key] = next; data.labPanelTombstones = states;
}
