// @ts-check
// context-card-lifestyle-editors.js - lifestyle context card editors

import { state } from './state.js';
import {
  DIET_TYPES,
  DIET_RESTRICTIONS,
  DIET_PATTERNS,
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
  SLEEP_DURATIONS,
  SLEEP_QUALITY,
  SLEEP_SCHEDULE,
  SLEEP_ROOM_TEMP,
  SLEEP_ISSUES,
  SLEEP_ENVIRONMENT,
  SLEEP_PRACTICES,
  LIGHT_AM,
  LIGHT_DAYTIME,
  LIGHT_UV,
  LIGHT_EVENING,
  LIGHT_COLD,
  LIGHT_GROUNDING,
  LIGHT_SCREEN_TIME,
  LIGHT_TECH_ENV,
  LIGHT_MEAL_TIMING,
  STRESS_LEVELS,
  STRESS_SOURCES,
  STRESS_MGMT,
  LOVE_STATUS,
  LOVE_SATISFACTION,
  LOVE_LIBIDO,
  LOVE_FREQUENCY,
  LOVE_ORGASM,
  LOVE_RELATIONSHIP,
  LOVE_CONCERNS,
  ENV_SETTING,
  ENV_CLIMATE,
  ENV_WATER,
  ENV_WATER_CONCERNS,
  ENV_EMF,
  ENV_EMF_MITIGATION,
  ENV_HOME_LIGHT,
  ENV_AIR,
  ENV_TOXINS,
  ENV_BUILDING,
} from './constants.js';
import { bindDetailModalSyncRefresh, escapeHTML, showNotification } from './utils.js';
import { formatTime, getTimeFormat, parseTimeInput } from './theme.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  appendImportedArrayItem,
  clearImportedArray,
  deleteImportedArrayItem,
} from './data-merge.js';
import { getLatitudeFromLocation } from './profile.js';
import { scanDietForContaminants } from './food-contaminants.js';
import {
  EYEWEAR_OPTIONS,
  HOME_LIGHT_OPTIONS,
  ottScoreToLabel,
  reopenSunSetup,
} from './sun-defaults.js';
import {
  getEMFAssessments,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
import {
  contextEditorActions,
  getSelectedOption,
  getSelectedTags,
  renderContextEditorModal,
  renderNoteField,
  renderSelectField,
  renderTagsField,
  selectCtxOption,
} from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalAndNavigateRuntime,
  closeLifestyleContextModalRuntime,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
  openLightSetupFromLifestyleRuntime,
  returnToLifestyleContextModalRuntime,
  updateLifestyleChatHeaderModelRuntime,
} from './context-card-lifestyle-runtime.js';

/** @type {(field: string) => void} */
let recordContextChange = () => {};
/** @type {(msg: string, field?: string) => void} */
let saveContextAndRefresh = (msg, field) => {
  if (field) recordContextChange(field);
  saveImportedData();
  showNotification(msg, 'success');
};

/** @param {{ modal: HTMLElement }} payload */
function refreshOpenHealthGoalsModalOnSync({ modal }) {
  renderHealthGoalsModal(modal);
}

if (typeof window !== 'undefined') {
  bindDetailModalSyncRefresh('healthGoals', refreshOpenHealthGoalsModalOnSync);
}

/**
 * @param {{ recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps]
 */
