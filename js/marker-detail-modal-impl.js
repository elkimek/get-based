// @ts-check
// marker-detail-modal-impl.js — Marker detail, manual entry, custom marker, and range modal flows

import { state } from './state.js';
import { UNIT_CONVERSIONS, getAlternateUnit } from './schema.js';
import { bindDetailModalSyncRefresh, escapeHTML, escapeAttr, getStatus, formatValue, safeMarkerId } from './utils.js';
import { getActiveData } from './data.js';
import { getEffectiveRange, getEffectiveRangeForDate, getEffectiveRangeLabelForDate } from './marker-analysis.js';
import { createLineChart, getMarkerDescription } from './charts.js';
import { closeSuggestionsOnClickOutside } from './context-cards.js';
import { hasAIProvider } from './api.js';
import { getMarkerStorageDotKey, resolveActiveMarkerPath } from './marker-placement.js';
import { installMarkerDetailActionDelegates, markerDetailActionAttrs } from './marker-detail-actions.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { rememberModalTrigger, restoreModalTrigger } from './modal-trigger-memory.js';
import { markerRangeSuggestionIssueUrl } from './marker-range-suggestions.js';
import { buildMarkerHistoryMetadata } from './marker-detail-history.js';
import {
  BIO_AGE_BORTZ_INPUTS,
  BIO_AGE_PHENO_INPUTS,
  bioAgeInputStatusAtIndex,
  bioAgeReferenceIndex,
  fetchCustomMarkerDescription,
} from './marker-detail-content.js';
import {
  configureMarkerDetailManualEntry,
  openManualEntryForm,
} from './marker-detail-manual-entry.js';
import {
  configureMarkerDetailCustomMarkers,
  deleteCustomMarker,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
} from './marker-detail-custom-markers.js';
import { configureMarkerDetailPlacement, openMarkerPlacementModal, renderMarkerPlacementSummary, restoreMarkerPlacement, saveMarkerPlacement } from './marker-detail-placement.js';
import {
  askAIAboutMarkerRuntime,
  buildMarkerDetailSidebarRuntime,
  closeEMFInterpretationRuntime,
  getRelevantSNPsRuntime,
  hasRecommendationSectionRendererRuntime,
  isDashboardQuickMarkerPinnedRuntime,
  isProductRecsEnabledRuntime,
  navigateMarkerDetailRuntime,
  renameMarkerRuntime,
  renderRecommendationSectionRuntime,
  revertMarkerNameRuntime,
  showEmojiPickerRuntime,
  toggleDashboardQuickMarkerPinRuntime,
  uninstallWearableModalFocusTrapRuntime,
  loadMarkerDetailStylesheet, openWithMarkerDetailStylesheet, setDetailModalShell,
} from './marker-detail-runtime.js';
import {
  configureMarkerDetailEditing,
  editRefRange,
  saveRefRange,
  revertRefRange,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  deleteMarkerValue,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
} from './marker-detail-editing.js';

export {
  deleteCustomMarker,
  editRefRange,
  fetchCustomMarkerDescription,
  openCreateMarkerModal,
  openManualEntryForm,
  pickNewCatIcon,
  saveRefRange,
  saveCustomMarker,
  revertRefRange,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  deleteMarkerValue,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
};
export { loadMarkerDetailStylesheet, rememberModalTrigger };

const markerDetailDeps = /** @type {{
  navigate: (category?: string, data?: any) => any,
  isDashboardQuickMarkerPinned: (id?: string) => boolean,
  toggleDashboardQuickMarkerPin: (id?: string) => any,
  renameMarker: (id?: string) => any,
  revertMarkerName: (id?: string) => any,
  askAIAboutMarker: (id?: string) => any,
  showEmojiPicker: (el: Element, callback: (emoji?: string | null) => void, opts?: any) => any,
}} */ ({
  navigate: navigateMarkerDetailRuntime,
  isDashboardQuickMarkerPinned: isDashboardQuickMarkerPinnedRuntime,
  toggleDashboardQuickMarkerPin: toggleDashboardQuickMarkerPinRuntime,
  renameMarker: renameMarkerRuntime,
  revertMarkerName: revertMarkerNameRuntime,
  askAIAboutMarker: askAIAboutMarkerRuntime,
  showEmojiPicker: showEmojiPickerRuntime,
});

/**
 * @param {Partial<typeof markerDetailDeps>} [deps]
 */
export function configureMarkerDetailModal(deps = {}) {
  Object.assign(markerDetailDeps, deps);
}

