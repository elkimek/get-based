// marker-detail-modal.js — Marker detail, manual entry, custom marker, and range modal flows

import { state } from './state.js';
import { trackUsage, UNIT_CONVERSIONS, getAlternateUnit, convertUserInputToSI } from './schema.js';
import { escapeHTML, escapeAttr, getStatus, formatValue, showNotification, showConfirmDialog, showPromptDialog, safeMarkerId } from './utils.js';
import { getActiveData, getEffectiveRange, getEffectiveRangeForDate, saveImportedData, recalculateHOMAIR, updateHeaderDates, convertDisplayToSI } from './data.js';
import { createLineChart, getMarkerDescription } from './charts.js';
import { closeSuggestionsOnClickOutside } from './context-cards.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, getActiveModelId } from './api.js';

const markerDetailDeps = {
  navigate: (category, data) => window.navigate?.(category, data),
  isDashboardQuickMarkerPinned: () => false,
  showEmojiPicker: () => {},
};

export function configureMarkerDetailModal(deps = {}) {
  Object.assign(markerDetailDeps, deps);
}

function setDetailModalShell(...classes) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

// Remembered focus before a detail modal opens, so closeModal() can return
// focus to the trigger. Keyboard users otherwise land on <body> after close
// and lose their place in the page.
let _modalLastTrigger = null;
export function rememberModalTrigger() {
  const el = document.activeElement;
  _modalLastTrigger = (el && el !== document.body && typeof el.focus === 'function') ? el : null;
}
function restoreModalTrigger() {
  const el = _modalLastTrigger;
  _modalLastTrigger = null;
  if (!el || !document.contains(el)) return;
  try { el.focus(); } catch { /* element may have been replaced */ }
}

// Marker detail modals are already a focused view, so keep history compact by
// default and expand in place instead of opening a nested history modal.
const MARKER_HISTORY_DEFAULT_CAP = 3;
const MARKER_HISTORY_EXPANDED_CAP = 40;

// ═══════════════════════════════════════════════
// DETAIL MODAL & MANUAL ENTRY
// ═══════════════════════════════════════════════

export async function fetchCustomMarkerDescription(markerId, markerName, unit) {
  const cacheKey = 'labcharts-marker-desc';
  const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  if (cache[markerId]) return cache[markerId];
  if (!hasAIProvider()) return null;
  try {
    const descResult = await callClaudeAPI({
      system: 'You are a concise medical reference. Reply with exactly one sentence (max 30 words) explaining what this blood biomarker measures and why it matters clinically. No preamble.',
      messages: [{ role: 'user', content: `${markerName} (${unit})` }],
      maxTokens: 100
    });
    if (descResult && descResult.usage) {
      trackUsage(getAIProvider(), getActiveModelId(), descResult.usage.inputTokens || 0, descResult.usage.outputTokens || 0);
    }
    const resp = (descResult && descResult.text) || '';
    const text = resp.trim();
    if (text) {
      cache[markerId] = text;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    }
    return text || null;
  } catch { return null; }
}

