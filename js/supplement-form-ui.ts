import {
  renderSupplementIngredient,
  renderSupplementPeriod,
  renderSupplementQuality,
  renderSupplementForm,
  captureSupplementFormAction,
  captureSupplementIndexedAction,
} from './supplement-form-presentation.js';
import type {SupplementIngredientView, SupplementPeriodView, SupplementQualityView, SupplementFormView} from './supplement-form-presentation.js';
import {captureSupplementReviewText, captureSupplementReviewRows} from './supplement-import-review-view.js';
import type {SupplementImportReviewView} from './supplement-import-review-view.js';
// supplement-form-ui.js — Structured supplement/medication form controls and collection.

import { state } from './state.js';
import type { SupplementDoseView } from './supplement-medication-domain.js';
import type { QualityTestView } from './supplement-quality.js';

export interface FormIngredientReader extends Record<string, unknown> { name?: unknown; amount?: unknown; amountValue?: unknown; amountUnit?: unknown; timesPerDay?: unknown }
export interface FormPeriodReader extends Record<string, unknown> { start?: unknown; end?: unknown; dose?: unknown; ingredientDoses?: SupplementDoseView[] | null; schedule?: unknown }
export interface CollectedFormPeriod extends Record<string, unknown> { start: string; end: string | null; dose?: unknown; ingredientDoses?: unknown; schedule?: unknown }
export interface FormSupplementReader extends Record<string, unknown> {
  ingredients?: FormIngredientReader[] | null; inactiveIngredients?: unknown[] | null; qualityTests?: QualityTestView[] | null;
  importProvenance?: { url?: unknown } | null; servingSize?: { value?: unknown; unit?: unknown } | null;
  schedule?: Record<string, unknown> | null; lifecycle?: { reason?: unknown; state?: unknown } | null;
}
export interface FormPendingImportReader { draft?: { source?: { reviewed?: unknown }; ingredients?: FormIngredientReader[]; qualityTests?: QualityTestView[] } }
// These local readers describe original unchecked operations, not normalized stored values.
interface FormScheduleRenderReader extends Record<string, unknown> { daysOfWeek?: { map<Result>(callback: (day: number) => Result): Result[] } | null }
type QuantityReader = (ingredient: FormIngredientReader | null | undefined) => ReturnType<typeof getIngredientQuantity>;
type FormPeriodGetter = (supplement: FormSupplementReader | null | undefined) => FormPeriodReader[];
type FormStatusGetter = (supplement: FormSupplementReader | null | undefined) => ReturnType<typeof getSupplementStatus>;

import { assistantFeatureSupports, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { formatSupplementTotal, ingredientDailyTotal } from './supplement-impact.js';
import {
  SUPPLEMENT_UNIT_OPTIONS,
  supplementDoseText,
  formatSupplementAmount,
  getIngredientQuantity,
  getSupplementDailyDoses,
  getSupplementPeriods,
  getSupplementStatus,
  localDateKey,
  normalizeSupplementUnit,
  parseSupplementQuantity,
} from './supplement-medication-domain.js';
import {
  isSupplementQualityIncludedInAI,
  supplementQualityKey,
} from './supplement-quality.js';
import { supplementImportIngredientKey } from './supplement-import-draft.js';

export function getFormField(id: string) {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement ? element : null;
}

export function getElementValue(element: unknown) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement ? element.value : '';
}

export function getFieldValue(id: string) {
  return getFormField(id)?.value || '';
}

const formSnapshots = new WeakMap<Element, string>();
const recordSnapshots = new WeakMap<Element, string | undefined>();
const fieldSnapshots = new WeakMap<Element, string>();

function supplementFormSnapshot(form: Element) {
  return JSON.stringify(Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')).map(field =>
    [field.id, field.className, field.value, field instanceof HTMLInputElement ? field.checked : null]))
    + JSON.stringify(Array.from(form.querySelectorAll('[data-ingredient-doses]')).map(row => row.getAttribute('data-ingredient-doses')));
}

