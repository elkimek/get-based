// @ts-check
// nutrition-entry-forms.js — targets and first-class drink entry controller.

import { saveImportedData } from './data.js';
import { getErrorMessage } from './caught-error.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { ensureNutritionStylesheet, renderMealDetail } from './nutrition-render.js';
import { getActiveProfileMeal, saveActiveProfileMeal } from './nutrition-store.js';
import { normalizeNutritionTargets, resolveNutritionTargets } from './nutrition-targets.js';
import { state } from './state.js';
import { showNotification } from './utils.js';

let entryDeps = { refreshWidget: () => {}, closeEditor: () => {}, resetEditorState: () => {} };

export function configureNutritionEntryForms(deps = {}) {
  entryDeps = { ...entryDeps, ...deps };
}

export async function openMealDetail(id) {
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay || !id) return false;
  try {
    const meal = await getActiveProfileMeal(id);
    if (!meal) throw new Error('That meal is no longer available on this device.');
    entryDeps.resetEditorState();
    modal.innerHTML = renderMealDetail(meal);
    modal.scrollTop = 0;
    modal.classList.add('nutrition-modal');
    overlay.removeAttribute('data-modal-dismiss-protected');
    openModalOverlay(overlay, { initialFocus: '[data-nutrition-action="back"]', focusDelay: 30 });
    return true;
  } catch (error) {
    showNotification(getErrorMessage(error, 'This stored meal could not be read.'), 'error');
    return false;
  }
}

function selectedResponseLevel(name) {
  const value = Number(/** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="${name}"]:checked`))?.value);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}

export async function saveMealResponse(id) {
  const satiety2h = selectedResponseLevel('nutrition-response-satiety');
  const energy2h = selectedResponseLevel('nutrition-response-energy');
  if (satiety2h === null && energy2h === null) {
    showNotification('Choose hunger, energy, or both before saving the check-in.', 'info');
    /** @type {HTMLElement | null} */ (document.querySelector('input[name="nutrition-response-satiety"]'))?.focus();
    return;
  }
  try {
    const meal = await getActiveProfileMeal(id);
    if (!meal) throw new Error('That meal is no longer available.');
    const saved = await saveActiveProfileMeal({
      ...meal,
      responseCheckIn: {
        ...(satiety2h === null ? {} : { satiety2h }),
        ...(energy2h === null ? {} : { energy2h }),
        recordedAt: new Date().toISOString(),
      },
    });
    entryDeps.refreshWidget();
    await openMealDetail(saved.id);
    showNotification('After-meal check-in saved and queued for sync.', 'success');
  } catch (error) {
    showNotification(getErrorMessage(error, 'The after-meal check-in could not be saved.'), 'error');
  }
}

export async function clearMealResponse(id) {
  try {
    const meal = await getActiveProfileMeal(id);
    if (!meal) throw new Error('That meal is no longer available.');
    const { responseCheckIn: _removed, ...withoutResponse } = meal;
    const saved = await saveActiveProfileMeal(withoutResponse);
    entryDeps.refreshWidget();
    await openMealDetail(saved.id);
    showNotification('After-meal check-in cleared and queued for sync.', 'info');
  } catch (error) {
    showNotification(getErrorMessage(error, 'The after-meal check-in could not be cleared.'), 'error');
  }
}

function selectedFluidKind() {
  return /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="nutrition-fluid-kind"]:checked'))?.value || 'other';
}

