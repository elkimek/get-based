// @ts-check
// light-sessions-view.js — Unified Light & Sun session list and modal

import { bindModalSyncRefresh, escapeHTML, escapeAttr, formatDate } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';

const LIGHT_SESSIONS_ACTION_ATTR = 'data-light-sessions-action';
const LIGHT_SESSION_ID_ATTR = 'data-light-session-id';
const LIGHT_SESSIONS_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightSessionsActionDelegatesInstalled');
const lightSessionsActionDelegateRoots = new WeakSet();

/**
 * @typedef {object} LightSessionsViewDeps
 * @property {() => any[]} getSessions
 * @property {() => any[]} getDeviceSessions
 * @property {() => any[]} getDevices
 * @property {(sess: any) => string} renderSunSessionRow
 * @property {(id: string) => void | Promise<any>} openDeviceSessionDetail
 * @property {(type: string, listener: EventListener) => void} addEventListener
 * @property {(type: string, listener: EventListener) => void} removeEventListener
 */

/** @type {LightSessionsViewDeps} */
const viewDeps = {
  getSessions: () => [],
  getDeviceSessions: () => [],
  getDevices: () => [],
  renderSunSessionRow: () => '',
  openDeviceSessionDetail: () => {},
  addEventListener: (type, listener) => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener(type, listener);
    }
  },
  removeEventListener: (type, listener) => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener(type, listener);
    }
  },
};

/** @param {Partial<LightSessionsViewDeps>} [deps] */
export function configureLightSessionsView(deps = {}) {
  Object.assign(viewDeps, deps);
}

function closestLightSessionsAction(target) {
  if (!target || !target.closest) return null;
  return target.closest(`[${LIGHT_SESSIONS_ACTION_ATTR}]`);
}

function handleLightSessionsActionClick(event) {
  const actionEl = closestLightSessionsAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LIGHT_SESSIONS_ACTION_ATTR);
  const sessionId = actionEl.getAttribute(LIGHT_SESSION_ID_ATTR) || '';
  if (action === 'open-device-session') {
    if (sessionId) viewDeps.openDeviceSessionDetail(sessionId);
    event.stopPropagation();
    return;
  }
  if (action === 'show-all') {
    event.stopPropagation();
    _openAllSessionsModal();
  }
}

function handleLightSessionsActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestLightSessionsAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (actionEl.getAttribute('role') !== 'button') return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  event.preventDefault();
  handleLightSessionsActionClick(event);
}

export function installLightSessionsActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || lightSessionsActionDelegateRoots.has(root) || root[LIGHT_SESSIONS_ACTION_DELEGATE_KEY]) return;
  lightSessionsActionDelegateRoots.add(root);
  Object.defineProperty(root, LIGHT_SESSIONS_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleLightSessionsActionClick);
  root.addEventListener('keydown', handleLightSessionsActionKeydown);
}

if (typeof document !== 'undefined') installLightSessionsActionDelegates();

// Inline cap on the historical sessions list. 3 is enough for
// at-a-glance context ("what did I do recently"); the full history
// opens in a modal so the rest of the Light & Sun page (Devices,
// Light Environment, Tools) sits within one scroll-page below.
// Rows intentionally stay compact; full setup, signals, safety math and AI
// interpretation live in the session detail dialog.
export const SESSIONS_DEFAULT_CAP = 3;

// Build the unified, sorted (newest-first) row list of all completed
// sun + device sessions. Shared between the inline render (cap-bounded)
// and the modal that shows the full history.
function _collectUnifiedSessionRows() {
  // Active sun session is pinned at the top of the page (showLight
  // renders it before the quicklog row), so filter it out of the
  // historical-sessions list to avoid the same row appearing twice.
  const sunSessions = viewDeps.getSessions().filter(s => !!s.endedAt);
  // Active device sessions are pinned above (renderActiveDeviceSessionCard);
  // filter them out here so the same row doesn't render twice.
  const devSessions = viewDeps.getDeviceSessions().filter(s => !!s.endedAt);
  const rows = [];
  for (const s of sunSessions) rows.push({ kind: 'sun', startedAt: s.startedAt || 0, sess: s });
  for (const s of devSessions) rows.push({ kind: 'device', startedAt: s.startedAt || 0, sess: s });
  rows.sort((a, b) => b.startedAt - a.startedAt);
  return { rows, hasDeviceRows: devSessions.length > 0 };
}

