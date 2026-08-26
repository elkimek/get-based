// @ts-check
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
  EXERCISE_FREQ,
  EXERCISE_TYPES,
  EXERCISE_INTENSITY,
  DAILY_MOVEMENT,
  EXERCISE_DURATION,
  EXERCISE_MUSCLE_CONTEXT,
  EXERCISE_LIMITATIONS,
  SLEEP_DURATIONS,
  SLEEP_QUALITY,
  SLEEP_SCHEDULE,
  SLEEP_ROOM_TEMP,
  SLEEP_ISSUES,
  SLEEP_DAYTIME_SLEEPINESS,
  SLEEP_APNEA_STATUS,
  SLEEP_PAP_USE,
  SLEEP_NAPS,
  SLEEP_ENVIRONMENT,
  SLEEP_PRACTICES,
  STRESS_LEVELS,
  STRESS_SOURCES,
  STRESS_MGMT,
  STRESS_DURATION,
  STRESS_TREND,
  LOVE_STATUS,
  LOVE_SATISFACTION,
  LOVE_LIBIDO,
  LOVE_LIBIDO_CHANGE,
  LOVE_FREQUENCY,
  LOVE_ORGASM,
  LOVE_RELATIONSHIP,
  LOVE_CONCERNS,
  LOVE_REPRODUCTIVE_GOALS,
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
import { getSleepContextMismatch } from './lab-context-wearables.js';
import { doesNutritionContextOverrideTypicalMeals } from './nutrition-context.js';
import { reopenSunSetup } from './sun-defaults.js';
import {
  getEMFAssessments,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
import {
  contextEditorActions,
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
/** @type {(field: string) => void} */
let recordContextChange = () => {};
/** @type {(msg: string, field?: string) => void} */
let saveContextAndRefresh = (msg, field) => {
  if (field) recordContextChange(field);
  saveImportedData();
  showNotification(msg, 'success');
};

/**
 * @param {{ recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps]
 */
export function configureLifestyleContextEditors({ recordChange, saveAndRefresh } = {}) {
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
  configureLifestyleSpecialEditors({ recordChange, saveAndRefresh });
}

/**
 * @param {string} id
 * @returns {HTMLInputElement | HTMLTextAreaElement | null}
 */
function getTextInput(id) {
  return /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
}

/**
 * @param {string} id
 * @returns {string}
 */
function getInputValue(id) {
  return getTextInput(id)?.value || '';
}

function summarizeSection(values, fallback, limit = 3) {
  const answers = [];
  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const text = String(item || '').trim();
      if (text && !answers.includes(text)) answers.push(text);
    }
  }
  if (!answers.length) return fallback;
  const visible = answers.slice(0, limit);
  const remainder = answers.length - visible.length;
  return `${visible.join(' · ')}${remainder > 0 ? ` · +${remainder} more` : ''}`;
}

/** @param {Array<string | {value: string, label: string}>} options @param {string | null | undefined} current */
function withLegacySelection(options, current) {
  if (!current || options.some(option => (typeof option === 'string' ? option : option.value) === current)) return options;
  return [...options, { value: current, label: `Previous estimate: ${current}` }];
}

function hydrationIntakeOptions() {
  const usLabels = /** @type {Record<string, string>} */ ({
    '<1.5 L/day': '<51 fl oz/day',
    '1.5–2 L/day': '51–68 fl oz/day',
    '2–3 L/day': '68–101 fl oz/day',
    '>3 L/day': '>101 fl oz/day',
    'varies / not sure': 'varies / not sure',
  });
  return DIET_HYDRATION.map(value => ({
    value,
    label: state.unitSystem === 'US' ? usLabels[value] : value,
  }));
}

/** @param {any} current */
function renderSleepMismatch(current) {
  const mismatch = getSleepContextMismatch(current, state.importedData.wearableSummary);
  if (!mismatch) return '';
  return `<div class="ctx-data-mismatch" role="status"><strong>Profile and tracked sleep differ</strong><span>${escapeHTML(mismatch.reasons.join('. '))}.</span><small>Both are kept. Recent device data can differ from your usual experience or have incomplete coverage.</small></div>`;
}

