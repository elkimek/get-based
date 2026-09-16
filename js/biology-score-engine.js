// @ts-check
// biology-score-engine.js — shared primitives for the Biology Scores composite engine.

import { getBiologyProfileContext } from './profile-context.js';
import { getInputProfileModifier, getScoreProfileFlags } from './biology-score-profile-modifiers.js';
import { getMarkerHit, canonicalRange } from './biology-score-inputs.js';
import { BIOLOGY_SCORE_VERSION } from './biology-score-contract.js';
import { resolveScorePanel, panelAnchorWarning, applyPanelContext, selectCurrentCoreAlternatives } from './biology-score-panel-policy.js';
import { assessScoreRecency } from './biology-score-dates.js';
export { getMarkerHit, canonicalMarkerValue, parsePath } from './biology-score-inputs.js';
export { getAgeDays, formatAge, assessScoreRecency, SCORE_STALE_DAYS, SCORE_DATE_SPAN_DAYS, DAY_MS } from './biology-score-dates.js';

export const TONE_LABELS = { excellent: 'Strong range fit', good: 'Good range fit', strained: 'Review pattern', poor: 'Low range fit', concerning: 'Low range fit', significant: 'Low range fit', severe: 'Far from range' };

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function lerp(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMax;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function resolveScoreTone(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'strained';
  if (score >= 35) return 'poor';
  if (score >= 15) return 'concerning';
  return 'severe';
}

export function resolveScoreSeverity(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 50) return null;
  if (score >= 35) return 'mild';
  if (score >= 15) return 'moderate';
  return 'severe';
}

export function resolveCoverageLabel(coverage) {
  if (coverage >= 0.8) return 'high';
  if (coverage >= 0.45) return 'partial';
  return 'low';
}

export function contextOnlyNeedsMoreData(item) {
  if (!item?.profileContextOnly && !item?.contextLimited) return false;
  const reason = String(item.contextReason || item.contextNote || '').toLowerCase();
  return /\bneeds?\b|missing|unknown|confirm collection|add .*context|before it can be scored|sample time|cycle day|cycle phase/.test(reason);
}

export function resolveScoreConfidence(result) {
  if (!Number.isFinite(result?.score)) return { level: 'not-current', label: result?.available?.length ? 'Check inputs' : 'Needs markers', warning: result?.anchorWarning || result?.recencyMessage || 'Core markers or their interpretation context are not available.' };
  if (result.coverage < 1) {
    const covered = new Set((result.available || []).filter(i => i.core && !i.profileContextOnly).map(i => i.coreGroup || i.key));
    const missing = [...new Set([...(result.missing || []), ...(result.available || []).filter(i => i.profileContextOnly)].filter(i => i.core && !covered.has(i.coreGroup || i.key)).map(i => i.coreGroupLabel || i.label))];
    return { level: 'low', label: result.contextLimited ? 'Needs context' : 'Core incomplete', warning: `Missing or unscored core markers: ${missing.join(', ') || 'some domains'}. This is a provisional pattern.` };
  }
  if (result.contextLimited) return { level: 'medium', label: 'Needs context', warning: result.available?.find(i => i.core && i.contextLimited)?.contextNote || 'Timing or profile context limits interpretation of this panel.' };
  return { level: 'high', label: 'Core complete', warning: '' };
}

export function applyScoreConfidence(result) {
  const confidence = resolveScoreConfidence(result);
  return { ...result, scoreConfidence: confidence.level, scoreConfidenceLabel: confidence.label,
    scoreConfidenceWarning: confidence.warning, flags: [...new Set([...(result.flags || []), ...(confidence.warning ? [confidence.warning] : [])])] };
}

export function scoreAgainstRange(value, range) {
  if (!Number.isFinite(value) || !range) return null;
  const min = Number.isFinite(range.min) ? Number(range.min) : null;
  const max = Number.isFinite(range.max) ? Number(range.max) : null;
  if (min == null && max == null) return null;

  if (min == null && max != null) {
    if (value <= max) return 100;
    const buffer = Math.abs(max) * 0.5 || Number.EPSILON;
    return Math.round(clamp(lerp(clamp(value, max, max + buffer), max, max + buffer, 99, 0), 0, 99));
  }

  if (max == null && min != null) {
    if (value >= min) return 100;
    const buffer = Math.abs(min) * 0.5 || Number.EPSILON;
    return Math.round(clamp(lerp(clamp(value, min - buffer, min), min - buffer, min, 0, 99), 0, 99));
  }

  if (min == null || max == null) return null;
  if (value >= min && value <= max) return 100;
  const span = Math.abs(max - min) || Math.abs(max) * 0.5 || Number.EPSILON;
  const lowFloor = Math.max(0, min - span);
  const highCeil = max + span;
  if (value < min) return Math.round(clamp(lerp(clamp(value, lowFloor, min), lowFloor, min, 0, 99), 0, 99));
  return Math.round(clamp(lerp(clamp(value, max, highCeil), max, highCeil, 99, 0), 0, 99));
}

