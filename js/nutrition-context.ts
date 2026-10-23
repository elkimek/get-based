import { routeRevision } from './route-lifecycle.js';
import { createRetryingStylesheetLoader, findStylesheet } from './retrying-module-loader.js';
// nutrition-context.js — compact summary-only context for chat and source controls.

import { state } from './state.js';
import { showNotification } from './utils.js';
import * as widgets from './nutrition-widget-runtime.js';
export { hydrateNutritionSummary } from './nutrition-summary-runtime.js';
export { registerNutritionEditorDelegates } from './nutrition-widget-runtime.js';
import { getNutritionContextDays, isNutritionContextEnabled } from './lab-context-settings.js';

export { isNutritionContextEnabled, setNutritionContextEnabled } from './lab-context-settings.js';
export { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';

// Consumed property view; raw inputs and truthy context leaves remain opaque.
export interface NutritionContextInput {
  nutritionSummary?: {contextByDays?: Record<string, unknown> | null} | null;
  importedData?: Parameters<typeof getNutritionContextDays>[0];
}

export function buildNutritionContext(importedData: unknown = state, { ignoreContextToggles = false }: {ignoreContextToggles?: unknown} = {}): unknown {
  if (!ignoreContextToggles && !isNutritionContextEnabled()) return '';
  const summary = (importedData as NutritionContextInput | null | undefined)?.nutritionSummary;
  const profileData = importedData === state ? state.importedData : (importedData as NutritionContextInput | null | undefined)?.importedData;
  return summary?.contextByDays?.[`d${getNutritionContextDays(profileData || state.importedData)}`] || '';
}

export function nutritionHistoryRequestFromQuery(queryText: unknown = '') {
  const match = String(queryText).match(/^Nutrition history range:\s*(30D|3M|6M|1Y|All)\s*\(([^\n)]+)\)\.\s*$/mi);
  return match ? { label: match[1]!, description: match[2]!.trim() } : null;
}

export function buildNutritionHistoryReceiptContext(queryText: unknown = '') {
  const request = nutritionHistoryRequestFromQuery(queryText);
  if (!request) return '';
  return `[section:nutritionHistory]\n## Meals & Nutrition — ${request.label} one-off history\nOne-off aggregate is in the editable user message; automatic nutrition summary is omitted. Individual meals, names, notes, ingredients, and photos are not included.\n[/section:nutritionHistory]\n\n`;
}

const STYLESHEET_URL = new URL('../css/nutrition.css', import.meta.url).href;
const stylesheetPromiseCache = createRetryingStylesheetLoader({
  existing: existingStylesheet,
  createLink: (retry, existing) => {
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = retry ? `${STYLESHEET_URL}?lazy-retry=1` : STYLESHEET_URL;
    link.dataset.nutritionStylesheet = '';
    return link;
  },
  insertLink: link => {
    if (!link.isConnected) {
      const anchor = document.querySelector('[data-nutrition-stylesheet-anchor]');
      (anchor?.parentNode || document.head).insertBefore(link, anchor || null);
    }
  },
  requireDocument: "Nutrition stylesheet requires a document.",
  failedLoad: "Nutrition presentation could not be loaded.",
});
let modulePromise: Promise<typeof import('./nutrition.js')> | null = null;
let moduleValue: typeof import('./nutrition.js') | null = null;
let widgetsReady = false;
let retryModule = false;

function existingStylesheet() {
  return findStylesheet("link[data-nutrition-stylesheet]", "/css/nutrition.css");
}

export function isNutritionStylesheetLoaded() {
  return stylesheetPromiseCache.loaded || !!existingStylesheet()?.sheet;
}

export function loadNutritionStylesheet() {
  return stylesheetPromiseCache.load();
}

export function loadNutritionModule() {
  if (!modulePromise) {
    const load = retryModule ? import('./nutrition.js?lazy-retry=1' as './nutrition.js') : import('./nutrition.js');
    modulePromise = load.then(module => {
      moduleValue = module;
      return module;
    }).catch(error => {
      modulePromise = null;
      moduleValue = null;
      retryModule = true;
      throw error;
    });
  }
  return modulePromise;
}