export function showDetailModal(id, opts = {}) {
  // id is interpolated into multiple inline-onclick handlers in the modal
  // body (Add Value, Save/Cancel/Delete note, Ask AI, Delete custom marker).
  // Reject anything outside the strict allowlist so a poisoned customMarker
  // key can't break out of the JS string context.
  if (!safeMarkerId(id)) return;
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  let marker = data.categories[catKey]?.markers[mKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return;
  // Remember which marker is open so toggleAltUnits can re-render in place.
  state._activeDetailMarkerId = id;
  rememberModalTrigger();
  const modal = setDetailModalShell('marker-detail-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return;
  const dates = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : data.dateLabels;
  const r = getEffectiveRange(marker);
  const modalPoints = marker.values.map((v, i) => ({ v, i })).filter(x => x.v !== null && x.v !== undefined);
  const showAllHistory = !!opts.showAllHistory;
  const requestedHistoryLimit = Number.isFinite(opts.historyLimit)
    ? Math.max(MARKER_HISTORY_DEFAULT_CAP, Math.floor(opts.historyLimit))
    : MARKER_HISTORY_EXPANDED_CAP;
  const expandedHistoryLimit = Math.min(modalPoints.length, requestedHistoryLimit);
  const visibleHistoryPoints = showAllHistory ? modalPoints.slice(-expandedHistoryLimit) : modalPoints.slice(-MARKER_HISTORY_DEFAULT_CAP);
  const hiddenHistoryCount = modalPoints.length - visibleHistoryPoints.length;
  const latestPoint = modalPoints[modalPoints.length - 1] || null;
  const prevPoint = modalPoints.length > 1 ? modalPoints[modalPoints.length - 2] : null;
  const firstPoint = modalPoints[0] || null;
  const latestRange = latestPoint ? getEffectiveRangeForDate(marker, latestPoint.i) : r;
  const latestStatus = latestPoint ? getStatus(latestPoint.v, latestRange.min, latestRange.max) : 'missing';
  const statusText = latestStatus === 'normal' ? 'In range'
    : latestStatus === 'high' ? 'Above range'
    : latestStatus === 'low' ? 'Below range'
    : 'No value';
  const deltaFromPrev = latestPoint && prevPoint && Number(prevPoint.v) !== 0
    ? (((Number(latestPoint.v) - Number(prevPoint.v)) / Number(prevPoint.v)) * 100)
    : null;
  const deltaFromFirst = latestPoint && firstPoint && Number(firstPoint.v) !== 0
    ? (((Number(latestPoint.v) - Number(firstPoint.v)) / Number(firstPoint.v)) * 100)
    : null;
  const latestUnit = marker.unit || '';
  const latestDisplay = latestPoint ? formatValue(latestPoint.v) : '—';
  const latestDateLabel = latestPoint ? (dates[latestPoint.i] || 'Latest') : 'No values';
  const hasReferenceRange = marker.refMin != null || marker.refMax != null;
  const referenceMinDisplay = hasReferenceRange && marker.refMin != null ? formatValue(marker.refMin) : latestRange.min != null ? formatValue(latestRange.min) : '—';
  const referenceMaxDisplay = hasReferenceRange && marker.refMax != null ? formatValue(marker.refMax) : latestRange.max != null ? formatValue(latestRange.max) : '—';
  const referenceDisplay = `${referenceMinDisplay}–${referenceMaxDisplay} ${latestUnit}`.trim();
  const referenceMetaLabel = hasReferenceRange ? 'Ref' : 'Range';
  const hasOptimalRange = marker.optimalMin != null && marker.optimalMax != null;
  const optimalDisplay = `${marker.optimalMin != null ? formatValue(marker.optimalMin) : '—'}–${marker.optimalMax != null ? formatValue(marker.optimalMax) : '—'} ${latestUnit}`.trim();
  const rangeMainDisplay = hasOptimalRange ? optimalDisplay : referenceDisplay;
  const rangeMainLabel = hasOptimalRange ? 'optimal' : referenceMetaLabel.toLowerCase();
  const clampPct = value => Math.max(0, Math.min(100, value));
  const numericOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const rangeBandHtml = (() => {
    const latestValue = latestPoint ? numericOrNull(latestPoint.v) : null;
    const refMin = numericOrNull(marker.refMin);
    const refMax = numericOrNull(marker.refMax);
    const effMin = numericOrNull(latestRange.min);
    const effMax = numericOrNull(latestRange.max);
    const optMin = numericOrNull(marker.optimalMin);
    const optMax = numericOrNull(marker.optimalMax);
    const baseMin = refMin ?? effMin;
    const baseMax = refMax ?? effMax;
    if (baseMin == null || baseMax == null || latestValue == null || Number(baseMax) === Number(baseMin)) return '';
    const hasOptimalBand = optMin != null && optMax != null;
    const goodMin = hasOptimalBand ? Math.min(optMin, optMax) : Math.min(baseMin, baseMax);
    const goodMax = hasOptimalBand ? Math.max(optMin, optMax) : Math.max(baseMin, baseMax);
    let min = Math.min(baseMin, baseMax);
    let max = Math.max(baseMin, baseMax);
    const goodSpan = goodMax - goodMin;
    if (goodSpan > 0) {
      const zonePad = goodSpan * 0.1;
      if (goodMin > 0) min = Math.min(min, goodMin - zonePad);
      max = Math.max(max, goodMax + zonePad);
    }
    for (const value of [goodMin, goodMax, latestValue]) {
      if (value == null) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (max === min) return '';
    let span = max - min;
    if (latestValue <= min) min -= span * 0.08;
    if (latestValue >= max) max += span * 0.08;
    span = max - min;
    if (span <= 0) return '';
    const dot = clampPct(((latestValue - min) / span) * 100);
    const optStart = clampPct(((goodMin - min) / span) * 100);
    const optEnd = clampPct(((goodMax - min) / span) * 100);
    const optLeft = optStart != null && optEnd != null ? Math.min(optStart, optEnd) : null;
    const optRight = optStart != null && optEnd != null ? Math.max(optStart, optEnd) : null;
    const optWidth = optLeft != null && optRight != null ? Math.max(0, optRight - optLeft) : 0;
    const lowZoneWidth = optLeft != null ? Math.max(0, optLeft) : 0;
    const highZoneWidth = optRight != null ? Math.max(0, 100 - optRight) : 0;
    return `<div class="gb-range-band" aria-label="Range position">
      <div class="gb-range-band-track">
        ${lowZoneWidth ? `<div class="gb-range-band-zone gb-range-band-zone-low" style="left:0%;width:${lowZoneWidth}%"></div>` : ''}
        ${highZoneWidth ? `<div class="gb-range-band-zone gb-range-band-zone-high" style="left:${optRight}%;width:${highZoneWidth}%"></div>` : ''}
        ${optWidth ? `<div class="gb-range-band-opt" style="left:${optLeft}%;width:${optWidth}%"></div>` : ''}
      </div>
      <div class="gb-range-band-dot gb-range-band-dot-${escapeAttr(latestStatus)}" style="left:${dot}%"></div>
      <div class="gb-range-band-scale"><span>${escapeHTML(formatValue(min))}</span><span>${escapeHTML(formatValue(max))}</span></div>
    </div>`;
  })();
  const dotKey = id.replace('_', '.');
  let rangeInfo = '';
  const overrides = state.importedData?.refOverrides?.[dotKey] || {};
  const refEditable = (label, min, max, type) => {
    const isEdited = type === 'optimal' ? ('optimalMin' in overrides || 'optimalMax' in overrides) : ('refMin' in overrides || 'refMax' in overrides);
    const source = type === 'optimal' ? overrides.optimalSource : overrides.refSource;
    const badgeLabel = source === 'manual' ? 'edited' : 'lab';
    const hasLabStash = type === 'optimal' ? 'labOptimalMin' in overrides : 'labRefMin' in overrides;
    const badgeTitle = source === 'manual' ? (hasLabStash ? 'Manually edited — click to revert to lab range' : 'Manually edited — click to revert to default') : 'Custom range from your lab — click to revert to default';
    const editedBadge = isEdited ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="${badgeTitle}" title="${badgeTitle}" onclick="event.stopPropagation();revertRefRange('${id}','${type}')">${badgeLabel} \u00d7</span>` : '';
    const displayMin = min != null ? min : '–';
    const displayMax = max != null ? max : '–';
    return ` &middot; ${type === 'optimal' ? '<span style="color:var(--green)">' : ''}${label}: <span class="ref-editable" role="button" tabindex="0" aria-label="Edit ${label} range" onclick="editRefRange('${id}','${type}',event)" title="Click to edit">${displayMin} \u2013 ${displayMax}</span>${editedBadge}${type === 'optimal' ? '</span>' : ''}`;
  };
  const isCustom = !!state.importedData?.customMarkers?.[dotKey];
  const hasRef = marker.refMin != null || marker.refMax != null;
  const hasOpt = marker.optimalMin != null || marker.optimalMax != null;
  if (state.rangeMode === 'both') {
    if (hasRef) rangeInfo += refEditable('Reference', marker.refMin, marker.refMax, 'ref');
    else if (isCustom) rangeInfo += refEditable('Reference', '–', '–', 'ref');
    if (hasOpt) rangeInfo += refEditable('Optimal', marker.optimalMin, marker.optimalMax, 'optimal');
    else if (isCustom) rangeInfo += refEditable('Optimal', '–', '–', 'optimal');
  } else if (state.rangeMode === 'optimal') {
    if (hasOpt) rangeInfo = refEditable('Optimal', marker.optimalMin, marker.optimalMax, 'optimal');
    else if (isCustom) rangeInfo = refEditable('Optimal', '–', '–', 'optimal');
  } else if (hasRef) {
    rangeInfo = refEditable('Reference', marker.refMin, marker.refMax, 'ref');
  } else if (isCustom) {
    rangeInfo = refEditable('Reference', '–', '–', 'ref');
  }
  const rangeCardControls = rangeInfo ? rangeInfo.replace(/^ &middot; /, '') : '';
  const isRenamed = !!state.importedData?.markerLabels?.[dotKey];
  const renameLink = isRenamed
    ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert renamed marker to original" title="Renamed — click to revert to original" onclick="event.stopPropagation();revertMarkerName('${id}')" style="cursor:pointer">renamed ×</span> <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" onclick="event.stopPropagation();renameMarker('${id}')" style="cursor:pointer;font-size:12px">rename</span>`
    : ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" onclick="event.stopPropagation();renameMarker('${id}')" style="cursor:pointer;font-size:12px">rename</span>`;
  // Dual-unit summary: render a secondary line under modal-unit when this marker
  // has a UNIT_CONVERSIONS entry AND the per-profile "show alt units" toggle is
  // on (Settings → Display). Mirrors the primary line's ranges in the other
  // system so a user reading a lab report in the non-active unit can cross-check
  // without flipping the global US/EU toggle.
  const isUSMode = state.unitSystem === 'US';
  const hasConv = !!UNIT_CONVERSIONS[dotKey];
  let altUnitInfo = '';
  if (hasConv && state.showAltUnits) {
    const probe = marker.refMax ?? marker.refMin ?? 1;
    const altProbe = getAlternateUnit(dotKey, probe, isUSMode);
    if (altProbe) {
      const altUnit = altProbe.unit;
      const altRange = (min, max) => {
        const a = min != null ? getAlternateUnit(dotKey, min, isUSMode)?.value : null;
        const b = max != null ? getAlternateUnit(dotKey, max, isUSMode)?.value : null;
        const dispA = a != null ? formatValue(a) : '–';
        const dispB = b != null ? formatValue(b) : '–';
        return `${dispA} – ${dispB}`;
      };
      let altRanges = '';
      if (state.rangeMode === 'both') {
        if (hasRef) altRanges += ` &middot; Reference: ${altRange(marker.refMin, marker.refMax)}`;
        if (hasOpt) altRanges += ` &middot; <span style="color:var(--green)">Optimal: ${altRange(marker.optimalMin, marker.optimalMax)}</span>`;
      } else if (state.rangeMode === 'optimal' && hasOpt) {
        altRanges = ` &middot; Optimal: ${altRange(marker.optimalMin, marker.optimalMax)}`;
      } else if (hasRef) {
        altRanges = ` &middot; Reference: ${altRange(marker.refMin, marker.refMax)}`;
      }
      altUnitInfo = `<div class="modal-unit modal-unit-alt" title="Same marker, alternate unit system">≈ ${escapeHTML(altUnit)}${altRanges}</div>`;
    }
  }
  const quickMarkerPinned = markerDetailDeps.isDashboardQuickMarkerPinned(id);
  const quickMarkerPinText = quickMarkerPinned ? 'Pinned' : 'Pin';
  const quickMarkerPinTitle = quickMarkerPinned ? 'Remove from Quick Markers' : 'Pin to Quick Markers';
  let html = `<div class="gb-detail-head">
      <div>
        <div class="gb-detail-kicker">${escapeHTML(data.categories[catKey]?.label || catKey)}</div>
        <h3>${escapeHTML(marker.name)}${renameLink}</h3>
        <div class="modal-unit">${escapeHTML(marker.unit)}</div>
        ${altUnitInfo}
      </div>
      <div class="gb-detail-head-actions">
        <button type="button" class="gb-detail-pin-btn${quickMarkerPinned ? ' is-pinned' : ''}" aria-pressed="${quickMarkerPinned ? 'true' : 'false'}" title="${escapeAttr(quickMarkerPinTitle)}" onclick="window.toggleDashboardQuickMarkerPin('${id}')">${escapeHTML(quickMarkerPinText)}</button>
        <span class="gb-detail-status gb-detail-status-${escapeAttr(latestStatus)}">${escapeHTML(statusText)}</span>
      </div>
      <button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    </div>
    <div class="marker-description" id="marker-desc"></div>
    <div class="gb-detail-summary">
      <div class="stat-card">
        <div class="stat-card-label">Latest</div>
        <div class="stat-card-value val-${escapeAttr(latestStatus)}">${escapeHTML(latestDisplay)}${latestUnit ? ` <span>${escapeHTML(latestUnit)}</span>` : ''}</div>
        <div class="stat-card-meta">${escapeHTML(latestDateLabel)}${deltaFromPrev != null ? ` · ${deltaFromPrev >= 0 ? '+' : ''}${deltaFromPrev.toFixed(1)}% vs prev` : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Ranges</div>
        <div class="stat-card-value stat-card-value-range">${escapeHTML(rangeMainDisplay)} <span>${escapeHTML(rangeMainLabel)}</span></div>
        <div class="stat-card-meta">${escapeHTML(referenceMetaLabel)} ${escapeHTML(referenceDisplay)}${deltaFromFirst != null ? ` · ${deltaFromFirst >= 0 ? '+' : ''}${deltaFromFirst.toFixed(1)}% vs first` : ''}</div>
        ${rangeCardControls ? `<div class="stat-card-range-controls">${rangeCardControls}</div>` : ''}
      </div>
    </div>
    ${rangeBandHtml}
    <div class="gb-detail-section-label">Trend</div>
    <div class="modal-chart"><canvas id="chart-modal"></canvas></div>
    <div class="gb-detail-section-label">History</div>
    <div class="modal-values-grid marker-history-list">`;
  for (const point of visibleHistoryPoints) {
    const { v, i } = point;
    const ri = getEffectiveRangeForDate(marker, i);
    const s = getStatus(v, ri.min, ri.max);
    const sl = s==="normal"?"\u2713 In Range":s==="high"?"\u25B2 Above Range":s==="low"?"\u25BC Below Range":"Unknown";
    const phaseLabel = marker.phaseLabels && marker.phaseLabels[i];
    const phaseInfo = phaseLabel ? `<div class="mv-phase">${phaseLabel} \u2022 ${formatValue(ri.min)}\u2013${formatValue(ri.max)}</div>` : '';
    const rawDate = marker.singlePoint ? null : data.dates[i];
    const matchingNote = rawDate && state.importedData.notes ? state.importedData.notes.find(n => n.date === rawDate) : null;
    const noteIcon = matchingNote ? `<button type="button" class="mv-note" onclick="event.stopPropagation();this.parentElement.parentElement.querySelector('.mv-note-text').classList.toggle('show')">Note</button><div class="mv-note-text">${escapeHTML(matchingNote.text)}</div>` : '';
    const mvKey = dotKey + ':' + rawDate;
    const manualVal = rawDate && state.importedData.manualValues && state.importedData.manualValues[mvKey];
    const isManual = manualVal !== undefined && manualVal !== null;
    const canRevert = isManual && manualVal !== true;
    const manualBadge = canRevert
      ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert manual value to imported value" title="Manual — click to revert to imported value" onclick="event.stopPropagation();revertMarkerValue('${id}','${rawDate}')">manual \u00d7</span>`
      : isManual ? ' <span class="ref-edited-badge" title="Manually entered">manual</span>' : '';
    const deleteBtn = `<button class="mv-delete" onclick="event.stopPropagation();deleteMarkerValue('${id}','${rawDate}')" title="Remove this value">&times;</button>`;
    const editClick = rawDate ? ` onclick="event.stopPropagation();editMarkerValue('${id}','${rawDate}',${v},event)" title="Click to edit" style="cursor:pointer"` : '';
    // Provenance: which file imported this value
    let sourceHtml = '';
    if (rawDate) {
      const srcEntry = state.importedData.entries?.find(e => e.date === rawDate);
      const src = srcEntry?.markerSources?.[dotKey];
      if (src) {
        const fname = src.file;
        if (fname) {
          const display = fname.length > 30 ? fname.slice(0, 27) + '...' : fname;
          sourceHtml = `<div class="mv-source" title="${escapeHTML(fname)}">${escapeHTML(display)}</div>`;
        } else {
          sourceHtml = `<div class="mv-source mv-source-manual">manual entry</div>`;
        }
      } else if (srcEntry?.sourceFile) {
        const fname = srcEntry.sourceFile;
        const display = fname.length > 30 ? fname.slice(0, 27) + '...' : fname;
        sourceHtml = `<div class="mv-source" title="${escapeHTML(fname)}">${escapeHTML(display)}</div>`;
      }
    }
    // Per-value note (markerValueNotes keyed `dotKey:date`).
    const valueNote = rawDate ? state.importedData.markerValueNotes?.[mvKey] : null;
    const valueNoteHtml = rawDate
      ? (valueNote
          ? `<div class="mv-value-note has-note"><span class="mv-value-note-text" role="button" tabindex="0" title="Click to edit note" onclick="event.stopPropagation();editValueNote('${id}','${rawDate}')">${escapeHTML(valueNote)}</span> <button class="mv-value-note-delete" title="Remove note" onclick="event.stopPropagation();deleteValueNote('${id}','${rawDate}')">&times;</button></div>`
          : `<div class="mv-value-note add-note" role="button" tabindex="0" title="Add a note for this value" onclick="event.stopPropagation();editValueNote('${id}','${rawDate}')">+ note</div>`)
      : '';
    const altVal = (hasConv && state.showAltUnits) ? getAlternateUnit(dotKey, v, isUSMode) : null;
    const altLine = altVal ? `<div class="mv-alt" title="Same value, alternate unit">≈ ${formatValue(altVal.value)} ${escapeHTML(altVal.unit)}</div>` : '';
    html += `<div class="modal-value-card marker-history-row status-${s}">${deleteBtn}
      <div class="marker-history-date-row"><div class="mv-date">${dates[i]}${noteIcon}</div>${sourceHtml}</div>
      <div class="marker-history-value-row"><div class="mv-value val-${s}"${editClick}>${formatValue(v)}${manualBadge}</div><div class="mv-status val-${s}">${sl}</div></div>
      ${altLine}${phaseInfo}${valueNoteHtml}</div>`;
  }
  html += `</div>`;
  if (hiddenHistoryCount > 0) {
    const nextHistoryLimit = showAllHistory
      ? Math.min(modalPoints.length, expandedHistoryLimit + MARKER_HISTORY_EXPANDED_CAP)
      : MARKER_HISTORY_EXPANDED_CAP;
    const showCount = showAllHistory
      ? Math.min(MARKER_HISTORY_EXPANDED_CAP, hiddenHistoryCount)
      : Math.min(MARKER_HISTORY_EXPANDED_CAP, hiddenHistoryCount);
    const historyButtonLabel = showAllHistory
      ? `Show ${showCount} older ${showCount === 1 ? 'value' : 'values'}`
      : `View more history (${modalPoints.length} values)`;
    html += `<button class="light-sessions-show-more marker-history-show-more" onclick="event.stopPropagation();showDetailModal('${id}', { showAllHistory: true, historyLimit: ${nextHistoryLimit}, scrollToHistory: true })">${historyButtonLabel}</button>`;
  } else if (showAllHistory && modalPoints.length > MARKER_HISTORY_DEFAULT_CAP) {
    html += `<button class="light-sessions-show-more marker-history-show-more" onclick="event.stopPropagation();showDetailModal('${id}', { scrollToHistory: true })">Show last ${MARKER_HISTORY_DEFAULT_CAP} values</button>`;
  }
  const nonNull = modalPoints;
  if (nonNull.length >= 2) {
    const f = nonNull[0], l = nonNull[nonNull.length-1];
    const ch = l.v - f.v, pct = ((ch/f.v)*100).toFixed(1);
    const dir = ch > 0 ? "increased" : ch < 0 ? "decreased" : "unchanged";
    html += `<div class="modal-ref-info"><strong>Trend:</strong> ${dir} by ${Math.abs(ch).toFixed(2)} ${escapeHTML(marker.unit)} (${ch>0?"+":""}${pct}%) from ${dates[f.i]} to ${dates[l.i]}</div>`;
  }
  // Calculated marker input diagnostic — show missing inputs
  const calcInputs = {
    'calculatedRatios_phenoAge': [
      ['proteins', 'albumin', 'Albumin'], ['biochemistry', 'creatinine', 'Creatinine'],
      ['biochemistry', 'glucose', 'Glucose'], ['proteins', 'hsCRP', 'CRP'],
      ['differential', 'lymphocytesPct', 'Lymphocytes %'], ['hematology', 'mcv', 'MCV'],
      ['hematology', 'rdwcv', 'RDW-CV'], ['biochemistry', 'alp', 'ALP'], ['hematology', 'wbc', 'WBC']
    ],
    'calculatedRatios_bortzAge': [
      ['proteins', 'albumin', 'Albumin'], ['biochemistry', 'alp', 'ALP'],
      ['biochemistry', 'urea', 'Urea'], ['lipids', 'cholesterol', 'Cholesterol'],
      ['biochemistry', 'creatinine', 'Creatinine'], ['biochemistry', 'cystatinC', 'Cystatin C'],
      ['diabetes', 'hba1c', 'HbA1c'], ['proteins', 'hsCRP', 'CRP'],
      ['biochemistry', 'ggt', 'GGT'], ['hematology', 'rbc', 'RBC'],
      ['hematology', 'mcv', 'MCV'], ['hematology', 'rdwcv', 'RDW-CV'],
      ['differential', 'monocytes', 'Monocytes'], ['differential', 'neutrophils', 'Neutrophils'],
      ['differential', 'lymphocytesPct', 'Lymphocytes %'], ['biochemistry', 'alt', 'ALT'],
      ['hormones', 'shbg', 'SHBG'], ['vitamins', 'vitaminD', 'Vitamin D'],
      ['biochemistry', 'glucose', 'Glucose'], ['hematology', 'mch', 'MCH'],
      ['lipids', 'apoAI', 'ApoA-I']
    ],
    'calculatedRatios_biologicalAge': [],
    'calculatedRatios_bunCreatRatio': [
      ['biochemistry', 'urea', 'Urea (BUN)'], ['biochemistry', 'creatinine', 'Creatinine']
    ],
    'calculatedRatios_freeWaterDeficit': [['electrolytes', 'sodium', 'Sodium']],
    'calculatedRatios_tgHdlRatio': [['lipids', 'triglycerides', 'Triglycerides'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_ldlHdlRatio': [['lipids', 'ldl', 'LDL'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_nlr': [['differential', 'neutrophils', 'Neutrophils'], ['differential', 'lymphocytes', 'Lymphocytes']],
    'calculatedRatios_plr': [['hematology', 'platelets', 'Platelets'], ['differential', 'lymphocytes', 'Lymphocytes']],
    'calculatedRatios_deRitisRatio': [['biochemistry', 'ast', 'AST'], ['biochemistry', 'alt', 'ALT']],
    'calculatedRatios_copperZincRatio': [['electrolytes', 'copper', 'Copper'], ['electrolytes', 'zinc', 'Zinc']],
    'calculatedRatios_apoBapoAIRatio': [['lipids', 'apoB', 'ApoB'], ['lipids', 'apoAI', 'ApoA-I']],
    'calculatedRatios_crpHdlRatio': [['proteins', 'hsCRP', 'CRP'], ['lipids', 'hdl', 'HDL']],
  };
  const inputs = calcInputs[id];
  if (inputs) {
    const issues = [];
    // Check for completely missing markers
    const missing = inputs.filter(([cat, key]) => {
      const vals = data.categories[cat]?.markers[key]?.values;
      return !vals || vals.every(v => v == null);
    });
    if ((id === 'calculatedRatios_phenoAge' || id === 'calculatedRatios_bortzAge' || id === 'calculatedRatios_biologicalAge') && !state.profileDob) {
      issues.push('Date of birth not set (required for age at blood draw)');
    }
    if (missing.length > 0) {
      issues.push(`Missing: ${missing.map(m => m[2]).join(', ')}`);
    }
    // Biological age clocks: per-date gap check, CRP fallback, unit sanity
    const _isBioAgeClock = id === 'calculatedRatios_phenoAge' || id === 'calculatedRatios_bortzAge';
    if (_isBioAgeClock && state.profileDob) {
      // For CRP check: accept either hs-CRP or standard CRP
      const _hasCRPonDate = (idx) => {
        const hs = data.categories.proteins?.markers.hsCRP?.values?.[idx];
        const std = data.categories.proteins?.markers.crp?.values?.[idx];
        return hs != null || std != null;
      };
      // Override the missing check for CRP — it's satisfied by either marker
      const crpInInputs = inputs.some(([, key]) => key === 'hsCRP');
      if (crpInInputs && missing.some(([, key]) => key === 'hsCRP')) {
        const hasAnyCRP = data.categories.proteins?.markers.hsCRP?.values?.some(v => v != null)
          || data.categories.proteins?.markers.crp?.values?.some(v => v != null);
        if (hasAnyCRP) {
          // Remove CRP from missing list — it's covered by the fallback
          const idx = missing.findIndex(([, key]) => key === 'hsCRP');
          if (idx >= 0) missing.splice(idx, 1);
          // Re-generate missing message
          if (missing.length > 0) {
            const mi = issues.findIndex(s => s.startsWith('Missing:'));
            if (mi >= 0) issues[mi] = `Missing: ${missing.map(m => m[2]).join(', ')}`;
          } else {
            const mi = issues.findIndex(s => s.startsWith('Missing:'));
            if (mi >= 0) issues.splice(mi, 1);
          }
        }
      }
      if (missing.length === 0) {
        const latestIdx = data.dates.length - 1;
        if (latestIdx >= 0) {
          const nullAt = inputs.filter(([cat, key]) => {
            if (key === 'hsCRP') return !_hasCRPonDate(latestIdx);
            const v = data.categories[cat]?.markers[key]?.values?.[latestIdx];
            return v == null;
          });
          if (nullAt.length > 0) {
            issues.push(`Missing on latest date (${data.dateLabels[latestIdx]}): ${nullAt.map(m => m[2]).join(', ')}`);
          }
          // CRP value sanity
          const crpVal = data.categories.proteins?.markers.hsCRP?.values?.[latestIdx]
            ?? data.categories.proteins?.markers.crp?.values?.[latestIdx];
          if (crpVal != null && crpVal <= 0) {
            issues.push('CRP is zero or negative — cannot calculate (log undefined)');
          }
          // Unit sanity warnings
          const albVal = data.categories.proteins?.markers.albumin?.values?.[latestIdx];
          if (albVal != null && albVal > 10) {
            issues.push(`Albumin value ${albVal} looks like g/dL — expected g/L (typically 35–55)`);
          }
          const lymphVal = data.categories.differential?.markers.lymphocytesPct?.values?.[latestIdx];
          if (lymphVal != null && lymphVal > 1) {
            issues.push(`Lymphocytes % value ${lymphVal} looks like a percentage — expected fraction 0–1 (e.g. 0.28)`);
          }
          const alpVal = data.categories.biochemistry?.markers.alp?.values?.[latestIdx];
          if (alpVal != null && alpVal > 10) {
            issues.push(`ALP value ${alpVal} looks like U/L — expected µkat/L (typically 0.5–2.0)`);
          }
        }
      }
    }
    // Biological Age: show component status
    if (id === 'calculatedRatios_biologicalAge') {
      const latestIdx = data.dates.length - 1;
      const pheno = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[latestIdx];
      const bortz = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[latestIdx];
      if (pheno == null && bortz == null) {
        issues.push('Neither PhenoAge nor Bortz Age could be calculated — check their detail views for missing inputs');
      } else {
        const age = state.profileDob ? ((new Date(data.dates[latestIdx] + 'T00:00:00') - new Date(state.profileDob + 'T00:00:00')) / (365.25*24*60*60*1000)) : null;
        const parts = [];
        if (pheno != null) parts.push(`PhenoAge: ${pheno}${age ? ' (' + (pheno - age > 0 ? '+' : '') + (pheno - age).toFixed(1) + 'y)' : ''}`);
        if (bortz != null) parts.push(`Bortz Age: ${bortz}${age ? ' (' + (bortz - age > 0 ? '+' : '') + (bortz - age).toFixed(1) + 'y)' : ''}`);
        if (pheno == null) parts.push('PhenoAge: not calculated');
        if (bortz == null) parts.push('Bortz Age: not calculated');
        issues.push(parts.join(' · '));
      }
    }
    if (issues.length > 0) {
      html += `<div class="calc-missing-inputs">Not calculated — ${issues.join('. ')}</div>`;
    }
  }
  // Collect inline SNPs for the unified rec section (genetics + actionable tips together)
  const _inlineSNPs = (state.importedData.genetics?.snps && window._getRelevantSNPs) ? window._getRelevantSNPs(dotKey) : [];
  html += `<div class="gb-detail-actions">
    <div class="gb-detail-action-row">
      <button class="manual-entry-btn" onclick="event.stopPropagation();openManualEntryForm('${id}')">+ Add Value Manually</button>
      <button class="ask-ai-btn" onclick="event.stopPropagation();askAIAboutMarker('${id}')">Ask AI</button>
    </div>`;
  // Marker note
  const markerNote = state.importedData.markerNotes?.[dotKey] || '';
  html += `<div class="marker-note-section">
    <div class="marker-note-header"><span class="marker-note-label">Note</span><button class="marker-note-edit-btn" onclick="event.stopPropagation();toggleMarkerNoteEditor('${dotKey}')">${markerNote ? 'Edit' : '+ Add note'}</button></div>
    ${markerNote ? `<div class="marker-note-text">${escapeHTML(markerNote)}</div>` : ''}
    <div class="marker-note-editor" id="marker-note-editor" style="display:none">
      <textarea id="marker-note-input" placeholder="Your notes about this marker (e.g. why it's high, what to watch for, what you've learned...)" rows="3">${escapeHTML(markerNote)}</textarea>
      <div class="marker-note-actions">
        <button class="import-btn import-btn-primary" onclick="event.stopPropagation();saveMarkerNote('${dotKey}','${id}')">Save</button>
        <button class="import-btn import-btn-secondary" onclick="event.stopPropagation();toggleMarkerNoteEditor('${dotKey}')">Cancel</button>
        ${markerNote ? `<button class="import-btn import-btn-secondary" style="color:var(--red)" onclick="event.stopPropagation();deleteMarkerNote('${dotKey}','${id}')">Delete</button>` : ''}
	      </div>
	    </div>
	  </div>`;
  // Recommendation placeholder — shown for any marker with a catalog slot
  if (window.isProductRecsEnabled && window.isProductRecsEnabled()) {
    html += `<div id="rec-modal-${id}"></div>`;
  }
  html += `</div>`;
  // Show delete link for custom markers only
  if (state.importedData?.customMarkers?.[dotKey]) {
    html += `<div style="text-align:center;margin-top:8px"><a href="#" style="color:var(--text-muted);font-size:0.8rem" onclick="event.preventDefault();event.stopPropagation();deleteCustomMarker('${id}')">Delete this marker</a></div>`;
  }
  modal.innerHTML = html;
  overlay.classList.add("show");
  if (opts.scrollToHistory) {
    setTimeout(() => {
      const historyEl = modal.querySelector('.marker-history-list');
      if (historyEl) historyEl.scrollIntoView({ block: 'start' });
    }, 0);
  }
  // Async-fill recommendation section (unified: genetics + actionable tips)
  if (window.renderRecommendationSection) {
    const _latestVal = marker.values?.filter(v => v !== null).pop();
    const _markerStatus = _latestVal != null ? getStatus(_latestVal, r.min, r.max) : 'missing';
    window.renderRecommendationSection(id.replace('_','.'), { label: 'What can help', maxProducts: 3, inlineSNPs: _inlineSNPs, markerStatus: _markerStatus })
      .then(h => {
        const el = document.getElementById('rec-modal-' + id);
        if (h && el) {
          el.innerHTML = h;
          if (opts.scrollToRec) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
  }
  setTimeout(() => {
    if (document.getElementById("chart-modal")) {
      if (state.chartInstances["modal"]) { state.chartInstances["modal"].destroy(); delete state.chartInstances["modal"]; }
      createLineChart("modal", marker, data.dateLabels, data.dates, data.phaseLabels);
    }
  }, 50);
  // Display marker description (sync for schema markers, async fetch for custom)
  const descEl = document.getElementById('marker-desc');
  if (descEl) {
    const desc = getMarkerDescription(id);
    if (desc) {
      descEl.textContent = desc;
      descEl.classList.add('loaded');
    } else if (!marker.desc && hasAIProvider()) {
      descEl.classList.add('loading');
      fetchCustomMarkerDescription(id, marker.name, marker.unit).then(text => {
        const el = document.getElementById('marker-desc');
        if (text && el) {
          el.textContent = text;
          el.classList.remove('loading');
          el.classList.add('loaded');
        } else if (el) {
          el.remove();
        }
      });
    } else {
      descEl.remove();
    }
  }
}

export function openManualEntryForm(id, prefillDate) {
  // Always re-resolve from getActiveData — `state.markerRegistry` carries a
  // marker frozen at the moment it was rendered, and `marker.unit` reflects
  // the unit-system mode in effect *then*. After a US↔EU toggle the registry
  // entry can lie about the current display unit, breaking the unit-picker
  // comparison in saveManualEntry. Refresh on every open.
  const idx = id.indexOf('_');
  if (idx < 0) return;
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  const data = getActiveData();
  const marker = data.categories[catKey]?.markers[mKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return;
  const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return;
  const today = new Date().toISOString().slice(0, 10);
  // Date fallback chain: explicit prefill (e.g. empty-cell click) → last-used in this session → today.
  // sessionStorage clears when the tab closes, so we don't outlast a single sitting.
  let sessionLast = null;
  try {
    const raw = sessionStorage.getItem('labcharts-last-manual-date');
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) sessionLast = raw;
  } catch (_) { /* sessionStorage may be unavailable (private mode) */ }
  const dateValue = (typeof prefillDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate))
    ? prefillDate
    : (sessionLast || today);
  const refText = marker.refMin != null || marker.refMax != null
    ? `Reference: ${marker.refMin != null ? marker.refMin : '–'} \u2013 ${marker.refMax != null ? marker.refMax : '–'} ${escapeHTML(marker.unit)}`
    : '';
  // Placeholder hint: midpoint of ref range if known, otherwise a neutral example.
  let placeholderHint = 'e.g. 5.4';
  if (marker.refMin != null && marker.refMax != null) {
    placeholderHint = `e.g. ${formatValue((marker.refMin + marker.refMax) / 2)}`;
  }
  // Per-field unit picker: surface the alternate unit when this marker has a
  // UNIT_CONVERSIONS entry, so users entering a value from a lab report in the
  // other system don't have to mentally convert. Default = current display unit.
  const dotKeyForUnit = id.replace('_', '.');
  const _meIsUS = state.unitSystem === 'US';
  const _meConv = UNIT_CONVERSIONS[dotKeyForUnit];
  let _meAltUnit = null;
  if (_meConv) {
    const probe = marker.refMax ?? marker.refMin ?? 1;
    const alt = getAlternateUnit(dotKeyForUnit, probe, _meIsUS);
    if (alt) _meAltUnit = alt.unit;
  }
  const unitPickerHtml = _meAltUnit
    ? `<select id="me-unit" class="me-unit-select" aria-label="Input unit">
         <option value="${escapeHTML(marker.unit)}" selected>${escapeHTML(marker.unit)}</option>
         <option value="${escapeHTML(_meAltUnit)}">${escapeHTML(_meAltUnit)}</option>
       </select>`
    : `<span style="color:var(--text-muted);font-weight:400">(${escapeHTML(marker.unit)})</span>`;
  modal.innerHTML = `<div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">${escapeHTML(data.categories[catKey]?.label || catKey)}</div>
        <div class="gb-modal-title">Add Value Manually</div>
      </div>
      <button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="modal-unit"><strong>${escapeHTML(marker.name)}</strong> \u00b7 ${escapeHTML(marker.unit)}${refText ? ' \u00b7 ' + refText : ''}</div>
    <div class="manual-entry-form">
      <div class="me-field">
        <label for="me-date">Date</label>
        <input type="date" id="me-date" value="${dateValue}" max="${today}">
      </div>
      <div class="me-field">
        <label for="me-value">Value ${unitPickerHtml}</label>
        <input type="number" id="me-value" step="any" placeholder="${escapeHTML(placeholderHint)}" autofocus>
      </div>
      <div class="me-field">
        <label for="me-note">Note <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <textarea id="me-note" rows="2" placeholder="Context for this value — e.g. fasted 14h, post-workout, different lab, retake of low value..."></textarea>
      </div>
      <div class="gb-form-actions">
        <button class="import-btn import-btn-primary" onclick="saveManualEntry('${id}')">Save</button>
        <button class="import-btn import-btn-secondary" onclick="saveAndAddAnotherManualEntry('${id}')" title="Save this value, then enter another marker for the same date">Save &amp; Add Another</button>
        <button class="import-btn import-btn-secondary" onclick="showDetailModal('${id}')">Cancel</button>
      </div>
    </div>
    </div>`;
  overlay.classList.add("show");
  setTimeout(() => {
    const el = document.getElementById('me-value');
    if (el) {
      el.focus();
      // Enter-to-save / Esc-to-cancel for keyboard users.
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveManualEntry(id); }
        else if (e.key === 'Escape') { e.preventDefault(); showDetailModal(id); }
      };
      el.addEventListener('keydown', onKey);
      const dateEl = document.getElementById('me-date');
      if (dateEl) dateEl.addEventListener('keydown', onKey);
    }
  }, 50);
}

// Insulin is stored under hormones.insulin but also surfaced on the diabetes
// category as diabetes.insulin_d (so the marker shows up in both contexts).
// Per-value notes need to mirror across both keys regardless of which
// category the user is editing from. Returns the OTHER key (if any) so the
// caller can write the same note value to both sides.
function _insulinMirrorNoteKey(dotKey, date) {
  if (dotKey === 'hormones.insulin') return 'diabetes.insulin_d:' + date;
  if (dotKey === 'diabetes.insulin_d') return 'hormones.insulin:' + date;
  return null;
}

function _entryHasImportedSource(entry, dotKey) {
  if (!entry) return false;
  const markerSource = entry.markerSources?.[dotKey];
  return !!(markerSource?.file || entry.sourceFile);
}

function _rememberManualOriginal(dotKey, date, entry) {
  if (!entry || !dotKey || !date) return;
  if (!state.importedData.manualValues) state.importedData.manualValues = {};
  const mvKey = dotKey + ':' + date;
  const current = entry.markers?.[dotKey];
  const hasImportedOriginal = current != null && _entryHasImportedSource(entry, dotKey);
  if (!(mvKey in state.importedData.manualValues)) {
    state.importedData.manualValues[mvKey] = hasImportedOriginal ? current : true;
  } else if (state.importedData.manualValues[mvKey] === true && hasImportedOriginal) {
    state.importedData.manualValues[mvKey] = current;
  }
}

export async function saveManualEntry(id, opts = {}) {
  const { keepOpen = false } = opts;
  const dateInput = document.getElementById('me-date');
  const valueInput = document.getElementById('me-value');
  const noteInput = document.getElementById('me-note');
  const unitInput = document.getElementById('me-unit');
  if (!dateInput || !valueInput) return;
  const date = dateInput.value;
  const value = parseFloat(valueInput.value);
  // Cap notes at 500 chars to defend against runaway paste — matches the
  // wearable-manual.js `_sanitizeNote` ceiling. Notes flow into IDB +
  // sync payloads + AI context; a few-MB paste would bloat all three.
  const noteRaw = noteInput ? noteInput.value.trim() : '';
  const noteText = noteRaw.length > 500 ? noteRaw.slice(0, 500) : noteRaw;
  if (!date) { showNotification('Please enter a date', 'error'); return; }
  if (isNaN(value)) { showNotification('Please enter a valid number', 'error'); return; }
  const dotKey = id.replace('_', '.');
  // Always re-resolve marker from getActiveData (not state.markerRegistry):
  // the registry may hold a marker.unit captured under a different unit-system
  // mode, which would break the unit-picker comparison below.
  const _meIdx = id.indexOf('_');
  const marker = _meIdx > 0
    ? getActiveData().categories[id.slice(0, _meIdx)]?.markers[id.slice(_meIdx + 1)]
    : null;
  // Unit-picker integration: if the user selected the alternate unit, the
  // range sanity check needs alt-unit-space refs (otherwise typing "90 mg/dL"
  // against an SI ref range of 4–6 mmol/L would always trigger the warning).
  const inputUnit = unitInput?.value || marker?.unit || '';
  const usingAltUnit = !!(marker && inputUnit && inputUnit !== marker.unit);
  let checkRefMin = marker?.refMin, checkRefMax = marker?.refMax, checkUnit = marker?.unit;
  if (marker && usingAltUnit) {
    const isUSMode = state.unitSystem === 'US';
    const altMin = marker.refMin != null ? getAlternateUnit(dotKey, marker.refMin, isUSMode) : null;
    const altMax = marker.refMax != null ? getAlternateUnit(dotKey, marker.refMax, isUSMode) : null;
    checkRefMin = altMin?.value ?? null;
    checkRefMax = altMax?.value ?? null;
    checkUnit = inputUnit;
  }
  // Range sanity check: catches decimal/unit slips (e.g. typing 100 mg/dL when SI ref is 4–6 mmol/L).
  if (marker) {
    let warn = null;
    if (value < 0) warn = `${value} is negative — values are usually 0 or positive.`;
    else if (checkRefMax != null && checkRefMax > 0 && value > checkRefMax * 10) warn = `${value} is much higher than the reference range (${checkRefMin ?? '?'}–${checkRefMax} ${checkUnit}). Did you enter the right unit?`;
    else if (checkRefMin != null && checkRefMin > 0 && value < checkRefMin / 10) warn = `${value} is much lower than the reference range (${checkRefMin}–${checkRefMax ?? '?'} ${checkUnit}). Did you enter the right unit?`;
    if (warn && !await showConfirmDialog(`${warn}\n\nSave anyway?`)) return;
  }
  // Duplicate-date check: an existing value for this marker on the same date.
  const existingEntry = state.importedData.entries?.find(e => e.date === date);
  if (existingEntry && existingEntry.markers && existingEntry.markers[dotKey] != null) {
    // Show in display units — find the marker's display value at this date.
    const data = getActiveData();
    const dateIdx = data.dates.indexOf(date);
    const displayVal = (dateIdx >= 0 && marker) ? marker.values[dateIdx] : existingEntry.markers[dotKey];
    const unit = marker?.unit || '';
    if (!await showConfirmDialog(`A value of ${displayVal} ${unit} already exists for ${date}. Overwrite?`)) return;
  }
  if (!state.importedData.entries) state.importedData.entries = [];
  let entry = state.importedData.entries.find(e => e.date === date);
  if (!entry) {
    entry = { date: date, markers: {} };
    state.importedData.entries.push(entry);
  }
  // If the user picked the alternate unit, convert from there directly to SI
  // (convertUserInputToSI is a no-op when inputUnit is already the SI unit, so
  // the EU-mode default keeps working unchanged). Otherwise fall through to the
  // existing display→SI path which handles the US-mode case.
  const storedValue = usingAltUnit
    ? convertUserInputToSI(dotKey, value, inputUnit)
    : convertDisplayToSI(dotKey, value);
  _rememberManualOriginal(dotKey, date, entry);
  entry.markers[dotKey] = storedValue;
  if (!entry.markerSources) entry.markerSources = {};
  entry.markerSources[dotKey] = { file: null, at: Date.now() };
  // Per-value note: store on save when non-empty; clear when emptied.
  if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
  const noteKey = dotKey + ':' + date;
  if (noteText) state.importedData.markerValueNotes[noteKey] = noteText;
  else delete state.importedData.markerValueNotes[noteKey];
  if (dotKey === 'hormones.insulin') {
    _rememberManualOriginal('diabetes.insulin_d', date, entry);
    entry.markers['diabetes.insulin_d'] = storedValue;
    entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey];
  }
  // Mirror the per-value note across the insulin dual-mapping — same reading,
  // two views. Bidirectional: user may save via either category page. Without
  // this, a note added on one side wouldn't show on the other, and orphans
  // would accumulate over delete cycles.
  const insulinNoteMirror = _insulinMirrorNoteKey(dotKey, date);
  if (insulinNoteMirror) {
    if (noteText) state.importedData.markerValueNotes[insulinNoteMirror] = noteText;
    else delete state.importedData.markerValueNotes[insulinNoteMirror];
  }
  recalculateHOMAIR(entry);
  await saveImportedData();
  // Remember the date session-wide so the next manual entry defaults to it.
  try { sessionStorage.setItem('labcharts-last-manual-date', date); } catch (_) {}
  window.buildSidebar();
  updateHeaderDates();
  const targetCat = id.indexOf('_') !== -1 ? id.slice(0, id.indexOf('_')) : null;
  const data = getActiveData();
  const navCat = (targetCat && data.categories?.[targetCat]) ? targetCat : "dashboard";
  showNotification(`Added ${state.markerRegistry[id]?.name || id}: ${value} on ${date}`, 'success');
  if (keepOpen) {
    // Rebuild page underneath, re-open the manual-entry form with the same id + date.
    // Form re-render is in-place (modal.innerHTML), so no flicker.
    markerDetailDeps.navigate(navCat);
    openManualEntryForm(id, date);
  } else {
    closeModal();
    markerDetailDeps.navigate(navCat);
    // Re-open detail modal so user stays in context (#29)
    setTimeout(() => showDetailModal(id), 50);
  }
}

export function saveAndAddAnotherManualEntry(id) {
  return saveManualEntry(id, { keepOpen: true });
}

export function openCreateMarkerModal() {
  const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return;
  // Build category options from schema + existing custom categories
  const data = getActiveData();
  const catOptions = Object.entries(data.categories)
    .map(([key, c]) => `<option value="${key}">${escapeHTML(c.label)}</option>`)
    .join('');
  modal.innerHTML = `<div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">Custom marker</div>
        <div class="gb-modal-title">Create New Biomarker</div>
      </div>
      <button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="manual-entry-form">
      <div class="me-field">
        <label>Category</label>
        <div class="cm-cat-row">
          <select id="cm-category" onchange="document.getElementById('cm-new-cat-row').style.display=this.value==='__new__'?'flex':'none'">
            ${catOptions}
            <option value="__new__">+ New category...</option>
          </select>
          <div id="cm-new-cat-row" style="display:none;margin-top:6px;gap:8px;align-items:center">
            <span id="cm-new-cat-icon" title="Pick icon" style="cursor:pointer;font-size:20px;min-width:28px;text-align:center" data-custom="" onclick="pickNewCatIcon(this)">\uD83D\uDD16</span>
            <input type="text" id="cm-new-cat" placeholder="Category name" style="flex:1">
          </div>
        </div>
      </div>
      <div class="me-field">
        <label>Marker name</label>
        <input type="text" id="cm-name" placeholder="e.g. Lipoprotein(a)" autofocus>
      </div>
      <div class="me-field">
        <label>Unit</label>
        <input type="text" id="cm-unit" placeholder="e.g. mg/dL, nmol/L, %">
      </div>
      <div class="me-field">
        <label>Reference range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-ref-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-ref-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="me-field">
        <label>Optimal range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-opt-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-opt-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="gb-form-actions">
        <button class="import-btn import-btn-primary" onclick="saveCustomMarker()">Create</button>
        <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </div>
    </div>`;
  overlay.classList.add("show");
  setTimeout(() => { const el = document.getElementById('cm-name'); if (el) el.focus(); }, 50);
}

export function pickNewCatIcon(el) {
  markerDetailDeps.showEmojiPicker(el, (emoji) => {
    if (emoji) { el.textContent = emoji; el.dataset.custom = '1'; }
  });
}

export function saveCustomMarker() {
  const catSelect = document.getElementById('cm-category');
  const newCatInput = document.getElementById('cm-new-cat');
  const nameInput = document.getElementById('cm-name');
  const unitInput = document.getElementById('cm-unit');
  const refMinInput = document.getElementById('cm-ref-min');
  const refMaxInput = document.getElementById('cm-ref-max');
  if (!nameInput?.value.trim()) { showNotification('Please enter a marker name', 'error'); return; }
  const name = nameInput.value.trim();
  // Determine category key and label
  let catKey, catLabel;
  if (catSelect.value === '__new__') {
    catLabel = (newCatInput?.value || '').trim();
    if (!catLabel) { showNotification('Please enter a category name', 'error'); return; }
    const iconEl = document.getElementById('cm-new-cat-icon');
    var newCatIcon = iconEl?.dataset.custom === '1' ? iconEl.textContent.trim() : null;
    catKey = catLabel.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    if (!catKey || /^\d/.test(catKey)) catKey = 'custom' + catKey.charAt(0).toUpperCase() + catKey.slice(1);
  } else {
    catKey = catSelect.value;
    catLabel = catSelect.options[catSelect.selectedIndex].text;
  }
  // Generate marker key from name (camelCase)
  const markerKey = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  if (!markerKey) { showNotification('Could not generate a valid key from marker name', 'error'); return; }
  const fullKey = catKey + '.' + markerKey;
  // Check for conflicts
  const data = getActiveData();
  const existingCat = data.categories[catKey];
  if (existingCat?.markers[markerKey]) {
    showNotification('A marker with this name already exists in that category', 'error');
    return;
  }
  // Parse optional ref range
  const refMin = refMinInput?.value ? parseFloat(refMinInput.value) : null;
  const refMax = refMaxInput?.value ? parseFloat(refMaxInput.value) : null;
  const optMinInput = document.getElementById('cm-opt-min');
  const optMaxInput = document.getElementById('cm-opt-max');
  const optMin = optMinInput?.value ? parseFloat(optMinInput.value) : null;
  const optMax = optMaxInput?.value ? parseFloat(optMaxInput.value) : null;
  // Save custom marker definition
  if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
  const cmDef = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: isNaN(refMin) ? null : refMin,
    refMax: isNaN(refMax) ? null : refMax,
    categoryLabel: catLabel,
    ...(typeof newCatIcon !== 'undefined' && newCatIcon ? { icon: newCatIcon } : {})
  };
  state.importedData.customMarkers[fullKey] = cmDef;
  // Save optimal range as refOverride if provided
  if (optMin != null && !isNaN(optMin) && optMax != null && !isNaN(optMax)) {
    if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
    state.importedData.refOverrides[fullKey] = {
      ...(state.importedData.refOverrides[fullKey] || {}),
      optimalMin: optMin,
      optimalMax: optMax
    };
  }
  saveImportedData();
  window.buildSidebar();
  closeModal();
  showNotification(`Created "${name}" in ${catLabel}`, 'success');
  // Register marker and open manual entry to add first value
  const id = catKey + '_' + markerKey;
  state.markerRegistry[id] = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: isNaN(refMin) ? null : refMin,
    refMax: isNaN(refMax) ? null : refMax,
    custom: true
  };
  setTimeout(() => openManualEntryForm(id), 100);
}

export async function deleteMarkerValue(id, date) {
  const dotKey = id.replace('_', '.');
  if (!state.importedData.entries) return;
  const entry = state.importedData.entries.find(e => e.date === date);
  if (!entry || entry.markers[dotKey] === undefined) return;
  if (await showConfirmDialog(`Delete this value (${date})? This can't be undone.`)) {
    delete entry.markers[dotKey];
    // Clean up provenance and manual tracking
    if (entry.markerSources) delete entry.markerSources[dotKey];
    if (state.importedData.manualValues) delete state.importedData.manualValues[dotKey + ':' + date];
    // Drop the per-value note (if any) — value is gone, note is orphaned.
    if (state.importedData.markerValueNotes) delete state.importedData.markerValueNotes[dotKey + ':' + date];
    // Clean up insulin dual-mapping (value, provenance, AND the per-value
    // note for the mirror key — same reading, both views must go together).
    if (dotKey === 'hormones.insulin') {
      delete entry.markers['diabetes.insulin_d'];
      if (entry.markerSources) delete entry.markerSources['diabetes.insulin_d'];
      recalculateHOMAIR(entry);
    }
    // Mirror the note delete in both directions — user may delete via either
    // category. Forward-only would leave orphans on the other side.
    const mirrorKey = _insulinMirrorNoteKey(dotKey, date);
    if (mirrorKey && state.importedData.markerValueNotes) {
      delete state.importedData.markerValueNotes[mirrorKey];
    }
    // Remove entry entirely if no markers left
    if (Object.keys(entry.markers).length === 0) {
      state.importedData.entries = state.importedData.entries.filter(e => e.date !== date);
    }
    saveImportedData();
    window.buildSidebar();
    updateHeaderDates();
    // Re-open the detail modal to show updated values. buildSidebar
    // resets .active to Dashboard, so use state.currentView (kept in
    // sync by navigate) instead of re-reading the DOM.
    markerDetailDeps.navigate(state.currentView || "dashboard");
    showDetailModal(id);
    showNotification(`Removed value from ${date}`, 'info');
  }
}

export async function deleteCustomMarker(id) {
  const dotKey = id.replace('_', '.');
  const catKey = dotKey.split('.')[0];
  const def = state.importedData?.customMarkers?.[dotKey];
  if (!def) return;
  // Find all custom markers in same category
  const siblingsInCat = Object.keys(state.importedData.customMarkers).filter(k => k.startsWith(catKey + '.'));
  const isLastInCat = siblingsInCat.length <= 1;
  const msg = isLastInCat
    ? `Delete "${def.name}" and the entire "${def.categoryLabel || catKey}" category? This cannot be undone.`
    : `Delete "${def.name}" and all its values? This cannot be undone.`;
  if (await showConfirmDialog(msg)) {
    // Determine which keys to delete — just this marker, or all in category
    const keysToDelete = isLastInCat ? siblingsInCat : [dotKey];
    for (const key of keysToDelete) {
      // Remove from all entries
      if (state.importedData.entries) {
        for (const entry of state.importedData.entries) {
          if (entry.markers) delete entry.markers[key];
        }
      }
      // Remove manual value tracking
      if (state.importedData.manualValues) {
        for (const k of Object.keys(state.importedData.manualValues)) {
          if (k.startsWith(key + ':')) delete state.importedData.manualValues[k];
        }
      }
      // Remove ref overrides
      if (state.importedData.refOverrides) delete state.importedData.refOverrides[key];
      // Remove custom marker definition
      delete state.importedData.customMarkers[key];
    }
    // Clean up empty entries
    if (state.importedData.entries) {
      state.importedData.entries = state.importedData.entries.filter(e => Object.keys(e.markers || {}).length > 0);
    }
    saveImportedData();
    closeModal();
    window.buildSidebar();
    updateHeaderDates();
    markerDetailDeps.navigate('dashboard');
    showNotification(`Deleted "${def.name}"${isLastInCat && siblingsInCat.length > 1 ? ` and ${siblingsInCat.length - 1} other marker(s)` : ''}`, 'info');
  }
}

export function editMarkerValue(id, date, currentValue, event) {
  const el = event.target.closest('.mv-value');
  if (!el || el.querySelector('input')) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = currentValue;
  input.className = 'ref-edit-input';
  input.style.cssText = 'width:100%;max-width:140px;text-align:center;font-size:inherit;box-sizing:border-box;padding:2px 4px';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  let cancelled = false;
  let saveStarted = false;
  const save = async () => {
    if (cancelled) return;
    if (saveStarted) return;
    saveStarted = true;
    const newValue = parseFloat(input.value);
    if (isNaN(newValue)) { showDetailModal(id); return; }
    // No-op if the value didn't change — don't flip provenance to manual.
    if (newValue === parseFloat(currentValue)) { showDetailModal(id); return; }
    const dotKey = id.replace('_', '.');
    const entry = state.importedData.entries?.find(e => e.date === date);
    if (!entry) return;
    // Track as manually edited — store original value for revert (true = manual entry with no original)
    _rememberManualOriginal(dotKey, date, entry);
    const storedValue = convertDisplayToSI(dotKey, newValue);
    entry.markers[dotKey] = storedValue;
    // Update provenance to reflect manual edit
    if (!entry.markerSources) entry.markerSources = {};
    entry.markerSources[dotKey] = { file: null, at: Date.now() };
    if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = storedValue; if (entry.markerSources) entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey]; recalculateHOMAIR(entry); }
    await saveImportedData();
    // Rebuild the underlying view so Table/Heatmap/Chart reflect the edit.
    markerDetailDeps.navigate(state.currentView || 'dashboard');
    showDetailModal(id);
  };
  input.addEventListener('blur', () => { void save(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); void save(); }
    else if (e.key === 'Escape') { cancelled = true; showDetailModal(id); }
  });
}

