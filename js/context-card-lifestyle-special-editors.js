// @ts-check
// Light, goals, interpretive-lens, and diet-contaminant lifestyle editors.

import { state } from './state.js';
import {
  LIGHT_AM,
  LIGHT_DAYTIME,
  LIGHT_UV,
  LIGHT_EVENING,
  LIGHT_COLD,
  LIGHT_GROUNDING,
  LIGHT_SCREEN_TIME,
  LIGHT_TECH_ENV,
  LIGHT_MEAL_TIMING,
} from './constants.js';
import {
  bindDetailModalSyncRefresh,
  escapeAttr,
  escapeHTML,
  showNotification,
} from './utils.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  appendImportedArrayItem,
  clearImportedArray,
  deleteImportedArrayItem,
} from './data-merge.js';
import { getLatitudeFromLocation } from './profile.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { sortHealthGoalsByPriority } from './health-goals-utils.js';
import {
  EYEWEAR_OPTIONS,
  HOME_LIGHT_OPTIONS,
  ottScoreToLabel,
} from './sun-defaults.js';
import {
  contextEditorActions,
  getSelectedOption,
  getSelectedTags,
  isContextEditorStylesheetLoaded,
  runWithContextEditorStylesheet,
  renderContextEditorModal,
  renderContextEditorSection,
  renderNoteField,
  renderSelectField,
  renderTagsField,
} from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalAndNavigateRuntime,
  updateLifestyleChatHeaderModelRuntime,
} from './context-card-lifestyle-runtime.js';

const GOAL_PRIORITY_LABELS = { major: 'High', mild: 'Medium', minor: 'Low' };
const HEALTH_GOAL_STARTERS = [
  'Improve energy',
  'Sleep better',
  'Improve metabolic health',
  'Reduce cardiovascular risk',
  'Optimize thyroid or hormones',
  'Correct nutrient deficiencies',
  'Support liver or kidney health',
  'Improve training and recovery',
];

/** @type {(field: string) => void} */
let recordContextChange = () => {};
/** @type {(msg: string, field?: string) => void} */
let saveContextAndRefresh = (msg, field) => {
  if (field) recordContextChange(field);
  saveImportedData();
  showNotification(msg, 'success');
};

/** @param {{ recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps] */
export function configureLifestyleSpecialEditors({ recordChange, saveAndRefresh } = {}) {
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
}

function lifestyleActionAttrs(action, extra = '') {
  return `data-lifestyle-action="${action}"${extra ? ` ${extra}` : ''}`;
}

/** @returns {HTMLInputElement | HTMLTextAreaElement | null} */
function getTextInput(id) {
  return /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
}

function getInputValue(id) {
  return getTextInput(id)?.value || '';
}