export async function loadNutritionFeature() {
  const [module] = await Promise.all([loadNutritionModule(), loadNutritionStylesheet()]);
  widgetsReady = true;
  return module;
}

export function isNutritionFeatureReady() {
  return moduleValue !== null && isNutritionStylesheetLoaded();
}

/** Prepare synchronous summaries and controls without loading editing tools. */
export async function loadNutritionWidgetFeature() {
  await loadNutritionStylesheet();
  widgetsReady = true;
  return widgets;
}
export function isNutritionWidgetFeatureReady() {
  return widgetsReady && isNutritionStylesheetLoaded();
}
export function renderNutritionWidget() {
  return widgetsReady ? widgets.renderNutritionWidget() : '';
}
export function renderFuelWidget() {
  return widgetsReady ? widgets.renderNutritionFuelWidget() : '';
}
export function projectNutritionWidget() {
  return widgetsReady ? widgets.projectNutritionWidget() : null;
}
export function projectFuelWidget() {
  return widgetsReady ? widgets.projectNutritionFuelWidget() : null;
}

let coldActionRequest = 0;
let pendingColdAction = false;

interface ColdActionFeedback {
  ticket: number; button: HTMLElement; busy: string | null;
  status: HTMLElement | null; previousStatus: string; message: string; isCurrent: () => boolean;
}
let coldActionFeedback: ColdActionFeedback | null = null;

function releaseColdActionFeedback(ticket?: number) {
  const owned = coldActionFeedback;
  if (!owned || (ticket !== undefined && owned.ticket !== ticket)) return;
  coldActionFeedback = null;
  if (owned.button.getAttribute('aria-busy') === 'true') {
    if (owned.busy === null) owned.button.removeAttribute('aria-busy');
    else owned.button.setAttribute('aria-busy', owned.busy);
  }
  if (owned.status?.textContent === owned.message) owned.status.textContent = owned.previousStatus;
}

function showColdActionFeedback(ticket: number, button: HTMLElement, root: HTMLElement, action: string, isCurrent: () => boolean) {
  const status = root.querySelector<HTMLElement>('[data-nutrition-loading-status]');
  if (!status) return;
  const message = action === 'open-history' ? 'Opening meal history…'
    : action === 'open-targets' ? 'Opening Nutrition setup…'
    : action === 'open-fluid-log' ? 'Opening the drink logger…' : 'Opening the meal editor…';
  coldActionFeedback = {ticket, button, busy: button.getAttribute('aria-busy'), status, previousStatus: status?.textContent || '', message, isCurrent};
  button.setAttribute('aria-busy', 'true');
  if (status) status.textContent = message;
}