export function configureLifestyleContextEditors({ recordChange, saveAndRefresh } = {}) {
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
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

function getActiveNavCategory() {
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector(".nav-item.active"));
  return activeNav?.dataset.category || "dashboard";
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

/** @param {MouseEvent} event */
function handleLifestyleContextClick(event) {
  const actionEl = closestLifestyleElement(event.target, '[data-lifestyle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.lifestyleAction || '') {
    case 'show-diet-contaminants': event.preventDefault(); event.stopPropagation(); showDietContaminantsModal(); break;
    case 'open-light-setup': openLightSetupFromContext(); break;
    case 'delete-health-goal': { const idx = getLifestyleIndex(actionEl); if (idx >= 0) deleteHealthGoal(idx); break; }
    case 'add-health-goal': addHealthGoal(); break;
    case 'select-goal-severity': selectCtxOption(actionEl, 'goal-severity-select'); break;
    case 'close-health-goals': closeHealthGoals(); break;
    case 'clear-health-goals': clearHealthGoals(); break;
    case 'save-interpretive-lens': saveInterpretiveLens(); break;
    case 'clear-interpretive-lens': clearInterpretiveLens(); break;
    case 'back-to-context': returnToContextModal(); break;
    case 'discuss-diet-contaminants': discussDietContaminants(); break;
    case 'close-modal': closeLifestyleContextModalRuntime(); break;
    default:
      break;
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
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return '';
  const flagged = warnings.filter(w => w.type !== 'clean').length;
  if (flagged === 0) return '';
  return `<div class="diet-contaminants" role="button" tabindex="0" ${lifestyleActionAttrs('show-diet-contaminants')}>\u26A0\uFE0F ${flagged} food contaminant signal${flagged > 1 ? 's' : ''} detected</div>`;
}

function getTimePlaceholder() {
  return getTimeFormat() === '24h' ? 'HH:MM' : 'H:MM AM';
}

// ═══════════════════════════════════════════════
// DIET
// ═══════════════════════════════════════════════

export function openDietEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.diet || { type: null, restrictions: [], pattern: null, breakfast: '', lunch: '', dinner: '', snacks: '', note: '', bowelFrequency: null, stoolConsistency: null, bloating: null, gas: null, acidReflux: null, burping: null, nausea: null, appetite: null, abdominalPain: null, foodSensitivities: [] };
  renderContextEditorModal(modal, 'Diet & Digestion', 'Describe your typical diet and digestive health. The AI will factor this in when interpreting your labs.', `
    ${renderSelectField('Diet type', 'diet-type', DIET_TYPES, current.type)}
    ${renderSelectField('Eating pattern', 'diet-pattern', DIET_PATTERNS, current.pattern)}
    ${renderTagsField('Restrictions', 'diet-restrictions', DIET_RESTRICTIONS, current.restrictions)}
    <div class="ctx-editor-divider"></div>
    <div class="ctx-field-group"><label class="ctx-field-label">Typical meals</label>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-breakfast-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.breakfastTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-breakfast" placeholder="Breakfast — e.g. eggs, avocado, coffee" value="${escapeHTML(current.breakfast || '')}"></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-lunch-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.lunchTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-lunch" placeholder="Lunch — e.g. salad with grilled chicken" value="${escapeHTML(current.lunch || '')}"></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-dinner-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.dinnerTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-dinner" placeholder="Dinner — e.g. salmon, rice, vegetables" value="${escapeHTML(current.dinner || '')}"></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-snacks-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.snacksTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-snacks" placeholder="Snacks — e.g. nuts, fruit, dark chocolate" value="${escapeHTML(current.snacks || '')}"></div>
    </div>
    <div class="ctx-editor-divider"></div>
    <div class="ctx-field-group"><label class="ctx-field-label">Digestion</label></div>
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
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.diet != null, 'saveDiet', 'clearDiet')}`);
  openModalOverlay(overlay);
}

export function saveDiet() {
  const type = getSelectedOption('diet-type');
  const pattern = getSelectedOption('diet-pattern');
  const restrictions = getSelectedTags('diet-restrictions');
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
  if (!type && !pattern && restrictions.length === 0 && !breakfast.trim() && !lunch.trim() && !dinner.trim() && !snacks.trim() && !bowelFrequency && !stoolConsistency && !bloating && !gas && !acidReflux && !burping && !nausea && !appetite && !abdominalPain && foodSensitivities.length === 0 && !note.trim()) {
    state.importedData.diet = null;
  } else {
    state.importedData.diet = { type, restrictions, pattern, breakfast: breakfast.trim(), breakfastTime, lunch: lunch.trim(), lunchTime, dinner: dinner.trim(), dinnerTime, snacks: snacks.trim(), snacksTime, bowelFrequency, stoolConsistency, bloating, gas, acidReflux, burping, nausea, appetite, abdominalPain, foodSensitivities, note: note.trim() };
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

export function openSleepRestEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.sleepRest || { duration: null, quality: null, schedule: null, roomTemp: null, issues: [], environment: [], practices: [], note: '' };
  renderContextEditorModal(modal, 'Sleep & Rest', 'Sleep is when the body repairs. Duration, temperature, darkness, and EMF exposure all affect hormones, inflammation, and recovery.', `
    ${renderSelectField('Duration', 'sleep-duration', SLEEP_DURATIONS, current.duration)}
    ${renderSelectField('Quality', 'sleep-quality', SLEEP_QUALITY, current.quality)}
    ${renderSelectField('Schedule', 'sleep-schedule', SLEEP_SCHEDULE, current.schedule)}
    ${renderSelectField('Room temperature', 'sleep-temp', SLEEP_ROOM_TEMP, current.roomTemp)}
    ${renderTagsField('Sleep issues', 'sleep-issues', SLEEP_ISSUES, current.issues)}
    <div class="ctx-editor-divider"></div>
    ${renderTagsField('Sleep environment', 'sleep-env', SLEEP_ENVIRONMENT, current.environment)}
    ${renderTagsField('Sleep practices', 'sleep-practices', SLEEP_PRACTICES, current.practices)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.sleepRest != null, 'saveSleepRest', 'clearSleepRest')}`);
  openModalOverlay(overlay);
}

export function saveSleepRest() {
  const duration = getSelectedOption('sleep-duration');
  const quality = getSelectedOption('sleep-quality');
  const schedule = getSelectedOption('sleep-schedule');
  const roomTemp = getSelectedOption('sleep-temp');
  const issues = getSelectedTags('sleep-issues');
  const environment = getSelectedTags('sleep-env');
  const practices = getSelectedTags('sleep-practices');
  const note = getInputValue('ctx-note-input');
  if (!duration && !quality && !schedule && !roomTemp && issues.length === 0 && environment.length === 0 && practices.length === 0 && !note.trim()) {
    state.importedData.sleepRest = null;
  } else {
    state.importedData.sleepRest = { duration, quality, schedule, roomTemp, issues, environment, practices, note: note.trim() };
  }
  saveContextAndRefresh('Sleep saved', 'sleepRest');
}

export function clearSleepRest() {
  state.importedData.sleepRest = null;
  saveContextAndRefresh('Sleep cleared', 'sleepRest');
}

// ═══════════════════════════════════════════════
// LIGHT & CIRCADIAN
// ═══════════════════════════════════════════════

export function openLightCircadianEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.lightCircadian || { amLight: null, daytime: null, uvExposure: null, skinType: null, evening: [], screenTime: null, techEnv: [], cold: null, grounding: null, mealTiming: [], note: '' };
  const lat = getLatitudeFromLocation();
  renderContextEditorModal(modal, 'Light & Circadian', 'Light is the #1 circadian signal. Morning light sets cortisol, UV drives vitamin D and hormones, cold and grounding affect mitochondrial function.', `
    ${renderSelectField('Morning light', 'light-am', LIGHT_AM, current.amLight)}
    ${renderSelectField('Daytime outdoor exposure', 'light-daytime', LIGHT_DAYTIME, current.daytime)}
    ${renderSelectField('UV / sun exposure', 'light-uv', LIGHT_UV, current.uvExposure)}
    ${renderLightSetupMirror(current)}
    ${renderTagsField('Evening light discipline', 'light-evening', LIGHT_EVENING, current.evening)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Daily screen time', 'light-screen', LIGHT_SCREEN_TIME, current.screenTime)}
    ${renderTagsField('Technology environment', 'light-tech', LIGHT_TECH_ENV, current.techEnv)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Cold exposure', 'light-cold', LIGHT_COLD, current.cold)}
    ${renderSelectField('Grounding / earthing', 'light-grounding', LIGHT_GROUNDING, current.grounding)}
    ${renderTagsField('Meal timing signals', 'light-meal', LIGHT_MEAL_TIMING, current.mealTiming)}
    ${lat ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">📍 Latitude: <strong style="color:var(--text-primary)">${escapeHTML(lat)}</strong> <span style="font-size:11px">(from Settings → Location)</span></div>` : `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">💡 Set your country in Settings → Profile for automatic latitude detection</div>`}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.lightCircadian != null, 'saveLightCircadian', 'clearLightCircadian')}`);
  openModalOverlay(overlay);
}

// Render a compact read-only summary of the user's Light lens setup —
// skin type, home lighting, eyewear, and indoor/outdoor lifestyle. The
// Light setup card is the single source of truth; this just surfaces what
// the AI already knows about light from those answers and links over for
// edits. Matches the design pattern of Settings → linked external editors.
function renderLightSetupMirror(current) {
  const sd = state.importedData?.sunDefaults || null;
  const skin = current.skinType || (sd?.fitzpatrick ? `${sd.fitzpatrick}` : null);

  const homeMeta = HOME_LIGHT_OPTIONS.find(o => o.key === sd?.homeLight);
  const eyewearMeta = EYEWEAR_OPTIONS.find(o => o.key === sd?.eyewear);

  let ottBadge = '';
  if (sd && typeof sd.ottScore === 'number') {
    const { label, tier } = ottScoreToLabel(sd.ottScore);
    ottBadge = `<span class="light-ott-badge light-ott-tier-${tier}">${escapeHTML(label)}</span>`;
  } else if (sd?.skipped) {
    ottBadge = `<span class="light-ott-badge">skipped</span>`;
  }

  const hasAny = !!(skin || sd?.homeLight || sd?.eyewear || ottBadge);

  if (!hasAny) {
    return `<div class="ctx-field-group ctx-lightsetup-mirror">
      <label class="ctx-field-label">Light lens setup</label>
      <div class="ctx-lightsetup-empty">
        <span>Not set yet — covers skin type, home lighting, eyewear, and indoor/outdoor lifestyle.</span>
        <button type="button" class="ctx-lightsetup-edit" ${lifestyleActionAttrs('open-light-setup')}>Set up Light lens →</button>
      </div>
    </div>`;
  }

  return `<div class="ctx-field-group ctx-lightsetup-mirror">
    <div class="ctx-lightsetup-head">
      <label class="ctx-field-label" style="margin:0">Light lens setup</label>
      <button type="button" class="ctx-lightsetup-edit" ${lifestyleActionAttrs('open-light-setup')}>Edit →</button>
    </div>
    <div class="ctx-lightsetup-grid">
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Skin type</span><span class="ctx-lightsetup-value">${skin ? escapeHTML(skin) : '—'}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Home lighting</span><span class="ctx-lightsetup-value">${escapeHTML(homeMeta?.label || sd?.homeLight || '—')}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Eyewear outside</span><span class="ctx-lightsetup-value">${escapeHTML(eyewearMeta?.label || sd?.eyewear || '—')}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Light lifestyle</span><span class="ctx-lightsetup-value">${ottBadge || '—'}</span></div>
    </div>
    <div class="ctx-lightsetup-hint">Skin type drives UV tolerance and vitamin D math. Home lighting + eyewear shape your indoor light dose. Lifestyle frames the AI's interpretation everywhere.</div>
  </div>`;
}

export function saveLightCircadian() {
  const amLight = getSelectedOption('light-am');
  const daytime = getSelectedOption('light-daytime');
  const uvExposure = getSelectedOption('light-uv');
  // Skin type is no longer editable here — it's owned by the Light setup card
  // and mirrored to lightCircadian.skinType by sun-defaults.js. Preserve
  // whatever value is currently saved so this editor doesn't overwrite it.
  const skinType = state.importedData.lightCircadian?.skinType || null;
  const evening = getSelectedTags('light-evening');
  const screenTime = getSelectedOption('light-screen');
  const techEnv = getSelectedTags('light-tech');
  const cold = getSelectedOption('light-cold');
  const grounding = getSelectedOption('light-grounding');
  const mealTiming = getSelectedTags('light-meal');
  const note = getInputValue('ctx-note-input');
  if (!amLight && !daytime && !uvExposure && !skinType && evening.length === 0 && !screenTime && techEnv.length === 0 && !cold && !grounding && mealTiming.length === 0 && !note.trim()) {
    state.importedData.lightCircadian = null;
  } else {
    state.importedData.lightCircadian = { amLight, daytime, uvExposure, skinType, evening, screenTime, techEnv, cold, grounding, mealTiming, note: note.trim() };
  }
  saveContextAndRefresh('Light & circadian saved', 'lightCircadian');
}

export function clearLightCircadian() {
  state.importedData.lightCircadian = null;
  saveContextAndRefresh('Light & circadian cleared', 'lightCircadian');
}

// ═══════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════

export function openExerciseEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.exercise || { frequency: null, types: [], intensity: null, dailyMovement: null, note: '' };
  renderContextEditorModal(modal, 'Exercise & Movement', 'Describe your exercise routine. The AI considers this when interpreting your labs.', `
    ${renderSelectField('Frequency', 'exercise-freq', EXERCISE_FREQ, current.frequency)}
    ${renderTagsField('Types', 'exercise-types', EXERCISE_TYPES, current.types)}
    ${renderSelectField('Intensity', 'exercise-intensity', EXERCISE_INTENSITY, current.intensity)}
    ${renderSelectField('Daily movement', 'exercise-movement', DAILY_MOVEMENT, current.dailyMovement)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.exercise != null, 'saveExercise', 'clearExercise')}`);
  openModalOverlay(overlay);
}

export function saveExercise() {
  const frequency = getSelectedOption('exercise-freq');
  const types = getSelectedTags('exercise-types');
  const intensity = getSelectedOption('exercise-intensity');
  const dailyMovement = getSelectedOption('exercise-movement');
  const note = getInputValue('ctx-note-input');
  if (!frequency && types.length === 0 && !intensity && !dailyMovement && !note.trim()) {
    state.importedData.exercise = null;
  } else {
    state.importedData.exercise = { frequency, types, intensity, dailyMovement, note: note.trim() };
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

export function openStressEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.stress || { level: null, sources: [], management: [], note: '' };
  renderContextEditorModal(modal, 'Stress', 'Chronic stress elevates cortisol, disrupts thyroid, raises inflammation, and impairs immunity.', `
    ${renderSelectField('Stress level', 'stress-level', STRESS_LEVELS, current.level)}
    ${renderTagsField('Sources', 'stress-sources', STRESS_SOURCES, current.sources)}
    ${renderTagsField('Management', 'stress-mgmt', STRESS_MGMT, current.management)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.stress != null, 'saveStress', 'clearStress')}`);
  openModalOverlay(overlay);
}

export function saveStress() {
  const level = getSelectedOption('stress-level');
  const sources = getSelectedTags('stress-sources');
  const management = getSelectedTags('stress-mgmt');
  const note = getInputValue('ctx-note-input');
  if (!level && sources.length === 0 && management.length === 0 && !note.trim()) {
    state.importedData.stress = null;
  } else {
    state.importedData.stress = { level, sources, management, note: note.trim() };
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

export function openLoveLifeEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.loveLife || { status: null, satisfaction: null, relationship: null, libido: null, frequency: null, orgasm: null, concerns: [], note: '' };
  renderContextEditorModal(modal, 'Love Life', 'Sexual health and relationships directly affect hormones (testosterone, estrogen, oxytocin, cortisol), immune function, and cardiovascular markers.', `
    ${renderSelectField('Relationship status', 'love-status', LOVE_STATUS, current.status)}
    ${renderSelectField('Relationship quality', 'love-relationship', LOVE_RELATIONSHIP, current.relationship)}
    ${renderSelectField('Overall satisfaction', 'love-satisfaction', LOVE_SATISFACTION, current.satisfaction)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Libido', 'love-libido', LOVE_LIBIDO, current.libido)}
    ${renderSelectField('Sexual frequency', 'love-frequency', LOVE_FREQUENCY, current.frequency)}
    ${renderSelectField('Orgasm', 'love-orgasm', LOVE_ORGASM, current.orgasm)}
    <div class="ctx-editor-divider"></div>
    ${renderTagsField('Concerns', 'love-concerns', LOVE_CONCERNS.filter(c => {
      if (state.profileSex === 'female' && c === 'erectile issues') return false;
      if (state.profileSex === 'male' && c === 'vaginal dryness') return false;
      return true;
    }), current.concerns)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.loveLife != null, 'saveLoveLife', 'clearLoveLife')}`);
  openModalOverlay(overlay);
}

export function saveLoveLife() {
  const status = getSelectedOption('love-status');
  const relationship = getSelectedOption('love-relationship');
  const satisfaction = getSelectedOption('love-satisfaction');
  const libido = getSelectedOption('love-libido');
  const frequency = getSelectedOption('love-frequency');
  const orgasm = getSelectedOption('love-orgasm');
  const concerns = getSelectedTags('love-concerns');
  const note = getInputValue('ctx-note-input');
  if (!status && !relationship && !satisfaction && !libido && !frequency && !orgasm && concerns.length === 0 && !note.trim()) {
    state.importedData.loveLife = null;
  } else {
    state.importedData.loveLife = { status, relationship, satisfaction, libido, frequency, orgasm, concerns, note: note.trim() };
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

export function openEnvironmentEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.environment || { setting: null, climate: null, water: null, waterConcerns: [], emf: [], emfMitigation: [], homeLight: null, air: [], toxins: [], building: null, note: '' };
  const hasEMFAssessment = getEMFAssessments().length > 0;
  renderContextEditorModal(modal, 'Environment', 'Your environment shapes your biology — water quality, EMF, light, air, and toxin exposure directly impact mitochondria, inflammation, and hormone function.', `
    ${renderSelectField('Living setting', 'env-setting', ENV_SETTING, current.setting)}
    ${renderSelectField('Climate', 'env-climate', ENV_CLIMATE, current.climate)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Primary water source', 'env-water', ENV_WATER, current.water)}
    ${renderTagsField('Water concerns', 'env-water-concerns', ENV_WATER_CONCERNS, current.waterConcerns)}
    <div class="ctx-editor-divider"></div>
    <div class="ctx-field-group">
      <label class="ctx-field-label">EMF</label>
      ${renderEMFAssessmentLauncher({ inModal: true, surface: 'environment-editor' })}
    </div>
    ${hasEMFAssessment ? '' : `${renderTagsField('EMF exposure', 'env-emf', ENV_EMF, current.emf)}
    ${renderTagsField('EMF mitigation', 'env-emf-mit', ENV_EMF_MITIGATION, current.emfMitigation)}`}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Home/work lighting', 'env-light', ENV_HOME_LIGHT, current.homeLight)}
    ${renderTagsField('Air quality', 'env-air', ENV_AIR, current.air)}
    <div class="ctx-editor-divider"></div>
    ${renderTagsField('Toxin exposure', 'env-toxins', ENV_TOXINS, current.toxins)}
    ${renderSelectField('Building', 'env-building', ENV_BUILDING, current.building)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.environment != null, 'saveEnvironment', 'clearEnvironment')}`);
  openModalOverlay(overlay);
}

export function saveEnvironment() {
  const setting = getSelectedOption('env-setting');
  const climate = getSelectedOption('env-climate');
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
  if (!setting && !climate && !water && waterConcerns.length === 0 && emf.length === 0 && emfMitigation.length === 0 && !homeLight && air.length === 0 && toxins.length === 0 && !building && !note.trim()) {
    state.importedData.environment = null;
  } else {
    state.importedData.environment = { setting, climate, water, waterConcerns, emf, emfMitigation, homeLight, air, toxins, building, note: note.trim() };
  }
  saveContextAndRefresh('Environment saved', 'environment');
}

export function clearEnvironment() {
  state.importedData.environment = null;
  saveContextAndRefresh('Environment cleared', 'environment');
}

// ═══════════════════════════════════════════════
// HEALTH GOALS
// ═══════════════════════════════════════════════

export function openHealthGoalsEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  renderHealthGoalsModal(modal);
  openModalOverlay(overlay);
}

export function renderHealthGoalsModal(modal) {
  if (modal?.dataset) modal.dataset.syncRefreshKind = 'healthGoals';
  const goals = state.importedData.healthGoals || [];
  let html = '';
  if (goals.length > 0) {
    html += `<div class="goals-list">`;
    for (let i = 0; i < goals.length; i++) {
      const g = goals[i];
      html += `<div class="goals-list-item">
        <span class="goals-severity-badge severity-${g.severity}">${g.severity}</span>
        <span class="goals-text">${escapeHTML(g.text)}</span>
        <button class="goals-delete-btn" ${lifestyleActionAttrs('delete-health-goal', `data-lifestyle-index="${i}"`)} title="Remove">&times;</button>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="ctx-field-group"><label class="ctx-field-label">Add goal</label>
    <div class="goals-add-row">
      <input type="text" class="ctx-note-input" id="goal-text-input" placeholder="e.g. Improve insulin sensitivity, Optimize thyroid function" style="flex:1">
      <button class="import-btn import-btn-primary" ${lifestyleActionAttrs('add-health-goal')}>Add</button>
    </div>
    <div class="ctx-btn-group" id="goal-severity-select" style="margin-top:8px">
      <button type="button" class="ctx-btn-option active" ${lifestyleActionAttrs('select-goal-severity')}>major</button>
      <button type="button" class="ctx-btn-option" ${lifestyleActionAttrs('select-goal-severity')}>mild</button>
      <button type="button" class="ctx-btn-option" ${lifestyleActionAttrs('select-goal-severity')}>minor</button>
    </div>
  </div>
  <div class="ctx-editor-actions">
    <button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-health-goals')}>Done</button>
    ${goals.length > 0 ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${lifestyleActionAttrs('clear-health-goals')}>Clear All</button>` : ''}
  </div>`;
  renderContextEditorModal(modal, 'Health Goals', 'List things you want to solve or improve. The AI will prioritize analysis around your stated goals.', html);
  setTimeout(() => {
    const input = getTextInput('goal-text-input');
    if (input) input.focus();
  }, 50);
}