function _localSessionStamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    date: formatDate(localKey),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

function _renderSessionRowsHTML(rows) {
  const devices = viewDeps.getDevices();
  const deviceById = Object.fromEntries(devices.map(d => [d.id, d]));
  const renderSunRow = viewDeps.renderSunSessionRow;
  let html = '';
  for (const row of rows) {
    if (row.kind === 'sun') {
      html += renderSunRow(row.sess);
    } else if (row.kind === 'device') {
      const sess = row.sess;
      const dev = deviceById[sess.deviceId] || sess.deviceSnapshot || null;
      const devName = dev ? `${dev.brand} ${dev.model}` : 'Device details unavailable';
      const stamp = _localSessionStamp(row.startedAt);
      const dur = sess.durationMin ? `${Math.round(sess.durationMin * 10) / 10} min` : '—';
      // Mode badge — only on rows for devices that declare modes. The
      // resolved mode answers "which LED groups fired" at a glance, key
      // for hybrid panels where the same device can produce different
      // channel doses depending on the preset chosen.
      let modeBadge = '';
      let modeAria = '';
      if (dev && Array.isArray(dev.modes) && dev.modes.length > 0) {
        const resolvedMode = dev.modes.find(m => m.id === sess.mode)
          || dev.modes.find(m => m.default)
          || dev.modes[0];
        if (resolvedMode) {
          const label = resolvedMode.label || resolvedMode.id;
          const isDefault = !!resolvedMode.default || dev.modes[0]?.id === resolvedMode.id;
          modeBadge = `<span class="light-session-mode-chip${isDefault ? '' : ' light-session-mode-chip-accent'}" title="LED-group mode that fired during this session">${escapeHTML(label)}</span>`;
          modeAria = ` mode ${label}`;
        }
      }
      const unsafeEye = !!sess.safety?.unsafeEyeExposure;
      const highBurn = Number(sess.safety?.conservativeBaseMedFraction) >= 0.7;
      const safetyBadge = unsafeEye
        ? '<span class="light-session-warning light-session-warning-danger">UV eye exposure — review</span>'
        : (highBurn ? '<span class="light-session-warning">High modeled burn dose</span>'
          : (sess.safety?.hasUV && sess.safety?.uvDoseStatus && sess.safety.uvDoseStatus !== 'modeled'
            ? '<span class="light-session-warning">UV dose unavailable</span>' : ''));
      const devAriaLabel = `Open ${stamp.date}${stamp.time ? ` at ${stamp.time}` : ''} device session details — ${devName}${modeAria}`;
      html += `<div class="sun-session light-session-row light-session-complete light-session-device" data-id="${escapeAttr(sess.id)}" data-light-sessions-action="open-device-session" data-light-session-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="${escapeAttr(devAriaLabel)}">
        <span class="light-session-icon" aria-hidden="true">◉</span>
        <div class="light-session-summary">
          <div class="light-session-title"><span class="light-session-kind">Device</span>${escapeHTML(devName)}</div>
          <div class="light-session-meta-line">
            <span class="sun-session-date">${escapeHTML(stamp.date)}</span>
            ${stamp.time ? `<span>${escapeHTML(stamp.time)}</span>` : ''}
            <span class="sun-session-duration">${escapeHTML(dur)}</span>
          </div>
        </div>
        ${modeBadge}
        ${safetyBadge}
        <span class="light-session-chevron" aria-hidden="true">›</span>
      </div>`;
    }
  }
  return html;
}

// Inline render — caps at SESSIONS_DEFAULT_CAP and exposes the rest
// via "View all" modal instead of expanding inline.
export function renderUnifiedSessionsList() {
  const { rows, hasDeviceRows } = _collectUnifiedSessionRows();
  if (rows.length === 0) return '';
  const totalCount = rows.length;
  const visibleRows = rows.slice(0, SESSIONS_DEFAULT_CAP);
  const hiddenCount = totalCount - visibleRows.length;
  let html = `<div class="sun-sessions-list${hasDeviceRows ? ' light-sessions-list-unified' : ''}">`;
  html += _renderSessionRowsHTML(visibleRows);
  html += `</div>`;
  if (hiddenCount > 0) {
    html += `<button type="button" class="light-sessions-show-more" data-light-sessions-action="show-all">View all ${totalCount} sessions</button>`;
  }
  return html;
}