export function updateFluidLogControls() {
  const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-fluid-amount'));
  if (!amountInput) return;
  const amount = Number(amountInput.value);
  const validAmount = Number.isFinite(amount) && amount > 0 && amount <= 10000;
  const kind = selectedFluidKind();
  const labels = { water: 'water', 'tea-coffee': 'tea or coffee', other: 'beverage' };
  const amountLabel = validAmount ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} mL` : 'Drink amount';
  const preview = document.getElementById('nutrition-fluid-preview');
  const previewTitle = preview?.querySelector('strong');
  const previewNote = preview?.querySelector('small');
  if (previewTitle) previewTitle.textContent = `${amountLabel}${validAmount ? ` ${labels[kind] || 'beverage'}` : ''}`;
  if (previewNote) previewNote.textContent = kind === 'water'
    ? 'Adds to logged drinks and plain water.'
    : 'Adds to logged drinks; the plain-water total stays unchanged.';
  document.querySelectorAll('[data-nutrition-action="set-fluid-amount"]').forEach(button => {
    const selected = validAmount && Number(button.getAttribute('data-nutrition-amount')) === amount;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const saveButton = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-nutrition-action="save-fluid"]'));
  if (saveButton) saveButton.textContent = validAmount ? `Log ${amountLabel}` : 'Log drink';
}

function targetInputValue(id, fallback) {
  const value = Number(/** @type {HTMLInputElement | null} */ (document.getElementById(id))?.value);
  return Number.isFinite(value) ? value : fallback;
}

function nutritionTargetsFromForm() {
  const current = normalizeNutritionTargets(state.importedData?.nutritionTargets || {});
  const widgetNutrients = Array.from(document.querySelectorAll('[data-nutrition-widget-metric]:checked'))
    .map(input => input instanceof HTMLInputElement ? input.value : '')
    .filter(Boolean);
  return normalizeNutritionTargets({
    configured: true,
    energyKcal: targetInputValue('nutrition-target-energy', current.energyKcal),
    proteinBasis: /** @type {HTMLSelectElement | null} */ (document.getElementById('nutrition-target-protein-basis'))?.value,
    proteinGPerKg: targetInputValue('nutrition-target-protein-factor', current.proteinGPerKg),
    proteinFixedG: targetInputValue('nutrition-target-protein-fixed', current.proteinFixedG),
    carbohydrateG: targetInputValue('nutrition-target-carbohydrate', current.carbohydrateG),
    fatG: targetInputValue('nutrition-target-fat', current.fatG),
    fiberG: targetInputValue('nutrition-target-fiber', current.fiberG),
    fluidMl: targetInputValue('nutrition-target-fluid', current.fluidMl),
    sugarG: targetInputValue('nutrition-target-sugar', current.sugarG),
    sodiumMg: targetInputValue('nutrition-target-sodium', current.sodiumMg),
    widgetNutrients,
  });
}

export function updateNutritionWidgetMetricControls() {
  const inputs = /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll('[data-nutrition-widget-metric]'))
    .filter(input => input instanceof HTMLInputElement));
  const selected = inputs.filter(input => input.checked);
  const count = document.getElementById('nutrition-widget-metric-count');
  if (count) count.textContent = `${selected.length} selected`;
}

function setNutritionTargetStatus(message, isError = false) {
  const status = document.getElementById('nutrition-target-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function validateNutritionTargetsForm() {
  const basis = /** @type {HTMLSelectElement | null} */ (document.getElementById('nutrition-target-protein-basis'))?.value || 'general';
  const fields = [
    ['nutrition-target-energy', 'Energy'],
    ['nutrition-target-carbohydrate', 'Carbohydrate'],
    ['nutrition-target-fat', 'Fat'],
    ['nutrition-target-fiber', 'Fiber'],
    ['nutrition-target-fluid', 'Logged drinks'],
    ['nutrition-target-sugar', 'Sugar'],
    ['nutrition-target-sodium', 'Sodium'],
    [basis === 'fixed' ? 'nutrition-target-protein-fixed' : 'nutrition-target-protein-factor', 'Protein'],
  ];
  document.querySelectorAll('#nutrition-target-settings input[aria-invalid="true"]')
    .forEach(input => input.removeAttribute('aria-invalid'));
  for (const [id, label] of fields) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    if (!input || input.disabled) continue;
    if (!input.value.trim() || !input.checkValidity()) {
      input.setAttribute('aria-invalid', 'true');
      const message = `Review ${label}; it is blank or outside the allowed range.`;
      setNutritionTargetStatus(message, true);
      showNotification(message, 'error');
      input.focus();
      input.reportValidity();
      return false;
    }
  }
  setNutritionTargetStatus('');
  return true;
}

export function updateNutritionTargetControls() {
  const basis = /** @type {HTMLSelectElement | null} */ (document.getElementById('nutrition-target-protein-basis'))?.value || 'general';
  const factors = { general: 0.83, active: 1.6, high: 2 };
  const factor = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-target-protein-factor'));
  const fixed = basis === 'fixed';
  const factorWrap = document.getElementById('nutrition-target-protein-factor-wrap');
  const fixedWrap = document.getElementById('nutrition-target-protein-fixed-wrap');
  if (factorWrap) factorWrap.hidden = fixed;
  if (fixedWrap) fixedWrap.hidden = !fixed;
  if (factor) {
    if (Object.hasOwn(factors, basis)) factor.value = String(factors[basis]);
    factor.disabled = Object.hasOwn(factors, basis);
  }
  const resolved = resolveNutritionTargets({ ...state.importedData, nutritionTargets: nutritionTargetsFromForm() });
  const preview = document.getElementById('nutrition-target-protein-preview');
  if (preview) {
    const source = resolved.proteinUsesWeight && resolved.weight
      ? `${resolved.proteinFactor} g/kg × ${resolved.weight.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg from ${resolved.weight.source}`
      : resolved.proteinBasis === 'fixed' ? 'fixed daily guide' : 'fallback until a weight measurement is available';
    preview.textContent = `Protein guide: ${resolved.proteinG.toLocaleString(undefined, { maximumFractionDigits: 1 })} g/day · ${source}`;
  }
}

export async function saveNutritionTargets() {
  if (!validateNutritionTargetsForm()) return;
  const hadPrevious = Object.hasOwn(state.importedData, 'nutritionTargets');
  const previous = state.importedData.nutritionTargets;
  state.importedData.nutritionTargets = nutritionTargetsFromForm();
  let saved = false;
  try {
    saved = await saveImportedData();
  } catch {
    saved = false;
  }
  if (!saved) {
    if (hadPrevious) state.importedData.nutritionTargets = previous;
    else delete state.importedData.nutritionTargets;
    const message = 'Nutrition setup could not be saved; your previous settings are unchanged.';
    setNutritionTargetStatus(message, true);
    showNotification(message, 'error');
    return;
  }
  entryDeps.refreshWidget();
  entryDeps.closeEditor();
  showNotification('Nutrition setup saved.', 'success');
}

export async function saveFluidLog() {
  const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-fluid-amount'));
  const amount = Number(amountInput?.value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    showNotification('Enter a drink amount between 1 and 10,000 mL.', 'error');
    amountInput?.focus();
    return;
  }
  const kind = selectedFluidKind();
  const localDate = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-fluid-at'))?.value || '';
  const eatenAt = new Date(localDate);
  if (!Number.isFinite(eatenAt.getTime())) {
    showNotification('Choose a valid drink date and time.', 'error');
    document.getElementById('nutrition-fluid-at')?.focus();
    return;
  }
  const customLabel = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-fluid-label'))?.value.trim() || '';
  const defaultLabels = { water: 'Water', 'tea-coffee': 'Tea or coffee', other: 'Beverage' };
  const name = customLabel || defaultLabels[kind] || 'Beverage';
  const value = Math.round(amount * 10) / 10;
  const [, timePart = '00:00'] = localDate.split('T');
  const [localHour, localMinute] = timePart.split(':').map(Number);
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  try {
    await saveActiveProfileMeal({
      name, mealType: 'drink', eatenAt: eatenAt.toISOString(), localDate: localDate.slice(0, 10),
      localTimeMinutes: Number.isFinite(localHour) && Number.isFinite(localMinute) ? localHour * 60 + localMinute : null,
      timezoneOffsetMinutes: eatenAt.getTimezoneOffset(), timeZone, note: '', analysisContext: '',
      nutrients: { fluidMl: value, ...(kind === 'water' ? { plainWaterMl: value } : {}) },
      components: [{ name, quantityG: null, confidence: 1, nutrients: {} }],
      assumptions: [], warnings: [], confidence: 1, images: [],
      source: { kind: kind === 'water' ? 'manual-water' : 'manual-beverage', recordedAt: new Date().toISOString(), nutrientBasis: 'user-entered' },
      reviewed: true,
    });
    entryDeps.refreshWidget();
    entryDeps.closeEditor();
    showNotification(`${name} logged.`, 'success');
  } catch (error) {
    showNotification(getErrorMessage(error, 'Drink could not be saved.'), 'error');
  }
}