export function addHealthGoal() {
  const input = getTextInput('goal-text-input');
  const severity = getSelectedOption('goal-severity-select') || 'major';
  const text = input ? input.value.trim() : '';
  if (!text) return;
  appendImportedArrayItem(state.importedData, 'healthGoals', { text, severity, updatedAt: Date.now() });
  recordContextChange('healthGoals');
  saveImportedData();
  renderHealthGoalsModal(document.getElementById("detail-modal"));
}

export function deleteHealthGoal(idx) {
  if (!state.importedData.healthGoals) return;
  deleteImportedArrayItem(state.importedData, 'healthGoals', idx);
  recordContextChange('healthGoals');
  saveImportedData();
  renderHealthGoalsModal(document.getElementById("detail-modal"));
}

export function closeHealthGoals() {
  closeLifestyleContextModalAndNavigateRuntime(getActiveNavCategory());
  if ((state.importedData.healthGoals || []).length > 0) showNotification('Health goals saved', 'success');
}

export function clearHealthGoals() {
  clearImportedArray(state.importedData, 'healthGoals');
  recordContextChange('healthGoals');
  saveImportedData();
  closeLifestyleContextModalAndNavigateRuntime(getActiveNavCategory());
  showNotification('Health goals cleared', 'info');
}

// ═══════════════════════════════════════════════
// INTERPRETIVE LENS
// ═══════════════════════════════════════════════