async function confirmClearProfileContext(label, clearAction) {
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

function lifestyleActionAttrs(action, extra = '') { return `data-lifestyle-action="${action}"${extra ? ` ${extra}` : ''}`; }

function closestLifestyleElement(target, selector) {
  const el = target instanceof Element ? target.closest(selector) : null;
  if (!(el instanceof HTMLElement)) return null;
  if (el.closest('#detail-modal')) return el;
  return el.dataset.lifestyleAction === 'show-diet-contaminants' ? el : null;
}

function getLifestyleIndex(el) {
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

function useHealthGoalStarter(text) {
  const input = getTextInput('goal-text-input');
  if (!input) return;
  input.value = text;
  input.focus();
}

/** @type {Record<string, () => void>} */ const lifestyleEditorActions = {
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
/** @param {MouseEvent} event */
function handleLifestyleContextClick(event) {
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

/** @param {KeyboardEvent} event */
function handleLifestyleContextKeydown(event) {
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

export function openDietEditor() { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openDietEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.diet || { type: null, restrictions: [], pattern: null, proteinIntake: null, hydration: null, alcohol: null, caffeine: null, caffeineTiming: null, recentChanges: [], breakfast: '', lunch: '', dinner: '', snacks: '', note: '', bowelFrequency: null, stoolConsistency: null, bloating: null, gas: null, acidReflux: null, burping: null, nausea: null, appetite: null, abdominalPain: null, foodSensitivities: [] };
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

export function openSleepRestEditor() { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openSleepRestEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.sleepRest || { duration: null, quality: null, daytimeSleepiness: null, apneaStatus: null, papUse: null, naps: null, schedule: null, roomTemp: null, issues: [], environment: [], practices: [], note: '' };
  renderContextEditorModal(modal, 'Sleep & Rest', 'Sleep duration, quality, and routine add useful context to recovery and metabolic markers.', `
    ${renderSleepMismatch(current)}
    ${renderSelectField('Duration', 'sleep-duration', SLEEP_DURATIONS, current.duration)}
    ${renderSelectField('Quality', 'sleep-quality', SLEEP_QUALITY, current.quality)}
    ${renderTagsField('Sleep issues', 'sleep-issues', SLEEP_ISSUES, current.issues)}
    ${renderSelectField('Daytime sleepiness', 'sleep-daytime', SLEEP_DAYTIME_SLEEPINESS, current.daytimeSleepiness)}
    ${renderContextEditorSection('Sleep breathing and daytime rest', summarizeSection([
      current.apneaStatus && `apnea: ${current.apneaStatus}`,
      current.papUse,
      current.naps && `naps: ${current.naps}`,
    ], 'Optional apnea, treatment, and naps'), `
      ${renderSelectField('Sleep apnea status', 'sleep-apnea-status', SLEEP_APNEA_STATUS, current.apneaStatus)}
      ${renderSelectField('PAP / CPAP use', 'sleep-pap-use', SLEEP_PAP_USE, current.papUse)}
      ${renderSelectField('Naps', 'sleep-naps', SLEEP_NAPS, current.naps)}
    `)}
    ${renderContextEditorSection('Environment and routine', summarizeSection([
      current.schedule,
      current.roomTemp,
      current.environment,
      current.practices,
    ], 'Optional schedule, room, and sleep practices'), `
      ${renderSelectField('Schedule', 'sleep-schedule', SLEEP_SCHEDULE, current.schedule)}
      ${renderSelectField('Room temperature', 'sleep-temp', SLEEP_ROOM_TEMP, current.roomTemp)}
      ${renderTagsField('Sleep environment', 'sleep-env', SLEEP_ENVIRONMENT, current.environment)}
      ${renderTagsField('Sleep practices', 'sleep-practices', SLEEP_PRACTICES, current.practices)}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.sleepRest != null, lifestyleActionAttrs('save-sleep-rest'), lifestyleActionAttrs('clear-sleep-rest'))}`);
  openModalOverlay(overlay);
}

export function saveSleepRest() {
  const duration = getSelectedOption('sleep-duration');
  const quality = getSelectedOption('sleep-quality');
  const daytimeSleepiness = getSelectedOption('sleep-daytime');
  const apneaStatus = getSelectedOption('sleep-apnea-status');
  const papUse = getSelectedOption('sleep-pap-use');
  const naps = getSelectedOption('sleep-naps');
  const schedule = getSelectedOption('sleep-schedule');
  const roomTemp = getSelectedOption('sleep-temp');
  const issues = getSelectedTags('sleep-issues');
  const environment = getSelectedTags('sleep-env');
  const practices = getSelectedTags('sleep-practices');
  const note = getInputValue('ctx-note-input');
  if (!duration && !quality && !daytimeSleepiness && !apneaStatus && !papUse && !naps && !schedule && !roomTemp && issues.length === 0 && environment.length === 0 && practices.length === 0 && !note.trim()) {
    state.importedData.sleepRest = null;
  } else {
    state.importedData.sleepRest = { duration, quality, daytimeSleepiness, apneaStatus, papUse, naps, schedule, roomTemp, issues, environment, practices, note: note.trim() };
  }
  saveContextAndRefresh('Sleep saved', 'sleepRest');
}

export function clearSleepRest() {
  state.importedData.sleepRest = null;
  saveContextAndRefresh('Sleep cleared', 'sleepRest');
}

// ═══════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════

export function openExerciseEditor() { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openExerciseEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.exercise || { frequency: null, types: [], intensity: null, duration: null, dailyMovement: null, muscleContext: null, limitations: [], note: '' };
  renderContextEditorModal(modal, 'Exercise', 'Your routine can affect recovery, inflammation, and several lab markers.', `
    ${renderSelectField('Frequency', 'exercise-freq', EXERCISE_FREQ, current.frequency)}
    ${renderTagsField('Types', 'exercise-types', EXERCISE_TYPES, current.types)}
    ${renderSelectField('Intensity', 'exercise-intensity', EXERCISE_INTENSITY, current.intensity)}
    ${renderContextEditorSection('Training details', summarizeSection([
      current.duration && `${current.duration} sessions`,
      current.dailyMovement,
      current.muscleContext,
      current.limitations,
    ], 'Optional duration, movement, muscle, and recovery context'), `
      ${renderSelectField('Typical session duration', 'exercise-duration', EXERCISE_DURATION, current.duration)}
      ${renderSelectField('Daily movement', 'exercise-movement', DAILY_MOVEMENT, current.dailyMovement)}
      ${renderSelectField('Muscle context', 'exercise-muscle', EXERCISE_MUSCLE_CONTEXT, current.muscleContext)}
      ${renderTagsField('Limitations and recovery', 'exercise-limitations', EXERCISE_LIMITATIONS, current.limitations)}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.exercise != null, lifestyleActionAttrs('save-exercise'), lifestyleActionAttrs('clear-exercise'))}`);
  openModalOverlay(overlay);
}

export function saveExercise() {
  const frequency = getSelectedOption('exercise-freq');
  const types = getSelectedTags('exercise-types');
  const intensity = getSelectedOption('exercise-intensity');
  const duration = getSelectedOption('exercise-duration');
  const dailyMovement = getSelectedOption('exercise-movement');
  const muscleContext = getSelectedOption('exercise-muscle');
  const limitations = getSelectedTags('exercise-limitations');
  const note = getInputValue('ctx-note-input');
  if (!frequency && types.length === 0 && !intensity && !duration && !dailyMovement && !muscleContext && limitations.length === 0 && !note.trim()) {
    state.importedData.exercise = null;
  } else {
    state.importedData.exercise = { frequency, types, intensity, duration, dailyMovement, muscleContext, limitations, note: note.trim() };
  }
  saveContextAndRefresh('Exercise saved', 'exercise');
}

export function clearExercise() {
  state.importedData.exercise = null;
  saveContextAndRefresh('Exercise cleared', 'exercise');
}

// ═══════════════════════════════════════════════
// STRESS
// ═══════════════════════════════════════════════

export function openStressEditor() { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openStressEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.stress || { level: null, duration: null, trend: null, sources: [], management: [], note: '' };
  renderContextEditorModal(modal, 'Stress', 'Add only the stress patterns that feel relevant to your health context.', `
    ${renderSelectField('Stress level', 'stress-level', STRESS_LEVELS, current.level)}
    ${renderSelectField('Duration', 'stress-duration', STRESS_DURATION, current.duration)}
    ${renderContextEditorSection('Sources and response', summarizeSection([
      current.sources,
      current.trend && `trend: ${current.trend}`,
      current.management,
    ], 'Optional sources, trend, and stress management'), `
      ${renderTagsField('Sources', 'stress-sources', STRESS_SOURCES, current.sources)}
      ${renderSelectField('Current trend', 'stress-trend', STRESS_TREND, current.trend)}
      ${renderTagsField('Stress management (what helps)', 'stress-mgmt', STRESS_MGMT, current.management)}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.stress != null, lifestyleActionAttrs('save-stress'), lifestyleActionAttrs('clear-stress'))}`);
  openModalOverlay(overlay);
}

export function saveStress() {
  const level = getSelectedOption('stress-level');
  const duration = getSelectedOption('stress-duration');
  const trend = getSelectedOption('stress-trend');
  const sources = getSelectedTags('stress-sources');
  const management = getSelectedTags('stress-mgmt');
  const note = getInputValue('ctx-note-input');
  if (!level && !duration && !trend && sources.length === 0 && management.length === 0 && !note.trim()) {
    state.importedData.stress = null;
  } else {
    state.importedData.stress = { level, duration, trend, sources, management, note: note.trim() };
  }
  saveContextAndRefresh('Stress profile saved', 'stress');
}

export function clearStress() {
  state.importedData.stress = null;
  saveContextAndRefresh('Stress profile cleared', 'stress');
}

// ═══════════════════════════════════════════════
// LOVE LIFE
// ═══════════════════════════════════════════════

export function openLoveLifeEditor() { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openLoveLifeEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.loveLife || { status: null, satisfaction: null, relationship: null, libido: null, libidoChange: null, frequency: null, orgasm: null, reproductiveGoals: [], concerns: [], note: '' };
  renderContextEditorModal(modal, 'Love Life & Relationships', 'Private and optional. Share only what feels relevant to your health context.', `
    ${renderSelectField('Relationship status', 'love-status', LOVE_STATUS, current.status)}
    ${renderSelectField('Relationship quality', 'love-relationship', LOVE_RELATIONSHIP, current.relationship)}
    ${renderSelectField('Overall satisfaction', 'love-satisfaction', LOVE_SATISFACTION, current.satisfaction)}
    ${renderContextEditorSection('Sexual health details', summarizeSection([
      current.libido ? `${current.libido} libido` : '',
      current.libidoChange && `libido ${current.libidoChange}`,
      current.frequency,
      current.orgasm ? `orgasm: ${current.orgasm}` : '',
      current.reproductiveGoals,
      current.concerns,
    ], 'Private and optional'), `
      ${renderSelectField('Libido', 'love-libido', LOVE_LIBIDO, current.libido)}
      ${renderSelectField('Change from usual', 'love-libido-change', LOVE_LIBIDO_CHANGE, current.libidoChange)}
      ${renderSelectField('Sexual frequency', 'love-frequency', LOVE_FREQUENCY, current.frequency)}
      ${renderSelectField('Orgasm', 'love-orgasm', LOVE_ORGASM, current.orgasm)}
      ${renderTagsField('Reproductive goals', 'love-reproductive-goals', LOVE_REPRODUCTIVE_GOALS, current.reproductiveGoals)}
      ${renderTagsField('Concerns', 'love-concerns', LOVE_CONCERNS.filter(c => {
        if (state.profileSex === 'female' && c === 'erectile issues') return false;
        if (state.profileSex === 'male' && c === 'vaginal dryness') return false;
        return true;
      }), current.concerns)}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.loveLife != null, lifestyleActionAttrs('save-love-life'), lifestyleActionAttrs('clear-love-life'))}`);
  openModalOverlay(overlay);
}

export function saveLoveLife() {
  const status = getSelectedOption('love-status');
  const relationship = getSelectedOption('love-relationship');
  const satisfaction = getSelectedOption('love-satisfaction');
  const libido = getSelectedOption('love-libido');
  const libidoChange = getSelectedOption('love-libido-change');
  const frequency = getSelectedOption('love-frequency');
  const orgasm = getSelectedOption('love-orgasm');
  const reproductiveGoals = getSelectedTags('love-reproductive-goals');
  const concerns = getSelectedTags('love-concerns');
  const note = getInputValue('ctx-note-input');
  if (!status && !relationship && !satisfaction && !libido && !libidoChange && !frequency && !orgasm && reproductiveGoals.length === 0 && concerns.length === 0 && !note.trim()) {
    state.importedData.loveLife = null;
  } else {
    state.importedData.loveLife = { status, relationship, satisfaction, libido, libidoChange, frequency, orgasm, reproductiveGoals, concerns, note: note.trim() };
  }
  saveContextAndRefresh('Love life saved', 'loveLife');
}

export function clearLoveLife() {
  state.importedData.loveLife = null;
  saveContextAndRefresh('Love life cleared', 'loveLife');
}

// ═══════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════

export function openEnvironmentEditor() { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openEnvironmentEditor);
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
