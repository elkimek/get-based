import {renderMarkerDetailModal} from './marker-detail-modal-presentation.js';
import {captureMarkerDetailText,projectMarkerDetailAction} from './marker-detail-projection.js';
import type {MarkerDetailRangeView,MarkerDetailHistoryView,MarkerDetailChromeView,MarkerDetailBioAgeView,MarkerDetailNotesView,RangeEditControl,AlternateRange,ChromeAlternateUnit,HistoryRow,HistoryPaging,HistoryTrend,BioAgeResult} from './marker-detail-view.js';
import type { MarkerModalOptions, MarkerModalCalls, MarkerModalData, MarkerModalRange, MarkerModalPoint, BioInputStatus } from '../types/marker-detail-modal-impl.js';
// marker-detail-modal-impl.js — Marker detail, manual entry, custom marker, and range modal flows

import { state } from './state.js';
import { bindDetailModalSyncRefresh, getStatus, formatValue, safeMarkerId } from './utils.js';
import { getActiveData } from './data.js';
import { getEffectiveRange, getEffectiveRangeForDate, getEffectiveRangeLabelForDate } from './marker-analysis.js';
import { createLineChart, getMarkerDescription } from './charts.js';
import { closeSuggestionsOnClickOutside } from './context-cards.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getMarkerStorageDotKey, resolveActiveMarkerPath } from './marker-placement.js';
import { installMarkerDetailActionDelegates } from './marker-detail-actions.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { rememberModalTrigger, restoreModalTrigger } from './modal-trigger-memory.js';
import { markerRangeSuggestionIssueUrl } from './marker-range-suggestions.js';
import { getAlternateUnitForProfile } from './unit-profiles.js';
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
import { configureMarkerDetailPlacement, openMarkerPlacementModal, projectMarkerPlacementSummary, restoreMarkerPlacement, saveMarkerPlacement } from './marker-detail-placement.js';
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

const markerDetailDeps: MarkerModalCalls = ({
  navigate: navigateMarkerDetailRuntime,
  isDashboardQuickMarkerPinned: isDashboardQuickMarkerPinnedRuntime,
  toggleDashboardQuickMarkerPin: toggleDashboardQuickMarkerPinRuntime,
  renameMarker: renameMarkerRuntime,
  revertMarkerName: revertMarkerNameRuntime,
  askAIAboutMarker: askAIAboutMarkerRuntime,
  showEmojiPicker: showEmojiPickerRuntime,
});

/**
 * @param {unknown} [deps]
 */
export function configureMarkerDetailModal(deps: unknown = {}) {
  Object.assign(markerDetailDeps, deps);
}

