// context-cards.js - dashboard context card facade and shared lifecycle

import { state } from './state.js';
import { escapeHTML, showNotification } from './utils.js';
import { saveImportedData, getActiveData } from './data.js';
import { hasAIProvider } from './api.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
  trimImportedArray,
} from './data-merge.js';
import {
  getConditionsSummary,
  getDietSummary,
  getExerciseSummary,
  getSleepSummary,
  getLightCircadianSummary,
  getStressSummary,
  getLoveLifeSummary,
  getEnvironmentSummary,
  getGoalsSummary,
  isContextFilled,
  getContextCardDefs,
} from './context-card-summaries.js';
import {
  applyDotColor as applyContextHealthDotColor,
  applyAISummary as applyContextAISummary,
  getCardFingerprint as getContextCardFingerprint,
  loadContextHealthDots as loadContextHealthDotsImpl,
  refreshAllHealthDots as refreshAllHealthDotsImpl,
} from './context-card-health-dots.js';
import {
  openDataProtectionPicker,
  openPersonalizeAIPicker,
  renderDataProtectionCta,
  renderInterpretiveLensSection,
  renderKnowledgeBaseSection,
  triggerDNAFilePicker,
} from './context-card-dashboard-ai.js';
import {
  renderContextEditorModal,
  renderSelectField,
  selectCtxOption,
  getSelectedOption,
  renderTagsField,
  toggleCtxTag,
  getSelectedTags,
  renderNoteField,
  contextEditorActions,
} from './context-card-editor-ui.js';
import {
  configureMedicalHistoryEditor,
  openDiagnosesEditor,
  renderDiagnosesModal,
  filterConditionSuggestions,
  selectConditionSuggestion,
  closeSuggestionsOnClickOutside,
  syncDiagnosesNote,
  addCondition,
  editCondition,
  cancelConditionEdit,
  deleteCondition,
  addFamilyHistoryEntry,
  editFamilyHistoryEntry,
  cancelFamilyHistoryEdit,
  deleteFamilyHistoryEntry,
  filterFamilyConditionSuggestions,
  selectFamilyConditionSuggestion,
  saveDiagnoses,
  closeDiagnoses,
  clearDiagnoses,
} from './context-card-medical-history-editor.js';
import {
  configureLifestyleContextEditors,
  renderDietContaminantsBadge,
  openDietEditor,
  saveDiet,
  clearDiet,
  openSleepRestEditor,
  saveSleepRest,
  clearSleepRest,
  openLightCircadianEditor,
  saveLightCircadian,
  clearLightCircadian,
  openExerciseEditor,
  saveExercise,
  clearExercise,
  openStressEditor,
  saveStress,
  clearStress,
  openLoveLifeEditor,
  saveLoveLife,
  clearLoveLife,
  openEnvironmentEditor,
  saveEnvironment,
  clearEnvironment,
  openHealthGoalsEditor,
  renderHealthGoalsModal,
  addHealthGoal,
  deleteHealthGoal,
  closeHealthGoals,
  clearHealthGoals,
  openInterpretiveLensEditor,
  saveInterpretiveLens,
  clearInterpretiveLens,
  showDietContaminantsModal,
} from './context-card-lifestyle-editors.js';

