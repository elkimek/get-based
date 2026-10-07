import { openLifestyleForm, saveLifestyleForm, configureLifestyleFormView } from './context-lifestyle-form-view.js';
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// context-card-lifestyle-editors-impl.js - lazy lifestyle context card editor implementation

import { state } from './state.js';
import {
  DIET_TYPES,
  DIET_RESTRICTIONS,
  DIET_PATTERNS,
  DIET_PROTEIN_INTAKE,
  DIET_HYDRATION,
  DIET_ALCOHOL,
  DIET_CAFFEINE,
  DIET_CAFFEINE_TIMING,
  DIET_RECENT_CHANGES,
  BOWEL_FREQUENCY,
  STOOL_CONSISTENCY,
  BLOATING_SEVERITY,
  GAS_SEVERITY,
  ACID_REFLUX,
  BURPING,
  NAUSEA,
  APPETITE,
  ABDOMINAL_PAIN,
  FOOD_SENSITIVITIES,
  ENV_SETTING,
  ENV_CLIMATE,
  ENV_ALTITUDE,
  ENV_INHALED_EXPOSURES,
  ENV_OCCUPATIONAL_EXPOSURES,
  ENV_WATER,
  ENV_WATER_CONCERNS,
  ENV_EMF,
  ENV_EMF_MITIGATION,
  ENV_HOME_LIGHT,
  ENV_AIR,
  ENV_TOXINS,
  ENV_BUILDING,
} from './constants.js';
import { escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { formatTime, getTimeFormat, parseTimeInput } from './theme.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { reopenSunSetup } from './sun-defaults.js';
import {
  doesNutritionContextOverrideTypicalMeals,
  getEMFAssessments,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
import {
  contextEditorActions,
  getTextInput,
  getInputValue,
  summarizeSection,
  lifestyleActionAttrs,
  getSelectedOption,
  getSelectedTags,
  isContextEditorStylesheetLoaded, runWithContextEditorStylesheet,
  renderContextEditorModal,
  renderContextEditorSection,
  renderNoteField,
  renderSelectField,
  renderTagsField,
  selectCtxOption,
} from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalRuntime,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
  openLightSetupFromLifestyleRuntime,
  returnToLifestyleContextModalRuntime,
} from './context-card-lifestyle-runtime.js';
import {
  addHealthGoal,
  clearHealthGoals,
  clearInterpretiveLens,
  clearLightCircadian,
  closeHealthGoals,
  configureLifestyleSpecialEditors,
  deleteHealthGoal,
  openHealthGoalsEditor,
  openInterpretiveLensEditor,
  openLightCircadianEditor,
  renderHealthGoalsModal,
  saveInterpretiveLens,
  saveLightCircadian,
  showDietContaminantsModal,
} from './context-card-lifestyle-special-editors.js';

let recordContextChange: (field: string) => void = () => {};

let saveContextAndRefresh: (msg: string, field?: string) => void = (msg, field) => {
  if (field) recordContextChange(field);
  saveImportedData();
  showNotification(msg, 'success');
};


export function configureLifestyleContextEditors({ recordChange, saveAndRefresh, afterCommit }: LifestyleEditorDependencies = {}) {
  configureLifestyleFormView(afterCommit);
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
  configureLifestyleSpecialEditors({ recordChange, saveAndRefresh });
}


function withLegacySelection(options: Array<string | {value: string, label: string}>, current: string | null | undefined) {
  if (!current || options.some(option => (typeof option === 'string' ? option : option.value) === current)) return options;
  return [...options, { value: current, label: `Previous estimate: ${current}` }];
}

function hydrationIntakeOptions() {
  const usLabels = ({
    '<1.5 L/day': '<51 fl oz/day',
    '1.5–2 L/day': '51–68 fl oz/day',
    '2–3 L/day': '68–101 fl oz/day',
    '>3 L/day': '>101 fl oz/day',
    'varies / not sure': 'varies / not sure',
  } as Record<string, string>);
  return DIET_HYDRATION.map(value => ({
    value,
    label: state.unitSystem === 'US' ? usLabels[value]! : value,
  }));
}


async function confirmClearProfileContext(label: string, clearAction: () => unknown) {
  const confirmed = await showConfirmDialog(
    `Clear all saved ${label.toLowerCase()} information? This cannot be undone.`,
    {
      confirmLabel: 'Clear',
      ariaLabel: `Clear ${label}`,
    },
  );
  if (confirmed) clearAction();
  return confirmed;
}

function closestLifestyleElement(target: EventTarget | null, selector: string) {
  const el = target instanceof Element ? target.closest(selector) : null;
  if (!(el instanceof HTMLElement)) return null;
  if (el.closest('#detail-modal')) return el;
  return el.dataset.lifestyleAction === 'show-diet-contaminants' ? el : null;
}

function getLifestyleIndex(el: HTMLElement) {
  const idx = Number.parseInt(el.dataset.lifestyleIndex || '', 10);
  return Number.isInteger(idx) ? idx : -1;
}

function openLightSetupFromContext() {
  openLightSetupFromLifestyleRuntime(reopenSunSetup);
}

function discussDietContaminants() {
  discussDietContaminantsRuntime();
}

function returnToContextModal() {
  returnToLifestyleContextModalRuntime();
}

function useHealthGoalStarter(text: string) {
  const input = getTextInput('goal-text-input');
  if (!input) return;
  input.value = text;
  input.focus();
}

 const lifestyleEditorActions: Record<string, () => void> = {
  'save-diet': saveDiet,
  'clear-diet': () => { void confirmClearProfileContext('Diet & Digestion', clearDiet); },
  'save-sleep-rest': saveSleepRest,
  'clear-sleep-rest': () => { void confirmClearProfileContext('Sleep & Rest', clearSleepRest); },
  'save-light-circadian': saveLightCircadian,
  'clear-light-circadian': () => { void confirmClearProfileContext('Light & Circadian', clearLightCircadian); },
  'save-exercise': saveExercise,
  'clear-exercise': () => { void confirmClearProfileContext('Exercise', clearExercise); },
  'save-stress': saveStress,
  'clear-stress': () => { void confirmClearProfileContext('Stress', clearStress); },
  'save-love-life': saveLoveLife,
  'clear-love-life': () => { void confirmClearProfileContext('Love Life & Relationships', clearLoveLife); },
  'save-environment': saveEnvironment,
  'clear-environment': () => { void confirmClearProfileContext('Environment', clearEnvironment); },
};

function handleLifestyleContextClick(event: MouseEvent) {
  const actionEl = closestLifestyleElement(event.target, '[data-lifestyle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.lifestyleAction || '') {
    case 'show-diet-contaminants': event.preventDefault(); event.stopPropagation(); showDietContaminantsModal(); break;
    case 'open-light-setup': openLightSetupFromContext(); break;
    case 'delete-health-goal': { const idx = getLifestyleIndex(actionEl); if (idx >= 0) deleteHealthGoal(idx); break; }
    case 'suggest-health-goal': useHealthGoalStarter(actionEl.dataset.lifestyleValue || ''); break;
    case 'add-health-goal': addHealthGoal(); break;
    case 'select-goal-severity': selectCtxOption(actionEl, 'goal-severity-select'); break;
    case 'close-health-goals': closeHealthGoals(); break;
    case 'clear-health-goals': void confirmClearProfileContext('Health Goals', clearHealthGoals); break;
    case 'save-interpretive-lens': saveInterpretiveLens(); break;
    case 'clear-interpretive-lens': clearInterpretiveLens(); break;
    case 'back-to-context': returnToContextModal(); break;
    case 'discuss-diet-contaminants': discussDietContaminants(); break;
    case 'close-modal': closeLifestyleContextModalRuntime(); break;
    default: lifestyleEditorActions[actionEl.dataset.lifestyleAction || '']?.(); break;
  }
}


function handleLifestyleContextKeydown(event: KeyboardEvent) {
  const badge = closestLifestyleElement(event.target, '[data-lifestyle-action="show-diet-contaminants"]');
  if (badge && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    event.stopPropagation();
    showDietContaminantsModal();
    return;
  }
  const goalInput = closestLifestyleElement(event.target, '#goal-text-input');
  if (goalInput && event.key === 'Enter') { event.preventDefault(); addHealthGoal(); }
}

function initLifestyleContextDelegates() {
  if (typeof document === 'undefined') return;
  if (!markLifestyleContextDelegatesBoundRuntime()) return;
  document.addEventListener('click', handleLifestyleContextClick, true);
  document.addEventListener('keydown', handleLifestyleContextKeydown);
}

initLifestyleContextDelegates();

export function renderDietContaminantsBadge() {
  if (doesNutritionContextOverrideTypicalMeals()) return '';
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return '';
  const flagged = warnings.filter(w => w.type !== 'clean').length;
  if (flagged === 0) return '';
  return `<div class="diet-contaminants" role="button" tabindex="0" ${lifestyleActionAttrs('show-diet-contaminants')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg><span>${flagged} food contaminant signal${flagged > 1 ? 's' : ''} detected</span></div>`;
}

function getTimePlaceholder() {
  return getTimeFormat() === '24h' ? 'HH:MM' : 'H:MM AM';
}

// ═══════════════════════════════════════════════
// DIET
// ═══════════════════════════════════════════════

export function openDietEditor(): void | Promise<unknown> { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openDietEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");

  const current: import('../types/profile-context-data.js').DietContext = state.importedData.diet || { type: null, restrictions: [], pattern: null, proteinIntake: null, hydration: null, alcohol: null, caffeine: null, caffeineTiming: null, recentChanges: [], breakfast: '', lunch: '', dinner: '', snacks: '', note: '', bowelFrequency: null, stoolConsistency: null, bloating: null, gas: null, acidReflux: null, burping: null, nausea: null, appetite: null, abdominalPain: null, foodSensitivities: [] };
  const detailedNutritionOverridesMeals = doesNutritionContextOverrideTypicalMeals();
  const typicalMealDisabledAttrs = detailedNutritionOverridesMeals
    ? ' disabled aria-describedby="diet-meal-precedence"'
    : '';
  renderContextEditorModal(modal, 'Diet & Digestion', 'Your usual eating pattern and digestive symptoms can help explain lab trends.', `
    ${renderSelectField('Diet type', 'diet-type', DIET_TYPES, current.type)}
    ${renderSelectField('Eating pattern', 'diet-pattern', DIET_PATTERNS, current.pattern)}
    ${renderSelectField('Protein intake (g/kg/day)', 'diet-protein', withLegacySelection(DIET_PROTEIN_INTAKE, current.proteinIntake), current.proteinIntake)}
    ${renderSelectField(`Daily fluid intake (${state.unitSystem === 'US' ? 'fl oz/day' : 'L/day'})`, 'diet-hydration', withLegacySelection(hydrationIntakeOptions(), current.hydration), current.hydration)}
    ${renderContextEditorSection('Intake and recent changes', summarizeSection([
      current.restrictions,
      current.alcohol && `alcohol: ${current.alcohol}`,
      current.caffeine && `caffeine: ${current.caffeine}`,
      current.recentChanges,
    ], 'Optional restrictions, alcohol, caffeine, and recent changes'), `
      ${renderTagsField('Restrictions', 'diet-restrictions', DIET_RESTRICTIONS, current.restrictions)}
      ${renderSelectField('Alcohol', 'diet-alcohol', DIET_ALCOHOL, current.alcohol)}
      ${renderSelectField('Caffeine', 'diet-caffeine', DIET_CAFFEINE, current.caffeine)}
      ${renderSelectField('Latest caffeine', 'diet-caffeine-timing', DIET_CAFFEINE_TIMING, current.caffeineTiming)}
      ${renderTagsField('Changes in the past 3 months', 'diet-recent-changes', DIET_RECENT_CHANGES, current.recentChanges)}
    `)}
    ${renderContextEditorSection('Typical meals', detailedNutritionOverridesMeals ? 'Paused — detailed log active' : summarizeSection([
      current.breakfast && 'Breakfast',
      current.lunch && 'Lunch',
      current.dinner && 'Dinner',
      current.snacks && 'Snacks',
    ], 'Optional meal timing and examples'), `${detailedNutritionOverridesMeals ? '<div class="ctx-context-precedence" id="diet-meal-precedence" role="status"><strong>Detailed meal log has priority</strong><span>Saved examples stay here but are not sent to AI while Meals &amp; Nutrition context is active.</span><small>Logs may be partial; unlogged meals stay unknown.</small></div>' : ''}<div class="ctx-field-group${detailedNutritionOverridesMeals ? ' is-disabled' : ''}"><label class="ctx-field-label">Meals and times</label>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-breakfast-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.breakfastTime || ''))}"${typicalMealDisabledAttrs}><input class="ctx-note-input ctx-meal-input" id="diet-breakfast" placeholder="Breakfast — e.g. eggs, avocado, coffee" value="${escapeHTML(current.breakfast || '')}"${typicalMealDisabledAttrs}></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-lunch-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.lunchTime || ''))}"${typicalMealDisabledAttrs}><input class="ctx-note-input ctx-meal-input" id="diet-lunch" placeholder="Lunch — e.g. salad with grilled chicken" value="${escapeHTML(current.lunch || '')}"${typicalMealDisabledAttrs}></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-dinner-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.dinnerTime || ''))}"${typicalMealDisabledAttrs}><input class="ctx-note-input ctx-meal-input" id="diet-dinner" placeholder="Dinner — e.g. salmon, rice, vegetables" value="${escapeHTML(current.dinner || '')}"${typicalMealDisabledAttrs}></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-snacks-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.snacksTime || ''))}"${typicalMealDisabledAttrs}><input class="ctx-note-input ctx-meal-input" id="diet-snacks" placeholder="Snacks — e.g. nuts, fruit, dark chocolate" value="${escapeHTML(current.snacks || '')}"${typicalMealDisabledAttrs}></div>
    </div>`)}
    ${renderContextEditorSection('Digestion details', summarizeSection([
      current.bowelFrequency,
      current.stoolConsistency,
      current.bloating && current.bloating !== 'none' ? `${current.bloating} bloating` : '',
      current.gas && current.gas !== 'none' ? `${current.gas} gas` : '',
      current.foodSensitivities,
    ], 'Optional symptoms and sensitivities'), `
      ${renderSelectField('Bowel frequency', 'diet-bowel', BOWEL_FREQUENCY, current.bowelFrequency || null)}
      ${renderSelectField('Stool consistency', 'diet-stool', STOOL_CONSISTENCY, current.stoolConsistency || null)}
      ${renderSelectField('Bloating', 'diet-bloating', BLOATING_SEVERITY, current.bloating || null)}
      ${renderSelectField('Gas', 'diet-gas', GAS_SEVERITY, current.gas || null)}
      ${renderSelectField('Acid reflux', 'diet-reflux', ACID_REFLUX, current.acidReflux || null)}
      ${renderSelectField('Burping', 'diet-burping', BURPING, current.burping || null)}
      ${renderSelectField('Nausea', 'diet-nausea', NAUSEA, current.nausea || null)}
      ${renderSelectField('Appetite', 'diet-appetite', APPETITE, current.appetite || null)}
      ${renderSelectField('Abdominal pain', 'diet-abdpain', ABDOMINAL_PAIN, current.abdominalPain || null)}
      ${renderTagsField('Food sensitivities', 'diet-sensitivities', FOOD_SENSITIVITIES, current.foodSensitivities || [])}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.diet != null, lifestyleActionAttrs('save-diet'), lifestyleActionAttrs('clear-diet'))}`);
  openModalOverlay(overlay);
}

export function saveDiet() {
  const type = getSelectedOption('diet-type');
  const pattern = getSelectedOption('diet-pattern');
  const proteinIntake = getSelectedOption('diet-protein');
  const hydration = getSelectedOption('diet-hydration');
  const restrictions = getSelectedTags('diet-restrictions');
  const alcohol = getSelectedOption('diet-alcohol');
  const caffeine = getSelectedOption('diet-caffeine');
  const caffeineTiming = getSelectedOption('diet-caffeine-timing');
  const recentChanges = getSelectedTags('diet-recent-changes');
  const breakfast = getInputValue('diet-breakfast');
  const breakfastTime = parseTimeInput(getInputValue('diet-breakfast-time'));
  const lunch = getInputValue('diet-lunch');
  const lunchTime = parseTimeInput(getInputValue('diet-lunch-time'));
  const dinner = getInputValue('diet-dinner');
  const dinnerTime = parseTimeInput(getInputValue('diet-dinner-time'));
  const snacks = getInputValue('diet-snacks');
  const snacksTime = parseTimeInput(getInputValue('diet-snacks-time'));
  const bowelFrequency = getSelectedOption('diet-bowel');
  const stoolConsistency = getSelectedOption('diet-stool');
  const bloating = getSelectedOption('diet-bloating');
  const gas = getSelectedOption('diet-gas');
  const acidReflux = getSelectedOption('diet-reflux');
  const burping = getSelectedOption('diet-burping');
  const nausea = getSelectedOption('diet-nausea');
  const appetite = getSelectedOption('diet-appetite');
  const abdominalPain = getSelectedOption('diet-abdpain');
  const foodSensitivities = getSelectedTags('diet-sensitivities');
  const note = getInputValue('ctx-note-input');
  if (!type && !pattern && !proteinIntake && !hydration && restrictions.length === 0 && !alcohol && !caffeine && !caffeineTiming && recentChanges.length === 0 && !breakfast.trim() && !lunch.trim() && !dinner.trim() && !snacks.trim() && !bowelFrequency && !stoolConsistency && !bloating && !gas && !acidReflux && !burping && !nausea && !appetite && !abdominalPain && foodSensitivities.length === 0 && !note.trim()) {
    state.importedData.diet = null;
  } else {
    state.importedData.diet = { type, restrictions, pattern, proteinIntake, hydration, alcohol, caffeine, caffeineTiming, recentChanges, breakfast: breakfast.trim(), breakfastTime, lunch: lunch.trim(), lunchTime, dinner: dinner.trim(), dinnerTime, snacks: snacks.trim(), snacksTime, bowelFrequency, stoolConsistency, bloating, gas, acidReflux, burping, nausea, appetite, abdominalPain, foodSensitivities, note: note.trim() };
  }
  saveContextAndRefresh('Diet & Digestion saved', 'diet');
}

export function clearDiet() {
  state.importedData.diet = null;
  saveContextAndRefresh('Diet & Digestion cleared', 'diet');
}

// ═══════════════════════════════════════════════
// SLEEP & REST
// ═══════════════════════════════════════════════

export function openSleepRestEditor() { return openLifestyleForm('sleepRest'); }
export function saveSleepRest() { return saveLifestyleForm('sleepRest'); }
export function clearSleepRest() { return saveLifestyleForm('sleepRest', true); }

// ═══════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════

export function openExerciseEditor() { return openLifestyleForm('exercise'); }
export function saveExercise() { return saveLifestyleForm('exercise'); }
export function clearExercise() { return saveLifestyleForm('exercise', true); }

// ═══════════════════════════════════════════════
// STRESS
// ═══════════════════════════════════════════════

export function openStressEditor() { return openLifestyleForm('stress'); }
export function saveStress() { return saveLifestyleForm('stress'); }
export function clearStress() { return saveLifestyleForm('stress', true); }

// ═══════════════════════════════════════════════
// LOVE LIFE
// ═══════════════════════════════════════════════

export function openLoveLifeEditor() { return openLifestyleForm('loveLife'); }
export function saveLoveLife() { return saveLifestyleForm('loveLife'); }
export function clearLoveLife() { return saveLifestyleForm('loveLife', true); }

// ═══════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════

export function openEnvironmentEditor(): void | Promise<unknown> { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openEnvironmentEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.environment || { setting: null, climate: null, altitude: null, inhaledExposures: [], occupationalExposures: [], water: null, waterConcerns: [], emf: [], emfMitigation: [], homeLight: null, air: [], toxins: [], building: null, note: '' };
  const hasEMFAssessment = getEMFAssessments().length > 0;
  renderContextEditorModal(modal, 'Environment & Exposures', 'Your location, air, water, work, and home environment can add context to health and lab patterns.', `
    ${renderSelectField('Living setting', 'env-setting', ENV_SETTING, current.setting)}
    ${renderSelectField('Climate', 'env-climate', ENV_CLIMATE, current.climate)}
    ${renderSelectField('Altitude exposure', 'env-altitude', ENV_ALTITUDE, current.altitude)}
    ${renderTagsField('Smoking and inhaled exposure', 'env-inhaled', ENV_INHALED_EXPOSURES, current.inhaledExposures)}
    ${renderContextEditorSection('Work and hobby exposures', summarizeSection([
      current.occupationalExposures,
    ], 'Optional dusts, fumes, chemicals, metals, and radiation'), `
      ${renderTagsField('Known exposures', 'env-occupational', ENV_OCCUPATIONAL_EXPOSURES, current.occupationalExposures)}
    `)}
    ${renderContextEditorSection('Water', summarizeSection([
      current.water,
      current.waterConcerns,
    ], 'Optional source and concerns'), `
      ${renderSelectField('Primary water source', 'env-water', ENV_WATER, current.water)}
      ${renderTagsField('Water concerns', 'env-water-concerns', ENV_WATER_CONCERNS, current.waterConcerns)}
    `)}
    ${renderContextEditorSection('EMF', summarizeSection([
      hasEMFAssessment ? `${getEMFAssessments().length} saved assessment${getEMFAssessments().length === 1 ? '' : 's'}` : '',
      current.emf,
      current.emfMitigation,
    ], 'Optional exposure assessment'), `
      <div class="ctx-field-group">${renderEMFAssessmentLauncher({ inModal: true, surface: 'environment-editor' })}</div>
      ${hasEMFAssessment ? '' : `${renderTagsField('EMF exposure', 'env-emf', ENV_EMF, current.emf)}
      ${renderTagsField('EMF mitigation', 'env-emf-mit', ENV_EMF_MITIGATION, current.emfMitigation)}`}
    `)}
    ${renderContextEditorSection('Home and exposures', summarizeSection([
      current.homeLight,
      current.air,
      current.toxins,
      current.building,
    ], 'Optional lighting, air, toxins, and building'), `
      ${renderSelectField('Home/work lighting', 'env-light', ENV_HOME_LIGHT, current.homeLight)}
      ${renderTagsField('Air quality', 'env-air', ENV_AIR, current.air)}
      ${renderTagsField('Toxin exposure', 'env-toxins', ENV_TOXINS, current.toxins)}
      ${renderSelectField('Building', 'env-building', ENV_BUILDING, current.building)}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.environment != null, lifestyleActionAttrs('save-environment'), lifestyleActionAttrs('clear-environment'))}`);
  openModalOverlay(overlay);
}