export function openInterpretiveLensEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.interpretiveLens || '';
  renderContextEditorModal(modal, 'Interpretive Lens', 'List researchers, clinicians, or scientific paradigms whose frameworks you follow. The AI will consider their perspectives when interpreting your results.', `
    <textarea class="note-editor" id="interpretive-lens-textarea" placeholder="e.g. Longevity medicine, quantum biology, functional endocrinology framework...">${escapeHTML(current)}</textarea>
    <div class="ctx-editor-actions">
      <button class="import-btn import-btn-primary" ${lifestyleActionAttrs('save-interpretive-lens')}>Save</button>
      <button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-modal')}>Cancel</button>
      ${current ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${lifestyleActionAttrs('clear-interpretive-lens')}>Clear</button>` : ''}
    </div>`);
  modal.querySelector('.gb-modal-head')?.insertAdjacentHTML('afterbegin',
    `<button type="button" class="context-back-btn" ${lifestyleActionAttrs('back-to-context')} aria-label="Back to Context" title="Back to Context"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>`);
  openModalOverlay(overlay);
  setTimeout(() => {
    const ta = getTextInput('interpretive-lens-textarea');
    if (ta) ta.focus();
  }, 50);
}

export function saveInterpretiveLens() {
  const ta = getTextInput('interpretive-lens-textarea');
  const text = ta ? ta.value.trim() : '';
  state.importedData.interpretiveLens = text || '';
  updateLifestyleChatHeaderModelRuntime();
  recordContextChange('interpretiveLens');
  saveImportedData();
  closeLifestyleContextModalAndNavigateRuntime(getActiveNavCategory());
  showNotification(text ? 'Interpretive lens saved' : 'Interpretive lens cleared', 'success');
}

export function clearInterpretiveLens() {
  state.importedData.interpretiveLens = '';
  updateLifestyleChatHeaderModelRuntime();
  recordContextChange('interpretiveLens');
  saveImportedData();
  closeLifestyleContextModalAndNavigateRuntime(getActiveNavCategory());
  showNotification('Interpretive lens cleared', 'info');
}

// ── Diet contaminant detail modal ──
export function showDietContaminantsModal() {
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return;
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  const pesticide = warnings.filter(w => w.type === 'pesticide');
  const plastic = warnings.filter(w => w.type === 'plastic');
  const clean = warnings.filter(w => w.type === 'clean');
  let html = `<button class="modal-close" ${lifestyleActionAttrs('close-modal')}>&times;</button>
    <h3>Food Contaminant Signals</h3>
    <div class="modal-unit">Based on foods mentioned in your diet card, cross-referenced against public contaminant databases.</div>`;
  if (pesticide.length > 0) {
    html += `<div class="contaminant-section"><div class="contaminant-section-title">\uD83E\uDD6C Pesticide Residues</div>`;
    for (const w of pesticide) {
      html += `<div class="contaminant-detail-item">\u26A0\uFE0F ${escapeHTML(w.warning)} <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener">${escapeHTML(w.source)}</a></div>`;
    }
    html += `</div>`;
  }
  if (plastic.length > 0) {
    html += `<div class="contaminant-section"><div class="contaminant-section-title">\uD83E\uDDF4 Plastic Chemicals</div>`;
    for (const w of plastic) {
      html += `<div class="contaminant-detail-item">\u26A0\uFE0F ${escapeHTML(w.warning)} <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener">${escapeHTML(w.source)}</a></div>`;
    }
    html += `</div>`;
  }
  if (clean.length > 0) {
    html += `<div class="contaminant-section"><div class="contaminant-section-title">\u2705 Low Contamination</div>`;
    for (const w of clean) {
      html += `<div class="contaminant-detail-item">${escapeHTML(w.warning)} <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener">${escapeHTML(w.source)}</a></div>`;
    }
    html += `</div>`;
  }
  html += `<div class="contaminant-actions">
    <button class="import-btn import-btn-primary" ${lifestyleActionAttrs('discuss-diet-contaminants')}>Discuss with AI</button>
    <button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-modal')}>Close</button>
  </div>
  <div class="contaminant-attribution">Sources: <a href="https://www.ewg.org/foodnews/" target="_blank" rel="noopener">EWG Shopper's Guide 2025</a> · <a href="https://www.plasticlist.org/report" target="_blank" rel="noopener">PlasticList</a></div>`;
  modal.innerHTML = html;
  openModalOverlay(overlay);
}