function getActiveNavCategory() {
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'));
  return activeNav?.dataset.category || 'dashboard';
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

// ── Light & Circadian ──

export function openLightCircadianEditor() {
  if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openLightCircadianEditor);
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  const current = state.importedData.lightCircadian || { amLight: null, daytime: null, uvExposure: null, skinType: null, evening: [], screenTime: null, techEnv: [], cold: null, grounding: null, mealTiming: [], note: '' };
  const lat = getLatitudeFromLocation();
  renderContextEditorModal(modal, 'Light & Circadian', 'Light, screen, and meal-timing habits help frame circadian and metabolic patterns.', `
    ${renderSelectField('Morning light', 'light-am', LIGHT_AM, current.amLight)}
    ${renderSelectField('Daytime outdoor exposure', 'light-daytime', LIGHT_DAYTIME, current.daytime)}
    ${renderSelectField('UV / sun exposure', 'light-uv', LIGHT_UV, current.uvExposure)}
    ${renderLightSetupMirror(current)}
    ${renderContextEditorSection('Evening and technology', summarizeSection([current.evening, current.screenTime, current.techEnv], 'Optional screens, lighting, and device environment'), `
      ${renderTagsField('Evening light discipline', 'light-evening', LIGHT_EVENING, current.evening)}
      ${renderSelectField('Daily screen time', 'light-screen', LIGHT_SCREEN_TIME, current.screenTime)}
      ${renderTagsField('Technology environment', 'light-tech', LIGHT_TECH_ENV, current.techEnv)}
    `)}
    ${renderContextEditorSection('Other circadian signals', summarizeSection([current.cold, current.grounding, current.mealTiming], 'Optional cold, grounding, and meal timing'), `
      ${renderSelectField('Cold exposure', 'light-cold', LIGHT_COLD, current.cold)}
      ${renderSelectField('Grounding / earthing', 'light-grounding', LIGHT_GROUNDING, current.grounding)}
      ${renderTagsField('Meal timing signals', 'light-meal', LIGHT_MEAL_TIMING, current.mealTiming)}
    `)}
    ${lat ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">📍 Latitude: <strong style="color:var(--text-primary)">${escapeHTML(lat)}</strong> <span style="font-size:11px">(from Settings → Location)</span></div>` : `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">💡 Set your country in Settings → Profile for automatic latitude detection</div>`}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.lightCircadian != null, lifestyleActionAttrs('save-light-circadian'), lifestyleActionAttrs('clear-light-circadian'))}`);
  openModalOverlay(overlay);
}

function renderLightSetupMirror(current) {
  const defaults = state.importedData?.sunDefaults || null;
  const skin = current.skinType || (defaults?.fitzpatrick ? `${defaults.fitzpatrick}` : null);
  const homeMeta = HOME_LIGHT_OPTIONS.find(option => option.key === defaults?.homeLight);
  const eyewearMeta = EYEWEAR_OPTIONS.find(option => option.key === defaults?.eyewear);
  let ottBadge = '';
  if (defaults && typeof defaults.ottScore === 'number') {
    const { label, tier } = ottScoreToLabel(defaults.ottScore);
    ottBadge = `<span class="ctx-lightsetup-ott-badge ctx-lightsetup-ott-tier-${tier}">${escapeHTML(label)}</span>`;
  } else if (defaults?.skipped) {
    ottBadge = '<span class="ctx-lightsetup-ott-badge">skipped</span>';
  }
  if (!(skin || defaults?.homeLight || defaults?.eyewear || ottBadge)) {
    return `<div class="ctx-field-group ctx-lightsetup-mirror"><label class="ctx-field-label">Light lens setup</label><div class="ctx-lightsetup-empty"><span>Not set yet — covers skin type, home lighting, eyewear, and indoor/outdoor lifestyle.</span><button type="button" class="ctx-lightsetup-edit" ${lifestyleActionAttrs('open-light-setup')}>Set up Light lens →</button></div></div>`;
  }
  return `<div class="ctx-field-group ctx-lightsetup-mirror">
    <div class="ctx-lightsetup-head"><label class="ctx-field-label" style="margin:0">Light lens setup</label><button type="button" class="ctx-lightsetup-edit" ${lifestyleActionAttrs('open-light-setup')}>Edit →</button></div>
    <div class="ctx-lightsetup-grid">
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Skin type</span><span class="ctx-lightsetup-value">${skin ? escapeHTML(skin) : '—'}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Home lighting</span><span class="ctx-lightsetup-value">${escapeHTML(homeMeta?.label || defaults?.homeLight || '—')}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Eyewear outside</span><span class="ctx-lightsetup-value">${escapeHTML(eyewearMeta?.label || defaults?.eyewear || '—')}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Light lifestyle</span><span class="ctx-lightsetup-value">${ottBadge || '—'}</span></div>
    </div>
    <div class="ctx-lightsetup-hint">Skin type drives UV tolerance and vitamin D math. Home lighting + eyewear shape your indoor light dose. Lifestyle frames the AI's interpretation everywhere.</div>
  </div>`;
}

export function saveLightCircadian() {
  const amLight = getSelectedOption('light-am');
  const daytime = getSelectedOption('light-daytime');
  const uvExposure = getSelectedOption('light-uv');
  const skinType = state.importedData.lightCircadian?.skinType || null;
  const evening = getSelectedTags('light-evening');
  const screenTime = getSelectedOption('light-screen');
  const techEnv = getSelectedTags('light-tech');
  const cold = getSelectedOption('light-cold');
  const grounding = getSelectedOption('light-grounding');
  const mealTiming = getSelectedTags('light-meal');
  const note = getInputValue('ctx-note-input');
  state.importedData.lightCircadian = !amLight && !daytime && !uvExposure && !skinType && evening.length === 0 && !screenTime && techEnv.length === 0 && !cold && !grounding && mealTiming.length === 0 && !note.trim()
    ? null
    : { amLight, daytime, uvExposure, skinType, evening, screenTime, techEnv, cold, grounding, mealTiming, note: note.trim() };
  saveContextAndRefresh('Light & circadian saved', 'lightCircadian');
}

export function clearLightCircadian() {
  state.importedData.lightCircadian = null;
  saveContextAndRefresh('Light & circadian cleared', 'lightCircadian');
}

// ── Health Goals ──

function refreshOpenHealthGoalsModalOnSync({ modal }) {
  renderHealthGoalsModal(modal);
}

if (typeof window !== 'undefined') {
  bindDetailModalSyncRefresh('healthGoals', refreshOpenHealthGoalsModalOnSync);
}

export function openHealthGoalsEditor() {
  if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openHealthGoalsEditor);
  const modal = document.getElementById('detail-modal');
  renderHealthGoalsModal(modal);
  openModalOverlay(document.getElementById('modal-overlay'));
}

export function renderHealthGoalsModal(modal) {
  if (modal?.dataset) modal.dataset.syncRefreshKind = 'healthGoals';
  const goals = state.importedData.healthGoals || [];
  let html = '';
  if (goals.length > 0) {
    html += '<div class="goals-list">';
    for (const goal of sortHealthGoalsByPriority(goals)) {
      const originalIndex = goals.indexOf(goal);
      html += `<div class="goals-list-item"><span class="goals-severity-badge severity-${goal.severity}">${escapeHTML(GOAL_PRIORITY_LABELS[goal.severity] || goal.severity || 'Medium')}</span><span class="goals-text">${escapeHTML(goal.text)}</span><button class="goals-delete-btn" ${lifestyleActionAttrs('delete-health-goal', `data-lifestyle-index="${originalIndex}"`)} aria-label="Remove goal" title="Remove goal">&times;</button></div>`;
    }
    html += '</div>';
  }
  html += `<div class="ctx-field-group"><span class="ctx-field-label" id="goal-starters-label">Common starting points</span><div class="ctx-tags" role="group" aria-labelledby="goal-starters-label">${HEALTH_GOAL_STARTERS.map(goal => `<button type="button" class="ctx-tag" ${lifestyleActionAttrs('suggest-health-goal', `data-lifestyle-value="${escapeAttr(goal)}"`)}>${escapeHTML(goal)}</button>`).join('')}</div></div>
    <div class="ctx-field-group"><label class="ctx-field-label" for="goal-text-input">Add goal</label><div class="goals-add-row"><input type="text" class="ctx-note-input" id="goal-text-input" placeholder="e.g. Improve insulin sensitivity, Optimize thyroid function" style="flex:1"></div>
      <div class="goals-add-controls"><div class="goals-priority-field"><span class="ctx-field-label" id="goal-priority-label">Priority</span><div class="ctx-btn-group" id="goal-severity-select" role="group" aria-labelledby="goal-priority-label">
        <button type="button" class="ctx-btn-option" aria-pressed="false" data-context-value="major" ${lifestyleActionAttrs('select-goal-severity')}>High</button><button type="button" class="ctx-btn-option active" aria-pressed="true" data-context-value="mild" ${lifestyleActionAttrs('select-goal-severity')}>Medium</button><button type="button" class="ctx-btn-option" aria-pressed="false" data-context-value="minor" ${lifestyleActionAttrs('select-goal-severity')}>Low</button>
      </div></div><button class="import-btn import-btn-primary goals-add-btn" ${lifestyleActionAttrs('add-health-goal')}>Add goal</button></div></div>
    <div class="ctx-editor-actions"><button class="import-btn import-btn-primary" ${lifestyleActionAttrs('close-health-goals')}>Done</button>${goals.length > 0 ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${lifestyleActionAttrs('clear-health-goals')}>Clear All</button>` : ''}</div>`;
  renderContextEditorModal(modal, 'Health Goals', 'List things you want to solve or improve. The AI will prioritize analysis around your stated goals.', html);
  setTimeout(() => getTextInput('goal-text-input')?.focus(), 50);
}

