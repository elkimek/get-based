// light-env-audits.js — saved Light Environment snapshots and compare UI.
//
// The live environment remains owned by light-env.js. This module receives
// environment access, room severity, and UI refresh callbacks through
// configureLightEnvAudits() so audit storage/rendering can stay separate
// without importing light-env.js back into itself.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';

// Mirrors the EMF Assessment pattern: each audit is a dated, labeled,
// immutable snapshot of the rooms + screens + recent measurements at
// that point in time. Used for the "measure -> mitigate -> re-measure ->
// see delta" loop. The live `lightEnvironment.rooms[]` continues to
// drive AI weighting; audits are pure historical records.
//
// Audit shape:
//   { id, date (YYYY-MM-DD), label, notes, rooms: [...deep-copy],
//     screens: [...deep-copy], measurements: [...last 30d, deep-copy],
//     createdAt, updatedAt? }

const auditDeps = {
  getEnvironment: () => state.importedData?.lightEnvironment || null,
  computeRoomSeverity: () => ({
    tier: 0,
    color: 'incomplete',
    label: 'Needs setup',
    reason: 'Light environment unavailable',
  }),
  refreshLightEnvironmentUI: () => {},
};

const LIGHT_AUDITS_ANCHOR = '.light-audits-block';
const AUDITS_DEFAULT_CAP = 2;

let _expandedAuditId = null;
let _auditCompareMode = false;
let _showAllAudits = false;
let _auditsBlockOpen = false;

export function configureLightEnvAudits(deps = {}) {
  Object.assign(auditDeps, deps);
  installWindowHandlers();
}

function getEnvironmentSnapshot() {
  return auditDeps.getEnvironment();
}

function computeRoomSeverity(room, measurements) {
  return auditDeps.computeRoomSeverity(room, measurements);
}

function refreshLightEnvironmentUI(options = {}) {
  auditDeps.refreshLightEnvironmentUI(options);
}

function refreshAuditsUI() {
  _auditsBlockOpen = true;
  refreshLightEnvironmentUI({ scrollAnchor: LIGHT_AUDITS_ANCHOR });
}

function cssAttrSelectorValue(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function lightAuditCardAnchor(id) {
  return `.light-audit-card[data-id="${cssAttrSelectorValue(id)}"]`;
}

function refreshAuditCardUI(id) {
  _auditsBlockOpen = true;
  refreshLightEnvironmentUI({
    scrollAnchor: lightAuditCardAnchor(id),
    fallbackScrollAnchor: LIGHT_AUDITS_ANCHOR,
  });
}

export function getLightAudits() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightAudits)) state.importedData.lightAudits = [];
  return state.importedData.lightAudits;
}

