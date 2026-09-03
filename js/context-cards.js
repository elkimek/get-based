// @ts-check
// context-cards.js - dashboard context card module surface and shared lifecycle

import { state } from './state.js';
import { escapeAttr, escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { saveImportedData, getActiveData } from './data.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import { renderNutritionCircadianExtension, renderNutritionDietExtension } from './nutrition-context-card-extensions.js';
import { getRecommendationModuleFunction } from './recommendations-runtime.js';
import {
  closeContextCardModalRuntime,
  configureContextCardsRuntimeCallbacks,
  navigateContextCardViewRuntime,
  notifyContextCardSavedRuntime,
} from './context-cards-runtime.js';
import {
  recordContextCardChange,
} from './context-cards-runtime.js';
import {
  isContextFilled,
  getContextCardDefs,
} from './context-card-summaries.js';
import {
  applyDotColor as applyContextHealthDotColor,
  applyAISummary as applyContextAISummary,
  disableDemoContextLiveAI,
  enableDemoContextLiveAI,
  getCardFingerprint as getContextCardFingerprint,
  getDemoContextAIMode,
  loadContextHealthDots as loadContextHealthDotsImpl,
  refreshAllHealthDots as refreshAllHealthDotsImpl,
} from './context-card-health-dots.js';
import {
  openContextModal,
  triggerDNAFilePicker,
} from './context-card-dashboard-ai.js';
import {
  isContextEditorStylesheetLoaded,
  runWithContextEditorStylesheet,
} from './context-card-editor-ui.js';
import {
  configureMedicalHistoryEditor,
  openDiagnosesEditor,
} from './context-card-medical-history-editor.js';
import {
  configureLifestyleContextEditors,
  renderDietContaminantsBadge,
  openDietEditor,
  openSleepRestEditor,
  openLightCircadianEditor,
  openExerciseEditor,
  openStressEditor,
  openLoveLifeEditor,
  openEnvironmentEditor,
  openHealthGoalsEditor,
  openInterpretiveLensEditor,
} from './context-card-lifestyle-editors.js';
const contextCardActionDelegateRoots = new WeakSet();
const CONTEXT_CARD_ACTION_ATTR = 'data-context-card-action';
const CONTEXT_CARD_ACTION_SELECTOR = `[${CONTEXT_CARD_ACTION_ATTR}]`;
const contextCardEditorActions = /** @type {Record<string, () => void>} */ ({
  openHealthGoalsEditor,
  openDiagnosesEditor,
  openDietEditor,
  openExerciseEditor,
  openSleepRestEditor,
  openLightCircadianEditor,
  openStressEditor,
  openLoveLifeEditor,
  openEnvironmentEditor,
});
function closeContextCardModal() {
  closeContextCardModalRuntime();
}
function navigateContextCardView(category) {
  navigateContextCardViewRuntime(category);
}
function refreshCurrentContextCardView() {
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'));
  navigateContextCardView(activeNav?.dataset.category || 'dashboard');
}
async function openNutritionModule(surface = '') {
  const module = await import('./nutrition-context.js');
  if (surface === 'timing') {
    return module.openNutritionHistoryModule({ view: 'trends', focus: 'timing' }, navigateContextCardView);
  }
  if (surface === 'meals') {
    return module.openNutritionHistoryModule({ view: 'meals' }, navigateContextCardView);
  }
  return module.openNutritionModule(navigateContextCardView);
}
const contextCardRuntimeDeps = {
  openEMFAssessmentEditor,
};

export function configureContextCardRuntimeDeps(deps = {}) {
  const previous = { ...contextCardRuntimeDeps };
  if (typeof deps.openEMFAssessmentEditor === 'function') {
    contextCardRuntimeDeps.openEMFAssessmentEditor = deps.openEMFAssessmentEditor;
  }
  return previous;
}

function contextCardActionAttrs(action, attrs = {}) {
  let html = `${CONTEXT_CARD_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-context-card-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestContextCardAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(CONTEXT_CARD_ACTION_SELECTOR)
      : null
  );
}

async function enableLiveAIForDemo() {
  const mode = getDemoContextAIMode();
  if (mode.mode !== 'paid-off' || !mode.provider) return;
  const profileId = state.currentProfile;
  const accepted = await showConfirmDialog(
    `Enable live AI for this demo using ${mode.providerLabel} (${mode.modelLabel})? Context edits and manual refreshes may use paid tokens.`,
    {
      confirmLabel: 'Enable live AI',
      cancelLabel: 'Keep precomputed',
      tone: 'primary',
      ariaLabel: 'Enable paid AI for demo profile',
    },
  );
  if (!accepted) return;
  const currentMode = getDemoContextAIMode();
  if (
    state.currentProfile !== profileId
    || currentMode.mode !== 'paid-off'
    || currentMode.provider !== mode.provider
    || currentMode.modelId !== mode.modelId
  ) {
    showNotification('AI provider or demo profile changed. Please review the choice again.', 'info');
    return;
  }
  enableDemoContextLiveAI();
  refreshCurrentContextCardView();
  showNotification('Live AI enabled for this demo profile', 'success');
}

function disableLiveAIForDemo() {
  disableDemoContextLiveAI();
  refreshCurrentContextCardView();
  showNotification('Live AI disabled. Demo insights will stay precomputed.', 'info');
}

function handleContextCardClick(event) {
  const actionEl = closestContextCardAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(CONTEXT_CARD_ACTION_ATTR);
  if (action === 'refresh-all-health-dots') {
    refreshAllHealthDots();
  } else if (action === 'enable-demo-live-ai') {
    void enableLiveAIForDemo();
  } else if (action === 'disable-demo-live-ai') {
    disableLiveAIForDemo();
  } else if (action === 'open-editor') {
    const editor = actionEl.dataset.contextCardEditor || '';
    const runEditor = contextCardEditorActions[editor];
    if (!runEditor) return;
    runEditor();
  } else if (action === 'toggle-explanation') {
    const explanationId = actionEl.dataset.contextCardExplanation || '';
    const explanation = explanationId ? document.getElementById(explanationId) : null;
    if (!explanation) return;
    const expanded = actionEl.getAttribute('aria-expanded') === 'true';
    actionEl.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    explanation.hidden = expanded;
  } else if (action === 'open-emf-assessment') {
    const returnToEnvironment = actionEl.dataset.contextCardCloseModal === 'true';
    const openAssessment = () => {
      void contextCardRuntimeDeps.openEMFAssessmentEditor(returnToEnvironment ? {
        returnLabel: 'Back to Environment & Exposures',
        onReturn: openEnvironmentEditor,
      } : {});
    };
    if (returnToEnvironment) {
      closeContextCardModal();
      setTimeout(openAssessment, 100);
    } else {
      openAssessment();
    }
  } else if (action === 'open-nutrition') {
    void openNutritionModule(actionEl.dataset.contextCardSurface || '');
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function handleContextCardInput(event) {
  const actionEl = closestContextCardAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(CONTEXT_CARD_ACTION_ATTR) === 'context-notes-input') {
    debounceContextNotes();
  }
}

export function installContextCardActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || contextCardActionDelegateRoots.has(root)) return;
  contextCardActionDelegateRoots.add(root);
  root.addEventListener('click', handleContextCardClick);
  root.addEventListener('input', handleContextCardInput);
}

if (typeof document !== 'undefined') installContextCardActionDelegates();

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
  configureDashboardAIDataProtectionDeps,
  openDataProtectionPicker,
  openContextModal,
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

let contextCardRenderSequence = 0;

export function renderProfileContextCards() {
  contextCardRenderSequence += 1;
  const renderId = `ctx-${contextCardRenderSequence}`;
  const sectionTitleId = `${renderId}-section-title`;
  const cardDefs = getContextCardDefs();
  const addedCount = cardDefs.filter(c => isContextFilled(c.key)).length;
  const _ccData = getActiveData();
  const _ccHasLabs = _ccData.dates.length > 0 || Object.values(_ccData.categories).some(c => c.singleDate);
  const _ccMissingDemo = (!state.profileSex || !state.profileDob);
  let _ccSubtitle = _ccHasLabs
    ? 'Add only what is relevant. These details help interpretations reflect your goals, history, and daily life.'
    : 'Add only what is relevant, then use Chat to plan which labs may be useful for you.';
  if (_ccMissingDemo) _ccSubtitle += ' Age and sex in Settings also shape interpretation.';
  const _demoAIMode = getDemoContextAIMode();
  const _refreshBtn = hasAssistantFeatureProvider() && (!_demoAIMode.demo || _demoAIMode.live) ? `<button type="button" class="ctx-refresh-all-btn" ${contextCardActionAttrs('refresh-all-health-dots')} aria-label="Refresh AI context insights"><span class="ctx-refresh-all-icon" aria-hidden="true">&#x21bb;</span><span class="ctx-refresh-all-label">Refresh insights</span></button>` : '';
  let html = `<section class="profile-context-section" aria-labelledby="${sectionTitleId}">
    <div class="context-section-header">
      <div class="context-section-intro">
        <div class="context-section-title" id="${sectionTitleId}">Your health context</div>
        <div class="context-section-subtitle">${escapeHTML(_ccSubtitle)}</div>
      </div>
      <div class="context-section-tools">
        <span class="context-progress-text" aria-label="${addedCount} of ${cardDefs.length} context areas added">${addedCount} of ${cardDefs.length} added</span>
        ${_refreshBtn}
      </div>
    </div>`;
  if (_demoAIMode.demo) {
    if (_demoAIMode.mode === 'local-live') {
      html += `<div class="demo-context-ai-bar demo-context-ai-local" role="group" aria-label="Demo AI status"><div class="demo-context-ai-copy"><span class="demo-context-ai-title">Local AI active</span>Edited cards update automatically with ${escapeHTML(_demoAIMode.modelLabel)}. No paid-provider token charges.</div></div>`;
    } else if (_demoAIMode.mode === 'paid-live') {
      html += `<div class="demo-context-ai-bar demo-context-ai-paid-live" role="group" aria-label="Demo AI status"><div class="demo-context-ai-copy"><span class="demo-context-ai-title">Live AI enabled</span>${escapeHTML(_demoAIMode.providerLabel)} · ${escapeHTML(_demoAIMode.modelLabel)}. Context edits may use paid tokens.</div><button type="button" class="demo-context-ai-action" ${contextCardActionAttrs('disable-demo-live-ai')}>Turn off</button></div>`;
    } else if (_demoAIMode.mode === 'paid-off') {
      html += `<div class="demo-context-ai-bar demo-context-ai-paid-off" role="group" aria-label="Demo AI status"><div class="demo-context-ai-copy"><span class="demo-context-ai-title">Precomputed demo insights</span>Live AI is off to prevent unexpected ${escapeHTML(_demoAIMode.providerLabel)} charges.</div><button type="button" class="demo-context-ai-action" ${contextCardActionAttrs('enable-demo-live-ai')}>Enable live AI</button></div>`;
    } else if (_demoAIMode.mode === 'paused') {
      html += `<div class="demo-context-ai-bar demo-context-ai-precomputed" role="group" aria-label="Demo AI status"><div class="demo-context-ai-copy"><span class="demo-context-ai-title">Precomputed demo insights</span>AI is paused. Browsing and editing use no inference.</div></div>`;
    } else {
      html += `<div class="demo-context-ai-bar demo-context-ai-precomputed" role="group" aria-label="Demo AI status"><div class="demo-context-ai-copy"><span class="demo-context-ai-title">Precomputed demo insights</span>Browsing and editing use no AI inference. Connect a provider to recalculate changed cards.</div></div>`;
    }
  }
  html += `<div class="profile-context-cards">`;
  for (const c of cardDefs) {
    const filled = isContextFilled(c.key);
    const summary = c.summaryFn();
    const explanationId = `${renderId}-explanation-${c.key}`;
    html += `<article class="context-card${filled ? ' context-card-added' : ' context-card-empty'}" data-context-card-key="${escapeAttr(c.key)}">
      <button type="button" class="context-card-open" aria-label="${filled ? 'Edit' : 'Add'} ${escapeHTML(c.label)}" ${contextCardActionAttrs('open-editor', { editor: c.editor })}></button>
      <div class="context-card-header">
        <span class="context-card-icon" aria-hidden="true">${c.icon}</span>
        <span class="context-card-title">
          <span class="context-card-label">${escapeHTML(c.label)}</span>
          <span class="ctx-health-indicator" id="ctx-health-${c.key}" hidden><span class="ctx-health-dot ctx-health-dot-gray" id="ctx-dot-${c.key}"></span><span class="ctx-health-label" id="ctx-health-label-${c.key}">Not assessed</span></span>
        </span>
        <span class="context-card-tips-host" id="ctx-tips-${c.key}"></span>
        <button type="button" class="context-info-icon" aria-label="Why ${escapeHTML(c.label)} matters" aria-expanded="false" aria-controls="${explanationId}" ${contextCardActionAttrs('toggle-explanation', { explanation: explanationId })}>i</button>
      </div>
      ${summary
        ? `<div class="context-card-body" id="ctx-summary-${c.key}" data-summary-source="local" data-local-summary="${escapeAttr(summary)}">${escapeHTML(summary)}</div>`
        : `<div class="context-card-placeholder">${escapeHTML(c.placeholder)}</div>`}
      <div class="context-card-explanation" id="${explanationId}" hidden>${escapeHTML(c.tooltip)}</div>
      ${c.key === 'diet' ? renderDietContaminantsBadge() : ''}
      ${c.key === 'diet' ? renderNutritionDietExtension(contextCardActionAttrs) : ''}
      ${c.key === 'lightCircadian' ? renderNutritionCircadianExtension(contextCardActionAttrs) : ''}
      <div class="ctx-ai-summary-slot"><div class="ctx-ai-summary" id="ctx-ai-${c.key}"></div></div>
    </article>`;
  }
  html += `</div>`;
  // Additional Notes textarea
  const notes = state.importedData.contextNotes || '';
  html += `<div class="ctx-notes-section">
    <div class="ctx-notes-head"><label class="ctx-notes-label" for="ctx-notes-textarea">Additional context</label><span class="ctx-notes-status" id="ctx-notes-status" role="status" aria-live="polite">Saved as you type</span></div>
    <div class="ctx-notes-hint" id="ctx-notes-hint">Anything else that may affect your labs or health patterns.</div>
    <textarea class="ctx-notes-textarea" id="ctx-notes-textarea" aria-describedby="ctx-notes-hint" placeholder="For example: shift work, a recent illness, or an upcoming treatment change" ${contextCardActionAttrs('context-notes-input')}>${escapeHTML(notes)}</textarea>
  </div>`;
  return html + `</section>`;
}

let _ctxNotesTimer = null;
function setContextNotesStatus(text) {
  const status = document.getElementById('ctx-notes-status');
  if (status) status.textContent = text;
}
export function debounceContextNotes() {
  clearTimeout(_ctxNotesTimer);
  setContextNotesStatus('Saving\u2026');
  _ctxNotesTimer = setTimeout(() => {
    const ta = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('ctx-notes-textarea'));
    if (ta) {
      state.importedData.contextNotes = ta.value;
      recordChange('contextNotes');
      saveImportedData();
      setContextNotesStatus('Saved');
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
  recordContextCardChange(field);
}

export function saveAndRefresh(msg, field) {
  if (field) recordChange(field);
  saveImportedData();
  // Preserve details open state across the re-render below
  const details = /** @type {HTMLDetailsElement | null} */ (document.querySelector('.welcome-context-details'));
  if (details?.open) sessionStorage.setItem('welcome-details-open', '1');
  closeContextCardModal();
  showNotification(msg, 'success');
  notifyContextCardSavedRuntime();
  // Re-render the current view so the saved values appear on the card
  // immediately. BroadcastChannel notifies other tabs but never delivers
  // back to the sender, so a single-tab user would otherwise see no UI
  // update until a reload or navigation. Mirrors the BroadcastChannel
  // handler in crypto.js:initBroadcastChannel. See #123.
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'));
  navigateContextCardView(activeNav?.dataset.category || 'dashboard');
  // Refresh health dots for the saved card (fingerprint will have changed).
  // Must run after navigate() so the ctx-dot-* elements exist in the new DOM.
  loadContextHealthDots();
}

configureMedicalHistoryEditor({
  close: closeContextCardModal,
  recordChange,
  saveAndRefresh,
});
configureLifestyleContextEditors({ recordChange, saveAndRefresh });

// ── Card tips badges (async — waits for catalog) ──
export async function loadContextCardTips() {
  const isProductRecsEnabled = getRecommendationModuleFunction('isProductRecsEnabled');
  const loadCatalog = getRecommendationModuleFunction('loadCatalog');
  const getCardSlotKeys = getRecommendationModuleFunction('getCardSlotKeys');
  if (!isProductRecsEnabled?.() || !loadCatalog || !getCardSlotKeys) return;
  await loadCatalog();
  const cardKeys = ['sleepRest', 'lightCircadian', 'environment', 'exercise', 'diet', 'stress'];
  for (const key of cardKeys) {
    const el = document.getElementById(`ctx-tips-${key}`);
    if (!el || el.children.length > 0) continue;
    if (getCardSlotKeys(key).length === 0) continue;
    const badge = document.createElement('span');
    badge.className = 'ctx-tips-badge';
    badge.textContent = 'Tips';
    badge.title = 'Lifestyle tips for this area';
    badge.onclick = (e) => { e.stopPropagation(); openCardTipsModal(key); };
    el.appendChild(badge);
  }
}

// ── Card tips modal ──
export function openCardTipsModal(cardKey) {
  if (!isContextEditorStylesheetLoaded()) {
    return runWithContextEditorStylesheet(() => openCardTipsModal(cardKey));
  }
  const renderCardTipsModal = getRecommendationModuleFunction('renderCardTipsModal');
  if (!renderCardTipsModal) return;
  const html = renderCardTipsModal(cardKey);
  if (!html) return;
  // Reuse the detail modal overlay
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('detail-modal');
  if (!overlay || !modal) return;
  modal.innerHTML = html;
  openModalOverlay(overlay);
}

configureContextCardsRuntimeCallbacks({
  openContextModal,
  openInterpretiveLensEditor,
  recordChange,
  triggerDNAFilePicker,
});