export function rememberSupplementForm() {
  const form = document.getElementById('supp-form-panel');
  if (form) {
    formSnapshots.set(form, supplementFormSnapshot(form));
    for (const element of form.querySelectorAll('[id], .supp-ingredient-row, .supp-quality-row')) {
      fieldSnapshots.set(element, element.matches('input, select, textarea')
        ? JSON.stringify([getElementValue(element), element instanceof HTMLInputElement ? element.checked : null]) : supplementFormSnapshot(element));
    }
    const index = Number(form.getAttribute('data-edit-index'));
    recordSnapshots.set(form, JSON.stringify(state.importedData.supplements?.[index]));
  }
}

/** Untouched controls must not normalize or discard legacy data on an unrelated edit. */
export function supplementFieldsChanged(selector: string) {
  return Array.from(document.querySelectorAll(selector)).some(element =>
    !fieldSnapshots.has(element) || fieldSnapshots.get(element) !== (element.matches('input, select, textarea')
      ? JSON.stringify([getElementValue(element), element instanceof HTMLInputElement ? element.checked : null]) : supplementFormSnapshot(element)));
}

export function supplementFormRecordChanged() {
  const form = document.getElementById('supp-form-panel');
  if (!form || !recordSnapshots.has(form)) return false;
  const index = Number(form.getAttribute('data-edit-index'));
  return recordSnapshots.get(form) !== JSON.stringify(state.importedData.supplements?.[index]);
}

export function supplementFormHasChanges() {
  const form = document.getElementById('supp-form-panel');
  return !!form && formSnapshots.has(form) && formSnapshots.get(form) !== supplementFormSnapshot(form);
}

export function parseHttpUrl(raw: unknown) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function sourceUrlParts(raw: unknown) {
  const parsed = parseHttpUrl(raw);
  return parsed ? { url: parsed.toString(), host: parsed.hostname.replace(/^www\./, '') } : null;
}

export function ingredientRowHtml(idx: number, name: unknown = '', amount: unknown = '', timesPerDay: unknown = '', outerTimes: unknown = '', sourceIngredient: unknown = null) {
  return renderSupplementIngredient(projectSupplementIngredientRow(idx, name, amount, timesPerDay, outerTimes, sourceIngredient));
}

export function projectSupplementIngredientRow(idx: number, name: unknown = '', amount: unknown = '', timesPerDay: unknown = '', outerTimes: unknown = '', sourceIngredient: unknown = null): SupplementIngredientView {
  const ingredient = sourceIngredient && typeof sourceIngredient === 'object'
    ? sourceIngredient as FormIngredientReader : { name, amount, timesPerDay };
  const quantity = (getIngredientQuantity as QuantityReader)(ingredient);
  const amountValue = quantity ? String(quantity.value) : amount;
  const amountUnit = quantity?.unit || normalizeSupplementUnit(ingredient.amountUnit || '');
  const standardUnits = new Set(SUPPLEMENT_UNIT_OPTIONS.map(option => option.value));
  const selectedUnit = standardUnits.has(amountUnit) ? amountUnit : amountUnit ? '__custom__' : '';
  const unitOptions = captureSupplementReviewRows(SUPPLEMENT_UNIT_OPTIONS, option =>
    ({
    value: `${captureSupplementReviewText(option.value)}`,
    selected: !!(selectedUnit === option.value),
    label: `${captureSupplementReviewText(option.label)}`,
  })
  );
  const rowTimes = timesPerDay !== '' && timesPerDay != null ? String(timesPerDay) : '';
  const effective = rowTimes || outerTimes;
  const total = effective
    ? ingredientDailyTotal({ amount, amountValue: quantity?.value, amountUnit, timesPerDay: effective })
    : null;
  return ({
    index: `${idx}`,
    originalIndex: `${sourceIngredient ? idx : -1}`,
    name: `${captureSupplementReviewText(name)}`,
    amount: `${captureSupplementReviewText(amountValue)}`,
    unitOptions: unitOptions,
    otherSelected: !!(selectedUnit === '__custom__'),
    customUnit: `${selectedUnit === '__custom__' ? captureSupplementReviewText(amountUnit) : ''}`,
    customHidden: !(selectedUnit === '__custom__'),
    timesPerDay: `${captureSupplementReviewText(rowTimes)}`,
    dailyTotal: `${total ? captureSupplementReviewText(formatSupplementTotal(total)) : ''}`,
    removeAction: captureSupplementFormAction('remove-ingredient'),
  });
}