export function applyScoreRecency(result, recencyInputs = (result.available || []).filter(item => item.recencyRequired !== false)) {
  const recency = assessScoreRecency(recencyInputs);
  const flags = [...(result.flags || [])];
  if (recency.blocked && recency.message) flags.unshift(recency.message);
  return {
    ...result,
    rawScore: result.score,
    score: recency.blocked ? null : result.score,
    tone: recency.blocked ? null : result.tone,
    recencyStatus: recency.status,
    recencyBadge: recency.badge,
    recencyMessage: recency.message,
    flags,
  };
}

export function scoreHighOnly(value, threshold, highCeil) {
  if (!Number.isFinite(value)) return null;
  if (value <= threshold) return 100;
  const ceil = Math.max(highCeil, threshold + Number.EPSILON);
  return Math.round(clamp(lerp(clamp(value, threshold, ceil), threshold, ceil, 99, 0), 0, 99));
}

export function scoreLowOnly(value, threshold, lowFloor = 0) {
  if (!Number.isFinite(value)) return null;
  if (value >= threshold) return 100;
  return Math.round(clamp(lerp(clamp(value, lowFloor, threshold), lowFloor, threshold, 0, 99), 0, 99));
}

// Correlated inputs share one family weight; adding aliases or ratios cannot add votes.
function weightedFit(items) {
  const groups = new Map();
  for (const item of items.filter(i => Number.isFinite(i.partial) && i.weight > 0)) {
    const key = item.evidenceGroup || item.coreGroup || item.key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let sum = 0, weight = 0;
  for (const members of groups.values()) {
    const total = members.reduce((n, i) => n + i.weight, 0);
    const familyWeight = Math.max(...members.map(i => i.familyWeight ?? i.weight));
    for (const item of members) item.effectiveWeight = familyWeight * item.weight / total;
    sum += members.reduce((n, i) => n + i.partial * i.effectiveWeight, 0);
    weight += familyWeight;
  }
  return weight ? Math.round(sum / weight) : null;
}

function referenceAlert(hit) {
  const range = hit.canonicalReferenceRange || hit.referenceRange;
  const value = hit.canonicalReferenceRange ? hit.canonicalValue : hit.value;
  if (!range) return '';
  const outside = (Number.isFinite(range.min) && value < range.min) || (Number.isFinite(range.max) && value > range.max);
  hit.referenceDirection = !outside ? '' : Number.isFinite(range.min) && value < range.min ? 'below' : 'above';
  return outside ? `${hit.label} is outside its reference range${hit.profileContextOnly ? ` (${hit.date || 'date unknown'}; context only)` : ''}; review this result even when the composite looks favorable.` : '';
}

export function finalizeCustomScore(def, parts, missing, flags = [], options = {}) {
  const available = parts.filter(Boolean);
  const core = available.filter(i => i.core && !i.profileContextOnly);
  const coreKeys = new Set([...available, ...missing].filter(i => i.core).map(i => i.coreGroup || i.key));
  const covered = new Set(core.map(i => i.coreGroup || i.key));
  const coverage = coreKeys.size ? covered.size / coreKeys.size : 0;
  const refinedScore = weightedFit(available);
  let score = weightedFit(core);
  // A core result with no fit cannot be averaged into a reassuring headline.
  const discordant = core.filter(i => i.partial < 35);
  const alerts = available.map(referenceAlert).filter(Boolean);
  if (discordant.length) flags.unshift(`${discordant.map(i => i.label).join(', ')}: marked departure from the scoring range. The average cannot explain this pattern on its own.`);
  const anchorWarning = panelAnchorWarning(def, available, options.profileContext || {});
  if (anchorWarning) { score = null; flags.unshift(anchorWarning); }
  const tone = score == null ? null : score >= 70 && (discordant.length || alerts.length) ? 'strained' : resolveScoreTone(score);
  const optional = available.filter(i => !i.core);
  for (const item of optional) {
    const related = core.filter(i => i.evidenceGroup === item.evidenceGroup);
    const coreFit = related.length ? related.reduce((n, i) => n + i.partial * i.effectiveWeight, 0) / related.reduce((n, i) => n + i.effectiveWeight, 0) : null;
    item.evidenceRole = item.profileContextOnly ? 'Cannot assess' : coreFit == null ? 'Different dimension' : (item.partial >= 70) === (coreFit >= 70) ? 'Supports core pattern' : 'Differs from core pattern';
  }
  return applyScoreConfidence(applyScoreRecency({ ...def, algorithmVersion: BIOLOGY_SCORE_VERSION,
    profileContext: options.profileContext || getBiologyProfileContext(options), score, refinedScore, anchorWarning, tone: score != null && score >= 70 && coverage < 1 && !alerts.length ? 'strained' : tone,
    severity: resolveScoreSeverity(score), coverage, coreCovered: covered.size, coreTotal: coreKeys.size,
    optionalAvailable: optional.filter(i => !i.profileContextOnly).length,
    optionalTotal: optional.length + missing.filter(i => !i.core).length,
    coverageLabel: resolveCoverageLabel(coverage), available, missing,
    attention: alerts[0] || (discordant.length ? flags[0] : ''),
    contextLimited: core.some(i => i.contextLimited) || available.some(i => i.core && i.profileContextOnly && !covered.has(i.coreGroup || i.key)),
    flags: [...new Set([...alerts, ...getScoreProfileFlags(def.id, options.profileContext || {}), ...flags])],
  }));
}

export function computeWeightedComposite(data, def, options = {}) {
  const profileContext = options.profileContext || getBiologyProfileContext(options);
  const available = [], missing = [], flags = [];
  const panel = resolveScorePanel(data, def);
  def = { ...def, panelLabel: panel.panelLabel, panelRoute: panel.panelRoute };
  const eligibleCore = input => input.core === true && (!input.coreSex?.length || !profileContext.sex || input.coreSex.includes(profileContext.sex));
  const budgets = new Map();
  for (const input of panel.inputs) {
    const key = `${eligibleCore(input)}:${input.evidenceGroup}`;
    budgets.set(key, Math.max(budgets.get(key) || 0, input.weight * (input.sexWeightScale?.[profileContext.sex] ?? 1)));
  }
  for (const entry of [...panel.inputs.map(input => ({ input, hit: panel.hits.get(input.key) || getMarkerHit(data, input.paths) })), ...panel.extra]) {
    const { input, hit } = entry;
    const core = eligibleCore(input);
    const meta = { ...input, core, familyWeight: budgets.get(`${core}:${input.evidenceGroup}`), path: Array.isArray(input.paths) ? input.paths[0] : input.paths };
    if (!hit) { missing.push(meta); continue; }
    const modifier = getInputProfileModifier(hit, input, profileContext);
    const range = modifier.rangeOverride ?? hit.range;
    const partial = scoreAgainstRange(hit.canonicalValue, modifier.rangeOverride ? canonicalRange(hit, range) : hit.canonicalScoringRange || canonicalRange(hit, range));
    let reason = input.contextOnly || hit.contextReason || (modifier.score === false ? modifier.flag : '');
    const dateCheck = assessScoreRecency([hit]);
    if (!core && dateCheck.blocked) reason = dateCheck.message;
    if (partial == null && !reason) reason = 'No usable range for this assay; add its laboratory range before scoring.';
    if (modifier.flag) flags.push(modifier.flag);
    const referenceRange = modifier.referenceRangeOverride || range;
    available.push({ ...hit, ...meta, range, rangeLabel: modifier.rangeLabel || (modifier.rangeOverride ? hit.phaseLabel || 'Context range' : hit.rangeLabel),
      canonicalScoringRange: modifier.rangeOverride ? canonicalRange(hit, range) : hit.canonicalScoringRange,
      ...(modifier.rangeOverride ? { referenceRange, canonicalReferenceRange: canonicalRange(hit, referenceRange) } : {}),
      partial: reason ? null : partial, weight: reason ? 0 : input.weight * (modifier.weightScale ?? 1),
      contextNote: modifier.flag || '',
      configuredWeight: input.weight, profileContextOnly: !!reason, contextReason: reason, recencyRequired: core && !reason,
      contextLimited: modifier.limited === true || /missing.*confidence|sample time missing/i.test(modifier.flag || ''),
    });
  }
  selectCurrentCoreAlternatives(available);
  // Optional inputs from a different sampling period remain inspectable, without mixing snapshots.
  const dates = available.filter(i => i.core && !i.profileContextOnly).map(i => i.date).sort();
  const latest = dates.at(-1);
  for (const item of available) {
    if (!item.core && !item.profileContextOnly && latest && assessScoreRecency([item, { date: latest }]).blocked) {
      item.partial = null; item.weight = 0; item.profileContextOnly = true;
      item.contextReason = 'Collected outside the core sampling period; retained as historical context.';
    }
  }
  applyPanelContext(def, available, flags);
  return finalizeCustomScore(def, available, missing, flags, { ...options, profileContext });
}

// Attribution follows the same effective core weights as the headline.
export function coreScoreDrivers(score) {
  return (score.available || []).filter(i => i.core && !i.profileContextOnly && Number.isFinite(i.partial))
    .map(item => ({ item, impact: (100 - item.partial) * (item.effectiveWeight ?? item.weight ?? 0) }))
    .sort((a, b) => b.impact - a.impact);
}