// Modal listing every session — opened from the "View all" button so
// the Light & Sun page itself stays compact. Reuses the same per-row
// renderer as the inline list.
export function _openAllSessionsModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-sessions-modal-overlay';
  let _detach = () => {};
  let _detached = false;
  const detachListeners = () => {
    if (_detached) return;
    _detached = true;
    _detach();
  };
  const _removeOverlay = overlay.remove.bind(overlay);
  overlay.remove = () => {
    detachListeners();
    _removeOverlay();
  };
  const closeOverlay = () => {
    detachListeners();
    removeModalOverlay(overlay);
  };
  const renderInto = () => {
    const { rows, hasDeviceRows } = _collectUnifiedSessionRows();
    const sunCount = rows.filter(row => row.kind === 'sun').length;
    const deviceCount = rows.filter(row => row.kind === 'device').length;
    const title = `All sessions (${rows.length})`;
    overlay.innerHTML = `<div class="modal light-sessions-modal" role="dialog" aria-modal="true" aria-labelledby="light-all-sessions-title">
      <header class="light-sessions-modal-head">
        <div>
          <h3 id="light-all-sessions-title">${escapeHTML(title)}</h3>
          <p>${sunCount} outdoor · ${deviceCount} device</p>
        </div>
        <button class="modal-close" aria-label="Close" data-light-sessions-close>×</button>
      </header>
      <div class="light-sessions-modal-body">
        ${rows.length
          ? `<div class="sun-sessions-list${hasDeviceRows ? ' light-sessions-list-unified' : ''}">${_renderSessionRowsHTML(rows)}</div>`
          : '<div class="sun-empty"><p>No completed sessions yet.</p></div>'}
      </div>
    </div>`;
  };
  renderInto();
  // Re-render on sync pull / AI verdict completion so the modal stays
  // fresh when a paired device adds/edits/deletes sessions while it's open.
  const detachSyncRefresh = bindModalSyncRefresh({
    overlay,
    modalSelector: '.light-sessions-modal',
    scrollSelector: '.light-sessions-modal-body',
    refresh: renderInto,
  });
  const onVerdictRefresh = () => {
    if (!document.body.contains(overlay)) { _detach(); return; }
    renderInto();
  };
  _detach = () => {
    detachSyncRefresh();
    viewDeps.removeEventListener('labcharts-ai-verdict-updated', onVerdictRefresh);
  };
  viewDeps.addEventListener('labcharts-ai-verdict-updated', onVerdictRefresh);
  const eventElement = (target) => {
    if (!target) return null;
    if (target.closest) return target;
    const parent = target.parentElement || target.parentNode;
    return parent?.closest ? parent : null;
  };
  overlay.addEventListener('click', (event) => {
    const target = eventElement(event.target);
    if (target?.closest?.('[data-light-sessions-close]')) {
      closeOverlay();
      return;
    }
    const row = target?.closest?.('.sun-session[role="button"]');
    if (!row || !overlay.contains(row)) return;
    if (target?.closest?.('button, a, input, select, textarea, [role="menuitem"]')) return;
    setTimeout(closeOverlay, 0);
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = eventElement(event.target);
    const row = target?.closest?.('.sun-session[role="button"]');
    if (!row || !overlay.contains(row)) return;
    setTimeout(closeOverlay, 0);
  });
  overlay.addEventListener('wheel', (event) => {
    const body = overlay.querySelector('.light-sessions-modal-body');
    if (!body) return;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? body.clientHeight
      : (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
    body.scrollBy({
      top: event.deltaY * unit,
      left: event.deltaX * unit,
      behavior: 'auto',
    });
    event.preventDefault();
  }, { passive: false });
  openAppendedModalOverlay(overlay, closeOverlay);
}
