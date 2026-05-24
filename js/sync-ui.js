// sync-ui.js - header sync badge, popover, and activity-log copy helpers.

import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { getSyncRelay } from './sync-environment.js';
import { getRelayQuotaEstimate } from './sync-relay-health.js';
import {
  getRecentSyncEvents,
  getSyncDisplayState as getSyncDisplayStateFromStatus,
  getSyncStatus,
  subscribeSyncStatus,
} from './sync-state.js';

let _isSyncEnabled = () => false;
let _statusBound = false;

export function configureSyncUI({ isSyncEnabled } = {}) {
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
}

function currentSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

function getSyncDisplayState() {
  return getSyncDisplayStateFromStatus(currentSyncEnabled());
}

function _timeAgo(ts) {
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
  const titles = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 changes saved locally', error: 'Sync error', disabled: '' };
  slot.innerHTML = `<button class="sync-indicator" id="sync-indicator-btn" onclick="toggleSyncDetail()" title="${titles[ds]}" aria-label="Sync status"><span class="sync-dot sync-dot-${ds}"></span></button>`;
}

export function updateSyncIndicator() {
  const dot = document.querySelector('#sync-indicator-btn .sync-dot');
  if (!dot) { renderSyncIndicator(); return; }
  const ds = getSyncDisplayState();
  dot.className = `sync-dot sync-dot-${ds}`;
  const titles = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 changes saved locally', error: 'Sync error' };
  dot.parentElement.title = titles[ds] || '';
}

