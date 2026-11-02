import { nativeRecordRevision as customMarkerRevision } from './record-revision.js';
export { customMarkerRevision };
// Durable native commands. Callers supply their own UI/turn lifetime and policy.
import type { ProfileData } from '../types/app-state.js';
import type { CustomMarkerInput, CustomMarkerPlan } from './custom-marker-core.js';
import { customMarkerMap, customMarkerCatalog, customMarkerDefinitionId, customMarkerState, customMarkerRemovalEffects, planCustomMarkerCreation, applyCustomMarkerCreation, removeCustomMarkerData } from './custom-marker-core.js';
import { isBuiltinMarkerKey, validCustomMarkerKey, normalizeCustomMarkerLifecycle } from './custom-marker-lifecycle.js';
import { createCustomMarkerId } from './custom-marker-identity.js';
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { showConfirmDialog } from './utils.js';

export class CustomMarkerConflict extends Error { readonly noChangeApplied = true; }
function fail(message: string): never { throw new CustomMarkerConflict(message); }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function scope(profileId: string, allowed?: () => boolean) {
  const root = state.importedData;
  const current = () => state.currentProfile === profileId && state.importedData === root && isActiveProfileDataOwner(profileId, root) && allowed?.() !== false;
  if (!current()) fail('The originating profile or editor changed. Nothing was applied.');
  return { root, current, check: () => { if (!current()) fail('The originating profile or editor changed. Nothing was applied.'); } };
}

