// @ts-check
// lens-page-shell.js — shared lens page chrome, ordering, and widget helpers

import { state } from './state.js';
import { getWidgetHeaderDescription } from './dashboard-widget-copy.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { profileStorageKey } from './profile.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

const LENS_PAGE_ORDER_VERSION = 1;

let _shellDeps = {
  addDashboardWidgetFromLens: (_id) => {},
  getAvailableDashboardFixedWidgetIds: () => [],
  getDashboardWidgetPrefs: () => ({ hidden: [] }),
  navigate: (_route) => {},
  openChatPanel: () => {},
  openEMFAssessmentEditor,
  openDashboardBiometricPicker: () => {},
  removeDashboardWidgetFromLens: (_id) => {},
};
let lensPageShellDelegatesInstalled = false;

function lensPageRuntime() {
  return /** @type {Record<string, any>} */ (globalThis);
}

function callLensPageRuntime(name, ...args) {
  const fn = name === 'navigate'
    ? _shellDeps.navigate
    : getSettingsModuleFunction(name)
      || getDnaModuleFunction(name)
      || lensPageRuntime()[name];
  if (typeof fn === 'function') fn(...args);
}

export function configureLensPageShell(deps = {}) {
  const previous = { ..._shellDeps };
  _shellDeps = { ..._shellDeps, ...deps };
  installLensPageShellDelegates();
  return previous;
}