export function getOuterTimesFromForm() {
  return getFieldValue('supp-times').trim();
}

export function updateIngTotal(inputElement: Element) {
  const row = inputElement.closest('.supp-ingredient-row');
  if (!row) return;
  const amountValue = getElementValue(row.querySelector('.supp-ing-amount'));
  const selectedUnit = getElementValue(row.querySelector('.supp-ing-unit'));
  const unit = selectedUnit === '__custom__'
    ? getElementValue(row.querySelector('.supp-ing-unit-custom')).trim() : selectedUnit;
  const rowTimes = getElementValue(row.querySelector('.supp-ing-times'));
  const totalElement = row.querySelector('.supp-ing-total');
  if (!totalElement) return;
  const effective = rowTimes || getOuterTimesFromForm();
  const total = effective ? ingredientDailyTotal({
    amount: formatSupplementAmount(amountValue, unit), amountValue, amountUnit: unit, timesPerDay: effective,
  }) : null;
  totalElement.textContent = total ? formatSupplementTotal(total) : '';
}

export function updateAllIngTotals() {
  for (const row of document.querySelectorAll('#supp-ingredients .supp-ingredient-row')) {
    const amount = row.querySelector('.supp-ing-amount');
    if (amount) updateIngTotal(amount);
  }
}

export function updateIngredientUnit(inputElement: Element) {
  const row = inputElement.closest('.supp-ingredient-row');
  const custom = row?.querySelector('.supp-ing-unit-custom');
  if (custom instanceof HTMLInputElement) {
    custom.hidden = getElementValue(inputElement) !== '__custom__';
    if (!custom.hidden) custom.focus();
  }
  if (row) updateIngTotal(inputElement);
}

export function addIngredientRow() {
  const container = document.getElementById('supp-ingredients');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', ingredientRowHtml(container.children.length, '', '', '', getOuterTimesFromForm()));
  const inputs = container.querySelectorAll('.supp-ing-name');
  const last = inputs[inputs.length - 1];
  if (last instanceof HTMLElement) last.focus();
}

export function removeIngredientRow(button: Element) {
  button.closest('.supp-ingredient-row')?.remove();
}

export function periodRowHtml(idx: number, period: FormPeriodReader = {}, showRemove: unknown = true, originalIndex = -1) {
  return renderSupplementPeriod(projectSupplementPeriodRow(idx, period, showRemove, originalIndex));
}

export function projectSupplementPeriodRow(idx: number, period: FormPeriodReader = {}, showRemove: unknown = true, originalIndex = -1): SupplementPeriodView {
  return ({
    index: `${idx}`,
    originalIndex: `${originalIndex}`,
    start: `${captureSupplementReviewText(period.start || '')}`,
    end: `${captureSupplementReviewText(period.end || '')}`,
    dose: `${captureSupplementReviewText(supplementDoseText(period.dose))}`,
    useDoseAction: captureSupplementFormAction('use-ingredient-dose'),
    doseSummary: period.ingredientDoses?.length ? ({
    text: `${period.ingredientDoses.map(d => `${captureSupplementReviewText(d.ingredient)}: ${captureSupplementReviewText(supplementDoseText(d))}`).join('; ')}`,
  }) : null,
    removeAction: captureSupplementFormAction('remove-period'),
    removeStyle: !showRemove,
  });
}