configureMarkerDetailEditing({
  navigate: (...args) => markerDetailDeps.navigate(...args),
  buildSidebar: () => buildMarkerDetailSidebarRuntime(),
  showDetailModal: (...args) => showDetailModal(...args),
  openManualEntryForm: (id, prefillDate) => id ? openManualEntryForm(id, prefillDate) : false,
  closeModal: () => closeModal(),
});
configureMarkerDetailManualEntry({ showDetailModal });
configureMarkerDetailCustomMarkers({
  closeModal,
  navigate: (...args) => markerDetailDeps.navigate(...args),
  openManualEntryForm,
  showEmojiPicker: (...args) => markerDetailDeps.showEmojiPicker(...args),
});
configureMarkerDetailPlacement({ showDetailModal });
if (typeof document !== 'undefined') {
  installMarkerDetailActionDelegates({
    closeModal,
    toggleDashboardQuickMarkerPin: (...args) => markerDetailDeps.toggleDashboardQuickMarkerPin(...args),
    editRefRange,
    revertRefRange,
    renameMarker: (...args) => markerDetailDeps.renameMarker(...args),
    revertMarkerName: (...args) => markerDetailDeps.revertMarkerName(...args),
    openMarkerPlacementModal, saveMarkerPlacement, restoreMarkerPlacement,
    editMarkerValue,
    deleteMarkerValue,
    revertMarkerValue,
    editValueNote,
    deleteValueNote,
    showDetailModal,
    openManualEntryForm,
    askAIAboutMarker: (...args) => markerDetailDeps.askAIAboutMarker(...args),
    toggleMarkerNoteEditor,
    saveMarkerNote,
    deleteMarkerNote,
    deleteCustomMarker,
    saveManualEntry,
    saveAndAddAnotherManualEntry,
    pickNewCatIcon,
    saveCustomMarker,
  });
}

/**
 * @param {{ modal?: HTMLElement | null }} [opts]
 */
function refreshOpenMarkerDetailModalOnSync({ modal } = {}) {
  const id = modal?.dataset?.syncRefreshItemId || state._activeDetailMarkerId;
  if (!id) return;
  showDetailModal(id);
}

bindDetailModalSyncRefresh('marker', refreshOpenMarkerDetailModalOnSync);

// Marker detail modals are already a focused view, so keep history compact by
// default and expand in place instead of opening a nested history modal.
const MARKER_HISTORY_DEFAULT_CAP = 3;
const MARKER_HISTORY_EXPANDED_CAP = 40;

