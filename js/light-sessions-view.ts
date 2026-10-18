import type{LightSessionRowProps,LightSessionHistoryProps}from'./light-session-presentation.js';
// light-sessions-view.ts — Unified Light & Sun session list and modal

import { bindModalSyncRefresh, formatDate } from './utils.js';
import { renderHTML } from './components/LightSessionPresentation.svelte.html.js';
import { projectCompletedDeviceSession } from './light-session-presentation.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';

const LIGHT_SESSIONS_ACTION_ATTR = 'data-light-sessions-action';
const LIGHT_SESSION_ID_ATTR = 'data-light-session-id';
const LIGHT_SESSIONS_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightSessionsActionDelegatesInstalled');
const lightSessionsActionDelegateRoots = new WeakSet<DelegateRoot>();

import type { SunSessionRecord } from './sun-sessions-store.js';
import type { DeviceSessionRecord, LightDeviceRecord } from './light-devices-store.js';

export interface LightSessionsViewDeps {
  getSessions(): SunSessionRecord[];
  getDeviceSessions(): DeviceSessionRecord[];
  getDevices(): LightDeviceRecord[];
  getSunSessionRowView(session: SunSessionRecord): LightSessionRowProps|null;
  openDeviceSessionDetail(id: string): unknown;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
type SessionRow = { kind: 'sun'; startedAt: number; sess: SunSessionRecord }
  | { kind: 'device'; startedAt: number; sess: DeviceSessionRecord };
type ActionTarget = Partial<Pick<Element, 'closest'>>;
type ParentActionTarget = ActionTarget & { parentElement?: ActionTarget | null; parentNode?: ActionTarget | null };
type DelegateRoot = Document | HTMLElement;

const viewDeps: LightSessionsViewDeps = {
  getSessions: () => [],
  getDeviceSessions: () => [],
  getDevices: () => [],
  getSunSessionRowView: () => null,
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

export function configureLightSessionsView(deps: Partial<LightSessionsViewDeps> = {}) {
  Object.assign(viewDeps, deps);
}

function closestLightSessionsAction(target: ActionTarget | null) {
  if (!target || !target.closest) return null;
  return target.closest(`[${LIGHT_SESSIONS_ACTION_ATTR}]`);
}

function handleLightSessionsActionClick(event: Event) {
  const actionEl = closestLightSessionsAction(event.target as ActionTarget | null);
  if (!actionEl || !(event.currentTarget as Partial<Node> | null)?.contains?.(actionEl)) return;
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

function handleLightSessionsActionKeydown(event: Event) {
  if ((event as KeyboardEvent).key !== 'Enter' && (event as KeyboardEvent).key !== ' ') return;
  const actionEl = closestLightSessionsAction(event.target as ActionTarget | null);
  if (!actionEl || !(event.currentTarget as Partial<Node> | null)?.contains?.(actionEl)) return;
  if (actionEl.getAttribute('role') !== 'button') return;
  if ((event.target as ActionTarget | null)?.closest?.('button, a, input, textarea, select')) return;
  event.preventDefault();
  handleLightSessionsActionClick(event);
}

export function installLightSessionsActionDelegates(root: DelegateRoot | null = typeof document !== 'undefined' ? document : null) {
  if (!root || lightSessionsActionDelegateRoots.has(root) || (root as DelegateRoot & { [LIGHT_SESSIONS_ACTION_DELEGATE_KEY]?: boolean })[LIGHT_SESSIONS_ACTION_DELEGATE_KEY]) return;
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
  const rows: SessionRow[] = [];
  for (const s of sunSessions) rows.push({ kind: 'sun', startedAt: s.startedAt || 0, sess: s });
  for (const s of devSessions) rows.push({ kind: 'device', startedAt: s.startedAt || 0, sess: s });
  rows.sort((a, b) => b.startedAt - a.startedAt);
  return { rows, hasDeviceRows: devSessions.length > 0 };
}

function _localSessionStamp(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    date: formatDate(localKey),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

function getSessionRowViews(rows: SessionRow[]) {
  const devices = viewDeps.getDevices();
  const deviceById = Object.fromEntries(devices.map(d => [d.id, d]));
  const getSunRow = viewDeps.getSunSessionRowView;
  const views:LightSessionRowProps[]=[];
  for (const row of rows) {
    if (row.kind === 'sun') {
      const view=getSunRow(row.sess);if(view)views.push(view);
    } else if (row.kind === 'device') {
      const sess = row.sess;
      const dev = deviceById[sess.deviceId as string] || sess.deviceSnapshot || null;
      views.push({kind:'row',view:projectCompletedDeviceSession(sess,dev,_localSessionStamp(row.startedAt))});
    }
  }
  return views;
}

// Inline render — caps at SESSIONS_DEFAULT_CAP and exposes the rest
// via "View all" modal instead of expanding inline.
export function getUnifiedSessionsView():LightSessionHistoryProps|null {
  const { rows, hasDeviceRows } = _collectUnifiedSessionRows();
  if (rows.length === 0) return null;
  const visibleRows = rows.slice(0, SESSIONS_DEFAULT_CAP);
  return { kind: 'history', rows: getSessionRowViews(visibleRows), total: rows.length,
    sunCount: rows.filter(row => row.kind === 'sun').length, deviceCount: hasDeviceRows ? rows.filter(row => row.kind === 'device').length : 0,
    modal: false, showMore: rows.length > visibleRows.length };
}
export function renderUnifiedSessionsList(){const props=getUnifiedSessionsView();return props?renderHTML(props):'';}

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
    overlay.innerHTML = renderHTML({ kind: 'history', rows: getSessionRowViews(rows), total: rows.length,
      sunCount, deviceCount: hasDeviceRows ? deviceCount : 0, modal: true, showMore: false });
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
  const eventElement = (target: ParentActionTarget | null) => {
    if (!target) return null;
    if (target.closest) return target as Required<ActionTarget>;
    const parent = target.parentElement || target.parentNode;
    return parent?.closest ? parent as Required<ActionTarget> : null;
  };
  overlay.addEventListener('click', (event) => {
    const target = eventElement(event.target as ParentActionTarget | null);
    if (target?.closest?.('[data-light-sessions-close]')) {
      closeOverlay();
      return;
    }
    const row = target?.closest?.('.sun-session:is(button, [role="button"])');
    if (!row || !overlay.contains(row)) return;
    const nestedControl = target?.closest?.('button, a, input, select, textarea, [role="menuitem"]');
    if (nestedControl && nestedControl !== row) return;
    setTimeout(closeOverlay, 0);
  });
  overlay.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Enter' && (event as KeyboardEvent).key !== ' ') return;
    const target = eventElement(event.target as ParentActionTarget | null);
    const row = target?.closest?.('.sun-session:is(button, [role="button"])');
    if (!row || !overlay.contains(row) || row.matches('button')) return;
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