/** Copy a current amount only after the user chooses the dated period. Saving remains explicit. */
export function applyIngredientDoseToPeriod(button: Element) {
  const row = button.closest('.supp-period-row');
  if (!row) return;
  const doses = (getSupplementDailyDoses as (record: unknown) => ReturnType<typeof getSupplementDailyDoses>)({ ingredients: collectIngredients(), timesPerDay: Number(getFieldValue('supp-times')),
    schedule: { mode: getFieldValue('supp-schedule-mode') || 'daily' } });
  if (!doses.length) {
    button.textContent = 'Set ingredient amounts and daily frequency first';
    return;
  }
  const input = row.querySelector<HTMLInputElement>('.supp-period-dose')!;
  (input as { value: unknown }).value = doses.length === 1 ? supplementDoseText(doses[0]!) : '';
  row.setAttribute('data-ingredient-doses', JSON.stringify(doses));
  row.querySelector('.supp-period-dose-summary')?.remove();
  const summary = document.createElement('small');
  summary.className = 'supp-period-dose-summary';
  summary.textContent = doses.map(d => `${d.ingredient}: ${supplementDoseText(d)}`).join('; ') + ` — ${row.querySelector<HTMLInputElement>('.supp-period-start')!.value || 'set start date'} → ${row.querySelector<HTMLInputElement>('.supp-period-end')!.value || 'ongoing'}. Save changes to keep these dates.`;
  row.append(summary);
}

const draftDoseSplits = new WeakMap<Element, { row: Element; end: string; previousEnd: string }>();

export function addPeriodRow(period: FormPeriodReader = {}, splitRow: Element | null = null, previousEnd = '') {
  const container = document.getElementById('supp-periods');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', periodRowHtml(container.children.length, period, true, -1));
  if (splitRow && container.lastElementChild) {
    draftDoseSplits.set(container.lastElementChild, { row: splitRow, end: getElementValue(splitRow.querySelector('.supp-period-end')), previousEnd });
  }
  for (const button of container.querySelectorAll('.supp-period-remove')) {
    if (button instanceof HTMLElement) button.style.display = '';
  }
}

export function removePeriodRow(button: Element) {
  const container = document.getElementById('supp-periods');
  if (!container) return;
  const row = button.closest('.supp-period-row');
  const split = row && draftDoseSplits.get(row);
  const end = split?.row.querySelector('.supp-period-end');
  // Removing an unsaved new-dose row also undoes its automatic end date.
  if (end instanceof HTMLInputElement && end.value === split!.end) end.value = split!.previousEnd;
  row?.remove();
  const rows = container.querySelectorAll('.supp-period-row');
  const removeButton = rows.length === 1 ? rows[0]!.querySelector('.supp-period-remove') : null;
  if (removeButton instanceof HTMLElement) removeButton.style.display = 'none';
}

