import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Finite inverses for reviewed later typed-view/style passes. Every input byte,
// exact replacement and restored intermediate hash is required; original oracles
// retain their separate immutable hashes in the consuming tests.
const records = [
  {
    "file": "js/marker-detail-editing.ts",
    "currentSHA256": "2684c2d004979d68fd1e9a914f4d51878f869f87d587d82d2ce5bada526530e5",
    "previousSHA256": "7df2b9a8b543ba33d019b8f2c6229bd59ae8cba389e27994c560047c3b5363ce",
    "edits": [
      {
        "start": 0,
        "before": "import {tsStaticStyles} from './ts-static-ui-inline-style-map.generated.js';\nimport {captureMarkerDetailText,projectMarkerDetailAction} from './marker-detail-projection.js';\n",
        "after": ""
      },
      {
        "start": 374,
        "before": "import { showNotification, showConfirmDialog, showPromptDialog } from './utils.js';\n",
        "after": "import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, showPromptDialog } from './utils.js';\n"
      },
      {
        "start": 540,
        "before": "",
        "after": "import { markerDetailActionAttrs } from './marker-detail-actions.js';\n"
      },
      {
        "start": 10312,
        "before": "  input.style.cssText = tsStaticStyles.editorInput;\n",
        "after": "  input.style.cssText = 'width:100%;max-width:140px;text-align:center;font-size:inherit;box-sizing:border-box;padding:2px 4px';\n"
      },
      {
        "start": 13800,
        "before": "  form.innerHTML = renderMarkerDetailEditor({ kind: \"reference\", label: `${captureMarkerDetailText(label)}`, minimum: `${captureMarkerDetailText(curMin ?? '')}`,\n    clearMinimum: projectMarkerDetailAction('clear-ref-edit-field', { field: 'min' }), maximum: `${captureMarkerDetailText(curMax ?? '')}`,\n    clearMaximum: projectMarkerDetailAction('clear-ref-edit-field', { field: 'max' }),\n    saveActions: projectMarkerDetailAction('save-ref-range', { id, type }),\n",
        "after": "  form.innerHTML = renderMarkerDetailEditor({ kind: \"reference\", label: `${escapeHTML(label)}`, minimum: `${escapeAttr(curMin ?? '')}`,\n    clearMinimum: `${markerDetailActionAttrs('clear-ref-edit-field', { field: 'min' })}`, maximum: `${escapeAttr(curMax ?? '')}`,\n    clearMaximum: `${markerDetailActionAttrs('clear-ref-edit-field', { field: 'max' })}`,\n    saveActions: `${markerDetailActionAttrs('save-ref-range', { id, type })}`,\n"
      }
    ]
  },
  {
    "file": "js/marker-detail-history.ts",
    "currentSHA256": "4e9a5230400fbd6aec3e5ab996d40ed611be9a2fe949b2710d1cd33e00f55201",
    "previousSHA256": "ace93fde6b6d72dfd8e797666acf82765965d9373ed709e40be42f1bc305f86d",
    "edits": [
      {
        "start": 0,
        "before": "import type {HistoryCollection,HistorySource,MarkerDetailHistoryView} from './marker-detail-view.js';\n",
        "after": "import { renderMarkerDetailHistory } from './marker-detail-results-presentation.js';\n"
      },
      {
        "start": 251,
        "before": "import {captureMarkerDetailText} from './marker-detail-projection.js';\n",
        "after": "import { escapeHTML } from './utils.js';\n"
      },
      {
        "start": 323,
        "before": "export function buildMarkerHistoryMetadata(entry: Pick<LabEntry, 'context' | 'sourceFile'> | null | undefined, source: MarkerProvenance | null | undefined, rawDate: unknown): { collection: HistoryCollection|null; sources: readonly HistorySource[] } {\n",
        "after": "export function buildMarkerHistoryMetadata(entry: Pick<LabEntry, 'context' | 'sourceFile'> | null | undefined, source: MarkerProvenance | null | undefined, rawDate: unknown): { collectionContextHtml: string; sourceHtml: string } {\n"
      },
      {
        "start": 1879,
        "before": "  const collection = collectionContextParts.length\n    ? ({ kind: \"collection-context\", text: `${captureMarkerDetailText(collectionContextParts.join(' · '))}` } satisfies MarkerDetailHistoryView)\n    : null;\n",
        "after": "  const collectionContextHtml = collectionContextParts.length\n    ? renderMarkerDetailHistory({ kind: \"collection-context\", text: `${escapeHTML(collectionContextParts.join(' · '))}` })\n    : '';\n"
      },
      {
        "start": 2088,
        "before": "  const sources: HistorySource[] = [];\n",
        "after": "  let sourceHtml = '';\n"
      },
      {
        "start": 2322,
        "before": "      sources.push({ kind: \"source-file\", title: `${captureMarkerDetailText(fileName)}`, text: `${captureMarkerDetailText(display)}` } satisfies MarkerDetailHistoryView);\n      if (source?.manuallyEdited) sources.push({ kind: \"source-edited\" } satisfies MarkerDetailHistoryView);\n",
        "after": "      sourceHtml = renderMarkerDetailHistory({ kind: \"source-file\", title: `${escapeHTML(fileName)}`, text: `${escapeHTML(display)}` });\n      if (source?.manuallyEdited) sourceHtml += renderMarkerDetailHistory({ kind: \"source-edited\" });\n"
      },
      {
        "start": 2639,
        "before": "      sources.push({ kind: \"source-report\", manualLabel: `${source.manuallyEdited ? ' · manually edited' : ''}` } satisfies MarkerDetailHistoryView);\n",
        "after": "      sourceHtml = renderMarkerDetailHistory({ kind: \"source-report\", manualLabel: `${source.manuallyEdited ? ' · manually edited' : ''}` });\n"
      },
      {
        "start": 2814,
        "before": "      sources.push({ kind: \"source-manual\" } satisfies MarkerDetailHistoryView);\n",
        "after": "      sourceHtml = renderMarkerDetailHistory({ kind: \"source-manual\" });\n"
      },
      {
        "start": 2905,
        "before": "  return { collection, sources };\n",
        "after": "  return { collectionContextHtml, sourceHtml };\n"
      }
    ]
  },
  {
    "file": "js/marker-detail-modal-impl.ts",
    "currentSHA256": "2172a9c5204fc83f9ef8be946e897b16e8bd2ea18745ebbc0d235536cb579006",
    "previousSHA256": "498d039c3e52a9d8f1f07786305eaf878ed54f87b8e07b55c749b27028cb4efe",
    "edits": [
      {
        "start": 0,
        "before": "import {renderMarkerDetailModal} from './marker-detail-modal-presentation.js';\nimport {captureMarkerDetailText,projectMarkerDetailAction} from './marker-detail-projection.js';\nimport type {MarkerDetailRangeView,MarkerDetailHistoryView,MarkerDetailChromeView,MarkerDetailBioAgeView,MarkerDetailNotesView,RangeEditControl,AlternateRange,ChromeAlternateUnit,HistoryRow,HistoryPaging,HistoryTrend,BioAgeResult} from './marker-detail-view.js';\n",
        "after": "import { renderMarkerDetailRange, renderMarkerDetailHistory } from './marker-detail-results-presentation.js';\n"
      },
      {
        "start": 742,
        "before": "import { bindDetailModalSyncRefresh, getStatus, formatValue, safeMarkerId } from './utils.js';\n",
        "after": "import { bindDetailModalSyncRefresh, escapeHTML, escapeAttr, getStatus, formatValue, safeMarkerId } from './utils.js';\n"
      },
      {
        "start": 1293,
        "before": "import { installMarkerDetailActionDelegates } from './marker-detail-actions.js';\n",
        "after": "import { installMarkerDetailActionDelegates, markerDetailActionAttrs } from './marker-detail-actions.js';\n"
      },
      {
        "start": 2218,
        "before": "import { configureMarkerDetailPlacement, openMarkerPlacementModal, projectMarkerPlacementSummary, restoreMarkerPlacement, saveMarkerPlacement } from './marker-detail-placement.js';\n",
        "after": "import { configureMarkerDetailPlacement, openMarkerPlacementModal, renderMarkerPlacementSummary, restoreMarkerPlacement, saveMarkerPlacement } from './marker-detail-placement.js';\n"
      },
      {
        "start": 14473,
        "before": "    if (effMin == null || effMax == null || latestValue == null || Number(effMax) === Number(effMin)) return null;\n",
        "after": "    if (effMin == null || effMax == null || latestValue == null || Number(effMax) === Number(effMin)) return '';\n"
      },
      {
        "start": 14664,
        "before": "    if (baseMin == null || baseMax == null || Number(baseMax) === Number(baseMin)) return null;\n",
        "after": "    if (baseMin == null || baseMax == null || Number(baseMax) === Number(baseMin)) return '';\n"
      },
      {
        "start": 15718,
        "before": "    if (max === min) return null;\n",
        "after": "    if (max === min) return '';\n"
      },
      {
        "start": 15896,
        "before": "    if (span <= 0) return null;\n",
        "after": "    if (span <= 0) return '';\n"
      },
      {
        "start": 16542,
        "before": "    return ({ kind: \"band\", lowZone: lowZoneWidth ? ({ kind: \"low-zone\", width: `${lowZoneWidth}` } satisfies MarkerDetailRangeView) : null,\n      highZone: highZoneWidth ? ({ kind: \"high-zone\", left: `${optRight}`, width: `${highZoneWidth}` } satisfies MarkerDetailRangeView) : null,\n      optimalZone: optWidth ? ({ kind: \"optimal-zone\", left: `${optLeft}`, width: `${optWidth}` } satisfies MarkerDetailRangeView) : null,\n      status: `${captureMarkerDetailText(latestStatus)}`, position: `${dot}`, minimum: `${captureMarkerDetailText(formatValue(min))}`,\n      maximum: `${captureMarkerDetailText(formatValue(max))}`,\n    } satisfies MarkerDetailRangeView);\n",
        "after": "    return renderMarkerDetailRange({ kind: \"band\", lowZone: `${lowZoneWidth ? renderMarkerDetailRange({ kind: \"low-zone\", width: `${lowZoneWidth}` }) : ''}`,\n      highZone: `${highZoneWidth ? renderMarkerDetailRange({ kind: \"high-zone\", left: `${optRight}`, width: `${highZoneWidth}` }) : ''}`,\n      optimalZone: `${optWidth ? renderMarkerDetailRange({ kind: \"optimal-zone\", left: `${optLeft}`, width: `${optWidth}` }) : ''}`,\n      status: `${escapeAttr(latestStatus)}`, position: `${dot}`, minimum: `${escapeHTML(formatValue(min))}`,\n      maximum: `${escapeHTML(formatValue(max))}`,\n    });\n"
      },
      {
        "start": 17339,
        "before": "  let rangeInfo: RangeEditControl[] = [];\n",
        "after": "  let rangeInfo = '';\n"
      },
      {
        "start": 18159,
        "before": "    const editedBadge = isEdited ? ({ kind: \"edited-badge\", label: `${badgeTitle}`, title: `${badgeTitle}`,\n      actions: projectMarkerDetailAction('revert-ref-range', { id, type }), text: `${badgeLabel}`,\n    } satisfies MarkerDetailRangeView) : null;\n",
        "after": "    const editedBadge = isEdited ? renderMarkerDetailRange({ kind: \"edited-badge\", label: `${badgeTitle}`, title: `${badgeTitle}`,\n      actions: `${markerDetailActionAttrs('revert-ref-range', { id, type })}`, text: `${badgeLabel}`,\n    }) : '';\n"
      },
      {
        "start": 18498,
        "before": "    return ({ kind: \"edit-control\", optimalClass: `${type === 'optimal' ? ' ref-editable-optimal' : ''}`, label: `${label}`,\n      currentRange: `${captureMarkerDetailText(currentRange)}`, actions: projectMarkerDetailAction('edit-ref-range', { id, type }),\n      lowerLabel: `${label.toLowerCase()}`, badge: editedBadge,\n    } satisfies MarkerDetailRangeView);\n",
        "after": "    return renderMarkerDetailRange({ kind: \"edit-control\", optimalClass: `${type === 'optimal' ? ' ref-editable-optimal' : ''}`, label: `${label}`,\n      currentRange: `${escapeAttr(currentRange)}`, actions: `${markerDetailActionAttrs('edit-ref-range', { id, type })}`,\n      lowerLabel: `${label.toLowerCase()}`, badge: `${editedBadge}`,\n    });\n"
      },
      {
        "start": 19208,
        "before": "    if (hasRef) rangeInfo.push(refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref'));\n    else if (isCustom) rangeInfo.push(refEditable('Reference', '–', '–', 'ref'));\n    if (hasOpt) rangeInfo.push(refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal'));\n    else if (isCustom) rangeInfo.push(refEditable('Optimal', '–', '–', 'optimal'));\n",
        "after": "    if (hasRef) rangeInfo += refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref');\n    else if (isCustom) rangeInfo += refEditable('Reference', '–', '–', 'ref');\n    if (hasOpt) rangeInfo += refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal');\n    else if (isCustom) rangeInfo += refEditable('Optimal', '–', '–', 'optimal');\n"
      },
      {
        "start": 19638,
        "before": "    if (hasOpt) rangeInfo = [refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal')];\n    else if (isCustom) rangeInfo = [refEditable('Optimal', '–', '–', 'optimal')];\n",
        "after": "    if (hasOpt) rangeInfo = refEditable('Optimal', optimalRange.min, optimalRange.max, 'optimal');\n    else if (isCustom) rangeInfo = refEditable('Optimal', '–', '–', 'optimal');\n"
      },
      {
        "start": 19844,
        "before": "    rangeInfo = [refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref')];\n",
        "after": "    rangeInfo = refEditable(referenceControlLabel, referenceRange.min, referenceRange.max, 'ref');\n"
      },
      {
        "start": 19970,
        "before": "    rangeInfo = [refEditable('Reference', '–', '–', 'ref')];\n",
        "after": "    rangeInfo = refEditable('Reference', '–', '–', 'ref');\n"
      },
      {
        "start": 20035,
        "before": "  const rangeCardControls = rangeInfo.map((control,index)=>({...control,leadingSeparator:index!==0}));\n",
        "after": "  const rangeCardControls = rangeInfo ? rangeInfo.replace(/^ &middot; /, '') : '';\n"
      },
      {
        "start": 20463,
        "before": "    ? ({ kind: \"suggestion\", href: `${captureMarkerDetailText(rangeSuggestionUrl)}` } satisfies MarkerDetailRangeView)\n    : null;\n",
        "after": "    ? renderMarkerDetailRange({ kind: \"suggestion\", href: `${escapeAttr(rangeSuggestionUrl)}` })\n    : '';\n"
      },
      {
        "start": 20691,
        "before": "    ? ({kind: \"renamed\", revertActions: projectMarkerDetailAction('revert-marker-name', { id }), renameActions: projectMarkerDetailAction('rename-marker', { id })} satisfies MarkerDetailChromeView)\n    : ({kind: \"rename\", actions: projectMarkerDetailAction('rename-marker', { id })} satisfies MarkerDetailChromeView);\n",
        "after": "    ? ` <span class=\"ref-edited-badge\" role=\"button\" tabindex=\"0\" aria-label=\"Revert renamed marker to original\" title=\"Renamed — click to revert to original\" ${markerDetailActionAttrs('revert-marker-name', { id })} style=\"cursor:pointer\">renamed ×</span> <span class=\"ref-edited-badge\" role=\"button\" tabindex=\"0\" aria-label=\"Rename marker\" title=\"Rename marker\" ${markerDetailActionAttrs('rename-marker', { id })} style=\"cursor:pointer;font-size:12px\">rename</span>`\n    : ` <span class=\"ref-edited-badge\" role=\"button\" tabindex=\"0\" aria-label=\"Rename marker\" title=\"Rename marker\" ${markerDetailActionAttrs('rename-marker', { id })} style=\"cursor:pointer;font-size:12px\">rename</span>`;\n"
      },
      {
        "start": 21405,
        "before": "  let altUnitInfo: ChromeAlternateUnit|null = null;\n",
        "after": "  let altUnitInfo = '';\n"
      },
      {
        "start": 22169,
        "before": "      let altRanges: AlternateRange[] = [];\n",
        "after": "      let altRanges = '';\n"
      },
      {
        "start": 22253,
        "before": "        if (hasRef) altRanges.push({label:'Reference',range:altRange(marker.refMin, marker.refMax),optimal:false});\n        if (hasOpt) altRanges.push({label:'Optimal',range:altRange(optimalRange.min, optimalRange.max),optimal:true});\n",
        "after": "        if (hasRef) altRanges += ` &middot; Reference: ${altRange(marker.refMin, marker.refMax)}`;\n        if (hasOpt) altRanges += ` &middot; <span style=\"color:var(--green)\">Optimal: ${altRange(optimalRange.min, optimalRange.max)}</span>`;\n"
      },
      {
        "start": 22548,
        "before": "        altRanges = [{label:'Optimal',range:altRange(optimalRange.min, optimalRange.max),optimal:false}];\n",
        "after": "        altRanges = ` &middot; Optimal: ${altRange(optimalRange.min, optimalRange.max)}`;\n"
      },
      {
        "start": 22681,
        "before": "        altRanges = [{label:'Reference',range:altRange(marker.refMin, marker.refMax),optimal:false}];\n",
        "after": "        altRanges = ` &middot; Reference: ${altRange(marker.refMin, marker.refMax)}`;\n"
      },
      {
        "start": 22791,
        "before": "      altUnitInfo = ({kind: \"alternate-unit\", unit: `${captureMarkerDetailText(altUnit)}`, ranges: altRanges} satisfies MarkerDetailChromeView);\n",
        "after": "      altUnitInfo = `<div class=\"modal-unit modal-unit-alt\" title=\"Same marker, alternate unit system\">≈ ${escapeHTML(altUnit)}${altRanges}</div>`;\n"
      },
      {
        "start": 23196,
        "before": "  const header = ({\n  kind: \"header\", placement: projectMarkerPlacementSummary(id, marker, data.categories),\n  name: `${captureMarkerDetailText(marker.name)}`, rename: renameLink, unit: `${captureMarkerDetailText(marker.unit)}`,\n  alternate: altUnitInfo, pinClass: `${quickMarkerPinned ? ' is-pinned' : ''}`,\n  pinPressed: `${quickMarkerPinned ? 'true' : 'false'}`, pinTitle: `${captureMarkerDetailText(quickMarkerPinTitle)}`,\n  pinActions: projectMarkerDetailAction('quick-pin', { id }), pinText: `${captureMarkerDetailText(quickMarkerPinText)}`,\n  statusClass: `${captureMarkerDetailText(latestStatus)}`, status: `${captureMarkerDetailText(statusText)}`,\n  closeActions: projectMarkerDetailAction('close-modal'), latestStatus: `${captureMarkerDetailText(latestStatus)}`,\n  latest: `${captureMarkerDetailText(latestDisplay)}`,\n  latestUnit: latestUnit ? ({kind: \"latest-unit\", unit: `${captureMarkerDetailText(latestUnit)}`} satisfies MarkerDetailChromeView) : null,\n  latestDate: `${captureMarkerDetailText(latestDateLabel)}`,\n  latestDelta: `${deltaFromPrev != null ? ` · ${deltaFromPrev >= 0 ? '+' : ''}${deltaFromPrev.toFixed(1)}% vs prev` : ''}`,\n  range: `${captureMarkerDetailText(rangeMainDisplay)}`, rangeLabel: `${captureMarkerDetailText(rangeMainLabel)}`,\n  secondary: rangeSecondaryDisplay\n          ? ({kind: \"secondary-range\", label: `${captureMarkerDetailText(rangeSecondaryLabel)}`, range: `${captureMarkerDetailText(rangeSecondaryDisplay)}`} satisfies MarkerDetailChromeView)\n          : (hasLatestPhaseRange || latestContextRange) ? ({kind: \"latest-range\"} satisfies MarkerDetailChromeView) : null,\n  rangeControls: (rangeCardControls.length || rangeSuggestionLink) ? ({kind: \"range-controls\", controls: rangeCardControls, suggestion: rangeSuggestionLink} satisfies MarkerDetailChromeView) : null,\n  rangeBand: rangeBandHtml\n} satisfies MarkerDetailChromeView);\n  const historyRows: HistoryRow[] = [];\n",
        "after": "  let html = `<div class=\"gb-detail-head\">\n      <div>\n        ${renderMarkerPlacementSummary(id, marker, data.categories)}\n        <h3>${escapeHTML(marker.name)}${renameLink}</h3>\n        <div class=\"modal-unit\">${escapeHTML(marker.unit)}</div>\n        ${altUnitInfo}\n      </div>\n      <div class=\"gb-detail-head-actions\">\n        <button type=\"button\" class=\"gb-detail-pin-btn${quickMarkerPinned ? ' is-pinned' : ''}\" aria-pressed=\"${quickMarkerPinned ? 'true' : 'false'}\" title=\"${escapeAttr(quickMarkerPinTitle)}\" ${markerDetailActionAttrs('quick-pin', { id })}>${escapeHTML(quickMarkerPinText)}</button>\n        <span class=\"gb-detail-status gb-detail-status-${escapeAttr(latestStatus)}\">${escapeHTML(statusText)}</span>\n      </div>\n      <button type=\"button\" class=\"modal-close\" aria-label=\"Close\" ${markerDetailActionAttrs('close-modal')}>&times;</button>\n    </div>\n    <div class=\"marker-description\" id=\"marker-desc\"></div>\n    <div class=\"gb-detail-summary\">\n      <div class=\"stat-card\">\n        <div class=\"stat-card-label\">Latest</div>\n        <div class=\"stat-card-value val-${escapeAttr(latestStatus)}\">${escapeHTML(latestDisplay)}${latestUnit ? ` <span>${escapeHTML(latestUnit)}</span>` : ''}</div>\n        <div class=\"stat-card-meta\">${escapeHTML(latestDateLabel)}${deltaFromPrev != null ? ` · ${deltaFromPrev >= 0 ? '+' : ''}${deltaFromPrev.toFixed(1)}% vs prev` : ''}</div>\n      </div>\n      <div class=\"stat-card\">\n        <div class=\"stat-card-label\">Ranges</div>\n        <div class=\"stat-card-value stat-card-value-range\">${escapeHTML(rangeMainDisplay)} <span>${escapeHTML(rangeMainLabel)}</span></div>\n        ${rangeSecondaryDisplay\n          ? `<div class=\"stat-card-meta\">${escapeHTML(rangeSecondaryLabel)} ${escapeHTML(rangeSecondaryDisplay)}</div>`\n          : (hasLatestPhaseRange || latestContextRange) ? `<div class=\"stat-card-meta\">Used for the latest status</div>` : ''}\n        ${(rangeCardControls || rangeSuggestionLink) ? `<div class=\"stat-card-range-controls\">${rangeCardControls}${rangeSuggestionLink}</div>` : ''}\n      </div>\n    </div>\n    ${rangeBandHtml}\n    <div class=\"gb-detail-section-label\">Trend</div>\n    <div class=\"modal-chart\"><canvas id=\"chart-modal\"></canvas></div>\n    <div class=\"gb-detail-section-label\">History <span>All time</span></div>\n    <div class=\"modal-values-grid marker-history-list\">`;\n"
      },
      {
        "start": 25647,
        "before": "    const phaseInfo = phaseLabel ? ({ kind: \"phase\", phase: `${phaseLabel}`, minimum: `${formatValue(ri.min)}`, maximum: `${formatValue(ri.max)}` } satisfies MarkerDetailHistoryView) : null;\n",
        "after": "    const phaseInfo = phaseLabel ? renderMarkerDetailHistory({ kind: \"phase\", phase: `${phaseLabel}`, minimum: `${formatValue(ri.min)}`, maximum: `${formatValue(ri.max)}` }) : '';\n"
      },
      {
        "start": 26086,
        "before": "    const noteIcon = matchingNote ? ({ kind: \"date-note\", actions: projectMarkerDetailAction('toggle-history-note'), text: `${captureMarkerDetailText(matchingNote.text)}` } satisfies MarkerDetailHistoryView) : null;\n",
        "after": "    const noteIcon = matchingNote ? renderMarkerDetailHistory({ kind: \"date-note\", actions: `${markerDetailActionAttrs('toggle-history-note')}`, text: `${escapeHTML(matchingNote.text)}` }) : '';\n"
      },
      {
        "start": 26504,
        "before": "    const { collection: collectionContextHtml, sources: sourceHtml } = buildMarkerHistoryMetadata(srcEntry, src, rawDate);\n",
        "after": "    const { collectionContextHtml, sourceHtml } = buildMarkerHistoryMetadata(srcEntry, src, rawDate);\n"
      },
      {
        "start": 27001,
        "before": "      ? ({ kind: \"manual-revert\", actions: projectMarkerDetailAction('revert-marker-value', { id, date: actionDate }) } satisfies MarkerDetailHistoryView)\n      : isManual ? ({ kind: \"manual-badge\" } satisfies MarkerDetailHistoryView) : null;\n    const deleteBtn = ({ kind: \"delete-value\", actions: projectMarkerDetailAction('delete-marker-value', { id, date: actionDate }) } satisfies MarkerDetailHistoryView);\n    const editAction = rawDate ? projectMarkerDetailAction('edit-marker-value', { id, date: actionDate, value: v }) : null;\n",
        "after": "      ? renderMarkerDetailHistory({ kind: \"manual-revert\", actions: `${markerDetailActionAttrs('revert-marker-value', { id, date: actionDate })}` })\n      : isManual ? renderMarkerDetailHistory({ kind: \"manual-badge\" }) : '';\n    const deleteBtn = renderMarkerDetailHistory({ kind: \"delete-value\", actions: `${markerDetailActionAttrs('delete-marker-value', { id, date: actionDate })}` });\n    const editAction = rawDate ? ` ${markerDetailActionAttrs('edit-marker-value', { id, date: actionDate, value: v })} role=\"button\" tabindex=\"0\" title=\"Click to edit\" style=\"cursor:pointer\"` : '';\n"
      },
      {
        "start": 27737,
        "before": "          ? ({ kind: \"value-note\", editActions: projectMarkerDetailAction('edit-value-note', { id, date: actionDate }),\n            text: `${captureMarkerDetailText(valueNote)}`, deleteActions: projectMarkerDetailAction('delete-value-note', { id, date: actionDate }),\n          } satisfies MarkerDetailHistoryView)\n          : ({ kind: \"add-note\", actions: projectMarkerDetailAction('edit-value-note', { id, date: actionDate }) } satisfies MarkerDetailHistoryView))\n      : null;\n",
        "after": "          ? renderMarkerDetailHistory({ kind: \"value-note\", editActions: `${markerDetailActionAttrs('edit-value-note', { id, date: actionDate })}`,\n            text: `${escapeHTML(valueNote)}`, deleteActions: `${markerDetailActionAttrs('delete-value-note', { id, date: actionDate })}`,\n          })\n          : renderMarkerDetailHistory({ kind: \"add-note\", actions: `${markerDetailActionAttrs('edit-value-note', { id, date: actionDate })}` }))\n      : '';\n"
      },
      {
        "start": 28346,
        "before": "    const altLine = altVal ? ({ kind: \"alternate-value\", value: `${formatValue(altVal.value)}`, unit: `${captureMarkerDetailText(altVal.unit)}` } satisfies MarkerDetailHistoryView) : null;\n    historyRows.push({ kind: \"row\", status: `${s}`, deleteButton: deleteBtn, date: `${dates[i]}`, dateNote: noteIcon, source: sourceHtml,\n      valueStatus: `${s}`, editAttributes: editAction, value: `${formatValue(v)}`, manualBadge: manualBadge, badgeStatus: `${s}`,\n      statusLabel: `${sl}`, alternate: altLine, phase: phaseInfo, collection: collectionContextHtml,\n      valueNote: valueNoteHtml,\n    } satisfies MarkerDetailHistoryView);\n",
        "after": "    const altLine = altVal ? renderMarkerDetailHistory({ kind: \"alternate-value\", value: `${formatValue(altVal.value)}`, unit: `${escapeHTML(altVal.unit)}` }) : '';\n    html += renderMarkerDetailHistory({ kind: \"row\", status: `${s}`, deleteButton: `${deleteBtn}`, date: `${dates[i]}`, dateNote: `${noteIcon}`, source: `${sourceHtml}`,\n      valueStatus: `${s}`, editAttributes: `${editAction}`, value: `${formatValue(v)}`, manualBadge: `${manualBadge}`, badgeStatus: `${s}`,\n      statusLabel: `${sl}`, alternate: `${altLine}`, phase: `${phaseInfo}`, collection: `${collectionContextHtml}`,\n      valueNote: `${valueNoteHtml}`,\n    });\n"
      },
      {
        "start": 28982,
        "before": "  let paging: HistoryPaging|null = null;\n",
        "after": "  html += `</div>`;\n"
      },
      {
        "start": 29575,
        "before": "    paging = ({ kind: \"more\",\n      actions: projectMarkerDetailAction('show-detail-modal', { id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true }),\n",
        "after": "    html += renderMarkerDetailHistory({ kind: \"more\",\n      actions: `${markerDetailActionAttrs('show-detail-modal', { id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true })}`,\n"
      },
      {
        "start": 29791,
        "before": "    } satisfies MarkerDetailHistoryView);\n",
        "after": "    });\n"
      },
      {
        "start": 29915,
        "before": "    paging = ({ kind: \"last-values\", actions: projectMarkerDetailAction('show-detail-modal', { id, scrollToHistory: true }),\n",
        "after": "    html += renderMarkerDetailHistory({ kind: \"last-values\", actions: `${markerDetailActionAttrs('show-detail-modal', { id, scrollToHistory: true })}`,\n"
      },
      {
        "start": 30086,
        "before": "    } satisfies MarkerDetailHistoryView);\n",
        "after": "    });\n"
      },
      {
        "start": 30132,
        "before": "  let trend: HistoryTrend|null = null;\n",
        "after": ""
      },
      {
        "start": 30424,
        "before": "    trend = ({ kind: \"trend\", direction: `${dir}`, change: `${Math.abs(ch).toFixed(2)}`, unit: `${captureMarkerDetailText(marker.unit)}`, sign: `${ch>0?\"+\":\"\"}`,\n",
        "after": "    html += renderMarkerDetailHistory({ kind: \"trend\", direction: `${dir}`, change: `${Math.abs(ch).toFixed(2)}`, unit: `${escapeHTML(marker.unit)}`, sign: `${ch>0?\"+\":\"\"}`,\n"
      },
      {
        "start": 30669,
        "before": "    } satisfies MarkerDetailHistoryView);\n",
        "after": "    });\n"
      },
      {
        "start": 30715,
        "before": "  let bio: BioAgeResult|null = null;\n",
        "after": ""
      },
      {
        "start": 38642,
        "before": "        return ({\n  kind: \"input\", state: `${s.present ? 'is-present' : 'is-missing'}`, title: `${captureMarkerDetailText(title)}`,\n  glyph: `${s.present ? '✓' : '⚠'}`, label: `${captureMarkerDetailText(s.label)}`\n} satisfies MarkerDetailBioAgeView);\n      }).filter(()=>true);\n",
        "after": "        return `<span class=\"bio-age-input ${s.present ? 'is-present' : 'is-missing'}\" title=\"${escapeAttr(title)}\">${s.present ? '✓' : '⚠'} ${escapeHTML(s.label)}</span>`;\n      }).join('');\n"
      },
      {
        "start": 39084,
        "before": "        let componentHeader;\n",
        "after": "        let header;\n"
      },
      {
        "start": 39142,
        "before": "          const delta = usableAge != null ? ({kind: \"delta\", sign: `${value - usableAge > 0 ? '+' : ''}`, years: `${(value - usableAge).toFixed(1)}`} satisfies MarkerDetailBioAgeView) : null;\n          componentHeader = ({kind: \"present-heading\", name: `${captureMarkerDetailText(name)}`, value: `${formatValue(value)}`, delta: delta} satisfies MarkerDetailBioAgeView);\n",
        "after": "          const delta = usableAge != null ? ` <span class=\"bio-age-delta\">(${value - usableAge > 0 ? '+' : ''}${(value - usableAge).toFixed(1)}y)</span>` : '';\n          header = `<span class=\"bio-age-glyph\">✓</span> <strong>${escapeHTML(name)}:</strong> ${formatValue(value)}${delta}`;\n"
      },
      {
        "start": 39595,
        "before": "          componentHeader = ({kind: \"missing-heading\", name: `${captureMarkerDetailText(name)}`, missing: `${missing.length}`, total: `${status.length}`, noun: `${noun}`} satisfies MarkerDetailBioAgeView);\n",
        "after": "          header = `<span class=\"bio-age-glyph\">⚠</span> <strong>${escapeHTML(name)}:</strong> missing ${missing.length} of ${status.length} ${noun}`;\n"
      },
      {
        "start": 39903,
        "before": "        return ({kind: \"component\", state: `${klass}`, heading: componentHeader, inputs: renderInputGrid(status)} satisfies MarkerDetailBioAgeView);\n",
        "after": "        return `<div class=\"bio-age-component ${klass}\">\n          <div class=\"bio-age-component-header\">${header}</div>\n          <div class=\"bio-age-input-grid\">${renderInputGrid(status)}</div>\n        </div>`;\n"
      },
      {
        "start": 40097,
        "before": "        ? ({kind: \"panel-date\", date: `${captureMarkerDetailText(refDateLabel)}`} satisfies MarkerDetailBioAgeView)\n        : null;\n",
        "after": "        ? `<div class=\"bio-age-breakdown-sub\">Based on your panel from ${escapeHTML(refDateLabel)}</div>`\n        : '';\n"
      },
      {
        "start": 40361,
        "before": "        ? ({kind: \"warning\", issues: `${breakdownIssues.map(captureMarkerDetailText).join('. ')}`} satisfies MarkerDetailBioAgeView)\n        : null;\n      bio = ({\n  kind: \"breakdown\", date: dateNote, warning: issueNote,\n  pheno: componentRow('PhenoAge', pheno, phenoStatus), bortz: componentRow('Bortz Age', bortz, bortzStatus)\n} satisfies MarkerDetailBioAgeView);\n",
        "after": "        ? `<div class=\"bio-age-breakdown-warning\">${breakdownIssues.map(escapeHTML).join('. ')}</div>`\n        : '';\n      html += `<div class=\"bio-age-breakdown\">\n        <div class=\"bio-age-breakdown-head\">Component breakdown</div>\n        ${dateNote}\n        ${issueNote}\n        ${componentRow('PhenoAge', pheno, phenoStatus)}\n        ${componentRow('Bortz Age', bortz, bortzStatus)}\n      </div>`;\n"
      },
      {
        "start": 40763,
        "before": "      bio = ({kind: \"missing\", issues: `${issues.join('. ')}`} satisfies MarkerDetailBioAgeView);\n",
        "after": "      html += `<div class=\"calc-missing-inputs\">Not calculated — ${issues.join('. ')}</div>`;\n"
      },
      {
        "start": 41171,
        "before": "  const primaryActions = ({kind: \"primary-actions\", manualActions: projectMarkerDetailAction('open-manual-entry', { id }), askActions: projectMarkerDetailAction('ask-ai', { id })} satisfies MarkerDetailChromeView);\n",
        "after": "  html += `<div class=\"gb-detail-actions\">\n    <div class=\"gb-detail-action-row\">\n      <button class=\"manual-entry-btn\" ${markerDetailActionAttrs('open-manual-entry', { id })}>+ Add Value Manually</button>\n      <button class=\"ask-ai-btn\" ${markerDetailActionAttrs('ask-ai', { id })}>Ask AI</button>\n    </div>`;\n"
      },
      {
        "start": 41472,
        "before": "  const noteEditor = ({\n    kind: \"editor\", editActions: projectMarkerDetailAction('toggle-marker-note-editor', { dotKey }),\n    editLabel: `${markerNote ? 'Edit' : '+ Add note'}`,\n    note: markerNote ? ({kind: \"text\", text: `${captureMarkerDetailText(markerNote)}`} satisfies MarkerDetailNotesView) : null,\n    text: `${captureMarkerDetailText(markerNote)}`, saveActions: projectMarkerDetailAction('save-marker-note', { dotKey, id }),\n    cancelActions: projectMarkerDetailAction('toggle-marker-note-editor', { dotKey }),\n    delete: markerNote ? ({kind: \"delete\", actions: projectMarkerDetailAction('delete-marker-note', { dotKey, id })} satisfies MarkerDetailNotesView) : null\n  } satisfies MarkerDetailNotesView);\n  let recommendationMount: Extract<MarkerDetailChromeView,{kind:'recommendations'}>|null = null;\n",
        "after": "  html += `<div class=\"marker-note-section\">\n    <div class=\"marker-note-header\"><span class=\"marker-note-label\">Note</span><button class=\"marker-note-edit-btn\" ${markerDetailActionAttrs('toggle-marker-note-editor', { dotKey })}>${markerNote ? 'Edit' : '+ Add note'}</button></div>\n    ${markerNote ? `<div class=\"marker-note-text\">${escapeHTML(markerNote)}</div>` : ''}\n    <div class=\"marker-note-editor\" id=\"marker-note-editor\" style=\"display:none\">\n      <textarea id=\"marker-note-input\" placeholder=\"Your notes about this marker (e.g. why it's high, what to watch for, what you've learned...)\" rows=\"3\">${escapeHTML(markerNote)}</textarea>\n      <div class=\"marker-note-actions\">\n        <button class=\"import-btn import-btn-primary\" ${markerDetailActionAttrs('save-marker-note', { dotKey, id })}>Save</button>\n        <button class=\"import-btn import-btn-secondary\" ${markerDetailActionAttrs('toggle-marker-note-editor', { dotKey })}>Cancel</button>\n        ${markerNote ? `<button class=\"import-btn import-btn-secondary\" style=\"color:var(--red)\" ${markerDetailActionAttrs('delete-marker-note', { dotKey, id })}>Delete</button>` : ''}\n\t      </div>\n\t    </div>\n\t  </div>`;\n"
      },
      {
        "start": 42400,
        "before": "    recommendationMount = ({kind: \"recommendations\", id: `${id}`} satisfies MarkerDetailChromeView);\n",
        "after": "    html += `<div id=\"rec-modal-${id}\"></div>`;\n"
      },
      {
        "start": 42505,
        "before": "  const actions = ({kind: 'actions', primary: primaryActions, notes: noteEditor, recommendations: recommendationMount} satisfies MarkerDetailChromeView);\n  let deleteMarker: Extract<MarkerDetailChromeView,{kind:'delete-marker'}>|null = null;\n",
        "after": "  html += `</div>`;\n"
      },
      {
        "start": 42846,
        "before": "    deleteMarker = ({kind: \"delete-marker\", actions: projectMarkerDetailAction('delete-custom-marker', { id })} satisfies MarkerDetailChromeView);\n",
        "after": "    html += `<div style=\"text-align:center;margin-top:8px\"><a href=\"#\" style=\"color:var(--text-muted);font-size:0.8rem\" ${markerDetailActionAttrs('delete-custom-marker', { id })}>Delete this marker</a></div>`;\n"
      },
      {
        "start": 42997,
        "before": "  modal.innerHTML = renderMarkerDetailModal({header,rows:historyRows,paging,trend,bio,actions,deleteMarker});\n",
        "after": "  modal.innerHTML = html;\n"
      }
    ]
  },
  {
    "file": "js/components/ChatShell.svelte",
    "currentSHA256": "72cfa7b23ac94d2444be302e9c28bef4a02ddabf8fe471df4c212debfbff3b76",
    "previousSHA256": "eacd3b9f8bedb5e3efdd5ebc387fcfe488b2acb2d615cb63384b2b2def6963ce",
    "edits": [
      {
        "start": 1262,
        "before": "  function registerLayout(root: HTMLElement) { return ownChatLayout(root, next => {\n    const rail = root.querySelector('#chat-thread-rail');\n    const returnFocus = layout.open && layout.railOpen && !next.railOpen && next.open && rail?.contains(document.activeElement);\n    flushSync(() => { layout = next; });\n    if (returnFocus) root.querySelector<HTMLButtonElement>('.chat-rail-toggle')?.focus();\n  }); }\n",
        "after": "  function registerLayout(root: HTMLElement) { return ownChatLayout(root, next => flushSync(() => { layout = next; })); }\n"
      },
      {
        "start": 2638,
        "before": "    <div class=\"chat-thread-rail\" id=\"chat-thread-rail\" inert={!layout.open || !layout.railOpen} style:--chat-rail-width={layout.desktop ? `${layout.railWidth}px` : null}>\n",
        "after": "    <div class=\"chat-thread-rail\" id=\"chat-thread-rail\" style:--chat-rail-width={layout.desktop ? `${layout.railWidth}px` : null}>\n"
      }
    ]
  },
  {
    "file": "js/components/RoutstrSettings.svelte",
    "currentSHA256": "35174617647e52383ae293a41a392db6ebd914438e400907282550a2ad1eb008",
    "previousSHA256": "48dc38ae3459ef7ef888f766bd7cf3bb4a36c75de0264addae1e57de960874de",
    "edits": [
      {
        "start": 433,
        "before": "  import { WALLET_CARD, WALLET_COPY, WALLET_TOKEN_INPUT, WALLET_NOTICE, WALLET_RAIL, WALLET_PRIMARY, WALLET_SECONDARY, WALLET_REFRESH, PROVIDER_PANEL, PROVIDER_COPY, PROVIDER_NOTICE, PROVIDER_ACTIONS, PROVIDER_PRIMARY, PROVIDER_SECONDARY, PROVIDER_INPUT, PROVIDER_TONES } from '../provider-settings-classes.js';\n",
        "after": "  import { PROVIDER_PANEL, PROVIDER_COPY, PROVIDER_NOTICE, PROVIDER_ACTIONS, PROVIDER_PRIMARY, PROVIDER_SECONDARY, PROVIDER_INPUT, PROVIDER_TONES } from '../provider-settings-classes.js';\n"
      },
      {
        "start": 3453,
        "before": "  <p class={WALLET_COPY + ' gb:cloud-provider:m-0'}>Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.</p>\n  <section aria-label=\"Cashu wallet\" class={WALLET_CARD}>\n    <h3 class=\"gb:cloud-provider:text-[10px] gb:cloud-provider:font-normal gb:cloud-provider:[font-family:inherit] gb:cloud-provider:uppercase gb:cloud-provider:tracking-[0.5px] gb:cloud-provider:opacity-70 gb:cloud-provider:mb-1.5 gb:cloud-provider:mt-0\">⚡ Wallet</h3>\n    <p class=\"gb:cloud-provider:text-[10px] gb:cloud-provider:text-secondary gb:cloud-provider:leading-[1.5] gb:cloud-provider:-mt-0.5 gb:cloud-provider:mb-[3px]\">The funded Routstr node session syncs with your 24-word Data Sync mnemonic. Cashu proofs and their separate 12-word recovery seed stay on this device.</p>\n",
        "after": "  <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.</p>\n  <section aria-label=\"Cashu wallet\" class={PROVIDER_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0'}>\n    <h3 class=\"gb:cloud-provider:text-xs gb:cloud-provider:uppercase gb:cloud-provider:tracking-wide gb:cloud-provider:m-0\">⚡ Wallet</h3>\n    <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>The funded Routstr node session syncs with your 24-word Data Sync mnemonic. Cashu proofs and their separate 12-word recovery seed stay on this device.</p>\n"
      },
      {
        "start": 4323,
        "before": "    <div class={WALLET_RAIL + ' gb:cloud-provider:justify-between'}>\n      <div class={WALLET_RAIL}><ProviderStatus id=\"routstr-wallet-balance\" status={{ text: shellState.walletBalance, tone: 'primary' }} emphasis /><button type=\"button\" class={WALLET_REFRESH} title=\"Verify proofs against mint\" aria-label=\"Verify wallet proofs against mint\" data-provider-panel-action=\"refresh-cashu-wallet-balance\" onclick={event => { event.stopPropagation(); actions.refreshWallet(); }}>↻</button></div>\n",
        "after": "    <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:justify-between'}>\n      <div class={PROVIDER_ACTIONS}><ProviderStatus id=\"routstr-wallet-balance\" status={{ text: shellState.walletBalance, tone: 'primary' }} emphasis /><button type=\"button\" class={PROVIDER_SECONDARY} title=\"Verify proofs against mint\" aria-label=\"Verify wallet proofs against mint\" data-provider-panel-action=\"refresh-cashu-wallet-balance\" onclick={event => { event.stopPropagation(); actions.refreshWallet(); }}>↻</button></div>\n"
      },
      {
        "start": 5067,
        "before": "    <div class={WALLET_RAIL + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:mt-1.5 gb:cloud-provider:pt-1.5'}>\n      <div class={WALLET_COPY + ' gb:cloud-provider:min-w-0 gb:cloud-provider:break-all'}>Mint: <ProviderStatus id=\"routstr-mint-label\" status={{ text: shellState.mint, tone: 'secondary' }} monospace announce={false} /></div>\n      <button type=\"button\" class={WALLET_SECONDARY} data-provider-panel-action=\"show-routstr-mint-edit\" onclick={event => { event.stopPropagation(); actions.mints(); }}>Mints & balances</button>\n",
        "after": "    <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:pt-3'}>\n      <div class={PROVIDER_COPY + ' gb:cloud-provider:min-w-0 gb:cloud-provider:break-all'}>Mint: <ProviderStatus id=\"routstr-mint-label\" status={{ text: shellState.mint, tone: 'secondary' }} monospace announce={false} /></div>\n      <button type=\"button\" class={PROVIDER_SECONDARY} data-provider-panel-action=\"show-routstr-mint-edit\" onclick={event => { event.stopPropagation(); actions.mints(); }}>Mints & balances</button>\n"
      },
      {
        "start": 5959,
        "before": "        <section class={WALLET_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2'} aria-label={'Pending ' + kind + ' recovery'} aria-busy={shellState.recoveries[kind].pending}>\n          <h4 class=\"gb:cloud-provider:text-[11px] gb:cloud-provider:[font-family:inherit] gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink\">⚠ Pending {kind} recovery</h4>\n          <p class={WALLET_COPY + ' gb:cloud-provider:m-0'}>{kind === 'deposit' ? 'A previous node deposit has an unconfirmed outcome. This token may be unspent. Reconcile the node account before reclaiming it:' : 'An outgoing transfer needs reconciliation. Check its payment status or contact its recipient before reclaiming this token:'}</p>\n          <textarea class={WALLET_TOKEN_INPUT} aria-label={'Pending ' + kind + ' recovery token'} readonly rows=\"3\" value={tokens[kind]} bind:this={fields[kind]} onfocus={event => event.currentTarget.select()}></textarea>\n          <div class={WALLET_RAIL}><button type=\"button\" class={WALLET_PRIMARY} disabled={shellState.recoveries[kind].pending} onclick={event => { event.stopPropagation(); actions.reclaimRecovery(kind); }}>Recover to Wallet</button><button type=\"button\" class={WALLET_SECONDARY} onclick={event => { event.stopPropagation(); actions.copyRecovery(kind); }}>{shellState.recoveries[kind].copied ? '✓ Copied (clears in 60s)' : 'Copy Token'}</button></div>\n          <div class={WALLET_COPY + ' ' + PROVIDER_TONES[shellState.recoveries[kind].status.tone]} role=\"status\" aria-live=\"polite\">{shellState.recoveries[kind].status.text}</div>\n",
        "after": "        <section class={PROVIDER_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-2'} aria-label={'Pending ' + kind + ' recovery'} aria-busy={shellState.recoveries[kind].pending}>\n          <h4 class=\"gb:cloud-provider:text-sm gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink\">⚠ Pending {kind} recovery</h4>\n          <p class={PROVIDER_COPY + ' gb:cloud-provider:m-0'}>{kind === 'deposit' ? 'A previous node deposit has an unconfirmed outcome. This token may be unspent. Reconcile the node account before reclaiming it:' : 'An outgoing transfer needs reconciliation. Check its payment status or contact its recipient before reclaiming this token:'}</p>\n          <textarea class={PROVIDER_INPUT + ' gb:cloud-provider:font-mono gb:cloud-provider:text-xs gb:cloud-provider:resize-y'} aria-label={'Pending ' + kind + ' recovery token'} readonly rows=\"3\" value={tokens[kind]} bind:this={fields[kind]} onfocus={event => event.currentTarget.select()}></textarea>\n          <div class={PROVIDER_ACTIONS}><button type=\"button\" class={PROVIDER_PRIMARY} disabled={shellState.recoveries[kind].pending} onclick={event => { event.stopPropagation(); actions.reclaimRecovery(kind); }}>Recover to Wallet</button><button type=\"button\" class={PROVIDER_SECONDARY} onclick={event => { event.stopPropagation(); actions.copyRecovery(kind); }}>{shellState.recoveries[kind].copied ? '✓ Copied (clears in 60s)' : 'Copy Token'}</button></div>\n          <div class={PROVIDER_COPY + ' ' + PROVIDER_TONES[shellState.recoveries[kind].status.tone]} role=\"status\" aria-live=\"polite\">{shellState.recoveries[kind].status.text}</div>\n"
      },
      {
        "start": 7604,
        "before": "  <section aria-label=\"Routstr node\" class={WALLET_CARD}>\n    <h3 class=\"gb:cloud-provider:text-[10px] gb:cloud-provider:font-normal gb:cloud-provider:[font-family:inherit] gb:cloud-provider:uppercase gb:cloud-provider:tracking-[0.5px] gb:cloud-provider:opacity-70 gb:cloud-provider:mb-1.5 gb:cloud-provider:mt-0\">🔗 Node</h3>\n    <div class={WALLET_RAIL + ' gb:cloud-provider:justify-between'}>\n",
        "after": "  <section aria-label=\"Routstr node\" class={PROVIDER_NOTICE + ' gb:cloud-provider:flex gb:cloud-provider:flex-col gb:cloud-provider:gap-3 gb:cloud-provider:min-w-0'}>\n    <h3 class=\"gb:cloud-provider:text-xs gb:cloud-provider:uppercase gb:cloud-provider:tracking-wide gb:cloud-provider:m-0\">🔗 Node</h3>\n    <div class={PROVIDER_ACTIONS + ' gb:cloud-provider:justify-between'}>\n"
      },
      {
        "start": 8431,
        "before": "    {#if shellState.connected}<div class={WALLET_RAIL + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:mt-1.5 gb:cloud-provider:pt-1.5'}>Session: <ProviderStatus id=\"routstr-node-balance\" status={shellState.nodeBalance} /><button type=\"button\" class={WALLET_REFRESH} aria-label=\"Refresh node balance\" data-provider-panel-action=\"refresh-routstr-balance\" onclick={event => { event.stopPropagation(); actions.refreshNode(); }}>↻</button></div>{/if}\n    {#if shellState.refundNode}<div class={WALLET_NOTICE + ' gb:cloud-provider:break-all'}>Saved refund for this node: {shellState.refundNode}<div class={WALLET_RAIL + ' gb:cloud-provider:mt-2'}><button type=\"button\" class={WALLET_SECONDARY} data-routstr-wallet-action=\"saved-node-refunds\" data-node-url={shellState.refundNode} onclick={event => { event.stopPropagation(); actions.refunds(shellState.refundNode); }}>Check refund recovery</button></div></div>{/if}\n",
        "after": "    {#if shellState.connected}<div class={PROVIDER_ACTIONS + ' gb:cloud-provider:border-t gb:cloud-provider:border-line gb:cloud-provider:pt-3'}>Session: <ProviderStatus id=\"routstr-node-balance\" status={shellState.nodeBalance} /><button type=\"button\" class={PROVIDER_SECONDARY} aria-label=\"Refresh node balance\" data-provider-panel-action=\"refresh-routstr-balance\" onclick={event => { event.stopPropagation(); actions.refreshNode(); }}>↻</button></div>{/if}\n    {#if shellState.refundNode}<div class={PROVIDER_NOTICE + ' gb:cloud-provider:break-all'}>Saved refund for this node: {shellState.refundNode}<div class={PROVIDER_ACTIONS + ' gb:cloud-provider:mt-2'}><button type=\"button\" class={PROVIDER_SECONDARY} data-routstr-wallet-action=\"saved-node-refunds\" data-node-url={shellState.refundNode} onclick={event => { event.stopPropagation(); actions.refunds(shellState.refundNode); }}>Check refund recovery</button></div></div>{/if}\n"
      },
      {
        "start": 9543,
        "before": "        <summary class=\"gb:cloud-provider:cursor-pointer gb:cloud-provider:[@media(pointer:coarse)]:min-h-11 gb:cloud-provider:flex gb:cloud-provider:items-center gb:cloud-provider:text-ink gb:cloud-provider:font-semibold\">Connect a session key or Cashu token</summary>\n",
        "after": "        <summary class=\"gb:cloud-provider:cursor-pointer gb:cloud-provider:min-h-11 gb:cloud-provider:flex gb:cloud-provider:items-center gb:cloud-provider:text-ink gb:cloud-provider:font-semibold\">Connect a session key or Cashu token</summary>\n"
      },
      {
        "start": 9999,
        "before": "            <h4 class=\"gb:cloud-provider:text-[11px] gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink\">⚠ Save your session key</h4>\n",
        "after": "            <h4 class=\"gb:cloud-provider:text-sm gb:cloud-provider:m-0 gb:cloud-provider:text-warning-ink\">⚠ Save your session key</h4>\n"
      }
    ]
  }
] as const;
const sha = (source: string) => createHash('sha256').update(source).digest('hex');
export function restoreReviewedMigrationSource(file: string, source: string): string {
  if (file === 'js/marker-detail-modal-impl.ts') {
    // Invert only the separately reviewed external modal-initiator repair.
    assert.equal(sha(source), 'e1bd8757dcd7b136972c62d6d76b2330e8936fb2624346dfe9c372be4f5efb4b', 'Complete reviewed modal initiator source');
    const focusEdits = [
      {current: "  const overlay = document.getElementById(\"modal-overlay\");\n  // A visible history/mode rerender retains the original outside initiator.\n  if (!overlay?.classList.contains('show')) {\n    if (opts.returnFocus) rememberModalTrigger(opts.returnFocus);\n    else rememberModalTrigger();\n  }\n  const modal = setDetailModalShell('marker-detail-modal');", previous: "  rememberModalTrigger();\n  const modal = setDetailModalShell('marker-detail-modal');\n  const overlay = document.getElementById(\"modal-overlay\");"},
      {current: "  openModalOverlay(overlay, { returnFocus: opts.returnFocus });", previous: "  openModalOverlay(overlay);"},
    ] as const;
    for (const edit of focusEdits) {
      assert.equal(source.split(edit.current).length - 1, 1, 'Exactly one reviewed modal initiator replacement');
      source = source.replace(edit.current, edit.previous);
    }
    assert.equal(sha(source), '49185d588cc3a86742835194986d5ab47c760d8f88648d754c2b0cb291e6b880', 'Exact source before modal initiator repair');
    // Separately qualify the real public-reference-save registration repair.
    const fixed = '    editRefRange,\n    saveRefRange,\n    revertRefRange,';
    assert.equal(source.split(fixed).length - 1, 1, 'Exactly one owned reference-save registration');
    source = source.replace(fixed, '    editRefRange,\n    revertRefRange,');
  }
  const record = records.find(row => row.file === file);
  if (!record) return source;
  assert.equal(sha(source), record.currentSHA256, 'All current source bytes qualified: ' + file);
  for (const edit of [...record.edits].reverse()) {
    assert.equal(source.slice(edit.start, edit.start + edit.before.length), edit.before, 'Exact reviewed source replacement');
    source = source.slice(0, edit.start) + edit.after + source.slice(edit.start + edit.before.length);
  }
  assert.equal(sha(source), record.previousSHA256, 'Exact earlier independently hashed source: ' + file);
  return source;
}
