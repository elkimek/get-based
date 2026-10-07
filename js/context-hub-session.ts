// Autosave owns a profile and a committed baseline; presentation drafts stay local.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { encryptedGetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import { migrateProfileData } from './profile-data-migrations.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { CONTEXT_SOURCE_IDS, getContextSourceDefinition, getLabGroupContextSourceSlug, isLabGroupContextSourceSlug, normalizeContextSourceSettings, migrateStoredContextSourceSettingsToProfile } from './context-source-registry.js';
import { invalidateLabContextCache, normalizeNutritionContextDays } from './lab-context-settings.js';
import type { ProfileData } from '../types/app-state.js';
export type ContextSettingMutation = { kind: 'toggle'; key: string; checked: boolean; group?: string } | { kind: 'nutrition'; days: number } | { kind: 'migrate' };
export type ContextSettingResult = 'saved' | 'unchanged' | 'failed' | 'conflict' | 'retired' | 'blocked' | 'busy' | 'invalid';
const SOURCES: Record<string, string> = {
  'insight-cards': CONTEXT_SOURCE_IDS.INSIGHT_CARDS, 'supplements-meds': CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS,
  'lab-markers': CONTEXT_SOURCE_IDS.LAB_MARKERS, 'genome-summary': CONTEXT_SOURCE_IDS.GENOME_SUMMARY,
  'genome-priority': CONTEXT_SOURCE_IDS.GENOME_PRIORITY, 'genome-lookup': CONTEXT_SOURCE_IDS.GENOME_INVENTORY,
  'light-sun': CONTEXT_SOURCE_IDS.LIGHT_SUN, 'body-wearables': CONTEXT_SOURCE_IDS.WEARABLES, 'body-nutrition': CONTEXT_SOURCE_IDS.NUTRITION,
};
function sourceSlug(mutation: ContextSettingMutation): string | null {
  if (mutation.kind !== 'toggle') return null;
  if (mutation.key !== 'lab-group') return Object.hasOwn(SOURCES, mutation.key) ? SOURCES[mutation.key]! : null;
  const slug = getLabGroupContextSourceSlug(mutation.group);
  return isLabGroupContextSourceSlug(slug) ? slug : null;
}
export function createContextHubSession() {
  const profile = state.currentProfile, origin = state.importedData;
  let retired = false, saving = false;
  const current = () => !retired && state.currentProfile === profile && state.importedData === origin;
  const preferences = (data: Partial<ProfileData>) => ({ sources: normalizeContextSourceSettings(data.contextSourceSettings), days: normalizeNutritionContextDays(data.nutritionContextDays), scores: data.biologyScoreContextSettings || {} });
  async function refreshSaved(): Promise<boolean> {
    try {
      const raw = await encryptedGetItem(profileStorageKey(profile, 'imported'), { throwOnDecryptError: true });
      if (!raw || !current()) return false;
      const saved = migrateProfileData(JSON.parse(raw) as ProfileData), base = profileDataBaseline(origin) || origin;
      const result = rebaseLiveProfileData(base, origin, saved);
      adoptProfileData(origin, result.data); rememberProfileData(origin, result.baseline); invalidateLabContextCache();
      return true;
    } catch { return false; }
  }
  return {
    current, retire() { retired = true; }, refreshSaved,
    async save(mutation: ContextSettingMutation): Promise<ContextSettingResult> {
      if (!current()) return 'retired';
      if (saving) return 'busy';
      if (isProfileReadBlocked(profile)) return 'blocked';
      const slug = sourceSlug(mutation);
      if (mutation.kind === 'toggle' && !slug) return 'invalid';
      if (mutation.kind === 'nutrition' && ![7, 30, 90].includes(mutation.days)) return 'invalid';
      saving = true;
      try {
        const base = structuredClone(profileDataBaseline(origin) || origin), draft = structuredClone(base);
        const migrated = migrateStoredContextSourceSettingsToProfile(draft);
        if (mutation.kind === 'migrate' && !migrated) return 'unchanged';
        if (mutation.kind === 'toggle') {
          draft.contextSourceSettings = { ...normalizeContextSourceSettings(draft.contextSourceSettings), [slug!]: mutation.checked };
          if (mutation.key === 'light-sun' || mutation.key === 'body-wearables') draft.biologyScoreContextSettings = { ...draft.biologyScoreContextSettings, [mutation.key === 'light-sun' ? 'includeLightContext' : 'includeBodyContext']: mutation.checked };
        } else if (mutation.kind === 'nutrition') draft.nutritionContextDays = normalizeNutritionContextDays(mutation.days);
        const raw = await encryptedGetItem(profileStorageKey(profile, 'imported'), { throwOnDecryptError: true });
        const latest = raw ? JSON.parse(raw) as Partial<ProfileData> : {};
        if (!profileDataValuesEqual(preferences(base), preferences(latest))) {
          await refreshSaved(); return 'conflict';
        }
        // The existing atomic receipt check rejects a peer write between this read and commit.
        const saved = await saveImportedDataForProfile(profile, draft, { forceProfileScope: true, baseData: base, expectedData: raw, reason: 'context-source-settings' });
        if (!saved) { await refreshSaved(); return 'failed'; }
        try {
          if (state.currentProfile !== profile || state.importedData !== origin) {
            const result = rebaseLiveProfileData(base, origin, profileDataBaseline(draft) || draft);
            adoptProfileData(origin, result.data); rememberProfileData(origin, result.baseline);
          }
        } catch { /* A committed origin write does not depend on a retired view. */ }
        try {
          if (slug && mutation.kind === 'toggle') {
            localStorage.setItem(`labcharts-${profile}-ai-ctx-${slug}`, mutation.checked ? 'on' : 'off');
            const legacy = mutation.key === 'lab-group' ? `labcharts-ai-ctx-${String(mutation.group || '').trim()}` : getContextSourceDefinition(slug)?.legacyKey;
            if (legacy && state.currentProfile === profile) localStorage.removeItem(legacy);
          }
        } catch { /* Optional local mirrors cannot undo or silence a committed setting. */ }
        if (state.currentProfile === profile) {
          invalidateLabContextCache();
          try { notifyProfileDataContextChanged(profile); } catch { /* Presentation cannot undo the committed setting. */ }
        }
        return 'saved';
      } catch { return 'failed'; }
      finally { saving = false; }
    }
  };
}
