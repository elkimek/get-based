import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { CustomMarkerInput, CustomMarkerCategory, CustomMarkerPlan } from './custom-marker-core.js';
import type { NativeCustomMarkerReview } from './custom-marker-store.js';
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import { isCustomMarkerId } from './marker-schema.js';
import { validCustomMarkerKey, isBuiltinMarkerKey } from './custom-marker-lifecycle.js';
import { validateMarkerRange } from './marker-range-core.js';

export interface CustomMarkerCreationSnapshot { version: 1; markerId: string; categories: CustomMarkerCategory[]; preview?: { plan: CustomMarkerPlan; revision: string } }
export const customMarkerFields = { name: 'Required explicit marker name for add, max 160 characters.', unit: 'Required explicit canonical/input unit label, max 80 characters; empty string deliberately means dimensionless. No inferred conversions.', category: 'Exact existing category key from choices; choose this OR newCategory.', newCategory: 'Explicit new category name, max 120 characters; choose this OR category.', refMin: 'Finite reference minimum or null; omitted means unknown.', refMax: 'Finite reference maximum or null; omitted means unknown.', optimalMin: 'Finite optimal minimum or null; omitted means unknown.', optimalMax: 'Finite optimal maximum or null; omitted means unknown.' };
export function customMarkerInput(patch: Record<string, unknown>): CustomMarkerInput {
  validateFieldNames(patch, Object.keys(customMarkerFields));
  for (const [key, max] of [['name', 160], ['unit', 80], ['category', 128], ['newCategory', 120]] as const) {
    const value = patch[key]; if (value === undefined && key !== 'name' && key !== 'unit') continue;
    if (typeof value !== 'string' || key !== 'unit' && !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Supply a bounded explicit marker name, unit and category.');
  }
  if (!!patch.category === !!patch.newCategory) throw new Error('Choose one existing category or one new category name.');
  for (const key of ['refMin', 'refMax', 'optimalMin', 'optimalMax']) if (Object.hasOwn(patch, key) && patch[key] !== null && !(typeof patch[key] === 'number' && Number.isFinite(patch[key]))) throw new Error('Supply finite marker bounds or null for unknown bounds.');
  validateMarkerRange(patch.refMin ?? null, patch.refMax ?? null); validateMarkerRange(patch.optimalMin ?? null, patch.optimalMax ?? null);
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as unknown as CustomMarkerInput;
}
export function customMarkerCreationSnapshot(value: unknown): CustomMarkerCreationSnapshot {
  const source = agentDataObject(value);
  if (source.version !== 1 || typeof source.markerId !== 'string' || !isCustomMarkerId(source.markerId) || !Array.isArray(source.categories) || source.categories.length > 1000) throw new Error('Read a fresh custom marker creation snapshot.');
  for (const row of source.categories) { const category = agentDataObject(row); if (typeof category.key !== 'string' || typeof category.label !== 'string' || typeof category.group !== 'string') throw new Error('Invalid marker category choices.'); }
  return source as unknown as CustomMarkerCreationSnapshot;
}
export function customMarkerRemovalSnapshot(value: unknown): NativeCustomMarkerReview {
  const source = agentDataObject(value), category = agentDataObject(source.category), definition = agentDataObject(source.definition), effects = agentDataObject(source.effects);
  if (source.version !== 1 || !validCustomMarkerKey(source.markerKey) || isBuiltinMarkerKey(source.markerKey) || typeof source.markerId !== 'string' || !isCustomMarkerId(source.markerId)
    || typeof source.name !== 'string' || typeof source.definitionName !== 'string' || typeof source.unit !== 'string' || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision)
    || category.key !== source.markerKey.split('.')[0] || typeof category.label !== 'string' || typeof category.group !== 'string') throw new Error('Read the exact current custom marker first.');
  validateMarkerRange(definition.refMin, definition.refMax);
  for (const key of ['results', 'samples', 'emptiedSamples', 'datedNotes', 'manualEdits', 'markerNote', 'ranges', 'labels', 'placements']) if (typeof effects[key] !== 'number' || !Number.isSafeInteger(effects[key]) || effects[key] < 0) throw new Error('Read a fresh removal preview.');
  if (effects.originalReportsKept !== true || effects.otherMarkersKept !== true) throw new Error('Read a fresh removal preview.');
  return source as unknown as NativeCustomMarkerReview;
}
export function displayCustomMarker(value: unknown): { markerKey: string; markerName: string; unit: string; category: CustomMarkerCategory; refMin: number | null; refMax: number | null; optimalMin?: unknown; optimalMax?: unknown; effects?: NativeCustomMarkerReview['effects'] } | null {
  if (value === null) return null;
  const source = agentDataObject(value);
  if (source.markerId && source.categories) return null;
  if (typeof source.markerName === 'string' && validCustomMarkerKey(source.markerKey)) {
    const category = agentDataObject(source.category); validateMarkerRange(source.refMin, source.refMax);
    return { markerKey: source.markerKey, markerName: source.markerName, unit: String(source.unit), category: { key: String(category.key), label: String(category.label), group: String(category.group) },
      refMin: source.refMin as number | null, refMax: source.refMax as number | null, ...(Object.hasOwn(source, 'optimalMin') ? { optimalMin: source.optimalMin, optimalMax: source.optimalMax } : {}), ...(source.effects ? { effects: source.effects as NativeCustomMarkerReview['effects'] } : {}) };
  }
  if (source.definitionName) {
    const record = customMarkerRemovalSnapshot(source);
    return { markerKey: record.markerKey, markerName: record.name, unit: record.unit, category: record.category, ...record.definition, effects: record.effects };
  }
  const plan = source as unknown as CustomMarkerPlan;
  if (!validCustomMarkerKey(plan.markerKey) || !plan.definition) throw new Error('Invalid custom marker preview.');
  return { markerKey: plan.markerKey, markerName: plan.name, unit: plan.unit, category: plan.category, refMin: plan.definition.refMin as number | null, refMax: plan.definition.refMax as number | null, ...(plan.optimal ? { optimalMin: plan.optimal.optimalMin, optimalMax: plan.optimal.optimalMax } : {}) };
}
export function projectCustomMarker(proposal: AgentDataProposal) {
  const baseline: unknown = JSON.parse(proposal.baseline), patch = parseAgentDataPatch(proposal.patch);
  if (proposal.operation === 'add') {
    customMarkerInput(patch); const snapshot = customMarkerCreationSnapshot(baseline), preview = snapshot.preview;
    if (!preview || preview.plan.markerKey !== proposal.recordId || preview.plan.markerId !== snapshot.markerId || !/^[a-f0-9]{64}$/.test(preview.revision)) throw new Error('Prepare a fresh native marker creation preview.');
    return { before: null, after: displayCustomMarker(preview.plan) };
  }
  if (proposal.operation !== 'remove') throw new Error('Custom markers support add or reviewed native removal.');
  validateFieldNames(patch, []); const before = customMarkerRemovalSnapshot(baseline);
  if (proposal.recordId !== before.markerKey) throw new Error('Read this exact custom marker first.');
  return { before: displayCustomMarker(before), after: null };
}
export function describeCustomMarker(value: unknown): string {
  if (value === null) return 'Not recorded / removed';
  const record = displayCustomMarker(value) || agentDataObject(value), category = agentDataObject(record.category), effects = record.effects ? agentDataObject(record.effects) : null;
  return [`${record.markerName} · ${record.unit || 'dimensionless'} · ${category.label}`, `Reference: ${record.refMin ?? 'unknown'} – ${record.refMax ?? 'unknown'}`,
    ...(Object.hasOwn(record, 'optimalMin') ? [`Optimal: ${record.optimalMin ?? 'unknown'} – ${record.optimalMax ?? 'unknown'}`] : []),
    ...(effects ? [`Removal: ${effects.results} result(s), ${effects.datedNotes} dated note(s), ${effects.manualEdits} manual edit record(s), ${effects.emptiedSamples} empty sample(s), and this marker’s settings.`, 'Other markers, original reports, exports and backups are kept. Apply opens native deletion confirmation.'] : [])].join('\n');
}
