// Reviewed commands use the meal owner: canonical sync commit, then encrypted cache and summary.
import { encryptedGetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import { profileDataBaseline, profileDataValuesEqual } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { appendImportedArrayItem, replaceImportedArrayItem, deleteImportedArrayItem, clearTombstone } from './data-merge.js';
import { listNutritionMeals, sanitizeNutritionMeal, refreshNutritionMealsFromSnapshot, isNutritionSyncInitialized, mealFreshness } from './nutrition-store.js';
import { queueNutritionOperation } from './nutrition-operation-lock.js';
import { createMealRecordSnapshot, parseMealRecordSnapshot, projectMealCommand } from './nutrition-record-commands.js';
import { agentDataObject, parseAgentDataPatch, normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';
type NutritionProfileRead = Awaited<ReturnType<typeof readNutritionProfile>>;
type MealProfile = ProfileData & { nutritionMeals: NonNullable<ProfileData['nutritionMeals']> };

const conflict = (): never => { throw Object.assign(new Error('This meal changed since the proposal. Read it again before proposing an edit. No change was applied.'), { noChangeApplied: true }); };
function validateMealRows(rows: unknown) {
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || !row.id || !Number.isFinite(Date.parse(String(row.eatenAt || ''))))
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('These meal records need review in Nutrition before editing.');
}
async function readNutritionProfile(profileId: string): Promise<{ base: ProfileData; data: MealProfile; legacy: boolean }> {
  if (isProfileReadBlocked(profileId)) throw new Error('Reload this profile before editing meals.');
  const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true });
  const data: unknown = raw === null ? {} : JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Saved meals could not be read safely.');
  const base = data as ProfileData, profile = structuredClone(base);
  const hasArray = Array.isArray(profile.nutritionMeals);
  if (profile.nutritionMeals != null && !hasArray) throw new Error('These meal records need review in Nutrition before editing.');
  if (hasArray) validateMealRows(profile.nutritionMeals);
  // Read legacy encrypted records without migrating or changing them. Apply
  // adopts their canonical surface under a missing-array expectation.
  if (!hasArray || !await isNutritionSyncInitialized(profileId)) {
    const byId = new Map((profile.nutritionMeals || []).map(row => [row.id, row]));
    const deleted = new Set(Array.isArray(profile._deleted?.nutritionMeals) ? profile._deleted.nutritionMeals : []);
    for (const row of await listNutritionMeals(profileId, { limit: 10000 })) {
      if (deleted.has(String(row.id))) continue;
      const existing = byId.get(String(row.id));
      if (!existing || mealFreshness(row) > mealFreshness(existing)) byId.set(String(row.id), row as MealProfile['nutritionMeals'][number]);
    }
    profile.nutritionMeals = [...byId.values()];
  }
  validateMealRows(profile.nutritionMeals);
  return { base, data: profile as MealProfile, legacy: !hasArray || !profileDataValuesEqual(base.nutritionMeals, profile.nutritionMeals) };
}
function visibleMeals(data: MealProfile) {
  const deleted = new Set(Array.isArray(data._deleted?.nutritionMeals) ? data._deleted.nutritionMeals : []);
  return data.nutritionMeals.filter(row => !deleted.has(String(row.id)));
}
export function readCurrentNutritionRecords(profileId: string) {
  return queueNutritionOperation(profileId, async () => visibleMeals((await readNutritionProfile(profileId)).data));
}
async function commitMealProfile(profileId: string, source: NutritionProfileRead, next: MealProfile, recordId: string, authorized: () => boolean, changedRecord: () => never) {
  const { base, legacy } = source;
  const denied = (): never => { throw Object.assign(new Error('Meal editing authorization changed. No change was applied.'), { noChangeApplied: true }); };
  let changed = false, revoked = false;
  if (!await saveImportedDataForProfile(profileId, next, { forceProfileScope: true, baseData: base,
    canCommit: () => { if (!authorized()) revoked = true; return !revoked; },
    expectedProfileRecords: [{ key: 'nutritionMeals', id: recordId, value: base.nutritionMeals?.find(row => row.id === recordId) || null }],
    ...(legacy ? { expectedContextField: { key: 'nutritionMeals' as const, value: base.nutritionMeals ?? null } } : {}), onContextFieldConflict: () => { changed = true; },
  })) { if (revoked) denied(); if (changed) changedRecord(); throw new Error('The meal could not be saved.'); }
  // The canonical commit is authoritative. A cache/summary refresh cannot
  // turn it into an ambiguous failure that invites a second mutation.
  let refreshPending = false;
  try { await refreshNutritionMealsFromSnapshot(profileId, structuredClone(profileDataBaseline(next) || next)); }
  catch { refreshPending = true; }
  try { notifyProfileDataContextChanged(profileId); } catch { /* Already committed. */ }
  return refreshPending;
}