export function lensPageActionAttrs(action, attrs = {}) {
  return [
    `data-lens-page-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-lens-page-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function handleLensPageShellClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-lens-page-action]'));
  if (!actionEl) return;
  if (!actionEl.closest('.lens-page-header, .lens-page-widgets, #recommendations-page, .biology-coherence-hero')) return;
  // .biology-coherence-hero is included because the Biology Scores lens renders the coherence
  // hero as a standalone top-section before the regular lens-page-widgets container, and its
  // dashboard toggle must be handled by the lens page shell.
  event.preventDefault();

  const action = actionEl.dataset.lensPageAction || '';
  const id = actionEl.dataset.lensPageId || '';
  if (action === 'move-widget') {
    moveLensPageWidget(actionEl.dataset.lensPageRoute || '', id, actionEl.dataset.lensPageDirection || 0);
  } else if (action === 'add-dashboard-widget') {
    _shellDeps.addDashboardWidgetFromLens(id);
  } else if (action === 'remove-dashboard-widget') {
    _shellDeps.removeDashboardWidgetFromLens(id);
  } else if (action === 'import-dna') {
    triggerContextCardDNAFilePickerRuntime();
  } else if (action === 'import-snp-report') {
    callLensPageRuntime('importSnpReport');
  } else if (action === 'add-manual-snp') {
    callLensPageRuntime('openManualSnpModal');
  } else if (action === 'reimport-dna') {
    if (getDnaModuleFunction('reimportDNA')) callLensPageRuntime('reimportDNA');
    else triggerContextCardDNAFilePickerRuntime();
  } else if (action === 'delete-dna') {
    callLensPageRuntime('confirmDeleteDNA');
  } else if (action === 'open-wearables-settings') {
    callLensPageRuntime('openSettingsModal', 'wearables');
  } else if (action === 'open-biometric-picker') {
    _shellDeps.openDashboardBiometricPicker();
  } else if (action === 'open-ai-chat') {
    _shellDeps.openChatPanel();
  } else if (action === 'open-emf-assessment') {
    void _shellDeps.openEMFAssessmentEditor();
  } else if (action === 'open-recommendations') {
    callLensPageRuntime('navigate', 'recommendations');
  } else if (action === 'open-privacy-settings') {
    callLensPageRuntime('openSettingsModal', 'privacy');
  }
}

function installLensPageShellDelegates() {
  if (lensPageShellDelegatesInstalled || typeof document === 'undefined') return;
  lensPageShellDelegatesInstalled = true;
  document.addEventListener('click', handleLensPageShellClick);
}

export function renderLensHeader(title, subtitle, actions = '', options = {}) {
  const extraClass = options?.className ? ` ${escapeAttr(String(options.className))}` : '';
  return `<div class="category-header lens-page-header${extraClass}">
    <h2>${escapeHTML(title)}</h2>
    ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
    ${actions ? `<div class="dashboard-widget-inline-controls">${actions}</div>` : ''}
  </div>`;
}

function lensPageOrderStorageKey(route) {
  return profileStorageKey(state.currentProfile || 'default', `lensPageOrder-${route}-v${LENS_PAGE_ORDER_VERSION}`);
}

function getLensPageWidgetOrder(route, defaultIds) {
  try {
    const raw = JSON.parse(localStorage.getItem(lensPageOrderStorageKey(route)) || '[]');
    if (!Array.isArray(raw)) return defaultIds;
    const known = new Set(defaultIds);
    const ordered = raw.filter(id => known.has(id));
    for (const id of defaultIds) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  } catch {
    return defaultIds;
  }
}

function orderLensPageWidgets(route, widgets) {
  const ids = widgets.map(w => w.id);
  const order = getLensPageWidgetOrder(route, ids);
  const byId = new Map(widgets.map(w => [w.id, w]));
  return order.map(id => byId.get(id)).filter(Boolean);
}

function renderLensPageMoveControls(route, id, index, count) {
  if (!route || count < 2) return '';
  return `<button type="button" class="dashboard-widget-tool" ${index <= 0 ? 'disabled' : ''} ${lensPageActionAttrs('move-widget', { route, id, direction: -1 })} aria-label="Move page section up">↑</button>
    <button type="button" class="dashboard-widget-tool" ${index >= count - 1 ? 'disabled' : ''} ${lensPageActionAttrs('move-widget', { route, id, direction: 1 })} aria-label="Move page section down">↓</button>`;
}

export function renderLensPageWidgets(route, widgets) {
  const ordered = orderLensPageWidgets(route, widgets.filter(Boolean));
  return `<div class="dashboard-widgets lens-page-widgets" data-lens-route="${escapeAttr(route)}">
    ${ordered.map((widget, index) => renderLensWidget(
      widget.id,
      widget.title,
      widget.description,
      widget.body,
      widget.size || 'full',
      { ...(widget.opts || {}), pageRoute: route, pageIndex: index, pageCount: ordered.length }
    )).join('')}
  </div>`;
}

export function moveLensPageWidget(route, id, direction) {
  route = String(route || state.currentView || '');
  id = String(id || '');
  const dir = Number(direction);
  if (!route || !id || !Number.isFinite(dir) || dir === 0) return;
  const container = Array.from(/** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.lens-page-widgets[data-lens-route]')))
    .find(el => el.dataset.lensRoute === route);
  const ids = container
    ? Array.from(/** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.dashboard-widget[data-widget-id]'))).map(el => el.dataset.widgetId).filter(Boolean)
    : getLensPageWidgetOrder(route, []);
  const index = ids.indexOf(id);
  const target = index + (dir < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  localStorage.setItem(lensPageOrderStorageKey(route), JSON.stringify(ids));
  if (state.currentView === route) callLensPageRuntime('navigate', route);
}

export function renderLensDashboardToggle(dashboardId) {
  const availableIds = _shellDeps.getAvailableDashboardFixedWidgetIds();
  // Biology Score widgets are generated dynamically from score definitions. In
  // isolated Node/source-inspection tests the dashboard registry is not always
  // configured before the lens renderer runs, so keep the toggle renderable for
  // these declared dynamic widget ids instead of silently dropping it.
  const isDeclaredDynamicBiologyScoreWidget = typeof dashboardId === 'string' && dashboardId.startsWith('biology-score-');
  if (!dashboardId || (!availableIds.includes(dashboardId) && !isDeclaredDynamicBiologyScoreWidget)) return '';
  const prefs = _shellDeps.getDashboardWidgetPrefs();
  const hidden = Array.isArray(prefs?.hidden) ? prefs.hidden : [];
  const isVisible = !hidden.includes(dashboardId);
  const label = isVisible ? 'Remove from Dashboard' : 'Add to Dashboard';
  const action = isVisible ? 'remove-dashboard-widget' : 'add-dashboard-widget';
  return `<button type="button" class="dashboard-widget-tool lens-widget-dashboard-toggle" ${lensPageActionAttrs(action, { id: dashboardId })}>${label}</button>`;
}

export function renderLensWidget(id, title, description, body, size = 'full', opts = {}) {
  const headerDescription = getWidgetHeaderDescription(id, description);
  const dashboardId = Object.prototype.hasOwnProperty.call(opts, 'dashboardId') ? opts.dashboardId : id;
  const dashboardToggle = renderLensDashboardToggle(dashboardId);
  const pageControls = renderLensPageMoveControls(opts.pageRoute || '', id, opts.pageIndex || 0, opts.pageCount || 0);
  const tools = [pageControls, dashboardToggle].filter(Boolean).join('');
  return `<section class="dashboard-widget dashboard-widget-${escapeAttr(size)}${body ? '' : ' is-empty'}" data-widget-id="${escapeAttr(id)}">
    <div class="dashboard-widget-chrome">
      <div class="dashboard-widget-heading">
        <div class="dashboard-widget-title">${escapeHTML(title)}</div>
        ${headerDescription ? `<div class="dashboard-widget-description">${escapeHTML(headerDescription)}</div>` : ''}
      </div>
      ${tools ? `<div class="dashboard-widget-tools">${tools}</div>` : ''}
    </div>
    <div class="dashboard-widget-body">${body || '<div class="dashboard-widget-empty">No data available yet.</div>'}</div>
  </section>`;
}

installLensPageShellDelegates();
