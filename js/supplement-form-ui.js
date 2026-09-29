// @ts-check
// supplement-form-ui.js — Structured supplement/medication form controls and collection.

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { assistantFeatureSupports, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { suppActionAttrs } from './supplement-action-delegates.js';
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

/** @param {string} id */
export function getFormField(id) {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement ? element : null;
}

/** @param {Element | null} element */
export function getElementValue(element) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement ? element.value : '';
}

/** @param {string} id */
export function getFieldValue(id) {
  return getFormField(id)?.value || '';
}

const formSnapshots = new WeakMap();
const recordSnapshots = new WeakMap();
const fieldSnapshots = new WeakMap();

function supplementFormSnapshot(form) {
  return JSON.stringify(Array.from(form.querySelectorAll('input, select, textarea')).map(field =>
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
export function supplementFieldsChanged(selector) {
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

export function parseHttpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function sourceUrlParts(raw) {
  const parsed = parseHttpUrl(raw);
  return parsed ? { url: parsed.toString(), host: parsed.hostname.replace(/^www\./, '') } : null;
}

export function ingredientRowHtml(idx, name = '', amount = '', timesPerDay = '', outerTimes = '', sourceIngredient = null) {
  const ingredient = sourceIngredient && typeof sourceIngredient === 'object'
    ? sourceIngredient : { name, amount, timesPerDay };
  const quantity = getIngredientQuantity(ingredient);
  const amountValue = quantity ? String(quantity.value) : amount;
  const amountUnit = quantity?.unit || normalizeSupplementUnit(ingredient.amountUnit || '');
  const standardUnits = new Set(SUPPLEMENT_UNIT_OPTIONS.map(option => option.value));
  const selectedUnit = standardUnits.has(amountUnit) ? amountUnit : amountUnit ? '__custom__' : '';
  const unitOptions = SUPPLEMENT_UNIT_OPTIONS.map(option =>
    `<option value="${escapeHTML(option.value)}"${selectedUnit === option.value ? ' selected' : ''}>${escapeHTML(option.label)}</option>`
  ).join('');
  const rowTimes = timesPerDay !== '' && timesPerDay != null ? String(timesPerDay) : '';
  const effective = rowTimes || outerTimes;
  const total = effective
    ? ingredientDailyTotal({ amount, amountValue: quantity?.value, amountUnit, timesPerDay: effective })
    : null;
  return `<div class="supp-ingredient-row" data-idx="${idx}" data-original-index="${sourceIngredient ? idx : -1}">
    <input type="text" class="supp-ing-name" aria-label="Ingredient name" placeholder="Ingredient" value="${escapeHTML(name)}">
    <input type="text" inputmode="decimal" class="supp-ing-amount" aria-label="Amount per serving" placeholder="Amount" value="${escapeHTML(amountValue)}">
    <select class="supp-ing-unit" aria-label="Amount unit">${unitOptions}<option value="__custom__"${selectedUnit === '__custom__' ? ' selected' : ''}>Other…</option></select>
    <input type="text" class="supp-ing-unit-custom" aria-label="Custom amount unit" placeholder="Unit" value="${selectedUnit === '__custom__' ? escapeHTML(amountUnit) : ''}"${selectedUnit === '__custom__' ? '' : ' hidden'}>
    <input type="number" class="supp-ing-times" aria-label="Ingredient servings per day override" placeholder="×/day" min="0" max="99" step="0.5" value="${escapeHTML(rowTimes)}">
    <span class="supp-ing-total">${total ? escapeHTML(formatSupplementTotal(total)) : ''}</span>
    <button class="supp-ing-remove" ${suppActionAttrs('remove-ingredient')} title="Remove">&times;</button>
  </div>`;
}

export function getOuterTimesFromForm() {
  return getFieldValue('supp-times').trim();
}

/** @param {Element} inputElement */
export function updateIngTotal(inputElement) {
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

/** @param {Element} inputElement */
export function updateIngredientUnit(inputElement) {
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

/** @param {Element} button */
export function removeIngredientRow(button) {
  button.closest('.supp-ingredient-row')?.remove();
}

export function periodRowHtml(idx, period = {}, showRemove = true, originalIndex = -1) {
  return `<div class="supp-period-row" data-idx="${idx}" data-original-index="${originalIndex}">
    <input type="date" class="supp-period-start" aria-label="Period start" required value="${escapeHTML(period.start || '')}">
    <span class="supp-period-arrow">&rarr;</span>
    <input type="date" class="supp-period-end" aria-label="Period end" value="${escapeHTML(period.end || '')}" placeholder="ongoing">
    <input type="text" class="supp-period-dose" aria-label="Dose or strength during period" placeholder="Dose / strength" value="${escapeHTML(supplementDoseText(period.dose))}">
    <button type="button" class="supp-ingredient-add" ${suppActionAttrs('use-ingredient-dose')}>Use ingredient totals</button>
    ${period.ingredientDoses?.length ? `<small class="supp-period-dose-summary">${period.ingredientDoses.map(d => `${escapeHTML(d.ingredient)}: ${escapeHTML(supplementDoseText(d))}`).join('; ')}</small>` : ''}
    <button class="supp-period-remove" ${suppActionAttrs('remove-period')} aria-label="Remove period" title="Remove period"${showRemove ? '' : ' style="display:none"'}>&times;</button>
  </div>`;
}

/** Copy a current amount only after the user chooses the dated period. Saving remains explicit. */
export function applyIngredientDoseToPeriod(button) {
  const row = button.closest('.supp-period-row');
  if (!row) return;
  const doses = getSupplementDailyDoses({ ingredients: collectIngredients(), timesPerDay: Number(getFieldValue('supp-times')),
    schedule: { mode: getFieldValue('supp-schedule-mode') || 'daily' } });
  if (!doses.length) {
    button.textContent = 'Set ingredient amounts and daily frequency first';
    return;
  }
  const input = row.querySelector('.supp-period-dose');
  input.value = doses.length === 1 ? supplementDoseText(doses[0]) : '';
  row.setAttribute('data-ingredient-doses', JSON.stringify(doses));
  row.querySelector('.supp-period-dose-summary')?.remove();
  const summary = document.createElement('small');
  summary.className = 'supp-period-dose-summary';
  summary.textContent = doses.map(d => `${d.ingredient}: ${supplementDoseText(d)}`).join('; ') + ` — ${row.querySelector('.supp-period-start').value || 'set start date'} → ${row.querySelector('.supp-period-end').value || 'ongoing'}. Save changes to keep these dates.`;
  row.append(summary);
}

const draftDoseSplits = new WeakMap();

export function addPeriodRow(period = {}, splitRow = null, previousEnd = '') {
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

/** @param {Element} button */
export function removePeriodRow(button) {
  const container = document.getElementById('supp-periods');
  if (!container) return;
  const row = button.closest('.supp-period-row');
  const split = row && draftDoseSplits.get(row);
  const end = split?.row.querySelector('.supp-period-end');
  // Removing an unsaved new-dose row also undoes its automatic end date.
  if (end instanceof HTMLInputElement && end.value === split.end) end.value = split.previousEnd;
  row?.remove();
  const rows = container.querySelectorAll('.supp-period-row');
  const removeButton = rows.length === 1 ? rows[0].querySelector('.supp-period-remove') : null;
  if (removeButton instanceof HTMLElement) removeButton.style.display = 'none';
}

export function collectPeriods() {
  const periods = [];
  for (const row of document.querySelectorAll('#supp-periods .supp-period-row')) {
    const start = getElementValue(row.querySelector('.supp-period-start'));
    const end = getElementValue(row.querySelector('.supp-period-end')) || null;
    const dose = getElementValue(row.querySelector('.supp-period-dose')).trim();
    const previousIndex = Number.parseInt(row.getAttribute('data-original-index') || '', 10);
    const supplementIndex = Number.parseInt(document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') || '', 10);
    const previous = Number.isInteger(supplementIndex) && supplementIndex >= 0
      ? getSupplementPeriods(state.importedData.supplements?.[supplementIndex])?.[previousIndex] : null;
    if (!start) continue;
    const period = { ...(previous && typeof previous === 'object' ? previous : {}), start, end };
    const snapshot = row.getAttribute('data-ingredient-doses');
    if (snapshot) {
      const doses = JSON.parse(snapshot);
      if (dose === (doses.length === 1 ? supplementDoseText(doses[0]) : '')) {
        period.ingredientDoses = doses;
        if (doses.length === 1) period.dose = doses[0]; else delete period.dose;
        period.schedule = previous?.schedule ? { ...previous.schedule } : { mode: 'daily' };
        periods.push(period);
        continue;
      }
    }
    if (dose !== supplementDoseText(previous?.dose)) delete period.ingredientDoses;
    if (dose) {
      const linked = typeof previous?.dose === 'object' ? previous.dose : null;
      period.dose = previous?.dose && supplementDoseText(previous.dose) === dose ? previous.dose
        : linked?.ingredient ? { text: dose, ingredient: linked.ingredient } : dose;
    }
    else delete period.dose;
    periods.push(period);
  }
  return periods;
}

/** @param {{ draft: any, issues: string[] } | null} [pendingImport] */
export function collectIngredients(pendingImport = null) {
  const ingredients = [];
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
      ? pendingImport.draft.ingredients.find(candidate => supplementImportIngredientKey(candidate.name) === supplementImportIngredientKey(name))
      : null;
    const ingredient = { ...(imported && typeof imported === 'object' ? imported : {}), ...(previous && typeof previous === 'object' ? previous : {}), name };
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

export function qualityTestRowHtml(idx, test = {}, originalIndex = -1, importIndex = -1) {
  const categories = [
    ['contaminant', 'Contaminant / heavy metal'], ['potency', 'Potency / label claim'],
    ['microbiology', 'Microbiology'], ['identity', 'Identity / purity'], ['other', 'Other laboratory result'],
  ];
  return `<div class="supp-quality-row" data-idx="${idx}" data-original-index="${originalIndex}" data-import-index="${importIndex}">
    <select class="supp-quality-category" aria-label="Laboratory result category">${categories.map(([value, label]) => `<option value="${value}"${(test.category || 'other') === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
    <input type="text" class="supp-quality-analyte" aria-label="Tested analyte" placeholder="Analyte" value="${escapeHTML(test.analyte || '')}">
    <input type="text" class="supp-quality-result" aria-label="Reported laboratory result" placeholder="ND, &lt; 0.01, 98…" value="${escapeHTML(test.resultText || '')}">
    <input type="text" class="supp-quality-unit" aria-label="Laboratory result unit" placeholder="mg" value="${escapeHTML(test.unit || '')}">
    <input type="text" class="supp-quality-basis" aria-label="Laboratory result basis" placeholder="per capsule, mg/kg…" value="${escapeHTML(test.basis || '')}">
    <label class="supp-quality-ai-toggle" title="Include this result in AI health context"><input type="checkbox" class="supp-quality-ai-context"${test.includeInAIContext === false ? '' : ' checked'}><span>AI</span></label>
    <button type="button" class="supp-ing-remove" ${suppActionAttrs('remove-quality-test')} title="Remove laboratory result">&times;</button>
  </div>`;
}

export function addQualityTestRow(test = {}) {
  const container = document.getElementById('supp-quality-tests');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', qualityTestRowHtml(container.children.length, test, -1));
  const input = container.lastElementChild?.querySelector('.supp-quality-analyte');
  if (input instanceof HTMLElement) input.focus();
}

/** @param {Element} button */
export function removeQualityTestRow(button) {
  button.closest('.supp-quality-row')?.remove();
}

export function collectInactiveIngredients() {
  const names = [...new Set(getFieldValue('supp-inactive-ingredients').split(/\n+/u).map(name => name.trim()).filter(Boolean))];
  return names.length ? names : undefined;
}

function qualityStatus(resultText, priorStatus = '') {
  const normalized = resultText.trim().toLowerCase().replace(/[.\s-]+/gu, '');
  if (['nd', 'notdetected'].includes(normalized)) return 'not-detected';
  if (['nq', 'notquantified', 'notquantifiable'].includes(normalized)) return 'not-quantified';
  if (['neg', 'negative'].includes(normalized)) return 'negative';
  if (['pass', 'passed', 'compliant'].includes(normalized)) return 'pass';
  if (['fail', 'failed', 'noncompliant'].includes(normalized)) return 'fail';
  return priorStatus && priorStatus !== 'unknown' ? priorStatus : resultText ? 'reported' : 'unknown';
}

/** @param {{ draft: any, issues: string[] } | null} [pendingImport] */
export function collectQualityTests(pendingImport = null) {
  const tests = [];
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

export function suppFormHtml(editIdx, supplement, importReviewHtml = '') {
  const editing = !!supplement;
  const ingredients = editing && supplement.ingredients ? supplement.ingredients : [];
  const inactiveIngredients = editing && Array.isArray(supplement.inactiveIngredients) ? supplement.inactiveIngredients : [];
  const qualityTests = editing && Array.isArray(supplement.qualityTests)
    ? supplement.qualityTests.map(test => ({ ...test, includeInAIContext: isSupplementQualityIncludedInAI(test, supplement) })) : [];
  const periods = editing ? getSupplementPeriods(supplement) : [{ start: localDateKey(), end: null }];
  const schedule = editing && supplement.schedule && typeof supplement.schedule === 'object'
    ? supplement.schedule : { mode: editing && Number(supplement.timesPerDay) > 1 ? 'multiple' : 'daily' };
  const status = editing ? getSupplementStatus(supplement) : 'planned';
  return `<div class="supp-form" id="supp-form-panel" data-edit-index="${editIdx}">
    <div class="supp-form-row supp-url-row"><div class="supp-form-field"><label>Import product facts <span class="supp-label-hint">Review required before anything is applied</span></label>
      <div class="supp-url-input-row"><input type="url" id="supp-url" aria-label="Product URL" placeholder="https://..." autocomplete="off" value="${escapeHTML(editing ? supplement.sourceUrl || supplement.importProvenance?.url || '' : '')}"><button type="button" class="supp-url-fetch" ${suppActionAttrs('fetch-url')}>Review link</button>${hasAssistantFeatureProvider() && assistantFeatureSupports('image') ? `<button type="button" class="supp-url-fetch supp-scan-label" ${suppActionAttrs('scan-label')}>Review photos</button><input type="file" id="supp-label-input" accept="image/*" capture="environment" multiple hidden>` : ''}</div>
      <div class="supp-form-help">Use front label + Facts/Drug Facts + directions (up to 4 photos). Images are processed for extraction and are not saved. Patient and prescription identifiers are ignored.</div><div id="supp-import-progress" class="supp-import-progress" aria-live="polite" hidden></div>
    </div></div><div id="supp-import-review-area">${importReviewHtml}</div>
    <p class="supp-form-help">* Required. Everything else is optional.</p><div class="supp-form-row">
      <div class="supp-form-field"><label for="supp-name">Name *</label><input type="text" id="supp-name" required placeholder="e.g. Creatine, Metformin" value="${editing ? escapeHTML(supplement.name) : ''}"></div>
      <div class="supp-form-field"><label for="supp-type">Type</label><select id="supp-type"><option value="supplement"${editing && supplement.type === 'medication' ? '' : ' selected'}>Supplement</option><option value="medication"${editing && supplement.type === 'medication' ? ' selected' : ''}>Medication</option></select></div>
    </div>
    <div class="supp-form-section-title">Active ingredients <span class="supp-label-hint">amount per serving</span></div><div class="supp-form-row">      <div class="supp-form-field supp-form-field-compact"><label for="supp-serving-value">Label serving size</label><input type="number" id="supp-serving-value" min="0" step="any" placeholder="1" value="${editing && supplement.servingSize?.value != null ? escapeHTML(String(supplement.servingSize.value)) : ''}"></div>
      <div class="supp-form-field"><label for="supp-serving-unit">Label serving unit</label><input type="text" id="supp-serving-unit" list="supp-serving-unit-options" placeholder="capsule" value="${editing ? escapeHTML(supplement.servingSize?.unit || '') : ''}"><datalist id="supp-serving-unit-options"><option value="capsule"><option value="tablet"><option value="mL"><option value="drop"><option value="scoop"><option value="spray"><option value="patch"></datalist></div>
      <div class="supp-form-field supp-form-field-compact"><label for="supp-times">Servings/day</label><input type="number" id="supp-times" placeholder="1" min="0" max="99" step="0.5" value="${editing && (supplement.timesPerDay ?? schedule.timesPerDay) != null ? escapeHTML(String(supplement.timesPerDay ?? schedule.timesPerDay)) : ''}"></div>
</div><p class="supp-form-help">Label serving size describes the product. Servings/day changes calculated daily totals; a recorded period dose takes priority.</p><div class="supp-form-row"><div class="supp-form-field"><label>Ingredients</label><div id="supp-ingredients">${ingredients.map((ingredient, index) => ingredientRowHtml(index, ingredient.name, ingredient.amount, ingredient.timesPerDay, editing && supplement.timesPerDay ? supplement.timesPerDay : '', ingredient)).join('')}</div><div class="supp-ingredient-actions"><button class="supp-ingredient-add" ${suppActionAttrs('add-ingredient')}>+ Add</button></div></div></div>
    <div class="supp-form-row"><div class="supp-form-field supp-form-field-wide"><label>Dose history <span class="supp-label-hint">start date * required; blank end = ongoing</span></label><div class="supp-period-column-labels"><span>Start *</span><span>End</span><span>Dose / strength during period</span></div><p class="supp-form-help">Leave dose blank to use ingredient amounts. Editing a saved dose corrects those dates; “New dose from today” keeps earlier doses.</p><div id="supp-periods">${periods.map((period, index) => periodRowHtml(index, period, periods.length > 1, index)).join('')}</div><div class="supp-period-actions">${editing && status === 'active' ? `<button type="button" class="supp-period-add" ${suppActionAttrs('change-dose', `data-supp-index="${editIdx}"`)}>New dose from today</button>` : ''}<button class="supp-period-add" ${suppActionAttrs('add-period')}>Add past / planned period</button></div></div></div>
    <div class="supp-form-section-title">Your regimen <span class="supp-label-hint">optional</span></div><div class="supp-form-row">
      <div class="supp-form-field supp-form-field-wide"><label for="supp-dosage">Personal directions</label><input type="text" id="supp-dosage" placeholder="e.g. with food, before bed" value="${editing ? escapeHTML(supplement.dosage || '') : ''}"></div>
      <div class="supp-form-field"><label for="supp-schedule-mode">Schedule</label><select id="supp-schedule-mode">${[['daily','Daily'],['multiple','Multiple times daily'],['selected-days','Selected weekdays'],['interval','Every N days'],['prn','As needed (PRN)'],['course','Finite course'],['cycle','Cycle on/off'],['phased','Phased / taper'],['other','Other']].map(([value, label]) => `<option value="${value}"${schedule.mode === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="supp-form-field"><label for="supp-route">Route</label><select id="supp-route">${['','oral','sublingual','topical','transdermal','inhaled','nasal','injection','ophthalmic','otic','rectal','vaginal','other'].map(route => `<option value="${route}"${(supplement?.route || '') === route ? ' selected' : ''}>${route ? route.charAt(0).toUpperCase() + route.slice(1) : 'Not specified'}</option>`).join('')}</select></div>
      <div class="supp-form-field supp-form-field-compact"><label for="supp-max-per-day">PRN max/day</label><input type="number" id="supp-max-per-day" min="0" max="99" step="0.5" value="${schedule.maxPerDay != null ? escapeHTML(String(schedule.maxPerDay)) : ''}"></div>
    </div><div class="supp-form-row"><div class="supp-form-field"><label for="supp-schedule-details">Schedule details</label><input type="text" id="supp-schedule-details" placeholder="Mon/Wed/Fri, every 3 days, 5 days on / 2 off…" value="${escapeHTML(schedule.details || (schedule.mode === 'selected-days' ? (schedule.daysOfWeek || []).map(day => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day] || day).join('/') : schedule.mode === 'interval' && schedule.intervalDays ? `every ${schedule.intervalDays} days` : ''))}"></div></div>
    <div class="supp-form-section-title">Product details <span class="supp-label-hint">optional</span></div><div class="supp-form-row">
      <div class="supp-form-field"><label for="supp-brand">Brand <span class="supp-label-hint">optional</span></label><input type="text" id="supp-brand" value="${editing ? escapeHTML(supplement.brand || '') : ''}"></div>
      <div class="supp-form-field"><label for="supp-generic-name">Generic / active name <span class="supp-label-hint">optional</span></label><input type="text" id="supp-generic-name" value="${editing ? escapeHTML(supplement.genericName || '') : ''}"></div>
      <div class="supp-form-field"><label for="supp-dosage-form">Form</label><input type="text" id="supp-dosage-form" placeholder="capsule, tablet, liquid…" value="${editing ? escapeHTML(supplement.dosageForm || '') : ''}"></div>
    </div>
    <div class="supp-form-section-title">Product label <span class="supp-label-hint">optional</span></div><div class="supp-form-row">
      <div class="supp-form-field supp-form-field-wide"><label for="supp-label-directions">Label directions <span class="supp-label-hint">product fact, not your regimen</span></label><input type="text" id="supp-label-directions" placeholder="Directions printed on the label" value="${editing ? escapeHTML(supplement.labelDirections || '') : ''}"></div>
    </div>
    <div class="supp-form-section-title">Other label ingredients <span class="supp-label-hint">excipients, fillers, capsule material — one per line</span></div><div class="supp-form-row"><div class="supp-form-field supp-form-field-wide"><textarea id="supp-inactive-ingredients" aria-label="Other label ingredients" rows="2" placeholder="Microcrystalline cellulose&#10;Vegetable capsule">${escapeHTML(inactiveIngredients.join('\n'))}</textarea></div></div>
    <div class="supp-form-section-title">Laboratory & quality results <span class="supp-label-hint">COA, potency, heavy metals, microbiology — not active ingredients</span></div><div class="supp-form-row"><div class="supp-form-field supp-form-field-wide">
      <div class="supp-form-row supp-quality-scope-row"><div class="supp-form-field"><label for="supp-quality-evidence-scope">Report relationship to your bottle</label><select id="supp-quality-evidence-scope">${[['unknown','Not verified / unknown'],['matching-lot','I confirmed the same lot'],['different-lot','Different lot'],['general-specification','General specification, not a bottle result']].map(([value, label]) => `<option value="${value}"${(!editing && value === 'unknown') || (supplement?.qualityEvidenceScope || 'unknown') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div></div>
      <div class="supp-quality-column-labels"><span>Category</span><span>Analyte</span><span>Result</span><span>Unit</span><span>Basis</span><span>AI</span></div><div id="supp-quality-tests">${qualityTests.map((test, index) => qualityTestRowHtml(index, test, index)).join('')}</div><div class="supp-ingredient-actions"><button type="button" class="supp-ingredient-add" ${suppActionAttrs('add-quality-test')}>+ Add laboratory result</button></div><div class="supp-form-help">Results are source-reported and may be lot-specific. The AI checkbox controls context without deleting the result. Matching potency checks are informational and default off for AI; active ingredient doses remain the primary health context. ND/NQ and concentrations are not treated as intake amounts.</div>
    </div></div>
    <div class="supp-form-section-title">Clinical context <span class="supp-label-hint">optional</span></div><div class="supp-form-row">
      <div class="supp-form-field"><label for="supp-reason">Reason / indication</label><input type="text" id="supp-reason" placeholder="e.g. low vitamin D" value="${editing ? escapeHTML(supplement.reason || '') : ''}"></div><div class="supp-form-field"><label for="supp-prescriber">Prescriber / clinician</label><input type="text" id="supp-prescriber" value="${editing ? escapeHTML(supplement.prescriber || '') : ''}"></div><div class="supp-form-field"><label for="supp-end-reason">End / pause reason</label><input type="text" id="supp-end-reason" placeholder="completed, side effects, cycling…" value="${editing ? escapeHTML(supplement.lifecycle?.reason || '') : ''}"></div><div class="supp-form-field"><label for="supp-note">Notes</label><input type="text" id="supp-note" placeholder="Anything else relevant" value="${editing ? escapeHTML(supplement.note || '') : ''}"></div>
    </div><div class="note-editor-actions"><button class="import-btn import-btn-primary" ${suppActionAttrs('save', `data-supp-index="${editIdx}"`)}>${editing ? 'Save changes' : 'Add supplement'}</button>${editing && status === 'active' ? `<button type="button" class="import-btn import-btn-secondary" ${suppActionAttrs('pause', `data-supp-index="${editIdx}"`)}>Pause</button><button type="button" class="import-btn import-btn-secondary" ${suppActionAttrs('end', `data-supp-index="${editIdx}"`)}>Stop taking</button>` : ''}${editing && ['paused', 'ended'].includes(status) ? `<button type="button" class="import-btn import-btn-secondary" ${suppActionAttrs('restart', `data-supp-index="${editIdx}"`)}>Restart</button>` : ''}${editing ? `<button class="import-btn import-btn-secondary" style="color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)" ${suppActionAttrs('delete', `data-supp-index="${editIdx}"`)}>Delete record</button>` : ''}<button class="import-btn import-btn-secondary" ${editing ? suppActionAttrs('toggle-accordion', `data-supp-index="${editIdx}"`) : suppActionAttrs('toggle-add-form')}>Cancel</button></div>
  </div>`;
}