export function commitReviewedNutritionRecord(profileId: string, value: AgentDataProposal, authorized: () => boolean = () => true) {
  const proposal = normalizeAgentDataProposal(value);
  if (!proposal || proposal.resource !== 'meals' || !proposal.recordId) throw new Error('Invalid reviewed meal command.');
  return queueNutritionOperation(profileId, async () => {
    const denied = (): never => { throw Object.assign(new Error('Meal editing authorization changed. No change was applied.'), { noChangeApplied: true }); };
    if (!authorized()) denied();
    const snapshot = parseMealRecordSnapshot(JSON.parse(proposal.baseline)), { base, data, legacy } = await readNutritionProfile(profileId);
    const before = visibleMeals(data).find(row => row.id === proposal.recordId) || null;
    if (!profileDataValuesEqual(await createMealRecordSnapshot(before), snapshot)) conflict();
    const next = structuredClone(data), after = projectMealCommand(before, proposal, parseAgentDataPatch(proposal.patch));
    const index = next.nutritionMeals.findIndex(row => row.id === proposal.recordId);
    if (after === null) deleteImportedArrayItem(next, 'nutritionMeals', index);
    else {
      const normalized = sanitizeNutritionMeal(after);
      if (before === null) appendImportedArrayItem(next, 'nutritionMeals', normalized);
      else replaceImportedArrayItem(next, 'nutritionMeals', index, normalized);
      clearTombstone(next, 'nutritionMeals', proposal.recordId);
    }
    const refreshPending = await commitMealProfile(profileId, { base, data, legacy }, next, proposal.recordId, authorized, conflict);
    return `Meal ${proposal.operation === 'remove' ? 'removed' : proposal.operation === 'add' ? 'added' : 'updated'}.${refreshPending ? ' Saved; reload Nutrition to finish refreshing its local view.' : ''}`;
  });
}

/** Native Save uses the exact viewed record and the same atomic canonical owner. */
export function commitNativeNutritionMeal(profileId: string, expected: unknown, value: unknown, authorized: () => boolean) {
  const snapshot = expected == null ? null : structuredClone(agentDataObject(expected)), candidate = structuredClone(agentDataObject(value));
  const stale = (): never => { throw Object.assign(new Error('This saved meal changed. Reload the profile and reopen the meal. Your draft was not saved.'), { noChangeApplied: true }); };
  if (snapshot ? typeof snapshot.id !== 'string' || !snapshot.id || candidate.id !== snapshot.id : candidate.id != null) throw new Error('Reopen the exact saved meal before editing.');
  const recordId = snapshot ? String(snapshot.id) : crypto.randomUUID();
  return queueNutritionOperation(profileId, async () => {
    if (!authorized()) throw Object.assign(new Error('Meal editing authorization changed. No change was applied.'), { noChangeApplied: true });
    const source = await readNutritionProfile(profileId), before = visibleMeals(source.data).find(row => row.id === recordId) || null;
    if (!profileDataValuesEqual(before, snapshot)) return stale();
    const eatenAt = new Date(String(candidate.eatenAt || ''));
    if (!Number.isFinite(eatenAt.getTime())) throw new Error('Choose a valid meal date and time.');
    const at = new Date().toISOString();
    const after = sanitizeNutritionMeal({ ...candidate, id: recordId, eatenAt: eatenAt.toISOString(), createdAt: before?.createdAt || candidate.createdAt || at, updatedAt: at, reviewed: true }) as MealProfile['nutritionMeals'][number];
    const next = structuredClone(source.data), index = next.nutritionMeals.findIndex(row => row.id === recordId);
    if (before === null) appendImportedArrayItem(next, 'nutritionMeals', after);
    else replaceImportedArrayItem(next, 'nutritionMeals', index, after);
    clearTombstone(next, 'nutritionMeals', recordId);
    const refreshPending = await commitMealProfile(profileId, source, next, recordId, authorized, stale);
    return { meal: after, refreshPending };
  });
}
