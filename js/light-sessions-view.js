// light-sessions-view.js — Unified Light & Sun session list and modal

import { escapeHTML, escapeAttr, formatDate } from './utils.js';

// Inline cap on the historical sessions list. 3 is enough for
// at-a-glance context ("what did I do recently"); the full history
// opens in a modal so the rest of the Light & Sun page (Devices,
// Light Environment, Tools) sits within one scroll-page below.
// Each row is ~160 px tall (date + duration + channel chips + burn-
// risk meta + AI verdict chip), so 3 rows ≈ 480 px is a tight default.
export const SESSIONS_DEFAULT_CAP = 3;

// Build the unified, sorted (newest-first) row list of all completed
// sun + device sessions. Shared between the inline render (cap-bounded)
// and the modal that shows the full history.
function _collectUnifiedSessionRows() {
  // Active sun session is pinned at the top of the page (showLight
  // renders it before the quicklog row), so filter it out of the
  // historical-sessions list to avoid the same row appearing twice.
  const sunSessions = ((window.getSessions && window.getSessions()) || []).filter(s => !!s.endedAt);
  // Active device sessions are pinned above (renderActiveDeviceSessionCard);
  // filter them out here so the same row doesn't render twice.
  const devSessions = ((window.getDeviceSessions && window.getDeviceSessions()) || []).filter(s => !!s.endedAt);
  const rows = [];
  for (const s of sunSessions) rows.push({ kind: 'sun', startedAt: s.startedAt || 0, sess: s });
  for (const s of devSessions) rows.push({ kind: 'device', startedAt: s.startedAt || 0, sess: s });
  rows.sort((a, b) => b.startedAt - a.startedAt);
  return { rows, hasDeviceRows: devSessions.length > 0 };
}

function _renderLightSessionChannelChips(doses, durationMin = 0) {
  if (!doses) return '';
  const ch = window.CHANNEL_DISPLAY || {};
  const tier = window.channelTier || (() => 0);
  const formatUnit = window.formatChannelUnit || (() => '');
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];
  const ranked = order
    .map(key => ({ key, v: doses[key] || 0, tier: tier(doses[key] || 0, key) }))
    .filter(r => r.v > 0 && r.tier > 0)
    .sort((a, b) => b.tier - a.tier || b.v - a.v)
    .slice(0, 3);
  if (!ranked.length) return '';
  const chips = ranked.map(r => {
    const meta = ch[r.key] || {};
    const label = meta.label || r.key.replace('_', ' ');
    const value = formatUnit(r.key, r.v, durationMin, 'III', null, null, false, null);
    const tip = value ? `${meta.what || ''} — this session: ${value}` : `${meta.what || ''}`;
    return `<span class="sun-chip sun-chip-tier-${r.tier}" data-channel="${escapeAttr(r.key)}" title="${escapeAttr(tip)}">
      <span class="sun-chip-icon">${meta.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      ${value ? `<span class="sun-chip-value">${escapeHTML(value)}</span>` : ''}
    </span>`;
  }).join('');
  return `<div class="sun-channel-chips light-session-device-channels">${chips}</div>`;
}

