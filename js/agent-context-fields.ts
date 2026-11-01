// The same field identities and choices as the authored lifestyle editors.
// A proposal patches only its named fields; legacy and unrelated data survive.
import { lifestyleFields, lifestyleFormModel, lifestyleMeals, toggleLifestyleChoice } from './context-lifestyle-form-model.js';
import { structuredContextFields, contextFieldValue, projectContextRecord, applyContextRecord } from './agent-context-records.js';
import type { AgentContextField } from './agent-context-records.js';
import { AGENT_CONTEXT_CARD_LABELS } from '../shared/agent-tool-contract.js';
import type { AgentContextCard, AgentContextChange, AgentContextProposal } from '../shared/agent-tool-contract.js';
import type { ProfileData } from '../types/app-state.js';
import { contextValueForRead } from './context-card-legacy.js';

export function environmentEMFMode(data: Partial<ProfileData>): 'selfReport' | 'assessments' | 'reviewRequired' {
  const emf = data.emfAssessment;
  if (emf == null) return 'selfReport';
  if (typeof emf !== 'object' || Array.isArray(emf) || !Array.isArray(emf.assessments)) return 'reviewRequired';
  return emf.assessments.length ? 'assessments' : 'selfReport';
}
export const usesEnvironmentEMFQuickFields = (proposal: Pick<AgentContextProposal, 'card' | 'changes'>) => proposal.card === 'environment' && proposal.changes.some(change => ['emf', 'emfMitigation'].includes(change.field));

export function agentContextCardModel(card: AgentContextCard, data: Partial<ProfileData> = {}) {
  const structured = structuredContextFields(card);
  if (structured) return { title: AGENT_CONTEXT_CARD_LABELS[card], fields: structured };
  if (card === 'diagnoses' || card === 'healthGoals' || card === 'menstrualCycle') throw new Error('Unsupported structured context model.');
  // Only the Environment quick answers are needed here. Do not traverse private
  // assessments/photos or calculate severity to enumerate editable choices.
  const model = lifestyleFormModel(card, { environment: data.environment } as ProfileData, null);
  return {
    title: model.title,
    fields: [
      ...lifestyleFields(model).filter(field => !['emf', 'emfMitigation'].includes(field.key) || environmentEMFMode(data) === 'selfReport').map(field => ({
        key: field.key, label: field.label, kind: field.multiple ? 'multiple' as const : 'single' as const,
        options: field.options.map(option => ({ ...option })),
      })),
      { key: 'note', label: 'Notes', kind: 'text' as const, options: [] },
      ...(card === 'diet' ? lifestyleMeals.flatMap(meal => [
        { key: meal.key, label: meal.label, kind: 'text' as const, options: [] },
        { key: `${meal.key}Time`, label: `${meal.label} time`, kind: 'time' as const, options: [] },
      ]) : []),
    ] as AgentContextField[],
  };
}

export function contextCardRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('This context card needs review in its editor first.');
  return value as Record<string, unknown>;
}

export function projectContextChanges(card: AgentContextCard, baseline: unknown, changes: AgentContextChange[]) {
  baseline = contextValueForRead(card, baseline);
  const model = agentContextCardModel(card, { [card]: baseline } as Partial<ProfileData>);
  if (!['healthGoals', 'interpretiveLens'].includes(card)) contextCardRecord(baseline);
  return changes.map(change => {
    const field = model.fields.find(field => field.key === change.field);
    if (!field) throw new Error('The proposed context field is not editable. Read the card again.');
    if (field.kind === 'records') return projectContextRecord(card, baseline, change);
    if (change.operation || change.record || change.index !== undefined) throw new Error('Use value or values for this field.');
    let after: string | string[] | number | null;
    if (field.kind === 'multiple') {
      if (!Array.isArray(change.values) || change.value !== undefined
        || new Set(change.values).size !== change.values.length
        || change.values.some(value => !field.options.some(option => option.value === value))) {
        throw new Error('Use the allowed multiple-choice values returned by the context card.');
      }
      const draft = { [field.key]: [] as string[] };
      for (const value of change.values) toggleLifestyleChoice({ ...field, id: '', multiple: true }, draft, value);
      after = draft[field.key]!;
      if (after.length !== change.values.length) throw new Error('The proposed choices contradict each other.');
    } else {
      if (typeof change.value !== 'string' || change.values !== undefined || change.value.length > 2000) {
        throw new Error('Use one text value for this context field.');
      }
      const value = change.value.trim();
      if (field.kind === 'single' && value && !field.options.some(option => option.value === value)) {
        throw new Error('Use an allowed value returned by the context card.');
      }
      if (field.kind === 'time' && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Use a 24-hour time in HH:MM format.');
      if (field.kind === 'number') {
        if (value && (!/^\d+$/.test(value) || Number(value) < field.min! || Number(value) > field.max!)) throw new Error('Use a number in the allowed range.');
        after = value ? Number(value) : null;
      } else after = field.kind === 'single' ? value || null : value;
    }
    return { field: field.key, label: field.label, before: contextFieldValue(card, baseline, field.key), after };
  });
}

export { contextFieldValue };
export function applyAgentContextChanges(data: ProfileData, proposal: AgentContextProposal) {
  if (usesEnvironmentEMFQuickFields(proposal) && environmentEMFMode(data) !== 'selfReport') throw new Error('EMF quick answers are superseded by saved assessments or require review. Read emfAssessments and emfRooms, then propose the reported room facts.');
  const rows = projectContextChanges(proposal.card, JSON.parse(proposal.baseline), proposal.changes);
  const normalized = contextValueForRead(proposal.card, data[proposal.card]);
  if (normalized !== data[proposal.card]) Object.assign(data, { [proposal.card]: normalized });
  proposal.changes.forEach((change, index) => {
    if (change.operation) return;
    const value = rows[index]!.after;
    if (proposal.card === 'interpretiveLens') { data.interpretiveLens = String(value || ''); return; }
    const record = { ...contextCardRecord(data[proposal.card]) };
    if (proposal.card === 'diagnoses' && ['true', 'false', null].includes(value as string | null) && !['note', 'proceduresNote'].includes(change.field)) {
      const flags = { ...(record.flags as Record<string, unknown> || {}) };
      if (value === null) delete flags[change.field]; else flags[change.field] = value === 'true';
      record.flags = flags;
    } else record[change.field] = value;
    Object.assign(data, { [proposal.card]: record });
  });
  // Indices always refer to the read snapshot: update before removing, remove
  // from highest index first, then append. No operation silently shifts a target.
  const records = proposal.changes.filter(change => change.operation);
  for (const change of records.filter(change => change.operation === 'update')) applyContextRecord(data, proposal.card, change);
  for (const change of records.filter(change => change.operation === 'remove').sort((a, b) => b.index! - a.index!)) applyContextRecord(data, proposal.card, change);
  for (const change of records.filter(change => change.operation === 'add')) applyContextRecord(data, proposal.card, change);
}

export function contextProposalRows(proposal: AgentContextProposal) {
  return projectContextChanges(proposal.card, JSON.parse(proposal.baseline), proposal.changes);
}