export interface NativeCustomMarkerReview {
  version: 1; markerKey: string; markerId: string; name: string; definitionName: string; unit: string;
  category: { key: string; label: string; group: string }; definition: { refMin: number | null; refMax: number | null };
  effects: ReturnType<typeof customMarkerRemovalEffects>; revision: string;
}
export async function reviewNativeCustomMarker(data: ProfileData, key: string): Promise<NativeCustomMarkerReview> {
  if (!validCustomMarkerKey(key) || isBuiltinMarkerKey(key)) fail('Choose an exact custom marker; built-in markers cannot be removed here.');
  const definition = customMarkerMap(data, 'customMarkers')[key], id = customMarkerDefinitionId(data, key), catalog = customMarkerCatalog(data), categoryKey = key.split('.')[0]!, category = catalog[categoryKey];
  if (!object(definition) || !id || !category || !Object.hasOwn(category.markers, key.split('.')[1]!)) fail('This custom marker is unavailable or was removed.');
  if (Object.entries(customMarkerMap(data, 'customMarkers')).filter(([other]) => customMarkerDefinitionId(data, other) === id).length !== 1) fail('This custom marker identity is ambiguous. Review it in its native editor.');
  const name = typeof data.markerLabels?.[key] === 'string' ? data.markerLabels[key]! : definition.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 160 || typeof definition.name !== 'string' || typeof definition.unit !== 'string' || definition.unit.length > 80) fail('Review this marker definition in its native editor.');
  return { version: 1, markerKey: key, markerId: id, name, definitionName: definition.name, unit: definition.unit,
    category: { key: categoryKey, label: category.label, group: String(category.contextGroup || category.group || category.label) },
    definition: { refMin: typeof definition.refMin === 'number' ? definition.refMin : null, refMax: typeof definition.refMax === 'number' ? definition.refMax : null },
    effects: customMarkerRemovalEffects(data, key), revision: await customMarkerRevision(customMarkerState(data, key)) };
}
export async function readNativeCustomMarker(profileId: string, key: string, allowed?: () => boolean) {
  const owner = scope(profileId, allowed), data = await readAgentProfileRecords(profileId), result = await reviewNativeCustomMarker(data, key); owner.check(); return result;
}
export async function readNativeCustomMarkerCreation(profileId: string, allowed?: () => boolean) {
  const owner = scope(profileId, allowed), data = await readAgentProfileRecords(profileId), categories = customMarkerCatalog(data);
  owner.check(); return { markerId: createCustomMarkerId(customMarkerMap(data, 'customMarkers')), categories: Object.entries(categories).map(([key, value]) => ({ key, label: value.label, group: String(value.contextGroup || value.group || value.label) })) };
}
export async function previewNativeCustomMarkerCreation(profileId: string, input: CustomMarkerInput, markerId: string, allowed?: () => boolean) {
  const owner = scope(profileId, allowed), data = await readAgentProfileRecords(profileId), plan = planCustomMarkerCreation(data, input, markerId);
  const revision = await customMarkerRevision(customMarkerState(data, plan.markerKey)); owner.check(); return { plan, revision };
}
interface CreateOptions { markerId?: string; expected?: { plan: CustomMarkerPlan; revision: string }; allowed?: () => boolean; icon?: string }
export async function commitNativeCustomMarkerCreation(profileId: string, input: CustomMarkerInput, options: CreateOptions = {}) {
  const owner = scope(profileId, options.allowed), base = await readAgentProfileRecords(profileId); owner.check();
  const id = options.markerId || createCustomMarkerId(customMarkerMap(base, 'customMarkers')), plan = planCustomMarkerCreation(base, input, id), before = customMarkerState(base, plan.markerKey);
  if (Object.hasOwn(normalizeCustomMarkerLifecycle(base.customMarkerLifecycle), id)) fail('This marker identity has removal history. Read a new creation snapshot.');
  if (options.expected && (!profileDataValuesEqual(plan, options.expected.plan) || await customMarkerRevision(before) !== options.expected.revision)) fail('This category or marker review changed. Read a fresh creation snapshot.');
  const allowed = () => owner.current() && profileDataValuesEqual(customMarkerState(owner.root, plan.markerKey), before);
  if (!allowed()) fail('Save or resolve native marker edits before creating this marker. Your input is kept.');
  const next = structuredClone(base); applyCustomMarkerCreation(next, plan, options.icon);
  let conflict = false;
  const saved = await saveImportedDataForProfile(profileId, next, { baseData: base, forceProfileScope: true,
    expectedCustomMarkerStates: [{ markerKey: plan.markerKey, value: before }], onContextFieldConflict: () => { conflict = true; }, canCommit: allowed });
  if (!saved) { if (conflict || !owner.current()) fail('The marker registry or editor changed before saving. Nothing was applied.'); throw new Error('The custom marker could not be saved. Check its native editor before retrying.'); }
  try { notifyProfileDataContextChanged(profileId); } catch { /* Already durable. */ }
  return plan;
}
export async function commitNativeCustomMarkerRemoval(profileId: string, expected: NativeCustomMarkerReview, allowed?: () => boolean) {
  const owner = scope(profileId, allowed);
  const first = await readNativeCustomMarker(profileId, expected.markerKey, owner.current);
  if (!profileDataValuesEqual(first, expected)) fail('The selected marker or removal effects changed. Read a new review.');
  const effects = expected.effects;
  const confirmed = await showConfirmDialog(`Delete "${expected.name}" and its ${effects.results} saved result(s), ${effects.datedNotes} dated note(s), ${effects.manualEdits} manual edit record(s), and marker settings? ${effects.emptiedSamples} empty sample(s) will be removed. Other markers, original reports, exports and backups are kept. This cannot be undone.`, { confirmLabel: 'Delete marker and results', cancelLabel: 'Keep marker', ariaLabel: 'Delete custom marker' });
  if (!confirmed) throw Object.assign(new Error('Custom marker deletion canceled. Nothing was changed.'), { cancelledBeforeSave: true });
  owner.check();
  const base = await readAgentProfileRecords(profileId), current = await reviewNativeCustomMarker(base, expected.markerKey); owner.check();
  if (!profileDataValuesEqual(current, expected)) fail('The marker or its results changed while confirmation was open. Nothing was applied.');
  const before = customMarkerState(base, expected.markerKey), canCommit = () => owner.current() && profileDataValuesEqual(customMarkerState(owner.root, expected.markerKey), before);
  if (!canCommit()) fail('Save or resolve native marker edits before removing this marker. Your input is kept.');
  const next = structuredClone(base); removeCustomMarkerData(next, expected.markerKey);
  let conflict = false;
  const saved = await saveImportedDataForProfile(profileId, next, { baseData: base, forceProfileScope: true,
    expectedCustomMarkerStates: [{ markerKey: expected.markerKey, value: before }], onContextFieldConflict: () => { conflict = true; }, canCommit });
  if (!saved) { if (conflict || !owner.current()) fail('The marker or its editing context changed before saving. Nothing was applied.'); throw new Error('The marker removal could not be saved. Check its native editor before retrying.'); }
  try { notifyProfileDataContextChanged(profileId); } catch { /* Already durable. */ }
  return expected;
}
