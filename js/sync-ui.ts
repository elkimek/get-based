import {tsStaticStyles} from './ts-static-ui-inline-style-map.generated.js';
import { renderSyncIndicatorView, renderSyncPopoverView, type SyncPushView, type SyncEventView, type SyncQuotaView } from './sync-status-rendering.js';
import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';
// sync-ui.js - header sync badge, popover, and activity-log copy helpers.

import { showNotification, isDebugMode, escapeAttr } from './utils.js';
import { getSyncRelay } from './sync-environment.js';
import { getRelayQuotaEstimate } from './sync-relay-health.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import {
  getRecentSyncEvents,
  getSyncDisplayState as getSyncDisplayStateFromStatus,
  getSyncStatus,
  getSyncStatusNotice,
  subscribeSyncStatus,
} from './sync-state.js';

let _isSyncEnabled = () => false;
let _syncNow: () => unknown = () => {};
let _forceResendCurrentProfile: () => unknown = () => {};
let _cleanStorage: () => unknown = () => {};
let _checkRelayConnection = async () => false;
let _showSyncDiagnose: () => unknown = () => {};
let _statusBound = false;
type SyncUIWindow = Window & { __getbasedSyncUIDelegatesInstalled?: boolean };
const SYNC_UI_DELEGATE_KEY = '__getbasedSyncUIDelegatesInstalled';

export function syncUiActionAttrs(action: string) {
  return `data-sync-ui-action="${escapeAttr(action)}"`;
}

function handleSyncUIClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = (target.closest('[data-sync-ui-action]') as HTMLElement | null);
  if (!actionEl) return;

  event.preventDefault();
  const appWindow = (window as SyncUIWindow);
  const action = actionEl.dataset.syncUiAction || '';
  if (action === 'toggle-detail') {
    toggleSyncDetail();
  } else if (action === 'copy-events') {
    void copySyncEvents(actionEl);
  } else if (action === 'sync-now') {
    void _syncNow();
    toggleSyncDetail();
  } else if (action === 'reload') {
    appWindow.location?.reload?.();
  } else if (action === 'open-settings') {
    toggleSyncDetail();
    getSettingsModuleFunction('openSettingsModal')?.('data');
  } else if (action === 'force-resend') {
    void _forceResendCurrentProfile();
    toggleSyncDetail();
  } else if (action === 'clean-storage') {
    Promise.resolve(_cleanStorage()).then(() => toggleSyncDetail());
  } else if (action === 'test-relay') {
    Promise.resolve(_checkRelayConnection()).then(ok => {
      showNotification(ok ? 'Relay reachable' : 'Relay UNREACHABLE', ok ? 'success' : 'error');
    }).catch(err => {
      showNotification(`Relay check failed: ${err?.message || err}`, 'error');
    });
  } else if (action === 'show-diagnose') {
    _showSyncDiagnose();
  }
}

export function initSyncUIDelegates() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const appWindow = (window as SyncUIWindow);
  if (appWindow[SYNC_UI_DELEGATE_KEY]) return;
  document.addEventListener('click', handleSyncUIClick);
  appWindow[SYNC_UI_DELEGATE_KEY] = true;
}

interface SyncUIDependencies {
  isSyncEnabled: typeof _isSyncEnabled;
  syncNow: typeof _syncNow;
  forceResendCurrentProfile: typeof _forceResendCurrentProfile;
  cleanStorage: typeof _cleanStorage;
  checkRelayConnection: typeof _checkRelayConnection;
  showSyncDiagnose: typeof _showSyncDiagnose;
}

export function configureSyncUI({
  isSyncEnabled,
  syncNow,
  forceResendCurrentProfile,
  cleanStorage,
  checkRelayConnection,
  showSyncDiagnose,
}: RuntimeDependencyUpdates<SyncUIDependencies> = {}) {
  const previous = {
    isSyncEnabled: _isSyncEnabled,
    syncNow: _syncNow,
    forceResendCurrentProfile: _forceResendCurrentProfile,
    cleanStorage: _cleanStorage,
    checkRelayConnection: _checkRelayConnection,
    showSyncDiagnose: _showSyncDiagnose,
  };
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof syncNow === 'function') _syncNow = syncNow;
  if (typeof forceResendCurrentProfile === 'function') _forceResendCurrentProfile = forceResendCurrentProfile;
  if (typeof cleanStorage === 'function') _cleanStorage = cleanStorage;
  if (typeof checkRelayConnection === 'function') _checkRelayConnection = checkRelayConnection;
  if (typeof showSyncDiagnose === 'function') _showSyncDiagnose = showSyncDiagnose;
  return previous;
}

function currentSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

function getSyncDisplayState() {
  return getSyncDisplayStateFromStatus(currentSyncEnabled());
}

function _timeAgo(ts: number | null | undefined) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function renderSyncIndicator() {
  const slot = document.getElementById('sync-indicator-slot');
  if (!slot) return;
  if (!currentSyncEnabled()) { slot.innerHTML = ''; return; }
  const ds = getSyncDisplayState();
  const titles: Partial<Record<ReturnType<typeof getSyncDisplayState>, string>> = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 waiting to reconnect', error: 'Sync error', disabled: '' };
  slot.innerHTML = renderSyncIndicatorView({ state: ds, title: titles[ds] });
}

export function updateSyncIndicator() {
  const dot = document.querySelector('#sync-indicator-btn .sync-dot');
  if (!dot) { renderSyncIndicator(); return; }
  const ds = getSyncDisplayState();
  dot.className = `sync-dot sync-dot-${ds}`;
  const titles: Partial<Record<ReturnType<typeof getSyncDisplayState>, string>> = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 waiting to reconnect', error: 'Sync error' };
  const button = dot.parentElement;
  if (button) button.title = titles[ds] || '';
}

const syncText = (value: unknown): string => value == null ? '' : String(value);

export function toggleSyncDetail() {
  let pop = document.getElementById('sync-popover');
  if (pop) { pop.remove(); return; }
  const btn = document.getElementById('sync-indicator-btn');
  if (!btn) return;
  const s = getSyncStatus();
  const relayUrl = getSyncRelay();
  const replicationFailed = s.replication === 'Offline' || s.replication === 'Error';
  const relayDot = replicationFailed ? 'var(--red)' : s.relay === 'connected' ? '#22c55e' : s.relay === 'unreachable' ? 'var(--red)' : 'var(--text-muted)';
  const relayLabel = s.replication === 'Offline' ? 'Sync connection offline' : s.replication === 'Error' ? 'Sync needs attention'
    : s.relay === 'connected' ? 'Connected to relay' : s.relay === 'unreachable' ? 'Relay unreachable' : 'Checking\u2026';
  // Detect a stuck push: pending > 15s usually means Evolu's worker can't
  // reach the relay (offline phone, relay down, OPFS lock). Surface it so
  // the user knows clicking Sync now won't help - they need network back.
  // Also treat the post-watchdog `error: PushStuck` state as stuck so the
  // Reload button stays visible even after status flips off `pending`.
  const pendingMs = (s.push === 'pending' && s.pushStartedAt) ? (Date.now() - s.pushStartedAt) : 0;
  const isPushStuckError = s.push === 'error' && s.lastError?.type === 'PushStuck';
  const stuckPush = pendingMs > 15_000 || isPushStuckError;
  const pushLabel: SyncPushView = s.push === 'confirmed' ? { danger: false, text: `Confirmed ${_timeAgo(s.pushConfirmedAt)}` }
    : isPushStuckError ? { danger: true, text: "Stuck \u2014 relay didn't ack" }
    : pendingMs > 15_000 ? { danger: true, text: `Stuck for ${Math.round(pendingMs/1000)}s \u2014 relay unreachable?` }
    : s.push === 'pending' ? { danger: false, text: 'Pending\u2026' }
    : s.push === 'error' ? { danger: true, text: 'Failed' } : { danger: false, text: '\u2014' };
  const pullLabel = s.pullReceivedAt ? `Checked ${_timeAgo(s.pullReceivedAt)}` : '\u2014';
  const errorLine = s.lastError ? { type: syncText(s.lastError.type), age: _timeAgo(s.lastError.at) } : null;

  pop = document.createElement('div');
  pop.id = 'sync-popover';
  pop.className = 'sync-popover';
  // Recent sync events list - debug-only. Useful when phone vs desktop
  // disagree on what's on the relay; meaningless to a regular user.
  const debugMode = isDebugMode();
  const events = debugMode ? getRecentSyncEvents().slice(-6).reverse() : [];
  const eventColor: Record<string, string> = { push: 'var(--accent)', pull: 'var(--green)', skip: 'var(--text-muted)', rebroadcast: 'var(--orange)' };
  const eventViews: SyncEventView[] = events.length ? events.map(e => ({
    // Preserve native property-key coercion before capturing the literal kind.
    color: `${eventColor[e.kind] || 'var(--text-muted)'}`,
    kind: `${e.kind}`,
    age: _timeAgo(e.at),
    text: syncText(e.text),
  })) : [];
  // Relay storage usage. Successful pushes update a local estimate
  // immediately; the debounced /self/owner-storage probe replaces it with
  // authoritative bytes and the relay's configured owner quota.
  const q = getRelayQuotaEstimate();
  let quotaLine: SyncQuotaView | null = null;
  if (q && q.bytes > 0) {
    const mb = (q.bytes / (1024 * 1024)).toFixed(1);
    const capMb = (q.cap / (1024 * 1024)).toFixed(0);
    const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--text-muted)';
    const dot = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
    quotaLine = { dot, color, text: `Storage: ${mb} / ${capMb} MB · ${q.pct}%` };
  }
  const syncEnabled = currentSyncEnabled();
  pop.innerHTML = renderSyncPopoverView({
    relayDot,
    relayLabel,
    relay: debugMode ? syncText(relayUrl) : null,
    push: pushLabel,
    pullLabel,
    quota: quotaLine,
    error: debugMode ? errorLine : null,
    events: eventViews,
    stuckPush,
    notice: syncEnabled ? getSyncStatusNotice(s) : null,
    reloadRequired: syncEnabled && !!s.databaseError,
    // This is the original second debug read, after relay escaping and quota.
    debugControls: isDebugMode(),
  });
  const parent = btn.parentElement;
  if (!parent) return;
  parent.style.position = tsStaticStyles.syncPopoverAnchor;
  parent.appendChild(pop);
  // Close on outside click.
  const close = (e: MouseEvent) => { if (!pop!.contains(e.target as Node | null) && e.target !== btn && !btn.contains(e.target as Node | null)) { pop!.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

export function bindSyncUIStatusUpdates() {
  if (_statusBound) return;
  _statusBound = true;
  // Subscribe to status changes -> repaint indicator + re-render the popover
  // in place so a watchdog flip (e.g. 30s push-stuck) updates the labels and
  // the Reload button styling without the user closing / reopening the panel.
  subscribeSyncStatus(() => {
    updateSyncIndicator();
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
  });
}

// Copy the recent sync activity log to clipboard - meant for triage,
// when phone-side debugging needs the events shared without retyping.
// Format: ISO timestamp + kind + text per line. Falls back to a manual
// selection prompt on browsers without clipboard API permission.
export async function copySyncEvents(btn?: HTMLElement | null) {
  const events = getRecentSyncEvents();
  const lines = events.map(e => `${new Date(e.at).toISOString()}  ${e.kind.padEnd(12)}  ${e.text}`);
  const blob = `Sync activity (${events.length} events) — ${new Date().toISOString()}\n` +
               `Relay: ${getSyncRelay() || '(none)'}\n` +
               `Sync enabled: ${currentSyncEnabled()}\n\n` +
               lines.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(blob);
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        setTimeout(() => { if (btn) btn.textContent = orig; }, 1200);
      }
      return;
    }
  } catch (e) {
    // Clipboard API blocked (e.g. iframe, insecure context, permissions
    // denied) -> fall through to the textarea-select path so the user
    // can still grab the log manually.
  }
  const ta = document.createElement('textarea');
  ta.value = blob;
  ta.style.cssText = tsStaticStyles.syncEventsFallback;
  document.body.appendChild(ta);
  ta.select();
  showNotification('Auto-copy blocked — select the text above and copy manually.', 'warning');
  ta.addEventListener('blur', () => ta.remove(), { once: true });
}