export function collectPeriods() {
  const periods: CollectedFormPeriod[] = [];
  for (const row of document.querySelectorAll('#supp-periods .supp-period-row')) {
    const start = getElementValue(row.querySelector('.supp-period-start'));
    const end = getElementValue(row.querySelector('.supp-period-end')) || null;
    const dose = getElementValue(row.querySelector('.supp-period-dose')).trim();
    const previousIndex = Number.parseInt(row.getAttribute('data-original-index') || '', 10);
    const supplementIndex = Number.parseInt(document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') || '', 10);
    const previous = Number.isInteger(supplementIndex) && supplementIndex >= 0
      ? (getSupplementPeriods as FormPeriodGetter)(state.importedData.supplements?.[supplementIndex])?.[previousIndex] : null;
    if (!start) continue;
    const period: CollectedFormPeriod = { ...(previous && typeof previous === 'object' ? previous : {}), start, end };
    const snapshot = row.getAttribute('data-ingredient-doses');
    if (snapshot) {
      const doses = JSON.parse(snapshot) as { length?: unknown; [index: number]: unknown };
      if (dose === (doses.length === 1 ? supplementDoseText(doses[0]!) : '')) {
        period.ingredientDoses = doses;
        if (doses.length === 1) period.dose = doses[0]; else delete period.dose;
        period.schedule = previous?.schedule ? { ...(previous.schedule as object) } : { mode: 'daily' };
        periods.push(period);
        continue;
      }
    }
    if (dose !== supplementDoseText(previous?.dose)) delete period.ingredientDoses;
    if (dose) {
      const linked = (typeof previous?.dose === 'object' ? previous.dose : null) as SupplementDoseView | null | undefined;
      period.dose = previous?.dose && supplementDoseText(previous.dose) === dose ? previous.dose
        : linked?.ingredient ? { text: dose, ingredient: linked.ingredient } : dose;
    }
    else delete period.dose;
    periods.push(period);
  }
  return periods;
}

export function collectIngredients(pendingImport: FormPendingImportReader | null = null) {
  const ingredients: unknown[] = [];
  for (const row of document.querySelectorAll('#supp-ingredients .supp-ingredient-row')) {
    const name = getElementValue(row.querySelector('.supp-ing-name')).trim();
    if (!name) continue;
    const amountValueRaw = getElementValue(row.querySelector('.supp-ing-amount')).trim();
    const selectedUnit = getElementValue(row.querySelector('.supp-ing-unit'));
    const amountUnit = normalizeSupplementUnit(selectedUnit === '__custom__'
      ? getElementValue(row.querySelector('.supp-ing-unit-custom')).trim() : selectedUnit);
    const timesRaw = getElementValue(row.querySelector('.supp-ing-times')).trim();
    const previousIndex = Number.parseInt(row.getAttribute('data-original-index') || '', 10);
    const supplementIndex = Number.parseInt(document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') || '', 10);
    const previous = Number.isInteger(supplementIndex) && supplementIndex >= 0
      ? state.importedData.supplements?.[supplementIndex]?.ingredients?.[previousIndex] : null;
    if (previous && !supplementFieldsChanged(`#supp-ingredients .supp-ingredient-row[data-original-index="${previousIndex}"]`)) {
      ingredients.push(structuredClone(previous));
      continue;
    }
    const imported = pendingImport?.draft?.source?.reviewed
      ? pendingImport.draft.ingredients!.find(candidate => supplementImportIngredientKey(candidate.name) === supplementImportIngredientKey(name))
      : null;
    const ingredient: FormIngredientReader = { ...(imported && typeof imported === 'object' ? imported : {}), ...(previous && typeof previous === 'object' ? previous : {}), name };
    const numericAmount = Number(amountValueRaw.replace(',', '.'));
    if (amountValueRaw && Number.isFinite(numericAmount)) {
      ingredient.amountValue = numericAmount;
      ingredient.amountUnit = amountUnit;
      ingredient.amount = formatSupplementAmount(amountValueRaw, amountUnit);
    } else {
      ingredient.amount = amountValueRaw;
      delete ingredient.amountValue;
      delete ingredient.amountUnit;
    }
    const times = timesRaw ? parseFloat(timesRaw) : NaN;
    if (isFinite(times) && times > 0) ingredient.timesPerDay = times;
    else delete ingredient.timesPerDay;
    ingredients.push(ingredient);
  }
  return ingredients.length ? ingredients : undefined;
}

export function qualityTestRowHtml(idx: number, test: QualityTestView = {}, originalIndex = -1, importIndex = -1) {
  return renderSupplementQuality(projectSupplementQualityRow(idx, test, originalIndex, importIndex));
}

export function projectSupplementQualityRow(idx: number, test: QualityTestView = {}, originalIndex = -1, importIndex = -1): SupplementQualityView {
  const categories = [
    ['contaminant', 'Contaminant / heavy metal'], ['potency', 'Potency / label claim'],
    ['microbiology', 'Microbiology'], ['identity', 'Identity / purity'], ['other', 'Other laboratory result'],
  ];
  return ({
    index: `${idx}`,
    originalIndex: `${originalIndex}`,
    importIndex: `${importIndex}`,
    categories: captureSupplementReviewRows(categories, ([value, label]) => ({
    value: `${value}`,
    selected: !!((test.category || 'other') === value),
    label: `${label}`,
  })),
    analyte: `${captureSupplementReviewText(test.analyte || '')}`,
    result: `${captureSupplementReviewText(test.resultText || '')}`,
    unit: `${captureSupplementReviewText(test.unit || '')}`,
    basis: `${captureSupplementReviewText(test.basis || '')}`,
    aiChecked: !(test.includeInAIContext === false),
    removeAction: captureSupplementFormAction('remove-quality-test'),
  });
}

export function addQualityTestRow(test: QualityTestView = {}) {
  const container = document.getElementById('supp-quality-tests');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', qualityTestRowHtml(container.children.length, test, -1));
  const input = container.lastElementChild?.querySelector('.supp-quality-analyte');
  if (input instanceof HTMLElement) input.focus();
}

export function removeQualityTestRow(button: Element) {
  button.closest('.supp-quality-row')?.remove();
}

export function collectInactiveIngredients() {
  const names = [...new Set(getFieldValue('supp-inactive-ingredients').split(/\n+/u).map(name => name.trim()).filter(Boolean))];
  return names.length ? names : undefined;
}

function qualityStatus(resultText: string, priorStatus: unknown = '') {
  const normalized = resultText.trim().toLowerCase().replace(/[.\s-]+/gu, '');
  if (['nd', 'notdetected'].includes(normalized)) return 'not-detected';
  if (['nq', 'notquantified', 'notquantifiable'].includes(normalized)) return 'not-quantified';
  if (['neg', 'negative'].includes(normalized)) return 'negative';
  if (['pass', 'passed', 'compliant'].includes(normalized)) return 'pass';
  if (['fail', 'failed', 'noncompliant'].includes(normalized)) return 'fail';
  return priorStatus && priorStatus !== 'unknown' ? priorStatus : resultText ? 'reported' : 'unknown';
}

export function collectQualityTests(pendingImport: FormPendingImportReader | null = null) {
  const tests: unknown[] = [];
  const supplementIndex = Number.parseInt(document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') || '', 10);
  const previousTests = Number.isInteger(supplementIndex) && supplementIndex >= 0
    ? state.importedData.supplements?.[supplementIndex]?.qualityTests || [] : [];
  for (const row of document.querySelectorAll('#supp-quality-tests .supp-quality-row')) {
    const category = getElementValue(row.querySelector('.supp-quality-category')) || 'other';
    const analyte = getElementValue(row.querySelector('.supp-quality-analyte')).trim();
    const resultText = getElementValue(row.querySelector('.supp-quality-result')).trim();

    const unit = normalizeSupplementUnit(getElementValue(row.querySelector('.supp-quality-unit')).trim());
    const basis = getElementValue(row.querySelector('.supp-quality-basis')).trim();
    const aiInput = row.querySelector('.supp-quality-ai-context');
    const includeInAIContext = aiInput instanceof HTMLInputElement ? aiInput.checked : true;
    const originalIndex = Number.parseInt(row.getAttribute('data-original-index') || '', 10);
    const previous = Number.isInteger(originalIndex) && originalIndex >= 0 ? previousTests[originalIndex] : null;
    if (previous && !supplementFieldsChanged(`#supp-quality-tests .supp-quality-row[data-original-index="${originalIndex}"]`)) {
      tests.push(structuredClone(previous));
      continue;
    }
    if (!analyte || !resultText) continue;
    const previousIdentityMatches = previous
      && previous.category === category
      && supplementQualityKey(previous.analyte) === supplementQualityKey(analyte);
    const importIndex = Number.parseInt(row.getAttribute('data-import-index') || '', 10);
    const importedByIndex = Number.isInteger(importIndex) && importIndex >= 0
      ? pendingImport?.draft?.qualityTests?.[importIndex] : null;
    const importedIdentityMatches = importedByIndex
      && importedByIndex.category === category
      && supplementQualityKey(importedByIndex.analyte) === supplementQualityKey(analyte);
    const imported = pendingImport?.draft?.source?.reviewed
      ? importedByIndex
        ? importedIdentityMatches ? importedByIndex : null
        : pendingImport.draft.qualityTests?.find(test => supplementQualityKey(test.analyte) === supplementQualityKey(analyte)
          && test.category === category && supplementQualityKey(test.basis) === supplementQualityKey(basis))
      : null;
    const sourceMetadata = imported || (previousIdentityMatches ? previous : null);
    const sourceResultText = sourceMetadata?.resultText == null ? '' : String(sourceMetadata.resultText).trim();
    const resultSemanticsChanged = Boolean(sourceMetadata) && resultText !== sourceResultText;
    const parsed = parseSupplementQuantity(resultText.replace(/^(?:≤|<=|>=|<|>|=)\s*/u, ''));
    const comparator = resultText.match(/^(≤|<=|<|>=|>|=)/u)?.[1]
      || (resultSemanticsChanged ? '' : sourceMetadata?.comparator || '');
    tests.push({
      ...(sourceMetadata && typeof sourceMetadata === 'object' ? sourceMetadata : {}),
      category, analyte, resultText, comparator,
      value: parsed?.value ?? null,
      unit: unit || parsed?.unit || '', basis,
      status: qualityStatus(resultText, resultSemanticsChanged ? '' : sourceMetadata?.status || ''),
      includeInAIContext,
    });
  }
  return tests.length ? tests : undefined;
}

export function suppFormHtml(editIdx: number, supplement: FormSupplementReader | null | undefined, importReview: SupplementImportReviewView | null = null) {
  return renderSupplementForm(projectSupplementFormView(editIdx, supplement, importReview));
}

export function projectSupplementFormView(editIdx: number, supplement: FormSupplementReader | null | undefined, importReview: SupplementImportReviewView | null = null): SupplementFormView {
  const editing = !!supplement;
  const ingredients = editing && supplement.ingredients ? supplement.ingredients : [];
  const inactiveIngredients = editing && Array.isArray(supplement.inactiveIngredients) ? supplement.inactiveIngredients : [];
  const qualityTests = editing && Array.isArray(supplement.qualityTests)
    ? supplement.qualityTests.map(test => ({ ...test, includeInAIContext: isSupplementQualityIncludedInAI(test, supplement) })) : [];
  const periods = editing ? (getSupplementPeriods as FormPeriodGetter)(supplement) : [{ start: localDateKey(), end: null }];
  const schedule: FormScheduleRenderReader = editing && supplement.schedule && typeof supplement.schedule === 'object'
    ? supplement.schedule : { mode: editing && Number(supplement.timesPerDay) > 1 ? 'multiple' : 'daily' };
  const status = editing ? (getSupplementStatus as FormStatusGetter)(supplement) : 'planned';
  return ({
    editIndex: `${editIdx}`,
    sourceUrl: `${captureSupplementReviewText(editing ? supplement.sourceUrl || supplement.importProvenance?.url || '' : '')}`,
    fetchAction: captureSupplementFormAction('fetch-url'),
    photoControls: hasAssistantFeatureProvider() && assistantFeatureSupports('image') ? ({
    action: captureSupplementFormAction('scan-label'),
  }) : null,
    importReview,
    name: `${editing ? captureSupplementReviewText(supplement.name) : ''}`,
    supplementSelected: !(editing && supplement.type === 'medication'),
    medicationSelected: !!(editing && supplement.type === 'medication'),
    servingSize: `${editing && supplement.servingSize?.value != null ? captureSupplementReviewText(String(supplement.servingSize.value)) : ''}`,
    servingUnit: `${editing ? captureSupplementReviewText(supplement.servingSize?.unit || '') : ''}`,
    timesPerDay: `${editing && (supplement.timesPerDay ?? schedule.timesPerDay) != null ? captureSupplementReviewText(String(supplement.timesPerDay ?? schedule.timesPerDay)) : ''}`,
    ingredients: captureSupplementReviewRows(ingredients, (ingredient, index) => projectSupplementIngredientRow(index, ingredient.name, ingredient.amount, ingredient.timesPerDay, editing && supplement.timesPerDay ? supplement.timesPerDay : '', ingredient)),
    addIngredientAction: captureSupplementFormAction('add-ingredient'),
    periods: captureSupplementReviewRows(periods, (period, index) => projectSupplementPeriodRow(index, period, periods.length > 1, index)),
    changeDose: editing && status === 'active' ? ({
    action: captureSupplementIndexedAction('change-dose', editIdx),
  }) : null,
    addPeriodAction: captureSupplementFormAction('add-period'),
    directions: `${editing ? captureSupplementReviewText(supplement.dosage || '') : ''}`,
    scheduleOptions: captureSupplementReviewRows([['daily','Daily'],['multiple','Multiple times daily'],['selected-days','Selected weekdays'],['interval','Every N days'],['prn','As needed (PRN)'],['course','Finite course'],['cycle','Cycle on/off'],['phased','Phased / taper'],['other','Other']], ([value, label]) => ({
    value: `${value}`,
    selected: !!(schedule.mode === value),
    label: `${label}`,
  })),
    routeOptions: captureSupplementReviewRows(['','oral','sublingual','topical','transdermal','inhaled','nasal','injection','ophthalmic','otic','rectal','vaginal','other'], route => ({
    value: `${route}`,
    selected: !!((supplement?.route || '') === route),
    label: `${route ? route.charAt(0).toUpperCase() + route.slice(1) : 'Not specified'}`,
  })),
    maxPerDay: `${schedule.maxPerDay != null ? captureSupplementReviewText(String(schedule.maxPerDay)) : ''}`,
    scheduleDetails: `${captureSupplementReviewText(schedule.details || (schedule.mode === 'selected-days' ? (schedule.daysOfWeek || []).map(day => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day] || day).join('/') : schedule.mode === 'interval' && schedule.intervalDays ? `every ${schedule.intervalDays} days` : ''))}`,
    brand: `${editing ? captureSupplementReviewText(supplement.brand || '') : ''}`,
    genericName: `${editing ? captureSupplementReviewText(supplement.genericName || '') : ''}`,
    dosageForm: `${editing ? captureSupplementReviewText(supplement.dosageForm || '') : ''}`,
    labelDirections: `${editing ? captureSupplementReviewText(supplement.labelDirections || '') : ''}`,
    inactiveIngredients: `${captureSupplementReviewText(inactiveIngredients.join('\n'))}`,
    evidenceScopeOptions: captureSupplementReviewRows([['unknown','Not verified / unknown'],['matching-lot','I confirmed the same lot'],['different-lot','Different lot'],['general-specification','General specification, not a bottle result']], ([value, label]) => ({
    value: `${value}`,
    selected: !!((!editing && value === 'unknown') || (supplement?.qualityEvidenceScope || 'unknown') === value),
    label: `${label}`,
  })),
    qualityTests: captureSupplementReviewRows(qualityTests, (test, index) => projectSupplementQualityRow(index, test, index)),
    addQualityAction: captureSupplementFormAction('add-quality-test'),
    reason: `${editing ? captureSupplementReviewText(supplement.reason || '') : ''}`,
    prescriber: `${editing ? captureSupplementReviewText(supplement.prescriber || '') : ''}`,
    endReason: `${editing ? captureSupplementReviewText(supplement.lifecycle?.reason || '') : ''}`,
    note: `${editing ? captureSupplementReviewText(supplement.note || '') : ''}`,
    saveAction: captureSupplementIndexedAction('save', editIdx),
    saveLabel: `${editing ? 'Save changes' : 'Add supplement'}`,
    pauseStop: editing && status === 'active' ? ({
    pauseAction: captureSupplementIndexedAction('pause', editIdx),
    stopAction: captureSupplementIndexedAction('end', editIdx),
  }) : null,
    restart: editing && ['paused', 'ended'].includes(status) ? ({
    action: captureSupplementIndexedAction('restart', editIdx),
  }) : null,
    deleteRecord: editing ? ({
    action: captureSupplementIndexedAction('delete', editIdx),
  }) : null,
    cancelAction: editing ? captureSupplementIndexedAction('toggle-accordion', editIdx) : captureSupplementFormAction('toggle-add-form'),
  });
}
