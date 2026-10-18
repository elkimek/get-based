import { contextCardStatusTicket, publishContextCardStatus } from './context-card-status.js';
import { ensureContextCardStatus } from './context-card-status-view.js';
import { ensureContextNotes } from './context-notes-view.js';
import { contextNotesPresentation } from './context-notes-session.js';
export { debounceContextNotes } from './context-notes-view.js';
import { configureRuntimeFunctions } from './runtime-callbacks.js';
import { renderHTML as renderContextCatalogHTML } from './components/ContextCardCatalog.svelte.html.js';
import { projectContextDemoBar } from './context-card-catalog-presentation.js';
// context-cards.js - dashboard context card module surface and shared lifecycle

import { state } from './state.js';
import { showConfirmDialog, showNotification } from './utils.js';
import { saveImportedData, getActiveData } from './data.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import { projectNutritionCircadianExtension, projectNutritionDietExtension } from './nutrition-context-card-extensions.js';
import {projectDietContaminantsBadge} from './context-food-contaminants-badge.js';
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
  prepareContextHealthPresentation,
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
interface ContextCardDelegateRoot {
  addEventListener(type: string, listener: (event: Event) => void): unknown;
}
interface ContextCardTarget { closest?: unknown }
interface ContextCardEventRoot { contains?: ((element: HTMLElement) => unknown) | undefined }

