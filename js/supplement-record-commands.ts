// Headless, dated therapy changes. Original periods and unknown label metadata survive.
import { agentDataObject, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { getSupplementPeriods, getSupplementRecordId, recordSupplementSchedule, recordIngredientDoseChange, SUPPLEMENT_RECORD_VERSION } from './supplement-medication-domain.js';
import type { SupplementRecord } from '../types/supplement-data.js';

const routes = ['', 'oral', 'sublingual', 'topical', 'transdermal', 'inhaled', 'nasal', 'injection', 'ophthalmic', 'otic', 'rectal', 'vaginal', 'other'];
const evidenceScopes = ['unknown', 'matching-lot', 'different-lot', 'general-specification'];
const textFields = ['name', 'type', 'dosage', 'note', 'brand', 'genericName', 'dosageForm', 'route', 'labelDirections', 'reason', 'prescriber', 'sourceUrl', 'qualityEvidenceScope'] as const;
export const supplementEditableFields = Object.fromEntries([
  ...textFields.map(key => [key, key === 'type' ? ['supplement', 'medication'] : key === 'route' ? routes : key === 'qualityEvidenceScope' ? evidenceScopes : 'Text; optional fields may be cleared with null']),
  ['startDate', 'YYYY-MM-DD for add only; use periods to correct historical dates'],
  ['periods', 'Whole history replacement array: index (optional original index, preserves metadata), start (required date), end (date or null), dose (text), endReason (text); retain unchanged periods; must not overlap'],
  ['schedule', 'Object: mode (daily/multiple/selected-days/interval/prn/course/cycle/phased/other), timesPerDay, details, daysOfWeek (0–6), intervalDays, maxPerDay'],
  ['servingSize', 'Object: value (positive number), unit (text)'],
  ['ingredients', 'Replacement array: index (optional original index), name (required), amount, amountValue, amountUnit, timesPerDay'],
  ['inactiveIngredients', 'Array of text'], ['qualityTests', 'Replacement array: index (optional original index), category, analyte, resultText, comparator, value, unit, basis, status, includeInAIContext'],
  ['date', 'Effective YYYY-MM-DD for pause/stop/restart/changeDose; defaults to the turn date'],
]);
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 4000) throw new Error(`Supply text for ${label}.`);
  return value.trim();
}
function number(value: unknown, label: string, min = 0, max = 1000000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Supply ${label} in its allowed range.`);
  return value;
}
function schedule(value: unknown, previous?: SupplementRecord['schedule']): NonNullable<SupplementRecord['schedule']> {
  const input = agentDataObject(value);
  validateFieldNames(input, ['mode', 'timesPerDay', 'details', 'daysOfWeek', 'intervalDays', 'maxPerDay']);
  const result = { ...previous, ...input } as NonNullable<SupplementRecord['schedule']>;
  if (!['daily', 'multiple', 'selected-days', 'interval', 'prn', 'course', 'cycle', 'phased', 'other'].includes(String(result.mode))) throw new Error('Choose a supported schedule mode.');
  for (const key of ['timesPerDay', 'intervalDays', 'maxPerDay'] as const) if (input[key] !== undefined && input[key] !== null) result[key] = number(input[key], key, 0.01, key === 'intervalDays' ? 365 : 99);
  if (input.details !== undefined) result.details = string(input.details, 'schedule details');
  if (result.mode === 'selected-days') {
    if (!Array.isArray(result.daysOfWeek) || !result.daysOfWeek.length || result.daysOfWeek.some(day => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Specify weekdays as numbers from 0 (Sun) to 6 (Sat).');
  } else delete result.daysOfWeek;
  if (result.mode === 'interval') { if (!Number.isInteger(result.intervalDays) || Number(result.intervalDays) < 1) throw new Error('Specify an interval in whole days.'); }
  else delete result.intervalDays;
  if (result.mode === 'prn') result.timesPerDay = null;
  return result;
}
function periods(value: unknown, previous: NonNullable<SupplementRecord['periods']>): NonNullable<SupplementRecord['periods']> {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Provide one to 100 dated periods.');
  const result = value.map(raw => {
    const row = agentDataObject(raw); validateFieldNames(row, ['index', 'start', 'end', 'dose', 'endReason']);
    if (row.index !== undefined && (!Number.isInteger(row.index) || Number(row.index) < 0 || Number(row.index) >= previous.length)) throw new Error('Read the original period index first.');
    if (!validAgentDate(row.start) || row.end != null && (!validAgentDate(row.end) || row.end < row.start)) throw new Error('Period dates must be real and ordered.');
    const original = row.index !== undefined ? previous[Number(row.index)] : previous.find(period => period.start === row.start);
    return { ...original, start: row.start, end: row.end == null ? null : row.end as string,
      ...(row.dose !== undefined ? { dose: string(row.dose, 'period dose') } : {}), ...(row.endReason !== undefined ? { endReason: string(row.endReason, 'end reason') } : {}) };
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < result.length; i++) if ((result[i - 1]!.end || '9999-12-31') >= result[i]!.start) throw new Error('Periods cannot overlap or share a date.');
  return result;
}
function listOfObjects(value: unknown, allowed: readonly string[], required: readonly string[], numeric: readonly string[], previous: readonly object[] = [], identityKeys: readonly string[] = ['name']): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Supply a bounded list of records.');
  return value.map(raw => {
    const row = agentDataObject(raw); validateFieldNames(row, [...allowed, 'index']);
    if (row.index !== undefined && (!Number.isInteger(row.index) || Number(row.index) < 0 || Number(row.index) >= previous.length)) throw new Error('Read the original row index first.');
    const matches = row.index !== undefined ? [previous[Number(row.index)]!] : previous.filter(item => identityKeys.every(key => agentDataObject(item)[key] === row[key]));
    if (matches.length > 1) throw new Error('Choose an explicit original index for duplicate label rows.');
    for (const key of required) if (!string(row[key], key)) throw new Error(`${key} is required.`);
    const result: Record<string, unknown> = { ...matches[0] };
    for (const [key, value] of Object.entries(row)) {
      if (key === 'index') continue;
      if (value === null && !required.includes(key)) { delete result[key]; continue; }
      if (numeric.includes(key)) result[key] = number(value, key);
      else if (key === 'includeInAIContext') {
        if (typeof value !== 'boolean') throw new Error('Specify a boolean inclusion flag.');
        result[key] = value;
      } else result[key] = string(value, key);
    }
    return result;
  });
}
export function projectSupplementCommand(before: unknown, proposal: AgentDataProposal, patch: Record<string, unknown>): SupplementRecord | null {
  const { operation, effectiveDate: turnDate, recordedAt } = proposal;
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(proposal.recordId)) throw new Error('A stable supplement identity is required.');
  const previous = before === null ? null : agentDataObject(before) as SupplementRecord;
  if (operation === 'add' ? previous !== null : previous === null) throw new Error('Read the intended supplement or medication first.');
  if (operation === 'remove') { validateFieldNames(patch, []); return null; }
  const date = patch.date ?? turnDate;
  if (!validAgentDate(date)) throw new Error('Supply a real effective date.');
  const result: SupplementRecord = { ...previous, id: previous ? getSupplementRecordId(previous) || proposal.recordId : proposal.recordId,
    schemaVersion: previous?.schemaVersion ?? SUPPLEMENT_RECORD_VERSION, name: previous?.name || '', updatedAt: recordedAt };
  let history = previous ? getSupplementPeriods(previous).map(period => ({ ...period })) : [];
  if (['pause', 'stop', 'restart', 'changeDose'].includes(operation)) {
    validateFieldNames(patch, operation === 'changeDose' ? ['date', 'dosage'] : ['date', 'reason']);
    const open = history.find(period => period.start <= date && (!period.end || period.end >= date));
    if (operation === 'restart') {
      if (history.some(period => period.start > date) || history.some(period => period.start <= date && (!period.end || period.end > date))) throw new Error('Review active or planned periods before restarting.');
      const last = history.at(-1);
      if (last?.end === date) last.end = null;
      else history.push({ start: date, end: null, ...(last?.dose ? { dose: last.dose } : {}), ...(last?.ingredientDoses ? { ingredientDoses: structuredClone(last.ingredientDoses) } : {}), ...(result.schedule ? { schedule: structuredClone(result.schedule) } : {}) });
    } else {
      if (!open) throw new Error('There is no period on that date to change.');
      if (operation === 'changeDose') {
        const dose = string(patch.dosage, 'new dosage'); if (!dose) throw new Error('Supply the reported new dose.');
        if (open.start === date) { open.dose = dose; delete open.ingredientDoses; }
        else {
          const dayBefore = new Date(`${date}T12:00:00`); dayBefore.setDate(dayBefore.getDate() - 1);
          const end = `${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, '0')}-${String(dayBefore.getDate()).padStart(2, '0')}`;
          history.push({ ...open, start: date, dose }); delete history.at(-1)!.ingredientDoses; open.end = end;
        }
        result.currentDose = dose; result.dosage = dose;
      } else { open.end = date; if (patch.reason !== undefined) open.endReason = string(patch.reason, 'end reason'); }
    }
    result.lifecycle = { ...previous?.lifecycle, state: operation === 'pause' ? 'paused' : operation === 'stop' ? 'ended' : 'active', changedAt: recordedAt,
      ...(patch.reason !== undefined ? { reason: string(patch.reason, 'reason') } : {}) };
  } else {
    validateFieldNames(patch, [...textFields, 'startDate', 'periods', 'schedule', 'servingSize', 'ingredients', 'inactiveIngredients', 'qualityTests']);
    if (operation !== 'add' && patch.startDate !== undefined) throw new Error('Use periods to correct historical dates.');
    for (const key of textFields) if (Object.hasOwn(patch, key)) {
      if (patch[key] === null && !['name', 'type'].includes(key)) delete result[key];
      else result[key] = string(patch[key], key);
    }
    if (patch.route != null && !routes.includes(String(patch.route))) throw new Error('Choose a supported route.');
    if (patch.qualityEvidenceScope != null && !evidenceScopes.includes(String(patch.qualityEvidenceScope))) throw new Error('Choose a supported quality evidence scope.');
    if (!result.name.trim() || !['medication', 'supplement'].includes(String(result.type))) throw new Error('A name and type are required.');
    if (patch.sourceUrl && !['http:', 'https:'].includes(new URL(String(patch.sourceUrl)).protocol)) throw new Error('Use an HTTP(S) product URL.');
    if (operation === 'add') {
      const start = patch.startDate ?? turnDate; if (!validAgentDate(start)) throw new Error('Use a real start date.');
      history = [{ start, end: null }];
      result.schedule = { mode: 'other', details: 'Schedule not reported', timesPerDay: null };
    }
    if (patch.periods !== undefined) history = periods(patch.periods, history);
    if (patch.schedule !== undefined) {
      result.schedule = schedule(patch.schedule, result.schedule);
      history = recordSupplementSchedule(previous, history, result.schedule, date);
      if (result.schedule.timesPerDay == null) delete result.timesPerDay; else result.timesPerDay = result.schedule.timesPerDay;
    }
    if (Object.hasOwn(patch, 'servingSize')) {
      if (patch.servingSize === null) delete result.servingSize;
      else { const value = agentDataObject(patch.servingSize); validateFieldNames(value, ['value', 'unit']); result.servingSize = { value: number(value.value, 'serving size', 0.000001), unit: string(value.unit, 'serving unit') }; }
    }
    if (Object.hasOwn(patch, 'ingredients')) result.ingredients = listOfObjects(patch.ingredients, ['name', 'amount', 'amountValue', 'amountUnit', 'timesPerDay'], ['name'], ['amountValue', 'timesPerDay'], previous?.ingredients) as NonNullable<SupplementRecord['ingredients']>;
    if (Object.hasOwn(patch, 'qualityTests')) result.qualityTests = listOfObjects(patch.qualityTests, ['category', 'analyte', 'resultText', 'comparator', 'value', 'unit', 'basis', 'status', 'includeInAIContext'], [], ['value'], previous?.qualityTests, ['category', 'analyte']);
    if (Object.hasOwn(patch, 'inactiveIngredients')) {
      if (!Array.isArray(patch.inactiveIngredients)) throw new Error('Supply an array of inactive ingredients.');
      result.inactiveIngredients = patch.inactiveIngredients.map(value => string(value, 'inactive ingredient'));
    }
    result.lifecycle = { ...previous?.lifecycle, state: history.some(period => period.start <= turnDate && !period.end) ? 'active' : history.some(period => period.start > turnDate) ? 'planned' : previous?.lifecycle?.state || 'ended', changedAt: recordedAt };
  }
  if (['add', 'update'].includes(operation) && (patch.ingredients !== undefined || patch.schedule !== undefined)) {
    recordIngredientDoseChange({ ...result, periods: history }, date, previous);
    const dose = history.at(-1)?.dose;
    if (dose) result.currentDose = dose;
  }
  // Validate history produced by every semantic operation, preserving its metadata.
  for (const period of history) if (!validAgentDate(period.start) || period.end != null && (!validAgentDate(period.end) || period.end < period.start)) throw new Error('Review the historical periods first.');
  history.sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < history.length; i++) if ((history[i - 1]!.end || '9999-12-31') >= history[i]!.start) throw new Error('The change would overlap another period.');
  result.periods = history; result.startDate = history[0]!.start; result.endDate = history.at(-1)?.end ?? null;
  return result;
}