export function toggleSyncDetail() {
  let pop = document.getElementById('sync-popover');
  if (pop) { pop.remove(); return; }
  const btn = document.getElementById('sync-indicator-btn');
  if (!btn) return;
  const s = getSyncStatus();
  const relayUrl = getSyncRelay();
  const relayDot = s.relay === 'connected' ? '#22c55e' : s.relay === 'unreachable' ? 'var(--red)' : 'var(--text-muted)';
  const relayLabel = s.relay === 'connected' ? 'Connected to relay' : s.relay === 'unreachable' ? 'Relay unreachable' : 'Checking\u2026';
  // Detect a stuck push: pending > 15s usually means Evolu's worker can't
  // reach the relay (offline phone, relay down, OPFS lock). Surface it so
  // the user knows clicking Sync now won't help - they need network back.
  // Also treat the post-watchdog `error: PushStuck` state as stuck so the
  // Reload button stays visible even after status flips off `pending`.
  const pendingMs = (s.push === 'pending' && s.pushStartedAt) ? (Date.now() - s.pushStartedAt) : 0;
  const isPushStuckError = s.push === 'error' && s.lastError?.type === 'PushStuck';
  const stuckPush = pendingMs > 15_000 || isPushStuckError;
  const pushLabel = s.push === 'confirmed' ? `Confirmed ${_timeAgo(s.pushConfirmedAt)}`
    : isPushStuckError ? `<span style="color:var(--red)">Stuck \u2014 relay didn't ack</span>`
    : pendingMs > 15_000 ? `<span style="color:var(--red)">Stuck for ${Math.round(pendingMs/1000)}s \u2014 relay unreachable?</span>`
    : s.push === 'pending' ? 'Pending\u2026'
    : s.push === 'error' ? '<span style="color:var(--red)">Failed</span>' : '\u2014';
  const pullLabel = s.pullReceivedAt ? `Checked ${_timeAgo(s.pullReceivedAt)}` : '\u2014';
  const errorLine = s.lastError ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">${escapeHTML(s.lastError.type)} ${_timeAgo(s.lastError.at)}</div>` : '';

  pop = document.createElement('div');
  pop.id = 'sync-popover';
  pop.className = 'sync-popover';
  // Recent sync events list - debug-only. Useful when phone vs desktop
  // disagree on what's on the relay; meaningless to a regular user.
  const debugMode = isDebugMode();
  const events = debugMode ? getRecentSyncEvents().slice(-6).reverse() : [];
  const eventColor = { push: 'var(--accent)', pull: 'var(--green)', skip: 'var(--text-muted)', rebroadcast: 'var(--orange)' };
  const eventsHtml = events.length ? `
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);max-height:160px;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-weight:600;color:var(--text-secondary);flex:1">Recent activity</span>
        <button class="ctx-btn-option" style="font-size:10px;padding:2px 8px" onclick="window.copySyncEvents(this)" title="Copy events to clipboard">Copy</button>
      </div>
      ${events.map(e => `<div style="margin-bottom:3px"><span style="color:${eventColor[e.kind] || 'var(--text-muted)'};font-weight:600">${e.kind}</span> · ${_timeAgo(e.at)} · <span style="font-family:monospace;font-size:10px">${escapeHTML(e.text)}</span></div>`).join('')}
    </div>` : '';
  // Relay storage estimate. Local cumulative bytes-pushed counter; close
  // enough to relay's actual storedBytes to warn before the 50 MB wall.
  const q = getRelayQuotaEstimate();
  let quotaLine = '';
  if (q && q.bytes > 0) {
    const mb = (q.bytes / (1024 * 1024)).toFixed(1);
    const capMb = (q.cap / (1024 * 1024)).toFixed(0);
    const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--text-muted)';
    const dot = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
    quotaLine = `<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="width:6px;height:6px;border-radius:50%;background:${dot};display:inline-block"></span><span style="color:${color}">Storage: ${mb} / ${capMb} MB · ${q.pct}%</span></div>`;
  }
  pop.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${relayDot};display:inline-block"></span><span style="font-size:13px">${relayLabel}</span></div>
    ${debugMode ? `<div style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-bottom:8px;word-break:break-all">${escapeHTML(relayUrl)}</div>` : ''}
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      <div>Push: ${pushLabel}</div>
      <div>Pull: ${pullLabel}</div>
      ${quotaLine}
    </div>
    ${debugMode ? errorLine : ''}
    ${eventsHtml}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="ctx-btn-option" style="font-size:12px" onclick="syncNow();toggleSyncDetail()">Sync now</button>
      ${stuckPush ? `<button class="ctx-btn-option" style="font-size:12px;color:var(--red);border-color:var(--red)" onclick="window.location.reload()" title="Reloads the page to re-init the sync worker.">Reload</button>` : ''}
      <button class="ctx-btn-option" style="font-size:12px" onclick="toggleSyncDetail();openSettingsModal('data')">Settings</button>
      ${isDebugMode() ? `
        <button class="ctx-btn-option" style="font-size:12px${stuckPush ? ';color:var(--orange);border-color:var(--orange)' : ''}" onclick="forceResendCurrentProfile();toggleSyncDetail()" title="Bypasses the in-flight guard. Use when Sync now isn't reaching the relay (typically because a prior push got stuck and the worker still thinks it's running).">Force resend</button>
        <button class="ctx-btn-option" style="font-size:12px" onclick="cleanStorage().then(()=>toggleSyncDetail())" title="Trim changeHistory to its 200-entry cap and clear cached AI model lists. Use when localStorage is full and pushes throw QuotaExceededError silently.">Clean storage</button>
        <button class="ctx-btn-option" style="font-size:12px" onclick="checkRelayConnection().then(ok=>showNotification(ok?'Relay reachable':'Relay UNREACHABLE',ok?'success':'error'))">Test relay</button>
        <button class="ctx-btn-option" style="font-size:12px" onclick="showSyncDiagnose()">Diagnose</button>
      ` : ''}
    </div>`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(pop);
  // Close on outside click.
  const close = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
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
export async function copySyncEvents(btn) {
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
  ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;max-width:600px;height:60vh;z-index:10000;background:var(--bg-card,#222);color:var(--text-primary,#fff);border:1px solid var(--border,#444);padding:12px;font:12px monospace;border-radius:8px';
  document.body.appendChild(ta);
  ta.select();
  showNotification('Auto-copy blocked — select the text above and copy manually.', 'warning');
  ta.addEventListener('blur', () => ta.remove(), { once: true });
}
