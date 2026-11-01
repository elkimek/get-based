import { agentDataObject, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { MarkerRangeBounds, MarkerRangeKind } from './marker-range-core.js';
import { validateMarkerRange } from './marker-range-core.js';
import { validLabToolMarkerKey } from './lab-tool-markers.js';
import { convertUnitInputToCanonical } from './unit-profiles.js';

export interface MarkerRangeValue extends MarkerRangeBounds { source: string }
export interface MarkerRangeRecord extends MarkerRangeValue {
  id: string; markerKey: string; markerName: string; category: string; kind: MarkerRangeKind;
  unit: string; inputUnits: string[]; canRevert: boolean; hasOverride: boolean; hasSavedOriginal: boolean; restore: MarkerRangeValue;
}
export interface MarkerRangeSnapshot { version: 1; record: MarkerRangeRecord; defaults: MarkerRangeValue; revision: string }
export const markerRangeFields = { min: 'Finite minimum, or null for an open bound; omitted retains the current minimum.', max: 'Finite maximum, or null for an open bound; omitted retains the current maximum.', unit: 'Required with numeric/open-bound edits. Use an exact inputUnits value; empty string means dimensionless.' };
export function markerRangeAddress(id: string) {
  const dot = id.indexOf('.'), kind = id.slice(0, dot), markerKey = id.slice(dot + 1);
  if (!['reference', 'optimal'].includes(kind) || !validLabToolMarkerKey(markerKey)) throw new Error('Read the exact reference or optimal range ID first.');
  return { kind: kind as MarkerRangeKind, markerKey };
}
export function parseMarkerRangeSnapshot(value: unknown): MarkerRangeSnapshot {
  const source = agentDataObject(value), record = agentDataObject(source.record), defaults = agentDataObject(source.defaults);
  if (source.version !== 1 || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision)
    || typeof record.id !== 'string' || typeof record.markerKey !== 'string' || typeof record.markerName !== 'string'
    || typeof record.unit !== 'string' || !Array.isArray(record.inputUnits) || !record.inputUnits.every(unit => typeof unit === 'string')
    || typeof record.source !== 'string' || typeof record.canRevert !== 'boolean' || typeof record.hasOverride !== 'boolean' || typeof record.hasSavedOriginal !== 'boolean') throw new Error('Read this marker range again.');
  const address = markerRangeAddress(record.id), restore = agentDataObject(record.restore);
  if (record.markerKey !== address.markerKey || record.kind !== address.kind || typeof restore.source !== 'string' || typeof defaults.source !== 'string') throw new Error('The reviewed range identity changed.');
  validateMarkerRange(record.min, record.max); validateMarkerRange(restore.min, restore.max); validateMarkerRange(defaults.min, defaults.max);
  return source as unknown as MarkerRangeSnapshot;
}
export function displayMarkerRange(value: unknown): MarkerRangeRecord {
  const source = agentDataObject(value);
  return source.version === 1 ? parseMarkerRangeSnapshot(source).record : source as unknown as MarkerRangeRecord;
}
export function projectMarkerRange(proposal: AgentDataProposal, patch: Record<string, unknown>) {
  const snapshot = parseMarkerRangeSnapshot(JSON.parse(proposal.baseline)), before = snapshot.record;
  if (before.id !== proposal.recordId) throw new Error('Read the exact intended range first.');
  if (proposal.operation === 'revert') {
    validateFieldNames(patch, []);
    if (!before.canRevert) throw new Error('Only a manual range override can be reverted through chat. Its imported or built-in range is kept.');
    const after = { ...before, ...before.restore, canRevert: false, hasOverride: before.hasSavedOriginal, hasSavedOriginal: false, restore: { ...snapshot.defaults } };
    return { before, after };
  }
  if (proposal.operation !== 'update') throw new Error('A marker range supports update or revert.');
  validateFieldNames(patch, ['min', 'max', 'unit']);
  if (!Object.hasOwn(patch, 'min') && !Object.hasOwn(patch, 'max') || typeof patch.unit !== 'string' || !before.inputUnits.includes(patch.unit)) throw new Error('Supply the stated bounds and an exact supported unit.');
  const convert = (bound: 'min' | 'max') => {
    if (!Object.hasOwn(patch, bound)) return before[bound];
    const value = patch[bound];
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Range bounds must be finite numbers or explicit open bounds.');
    return patch.unit === before.unit ? value : convertUnitInputToCanonical(before.markerKey, value, patch.unit as string, 'EU', before.unit);
  };
  const min = convert('min'), max = convert('max'); validateMarkerRange(min, max);
  const { min: oldMin, max: oldMax, source } = before;
  const restore = before.hasSavedOriginal || before.source === 'manual' ? before.restore : { min: oldMin, max: oldMax, source };
  return { before, after: { ...before, min, max, source: 'manual', canRevert: true, hasOverride: true,
    hasSavedOriginal: before.hasSavedOriginal || before.hasOverride && before.source !== 'manual', restore } };
}
export function describeMarkerRange(value: unknown) {
  const row = displayMarkerRange(value), bounds = (range: MarkerRangeValue) => `${range.min ?? 'open'}–${range.max ?? 'open'} ${row.unit || '(dimensionless)'} · ${range.source}`;
  return `${row.markerName} · ${row.markerKey}\n${row.kind === 'reference' ? 'Reference' : 'Optimal'}: ${bounds(row)}\n${row.canRevert ? `Revert restores: ${bounds(row.restore)}` : 'Imported and built-in range evidence is kept.'}\nApplies across this profile. Recorded results and calculations stay unchanged.`;
}