configureMarkerDetailEditing({
  navigate: (...args: Parameters<MarkerModalCalls['navigate']>) => markerDetailDeps.navigate(...args),
  buildSidebar: () => buildMarkerDetailSidebarRuntime(),
  showDetailModal: (...args: Parameters<typeof showDetailModal>) => showDetailModal(...args),
  openManualEntryForm: (id?: string, prefillDate?: unknown) => id ? openManualEntryForm(id, prefillDate) : false,
  closeModal: () => closeModal(),
});
configureMarkerDetailManualEntry({ showDetailModal });
configureMarkerDetailCustomMarkers({
  closeModal,
  navigate: (...args: Parameters<MarkerModalCalls['navigate']>) => markerDetailDeps.navigate(...args),
  openManualEntryForm,
  showEmojiPicker: (...args: Parameters<MarkerModalCalls['showEmojiPicker']>) => markerDetailDeps.showEmojiPicker(...args),
});
configureMarkerDetailPlacement({ showDetailModal });
if (typeof document !== 'undefined') {
  installMarkerDetailActionDelegates({
    closeModal,
    toggleDashboardQuickMarkerPin: (...args: Parameters<MarkerModalCalls['toggleDashboardQuickMarkerPin']>) => markerDetailDeps.toggleDashboardQuickMarkerPin(...args),
    editRefRange,
    saveRefRange,
    revertRefRange,
    renameMarker: (...args: Parameters<MarkerModalCalls['renameMarker']>) => markerDetailDeps.renameMarker(...args),
    revertMarkerName: (...args: Parameters<MarkerModalCalls['revertMarkerName']>) => markerDetailDeps.revertMarkerName(...args),
    openMarkerPlacementModal, saveMarkerPlacement, restoreMarkerPlacement,
    editMarkerValue,
    deleteMarkerValue,
    revertMarkerValue,
    editValueNote,
    deleteValueNote,
    showDetailModal,
    openManualEntryForm,
    askAIAboutMarker: (...args: Parameters<MarkerModalCalls['askAIAboutMarker']>) => markerDetailDeps.askAIAboutMarker(...args),
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
function refreshOpenMarkerDetailModalOnSync({ modal }: {modal?:HTMLElement|null} = {}) {
  const id = modal?.dataset?.syncRefreshItemId || state._activeDetailMarkerId;
  if (!id) return;
  showDetailModal(id);
}

bindDetailModalSyncRefresh('marker', refreshOpenMarkerDetailModalOnSync);

// Marker detail modals are already a focused view, so keep history compact by
// default and expand in place instead of opening a nested history modal.
const MARKER_HISTORY_DEFAULT_CAP = 3;
const MARKER_HISTORY_EXPANDED_CAP = 40;

function getManualValueForMarker(dotKey: string, date: unknown) {
  const map = state.importedData.manualValues;
  if (!map || typeof map !== 'object' || !dotKey || !date) return undefined;
  const key = dotKey + ':' + (date as string);
  if (Object.prototype.hasOwnProperty.call(map, key) && map[key] != null && map[key] !== true) return map[key];
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

// ═══════════════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════════════

export function showDetailModal(id: unknown, opts: unknown = {}) {
  if (!safeMarkerId(id)) return Promise.resolve(false);
  return openWithMarkerDetailStylesheet(() => renderDetailModal(id as string, opts as MarkerModalOptions));
}

function renderDetailModal(id: string, opts: MarkerModalOptions = {}) {
  // id is interpolated into delegated data-action attributes throughout the
  // modal body. Reject anything outside the strict allowlist so a poisoned
  // customMarker key cannot break attribute context or state lookups.
  if (!safeMarkerId(id)) return false;
  const data = (getActiveData as () => MarkerModalData)();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  let marker = data.categories[catKey]?.markers[mKey];
  if (marker) (state.markerRegistry as Record<string,unknown>)[id] = marker;
  if (!marker) return false;
  // Remember which marker is open so toggleAltUnits can re-render in place.
  state._activeDetailMarkerId = id;
  const overlay = document.getElementById("modal-overlay");
  // A visible history/mode rerender retains the original outside initiator.
  if (!overlay?.classList.contains('show')) {
    if (opts.returnFocus) rememberModalTrigger(opts.returnFocus);
    else rememberModalTrigger();
  }
  const modal = setDetailModalShell('marker-detail-modal');
  if (!modal) return false;
  modal.dataset.syncRefreshKind = 'marker';
  modal.dataset.syncRefreshItemId = id;
  const dates = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : data.dateLabels;
  const r = (getEffectiveRange as (marker:unknown)=>MarkerModalRange)(marker);
  const modalPoints = (marker.values.map((v, i) => ({ v, i })).filter(x => x.v !== null && x.v !== undefined)) as MarkerModalPoint[];
  const showAllHistory = !!opts.showAllHistory;
  const requestedHistoryLimit = Number.isFinite(opts.historyLimit)
    ? Math.max(MARKER_HISTORY_DEFAULT_CAP, Math.floor(opts.historyLimit as number))
    : MARKER_HISTORY_EXPANDED_CAP;
  const expandedHistoryLimit = Math.min(modalPoints.length, requestedHistoryLimit);
  const visibleHistoryPoints = showAllHistory ? modalPoints.slice(-expandedHistoryLimit) : modalPoints.slice(-MARKER_HISTORY_DEFAULT_CAP);
  const hiddenHistoryCount = modalPoints.length - visibleHistoryPoints.length;
  const latestPoint = modalPoints[modalPoints.length - 1] || null;
  const prevPoint = modalPoints.length > 1 ? modalPoints[modalPoints.length - 2] : null;
  const latestRange = latestPoint ? (getEffectiveRangeForDate as (marker:unknown,index:number)=>MarkerModalRange)(marker, latestPoint.i) : r;
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
  const latestDisplay = latestPoint ? (formatValue as (value:unknown)=>unknown)(latestPoint.v) : '—';
  const latestDateLabel = latestPoint ? (dates[latestPoint.i] || 'Latest') : 'No values';
  const latestContextRange = latestPoint ? marker.contextRefRanges?.[latestPoint.i] : null;
  const latestContextOptimalRange = latestPoint ? marker.contextOptimalRanges?.[latestPoint.i] : null;
  const referenceRange: MarkerModalRange = latestContextRange || { min: marker.refMin, max: marker.refMax };
  const hasReferenceRange = referenceRange.min != null || referenceRange.max != null;
  const referenceMinDisplay = hasReferenceRange && referenceRange.min != null ? formatValue(referenceRange.min) : '—';
  const referenceMaxDisplay = hasReferenceRange && referenceRange.max != null ? formatValue(referenceRange.max) : '—';
  const referenceDisplay = `${referenceMinDisplay}–${referenceMaxDisplay} ${latestUnit}`.trim();
  const referenceMetaLabel = latestPoint ? (getEffectiveRangeLabelForDate as (marker:unknown,index:number,type:string)=>string)(marker, latestPoint!.i, 'reference') : (marker.rangePolicy === 'target' ? 'Target' : 'Reference');
  const optimalRange: MarkerModalRange = latestContextOptimalRange || { min: marker.optimalMin, max: marker.optimalMax };
  const hasOptimalRange = optimalRange.min != null || optimalRange.max != null;
  const optimalDisplay = `${optimalRange.min != null ? formatValue(optimalRange.min) : '—'}–${optimalRange.max != null ? formatValue(optimalRange.max) : '—'} ${latestUnit}`.trim();
  const optimalMetaLabel = (latestContextOptimalRange
    ? (marker.contextOptimalRangeLabels?.[latestPoint!.i] || 'Optimal guidance')
    : 'Optimal') as string;
  const latestPhaseRange = latestPoint ? marker.phaseRefRanges?.[latestPoint.i] : null;
  const hasLatestPhaseRange = latestPhaseRange?.min != null || latestPhaseRange?.max != null;
  const phaseDisplay = `${latestRange.min != null ? formatValue(latestRange.min) : '—'}–${latestRange.max != null ? formatValue(latestRange.max) : '—'} ${latestUnit}`.trim();
  let rangeMainDisplay = 'Not set';
  let rangeMainLabel = 'range';
  let rangeSecondaryDisplay = '';
  let rangeSecondaryLabel = '';
  if (hasLatestPhaseRange) {
    rangeMainDisplay = phaseDisplay;
    rangeMainLabel = (getEffectiveRangeLabelForDate as (marker:unknown,index:number,type:string)=>string)(marker, latestPoint!.i, 'reference').toLowerCase();
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
  const clampPct = (value: number) => Math.max(0, Math.min(100, value));
  const numericOrNull = (value: unknown) => {
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
    if (effMin == null || effMax == null || latestValue == null || Number(effMax) === Number(effMin)) return null;
    const baseMin = refMin ?? effMin;
    const baseMax = refMax ?? effMax;
    if (baseMin == null || baseMax == null || Number(baseMax) === Number(baseMin)) return null;
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
    if (max === min) return null;
    let span = max - min;
    if (latestValue <= min) min -= span * 0.08;
    if (latestValue >= max) max += span * 0.08;
    span = max - min;
    if (span <= 0) return null;
    const dot = clampPct(((latestValue - min) / span) * 100);
    const optStart = clampPct(((goodMin - min) / span) * 100);
    const optEnd = clampPct(((goodMax - min) / span) * 100);
    const optLeft = optStart != null && optEnd != null ? Math.min(optStart, optEnd) : null;
    const optRight = optStart != null && optEnd != null ? Math.max(optStart, optEnd) : null;
    const optWidth = optLeft != null && optRight != null ? Math.max(0, optRight - optLeft) : 0;
    const lowZoneWidth = optLeft != null ? Math.max(0, optLeft) : 0;
    const highZoneWidth = optRight != null ? Math.max(0, 100 - optRight) : 0;
    return ({ kind: "band", lowZone: lowZoneWidth ? ({ kind: "low-zone", width: `${lowZoneWidth}` } satisfies MarkerDetailRangeView) : null,
      highZone: highZoneWidth ? ({ kind: "high-zone", left: `${optRight}`, width: `${highZoneWidth}` } satisfies MarkerDetailRangeView) : null,
      optimalZone: optWidth ? ({ kind: "optimal-zone", left: `${optLeft}`, width: `${optWidth}` } satisfies MarkerDetailRangeView) : null,
      status: `${captureMarkerDetailText(latestStatus)}`, position: `${dot}`, minimum: `${captureMarkerDetailText(formatValue(min))}`,
      maximum: `${captureMarkerDetailText(formatValue(max))}`,
    } satisfies MarkerDetailRangeView);
  })();
  const dotKey = (getMarkerStorageDotKey as (marker:unknown,id:string)=>string|null)(marker, id);
  if (!dotKey) return false;
  let rangeInfo: RangeEditControl[] = [];
  const overrides = state.importedData?.refOverrides?.[dotKey] || {};
  const refEditable = (label: string, min: unknown, max: unknown, type: string) => {
    const isEdited = type === 'optimal' ? ('optimalMin' in overrides || 'optimalMax' in overrides) : ('refMin' in overrides || 'refMax' in overrides);
    const source = type === 'optimal' ? overrides.optimalSource : overrides.refSource;
    const badgeLabel = source === 'manual' ? 'edited' : 'lab';
    const hasLabStash = type === 'optimal' ? 'labOptimalMin' in overrides : 'labRefMin' in overrides;
    const badgeTitle = source === 'manual' ? (hasLabStash ? 'Manually edited — click to revert to lab range' : 'Manually edited — click to revert to default') : 'Custom range from your lab — click to revert to default';
    const editedBadge = isEdited ? ({ kind: "edited-badge", label: `${badgeTitle}`, title: `${badgeTitle}`,
      actions: projectMarkerDetailAction('revert-ref-range', { id, type }), text: `${badgeLabel}`,
    } satisfies MarkerDetailRangeView) : null;
    const currentRange = `${min != null ? min : '–'} to ${max != null ? max : '–'}`;
    return ({ kind: "edit-control", optimalClass: `${type === 'optimal' ? ' ref-editable-optimal' : ''}`, label: `${label}`,
      currentRange: `${captureMarkerDetailText(currentRange)}`, actions: projectMarkerDetailAction('edit-ref-range', { id, type }),
      lowerLabel: `${label.toLowerCase()}`, badge: editedBadge,
    } satisfies MarkerDetailRangeView);
  };
  const isCustom = !!state.importedData?.customMarkers?.[dotKey];
  const hasRef = hasReferenceRange || marker.refMin != null || marker.refMax != null;
  const hasOpt = hasOptimalRange;
  const referenceControlLabel = marker.rangePolicy === 'target' && !marker.referenceRangeSource ? 'Target' : 'Reference';
  if (state.rangeMode === 'both') {
    if (hasRef) rangeInfo.push(refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref'));
    else if (isCustom) rangeInfo.push(refEditable('Reference', '–', '–', 'ref'));
    if (hasOpt) rangeInfo.push(refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal'));
    else if (isCustom) rangeInfo.push(refEditable('Optimal', '–', '–', 'optimal'));
  } else if (state.rangeMode === 'optimal') {
    if (hasOpt) rangeInfo = [refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal')];
    else if (isCustom) rangeInfo = [refEditable('Optimal', '–', '–', 'optimal')];
  } else if (hasRef) {
    rangeInfo = [refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref')];
  } else if (isCustom) {
    rangeInfo = [refEditable('Reference', '–', '–', 'ref')];
  }
  const rangeCardControls = rangeInfo.map((control,index)=>({...control,leadingSeparator:index!==0}));
  const hasPersonalRange = ['refMin', 'refMax', 'optimalMin', 'optimalMax']
    .some(field => Object.prototype.hasOwnProperty.call(overrides, field));
  const rangeSuggestionUrl = isCustom || hasPersonalRange ? null : markerRangeSuggestionIssueUrl(dotKey, state.unitSystem);
  const rangeSuggestionLink = rangeSuggestionUrl
    ? ({ kind: "suggestion", href: `${captureMarkerDetailText(rangeSuggestionUrl)}` } satisfies MarkerDetailRangeView)
    : null;
  const isRenamed = !!state.importedData?.markerLabels?.[dotKey];
  const renameLink = isRenamed
    ? ({kind: "renamed", revertActions: projectMarkerDetailAction('revert-marker-name', { id }), renameActions: projectMarkerDetailAction('rename-marker', { id })} satisfies MarkerDetailChromeView)
    : ({kind: "rename", actions: projectMarkerDetailAction('rename-marker', { id })} satisfies MarkerDetailChromeView);
  // Dual-unit summary: mirror values and ranges in the most useful alternate
  // unit for the active International, ANZ, or US profile.
  const probe = marker.refMax ?? marker.refMin ?? 1;
  const altProbe = (getAlternateUnitForProfile as (key:string,value:unknown,profile:unknown)=>ReturnType<typeof getAlternateUnitForProfile>)(dotKey, probe, state.unitSystem);
  const hasConv = !!altProbe;
  let altUnitInfo: ChromeAlternateUnit|null = null;
  if (hasConv && state.showAltUnits) {
    if (altProbe) {
      const altUnit = altProbe.unit;
      const altRange = (min: unknown, max: unknown) => {
        const a = min != null ? (getAlternateUnitForProfile as (key:string,value:unknown,profile:unknown)=>ReturnType<typeof getAlternateUnitForProfile>)(dotKey, min, state.unitSystem)?.value : null;
        const b = max != null ? (getAlternateUnitForProfile as (key:string,value:unknown,profile:unknown)=>ReturnType<typeof getAlternateUnitForProfile>)(dotKey, max, state.unitSystem)?.value : null;
        const dispA = a != null ? formatValue(a) : '–';
        const dispB = b != null ? formatValue(b) : '–';
        return `${dispA} – ${dispB}`;
      };
      let altRanges: AlternateRange[] = [];
      if (state.rangeMode === 'both') {
        if (hasRef) altRanges.push({label:'Reference',range:altRange(marker.refMin, marker.refMax),optimal:false});
        if (hasOpt) altRanges.push({label:'Optimal',range:altRange(optimalRange.min, optimalRange.max),optimal:true});
      } else if (state.rangeMode === 'optimal' && hasOpt) {
        altRanges = [{label:'Optimal',range:altRange(optimalRange.min, optimalRange.max),optimal:false}];
      } else if (hasRef) {
        altRanges = [{label:'Reference',range:altRange(marker.refMin, marker.refMax),optimal:false}];
      }
      altUnitInfo = ({kind: "alternate-unit", unit: `${captureMarkerDetailText(altUnit)}`, ranges: altRanges} satisfies MarkerDetailChromeView);
    }
  }
  const quickMarkerPinned = markerDetailDeps.isDashboardQuickMarkerPinned(id);
  const quickMarkerPinText = quickMarkerPinned ? 'Pinned' : 'Pin';
  const quickMarkerPinTitle = quickMarkerPinned ? 'Remove from Quick Markers' : 'Pin to Quick Markers';
  const header = ({
  kind: "header", placement: projectMarkerPlacementSummary(id, marker, data.categories),
  name: `${captureMarkerDetailText(marker.name)}`, rename: renameLink, unit: `${captureMarkerDetailText(marker.unit)}`,
  alternate: altUnitInfo, pinClass: `${quickMarkerPinned ? ' is-pinned' : ''}`,
  pinPressed: `${quickMarkerPinned ? 'true' : 'false'}`, pinTitle: `${captureMarkerDetailText(quickMarkerPinTitle)}`,
  pinActions: projectMarkerDetailAction('quick-pin', { id }), pinText: `${captureMarkerDetailText(quickMarkerPinText)}`,
  statusClass: `${captureMarkerDetailText(latestStatus)}`, status: `${captureMarkerDetailText(statusText)}`,
  closeActions: projectMarkerDetailAction('close-modal'), latestStatus: `${captureMarkerDetailText(latestStatus)}`,
  latest: `${captureMarkerDetailText(latestDisplay)}`,
  latestUnit: latestUnit ? ({kind: "latest-unit", unit: `${captureMarkerDetailText(latestUnit)}`} satisfies MarkerDetailChromeView) : null,
  latestDate: `${captureMarkerDetailText(latestDateLabel)}`,
  latestDelta: `${deltaFromPrev != null ? ` · ${deltaFromPrev >= 0 ? '+' : ''}${deltaFromPrev.toFixed(1)}% vs prev` : ''}`,
  range: `${captureMarkerDetailText(rangeMainDisplay)}`, rangeLabel: `${captureMarkerDetailText(rangeMainLabel)}`,
  secondary: rangeSecondaryDisplay
          ? ({kind: "secondary-range", label: `${captureMarkerDetailText(rangeSecondaryLabel)}`, range: `${captureMarkerDetailText(rangeSecondaryDisplay)}`} satisfies MarkerDetailChromeView)
          : (hasLatestPhaseRange || latestContextRange) ? ({kind: "latest-range"} satisfies MarkerDetailChromeView) : null,
  rangeControls: (rangeCardControls.length || rangeSuggestionLink) ? ({kind: "range-controls", controls: rangeCardControls, suggestion: rangeSuggestionLink} satisfies MarkerDetailChromeView) : null,
  rangeBand: rangeBandHtml
} satisfies MarkerDetailChromeView);
  const historyRows: HistoryRow[] = [];
  for (const point of visibleHistoryPoints) {
    const { v, i } = point;
    const ri = (getEffectiveRangeForDate as (marker:unknown,index:number)=>MarkerModalRange)(marker, i);
    const hasPointRange = ri.min != null || ri.max != null;
    const s = hasPointRange ? getStatus(v, ri.min, ri.max) : 'unrated';
    const sl = s==="normal"?"\u2713 In Range":s==="high"?"\u25B2 Above Range":s==="low"?"\u25BC Below Range":s === 'unrated' ? 'No range' : "Unknown";
    const phaseLabel = marker.phaseLabels && marker.phaseLabels[i];
    const phaseInfo = phaseLabel ? ({ kind: "phase", phase: `${phaseLabel}`, minimum: `${formatValue(ri.min)}`, maximum: `${formatValue(ri.max)}` } satisfies MarkerDetailHistoryView) : null;
    const rawDate = marker.singlePoint ? null : data.dates[i];
    const actionDate = rawDate == null ? 'null' : rawDate;
    const matchingNote = rawDate && state.importedData.notes ? state.importedData.notes.find(n => n.date === rawDate) : null;
    const noteIcon = matchingNote ? ({ kind: "date-note", actions: projectMarkerDetailAction('toggle-history-note'), text: `${captureMarkerDetailText(matchingNote.text)}` } satisfies MarkerDetailHistoryView) : null;
    const mvKey = dotKey + ':' + (rawDate as string);
    const srcEntry = rawDate ? state.importedData.entries?.find(e => e.date === rawDate) : null;
    const src = srcEntry?.markerSources?.[dotKey];
    const { collection: collectionContextHtml, sources: sourceHtml } = buildMarkerHistoryMetadata(srcEntry, src, rawDate);
    const manualVal = rawDate ? getManualValueForMarker(dotKey, rawDate) : undefined;
    const isManualSource = !!(src && src.file == null && !src.snapshotId);
    const isManual = isManualSource || (manualVal !== undefined && manualVal !== null);
    const canRevert = manualVal !== undefined && manualVal !== null && manualVal !== true;
    const manualBadge = canRevert
      ? ({ kind: "manual-revert", actions: projectMarkerDetailAction('revert-marker-value', { id, date: actionDate }) } satisfies MarkerDetailHistoryView)
      : isManual ? ({ kind: "manual-badge" } satisfies MarkerDetailHistoryView) : null;
    const deleteBtn = ({ kind: "delete-value", actions: projectMarkerDetailAction('delete-marker-value', { id, date: actionDate }) } satisfies MarkerDetailHistoryView);
    const editAction = rawDate ? projectMarkerDetailAction('edit-marker-value', { id, date: actionDate, value: v }) : null;
    // Per-value note (markerValueNotes keyed `dotKey:date`).
    const valueNote = rawDate ? state.importedData.markerValueNotes?.[mvKey] : null;
    const valueNoteHtml = rawDate
      ? (valueNote
          ? ({ kind: "value-note", editActions: projectMarkerDetailAction('edit-value-note', { id, date: actionDate }),
            text: `${captureMarkerDetailText(valueNote)}`, deleteActions: projectMarkerDetailAction('delete-value-note', { id, date: actionDate }),
          } satisfies MarkerDetailHistoryView)
          : ({ kind: "add-note", actions: projectMarkerDetailAction('edit-value-note', { id, date: actionDate }) } satisfies MarkerDetailHistoryView))
      : null;
    const altVal = (hasConv && state.showAltUnits)
      ? getAlternateUnitForProfile(dotKey, v, state.unitSystem)
      : null;
    const altLine = altVal ? ({ kind: "alternate-value", value: `${formatValue(altVal.value)}`, unit: `${captureMarkerDetailText(altVal.unit)}` } satisfies MarkerDetailHistoryView) : null;
    historyRows.push({ kind: "row", status: `${s}`, deleteButton: deleteBtn, date: `${dates[i]}`, dateNote: noteIcon, source: sourceHtml,
      valueStatus: `${s}`, editAttributes: editAction, value: `${formatValue(v)}`, manualBadge: manualBadge, badgeStatus: `${s}`,
      statusLabel: `${sl}`, alternate: altLine, phase: phaseInfo, collection: collectionContextHtml,
      valueNote: valueNoteHtml,
    } satisfies MarkerDetailHistoryView);
  }
  let paging: HistoryPaging|null = null;
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
    paging = ({ kind: "more",
      actions: projectMarkerDetailAction('show-detail-modal', { id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true }),
      label: `${historyButtonLabel}`,
    } satisfies MarkerDetailHistoryView);
  } else if (showAllHistory && modalPoints.length > MARKER_HISTORY_DEFAULT_CAP) {
    paging = ({ kind: "last-values", actions: projectMarkerDetailAction('show-detail-modal', { id, scrollToHistory: true }),
      count: `${MARKER_HISTORY_DEFAULT_CAP}`,
    } satisfies MarkerDetailHistoryView);
  }
  let trend: HistoryTrend|null = null;
  const nonNull = modalPoints;
  if (nonNull.length >= 2) {
    const f = nonNull[0]!, l = nonNull[nonNull.length-1]!;
    const ch = l.v - f.v, pct = ((ch/f.v)*100).toFixed(1);
    const dir = ch > 0 ? "increased" : ch < 0 ? "decreased" : "unchanged";
    trend = ({ kind: "trend", direction: `${dir}`, change: `${Math.abs(ch).toFixed(2)}`, unit: `${captureMarkerDetailText(marker.unit)}`, sign: `${ch>0?"+":""}`,
      percentage: `${pct}`, firstDate: `${dates[f.i]}`, lastDate: `${dates[l.i]}`,
    } satisfies MarkerDetailHistoryView);
  }
  let bio: BioAgeResult|null = null;
  const calcInputs: Record<string, import('./marker-detail-content.js').BioAgeInput[]> = {
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
    const issues: string[] = [];
    const activeMarker = (cat: string, key: string) => (resolveActiveMarkerPath as (categories:unknown,cat:string,key:string)=>{marker: import('../types/marker-detail-modal-impl.js').MarkerModalMarker}|null)(data.categories, cat, key)?.marker;
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
      const _hasCRPonDate = (idx: number) => {
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
      const refIdx = (bioAgeReferenceIndex as (data:MarkerModalData,marker:unknown,point:MarkerModalPoint|null)=>number)(data, marker, latestPoint);
      const refDate = refIdx >= 0 ? data.dates?.[refIdx] : null;
      const refDateLabel = refIdx >= 0 ? (data.dateLabels?.[refIdx] || refDate || '') : '';
      const pheno = refIdx >= 0 ? activeMarker('calculatedRatios', 'phenoAge')?.values?.[refIdx] : null;
      const bortz = refIdx >= 0 ? activeMarker('calculatedRatios', 'bortzAge')?.values?.[refIdx] : null;
      const age = state.profileDob && refDate
        ? ((new Date((refDate as string) + 'T00:00:00').getTime() - new Date(state.profileDob + 'T00:00:00').getTime()) / (365.25*24*60*60*1000))
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
      const phenoStatus = (bioAgeInputStatusAtIndex as (data:unknown,index:number,inputs:Parameters<typeof bioAgeInputStatusAtIndex>[2],profile:BioInputStatus|null)=>BioInputStatus[])(data, refIdx, BIO_AGE_PHENO_INPUTS, profileRequirement);
      const bortzStatus = (bioAgeInputStatusAtIndex as (data:unknown,index:number,inputs:Parameters<typeof bioAgeInputStatusAtIndex>[2],profile:BioInputStatus|null)=>BioInputStatus[])(data, refIdx, BIO_AGE_BORTZ_INPUTS, profileRequirement);
      const renderInputGrid = (status: BioInputStatus[]) => status.map(s => {
        const title = s.kind === 'profile'
          ? (s.present ? 'Set in profile' : 'Required in profile')
          : (s.present ? 'In this panel' : 'Missing from this panel');
        return ({
  kind: "input", state: `${s.present ? 'is-present' : 'is-missing'}`, title: `${captureMarkerDetailText(title)}`,
  glyph: `${s.present ? '✓' : '⚠'}`, label: `${captureMarkerDetailText(s.label)}`
} satisfies MarkerDetailBioAgeView);
      }).filter(()=>true);
      const componentRow = (name: unknown, value: number | null | undefined, status: BioInputStatus[]) => {
        const missing = status.filter(s => !s.present);
        let componentHeader;
        if (value != null) {
          const delta = usableAge != null ? ({kind: "delta", sign: `${value - usableAge > 0 ? '+' : ''}`, years: `${(value - usableAge).toFixed(1)}`} satisfies MarkerDetailBioAgeView) : null;
          componentHeader = ({kind: "present-heading", name: `${captureMarkerDetailText(name)}`, value: `${formatValue(value)}`, delta: delta} satisfies MarkerDetailBioAgeView);
        } else {
          const noun = missing.length === 1 ? 'input' : 'inputs';
          componentHeader = ({kind: "missing-heading", name: `${captureMarkerDetailText(name)}`, missing: `${missing.length}`, total: `${status.length}`, noun: `${noun}`} satisfies MarkerDetailBioAgeView);
        }
        const klass = value != null ? 'bio-age-component-ok' : 'bio-age-component-missing';
        return ({kind: "component", state: `${klass}`, heading: componentHeader, inputs: renderInputGrid(status)} satisfies MarkerDetailBioAgeView);
      };
      const dateNote = refDateLabel
        ? ({kind: "panel-date", date: `${captureMarkerDetailText(refDateLabel)}`} satisfies MarkerDetailBioAgeView)
        : null;
      const breakdownIssues = profileIssue ? [...issues, profileIssue] : issues;
      const issueNote = breakdownIssues.length > 0
        ? ({kind: "warning", issues: `${breakdownIssues.map(captureMarkerDetailText).join('. ')}`} satisfies MarkerDetailBioAgeView)
        : null;
      bio = ({
  kind: "breakdown", date: dateNote, warning: issueNote,
  pheno: componentRow('PhenoAge', pheno, phenoStatus), bortz: componentRow('Bortz Age', bortz, bortzStatus)
} satisfies MarkerDetailBioAgeView);
    } else if (issues.length > 0) {
      bio = ({kind: "missing", issues: `${issues.join('. ')}`} satisfies MarkerDetailBioAgeView);
    }
  }
  // Collect inline SNPs for the unified rec section (genetics + actionable tips together)
  const _inlineSNPs = state.importedData.genetics?.snps ? getRelevantSNPsRuntime(dotKey) : [];
  const shouldRenderRecommendations = isProductRecsEnabledRuntime() && hasRecommendationSectionRendererRuntime();
  const primaryActions = ({kind: "primary-actions", manualActions: projectMarkerDetailAction('open-manual-entry', { id }), askActions: projectMarkerDetailAction('ask-ai', { id })} satisfies MarkerDetailChromeView);
  // Marker note
  const markerNote = state.importedData.markerNotes?.[dotKey] || '';
  const noteEditor = ({
    kind: "editor", editActions: projectMarkerDetailAction('toggle-marker-note-editor', { dotKey }),
    editLabel: `${markerNote ? 'Edit' : '+ Add note'}`,
    note: markerNote ? ({kind: "text", text: `${captureMarkerDetailText(markerNote)}`} satisfies MarkerDetailNotesView) : null,
    text: `${captureMarkerDetailText(markerNote)}`, saveActions: projectMarkerDetailAction('save-marker-note', { dotKey, id }),
    cancelActions: projectMarkerDetailAction('toggle-marker-note-editor', { dotKey }),
    delete: markerNote ? ({kind: "delete", actions: projectMarkerDetailAction('delete-marker-note', { dotKey, id })} satisfies MarkerDetailNotesView) : null
  } satisfies MarkerDetailNotesView);
  let recommendationMount: Extract<MarkerDetailChromeView,{kind:'recommendations'}>|null = null;
  // Recommendation placeholder — shown for any marker with a catalog slot
  if (shouldRenderRecommendations) {
    recommendationMount = ({kind: "recommendations", id: `${id}`} satisfies MarkerDetailChromeView);
  }
  const actions = ({kind: 'actions', primary: primaryActions, notes: noteEditor, recommendations: recommendationMount} satisfies MarkerDetailChromeView);
  let deleteMarker: Extract<MarkerDetailChromeView,{kind:'delete-marker'}>|null = null;
  // Show delete link for custom markers only
  if (state.importedData?.customMarkers?.[dotKey]) {
    deleteMarker = ({kind: "delete-marker", actions: projectMarkerDetailAction('delete-custom-marker', { id })} satisfies MarkerDetailChromeView);
  }
  modal.innerHTML = renderMarkerDetailModal({header,rows:historyRows,paging,trend,bio,actions,deleteMarker});
  openModalOverlay(overlay, { returnFocus: opts.returnFocus });
  if (opts.scrollToHistory) {
    setTimeout(() => {
      const historyEl = modal.querySelector('.marker-history-list');
      if (historyEl) historyEl.scrollIntoView({ block: 'start' });
    }, 0);
  }
  // Async-fill recommendation section (unified: genetics + actionable tips)
  if (shouldRenderRecommendations) {
    const _markerStatus = latestStatus === 'unrated' ? 'missing' : latestStatus;
    renderRecommendationSectionRuntime(dotKey, { label: 'Ideas to explore', maxProducts: 3, inlineSNPs: _inlineSNPs, markerStatus: _markerStatus })
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
      (createLineChart as (id:string,marker:unknown,labels:unknown,dates:unknown,phaseLabels:unknown,context:unknown)=>ReturnType<typeof createLineChart>)("modal", marker, data.dateLabels, data.dates, data.phaseLabels, {
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
      descEl.textContent = desc as string;
      descEl.classList.add('loaded');
    } else if (!marker.desc && hasAssistantFeatureProvider()) {
      descEl.classList.add('loading');
      fetchCustomMarkerDescription(descriptionKey, marker.name, marker.unit).then(text => {
        const el = document.getElementById('marker-desc');
        if (text && el) {
          el.textContent = (text as string);
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
