// @ts-check
// dashboard-lab-widget-renderers.js - dashboard Labs/marker widget renderers

import { state } from './state.js';
import { dashboardWidgetActionAttrs } from './dashboard-widget-controls.js';
import { openDashboardMarkerDetail } from './dashboard-widget-runtime.js';
import { profileStorageKey } from './profile.js';
import { escapeAttr, escapeHTML, formatValue, getStatus, getTrend, safeMarkerId, showNotification } from './utils.js';
import { filterDatesByRange, getActiveData, renderDateRangeFilter } from './data.js';
import { detectTrendAlerts, getAllFlaggedMarkers, getEffectiveRange, getEffectiveRangeForDate, getKeyTrendMarkers, getLatestValueIndex } from './marker-analysis.js';
import { getBiologyProfileContext } from './profile-context.js';
import { getMarkerStorageViewId, resolveActiveMarkerPath, resolveMarkerStorageViewId } from './marker-placement.js';

function dashboardNavigateAttrs(route) {
  return dashboardWidgetActionAttrs('navigate', { route });
}
function dashboardMarkerDetailAttrs(id) {
  return dashboardWidgetActionAttrs('open-marker-detail', { id });
}
export function createDashboardLabWidgetRenderers(deps) {
  const {
    markerHasData,
    rerenderDashboardFromWidgetChange,
  } = deps;

  function buildDashboardWidgetContext(data) {
    const filteredData = filterDatesByRange(data);
    const keyMarkers = getKeyTrendMarkers(filteredData);
    const trendAlerts = detectTrendAlerts(filteredData);
    const trendMarkerIds = new Set(trendAlerts.map(a => a.id));
    const allFlags = getAllFlaggedMarkers(filteredData);
    const criticalFlags = allFlags.filter(f => {
      if (trendMarkerIds.has(f.id)) return false;
      const refRange = f.refMax - f.refMin;
      if (refRange <= 0 || f.refMin == null || f.refMax == null) return false;
      const distance = f.status === 'high' ? (f.rawValue - f.refMax) : (f.refMin - f.rawValue);
      return distance > refRange * 0.5;
    });
    return { data, filteredData, keyMarkers, trendAlerts, criticalFlags };
  }

  function getDashboardMarkerByPath(data, catKey, markerKey) {
    const resolved = resolveActiveMarkerPath(data.categories, catKey, markerKey);
    if (!resolved || !markerHasData(resolved.marker)) return null;
    const { categoryKey, category, marker } = resolved;
    const id = `${categoryKey}_${markerKey}`;
    if (!safeMarkerId(id)) return null;
    const latestIdx = getLatestValueIndex(marker.values || []);
    if (latestIdx < 0) return null;
    const range = getEffectiveRangeForDate(marker, latestIdx);
    const value = marker.values[latestIdx];
    const status = getStatus(value, range.min, range.max);
    const trend = getTrend(marker.values || [], range.min, range.max);
    state.markerRegistry[id] = marker;
    return { id, storageId: getMarkerStorageViewId(marker, id) || id, category, marker, latestIdx, range, value, status, trend };
  }
  function getDashboardMarkerById(data, id) {
    if (!safeMarkerId(id)) return null;
    const idx = id.indexOf('_');
    if (idx <= 0) return null;
    return getDashboardMarkerByPath(data, id.slice(0, idx), id.slice(idx + 1));
  }
  function getDashboardAge() {
    if (!state.profileDob) return null;
    const dob = new Date(state.profileDob);
    if (Number.isNaN(dob.getTime())) return null;
    return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  function getDashboardBioAgeMarker(ctx) {
    const paths = [
      ['calculatedRatios', 'biologicalAge'],
      ['specialty', 'glycanAge'],
      ['calculatedRatios', 'phenoAge'],
      ['calculatedRatios', 'bortzAge'],
      ['ratios', 'bioAge'],
      ['ratios', 'phenoAge'],
      ['ratios', 'bortzAge'],
    ];
    for (const [cat, key] of paths) {
      const hit = getDashboardMarkerByPath(ctx.data, cat, key);
      if (hit) return hit;
    }
    return null;
  }

  function renderDashboardBioAgeWidget(ctx) {
    const hit = getDashboardBioAgeMarker(ctx);
    const age = getDashboardAge();
    const value = Number(hit?.value);
    const profileContext = getBiologyProfileContext();
    const hasBioAge = Number.isFinite(value);
    const display = hasBioAge ? value.toFixed(1) : '—';
    const delta = hasBioAge && age != null ? value - age : null;
    const deltaText = delta == null
      ? (profileContext.lowMuscleMass ? 'Creatinine-based biological age disabled by low-muscle context' : 'Biological-age comparison unavailable')
      : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} yr vs chronological`;
    const pheno = getDashboardMarkerByPath(ctx.data, 'calculatedRatios', 'phenoAge')
      || getDashboardMarkerByPath(ctx.data, 'ratios', 'phenoAge');
    const bortz = getDashboardMarkerByPath(ctx.data, 'calculatedRatios', 'bortzAge')
      || getDashboardMarkerByPath(ctx.data, 'ratios', 'bortzAge');
    const pct = Number.isFinite(value) ? Math.max(4, Math.min(100, (value / 70) * 100)) : 35;
    const tag = hit ? 'button' : 'div';
    const open = hit ? ` type="button" ${dashboardMarkerDetailAttrs(hit.id)} aria-label="${escapeAttr((hit.marker?.name || 'Biological Age') + ': ' + display)}"` : '';
    return `<${tag} class="db-hero-bio"${open}>
      <div class="db-hero-bio-left">
        <div class="db-hero-bio-num">${escapeHTML(display)}</div>
        <div class="db-hero-bio-label">
          <span class="top">${escapeHTML(hit?.marker?.name || 'Biological Age')}</span>
          <span class="actual">Chronological: ${age != null ? `${age} yr` : 'not set'}</span>
          <span class="delta">${escapeHTML(deltaText)}</span>
        </div>
      </div>
      <div class="db-hero-bio-right">
        <div class="db-hero-row"><span>PhenoAge</span><strong>${pheno ? formatValue(pheno.value) : '—'}</strong></div>
        <div class="db-hero-row"><span>Bortz Age</span><strong>${bortz ? formatValue(bortz.value) : '—'}</strong></div>
        <div class="db-hero-bio-bar"><div style="width:${pct.toFixed(0)}%"></div></div>
        <div class="db-hero-scale"><span>0</span><span>35</span><span>70 yr</span></div>
      </div>
    </${tag}>`;
  }

  function renderDashboardMiniSparkline(values, status, width = 120, height = 30) {
    const points = (values || []).filter(v => v !== null && Number.isFinite(Number(v))).slice(-10).map(Number);
    if (points.length < 2) return `<span class="db-spark db-spark-empty" aria-hidden="true"></span>`;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const coords = points.map((value, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 5);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="db-spark db-spark-${escapeAttr(status)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${escapeAttr(coords)}"></polyline>
      <circle cx="${escapeAttr(coords.split(' ').at(-1)?.split(',')[0] || String(width))}" cy="${escapeAttr(coords.split(' ').at(-1)?.split(',')[1] || '0')}" r="2.5"></circle>
    </svg>`;
  }

  const DASHBOARD_QUICK_MARKERS_MAX = 4;
  const DASHBOARD_QUICK_MARKER_GOAL_SCORE = { major: 22, mild: 14, minor: 8 };
  const DASHBOARD_QUICK_MARKER_CORE_PATHS = {
    female: [
      ['diabetes', 'hba1c'],
      ['diabetes', 'homaIR'],
      ['lipids', 'apoB'],
      ['lipids', 'ldl'],
      ['vitamins', 'vitaminD'],
      ['thyroid', 'tsh'],
      ['iron', 'ferritin'],
      ['hormones', 'estradiol'],
      ['proteins', 'hsCRP'],
    ],
    male: [
      ['diabetes', 'hba1c'],
      ['diabetes', 'homaIR'],
      ['lipids', 'apoB'],
      ['lipids', 'ldl'],
      ['vitamins', 'vitaminD'],
      ['thyroid', 'tsh'],
      ['hormones', 'testosterone'],
      ['proteins', 'hsCRP'],
      ['biochemistry', 'ggt'],
    ],
    default: [
      ['diabetes', 'hba1c'],
      ['diabetes', 'homaIR'],
      ['lipids', 'apoB'],
      ['lipids', 'ldl'],
      ['vitamins', 'vitaminD'],
      ['thyroid', 'tsh'],
      ['proteins', 'hsCRP'],
      ['biochemistry', 'ggt'],
      ['hematology', 'hemoglobin'],
    ],
  };
  const DASHBOARD_QUICK_MARKER_GOAL_RULES = [
    { pattern: /\b(insulin|glucose|blood sugar|a1c|hba1c|homa|metabolic|diabetes|prediabetes|body comp|body composition|weight|fat loss)\b/i, ids: ['diabetes_hba1c', 'diabetes_homaIR', 'diabetes_glucose', 'diabetes_insulin'] },
    { pattern: /\b(cholesterol|lipid|apob|apo b|ldl|cardio|heart|artery|atherosclerosis|vascular)\b/i, ids: ['lipids_apoB', 'lipids_ldl', 'lipids_hdl', 'lipids_triglycerides'] },
    { pattern: /\b(vitamin d|vitamin-d|immune|immunity|skin|bone|dandruff)\b/i, ids: ['vitamins_vitaminD', 'proteins_hsCRP'] },
    { pattern: /\b(thyroid|tsh|fatigue|cold intolerance|metabolism)\b/i, ids: ['thyroid_tsh', 'thyroid_freeT3', 'thyroid_freeT4'] },
    { pattern: /\b(testosterone|hormone|libido|fertility|erectile|muscle|sarcopenia)\b/i, ids: ['hormones_testosterone', 'hormones_freeTestosterone', 'vitamins_vitaminD'] },
    { pattern: /\b(estrogen|estradiol|progesterone|cycle|menstrual|menopause|fertility)\b/i, ids: ['hormones_estradiol', 'hormones_progesterone', 'hormones_lh', 'hormones_fsh'] },
    { pattern: /\b(iron|ferritin|anemia|anaemia|hair loss|oxygen|endurance)\b/i, ids: ['iron_ferritin', 'iron_iron', 'iron_transferrinSaturation', 'hematology_hemoglobin'] },
    { pattern: /\b(inflammation|crp|hs-crp|recovery|pain|autoimmune)\b/i, ids: ['proteins_hsCRP', 'proteins_crp', 'hematology_wbc'] },
    { pattern: /\b(liver|detox|alcohol|ggt|alt|ast)\b/i, ids: ['biochemistry_ggt', 'biochemistry_alt', 'biochemistry_ast'] },
    { pattern: /\b(kidney|renal|creatinine|egfr)\b/i, ids: ['biochemistry_creatinine', 'biochemistry_eGFR'] },
  ];

  function dashboardQuickMarkerPinsKey() {
    return profileStorageKey(state.currentProfile || 'default', 'dashboardQuickMarkerPinsV1');
  }

  function normalizeDashboardQuickMarkerPins(ids) {
    const seen = new Set();
    const normalized = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (!safeMarkerId(id) || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
      if (normalized.length >= DASHBOARD_QUICK_MARKERS_MAX) break;
    }
    return normalized;
  }

  function getDashboardQuickMarkerPins() {
    try {
      return normalizeDashboardQuickMarkerPins(JSON.parse(localStorage.getItem(dashboardQuickMarkerPinsKey()) || '[]'));
    } catch (e) {
      return [];
    }
  }

  function saveDashboardQuickMarkerPins(ids) {
    localStorage.setItem(dashboardQuickMarkerPinsKey(), JSON.stringify(normalizeDashboardQuickMarkerPins(ids)));
  }

  function isDashboardQuickMarkerPinned(id) {
    return getDashboardQuickMarkerPins().includes(resolveMarkerStorageViewId(getActiveData().categories, id) || id);
  }

  function toggleDashboardQuickMarkerPin(id) {
    if (!safeMarkerId(id)) return;
    id = resolveMarkerStorageViewId(getActiveData().categories, id) || id;
    const pins = getDashboardQuickMarkerPins();
    const existing = pins.indexOf(id);
    let pinned = false;
    if (existing >= 0) {
      pins.splice(existing, 1);
    } else {
      pins.unshift(id);
      pinned = true;
    }
    saveDashboardQuickMarkerPins(pins);
    showNotification(pinned ? 'Pinned to Quick Markers' : 'Removed from Quick Markers', pinned ? 'success' : 'info');
    if (state.currentView === 'dashboard') rerenderDashboardFromWidgetChange();
    if (state._activeDetailMarkerId === id) openDashboardMarkerDetail(id);
  }

  function getDashboardQuickMarkerCoreRanks() {
    const sex = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'default';
    const ranks = new Map();
    (DASHBOARD_QUICK_MARKER_CORE_PATHS[sex] || DASHBOARD_QUICK_MARKER_CORE_PATHS.default).forEach(([cat, key], index) => {
      const id = `${cat}_${key}`;
      if (!ranks.has(id)) ranks.set(id, index);
    });
    return ranks;
  }

  function getDashboardQuickMarkerGoalMatches() {
    const matches = new Map();
    for (const goal of state.importedData?.healthGoals || []) {
      const text = String(goal?.text || '').trim();
      if (!text) continue;
      const goalScore = DASHBOARD_QUICK_MARKER_GOAL_SCORE[goal.severity] || DASHBOARD_QUICK_MARKER_GOAL_SCORE.minor;
      for (const rule of DASHBOARD_QUICK_MARKER_GOAL_RULES) {
        if (!rule.pattern.test(text)) continue;
        for (const id of rule.ids) {
          const current = matches.get(id);
          if (!current || goalScore > current.score) {
            matches.set(id, {
              score: goalScore,
              reason: goal.severity ? `${goal.severity} goal match` : 'goal match',
            });
          }
        }
      }
    }
    return matches;
  }

  function buildDashboardQuickMarkerPriorityContext(ctx) {
    const priority = buildDashboardSpotlightPriorityContext(ctx);
    priority.coreRanks = getDashboardQuickMarkerCoreRanks();
    priority.goalMatches = getDashboardQuickMarkerGoalMatches();
    priority.pins = getDashboardQuickMarkerPins();
    priority.pinnedIds = new Set(priority.pins);
    return priority;
  }

  function scoreDashboardQuickMarkerHit(hit, priority) {
    const base = scoreDashboardSpotlightHit(hit, priority);
    let score = base.priorityScore;
    let reason = base.priorityReason;
    const storageId = hit.storageId || hit.id;

    const goalMatch = priority.goalMatches.get(storageId);
    if (goalMatch) {
      score += goalMatch.score;
      if (base.priorityScore < 25 || reason === 'core dashboard marker' || reason === 'latest tracked marker') {
        reason = goalMatch.reason;
      }
    }

    const coreRank = priority.coreRanks.get(storageId);
    if (coreRank != null) {
      score += Math.max(4, 18 - coreRank * 2);
      if (reason === 'latest tracked marker') reason = 'core quick marker';
    }

    const pinned = priority.pinnedIds.has(storageId);
    if (pinned) {
      score += 140;
      reason = 'manual pick';
    }

    return {
      ...base,
      priorityScore: Math.max(0, Math.round(score)),
      priorityReason: reason,
      quickMarkerPinned: pinned,
      quickMarkerCoreRank: coreRank ?? 999,
    };
  }

  function getDashboardPriorityLabel(hit, { pinned = false } = {}) {
    if (pinned) return 'Pinned';
    const score = Number(hit?.priorityScore) || 0;
    if (score >= 120) return 'Needs attention';
    if (score >= 70) return 'Watch closely';
    if (score >= 25) return 'Keep an eye on';
    return 'Core marker';
  }

  function getDashboardQuickMarkerCandidates(ctx, priority) {
    const candidates = new Map();
    const addHit = hit => {
      if (!hit || hit.marker?.hidden || candidates.has(hit.id)) return;
      candidates.set(hit.id, hit);
    };
    const addId = id => addHit(getDashboardMarkerById(ctx.data, id) || getDashboardMarkerById(ctx.filteredData, id));

    for (const hit of getDashboardSpotlightCandidates(ctx)) addHit(hit);
    for (const id of priority.pins) addId(id);
    for (const id of priority.coreRanks.keys()) addId(id);
    for (const id of priority.goalMatches.keys()) addId(id);
    return [...candidates.values()];
  }

  function getDashboardQuickMarkers(ctx) {
    const priority = buildDashboardQuickMarkerPriorityContext(ctx);
    const spotlightId = getDashboardSpotlight(ctx)?.id || '';
    const scored = getDashboardQuickMarkerCandidates(ctx, priority)
      .map(hit => scoreDashboardQuickMarkerHit(hit, priority))
      .filter(hit => hit.quickMarkerPinned
        || hit.id !== spotlightId)
      .filter(hit => hit.quickMarkerPinned
        || hit.priorityScore > 0
        || priority.keyRanks.has(hit.id)
        || priority.coreRanks.has(hit.id)
        || priority.goalMatches.has(hit.id));

    const byId = new Map(scored.map(hit => [hit.storageId || hit.id, hit]));
    const pinned = priority.pins.map(id => byId.get(id)).filter(Boolean);
    const pinnedIds = new Set(pinned.map(hit => hit.id));
    const dynamic = scored
      .filter(hit => !pinnedIds.has(hit.id))
      .sort((a, b) => (b.priorityScore - a.priorityScore)
        || (a.quickMarkerCoreRank - b.quickMarkerCoreRank)
        || (a.priorityKeyRank - b.priorityKeyRank)
        || String(a.marker?.name || a.id).localeCompare(String(b.marker?.name || b.id)));
    return [...pinned, ...dynamic].slice(0, DASHBOARD_QUICK_MARKERS_MAX);
  }

  function renderDashboardQuickMarkerTile(hit) {
    const scoreLabel = getDashboardPriorityLabel(hit, { pinned: hit.quickMarkerPinned });
    const reason = `${scoreLabel} · ${hit.priorityReason || 'latest tracked marker'}`;
    return `<button type="button" class="db-stat-widget db-quick-marker-tile db-status-${escapeAttr(hit.status)}" ${dashboardMarkerDetailAttrs(hit.id)} aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <div class="db-stat-head">
        <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
        <span>${escapeHTML(hit.marker.name)}</span>
      </div>
      <div class="db-stat-value">${escapeHTML(formatValue(hit.value))}${hit.marker.unit ? `<small>${escapeHTML(hit.marker.unit)}</small>` : ''}</div>
      <div class="db-stat-delta">${escapeHTML(hit.trend.arrow || '→')} vs prev</div>
      ${renderDashboardMiniSparkline(hit.marker.values, hit.status, 120, 34)}
      <div class="db-stat-reason">${escapeHTML(reason)}</div>
    </button>`;
  }

  function renderDashboardQuickMarkersWidget(ctx) {
    const hits = getDashboardQuickMarkers(ctx);
    if (!hits.length) return '';
    return `<div class="db-quick-marker-grid">${hits.map(renderDashboardQuickMarkerTile).join('')}</div>`;
  }

  function renderDashboardSingleMarkerWidget(ctx, markerId) {
    const hit = getDashboardMarkerById(ctx.data, markerId) || getDashboardMarkerById(ctx.filteredData, markerId);
    if (!hit) return '';
    const range = getEffectiveRange(hit.marker);
    const rangeText = range.min != null || range.max != null
      ? `Range ${range.min != null ? formatValue(range.min) : '—'}–${range.max != null ? formatValue(range.max) : '—'} ${hit.marker.unit || ''}`
      : 'Custom marker widget';
    return `<button type="button" class="db-stat-widget db-single-marker-widget db-status-${escapeAttr(hit.status)}" ${dashboardMarkerDetailAttrs(hit.id)} aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <div class="db-stat-head">
        <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
        <span>${escapeHTML(hit.marker.name)}</span>
      </div>
      <div class="db-stat-value">${escapeHTML(formatValue(hit.value))}${hit.marker.unit ? `<small>${escapeHTML(hit.marker.unit)}</small>` : ''}</div>
      <div class="db-stat-delta">${escapeHTML(hit.trend.arrow || '→')} vs prev</div>
      ${renderDashboardMiniSparkline(hit.marker.values, hit.status, 120, 34)}
      <div class="db-stat-reason">${escapeHTML(rangeText)}</div>
    </button>`;
  }

  const DASHBOARD_SPOTLIGHT_ALERT_SCORE = {
    sudden_high: 90,
    sudden_low: 90,
    past_high: 65,
    past_low: 65,
    approaching_high: 32,
    approaching_low: 32,
  };

  function dashboardSpotlightConcernLabel(concern) {
    const labels = {
      sudden_high: 'sudden high trend',
      sudden_low: 'sudden low trend',
      past_high: 'rising above range',
      past_low: 'falling below range',
      approaching_high: 'approaching upper range',
      approaching_low: 'approaching lower range',
    };
    return labels[concern] || String(concern || '').replace(/_/g, ' ');
  }

  function getDashboardSpotlightRangeSignal(hit) {
    const value = Number(hit?.value);
    const min = hit?.range?.min;
    const max = hit?.range?.max;
    if (!Number.isFinite(value)) return { outside: 0, edge: 0, reason: '' };

    if (min != null && value < min) {
      const width = max != null && max > min ? max - min : Math.max(Math.abs(min), 1);
      const outside = width > 0 ? (min - value) / width : 0;
      return { outside, edge: 0, reason: `${outside.toFixed(1)}x range below low` };
    }
    if (max != null && value > max) {
      const width = min != null && max > min ? max - min : Math.max(Math.abs(max), 1);
      const outside = width > 0 ? (value - max) / width : 0;
      return { outside, edge: 0, reason: `${outside.toFixed(1)}x range above high` };
    }
    if (min != null && max != null && max > min) {
      const position = (value - min) / (max - min);
      const edgeDistance = Math.min(position, 1 - position);
      const edge = Math.max(0, (0.15 - edgeDistance) / 0.15);
      if (edge > 0) {
        return {
          outside: 0,
          edge,
          reason: position >= 0.5 ? 'near upper range edge' : 'near lower range edge',
        };
      }
    }
    return { outside: 0, edge: 0, reason: '' };
  }

  function buildDashboardSpotlightPriorityContext(ctx) {
    const alerts = new Map();
    for (const alert of ctx.trendAlerts || []) {
      if (alert?.id && !alerts.has(alert.id)) alerts.set(alert.id, alert);
    }
    const keyRanks = new Map();
    (ctx.keyMarkers || []).forEach((km, index) => {
      const id = `${km.cat}_${km.key}`;
      if (!keyRanks.has(id)) keyRanks.set(id, index);
    });
    const criticalFlags = new Set((ctx.criticalFlags || []).map(f => f.id));
    return { alerts, keyRanks, criticalFlags };
  }

  function scoreDashboardSpotlightHit(hit, priority) {
    let score = 0;
    const reasons = [];
    const alert = priority.alerts.get(hit.id);
    if (alert) {
      score += DASHBOARD_SPOTLIGHT_ALERT_SCORE[alert.concern] || 24;
      reasons.push(dashboardSpotlightConcernLabel(alert.concern));
    }

    const rangeSignal = getDashboardSpotlightRangeSignal(hit);
    if (hit.status === 'high' || hit.status === 'low') {
      score += 40 + Math.min(80, rangeSignal.outside * 55);
      reasons.push(rangeSignal.reason || (hit.status === 'high' ? 'above range' : 'below range'));
    } else if (rangeSignal.edge > 0) {
      score += rangeSignal.edge * 14;
      reasons.push(rangeSignal.reason);
    }

    if (priority.criticalFlags.has(hit.id)) {
      score += 30;
      reasons.push('critical range distance');
    }

    if (hit.trend?.cls?.includes('trend-bad')) {
      score += 16;
      reasons.push('moving the wrong way');
    } else if (hit.trend?.cls?.includes('trend-good')) {
      score -= 6;
    }

    const keyRank = priority.keyRanks.get(hit.id);
    if (keyRank != null) {
      score += Math.max(2, 16 - keyRank * 2);
      if (!reasons.length) reasons.push('core dashboard marker');
    }

    return {
      ...hit,
      priorityScore: Math.max(0, Math.round(score)),
      priorityReason: reasons[0] || 'latest tracked marker',
      priorityKeyRank: keyRank ?? 999,
    };
  }

  function getDashboardSpotlightCandidates(ctx) {
    const candidates = [];
    const seen = new Set();
    const add = (data, catKey, markerKey) => {
      const id = `${catKey}_${markerKey}`;
      if (seen.has(id)) return;
      const hit = getDashboardMarkerByPath(data, catKey, markerKey);
      if (!hit || hit.marker?.hidden) return;
      seen.add(id);
      candidates.push(hit);
    };

    for (const [catKey, category] of Object.entries(ctx.filteredData?.categories || {})) {
      for (const markerKey of Object.keys(category.markers || {})) add(ctx.filteredData, catKey, markerKey);
    }
    for (const alert of ctx.trendAlerts || []) {
      const idx = alert.id?.indexOf('_') ?? -1;
      if (idx > 0) add(ctx.data, alert.id.slice(0, idx), alert.id.slice(idx + 1));
    }
    for (const km of ctx.keyMarkers || []) add(ctx.data, km.cat, km.key);
    return candidates;
  }

  function getDashboardSpotlight(ctx) {
    const priority = buildDashboardSpotlightPriorityContext(ctx);
    const scored = getDashboardSpotlightCandidates(ctx)
      .map(hit => scoreDashboardSpotlightHit(hit, priority))
      .filter(hit => hit.priorityScore > 0 || priority.keyRanks.has(hit.id))
      .sort((a, b) => (b.priorityScore - a.priorityScore)
        || (a.priorityKeyRank - b.priorityKeyRank)
        || String(a.marker?.name || a.id).localeCompare(String(b.marker?.name || b.id)));
    return scored[0] || null;
  }

  function renderDashboardSpotlightWidget(ctx) {
    const hit = getDashboardSpotlight(ctx);
    if (!hit) return '';
    const range = getEffectiveRange(hit.marker);
    const rangeText = range.min != null || range.max != null
      ? `Range ${range.min != null ? formatValue(range.min) : '—'}–${range.max != null ? formatValue(range.max) : '—'} ${hit.marker.unit || ''}`
      : 'No active range';
    const priorityText = `${getDashboardPriorityLabel(hit)} · ${hit.priorityReason || 'latest tracked marker'}`;
    return `<button type="button" class="db-spotlight" ${dashboardMarkerDetailAttrs(hit.id)} aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <div class="db-spotlight-head">
        <div>
          <div class="db-spotlight-name">${escapeHTML(hit.marker.name)}</div>
          <div class="db-spotlight-meta">${escapeHTML(rangeText)}</div>
          <div class="db-spotlight-priority">${escapeHTML(priorityText)}</div>
        </div>
        <div class="db-spotlight-value">${escapeHTML(formatValue(hit.value))}<small>${escapeHTML(hit.marker.unit || '')}</small></div>
      </div>
      ${renderDashboardMiniSparkline(hit.marker.values, hit.status, 420, 150)}
    </button>`;
  }

  function renderLabsPriorityBanner(ctx) {
    const hit = getDashboardSpotlight(ctx);
    if (!hit) return '';
    const priorityText = `${getDashboardPriorityLabel(hit)} · ${hit.priorityReason || 'latest tracked marker'}`;
    return `<button type="button" class="labs-priority-banner db-status-${escapeAttr(hit.status)}" ${dashboardMarkerDetailAttrs(hit.id)} aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
      <span class="labs-priority-copy">
        <span class="labs-priority-kicker">Current Priority</span>
        <strong>${escapeHTML(hit.marker.name)}</strong>
        <small>${escapeHTML(priorityText)}</small>
      </span>
      <span class="labs-priority-spark">${renderDashboardMiniSparkline(hit.marker.values, hit.status, 120, 28)}</span>
      <span class="labs-priority-value">${escapeHTML(formatValue(hit.value))}<small>${escapeHTML(hit.marker.unit || '')}</small></span>
    </button>`;
  }

  function dashboardPearson(aValues, bValues) {
    const xs = [];
    const ys = [];
    const n = Math.min(aValues?.length || 0, bValues?.length || 0);
    for (let i = 0; i < n; i++) {
      const x = Number(aValues[i]);
      const y = Number(bValues[i]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length < 3) return null;
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den ? num / den : null;
  }

  function getDashboardCorrelationPairs(ctx) {
    const target = getDashboardMarkerByPath(ctx.data, 'lipids', 'apoB')
      || getDashboardMarkerByPath(ctx.data, 'lipids', 'ldl')
      || getDashboardMarkerByPath(ctx.data, 'diabetes', 'hba1c')
      || getDashboardSpotlight(ctx);
    if (!target?.marker?.values) return null;
    const pairs = [];
    for (const [catKey, category] of Object.entries(ctx.data.categories || {})) {
      for (const [markerKey, marker] of Object.entries(category.markers || {})) {
        const id = `${catKey}_${markerKey}`;
        if (id === target.id || !safeMarkerId(id) || !markerHasData(marker)) continue;
        const r = dashboardPearson(target.marker.values || [], marker.values || []);
        if (r == null || !Number.isFinite(r)) continue;
        const latestIdx = getLatestValueIndex(marker.values || []);
        state.markerRegistry[id] = marker;
        pairs.push({
          id,
          name: marker.name || markerKey,
          category: category.label || catKey,
          value: latestIdx >= 0 ? formatValue(marker.values[latestIdx]) : '—',
          unit: marker.unit || '',
          r,
        });
      }
    }
    pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return { target, pairs: pairs.slice(0, 12) };
  }

  function renderDashboardCorrelationWidget(ctx) {
    const result = getDashboardCorrelationPairs(ctx);
    if (!result?.pairs?.length) {
      return `<button type="button" class="db-correlation-empty" ${dashboardNavigateAttrs('correlations')}>
        <strong>Pick markers to compare</strong>
        <span>Correlations need at least three shared dated values.</span>
      </button>`;
    }
    return `<div class="db-correlation-widget">
      <div class="db-correlation-head">
        <span>vs <strong>${escapeHTML(result.target.marker.name || 'target marker')}</strong></span>
        <button type="button" ${dashboardNavigateAttrs('correlations')}>Open</button>
      </div>
      <div class="db-correlation-grid">
        ${result.pairs.map(pair => {
          const directionClass = pair.r >= 0 ? 'db-correlation-cell-pos' : 'db-correlation-cell-neg';
          return `<button type="button" class="db-correlation-cell ${directionClass}" ${dashboardMarkerDetailAttrs(pair.id)}>
            <span>${escapeHTML(pair.name)}</span>
            <strong>${pair.r.toFixed(2)}</strong>
            <small>${escapeHTML(pair.value)}${pair.unit ? ` ${escapeHTML(pair.unit)}` : ''}</small>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  function getDashboardKeyTrendReason(ctx, id, hit) {
    const alert = (ctx.trendAlerts || []).find(a => a.id === id);
    if (alert) return dashboardSpotlightConcernLabel(alert.concern);
    if (hit.status === 'high') return 'above range';
    if (hit.status === 'low') return 'below range';
    if (hit.trend?.cls?.includes('trend-good')) return 'moving in range';
    if (hit.trend?.cls?.includes('trend-bad')) return 'moving away from range';
    if (hit.trend?.cls && !hit.trend.cls.includes('trend-stable')) return 'recent change';
    return 'watchlist marker';
  }

  function renderDashboardKeyTrendRow(ctx, km) {
    const hit = getDashboardMarkerByPath(ctx.filteredData, km.cat, km.key)
      || getDashboardMarkerByPath(ctx.data, km.cat, km.key);
    if (!hit) return '';
    const reason = getDashboardKeyTrendReason(ctx, hit.id, hit);
    return `<button type="button" class="db-key-trend-row db-status-${escapeAttr(hit.status)}" ${dashboardMarkerDetailAttrs(hit.id)} aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
      <span class="db-key-trend-name-wrap">
        <span class="db-key-trend-name">${escapeHTML(hit.marker.name)}</span>
        <span class="db-key-trend-cat">${escapeHTML(hit.category?.label || km.cat)}</span>
      </span>
      <span class="db-key-trend-spark">${renderDashboardMiniSparkline(hit.marker.values, hit.status, 132, 28)}</span>
      <span class="db-key-trend-latest"><strong>${escapeHTML(formatValue(hit.value))}</strong><small>${escapeHTML(hit.marker.unit || '')}</small></span>
      <span class="db-key-trend-signal"><strong>${escapeHTML(hit.trend?.arrow || '\u2192')}</strong><small>${escapeHTML(reason)}</small></span>
    </button>`;
  }

  function renderDashboardKeyTrendsWidget(ctx) {
    const rows = (ctx.keyMarkers || []).map(km => renderDashboardKeyTrendRow(ctx, km)).filter(Boolean);
    let html = `<div class="dashboard-widget-inline-controls">${renderDateRangeFilter()}</div>`;
    if (rows.length > 0) {
      html += `<div class="db-key-trend-list">${rows.join('')}</div>`;
    } else {
      html += `<div class="dashboard-widget-empty">No trend markers available in this date range.</div>`;
    }
    return html;
  }

  function renderDashboardAlertsWidget(ctx) {
    const { trendAlerts, criticalFlags } = ctx;
    const totalAttention = trendAlerts.length + criticalFlags.length;
    if (totalAttention === 0) return '';
    let html = `<div class="alerts-section dashboard-alerts-widget"><div class="alerts-title">Needs Attention (${totalAttention})</div>`;
    for (const alert of trendAlerts) {
      const isSudden = alert.concern.startsWith('sudden_');
      const isPast = alert.concern.startsWith('past_');
      const cls = isSudden ? 'trend-alert-sudden' : isPast ? 'trend-alert-danger' : 'trend-alert-warning';
      const arrow = isSudden ? '\u26A1' : alert.direction === 'rising' ? '\u2197' : '\u2198';
      const label = alert.concern === 'sudden_high' ? 'Sudden jump above range'
        : alert.concern === 'sudden_low' ? 'Sudden drop below range'
        : alert.concern === 'past_high' ? 'Above range & rising'
        : alert.concern === 'past_low' ? 'Below range & falling'
        : alert.concern === 'approaching_high' ? 'Approaching upper limit'
        : 'Approaching lower limit';
      html += `<div class="trend-alert-card ${cls}" role="button" tabindex="0" aria-label="${escapeHTML(alert.name)} \u2014 ${label}" ${dashboardMarkerDetailAttrs(alert.id)}>
        <span class="trend-alert-arrow">${arrow}</span>
        <div class="trend-alert-info">
          <div class="trend-alert-name">${escapeHTML(alert.name)} <span class="trend-alert-cat">${escapeHTML(alert.category)}</span></div>
          <div class="trend-alert-label">${label}</div>
        </div>
        <div class="trend-alert-spark">${alert.spark.join(' \u2192 ')}</div>
      </div>`;
    }
    for (const f of criticalFlags) {
      const cls = f.status === "high" ? "alert-high" : "alert-low";
      const label = f.status === "high" ? "\u25B2 CRITICAL HIGH" : "\u25BC CRITICAL LOW";
      html += `<div class="alert-card ${cls}" role="button" tabindex="0" aria-label="${label}: ${escapeHTML(f.name)} ${escapeHTML(String(f.value))} ${escapeHTML(f.unit)}" ${dashboardNavigateAttrs(f.categoryKey)}>
        <span class="alert-indicator">${label}</span>
        <span class="alert-name">${escapeHTML(f.name)}</span>
        <span class="alert-value">${escapeHTML(String(f.value))} ${escapeHTML(f.unit)}</span>
        <span class="alert-ref">${formatValue(f.effectiveMin)} \u2013 ${formatValue(f.effectiveMax)}</span></div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderDashboardNotesWidget() {
    const hasNotes = state.importedData.notes && state.importedData.notes.length > 0;
    let html = `<div class="notes-section dashboard-notes-widget">`;
    html += `<button type="button" class="add-note-btn" ${dashboardWidgetActionAttrs('open-note-editor')}>+ Add Note</button>`;
    if (hasNotes) {
      const notes = state.importedData.notes
        .map((note, i) => ({ note, idx: i }))
        .sort((a, b) => a.note.date.localeCompare(b.note.date));
      for (const { note, idx } of notes) {
        const d = new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const preview = escapeHTML(note.text.length > 200 ? note.text.slice(0, 200) + '...' : note.text);
        html += `<div class="note-card" role="button" tabindex="0" aria-label="Note from ${d}" ${dashboardWidgetActionAttrs('open-note-editor', { index: idx })}>
          <div class="note-card-date">${d}</div>
          <div class="note-card-text">${preview}</div>
          <div class="note-card-actions">
            <button type="button" class="note-card-action" ${dashboardWidgetActionAttrs('open-note-editor', { index: idx })}>Edit</button>
            <button type="button" class="note-card-action note-card-action-delete" ${dashboardWidgetActionAttrs('delete-note', { index: idx })}>Delete</button>
          </div>
        </div>`;
      }
    } else {
      html += `<div class="dashboard-widget-empty">No notes yet. Add notes to track context around your lab results.</div>`;
    }
    html += `</div>`;
    return html;
  }

  return {
    buildDashboardWidgetContext,
    getDashboardMarkerById,
    renderDashboardBioAgeWidget,
    renderDashboardQuickMarkersWidget,
    renderDashboardSingleMarkerWidget,
    renderDashboardSpotlightWidget,
    renderLabsPriorityBanner,
    renderDashboardCorrelationWidget,
    renderDashboardKeyTrendsWidget,
    renderDashboardAlertsWidget,
    renderDashboardNotesWidget,
    isDashboardQuickMarkerPinned,
    toggleDashboardQuickMarkerPin,
  };
}