export async function revertMarkerValue(id, date) {
  const dotKey = id.replace('_', '.');
  const mvKey = dotKey + ':' + date;
  const original = state.importedData.manualValues?.[mvKey];
  if (original == null || original === true) return;
  const entry = state.importedData.entries?.find(e => e.date === date);
  if (!entry) return;
  entry.markers[dotKey] = original;
  if (entry.markerSources) delete entry.markerSources[dotKey];
  if (dotKey === 'hormones.insulin') {
    entry.markers['diabetes.insulin_d'] = original;
    if (entry.markerSources) delete entry.markerSources['diabetes.insulin_d'];
    delete state.importedData.manualValues['diabetes.insulin_d:' + date];
    recalculateHOMAIR(entry);
  }
  delete state.importedData.manualValues[mvKey];
  await saveImportedData();
  // Rebuild the underlying view so Table/Heatmap/Chart reflect the revert.
  markerDetailDeps.navigate(state.currentView || 'dashboard');
  showDetailModal(id);
}

export async function editValueNote(id, date) {
  if (!id || !date) return;
  const dotKey = id.replace('_', '.');
  const noteKey = dotKey + ':' + date;
  if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
  const current = state.importedData.markerValueNotes[noteKey] || '';
  const result = await showPromptDialog(
    current ? `Edit note for ${date}` : `Add note for ${date}`,
    { defaultValue: current, placeholder: 'e.g. fasted 14h, post-workout, different lab', okLabel: 'Save' }
  );
  // showPromptDialog collapses cancel + empty-submit to null. Treat null as
  // "no change" — explicit deletion is via the dedicated × affordance.
  if (result === null) return;
  // Cap to match saveManualEntry — defends against runaway paste flowing
  // into IDB, sync payloads, and AI context.
  const capped = result.length > 500 ? result.slice(0, 500) : result;
  state.importedData.markerValueNotes[noteKey] = capped;
  // Mirror across the insulin dual-mapping in BOTH directions so a note
  // edited via diabetes.insulin_d also lands on hormones.insulin and vice
  // versa.
  const mirror = _insulinMirrorNoteKey(dotKey, date);
  if (mirror) state.importedData.markerValueNotes[mirror] = capped;
  saveImportedData();
  showDetailModal(id);
}