export {
  getConditionsSummary,
  getDietSummary,
  getExerciseSummary,
  getSleepSummary,
  getLightCircadianSummary,
  getStressSummary,
  getLoveLifeSummary,
  getEnvironmentSummary,
  getGoalsSummary,
  isContextFilled,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
export {
  renderSelectField,
  selectCtxOption,
  getSelectedOption,
  renderTagsField,
  toggleCtxTag,
  getSelectedTags,
  renderNoteField,
  contextEditorActions,
} from './context-card-editor-ui.js';
export {
  openDiagnosesEditor,
  renderDiagnosesModal,
  filterConditionSuggestions,
  selectConditionSuggestion,
  closeSuggestionsOnClickOutside,
  syncDiagnosesNote,
  addCondition,
  editCondition,
  cancelConditionEdit,
  deleteCondition,
  addFamilyHistoryEntry,
  editFamilyHistoryEntry,
  cancelFamilyHistoryEdit,
  deleteFamilyHistoryEntry,
  filterFamilyConditionSuggestions,
  selectFamilyConditionSuggestion,
  saveDiagnoses,
  closeDiagnoses,
  clearDiagnoses,
} from './context-card-medical-history-editor.js';
export {
  openDataProtectionPicker,
  openPersonalizeAIPicker,
  renderDataProtectionCta,
  renderInterpretiveLensSection,
  renderKnowledgeBaseSection,
  triggerDNAFilePicker,
} from './context-card-dashboard-ai.js';
export {
  openDietEditor,
  saveDiet,
  clearDiet,
  openSleepRestEditor,
  saveSleepRest,
  clearSleepRest,
  openLightCircadianEditor,
  saveLightCircadian,
  clearLightCircadian,
  openExerciseEditor,
  saveExercise,
  clearExercise,
  openStressEditor,
  saveStress,
  clearStress,
  openLoveLifeEditor,
  saveLoveLife,
  clearLoveLife,
  openEnvironmentEditor,
  saveEnvironment,
  clearEnvironment,
  openHealthGoalsEditor,
  renderHealthGoalsModal,
  addHealthGoal,
  deleteHealthGoal,
  closeHealthGoals,
  clearHealthGoals,
  openInterpretiveLensEditor,
  saveInterpretiveLens,
  clearInterpretiveLens,
  showDietContaminantsModal,
} from './context-card-lifestyle-editors.js';

export function renderProfileContextCards() {
  const cardDefs = getContextCardDefs();
  const filledCount = cardDefs.filter(c => isContextFilled(c.key)).length;
  const _ccData = getActiveData();
  const _ccHasLabs = _ccData.dates.length > 0 || Object.values(_ccData.categories).some(c => c.singleDate);
  const _ccMissingDemo = (!state.profileSex || !state.profileDob);
  const _ccDemoHint = _ccMissingDemo ? ' Set your sex and date of birth in Settings too \u2014 they shape which panels matter most.' : '';
  let _ccSubtitle = '';
  if (!_ccHasLabs && filledCount === 0) {
    _ccSubtitle = `<div class="context-section-subtitle">Fill all 9 cards and the AI can recommend exactly which labs to get \u2014 and why.${_ccDemoHint}</div>`;
  } else if (!_ccHasLabs && filledCount < cardDefs.length) {
    _ccSubtitle = `<div class="context-section-subtitle">The more you fill in, the better the recommendations \u2014 try to complete all 9, then open the chat.${_ccDemoHint}</div>`;
  } else if (!_ccHasLabs) {
    _ccSubtitle = `<div class="context-section-subtitle">${_ccMissingDemo ? 'Set your sex and date of birth in Settings, then open' : 'All filled \u2014 open'} the chat to get personalized test recommendations based on your profile.</div>`;
  }
  const _refreshBtn = hasAIProvider() ? `<button class="ctx-refresh-all-btn" onclick="event.stopPropagation();refreshAllHealthDots()" title="Refresh all AI insights">&#x21bb;</button>` : '';
  let html = `<div style="margin-top:16px"><span class="context-section-title">What your GP won't ask you (${filledCount}/${cardDefs.length} filled)</span>${_refreshBtn}${_ccSubtitle}</div>`;
  html += `<div class="profile-context-cards">`;
  for (const c of cardDefs) {
    const filled = isContextFilled(c.key);
    const summary = c.summaryFn();
    // axe nested-interactive: the card body is mouse-clickable but
    // KEYBOARD interactivity now lives only on the Edit button below.
    // Both fire the same editor — keyboard users tab to Edit, mouse
    // users still get the whole-card click affordance.
    html += `<div class="context-card" onclick="${c.editor}()" style="cursor:pointer">
      <div class="context-card-header">
        <span class="ctx-health-dot ctx-health-dot-gray" id="ctx-dot-${c.key}"></span>
        <span class="context-card-label">${c.emoji} ${c.label}</span>
        <span class="context-info-icon">i<span class="context-tooltip">${c.tooltip}</span></span>
        <span id="ctx-tips-${c.key}"></span><button class="diagnoses-edit-btn" aria-label="${filled ? 'Edit' : 'Add'} ${escapeHTML(c.label)}" onclick="event.stopPropagation();${c.editor}()">${filled ? 'Edit' : '+ Add'}</button>
      </div>
      ${summary
        ? `<div class="context-card-body">${escapeHTML(summary)}</div>`
        : `<div class="context-card-placeholder">${c.placeholder}</div>`}
      ${c.key === 'diet' ? renderDietContaminantsBadge() : ''}
      <div class="ctx-ai-summary" id="ctx-ai-${c.key}"></div>
    </div>`;
  }
  html += `</div>`;
  // Additional Notes textarea
  const notes = state.importedData.contextNotes || '';
  html += `<div class="ctx-notes-section">
    <textarea class="ctx-notes-textarea" id="ctx-notes-textarea" placeholder="Additional notes for AI context (anything else that might affect your labs...)" oninput="debounceContextNotes()">${escapeHTML(notes)}</textarea>
  </div>`;
  return html;
}

let _ctxNotesTimer = null;
export function debounceContextNotes() {
  clearTimeout(_ctxNotesTimer);
  _ctxNotesTimer = setTimeout(() => {
    const ta = document.getElementById('ctx-notes-textarea');
    if (ta) {
      state.importedData.contextNotes = ta.value;
      recordChange('contextNotes');
      saveImportedData();
    }
  }, 500);
}

// ── AI Health Status Dots ──

export function applyDotColor(key, color) {
  applyContextHealthDotColor(key, color);
}

export function applyAISummary(key, text, color) {
  applyContextAISummary(key, text, color);
}

export function getCardFingerprint(key, ctx) {
  return getContextCardFingerprint(key, ctx);
}

export async function loadContextHealthDots() {
  return loadContextHealthDotsImpl();
}

export function refreshAllHealthDots() {
  return refreshAllHealthDotsImpl();
}

// ── Change History ──

export function recordChange(field) {
  const today = new Date().toISOString().slice(0, 10);
  const current = state.importedData[field];
  const snapshot = current != null ? JSON.parse(JSON.stringify(current)) : null;
  const snapshotStr = JSON.stringify(snapshot);
  const history = ensureImportedArray(state.importedData, 'changeHistory');
  // Skip if identical to last snapshot for this field
  const lastIdx = history.findLastIndex(e => e.field === field);
  if (lastIdx >= 0 && JSON.stringify(history[lastIdx].snapshot) === snapshotStr) return;
  // Same field + same day → overwrite. Stamp updatedAt so cross-device
  // tie-break prefers the newer write (composite-keyed merge in data-merge.js
  // falls back to Date.parse(date) without this — same-day = tie = local-wins,
  // silently dropping the remote's newer snapshot).
  const now = Date.now();
  const todayIdx = history.findIndex(e => e.field === field && e.date === today);
  if (todayIdx >= 0) {
    replaceImportedArrayItem(state.importedData, 'changeHistory', todayIdx, {
      ...history[todayIdx],
      snapshot,
      updatedAt: now,
    });
  } else {
    appendImportedArrayItem(state.importedData, 'changeHistory', { field, date: today, snapshot, updatedAt: now });
  }
  // Cap at 200
  trimImportedArray(state.importedData, 'changeHistory', 200);
}

export function saveAndRefresh(msg, field) {
  if (field) recordChange(field);
  saveImportedData();
  // Preserve details open state across the re-render below
  const details = document.querySelector('.welcome-context-details');
  if (details?.open) sessionStorage.setItem('welcome-details-open', '1');
  window.closeModal();
  showNotification(msg, 'success');
  if (window.onContextCardSaved) window.onContextCardSaved();
  // Re-render the current view so the saved values appear on the card
  // immediately. BroadcastChannel notifies other tabs but never delivers
  // back to the sender, so a single-tab user would otherwise see no UI
  // update until a reload or navigation. Mirrors the BroadcastChannel
  // handler in crypto.js:initBroadcastChannel. See #123.
  const activeNav = document.querySelector('.nav-item.active');
  if (window.navigate) window.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  // Refresh health dots for the saved card (fingerprint will have changed).
  // Must run after navigate() so the ctx-dot-* elements exist in the new DOM.
  loadContextHealthDots();
}

configureMedicalHistoryEditor({ recordChange, saveAndRefresh });
configureLifestyleContextEditors({ recordChange, saveAndRefresh });

// ── Card tips badges (async — waits for catalog) ──
async function loadContextCardTips() {
  if (!window.isProductRecsEnabled || !window.isProductRecsEnabled()) return;
  if (!window.loadCatalog || !window.getCardSlotKeys) return;
  await window.loadCatalog();
  const cardKeys = ['sleepRest', 'lightCircadian', 'environment', 'exercise', 'diet', 'stress'];
  for (const key of cardKeys) {
    const el = document.getElementById(`ctx-tips-${key}`);
    if (!el || el.children.length > 0) continue;
    if (window.getCardSlotKeys(key).length === 0) continue;
    const badge = document.createElement('span');
    badge.className = 'ctx-tips-badge';
    badge.textContent = 'Tips';
    badge.title = 'Lifestyle tips for this area';
    badge.onclick = (e) => { e.stopPropagation(); openCardTipsModal(key); };
    el.appendChild(badge);
  }
}

// ── Card tips modal ──
function openCardTipsModal(cardKey) {
  if (!window.renderCardTipsModal) return;
  const html = window.renderCardTipsModal(cardKey);
  if (!html) return;
  // Reuse the detail modal overlay
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('detail-modal');
  if (!overlay || !modal) return;
  modal.innerHTML = html;
  overlay.classList.add('show');
}

// ── Window exports for onclick handlers ──
Object.assign(window, {
  getConditionsSummary,
  getDietSummary,
  getExerciseSummary,
  getSleepSummary,
  getLightCircadianSummary,
  getStressSummary,
  getLoveLifeSummary,
  getEnvironmentSummary,
  getGoalsSummary,
  isContextFilled,
  renderProfileContextCards,
  debounceContextNotes,
  applyDotColor,
  applyAISummary,
  getCardFingerprint,
  loadContextHealthDots,
  refreshAllHealthDots,
  renderSelectField,
  selectCtxOption,
  getSelectedOption,
  renderTagsField,
  toggleCtxTag,
  getSelectedTags,
  renderNoteField,
  contextEditorActions,
  saveAndRefresh,
  openDiagnosesEditor,
  renderDiagnosesModal,
  filterConditionSuggestions,
  selectConditionSuggestion,
  closeSuggestionsOnClickOutside,
  syncDiagnosesNote,
  addCondition,
  editCondition,
  cancelConditionEdit,
  deleteCondition,
  addFamilyHistoryEntry,
  editFamilyHistoryEntry,
  cancelFamilyHistoryEdit,
  deleteFamilyHistoryEntry,
  filterFamilyConditionSuggestions,
  selectFamilyConditionSuggestion,
  saveDiagnoses,
  closeDiagnoses,
  clearDiagnoses,
  openDietEditor,
  saveDiet,
  clearDiet,
  openSleepRestEditor,
  saveSleepRest,
  clearSleepRest,
  openLightCircadianEditor,
  saveLightCircadian,
  clearLightCircadian,
  openExerciseEditor,
  saveExercise,
  clearExercise,
  openStressEditor,
  saveStress,
  clearStress,
  openLoveLifeEditor,
  saveLoveLife,
  clearLoveLife,
  openEnvironmentEditor,
  saveEnvironment,
  clearEnvironment,
  openHealthGoalsEditor,
  renderHealthGoalsModal,
  addHealthGoal,
  deleteHealthGoal,
  closeHealthGoals,
  clearHealthGoals,
  openInterpretiveLensEditor,
  saveInterpretiveLens,
  clearInterpretiveLens,
  renderInterpretiveLensSection,
  renderKnowledgeBaseSection,
  openPersonalizeAIPicker,
  openDataProtectionPicker,
  triggerDNAFilePicker,
  recordChange,
  showDietContaminantsModal,
  openCardTipsModal,
  loadContextCardTips,
});