function handleColdWidgetAction(event: Event) {
  if (widgets.areNutritionEditorDelegatesRegistered()) return;
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-nutrition-action]') : null;
  const root = target?.closest<HTMLElement>('[data-nutrition-dashboard-view]');
  if (!target || !root?.isConnected) return;
  const action = target.getAttribute('data-nutrition-action');
  if (!['open', 'open-history', 'open-targets', 'open-fluid-log'].includes(action || '')) return;
  event.preventDefault(); event.stopPropagation();
  // Mouse activation need not focus buttons on Cocoa. Own the actual action
  // before capturing its asynchronous focus boundary, without scrolling it.
  target.focus({preventScroll: true});
  releaseColdActionFeedback();
  const ticket = ++coldActionRequest, profile = state.currentProfile, data = state.importedData;
  const revision = routeRevision(), route = state.currentView, main = document.getElementById('main-content');
  const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
  const content = modal?.firstElementChild, shown = overlay?.classList.contains('show'), focus = document.activeElement;
  const sourceCurrent = () => ticket === coldActionRequest && target.isConnected && root.isConnected && root.contains(target)
    && target.getAttribute('data-nutrition-action') === action && (!main || main.contains(root))
    && state.currentProfile === profile && state.importedData === data && routeRevision() === revision && state.currentView === route
    && document.getElementById('main-content') === main && (document.activeElement === focus || !!modal?.contains(document.activeElement));
  const current = () => sourceCurrent() && document.getElementById('detail-modal') === modal
    && document.getElementById('modal-overlay') === overlay && modal?.firstElementChild === content
    && overlay?.classList.contains('show') === shown && document.activeElement === focus;
  pendingColdAction = true;
  showColdActionFeedback(ticket, target, root, action!, current);
  let dispatched = false;
  void loadNutritionFeature().then(module => {
    if (!current()) return;
    dispatched = true;
    if (action === 'open') return module.openNutritionEditor({}, sourceCurrent);
    if (action === 'open-history') return module.openNutritionHistory(undefined, {}, sourceCurrent);
    if (action === 'open-targets') return module.openNutritionTargets({}, sourceCurrent);
    return module.openFluidLog(sourceCurrent);
  }).catch(error => {
    if (dispatched) {
      if (!sourceCurrent() || document.getElementById('detail-modal') !== modal || document.getElementById('modal-overlay') !== overlay) return;
    } else if (!current()) return;
    console.error('Meals & Nutrition could not be loaded', error);
    showNotification('Meals & Nutrition could not be loaded. Try again.', 'error');
  }).finally(() => {
    releaseColdActionFeedback(ticket);
    if (ticket === coldActionRequest) pendingColdAction = false;
  });
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', handleColdWidgetAction);
  document.addEventListener('keydown', event => {
    if (pendingColdAction && event.key === 'Escape') {
      const owned = coldActionFeedback;
      // Consume only this focused live control's cancellation. Retired requests
      // and newer dialogs keep their own Escape/default keyboard behavior.
      if (owned?.isCurrent() && owned.button === document.activeElement
        && owned.button.getAttribute('aria-busy') === 'true') event.preventDefault();
      ++coldActionRequest; pendingColdAction = false;
      releaseColdActionFeedback();
    }
  });
}

export async function openNutritionModule(navigate: unknown = null) {
  const profile = state.currentProfile, data = state.importedData, route = state.currentView;
  const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
  const content = modal?.firstElementChild, main = document.getElementById('main-content');
  let revision = routeRevision();
  const current = () => state.currentProfile === profile && state.importedData === data && routeRevision() === revision
    && document.getElementById('detail-modal') === modal && document.getElementById('modal-overlay') === overlay
    && modal?.firstElementChild === content;
  try {
    const module = await loadNutritionFeature();
    if (!current() || state.currentView !== route || document.getElementById('main-content') !== main) return false;
    if (typeof navigate === 'function') {
      const navigation = (navigate as (category: string) => unknown)('nutrition');
      revision = routeRevision();
      await navigation;
      if (!current() || state.currentView !== 'nutrition') return false;
    }
    if (!current()) return false;
    const mountedMain = document.getElementById('main-content');
    setTimeout(() => { if (current() && document.getElementById('main-content') === mountedMain) void module.openNutritionEditor(); }, 0);
    return true;
  } catch (error) {
    if (!current()) return false;
    console.error('Meals & Nutrition could not be loaded', error);
    showNotification('Meals & Nutrition could not be loaded. Try again.', 'error');
    return false;
  }
}

export async function openNutritionHistoryModule({ view = 'meals', focus = '' }: {view?: unknown; focus?: unknown} = {}, navigate: unknown = null) {
  const profile = state.currentProfile, data = state.importedData, route = state.currentView;
  let revision = routeRevision();
  const current = () => state.currentProfile === profile && state.importedData === data && routeRevision() === revision;
  try {
    const module = await loadNutritionFeature();
    if (!current() || state.currentView !== route) return false;
    if (typeof navigate === 'function') {
      const navigation = (navigate as (category: string) => unknown)('nutrition');
      revision = routeRevision();
      await navigation;
      if (!current() || state.currentView !== 'nutrition') return false;
    }
    if (!current()) return false;
    return await module.openNutritionHistoryView(view, { focus });
  } catch (error) {
    if (!current()) return false;
    console.error('Meals & Nutrition history could not be loaded', error);
    showNotification('Meals & Nutrition history could not be loaded. Try again.', 'error');
    return false;
  }
}