export async function deleteValueNote(id, date) {
  if (!id || !date) return;
  if (!await showConfirmDialog(`Remove the note for ${date}?`)) return;
  const dotKey = id.replace('_', '.');
  const noteKey = dotKey + ':' + date;
  if (state.importedData.markerValueNotes && state.importedData.markerValueNotes[noteKey]) {
    delete state.importedData.markerValueNotes[noteKey];
    // Mirror cleanup in BOTH directions across the insulin dual-mapping.
    const mirror = _insulinMirrorNoteKey(dotKey, date);
    if (mirror) delete state.importedData.markerValueNotes[mirror];
    saveImportedData();
    showDetailModal(id);
  }
}

export function closeModal() {
  document.getElementById("modal-overlay").classList.remove("show");
  const detailModal = document.getElementById("detail-modal");
  if (detailModal) detailModal.className = 'modal';
  if (state.chartInstances["modal"]) { state.chartInstances["modal"].destroy(); delete state.chartInstances["modal"]; }
  document.removeEventListener('click', closeSuggestionsOnClickOutside);
  if (window.closeEMFInterpretation) window.closeEMFInterpretation();
  // Detail-modal Tab focus trap (wearables) — uninstall explicitly so the
  // global keydown handler doesn't outlive the modal it scoped to.
  if (window._uninstallWearableModalFocusTrap) window._uninstallWearableModalFocusTrap();
  // Clear the active-detail-marker pointer so a later toggleAltUnits (fired
  // from Settings → Display) doesn't re-open this modal on top of Settings.
  state._activeDetailMarkerId = null;
  restoreModalTrigger();
}