const contextCardActionDelegateRoots = new WeakSet<ContextCardDelegateRoot>();
const CONTEXT_CARD_ACTION_ATTR = 'data-context-card-action';
const CONTEXT_CARD_ACTION_SELECTOR = `[${CONTEXT_CARD_ACTION_ATTR}]`;
const contextCardEditorActions: Record<string, (() => unknown) | undefined> = ({
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
function navigateContextCardView(category: Parameters<typeof navigateContextCardViewRuntime>[0]) {
  return navigateContextCardViewRuntime(category);
}
function refreshCurrentContextCardView() {
  const activeNav = (document.querySelector<HTMLElement>('.nav-item.active'));
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
const contextCardRuntimeDeps: { openEMFAssessmentEditor: unknown } = {
  openEMFAssessmentEditor,
};

export function configureContextCardRuntimeDeps(deps: unknown = {}) {
  return (configureRuntimeFunctions as (current: typeof contextCardRuntimeDeps, updates: unknown, fields: readonly (keyof typeof contextCardRuntimeDeps)[]) => typeof contextCardRuntimeDeps)(contextCardRuntimeDeps, deps, ["openEMFAssessmentEditor"]);
}

/** The nutrition child receives delegated data rather than prepared markup. */
function contextNutritionActionAttributes(action: 'open-nutrition', options: {surface: 'meals' | 'timing'}) {
  return {'data-context-card-action': String(action), 'data-context-card-surface': String(options.surface)};
}

function closestContextCardAction(target: ContextCardTarget | null | undefined) {
  return (
    target && typeof target.closest === 'function'
      ? (target.closest as (selector: string) => unknown)(CONTEXT_CARD_ACTION_SELECTOR)
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

function handleContextCardClick(event: Event) {
  const actionEl = closestContextCardAction(event.target as ContextCardTarget | null) as HTMLElement | null;
  if (!actionEl || !(event.currentTarget as ContextCardEventRoot | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(CONTEXT_CARD_ACTION_ATTR);
  if (action === 'refresh-all-health-dots') {
    refreshAllHealthDots();
  } else if (action === 'enable-demo-live-ai') {
    void enableLiveAIForDemo();
  } else if (action === 'disable-demo-live-ai') {
    disableLiveAIForDemo();
  } else if (action === 'open-card-tips') {
    if (actionEl.dataset.contextStatusTicket !== contextCardStatusTicket()) return;
    void openCardTipsModal(actionEl.dataset.contextCardKey || '', actionEl.dataset.contextStatusTicket, actionEl);
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
      void (contextCardRuntimeDeps.openEMFAssessmentEditor as (...args: Parameters<typeof openEMFAssessmentEditor>) => unknown)(returnToEnvironment ? {
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

export function installContextCardActionDelegates(root: ContextCardDelegateRoot | null = typeof document !== 'undefined' ? document : null) {
  if (!root || contextCardActionDelegateRoots.has(root)) return;
  contextCardActionDelegateRoots.add(root);
  root.addEventListener('click', handleContextCardClick);
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

export function projectProfileContextCards({ embedded = false }: { embedded?: unknown } = {}) {
  contextCardRenderSequence += 1;
  const renderId = `ctx-${contextCardRenderSequence}`;
  const notes = contextNotesPresentation();
  const cardDefs = getContextCardDefs();
  const _ccData = getActiveData();
  const _ccHasLabs = _ccData.dates.length > 0 || Object.values(_ccData.categories).some(c => c.singleDate);
  const _ccMissingDemo = (!state.profileSex || !state.profileDob);
  let _ccSubtitle = _ccHasLabs
    ? 'Add only what is relevant. These details help interpretations reflect your goals, history, and daily life.'
    : 'Add only what is relevant, then use Chat to plan which labs may be useful for you.';
  if (_ccMissingDemo) _ccSubtitle += ' Age and sex in Settings also shape interpretation.';
  const _demoAIMode = getDemoContextAIMode();
  const cards = cardDefs.map(({ summaryFn, ...card }) => ({ ...card, filled: isContextFilled(card.key), summary: summaryFn(),
    contaminants: card.key === 'diet' ? projectDietContaminantsBadge() : null,
    nutrition: card.key === 'diet' ? projectNutritionDietExtension(contextNutritionActionAttributes)
      : card.key === 'lightCircadian' ? projectNutritionCircadianExtension(contextNutritionActionAttributes) : null,
  }));
  prepareContextHealthPresentation();
  const statusTicket = contextCardStatusTicket();
  queueMicrotask(() => { ensureContextNotes(); ensureContextCardStatus(); });
  return {
    renderId, statusTicket, embedded: Boolean(embedded), subtitle: _ccSubtitle, cards, addedCount: cards.filter(card => card.filled).length,
    refresh: hasAssistantFeatureProvider() && (!_demoAIMode.demo || _demoAIMode.live),
    demo: projectContextDemoBar(_demoAIMode), notes: notes.notes, notesTicket: notes.ticket, notesStatus: notes.status, notesSaved: notes.saved,
  };
}


export function renderProfileContextCards(options: {embedded?: unknown} = {}) {
  return renderContextCatalogHTML({view: projectProfileContextCards(options)});
}

// ── AI Health Status Dots ──

export function applyDotColor(key: Parameters<typeof applyContextHealthDotColor>[0], color: Parameters<typeof applyContextHealthDotColor>[1]) {
  ensureContextCardStatus();
  applyContextHealthDotColor(key, color);
}

export function applyAISummary(key: Parameters<typeof applyContextAISummary>[0], text: Parameters<typeof applyContextAISummary>[1], color: Parameters<typeof applyContextAISummary>[2]) {
  ensureContextCardStatus();
  applyContextAISummary(key, text, color);
}

export function getCardFingerprint(key: Parameters<typeof getContextCardFingerprint>[0], ctx?: Parameters<typeof getContextCardFingerprint>[1]) {
  return getContextCardFingerprint(key, ctx);
}

export async function loadContextHealthDots() {
  return loadContextHealthDotsImpl();
}

export function refreshAllHealthDots() {
  return refreshAllHealthDotsImpl();
}

// ── Change History ──

export function recordChange(field: Parameters<typeof recordContextCardChange>[0]) {
  recordContextCardChange(field);
}

export function saveAndRefresh(msg: string, field?: string) {
  if (field) recordChange(field);
  saveImportedData();
  refreshAfterContextCommit(msg);
}

function refreshAfterContextCommit(msg: string) {
  // Preserve details open state across the re-render below
  const details = (document.querySelector<HTMLDetailsElement>('.welcome-context-details'));
  if (details?.open) sessionStorage.setItem('welcome-details-open', '1');
  closeContextCardModal();
  showNotification(msg, 'success');
  notifyContextCardSavedRuntime();
  // Re-render the current view so the saved values appear on the card
  // immediately. BroadcastChannel notifies other tabs but never delivers
  // back to the sender, so a single-tab user would otherwise see no UI
  // update until a reload or navigation. Mirrors the BroadcastChannel
  // handler in crypto.js:initBroadcastChannel. See #123.
  const activeNav = (document.querySelector<HTMLElement>('.nav-item.active'));
  navigateContextCardView(activeNav?.dataset.category || 'dashboard');
  // Refresh health dots for the saved card (fingerprint will have changed).
  // Must run after navigate() so the ctx-dot-* elements exist in the new DOM.
  loadContextHealthDots();
}

configureMedicalHistoryEditor({
  close: closeContextCardModal,
  recordChange,
  saveAndRefresh,
  afterCommit: refreshAfterContextCommit,
});
configureLifestyleContextEditors({ recordChange, saveAndRefresh, afterCommit: refreshAfterContextCommit });

// ── Card tips badges (async — waits for catalog) ──
export async function loadContextCardTips() {
  const isProductRecsEnabled = getRecommendationModuleFunction('isProductRecsEnabled');
  const loadCatalog = getRecommendationModuleFunction('loadCatalog');
  const getCardSlotKeys = getRecommendationModuleFunction('getCardSlotKeys');
  const cardKeys = ['sleepRest', 'lightCircadian', 'environment', 'exercise', 'diet', 'stress'];
  if (!isProductRecsEnabled?.() || !loadCatalog || !getCardSlotKeys) {
    ensureContextCardStatus();
    for (const key of cardKeys) publishContextCardStatus(key, { tips: false });
    return;
  }
  const ticket = contextCardStatusTicket();
  try { await loadCatalog(); } catch { return; }
  if (ticket !== contextCardStatusTicket() || !isProductRecsEnabled()
    || isProductRecsEnabled !== getRecommendationModuleFunction('isProductRecsEnabled')
    || loadCatalog !== getRecommendationModuleFunction('loadCatalog')
    || getCardSlotKeys !== getRecommendationModuleFunction('getCardSlotKeys')) return;
  ensureContextCardStatus();
  for (const key of cardKeys) publishContextCardStatus(key, { tips: getCardSlotKeys(key).length > 0 }, ticket);
}

// ── Card tips modal ──
export function openCardTipsModal(cardKey: string, ticket = contextCardStatusTicket(), owner?: HTMLElement): void | Promise<unknown> | boolean {
  if (ticket !== contextCardStatusTicket() || (owner && (!owner.isConnected
    || owner.dataset.contextStatusTicket !== ticket || !getRecommendationModuleFunction('isProductRecsEnabled')?.()))) return;
  if (!isContextEditorStylesheetLoaded()) {
    return runWithContextEditorStylesheet(() => openCardTipsModal(cardKey, ticket, owner));
  }
  const renderCardTipsModal = getRecommendationModuleFunction('renderCardTipsModal');
  if (!renderCardTipsModal) return;
  const html = renderCardTipsModal(cardKey);
  if (!html) return;
  // Reuse the detail modal overlay
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('detail-modal');
  if (!overlay || !modal) return;
  modal.className = 'modal';
  modal.innerHTML = html;
  modal.removeAttribute('aria-labelledby');
  modal.setAttribute('aria-label', modal.querySelector('[data-context-tips-view] h2')?.textContent?.trim() || 'Context tips');
  openModalOverlay(overlay);
}

configureContextCardsRuntimeCallbacks({
  openContextModal,
  openInterpretiveLensEditor,
  recordChange,
  triggerDNAFilePicker,
});
