// @ts-check
// lens-page-shell.js — shared lens page chrome, ordering, and widget helpers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { profileStorageKey } from './profile.js';

const LENS_PAGE_ORDER_VERSION = 1;

let _shellDeps = {
  getAvailableDashboardFixedWidgetIds: () => [],
  getDashboardWidgetPrefs: () => ({ hidden: [] }),
};
let lensPageShellDelegatesInstalled = false;

export function configureLensPageShell(deps = {}) {
  _shellDeps = { ..._shellDeps, ...deps };
  installLensPageShellDelegates();
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
  const appWindow = /** @type {any} */ (window);

  const action = actionEl.dataset.lensPageAction || '';
  const id = actionEl.dataset.lensPageId || '';
  if (action === 'move-widget') {
    moveLensPageWidget(actionEl.dataset.lensPageRoute || '', id, actionEl.dataset.lensPageDirection || 0);
  } else if (action === 'add-dashboard-widget') {
    appWindow.addDashboardWidgetFromLens?.(id);
  } else if (action === 'remove-dashboard-widget') {
    appWindow.removeDashboardWidgetFromLens?.(id);
  } else if (action === 'import-dna') {
    appWindow.triggerDNAFilePicker?.();
  } else if (action === 'reimport-dna') {
    if (typeof appWindow.reimportDNA === 'function') appWindow.reimportDNA();
    else appWindow.triggerDNAFilePicker?.();
  } else if (action === 'delete-dna') {
    appWindow.confirmDeleteDNA?.();
  } else if (action === 'open-wearables-settings') {
    appWindow.openSettingsModal?.('wearables');
  } else if (action === 'open-biometric-picker') {
    appWindow.openDashboardBiometricPicker?.();
  } else if (action === 'open-ai-chat') {
    appWindow.openChatPanel?.();
  } else if (action === 'open-emf-assessment') {
    appWindow.openEMFAssessmentEditor?.();
  } else if (action === 'open-recommendations') {
    appWindow.navigate?.('recommendations');
  } else if (action === 'open-privacy-settings') {
    appWindow.openSettingsModal?.('privacy');
  }
}

function installLensPageShellDelegates() {
  if (lensPageShellDelegatesInstalled || typeof document === 'undefined') return;
  lensPageShellDelegatesInstalled = true;
  document.addEventListener('click', handleLensPageShellClick);
}

export function renderLensHeader(title, subtitle, actions = '') {
  return `<div class="category-header lens-page-header">
    <h2>${escapeHTML(title)}</h2>
    <p>${escapeHTML(subtitle)}</p>
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
  if (state.currentView === route) window.navigate?.(route);
}

export function renderLensDashboardToggle(dashboardId) {
  if (!dashboardId || !_shellDeps.getAvailableDashboardFixedWidgetIds().includes(dashboardId)) return '';
  const prefs = _shellDeps.getDashboardWidgetPrefs();
  const hidden = Array.isArray(prefs?.hidden) ? prefs.hidden : [];
  const isVisible = !hidden.includes(dashboardId);
  const label = isVisible ? 'Remove from Dashboard' : 'Add to Dashboard';
  const action = isVisible ? 'remove-dashboard-widget' : 'add-dashboard-widget';
  return `<button type="button" class="dashboard-widget-tool lens-widget-dashboard-toggle" ${lensPageActionAttrs(action, { id: dashboardId })}>${label}</button>`;
}

export function renderLensWidget(id, title, description, body, size = 'full', opts = {}) {
  const dashboardId = Object.prototype.hasOwnProperty.call(opts, 'dashboardId') ? opts.dashboardId : id;
  const dashboardToggle = renderLensDashboardToggle(dashboardId);
  const pageControls = renderLensPageMoveControls(opts.pageRoute || '', id, opts.pageIndex || 0, opts.pageCount || 0);
  const tools = [pageControls, dashboardToggle].filter(Boolean).join('');
  return `<section class="dashboard-widget dashboard-widget-${escapeAttr(size)}${body ? '' : ' is-empty'}" data-widget-id="${escapeAttr(id)}">
    <div class="dashboard-widget-chrome">
      <div class="dashboard-widget-heading">
        ${opts.source ? `<div class="dashboard-widget-source">${escapeHTML(opts.source)}</div>` : ''}
        <div class="dashboard-widget-title">${escapeHTML(title)}</div>
        <div class="dashboard-widget-description">${escapeHTML(description || '')}</div>
      </div>
      ${tools ? `<div class="dashboard-widget-tools">${tools}</div>` : ''}
    </div>
    <div class="dashboard-widget-body">${body || '<div class="dashboard-widget-empty">No data available yet.</div>'}</div>
  </section>`;
}

installLensPageShellDelegates();