// ═══════════════════════════════════════════════
// EDITABLE REFERENCE RANGES
// ═══════════════════════════════════════════════

export function editRefRange(id, type, evt) {
  const marker = state.markerRegistry[id];
  if (!marker) return;
  const isOptimal = type === 'optimal';
  const curMin = isOptimal ? marker.optimalMin : marker.refMin;
  const curMax = isOptimal ? marker.optimalMax : marker.refMax;
  const label = isOptimal ? 'Optimal' : 'Reference';

  const span = evt.target.closest('.ref-editable');
  if (!span) return;

  // Replace span with inline inputs
  const form = document.createElement('span');
  form.className = 'ref-edit-form';
  form.innerHTML = `${escapeHTML(label)}: <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${escapeAttr(curMin ?? '')}" placeholder="none" class="ref-edit-input" id="ref-edit-min"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-min').value='';document.getElementById('ref-edit-min').focus()" title="Clear (open-ended)">\u00d7</button></span> \u2013 <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${escapeAttr(curMax ?? '')}" placeholder="none" class="ref-edit-input" id="ref-edit-max"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-max').value='';document.getElementById('ref-edit-max').focus()" title="Clear (open-ended)">\u00d7</button></span> <button class="ref-edit-save" onclick="saveRefRange('${id}','${type}')">Save</button>`;
  span.replaceWith(form);
  form.querySelector('#ref-edit-min').focus();

  // Enter to save
  form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveRefRange(id, type); } });
  // Escape to cancel
  form.addEventListener('keydown', e => { if (e.key === 'Escape') showDetailModal(id); });
}