export function saveEnvironment() {
  const setting = getSelectedOption('env-setting');
  const climate = getSelectedOption('env-climate');
  const altitude = getSelectedOption('env-altitude');
  const inhaledExposures = getSelectedTags('env-inhaled');
  const occupationalExposures = getSelectedTags('env-occupational');
  const water = getSelectedOption('env-water');
  const waterConcerns = getSelectedTags('env-water-concerns');
  const hasEMFAssessment = state.importedData.emfAssessment?.assessments?.length > 0;
  const emf = hasEMFAssessment ? (state.importedData.environment?.emf || []) : getSelectedTags('env-emf');
  const emfMitigation = hasEMFAssessment ? (state.importedData.environment?.emfMitigation || []) : getSelectedTags('env-emf-mit');
  const homeLight = getSelectedOption('env-light');
  const air = getSelectedTags('env-air');
  const toxins = getSelectedTags('env-toxins');
  const building = getSelectedOption('env-building');
  const note = getInputValue('ctx-note-input');
  if (!setting && !climate && !altitude && inhaledExposures.length === 0 && occupationalExposures.length === 0 && !water && waterConcerns.length === 0 && emf.length === 0 && emfMitigation.length === 0 && !homeLight && air.length === 0 && toxins.length === 0 && !building && !note.trim()) {
    state.importedData.environment = null;
  } else {
    state.importedData.environment = { setting, climate, altitude, inhaledExposures, occupationalExposures, water, waterConcerns, emf, emfMitigation, homeLight, air, toxins, building, note: note.trim() };
  }
  saveContextAndRefresh('Environment saved', 'environment');
}

export function clearEnvironment() {
  state.importedData.environment = null;
  saveContextAndRefresh('Environment cleared', 'environment');
}

export {
  addHealthGoal,
  clearHealthGoals,
  clearInterpretiveLens,
  clearLightCircadian,
  closeHealthGoals,
  deleteHealthGoal,
  openHealthGoalsEditor,
  openInterpretiveLensEditor,
  openLightCircadianEditor,
  renderHealthGoalsModal,
  saveInterpretiveLens,
  saveLightCircadian,
  showDietContaminantsModal,
};
