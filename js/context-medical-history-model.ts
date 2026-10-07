// Pure Medical History draft and display contracts; unknown stored metadata stays intact.
import type { Diagnoses, Diagnosis, FamilyHistory } from '../types/profile-context-data.js';
import { COMMON_CONDITIONS } from './constants.js';
export type MedicalHistoryDraft = Diagnoses & Required<Pick<Diagnoses, 'conditions' | 'familyHistory' | 'flags' | 'note' | 'proceduresNote'>>;
export interface ConditionInput { name: string; severity: string; status: string; since: string; }
export interface FamilyHistoryInput { relative: string; condition: string; age: string; note: string; }
export const INTERPRETATION_FLAGS: [string, string, string][] = [
  ['lowMuscleMass', 'Low muscle mass / creatinine unreliable', 'Treat creatinine, creatinine eGFR, BUN/Cr, and creatinine-based biological age as context, not scored truth.'],
  ['hormoneTherapy', 'Hormone therapy / TRT / hormonal contraception', 'Flag sex-hormone markers as treatment/context-sensitive.'],
  ['postmenopause', 'Postmenopause / no active cycle', 'Do not interpret female hormones as ordinary cycling physiology.'],
  ['intenseTrainingRecent', 'Recent intense training near blood draw', 'Flag CK, AST/ALT, hs-CRP, urea, and recovery scores as training-load sensitive.'],
  ['acuteIllnessNearDraw', 'Acute illness / infection / injury near blood draw', 'Flag immune, inflammation, ferritin/iron, and recovery scores as transiently affected.'],
];
export const CONDITION_IMPACT_LABELS: Record<string, string> = {
  major: 'High',
  mild: 'Moderate',
  minor: 'Low',
};
export const CONDITION_STATUS = ['active', 'controlled', 'in remission', 'resolved'];

export const FAMILY_RELATIVES = [
  { key: 'mother',                 label: 'Mother' },
  { key: 'father',                 label: 'Father' },
  { key: 'sibling',                label: 'Sibling' },
  { key: 'half_sibling',           label: 'Half-sibling' },
  { key: 'child',                  label: 'Child' },
  { key: 'maternal_grandmother',   label: 'Maternal grandmother' },
  { key: 'maternal_grandfather',   label: 'Maternal grandfather' },
  { key: 'maternal_relative',      label: 'Other maternal relative' },
  { key: 'paternal_grandmother',   label: 'Paternal grandmother' },
  { key: 'paternal_grandfather',   label: 'Paternal grandfather' },
  { key: 'paternal_relative',      label: 'Other paternal relative' },
];

export const RELATIVE_EMOJI: Record<string, string> = {
  mother: '👩', father: '👨', sibling: '👫', half_sibling: '👫', child: '🧒',
  maternal_grandmother: '👵', maternal_grandfather: '👴', maternal_relative: '👤',
  paternal_grandmother: '👵', paternal_grandfather: '👴', paternal_relative: '👤',
};
export const FAMILY_GROUPS = [
  { label: 'Parents', keys: ['mother', 'father'] },
  { label: 'Siblings & Children', keys: ['sibling', 'half_sibling', 'child'] },
  { label: 'Maternal grandparents', keys: ['maternal_grandmother', 'maternal_grandfather', 'maternal_relative'] },
  { label: 'Paternal grandparents', keys: ['paternal_grandmother', 'paternal_grandfather', 'paternal_relative'] },
];
export function relativeLabel(key: string): string { return FAMILY_RELATIVES.find(row => row.key === key)?.label || key; }
export function medicalHistoryDraft(value: Diagnoses | null | undefined): MedicalHistoryDraft {
  const draft = structuredClone(value || {});
  draft.conditions = Array.isArray(draft.conditions) ? draft.conditions : [];
  draft.familyHistory = Array.isArray(draft.familyHistory) ? draft.familyHistory : [];
  draft.flags = draft.flags && typeof draft.flags === 'object' ? draft.flags : {};
  draft.note = typeof draft.note === 'string' ? draft.note : '';
  draft.proceduresNote = typeof draft.proceduresNote === 'string' ? draft.proceduresNote : '';
  return draft as MedicalHistoryDraft;
}
export function medicalHistoryValue(value: MedicalHistoryDraft): Diagnoses | null {
  const draft = medicalHistoryDraft(value);
  draft.note = draft.note.trim(); draft.proceduresNote = draft.proceduresNote.trim();
  // Unknown extensions and flags may be meaningful to a newer peer. Keep them.
  const extension = Object.keys(draft).some(key => !['conditions', 'familyHistory', 'flags', 'note', 'proceduresNote'].includes(key));
  return draft.conditions.length || draft.familyHistory.length || draft.note || draft.proceduresNote
    || Object.keys(draft.flags).length || extension ? draft : null;
}
export function conditionValue(input: ConditionInput, previous?: Diagnosis): Diagnosis | null {
  const name = input.name.trim(); if (!name) return null;
  const result: Diagnosis = { ...structuredClone(previous || {}), name, severity: input.severity || 'mild' };
  if (input.status) result.status = input.status; else delete result.status;
  if (input.since.trim()) result.since = input.since.trim(); else delete result.since;
  return result;
}
export function familyHistoryValue(input: FamilyHistoryInput, previous?: FamilyHistory): FamilyHistory | null {
  const relative = input.relative, condition = input.condition.trim();
  if (!relative || !condition) return null;
  // Preserve an existing legacy relative when editing other fields; reject new unknown values.
  if (!FAMILY_RELATIVES.some(row => row.key === relative) && previous?.relative !== relative) return null;
  const result: FamilyHistory = { ...structuredClone(previous || {}), relative, condition };
  const ageRaw = input.age.trim();
  const onsetAge = ageRaw === '' ? null : Math.max(0, Math.min(120, parseInt(ageRaw, 10)));
  if (onsetAge !== null && Number.isFinite(onsetAge)) result.onsetAge = onsetAge; else delete result.onsetAge;
  if (input.note.trim()) result.note = input.note.trim(); else delete result.note;
  return result;
}
export function familyHistoryRows(draft: MedicalHistoryDraft) {
  const order = new Map(FAMILY_RELATIVES.map((relative, index) => [relative.key, index]));
  return draft.familyHistory.map((entry, index) => ({ entry, index, label: relativeLabel(entry.relative), emoji: RELATIVE_EMOJI[entry.relative] || '👤' }))
    .sort((a, b) => (order.get(a.entry.relative) ?? 99) - (order.get(b.entry.relative) ?? 99));
}
export function conditionSuggestions(text: string, draft: MedicalHistoryDraft, sex: string, family = false): string[] {
  const query = text.toLowerCase().trim(); if (!query) return [];
  return COMMON_CONDITIONS.filter(name => name.toLowerCase().includes(query)
    && (family || !draft.conditions.some(condition => condition.name.toLowerCase() === name.toLowerCase()))
    && (family || sex !== 'male' || !['PCOS', 'Endometriosis'].includes(name))).slice(0, 8);
}