export async function saveLightAudit(label = '') {
  const env = getEnvironmentSnapshot();
  if (!env) return null;
  const audits = getLightAudits();
  // Snapshot only room-mapped measurements. Unmapped readings do not
  // have enough context to grade or compare an environment change.
  const roomIds = new Set((env.rooms || []).map(r => r.id).filter(Boolean));
  const measurements = (state.importedData?.lightMeasurements || [])
    .filter(m => m?.roomId && roomIds.has(m.roomId))
    .map(m => ({ ...m }));
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const audit = {
    id: `la_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    date,
    label: label || `Audit ${audits.length + 1}`,
    notes: '',
    rooms: JSON.parse(JSON.stringify(env.rooms || [])),
    screens: JSON.parse(JSON.stringify(env.screens || [])),
    measurements,
    createdAt: Date.now(),
  };
  audits.push(audit);
  await saveImportedData();
  // Audits are explicit checkpoint events — saving one is the user
  // saying "freeze my environment as it is now." Auto-fire the AI
  // verdict so the snapshot is interpretable from the moment it lands,
  // same way session-stop and onboarding-save do. Manual refresh on the
  // card re-rolls. Best-effort, no-throw — sync push handles propagation.
  if (typeof window !== 'undefined' && window.maybeAnalyzeAuditAfterSave) {
    try { window.maybeAnalyzeAuditAfterSave(audit); } catch (_) {}
  }
  return audit;
}

export async function updateLightAudit(id, patch) {
  const audits = getLightAudits();
  const a = audits.find(x => x.id === id);
  if (!a) return;
  Object.assign(a, patch);
  a.updatedAt = Date.now();
  await saveImportedData();
}

export async function deleteLightAudit(id) {
  deleteImportedArrayItems(state.importedData, 'lightAudits', a => a.id === id);
  await saveImportedData();
}

// Worst-room-tier rolls up to the audit-level severity badge.
function computeAuditSeverity(audit) {
  const rooms = audit?.rooms || [];
  const measurements = audit?.measurements || [];
  let worstTier = 0;
  for (const r of rooms) {
    const roomMeas = measurements.filter(m => m.roomId === r.id);
    const sev = computeRoomSeverity(r, roomMeas);
    if (sev.tier > worstTier) worstTier = sev.tier;
  }
  const colorMap = ['green', 'yellow', 'orange', 'red', 'red'];
  const labelMap = ['Good', 'Mild', 'Moderate', 'Concerning', 'Severe'];
  return { tier: worstTier, color: colorMap[Math.min(worstTier, 4)], label: labelMap[Math.min(worstTier, 4)] };
}

// Most-recent measurement of a tool, scoped to a room, inside an audit.
function latestInAudit(audit, tool, roomId) {
  return (audit?.measurements || [])
    .filter(m => m.tool === tool && m.roomId === roomId)
    .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))[0];
}

function fmtAuditDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function flickerLabel(score) {
  return ['Pristine', 'Mild', 'Moderate', 'Severe'][Math.min(3, Math.max(0, Math.round(score)))] || String(score);
}

function sortAuditsNewestFirst(audits) {
  return audits.slice().sort((a, b) => {
    const byDate = (b.date || '').localeCompare(a.date || '');
    if (byDate) return byDate;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function keepAuditVisible(id) {
  const visibleIds = new Set(sortAuditsNewestFirst(getLightAudits()).slice(0, AUDITS_DEFAULT_CAP).map(a => a.id));
  if (!visibleIds.has(id)) _showAllAudits = true;
}

function renderLightAuditCard(a, expanded) {
  const sev = computeAuditSeverity(a);
  const roomsCount = (a.rooms || []).length;
  const measCount = (a.measurements || []).length;
  const cardAriaLabel = `${fmtAuditDate(a.date)}${a.label ? ' — ' + a.label : ''} — ${roomsCount} room${roomsCount === 1 ? '' : 's'}, ${measCount} measurement${measCount === 1 ? '' : 's'}, ${sev.label}${expanded ? ', expanded' : ', collapsed'}`;
  let html = `<div class="light-audit-card${expanded ? ' expanded' : ''}" data-id="${escapeAttr(a.id)}">
    <div class="light-audit-header" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeAttr(cardAriaLabel)}" onclick="window.toggleLightAudit('${escapeAttr(a.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.toggleLightAudit('${escapeAttr(a.id)}')}">
      <div class="light-audit-info">
        <div class="light-audit-info-top">
          ${typeof window !== 'undefined' && window.renderAuditAIDot ? window.renderAuditAIDot(a) : ''}
          <span class="light-audit-date">${escapeHTML(fmtAuditDate(a.date))}</span>
          ${a.label ? `<span class="light-audit-label">${escapeHTML(a.label)}</span>` : ''}
        </div>
        <span class="light-audit-meta">${roomsCount} room${roomsCount === 1 ? '' : 's'} · ${measCount} measurement${measCount === 1 ? '' : 's'}</span>
      </div>
      <span class="light-env-sev-dot light-env-sev-${sev.color}" title="${escapeAttr(sev.label)}"><span class="sr-only">${escapeHTML(sev.label)}</span></span>
    </div>`;
  if (expanded) html += renderLightAuditDetail(a);
  html += `</div>`;
  return html;
}

// Pull the per-channel measurement values for a room inside an audit.
// Returns null for any tool that has no reading; callers decide whether
// to render the row at all.
function _auditRoomChannels(audit, room) {
  const lux = latestInAudit(audit, 'lux', room.id);
  const dark = latestInAudit(audit, 'darkness', room.id);
  const fli = latestInAudit(audit, 'flicker', room.id);
  const cct = latestInAudit(audit, 'cct', room.id);
  const spec = latestInAudit(audit, 'spectrum', room.id);
  return [
    lux ? { key: 'lux', label: 'Lux', text: `${Math.round(lux.value)} lux` } : null,
    dark ? { key: 'darkness', label: 'Darkness', text: `${(+dark.value).toFixed(2)} lux` } : null,
    fli ? { key: 'flicker', label: 'Flicker', text: flickerLabel(fli.value) } : null,
    cct ? { key: 'cct', label: 'CCT', text: `${cct.value} K` } : null,
    spec?.extra?.melanopic != null
      ? { key: 'melanopic', label: 'Melanopic', text: `${(spec.extra.melanopic * 100).toFixed(0)}%` }
      : null,
  ].filter(Boolean);
}

function renderLightAuditDetail(a) {
  const auditIdAttr = escapeAttr(a.id);
  let html = `<div class="light-audit-detail">
    <div class="light-audit-meta-row">
      <label class="light-audit-meta-field light-audit-meta-field--date">
        <span class="light-audit-meta-field-text">Date</span>
        <input type="date" class="ctx-input" value="${escapeAttr(a.date)}" aria-label="Audit date" onchange="window.updateLightAuditField('${auditIdAttr}','date',this.value)">
      </label>
      <label class="light-audit-meta-field light-audit-meta-field--label">
        <span class="light-audit-meta-field-text">Label</span>
        <input type="text" class="ctx-input" value="${escapeHTML(a.label || '')}" placeholder="e.g. Pre-mitigation" aria-label="Audit label" onchange="window.updateLightAuditField('${auditIdAttr}','label',this.value)">
      </label>
    </div>
    ${typeof window !== 'undefined' && window.renderAuditAIBlock ? window.renderAuditAIBlock(a) : ''}`;

  if (!(a.rooms || []).length) {
    html += `<p class="light-audit-empty">No rooms in this audit's snapshot.</p>`;
  } else {
    html += `<div class="light-audit-rooms">`;
    for (const r of a.rooms) {
      const roomMeas = (a.measurements || []).filter(m => m.roomId === r.id);
      const sev = computeRoomSeverity(r, roomMeas);
      const channels = _auditRoomChannels(a, r);
      html += `<div class="light-audit-room-card">
        <div class="light-audit-room-head">
          <span class="light-env-sev-dot light-env-sev-${sev.color}"></span>
          <span class="light-audit-room-name">${escapeHTML(r.name || 'Room')}</span>
          <span class="light-audit-room-status light-audit-room-status-${sev.color}">${escapeHTML(sev.label)}</span>
        </div>`;
      if (channels.length === 0) {
        html += `<p class="light-audit-room-empty">No measurements taken in this room before the snapshot.</p>`;
      } else {
        html += `<div class="light-audit-room-channels">`;
        for (const ch of channels) {
          html += `<div class="light-audit-channel">
            <span class="light-audit-channel-label">${escapeHTML(ch.label)}</span>
            <span class="light-audit-channel-value">${escapeHTML(ch.text)}</span>
          </div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="light-audit-footer">
      <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="window.deleteLightAuditConfirm('${escapeAttr(a.id)}')">Delete audit</button>
    </div>
  </div>`;
  return html;
}

// Compare-view directional arrow + color. `better` says which direction
// improvement looks like ('lower', 'higher', or 'depends' = neutral).
function _compareArrow(delta, better) {
  const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
  let color = 'var(--text-muted)';
  if (better === 'lower') color = delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : color;
  else if (better === 'higher') color = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : color;
  return `<span class="light-audit-arrow" style="color:${color}">${arrow}</span>`;
}

// Per-channel metadata for compare. `better` is the improvement direction:
// darkness/flicker/melanopic down = better (sleep-safer); lux/CCT depend
// on time-of-day so neutral arrow color (we still show direction).
const COMPARE_CHANNELS = [
  { tool: 'lux',      label: 'Lux',       fmt: v => `${Math.round(v)} lux`,        better: 'depends' },
  { tool: 'darkness', label: 'Darkness',  fmt: v => `${(+v).toFixed(2)} lux`,      better: 'lower' },
  { tool: 'flicker',  label: 'Flicker',   fmt: v => flickerLabel(v),               better: 'lower' },
  { tool: 'cct',      label: 'CCT',       fmt: v => `${v} K`,                      better: 'depends' },
];

// Serialize an audit pair into a plain-text comparison the AI can
// reason about. Format mirrors EMF's interpretEMFComparison but stays
// terse — only rooms with measurements show up, channels are labeled
// in plain English, deltas are explicit.
function serializeAuditComparison(a1, a2) {
  const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString();
  const lines = [];
  lines.push(`Light environment audit comparison`);
  lines.push(`Before: ${fmtDate(a1.date)}${a1.label ? ` (${a1.label})` : ''}`);
  lines.push(`After:  ${fmtDate(a2.date)}${a2.label ? ` (${a2.label})` : ''}`);
  lines.push('');

  const roomNames = [...new Set([
    ...(a1.rooms || []).map(r => r.name),
    ...(a2.rooms || []).map(r => r.name),
  ])];

  for (const name of roomNames) {
    const r1 = (a1.rooms || []).find(r => r.name === name);
    const r2 = (a2.rooms || []).find(r => r.name === name);
    const sev1 = r1 ? computeRoomSeverity(r1, (a1.measurements || []).filter(m => m.roomId === r1.id)) : null;
    const sev2 = r2 ? computeRoomSeverity(r2, (a2.measurements || []).filter(m => m.roomId === r2.id)) : null;
    const channels = [];
    for (const ch of COMPARE_CHANNELS) {
      const m1 = r1 ? latestInAudit(a1, ch.tool, r1.id) : null;
      const m2 = r2 ? latestInAudit(a2, ch.tool, r2.id) : null;
      if (!m1 && !m2) continue;
      const before = m1 ? ch.fmt(m1.value) : '—';
      const after = m2 ? ch.fmt(m2.value) : '—';
      channels.push(`  ${ch.label}: ${before} → ${after}`);
    }
    const sp1 = r1 ? latestInAudit(a1, 'spectrum', r1.id) : null;
    const sp2 = r2 ? latestInAudit(a2, 'spectrum', r2.id) : null;
    const mel1 = sp1?.extra?.melanopic;
    const mel2 = sp2?.extra?.melanopic;
    if (mel1 != null || mel2 != null) {
      const before = mel1 != null ? `${(mel1 * 100).toFixed(0)}%` : '—';
      const after = mel2 != null ? `${(mel2 * 100).toFixed(0)}%` : '—';
      channels.push(`  Melanopic ratio: ${before} → ${after}`);
    }
    if (!channels.length && !(sev1 || sev2)) continue;
    let header = `Room: ${name}`;
    if (sev1 && sev2) header += ` — status ${sev1.label} → ${sev2.label}`;
    else if (sev2) header += ` — status (new) ${sev2.label}`;
    else if (sev1) header += ` — status ${sev1.label} (room since removed)`;
    lines.push(header);
    if (channels.length) lines.push(...channels);
    else lines.push('  (no measurements)');
    lines.push('');
  }
  return lines.join('\n').trim();
}

function renderLightAuditCompare(audits) {
  const sorted = sortAuditsNewestFirst(audits);
  const a2 = sorted[0];        // newer (After)
  const a1 = sorted[1] || sorted[0]; // older (Before)

  // Match rooms across both audits by id (rooms deep-copy preserves the
  // live id, so room.id is stable across snapshots). Name was the
  // earlier strategy but it broke under two scenarios: (1) renaming
  // "Bedroom" -> "Master Bedroom" between audits made the after-side
  // look like a deleted room; (2) two rooms with the same name (guest
  // bedroom + main bedroom) collided into a single comparison row.
  // We build a unified key list combining ids from both sides, with
  // name as a fallback for very-old audits that predated id stability.
  const _ks1 = (a1.rooms || []).map(r => ({ key: r.id || `name:${r.name}`, room: r }));
  const _ks2 = (a2.rooms || []).map(r => ({ key: r.id || `name:${r.name}`, room: r }));
  const roomKeys = [...new Set([..._ks1.map(k => k.key), ..._ks2.map(k => k.key)])];
  const _findIn = (entries, key) => entries.find(e => e.key === key)?.room || null;

  // "Interpret changes" — only when we have an AI provider configured.
  // Opens the chat panel with a pre-filled comparison summary so the
  // user can ask the AI what shifted + what to try next. Mirrors EMF
  // assessment's Interpret Comparison flow without the heavyweight
  // streaming overlay (the chat panel already serves the same purpose).
  const hasAI = (typeof window !== 'undefined' && typeof window.hasAIProvider === 'function')
    ? window.hasAIProvider()
    : false;
  let html = `<div class="light-audit-compare-head">
    <span class="light-audit-compare-label">Before: ${escapeHTML(fmtAuditDate(a1.date))}${a1.label ? ' — ' + escapeHTML(a1.label) : ''}</span>
    <span class="light-audit-compare-arrow">→</span>
    <span class="light-audit-compare-label">After: ${escapeHTML(fmtAuditDate(a2.date))}${a2.label ? ' — ' + escapeHTML(a2.label) : ''}</span>
    ${hasAI ? `<button class="import-btn import-btn-secondary light-audit-interpret-btn" onclick="window.interpretLightAuditCompare('${escapeAttr(a1.id)}','${escapeAttr(a2.id)}')" title="Open the chat panel with a pre-filled comparison summary so the AI can interpret what changed.">✨ Interpret changes</button>` : ''}
  </div>`;

  if (sorted.length > 2) {
    html += `<div class="light-audit-compare-note">Comparing the two most recent audits. ${sorted.length - 2} earlier audit${sorted.length > 3 ? 's' : ''} not shown.</div>`;
  }

  // Stack per-room delta cards — one card per room with measurements.
  // Rooms with NO data on either side are skipped (a room that exists
  // in the snapshot but was never measured is just visual noise here).
  html += `<div class="light-audit-compare-rooms">`;

  let renderedAny = false;
  for (const key of roomKeys) {
    const r1 = _findIn(_ks1, key);
    const r2 = _findIn(_ks2, key);
    // Display name prefers the after-side (most recent rename wins);
    // fall back to before-side, then to a literal "?" so a malformed
    // entry can't crash the loop.
    const name = (r2 && r2.name) || (r1 && r1.name) || '?';
    const sev1 = r1 ? computeRoomSeverity(r1, (a1.measurements || []).filter(m => m.roomId === r1.id)) : null;
    const sev2 = r2 ? computeRoomSeverity(r2, (a2.measurements || []).filter(m => m.roomId === r2.id)) : null;

    // Build the list of comparable rows — only channels that have data
    // on at least ONE side. A row with both sides null is dropped.
    const rows = [];
    for (const ch of COMPARE_CHANNELS) {
      const m1 = r1 ? latestInAudit(a1, ch.tool, r1.id) : null;
      const m2 = r2 ? latestInAudit(a2, ch.tool, r2.id) : null;
      if (!m1 && !m2) continue;
      rows.push({ ch, m1, m2 });
    }
    // Melanopic comes from spectrum.extra.
    const sp1 = r1 ? latestInAudit(a1, 'spectrum', r1.id) : null;
    const sp2 = r2 ? latestInAudit(a2, 'spectrum', r2.id) : null;
    const mel1 = sp1?.extra?.melanopic;
    const mel2 = sp2?.extra?.melanopic;
    const hasMelanopic = mel1 != null || mel2 != null;

    // Skip rooms that have no measurements on either side AND no
    // severity flip worth surfacing.
    const sevChange = sev1 && sev2 && sev1.tier !== sev2.tier;
    if (!rows.length && !hasMelanopic && !sevChange) continue;
    renderedAny = true;

    // Card header — severity dot before/arrow/dot after, room name,
    // verdict label. Verdict keys stay single-word so they're valid CSS
    // class suffixes; the displayed label can differ (`unchanged` ->
    // "no change" reads more naturally as a verdict).
    const verdict = sevChange
      ? (sev2.tier < sev1.tier ? 'improved' : 'regressed')
      : (rows.length || hasMelanopic ? 'measured' : 'unchanged');
    const verdictLabel = verdict === 'unchanged' ? 'no change' : verdict;
    html += `<div class="light-audit-compare-room light-audit-compare-room-${verdict}">
      <div class="light-audit-compare-room-head">
        ${sev1 ? `<span class="light-env-sev-dot light-env-sev-${sev1.color}" title="Before"></span>` : '<span class="light-audit-sev-empty"></span>'}
        <span class="light-audit-arrow" style="color:var(--text-muted)">→</span>
        ${sev2 ? `<span class="light-env-sev-dot light-env-sev-${sev2.color}" title="After"></span>` : '<span class="light-audit-sev-empty"></span>'}
        <span class="light-audit-compare-room-name">${escapeHTML(name)}</span>
        <span class="light-audit-compare-verdict light-audit-compare-verdict-${verdict}">${escapeHTML(verdictLabel)}</span>
      </div>`;

    // Per-channel rows — `before -> after` with arrow per channel.
    if (rows.length || hasMelanopic) {
      html += `<div class="light-audit-compare-channels">`;
      for (const { ch, m1, m2 } of rows) {
        const before = m1 ? ch.fmt(m1.value) : '—';
        const after = m2 ? ch.fmt(m2.value) : '—';
        const arrow = (m1 && m2) ? _compareArrow((+m2.value) - (+m1.value), ch.better) : '<span class="light-audit-arrow" style="color:var(--text-muted)">→</span>';
        html += `<div class="light-audit-compare-channel">
          <span class="light-audit-compare-channel-label">${escapeHTML(ch.label)}</span>
          <span class="light-audit-compare-channel-before">${escapeHTML(before)}</span>
          ${arrow}
          <span class="light-audit-compare-channel-after">${escapeHTML(after)}</span>
        </div>`;
      }
      if (hasMelanopic) {
        const before = mel1 != null ? `${(mel1 * 100).toFixed(0)}%` : '—';
        const after = mel2 != null ? `${(mel2 * 100).toFixed(0)}%` : '—';
        let arrow;
        if (mel1 != null && mel2 != null) {
          const delta = mel2 - mel1;
          // +/-2pp deadband -> noise doesn't paint green/red.
          const better = Math.abs(delta) < 0.02 ? 'depends' : 'lower';
          arrow = _compareArrow(delta, better);
        } else {
          arrow = '<span class="light-audit-arrow" style="color:var(--text-muted)">→</span>';
        }
        html += `<div class="light-audit-compare-channel">
          <span class="light-audit-compare-channel-label">Melanopic</span>
          <span class="light-audit-compare-channel-before">${escapeHTML(before)}</span>
          ${arrow}
          <span class="light-audit-compare-channel-after">${escapeHTML(after)}</span>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  if (!renderedAny) {
    html += `<p class="light-audit-empty">Both audits have rooms but no measurements taken yet — nothing to compare. Use the Light Tools above to capture readings, then save another audit.</p>`;
  }

  html += `</div>`;
  return html;
}

export function renderLightAuditsBlock() {
  const audits = getLightAudits();
  // When two or more audits exist, Compare becomes the primary action.
  // Bumped to import-btn-primary so it is visually weighted ahead of
  // "Save audit".
  const compareBtn = audits.length >= 2
    ? `<button class="import-btn ${_auditCompareMode ? 'import-btn-secondary' : 'import-btn-primary'}" onclick="event.preventDefault();event.stopPropagation();window.toggleLightAuditCompare()">${_auditCompareMode ? 'Exit compare' : '⇄ Compare'}</button>`
    : '';
  const openAttr = (_auditsBlockOpen || _auditCompareMode || _expandedAuditId) ? ' open' : '';
  let html = `<details class="light-env-block light-audits-block"${openAttr} ontoggle="window.setLightAuditsBlockOpen(this.open)">
    <summary class="light-env-block-head light-audits-summary">
      <strong>Light audits</strong>
      <div class="light-audit-actions">
        ${compareBtn}
        <button class="import-btn import-btn-secondary" onclick="event.preventDefault();event.stopPropagation();window.saveLightAuditFromUI()" title="Snapshot the current rooms + screens + recent measurements as a dated audit. Save another after you make changes (warmer bulbs, blackouts, blue blockers) to unlock the side-by-side compare.">+ Save audit</button>
      </div>
    </summary>`;

  if (audits.length === 0) {
    html += `<p class="light-env-empty">Snapshot your rooms + measurements so you can see what a change actually did. Run the tools, save a "Before" audit, make a change (warmer bulbs, blackouts, blue blockers), save an "After". Once you have two, Compare lights up and you'll see the deltas per room.</p>`;
  } else if (audits.length === 1) {
    // Surface the "save another to compare" hint inline with the single
    // saved audit — without it, Compare seems to materialize from nowhere.
    html += `<p class="light-audit-hint">Save a second audit after making changes to unlock the side-by-side comparison.</p>`;
  }
  if (_auditCompareMode && audits.length >= 2) {
    html += renderLightAuditCompare(audits);
  } else if (audits.length > 0) {
    const sorted = sortAuditsNewestFirst(audits);
    const visibleAudits = _showAllAudits ? sorted : sorted.slice(0, AUDITS_DEFAULT_CAP);
    const hiddenCount = sorted.length - visibleAudits.length;
    for (const a of visibleAudits) {
      html += renderLightAuditCard(a, _expandedAuditId === a.id);
    }
    if (hiddenCount > 0) {
      html += `<button class="light-audit-show-more" onclick="event.preventDefault();event.stopPropagation();window.toggleLightAuditHistory()">
        Show ${hiddenCount} older audit${hiddenCount === 1 ? '' : 's'}
      </button>`;
    } else if (_showAllAudits && sorted.length > AUDITS_DEFAULT_CAP) {
      html += `<button class="light-audit-show-more" onclick="event.preventDefault();event.stopPropagation();window.toggleLightAuditHistory()">
        Show only latest ${AUDITS_DEFAULT_CAP} audits
      </button>`;
    }
  }

  html += `</details>`;
  return html;
}

function installWindowHandlers() {
  if (typeof window === 'undefined') return;
  Object.assign(window, {
    getLightAudits,
    saveLightAuditFromUI: async () => {
      const defaultLabel = `Audit ${getLightAudits().length + 1}`;
      const label = await showPromptDialog('Audit label (e.g. "Pre-mitigation", "After LED swap")', {
        defaultValue: defaultLabel,
        okLabel: 'Save audit',
        placeholder: 'Audit label',
      });
      // showPromptDialog resolves to null on Cancel/Esc/backdrop-click.
      if (label === null) return;
      const trimmed = label.trim() || defaultLabel;
      const audit = await saveLightAudit(trimmed);
      if (audit) {
        showNotification(`Saved audit: ${audit.label}`);
        _expandedAuditId = audit.id;
        _showAllAudits = false;
        refreshAuditCardUI(audit.id);
      }
    },
    toggleLightAudit: (id) => {
      _expandedAuditId = (_expandedAuditId === id) ? null : id;
      refreshAuditCardUI(id);
    },
    toggleLightAuditCompare: () => {
      _auditCompareMode = !_auditCompareMode;
      _expandedAuditId = null;
      refreshAuditsUI();
    },
    toggleLightAuditHistory: () => {
      _showAllAudits = !_showAllAudits;
      if (!_showAllAudits && _expandedAuditId) {
        const visibleIds = new Set(sortAuditsNewestFirst(getLightAudits()).slice(0, AUDITS_DEFAULT_CAP).map(a => a.id));
        if (!visibleIds.has(_expandedAuditId)) _expandedAuditId = null;
      }
      refreshAuditsUI();
    },
    setLightAuditsBlockOpen: (open) => {
      _auditsBlockOpen = !!open;
    },
    updateLightAuditField: async (id, field, value) => {
      await updateLightAudit(id, { [field]: value });
      _expandedAuditId = id;
      keepAuditVisible(id);
      refreshAuditCardUI(id);
    },
    deleteLightAuditConfirm: async (id) => {
      if (await showConfirmDialog('Delete this audit? This cannot be undone.')) {
        const deletingExpandedAudit = _expandedAuditId === id;
        await deleteLightAudit(id);
        _auditsBlockOpen = true;
        if (getLightAudits().length < 2) _auditCompareMode = false;
        if (deletingExpandedAudit) {
          _expandedAuditId = sortAuditsNewestFirst(getLightAudits())[0]?.id || null;
        }
        if (_expandedAuditId) {
          keepAuditVisible(_expandedAuditId);
          refreshAuditCardUI(_expandedAuditId);
        } else {
          refreshAuditsUI();
        }
      }
    },
    // "Interpret changes" — pre-fills the chat panel with a comparison
    // summary so the AI can reason about what shifted and what to try
    // next. Lighter-weight than EMF's dedicated streaming overlay; the
    // chat panel already covers the same use case (and lets the user
    // follow up with questions inline).
    interpretLightAuditCompare: (oldId, newId) => {
      const audits = getLightAudits();
      const a1 = audits.find(a => a.id === oldId);
      const a2 = audits.find(a => a.id === newId);
      if (!a1 || !a2) {
        showNotification('Could not find one of the audits to compare.', 'error');
        return;
      }
      const summary = serializeAuditComparison(a1, a2);
      const prompt = `Here is a Light Environment audit comparison from my home. ` +
        `Walk me through what improved, what regressed, and what one or two changes ` +
        `would have the biggest circadian impact next.\n\n${summary}`;
      if (typeof window.openChatPanel === 'function') {
        window.openChatPanel(prompt);
      } else {
        showNotification('Chat panel unavailable on this build.', 'error');
      }
    },
  });
}
