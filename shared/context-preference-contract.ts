// Disclosure preferences contain settings metadata, never health content.
export const CONTEXT_PREFERENCE_SOURCES = {
  'insight-cards': 'Insight Context Cards', 'supplements-meds': 'Supplements & Medications',
  'lab-markers': 'Blood marker results', 'genetics-summary': 'APOE & mtDNA summary',
  'genetics-priority': 'Priority SNP findings', 'genetics-inventory': 'Other SNP lookup inventory',
  'light-sun': 'Light & Sun context', wearables: 'Wearable recovery context', 'meals-nutrition': 'Meals & Nutrition',
} as const;
export type ContextPreferenceSource = keyof typeof CONTEXT_PREFERENCE_SOURCES;
export interface ContextPreferencePatch {
  sources?: Partial<Record<ContextPreferenceSource, boolean>>;
  groups?: Record<string, boolean>;
  nutritionDays?: 7 | 30 | 90;
  wearableSeriesDays?: 0 | 7 | 30 | 90;
}
export const validContextGroupId = (value: string) => value.startsWith('lab-group-') && value.length > 10 && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseContextPreferencePatch(value: unknown): ContextPreferencePatch | null {
  if (!object(value) || !Object.keys(value).length || Object.keys(value).some(key => !['sources', 'groups', 'nutritionDays', 'wearableSeriesDays'].includes(key))) return null;
  const out: ContextPreferencePatch = {};
  for (const field of ['sources', 'groups'] as const) if (Object.hasOwn(value, field)) {
    const map = value[field];
    if (!object(map) || !Object.keys(map).length || Object.keys(map).length > (field === 'sources' ? 9 : 25)
      || Object.entries(map).some(([key, enabled]) => typeof enabled !== 'boolean' || (field === 'sources' ? !Object.hasOwn(CONTEXT_PREFERENCE_SOURCES, key) : !validContextGroupId(key)))) return null;
    out[field] = { ...map } as Record<string, boolean>;
  }
  if (Object.hasOwn(value, 'nutritionDays')) {
    if (![7, 30, 90].includes(value.nutritionDays as number)) return null;
    out.nutritionDays = value.nutritionDays as 7 | 30 | 90;
  }
  if (Object.hasOwn(value, 'wearableSeriesDays')) {
    if (![0, 7, 30, 90].includes(value.wearableSeriesDays as number)) return null;
    out.wearableSeriesDays = value.wearableSeriesDays as 0 | 7 | 30 | 90;
  }
  return out;
}
export const contextPreferencesEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_key, value: unknown) => object(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value) === JSON.stringify(b, (_key, value: unknown) => object(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
export function matchingContextPreferenceFields(a: ContextPreferencePatch, b: ContextPreferencePatch) {
  return Object.keys(a).sort().join() === Object.keys(b).sort().join() && (['sources', 'groups'] as const).every(field => Object.keys(a[field] || {}).sort().join() === Object.keys(b[field] || {}).sort().join());
}
export interface ContextPreferenceControlIdentity {
  id: string; action: 'context.preferences'; profileId: string; threadId: string; leaseId: string;
  parameters: ContextPreferencePatch; baseline: ContextPreferencePatch; reason: string; evidence: string;
}
export function contextPreferenceControlSignature(record: ContextPreferenceControlIdentity) {
  return JSON.stringify({ id: record.id, action: record.action, profileId: record.profileId, threadId: record.threadId, leaseId: record.leaseId,
    parameters: record.parameters, baseline: record.baseline, reason: record.reason.trim(), evidence: record.evidence.trim() },
  (_key, value: unknown) => object(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}
