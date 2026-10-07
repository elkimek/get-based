// Incremental goal mutations own one profile and commit through its guarded storage transaction.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { appendImportedArrayItem, deleteImportedArrayItem, clearImportedArray, clearTombstone, getConfiguredArrayItemId } from './data-merge.js';
import { recordContextCardChange } from './context-cards-runtime.js';
import { healthGoalList } from './health-goals-utils.js';
export type HealthGoalMutation = { kind: 'add'; text: string; severity: string } | { kind: 'remove'; index: number } | { kind: 'clear' };
export type HealthGoalResult = 'saved' | 'failed' | 'conflict' | 'retired' | 'blocked' | 'busy' | 'empty';
export function createHealthGoalsSession() {
  const profile = state.currentProfile, origin = state.importedData;
  let retired = false, saving = false;
  const current = () => !retired && state.currentProfile === profile && state.importedData === origin;
  return {
    current, retire() { retired = true; },
    async mutate(mutation: HealthGoalMutation, observed: unknown): Promise<HealthGoalResult> {
      if (!current()) return 'retired';
      if (saving) return 'busy';
      if (isProfileReadBlocked(profile)) return 'blocked';
      if (!profileDataValuesEqual(origin.healthGoals, observed)) return 'conflict';
      if (mutation.kind === 'add' && !mutation.text.trim()) return 'empty';
      const goals = healthGoalList(observed);
      if (mutation.kind === 'remove' && (!Number.isInteger(mutation.index) || mutation.index < 0 || mutation.index >= goals.length)) return 'empty';
      saving = true;
      let conflict = false;
      try {
        const base = structuredClone(profileDataBaseline(origin) || origin), draft = structuredClone(base);
        draft.healthGoals = goals;
        if (mutation.kind === 'add') {
          const goal = appendImportedArrayItem(draft, 'healthGoals', { text: mutation.text.trim(), severity: mutation.severity, updatedAt: Date.now() });
          clearTombstone(draft, 'healthGoals', getConfiguredArrayItemId('healthGoals', goal));
        }
        else if (mutation.kind === 'remove') deleteImportedArrayItem(draft, 'healthGoals', mutation.index);
        else clearImportedArray(draft, 'healthGoals');
        recordContextCardChange('healthGoals', draft);
        const saved = await saveImportedDataForProfile(profile, draft, { forceProfileScope: true, baseData: base,
          expectedContextField: { key: 'healthGoals', value: structuredClone(observed) }, onContextFieldConflict: () => { conflict = true; }
        });
        if (!saved) return conflict ? 'conflict' : 'failed';
        try {
          // Accepted mutations finish on their original profile even if the dialog retired.
          if (state.currentProfile !== profile || state.importedData !== origin) {
            const result = rebaseLiveProfileData(base, origin, profileDataBaseline(draft) || draft);
            adoptProfileData(origin, result.data); rememberProfileData(origin, result.baseline);
          }
          if (state.currentProfile === profile) notifyProfileDataContextChanged(profile);
        } catch { /* Storage committed; presentation cannot undo the mutation. */ }
        return 'saved';
      } catch { return 'failed'; }
      finally { saving = false; }
    }
  };
}