function getManualValueForMarker(dotKey, date) {
  const map = state.importedData.manualValues;
  if (!map || typeof map !== 'object' || !dotKey || !date) return undefined;
  const key = dotKey + ':' + date;
  if (Object.prototype.hasOwnProperty.call(map, key) && map[key] != null && map[key] !== true) return map[key];
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

// ═══════════════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════════════

export function showDetailModal(id, opts = {}) {
  if (!safeMarkerId(id)) return Promise.resolve(false);
  return openWithMarkerDetailStylesheet(() => renderDetailModal(id, opts));
}

function renderDetailModal(id, opts = {}) {
  // id is interpolated into delegated data-action attributes throughout the
  // modal body. Reject anything outside the strict allowlist so a poisoned
  // customMarker key cannot break attribute context or state lookups.
  if (!safeMarkerId(id)) return false;
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  let marker = data.categories[catKey]?.markers[mKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return false;
  // Remember which marker is open so toggleAltUnits can re-render in place.
  state._activeDetailMarkerId = id;
  rememberModalTrigger();
  const modal = setDetailModalShell('marker-detail-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return false;
  modal.dataset.syncRefreshKind = 'marker';
  modal.dataset.syncRefreshItemId = id;
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
  const latestRange = latestPoint ? getEffectiveRangeForDate(marker, latestPoint.i) : r;
  const latestHasRange = latestRange.min != null || latestRange.max != null;
  const latestStatus = latestPoint ? (latestHasRange ? getStatus(latestPoint.v, latestRange.min, latestRange.max) : 'unrated') : 'missing';
  const statusText = latestStatus === 'normal' ? 'In range'
    : latestStatus === 'high' ? 'Above range'
    : latestStatus === 'low' ? 'Below range'
    : latestStatus === 'unrated' ? 'No range'
    : 'No value';
  const deltaFromPrev = latestPoint && prevPoint && Number(prevPoint.v) !== 0
    ? (((Number(latestPoint.v) - Number(prevPoint.v)) / Number(prevPoint.v)) * 100)
    : null;
  const latestUnit = marker.unit || '';
  const latestDisplay = latestPoint ? formatValue(latestPoint.v) : '—';
  const latestDateLabel = latestPoint ? (dates[latestPoint.i] || 'Latest') : 'No values';
  const latestContextRange = latestPoint ? marker.contextRefRanges?.[latestPoint.i] : null;
  const latestContextOptimalRange = latestPoint ? marker.contextOptimalRanges?.[latestPoint.i] : null;
  const referenceRange = latestContextRange || { min: marker.refMin, max: marker.refMax };
  const hasReferenceRange = referenceRange.min != null || referenceRange.max != null;
  const referenceMinDisplay = hasReferenceRange && referenceRange.min != null ? formatValue(referenceRange.min) : '—';
  const referenceMaxDisplay = hasReferenceRange && referenceRange.max != null ? formatValue(referenceRange.max) : '—';
  const referenceDisplay = `${referenceMinDisplay}–${referenceMaxDisplay} ${latestUnit}`.trim();
  const referenceMetaLabel = latestPoint ? getEffectiveRangeLabelForDate(marker, latestPoint.i, 'reference') : (marker.rangePolicy === 'target' ? 'Target' : 'Reference');
  const optimalRange = latestContextOptimalRange || { min: marker.optimalMin, max: marker.optimalMax };
  const hasOptimalRange = optimalRange.min != null || optimalRange.max != null;
  const optimalDisplay = `${optimalRange.min != null ? formatValue(optimalRange.min) : '—'}–${optimalRange.max != null ? formatValue(optimalRange.max) : '—'} ${latestUnit}`.trim();
  const optimalMetaLabel = latestContextOptimalRange
    ? (marker.contextOptimalRangeLabels?.[latestPoint.i] || 'Optimal guidance')
    : 'Optimal';
  const latestPhaseRange = latestPoint ? marker.phaseRefRanges?.[latestPoint.i] : null;
  const hasLatestPhaseRange = latestPhaseRange?.min != null || latestPhaseRange?.max != null;
  const phaseDisplay = `${latestRange.min != null ? formatValue(latestRange.min) : '—'}–${latestRange.max != null ? formatValue(latestRange.max) : '—'} ${latestUnit}`.trim();
  let rangeMainDisplay = 'Not set';
  let rangeMainLabel = 'range';
  let rangeSecondaryDisplay = '';
  let rangeSecondaryLabel = '';
  if (hasLatestPhaseRange) {
    rangeMainDisplay = phaseDisplay;
    rangeMainLabel = getEffectiveRangeLabelForDate(marker, latestPoint.i, 'reference').toLowerCase();
  } else if (state.rangeMode === 'both') {
    if (hasReferenceRange) {
      rangeMainDisplay = referenceDisplay;
      rangeMainLabel = referenceMetaLabel.toLowerCase();
      if (hasOptimalRange) {
        rangeSecondaryDisplay = optimalDisplay;
        rangeSecondaryLabel = optimalMetaLabel;
      }
    } else if (hasOptimalRange) {
      rangeMainDisplay = optimalDisplay;
      rangeMainLabel = 'optimal';
    } else if (latestContextRange) {
      rangeMainLabel = referenceMetaLabel.toLowerCase();
    }
  } else if (state.rangeMode === 'optimal' && hasOptimalRange) {
    rangeMainDisplay = optimalDisplay;
    rangeMainLabel = optimalMetaLabel.toLowerCase();
  } else if (hasReferenceRange) {
    rangeMainDisplay = referenceDisplay;
    rangeMainLabel = referenceMetaLabel.toLowerCase();
  } else if (latestContextRange) {
    rangeMainLabel = referenceMetaLabel.toLowerCase();
  }
  const clampPct = value => Math.max(0, Math.min(100, value));
  const numericOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const rangeBandHtml = (() => {
    const latestValue = latestPoint ? numericOrNull(latestPoint.v) : null;
    const refMin = numericOrNull(referenceRange.min);
    const refMax = numericOrNull(referenceRange.max);
    const effMin = numericOrNull(latestRange.min);
    const effMax = numericOrNull(latestRange.max);
    const optMin = numericOrNull(optimalRange.min);
    const optMax = numericOrNull(optimalRange.max);
    if (effMin == null || effMax == null || latestValue == null || Number(effMax) === Number(effMin)) return '';
    const baseMin = refMin ?? effMin;
    const baseMax = refMax ?? effMax;
    if (baseMin == null || baseMax == null || Number(baseMax) === Number(baseMin)) return '';
    const useDatedBand = (hasLatestPhaseRange || !!latestContextRange) && effMin != null && effMax != null;
    const useOptimalBand = !useDatedBand && state.rangeMode !== 'reference' && optMin != null && optMax != null;
    const goodMin = useDatedBand ? Math.min(effMin, effMax) : useOptimalBand ? Math.min(optMin, optMax) : Math.min(baseMin, baseMax);
    const goodMax = useDatedBand ? Math.max(effMin, effMax) : useOptimalBand ? Math.max(optMin, optMax) : Math.max(baseMin, baseMax);
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
  const dotKey = getMarkerStorageDotKey(marker, id);
  if (!dotKey) return false;
  let rangeInfo = '';
  const overrides = state.importedData?.refOverrides?.[dotKey] || {};
  const refEditable = (label, min, max, type) => {
    const isEdited = type === 'optimal' ? ('optimalMin' in overrides || 'optimalMax' in overrides) : ('refMin' in overrides || 'refMax' in overrides);
    const source = type === 'optimal' ? overrides.optimalSource : overrides.refSource;
    const badgeLabel = source === 'manual' ? 'edited' : 'lab';
    const hasLabStash = type === 'optimal' ? 'labOptimalMin' in overrides : 'labRefMin' in overrides;
    const badgeTitle = source === 'manual' ? (hasLabStash ? 'Manually edited — click to revert to lab range' : 'Manually edited — click to revert to default') : 'Custom range from your lab — click to revert to default';
    const editedBadge = isEdited ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="${badgeTitle}" title="${badgeTitle}" ${markerDetailActionAttrs('revert-ref-range', { id, type })}>${badgeLabel} \u00d7</span>` : '';
    const currentRange = `${min != null ? min : '–'} to ${max != null ? max : '–'}`;
    return ` &middot; <button type="button" class="ref-editable${type === 'optimal' ? ' ref-editable-optimal' : ''}" aria-label="Edit ${label} range, currently ${escapeAttr(currentRange)}" ${markerDetailActionAttrs('edit-ref-range', { id, type })}>Edit ${label.toLowerCase()}</button>${editedBadge}`;
  };
  const isCustom = !!state.importedData?.customMarkers?.[dotKey];
  const hasRef = hasReferenceRange || marker.refMin != null || marker.refMax != null;
  const hasOpt = hasOptimalRange;
  const referenceControlLabel = marker.rangePolicy === 'target' && !marker.referenceRangeSource ? 'Target' : 'Reference';
  if (state.rangeMode === 'both') {
    if (hasRef) rangeInfo += refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref');
    else if (isCustom) rangeInfo += refEditable('Reference', '–', '–', 'ref');
    if (hasOpt) rangeInfo += refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal');
    else if (isCustom) rangeInfo += refEditable('Optimal', '–', '–', 'optimal');
  } else if (state.rangeMode === 'optimal') {
    if (hasOpt) rangeInfo = refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal');
    else if (isCustom) rangeInfo = refEditable('Optimal', '–', '–', 'optimal');
  } else if (hasRef) {
    rangeInfo = refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref');
  } else if (isCustom) {
    rangeInfo = refEditable('Reference', '–', '–', 'ref');
  }
  const rangeCardControls = rangeInfo ? rangeInfo.replace(/^ &middot; /, '') : '';
  const hasPersonalRange = ['refMin', 'refMax', 'optimalMin', 'optimalMax']
    .some(field => Object.prototype.hasOwnProperty.call(overrides, field));
  const rangeSuggestionUrl = isCustom || hasPersonalRange ? null : markerRangeSuggestionIssueUrl(dotKey);
  const rangeSuggestionLink = rangeSuggestionUrl
    ? `<a class="marker-range-suggest" href="${escapeAttr(rangeSuggestionUrl)}" target="_blank" rel="noopener noreferrer" title="Open a public, pre-filled GitHub issue without including your health data">Suggest a better range <span aria-hidden="true">↗</span></a>`
    : '';
  const isRenamed = !!state.importedData?.markerLabels?.[dotKey];
  const renameLink = isRenamed
    ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert renamed marker to original" title="Renamed — click to revert to original" ${markerDetailActionAttrs('revert-marker-name', { id })} style="cursor:pointer">renamed ×</span> <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" ${markerDetailActionAttrs('rename-marker', { id })} style="cursor:pointer;font-size:12px">rename</span>`
    : ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" ${markerDetailActionAttrs('rename-marker', { id })} style="cursor:pointer;font-size:12px">rename</span>`;
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
        if (hasOpt) altRanges += ` &middot; <span style="color:var(--green)">Optimal: ${altRange(optimalRange.min, optimalRange.max)}</span>`;
      } else if (state.rangeMode === 'optimal' && hasOpt) {
        altRanges = ` &middot; Optimal: ${altRange(optimalRange.min, optimalRange.max)}`;
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
        ${renderMarkerPlacementSummary(id, marker, data.categories)}
        <h3>${escapeHTML(marker.name)}${renameLink}</h3>
        <div class="modal-unit">${escapeHTML(marker.unit)}</div>
        ${altUnitInfo}
      </div>
      <div class="gb-detail-head-actions">
        <button type="button" class="gb-detail-pin-btn${quickMarkerPinned ? ' is-pinned' : ''}" aria-pressed="${quickMarkerPinned ? 'true' : 'false'}" title="${escapeAttr(quickMarkerPinTitle)}" ${markerDetailActionAttrs('quick-pin', { id })}>${escapeHTML(quickMarkerPinText)}</button>
        <span class="gb-detail-status gb-detail-status-${escapeAttr(latestStatus)}">${escapeHTML(statusText)}</span>
      </div>
      <button type="button" class="modal-close" aria-label="Close" ${markerDetailActionAttrs('close-modal')}>&times;</button>
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
        ${rangeSecondaryDisplay
          ? `<div class="stat-card-meta">${escapeHTML(rangeSecondaryLabel)} ${escapeHTML(rangeSecondaryDisplay)}</div>`
          : (hasLatestPhaseRange || latestContextRange) ? `<div class="stat-card-meta">Used for the latest status</div>` : ''}
        ${(rangeCardControls || rangeSuggestionLink) ? `<div class="stat-card-range-controls">${rangeCardControls}${rangeSuggestionLink}</div>` : ''}
      </div>
    </div>
    ${rangeBandHtml}
    <div class="gb-detail-section-label">Trend</div>
    <div class="modal-chart"><canvas id="chart-modal"></canvas></div>
    <div class="gb-detail-section-label">History <span>All time</span></div>
    <div class="modal-values-grid marker-history-list">`;
  for (const point of visibleHistoryPoints) {
    const { v, i } = point;
    const ri = getEffectiveRangeForDate(marker, i);
    const hasPointRange = ri.min != null || ri.max != null;
    const s = hasPointRange ? getStatus(v, ri.min, ri.max) : 'unrated';
    const sl = s==="normal"?"\u2713 In Range":s==="high"?"\u25B2 Above Range":s==="low"?"\u25BC Below Range":s === 'unrated' ? 'No range' : "Unknown";
    const phaseLabel = marker.phaseLabels && marker.phaseLabels[i];
    const phaseInfo = phaseLabel ? `<div class="mv-phase">${phaseLabel} \u2022 ${formatValue(ri.min)}\u2013${formatValue(ri.max)}</div>` : '';
    const rawDate = marker.singlePoint ? null : data.dates[i];
    const actionDate = rawDate == null ? 'null' : rawDate;
    const matchingNote = rawDate && state.importedData.notes ? state.importedData.notes.find(n => n.date === rawDate) : null;
    const noteIcon = matchingNote ? `<button type="button" class="mv-note" ${markerDetailActionAttrs('toggle-history-note')}>Note</button><div class="mv-note-text">${escapeHTML(matchingNote.text)}</div>` : '';
    const mvKey = dotKey + ':' + rawDate;
    const srcEntry = rawDate ? state.importedData.entries?.find(e => e.date === rawDate) : null;
    const src = srcEntry?.markerSources?.[dotKey];
    const { collectionContextHtml, sourceHtml } = buildMarkerHistoryMetadata(srcEntry, src, rawDate);
    const manualVal = rawDate ? getManualValueForMarker(dotKey, rawDate) : undefined;
    const isManualSource = !!(src && src.file == null);
    const isManual = isManualSource || (manualVal !== undefined && manualVal !== null);
    const canRevert = manualVal !== undefined && manualVal !== null && manualVal !== true;
    const manualBadge = canRevert
      ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert manual value to imported value" title="Manual — click to revert to imported value" ${markerDetailActionAttrs('revert-marker-value', { id, date: actionDate })}>manual \u00d7</span>`
      : isManual ? ' <span class="ref-edited-badge" title="Manually entered">manual</span>' : '';
    const deleteBtn = `<button class="mv-delete" ${markerDetailActionAttrs('delete-marker-value', { id, date: actionDate })} title="Remove this value">&times;</button>`;
    const editAction = rawDate ? ` ${markerDetailActionAttrs('edit-marker-value', { id, date: actionDate, value: v })} role="button" tabindex="0" title="Click to edit" style="cursor:pointer"` : '';
    // Per-value note (markerValueNotes keyed `dotKey:date`).
    const valueNote = rawDate ? state.importedData.markerValueNotes?.[mvKey] : null;
    const valueNoteHtml = rawDate
      ? (valueNote
          ? `<div class="mv-value-note has-note"><span class="mv-value-note-text" role="button" tabindex="0" title="Click to edit note" ${markerDetailActionAttrs('edit-value-note', { id, date: actionDate })}>${escapeHTML(valueNote)}</span> <button class="mv-value-note-delete" title="Remove note" ${markerDetailActionAttrs('delete-value-note', { id, date: actionDate })}>&times;</button></div>`
          : `<div class="mv-value-note add-note" role="button" tabindex="0" title="Add a note for this value" ${markerDetailActionAttrs('edit-value-note', { id, date: actionDate })}>+ note</div>`)
      : '';
    const altVal = (hasConv && state.showAltUnits) ? getAlternateUnit(dotKey, v, isUSMode) : null;
    const altLine = altVal ? `<div class="mv-alt" title="Same value, alternate unit">≈ ${formatValue(altVal.value)} ${escapeHTML(altVal.unit)}</div>` : '';
    html += `<div class="modal-value-card marker-history-row status-${s}">${deleteBtn}
      <div class="marker-history-date-row"><div class="mv-date">${dates[i]}${noteIcon}</div>${sourceHtml}</div>
      <div class="marker-history-value-row"><div class="mv-value val-${s}"${editAction}>${formatValue(v)}${manualBadge}</div><div class="mv-status val-${s}">${sl}</div></div>
      ${altLine}${phaseInfo}${collectionContextHtml}${valueNoteHtml}</div>`;
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
    html += `<button class="marker-history-show-more" ${markerDetailActionAttrs('show-detail-modal', { id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true })}>${historyButtonLabel}</button>`;
  } else if (showAllHistory && modalPoints.length > MARKER_HISTORY_DEFAULT_CAP) {
    html += `<button class="marker-history-show-more" ${markerDetailActionAttrs('show-detail-modal', { id, scrollToHistory: true })}>Show last ${MARKER_HISTORY_DEFAULT_CAP} values</button>`;
  }
  const nonNull = modalPoints;
  if (nonNull.length >= 2) {
    const f = nonNull[0], l = nonNull[nonNull.length-1];
    const ch = l.v - f.v, pct = ((ch/f.v)*100).toFixed(1);
    const dir = ch > 0 ? "increased" : ch < 0 ? "decreased" : "unchanged";
    html += `<div class="modal-ref-info"><strong>Trend:</strong> ${dir} by ${Math.abs(ch).toFixed(2)} ${escapeHTML(marker.unit)} (${ch>0?"+":""}${pct}%) from ${dates[f.i]} to ${dates[l.i]}</div>`;
  }
  const calcInputs = {
    'calculatedRatios_phenoAge': BIO_AGE_PHENO_INPUTS,
    'calculatedRatios_bortzAge': BIO_AGE_BORTZ_INPUTS,
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
    'calculatedRatios_ft3ft4Ratio': [['thyroid', 'ft3', 'Free T3'], ['thyroid', 'ft4', 'Free T4']],
    'calculatedRatios_apoBapoAIRatio': [['lipids', 'apoB', 'ApoB'], ['lipids', 'apoAI', 'ApoA-I']],
    'calculatedRatios_crpHdlRatio': [['proteins', 'hsCRP', 'hs-CRP'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_mlr': [['differential', 'monocytes', 'Monocytes'], ['differential', 'lymphocytes', 'Lymphocytes']],
  };
  const inputs = calcInputs[dotKey.replace('.', '_')];
  if (inputs) {
    const issues = [];
    const activeMarker = (cat, key) => resolveActiveMarkerPath(data.categories, cat, key)?.marker;
    // Check for completely missing markers
    const missing = inputs.filter(([cat, key]) => {
      const vals = activeMarker(cat, key)?.values;
      return !vals || vals.every(v => v == null);
    });
    if ((dotKey === 'calculatedRatios.phenoAge' || dotKey === 'calculatedRatios.bortzAge' || dotKey === 'calculatedRatios.biologicalAge') && !state.profileDob) {
      issues.push('Date of birth not set (required for age at blood draw)');
    }
    if (missing.length > 0) {
      issues.push(`Missing: ${missing.map(m => m[2]).join(', ')}`);
    }
    // Biological age clocks: per-date gap check, CRP fallback, unit sanity
    const _isBioAgeClock = dotKey === 'calculatedRatios.phenoAge' || dotKey === 'calculatedRatios.bortzAge';
    if (_isBioAgeClock && state.profileDob) {
      // For CRP check: accept either hs-CRP or standard CRP
      const _hasCRPonDate = (idx) => {
        const hs = activeMarker('proteins', 'hsCRP')?.values?.[idx];
        const std = activeMarker('proteins', 'crp')?.values?.[idx];
        return hs != null || std != null;
      };
      // Override the missing check for CRP — it's satisfied by either marker
      const crpInInputs = inputs.some(([, key]) => key === 'hsCRP');
      if (crpInInputs && missing.some(([, key]) => key === 'hsCRP')) {
        const hasAnyCRP = activeMarker('proteins', 'hsCRP')?.values?.some(v => v != null)
          || activeMarker('proteins', 'crp')?.values?.some(v => v != null);
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
            const v = activeMarker(cat, key)?.values?.[latestIdx];
            return v == null;
          });
          if (nullAt.length > 0) {
            issues.push(`Missing on latest date (${data.dateLabels[latestIdx]}): ${nullAt.map(m => m[2]).join(', ')}`);
          }
          // CRP value sanity
          const crpVal = activeMarker('proteins', 'hsCRP')?.values?.[latestIdx]
            ?? activeMarker('proteins', 'crp')?.values?.[latestIdx];
          if (crpVal != null && crpVal <= 0) {
            issues.push('CRP is zero or negative — cannot calculate (log undefined)');
          }
          // Unit sanity warnings
          const albVal = activeMarker('proteins', 'albumin')?.values?.[latestIdx];
          if (albVal != null && albVal > 10) {
            issues.push(`Albumin value ${albVal} looks like g/dL — expected g/L (typically 35–55)`);
          }
          const lymphVal = activeMarker('differential', 'lymphocytesPct')?.values?.[latestIdx];
          if (lymphVal != null && lymphVal > 1) {
            issues.push(`Lymphocytes % value ${lymphVal} looks like a percentage — expected fraction 0–1 (e.g. 0.28)`);
          }
          const alpVal = activeMarker('biochemistry', 'alp')?.values?.[latestIdx];
          if (alpVal != null && alpVal > 10) {
            issues.push(`ALP value ${alpVal} looks like U/L — expected µkat/L (typically 0.5–2.0)`);
          }
        }
      }
    }
    // Biological Age: show component breakdown. The dashboard can show a
    // value from whichever component is non-null, so the modal should not
    // describe that as a generic "Not calculated" error.
    if (dotKey === 'calculatedRatios.biologicalAge') {
      const refIdx = bioAgeReferenceIndex(data, marker, latestPoint);
      const refDate = refIdx >= 0 ? data.dates?.[refIdx] : null;
      const refDateLabel = refIdx >= 0 ? (data.dateLabels?.[refIdx] || refDate || '') : '';
      const pheno = refIdx >= 0 ? activeMarker('calculatedRatios', 'phenoAge')?.values?.[refIdx] : null;
      const bortz = refIdx >= 0 ? activeMarker('calculatedRatios', 'bortzAge')?.values?.[refIdx] : null;
      const age = state.profileDob && refDate
        ? ((new Date(refDate + 'T00:00:00').getTime() - new Date(state.profileDob + 'T00:00:00').getTime()) / (365.25*24*60*60*1000))
        : null;
      const usableAge = typeof age === 'number' && Number.isFinite(age) && age > 0
        ? age
        : null;
      const profileRequirement = !state.profileDob
        ? { label: 'Date of birth', present: false, kind: 'profile' }
        : (refDate && usableAge == null)
          ? { label: 'Valid date of birth', present: false, kind: 'profile' }
          : null;
      const profileIssue = state.profileDob && refDate && usableAge == null
        ? 'Date of birth must be before the panel date'
        : null;
      const phenoStatus = bioAgeInputStatusAtIndex(data, refIdx, BIO_AGE_PHENO_INPUTS, profileRequirement);
      const bortzStatus = bioAgeInputStatusAtIndex(data, refIdx, BIO_AGE_BORTZ_INPUTS, profileRequirement);
      const renderInputGrid = (status) => status.map(s => {
        const title = s.kind === 'profile'
          ? (s.present ? 'Set in profile' : 'Required in profile')
          : (s.present ? 'In this panel' : 'Missing from this panel');
        return `<span class="bio-age-input ${s.present ? 'is-present' : 'is-missing'}" title="${escapeAttr(title)}">${s.present ? '✓' : '⚠'} ${escapeHTML(s.label)}</span>`;
      }).join('');
      const componentRow = (name, value, status) => {
        const missing = status.filter(s => !s.present);
        let header;
        if (value != null) {
          const delta = usableAge != null ? ` <span class="bio-age-delta">(${value - usableAge > 0 ? '+' : ''}${(value - usableAge).toFixed(1)}y)</span>` : '';
          header = `<span class="bio-age-glyph">✓</span> <strong>${escapeHTML(name)}:</strong> ${formatValue(value)}${delta}`;
        } else {
          const noun = missing.length === 1 ? 'input' : 'inputs';
          header = `<span class="bio-age-glyph">⚠</span> <strong>${escapeHTML(name)}:</strong> missing ${missing.length} of ${status.length} ${noun}`;
        }
        const klass = value != null ? 'bio-age-component-ok' : 'bio-age-component-missing';
        return `<div class="bio-age-component ${klass}">
          <div class="bio-age-component-header">${header}</div>
          <div class="bio-age-input-grid">${renderInputGrid(status)}</div>
        </div>`;
      };
      const dateNote = refDateLabel
        ? `<div class="bio-age-breakdown-sub">Based on your panel from ${escapeHTML(refDateLabel)}</div>`
        : '';
      const breakdownIssues = profileIssue ? [...issues, profileIssue] : issues;
      const issueNote = breakdownIssues.length > 0
        ? `<div class="bio-age-breakdown-warning">${breakdownIssues.map(escapeHTML).join('. ')}</div>`
        : '';
      html += `<div class="bio-age-breakdown">
        <div class="bio-age-breakdown-head">Component breakdown</div>
        ${dateNote}
        ${issueNote}
        ${componentRow('PhenoAge', pheno, phenoStatus)}
        ${componentRow('Bortz Age', bortz, bortzStatus)}
      </div>`;
    } else if (issues.length > 0) {
      html += `<div class="calc-missing-inputs">Not calculated — ${issues.join('. ')}</div>`;
    }
  }
  // Collect inline SNPs for the unified rec section (genetics + actionable tips together)
  const _inlineSNPs = state.importedData.genetics?.snps ? getRelevantSNPsRuntime(dotKey) : [];
  const shouldRenderRecommendations = isProductRecsEnabledRuntime() && hasRecommendationSectionRendererRuntime();
  html += `<div class="gb-detail-actions">
    <div class="gb-detail-action-row">
      <button class="manual-entry-btn" ${markerDetailActionAttrs('open-manual-entry', { id })}>+ Add Value Manually</button>
      <button class="ask-ai-btn" ${markerDetailActionAttrs('ask-ai', { id })}>Ask AI</button>
    </div>`;
  // Marker note
  const markerNote = state.importedData.markerNotes?.[dotKey] || '';
  html += `<div class="marker-note-section">
    <div class="marker-note-header"><span class="marker-note-label">Note</span><button class="marker-note-edit-btn" ${markerDetailActionAttrs('toggle-marker-note-editor', { dotKey })}>${markerNote ? 'Edit' : '+ Add note'}</button></div>
    ${markerNote ? `<div class="marker-note-text">${escapeHTML(markerNote)}</div>` : ''}
    <div class="marker-note-editor" id="marker-note-editor" style="display:none">
      <textarea id="marker-note-input" placeholder="Your notes about this marker (e.g. why it's high, what to watch for, what you've learned...)" rows="3">${escapeHTML(markerNote)}</textarea>
      <div class="marker-note-actions">
        <button class="import-btn import-btn-primary" ${markerDetailActionAttrs('save-marker-note', { dotKey, id })}>Save</button>
        <button class="import-btn import-btn-secondary" ${markerDetailActionAttrs('toggle-marker-note-editor', { dotKey })}>Cancel</button>
        ${markerNote ? `<button class="import-btn import-btn-secondary" style="color:var(--red)" ${markerDetailActionAttrs('delete-marker-note', { dotKey, id })}>Delete</button>` : ''}
	      </div>
	    </div>
	  </div>`;
  // Recommendation placeholder — shown for any marker with a catalog slot
  if (shouldRenderRecommendations) {
    html += `<div id="rec-modal-${id}"></div>`;
  }
  html += `</div>`;
  // Show delete link for custom markers only
  if (state.importedData?.customMarkers?.[dotKey]) {
    html += `<div style="text-align:center;margin-top:8px"><a href="#" style="color:var(--text-muted);font-size:0.8rem" ${markerDetailActionAttrs('delete-custom-marker', { id })}>Delete this marker</a></div>`;
  }
  modal.innerHTML = html;
  openModalOverlay(overlay);
  if (opts.scrollToHistory) {
    setTimeout(() => {
      const historyEl = modal.querySelector('.marker-history-list');
      if (historyEl) historyEl.scrollIntoView({ block: 'start' });
    }, 0);
  }
  // Async-fill recommendation section (unified: genetics + actionable tips)
  if (shouldRenderRecommendations) {
    const _markerStatus = latestStatus === 'unrated' ? 'missing' : latestStatus;
    renderRecommendationSectionRuntime(dotKey, { label: 'What can help', maxProducts: 3, inlineSNPs: _inlineSNPs, markerStatus: _markerStatus })
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
      createLineChart("modal", marker, data.dateLabels, data.dates, data.phaseLabels, {
        displayLabels: data.phaseDisplayLabels,
        cycleDays: data.phaseCycleDays,
        sources: data.phaseSources,
      });
    }
  }, 50);
  // Display marker description (sync for schema markers, async fetch for custom)
  const descEl = document.getElementById('marker-desc');
  if (descEl) {
    const descriptionKey = dotKey.replace('.', '_');
    const desc = getMarkerDescription(id) || getMarkerDescription(descriptionKey);
    if (desc) {
      descEl.textContent = desc;
      descEl.classList.add('loaded');
    } else if (!marker.desc && hasAIProvider()) {
      descEl.classList.add('loading');
      fetchCustomMarkerDescription(descriptionKey, marker.name, marker.unit).then(text => {
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
  return true;
}


export function closeModal() {
  closeModalOverlay('modal-overlay');
  const detailModal = document.getElementById("detail-modal");
  if (detailModal) {
    detailModal.className = 'modal';
    delete detailModal.dataset.syncRefreshKind;
    delete detailModal.dataset.syncRefreshMode;
    delete detailModal.dataset.syncRefreshIndex;
    delete detailModal.dataset.syncRefreshDate;
    delete detailModal.dataset.syncRefreshEditIdx;
    delete detailModal.dataset.syncRefreshItemId;
  }
  if (state.chartInstances["modal"]) { state.chartInstances["modal"].destroy(); delete state.chartInstances["modal"]; }
  document.removeEventListener('click', closeSuggestionsOnClickOutside);
  closeEMFInterpretationRuntime();
  // Detail-modal Tab focus trap (wearables) — uninstall explicitly so the
  // global keydown handler doesn't outlive the modal it scoped to.
  uninstallWearableModalFocusTrapRuntime();
  // Clear the active-detail-marker pointer so a later toggleAltUnits (fired
  // from Settings → Display) doesn't re-open this modal on top of Settings.
  state._activeDetailMarkerId = null;
  restoreModalTrigger();
}