function _renderSessionRowsHTML(rows) {
  const devices = (window.getDevices && window.getDevices()) || [];
  const deviceById = Object.fromEntries(devices.map(d => [d.id, d]));
  const renderSunRow = window.renderSunSessionRow;
  let html = '';
  for (const row of rows) {
    if (row.kind === 'sun' && renderSunRow) {
      html += renderSunRow(row.sess);
    } else if (row.kind === 'device') {
      const sess = row.sess;
      const dev = deviceById[sess.deviceId];
      const devName = dev ? `${dev.brand} ${dev.model}` : 'Removed device';
      const date = formatDate(new Date(row.startedAt).toISOString().slice(0, 10));
      const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : '—';
      const meta = `${dur} @ ${sess.distanceCm}cm · ${sess.bodyArea || ''}${sess.eyesProtected ? ' · eyes protected' : ''}`;
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
      const devAriaLabel = `Open ${date} device session details — ${devName}${modeAria}`;
      html += `<div class="sun-session light-session-row light-session-device" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="${escapeAttr(devAriaLabel)}" onclick="window.openDeviceSessionDetail && window.openDeviceSessionDetail('${escapeAttr(sess.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openDeviceSessionDetail && window.openDeviceSessionDetail('${escapeAttr(sess.id)}')}">
        <div class="sun-session-head">
          <span class="light-session-icon" aria-hidden="true">🔴</span>
          <span class="sun-session-date">${escapeHTML(date)}</span>
          <span class="sun-session-duration">${escapeHTML(dur)}</span>
          <span class="light-session-kind">${escapeHTML(devName)}</span>
          ${modeBadge}
          <button class="sun-session-delete" onclick="event.stopPropagation();window.deleteDeviceSession && window.deleteDeviceSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
        </div>
        <div class="sun-session-meta">${escapeHTML(meta)}</div>
        ${_renderLightSessionChannelChips(sess.doses, sess.durationMin || 0)}
        ${window.renderDeviceSessionAIInline ? window.renderDeviceSessionAIInline(sess) : ''}
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
    html += `<button class="light-sessions-show-more" onclick="window._openAllSessionsModal()">View all ${totalCount} sessions</button>`;
  }
  return html;
}

// Modal listing every session — opened from the "View all" button so
// the Light & Sun page itself stays compact. Reuses the same per-row
// renderer as the inline list.
export function _openAllSessionsModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-sessions-modal-overlay';
  let _detach = () => {};
  const _removeOverlay = overlay.remove.bind(overlay);
  overlay.remove = () => {
    _detach();
    _removeOverlay();
  };
  const renderInto = () => {
    const { rows, hasDeviceRows } = _collectUnifiedSessionRows();
    const sunCount = rows.filter(row => row.kind === 'sun').length;
    const deviceCount = rows.filter(row => row.kind === 'device').length;
    const lastLabel = rows[0]?.startedAt
      ? formatDate(new Date(rows[0].startedAt).toISOString().slice(0, 10))
      : '—';
    const title = `All sessions (${rows.length})`;
    overlay.innerHTML = `<div class="modal light-sessions-modal" role="dialog" aria-modal="true" aria-labelledby="light-all-sessions-title">
      <header class="light-sessions-modal-head">
        <div>
          <h3 id="light-all-sessions-title">${escapeHTML(title)}</h3>
          <p>Outdoor sun and therapy device history</p>
        </div>
        <button class="modal-close" aria-label="Close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </header>
      <div class="light-sessions-modal-summary" aria-label="Session summary">
        <div><span>Total</span><strong>${rows.length}</strong></div>
        <div><span>Sun</span><strong>${sunCount}</strong></div>
        <div><span>Device</span><strong>${deviceCount}</strong></div>
        <div><span>Latest</span><strong>${escapeHTML(lastLabel)}</strong></div>
      </div>
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
  const onSync = () => {
    if (!document.body.contains(overlay)) { _detach(); return; }
    renderInto();
  };
  _detach = () => {
    window.removeEventListener('labcharts-ai-verdict-updated', onSync);
    window.removeEventListener('labcharts-sync-applied', onSync);
  };
  window.addEventListener('labcharts-ai-verdict-updated', onSync);
  window.addEventListener('labcharts-sync-applied', onSync);
  const eventElement = (target) => {
    if (!target) return null;
    if (target.closest) return target;
    const parent = target.parentElement || target.parentNode;
    return parent?.closest ? parent : null;
  };
  overlay.addEventListener('click', (event) => {
    const target = eventElement(event.target);
    const row = target?.closest?.('.sun-session[role="button"]');
    if (!row || !overlay.contains(row)) return;
    if (target?.closest?.('button, a, input, select, textarea, [role="menuitem"]')) return;
    setTimeout(() => overlay.remove(), 0);
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = eventElement(event.target);
    const row = target?.closest?.('.sun-session[role="button"]');
    if (!row || !overlay.contains(row)) return;
    setTimeout(() => overlay.remove(), 0);
  });
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}
}
