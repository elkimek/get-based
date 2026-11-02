// Structured context collections share the ordinary editor's domain and sync identities.
import { FAMILY_RELATIVES, CONDITION_STATUS, INTERPRETATION_FLAGS, familyHistoryValue } from './context-medical-history-model.js';
import { healthGoalList, HEALTH_GOAL_PRIORITIES } from './health-goals-utils.js';
import { createCyclePeriod, upgradeMenstrualCycleProfile, summarizeCyclePeriods } from './cycle-summary.js';
import { PERIOD_SYMPTOMS } from './constants.js';
import { appendImportedArrayItem, replaceImportedArrayItem, deleteImportedArrayItem, clearTombstone, getConfiguredArrayItemId } from './data-merge.js';
import type { AgentContextCard, AgentContextChange } from '../shared/agent-tool-contract.js';
import type { ProfileData } from '../types/app-state.js';
import { contextValueForRead } from './context-card-legacy.js';

export interface AgentContextField {
  key: string; label: string; kind: 'single' | 'multiple' | 'text' | 'time' | 'records' | 'number';
  options: { value: string; label: string }[];
  recordFields?: { key: string; required?: boolean; description?: string; options?: readonly string[] }[];
  min?: number; max?: number;
}
const field = (key: string, label: string, kind: AgentContextField['kind'] = 'text', options: readonly string[] = []): AgentContextField => ({
  key, label, kind, options: options.map(value => ({ value, label: value }))
});
export function structuredContextFields(card: AgentContextCard): AgentContextField[] | null {
  if (card === 'healthGoals') return [{ ...field('goals', 'Health goals', 'records'), recordFields: [
    { key: 'text', required: true }, { key: 'severity', description: 'Priority: major = High, mild = Medium, minor = Low. Omitted means the editor default Medium.', options: HEALTH_GOAL_PRIORITIES.map(row => row.value) }
  ] }];
  if (card === 'interpretiveLens') return [field('text', 'Interpretive lens')];
  if (card === 'diagnoses') return [
    { ...field('conditions', 'Personal conditions', 'records'), recordFields: [
      { key: 'name', required: true }, { key: 'severity', options: ['major', 'mild', 'minor'] }, { key: 'status', options: CONDITION_STATUS }, { key: 'since' }
    ] },
    { ...field('familyHistory', 'Family history', 'records'), recordFields: [
      { key: 'relative', required: true, options: FAMILY_RELATIVES.map(row => row.key) }, { key: 'condition', required: true },
      { key: 'onsetAge', description: 'Age when the condition began, NEVER age at death.' }, { key: 'note', description: 'Preserve age at death and other reported details here.' }
    ] },
    field('note', 'Medical history notes'), field('proceduresNote', 'Procedures and surgeries'),
    ...INTERPRETATION_FLAGS.map(([key, label]) => field(key, label, 'single', ['true', 'false']))
  ];
  if (card === 'menstrualCycle') return [
    { ...field('periods', 'Period observations', 'records'), recordFields: [
      { key: 'startDate', required: true, description: 'YYYY-MM-DD. A start alone records an observation with end and flow unknown.' },
      { key: 'endDate', description: 'Actual reported end date only; never an expected date.' },
      { key: 'flow', options: ['spotting', 'light', 'moderate', 'heavy'] }, { key: 'symptoms', options: PERIOD_SYMPTOMS }, { key: 'notes' }
    ] },
    field('cycleStatus', 'Cycle status', 'single', ['regular', 'perimenopause', 'postmenopause', 'pregnant', 'breastfeeding', 'absent']),
    { ...field('cycleLength', 'Usual cycle length', 'number'), min: 10, max: 120 },
    { ...field('periodLength', 'Usual period length', 'number'), min: 1, max: 30 },
    field('regularity', 'Regularity', 'single', ['regular', 'irregular', 'very_irregular']),
    field('flow', 'Usual flow', 'single', ['spotting', 'light', 'moderate', 'heavy']),
    field('contraceptive', 'Contraception'), field('conditions', 'Cycle conditions'), field('note', 'Cycle notes')
  ];
  return null;
}
export function contextFieldValue(card: AgentContextCard, baseline: unknown, key: string): unknown {
  baseline = contextValueForRead(card, baseline);
  if (card === 'healthGoals') return healthGoalList(baseline);
  if (card === 'interpretiveLens') return baseline || '';
  const value = baseline as Record<string, unknown> | null;
  if (card === 'diagnoses' && INTERPRETATION_FLAGS.some(([flag]) => flag === key)) {
    const flag = (value?.flags as Record<string, unknown> | undefined)?.[key];
    return typeof flag === 'boolean' ? String(flag) : null;
  }
  return value?.[key] ?? null;
}
function recordObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The selected record needs review in its editor.');
  return structuredClone(value) as Record<string, unknown>;
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function projectContextRecord(card: AgentContextCard, baseline: unknown, change: AgentContextChange) {
  baseline = contextValueForRead(card, baseline);
  const field = structuredContextFields(card)?.find(field => field.key === change.field && field.kind === 'records');
  if (!field || !change.operation) throw new Error('Use a supported record field and operation.');
  const raw = contextFieldValue(card, baseline, change.field);
  if (raw != null && !Array.isArray(raw)) throw new Error('This record list needs review in its editor.');
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const index = change.index;
  if (change.operation !== 'add' && (index === undefined || index < 0 || index >= list.length)) throw new Error('Read the current record index before changing it.');
  const before = change.operation === 'add' ? null : recordObject(list[index!]);
  if (change.operation === 'remove') return { field: change.field, label: `${field.label} · remove`, before, after: null };
  const input = change.record || {};
  const clear = input.clearFields ?? [];
  if (!Array.isArray(clear) || clear.length && change.operation !== 'update' || clear.some(key => {
    const descriptor = field.recordFields?.find(property => property.key === key);
    return !descriptor || descriptor.required || Object.hasOwn(input, key);
  })) throw new Error('Only optional record fields can be cleared in an update.');
  for (const [key, value] of Object.entries(input)) {
    if (key === 'clearFields') continue;
    const descriptor = field.recordFields?.find(property => property.key === key);
    if (!descriptor) throw new Error(`This record field is not editable: ${key}.`);
    if (key === 'onsetAge') {
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 120) throw new Error('Onset age must be an integer from 0 to 120.');
    } else if (key === 'symptoms') {
      if (!Array.isArray(value) || value.some(item => !descriptor.options?.includes(item))) throw new Error('Use the allowed period symptoms.');
    } else if (typeof value !== 'string' || value.length > 2000 || descriptor.options && !descriptor.options.includes(value)) throw new Error(`Use an allowed value for ${key}.`);
  }
  const after = { ...before, ...structuredClone(input) };
  delete after.clearFields;
  for (const key of clear) delete after[key];
  for (const descriptor of field.recordFields || []) if (descriptor.required && (typeof after[descriptor.key] !== 'string' || !String(after[descriptor.key]).trim())) throw new Error(`${descriptor.key} is required.`);
  for (const [key, value] of Object.entries(input)) if (typeof value === 'string') after[key] = value.trim();
  if (card === 'healthGoals') {
    if (change.operation === 'add' && list.some(row => String((row as { text?: unknown }).text || '').trim().toLowerCase() === String(after.text).toLowerCase())) throw new Error('This goal is already recorded.');
    after.severity ??= 'mild';
  }
  if (card === 'diagnoses' && change.field === 'familyHistory') {
    const normalized = familyHistoryValue({ relative: String(after.relative), condition: String(after.condition), age: after.onsetAge == null ? '' : String(after.onsetAge), note: String(after.note || '') }, after as import('../types/profile-context-data.js').FamilyHistory);
    if (!normalized || !FAMILY_RELATIVES.some(relative => relative.key === after.relative)) throw new Error('Choose the relative explicitly; clarify maternal or paternal side when needed.');
    Object.assign(after, normalized);
  }
  if (card === 'diagnoses' && list.some((item, offset) => {
    if (change.operation === 'update' && offset === index) return false;
    const other = item as Record<string, unknown>;
    const same = (key: string) => String(other[key] || '').trim().toLowerCase() === String(after[key] || '').trim().toLowerCase();
    return change.field === 'conditions' ? same('name') : same('relative') && same('condition');
  })) throw new Error('This medical-history record is already recorded. Update it instead.');
  if (card === 'menstrualCycle') {
    if (!date(after.startDate) || after.endDate && (!date(after.endDate) || after.endDate < after.startDate)) throw new Error('Period dates must be real YYYY-MM-DD dates in order.');
    // A period start is an observation, not a completed one-day period or a flow estimate.
    after.endDateKnown = !!after.endDate;
    after.flowKnown = !!after.flow;
    const start = String(after.startDate), end = String(after.endDate || start);
    if (list.some((other, offset) => {
      if (change.operation === 'update' && offset === index) return false;
      const row = other as { startDate: string; endDate?: string };
      return start <= (row.endDate || row.startDate) && end >= row.startDate;
    })) throw new Error('This period overlaps a recorded observation. Update that record instead.');
  }
  return { field: change.field, label: `${field.label} · ${change.operation}`, before, after };
}
/** Preserve extension metadata and use normal array identities/tombstones on accepted edits. */
export function applyContextRecord(data: ProfileData, card: AgentContextCard, change: AgentContextChange) {
  const row = projectContextRecord(card, data[card] ?? null, change);
  const path = card === 'healthGoals' ? 'healthGoals' : `${card}.${change.field}`;
  if (card === 'healthGoals') data.healthGoals = healthGoalList(data.healthGoals);
  else data[card] ||= {};
  if (change.operation === 'remove') deleteImportedArrayItem(data, path, change.index!);
  else {
    let entry = { ...row.after, updatedAt: Date.now() } as Record<string, unknown>;
    if (card === 'menstrualCycle') {
      const period = createCyclePeriod({ ...(entry as { startDate: string }), updatedAt: new Date().toISOString() });
      if (!period) throw new Error('The period observation is invalid.');
      // createCyclePeriod has legacy completed-period defaults. Retain explicit unknowns.
      entry = { ...period, ...entry, id: (row.before as Record<string, unknown> | null)?.id || period.id,
        source: (row.before as Record<string, unknown> | null)?.source || 'manual', confidence: 'observed',
        endDate: entry.endDate || '', flow: entry.flow || '' };
    }
    if (change.operation === 'add') {
      appendImportedArrayItem(data, path, entry);
      clearTombstone(data, path, getConfiguredArrayItemId(path, entry));
    } else {
      replaceImportedArrayItem(data, path, change.index!, entry);
      const id = getConfiguredArrayItemId(path, entry);
      if (id !== getConfiguredArrayItemId(path, row.before)) clearTombstone(data, path, id);
    }
  }
  if (card === 'menstrualCycle') {
    const profile = recordObject(data.menstrualCycle), upgraded = upgradeMenstrualCycleProfile(profile)!;
    // Keep derived summaries, without persisting the editor's default status, lengths or flow as reported facts.
    data.menstrualCycle = { ...profile, schemaVersion: 2, periods: upgraded.periods, coverage: upgraded.coverage, historySummary: upgraded.historySummary,
      ...Object.fromEntries(Object.entries(summarizeCyclePeriods(upgraded.periods)).filter(([, value]) => value !== null)) };
  }
}