export function saveRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const minEl = document.getElementById('ref-edit-min');
  const maxEl = document.getElementById('ref-edit-max');
  if (!minEl || !maxEl) return;
  let newMin = minEl.value.trim() !== '' ? parseFloat(minEl.value) : null;
  let newMax = maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : null;
  // Treat NaN as null (open-ended)
  if (newMin != null && isNaN(newMin)) newMin = null;
  if (newMax != null && isNaN(newMax)) newMax = null;

  // If user is in US mode, convert back to SI for storage (overrides are applied before unit conversion)
  if (newMin != null) newMin = convertDisplayToSI(dotKey, newMin);
  if (newMax != null) newMax = convertDisplayToSI(dotKey, newMax);

  if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
  if (!state.importedData.refOverrides[dotKey]) state.importedData.refOverrides[dotKey] = {};

  const ovr = state.importedData.refOverrides[dotKey];
  if (type === 'optimal') {
    // Stash lab values before first manual edit
    if (ovr.optimalSource !== 'manual' && ('optimalMin' in ovr) && !('labOptimalMin' in ovr)) {
      ovr.labOptimalMin = ovr.optimalMin;
      ovr.labOptimalMax = ovr.optimalMax;
    }
    ovr.optimalMin = newMin;
    ovr.optimalMax = newMax;
    ovr.optimalSource = 'manual';
  } else {
    if (ovr.refSource !== 'manual' && ('refMin' in ovr) && !('labRefMin' in ovr)) {
      ovr.labRefMin = ovr.refMin;
      ovr.labRefMax = ovr.refMax;
    }
    ovr.refMin = newMin;
    ovr.refMax = newMax;
    ovr.refSource = 'manual';
  }

  saveImportedData();
  // Refresh background view, then re-render modal with new ranges
  const activeNav = document.querySelector('.nav-item.active');
  markerDetailDeps.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification('Range updated', 'info');
}