export function addHealthGoal() {
  const input = getTextInput('goal-text-input');
  const severity = getSelectedOption('goal-severity-select') || 'mild';
  const text = input?.value.trim() || '';
  if (!text) return;
  appendImportedArrayItem(state.importedData, 'healthGoals', { text, severity, updatedAt: Date.now() });
  recordContextChange('healthGoals');
  saveImportedData();
  renderHealthGoalsModal(document.getElementById('detail-modal'));
}

export function deleteHealthGoal(index) {
  if (!state.importedData.healthGoals) return;
  deleteImportedArrayItem(state.importedData, 'healthGoals', index);
  recordContextChange('healthGoals');
  saveImportedData();
  renderHealthGoalsModal(document.getElementById('detail-modal'));
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

// ── Interpretive Lens ──

export function openInterpretiveLensEditor() {
  if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openInterpretiveLensEditor);
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  const current = state.importedData.interpretiveLens || '';
  renderContextEditorModal(modal, 'Interpretive Lens', 'List researchers, clinicians, or scientific paradigms whose frameworks you follow. The AI will consider their perspectives when interpreting your results.', `
    <textarea class="note-editor" id="interpretive-lens-textarea" placeholder="e.g. Longevity medicine, quantum biology, functional endocrinology framework...">${escapeHTML(current)}</textarea>
    <div class="ctx-editor-actions"><button class="import-btn import-btn-primary" ${lifestyleActionAttrs('save-interpretive-lens')}>Save</button><button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-modal')}>Cancel</button>${current ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${lifestyleActionAttrs('clear-interpretive-lens')}>Clear</button>` : ''}</div>`);
  modal.querySelector('.gb-modal-head')?.insertAdjacentHTML('afterbegin', `<button type="button" class="context-back-btn" ${lifestyleActionAttrs('back-to-context')} aria-label="Back to Context" title="Back to Context"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>`);
  openModalOverlay(overlay);
  setTimeout(() => getTextInput('interpretive-lens-textarea')?.focus(), 50);
}

export function saveInterpretiveLens() {
  const text = getInputValue('interpretive-lens-textarea').trim();
  state.importedData.interpretiveLens = text;
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
  if (!modal || !overlay) return;
  let html = `<button class="modal-close" ${lifestyleActionAttrs('close-modal')}>&times;</button><h3>Food Contaminant Signals</h3><div class="modal-unit">Based on foods mentioned in your diet card, cross-referenced against public contaminant databases.</div>`;
  const sections = [
    ['pesticide', '🥬 Pesticide Residues', true],
    ['plastic', '🧴 Plastic Chemicals', true],
    ['clean', '✅ Low Contamination', false],
  ];
  for (const [type, title, warn] of sections) {
    const matches = warnings.filter(item => item.type === type);
    if (matches.length === 0) continue;
    html += `<div class="contaminant-section"><div class="contaminant-section-title">${title}</div>`;
    for (const item of matches) html += `<div class="contaminant-detail-item">${warn ? '⚠️ ' : ''}${escapeHTML(item.warning)} <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">${escapeHTML(item.source)}</a></div>`;
    html += '</div>';
  }
  html += `<div class="contaminant-actions"><button class="import-btn import-btn-primary" ${lifestyleActionAttrs('discuss-diet-contaminants')}>Discuss with AI</button><button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-modal')}>Close</button></div><div class="contaminant-attribution">Sources: <a href="https://www.ewg.org/foodnews/" target="_blank" rel="noopener">EWG Shopper's Guide 2025</a> · <a href="https://www.plasticlist.org/report" target="_blank" rel="noopener">PlasticList</a></div>`;
  modal.innerHTML = html;
  openModalOverlay(overlay);
}