export function revertRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const ovr = state.importedData?.refOverrides?.[dotKey];
  if (!ovr) return;
  let msg = 'Range reverted to default';
  if (type === 'optimal') {
    if ('labOptimalMin' in ovr) {
      // Revert to imported lab range
      ovr.optimalMin = ovr.labOptimalMin;
      ovr.optimalMax = ovr.labOptimalMax;
      ovr.optimalSource = 'import';
      delete ovr.labOptimalMin; delete ovr.labOptimalMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.optimalMin; delete ovr.optimalMax; delete ovr.optimalSource;
    }
  } else {
    if ('labRefMin' in ovr) {
      ovr.refMin = ovr.labRefMin;
      ovr.refMax = ovr.labRefMax;
      ovr.refSource = 'import';
      delete ovr.labRefMin; delete ovr.labRefMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.refMin; delete ovr.refMax; delete ovr.refSource;
    }
  }
  // Clean up empty override objects
  if (Object.keys(ovr).length === 0) delete state.importedData.refOverrides[dotKey];
  saveImportedData();
  const activeNav = document.querySelector('.nav-item.active');
  markerDetailDeps.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification(msg, 'info');
}

// ═══════════════════════════════════════════════
// MARKER NOTES
// ═══════════════════════════════════════════════

export function toggleMarkerNoteEditor(dotKey) {
  const editor = document.getElementById('marker-note-editor');
  if (!editor) return;
  const isHidden = editor.style.display === 'none';
  editor.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('marker-note-input');
    if (input) input.focus();
  }
}

export function saveMarkerNote(dotKey, id) {
  const input = document.getElementById('marker-note-input');
  const text = input?.value?.trim();
  if (!text) {
    // Empty text = delete the note
    if (state.importedData.markerNotes?.[dotKey]) {
      delete state.importedData.markerNotes[dotKey];
      saveImportedData();
      showNotification('Note removed', 'info');
      showDetailModal(id);
    }
    return;
  }
  if (!state.importedData.markerNotes) state.importedData.markerNotes = {};
  state.importedData.markerNotes[dotKey] = text;
  saveImportedData();
  showNotification('Note saved', 'success');
  showDetailModal(id);
}

export function deleteMarkerNote(dotKey, id) {
  if (!state.importedData.markerNotes) return;
  delete state.importedData.markerNotes[dotKey];
  saveImportedData();
  showNotification('Note removed', 'info');
  showDetailModal(id);
}
