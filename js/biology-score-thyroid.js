// @ts-check
// biology-score-thyroid.js — Thyroid Coherence score.

import {
  applyScoreConfidence,
  applyScoreRecency,
  clamp,
  getMarkerHit,
  lerp,
  resolveCoverageLabel,
  resolveScoreSeverity,
  resolveScoreTone,
  scoreHighOnly,
} from './biology-score-engine.js';

function scoreFt3Activity(ft3) {
  const factor = clamp(ft3 / 4.8, 0.55, 1.15);
  if (factor <= 1) return Math.round(clamp(lerp(factor, 0.55, 1, 20, 100), 20, 100));
  return Math.round(clamp(lerp(factor, 1, 1.15, 100, 85), 85, 100));
}

function scoreConversionRatio(ratio) {
  if (ratio <= 0.18) return Math.round(clamp(lerp(ratio, 0, 0.18, 0, 49), 0, 49));
  if (ratio <= 0.22) return Math.round(clamp(lerp(ratio, 0.18, 0.22, 50, 69), 50, 69));
  if (ratio <= 0.35) return Math.round(clamp(lerp(ratio, 0.22, 0.35, 70, 100), 70, 100));
  if (ratio <= 0.4) return Math.round(clamp(lerp(ratio, 0.35, 0.4, 84, 70), 70, 84));
  return Math.round(clamp(lerp(clamp(ratio, 0.4, 0.6), 0.4, 0.6, 69, 40), 40, 69));
}

export function computeThyroidCoherence(data, def) {
  const tsh = getMarkerHit(data, 'thyroid.tsh');
  const ft3 = getMarkerHit(data, 'thyroid.ft3');
  const ft4 = getMarkerHit(data, 'thyroid.ft4');
  const reverseT3 = getMarkerHit(data, ['thyroid.reverseT3', 'thyroid.rT3', 'thyroid.rt3']);
  const tpoAb = getMarkerHit(data, ['thyroid.tpoAb', 'thyroid.antiTPO', 'thyroid.aTPO']);
  const tgAb = getMarkerHit(data, ['thyroid.tgAb', 'thyroid.antiTG', 'thyroid.aTG']);
  const available = [];
  const missing = [];
  const weights = { tsh: 1.0, ft3: 1.3, conversion: 1.35, reverseT3: 0.45, tpoAb: 0.35, tgAb: 0.25 };
  let totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  let availableWeight = 0;
  let scoreSum = 0;

  if (tsh) {
    const partial = clamp(1 / (1 + Math.abs(tsh.canonicalValue - 1.5) / 1.2), 0.35, 1.0) * 100;
    available.push({ ...tsh, key: 'tsh', label: 'TSH', partial: Math.round(partial), weight: weights.tsh, core: true });
    availableWeight += weights.tsh;
    scoreSum += partial * weights.tsh;
  } else missing.push({ key: 'tsh', label: 'TSH', weight: weights.tsh, core: true });

  if (ft3) {
    const partial = scoreFt3Activity(ft3.canonicalValue);
    available.push({ ...ft3, key: 'ft3', label: 'Free T3', partial, weight: weights.ft3, core: true });
    availableWeight += weights.ft3;
    scoreSum += partial * weights.ft3;
  } else missing.push({ key: 'ft3', label: 'Free T3', weight: weights.ft3, core: true });

  if (ft3 && ft4 && ft4.canonicalValue > 0) {
    const partial = scoreConversionRatio(ft3.canonicalValue / ft4.canonicalValue);
    available.push({ ...ft4, key: 'ft3Ft4', label: 'FT3/FT4 conversion', partial, weight: weights.conversion, core: true });
    availableWeight += weights.conversion;
    scoreSum += partial * weights.conversion;
  } else {
    missing.push({ key: 'ft4', label: ft3 ? 'Free T4' : 'Free T3 + Free T4', weight: weights.conversion, core: true });
  }

  if (reverseT3) {
    const partial = scoreHighOnly(reverseT3.value, reverseT3.range?.max ?? 0.54, (reverseT3.range?.max ?? 0.54) * 2.4);
    available.push({ ...reverseT3, key: 'reverseT3', label: 'Reverse T3 brake context', partial, weight: weights.reverseT3 });
    availableWeight += weights.reverseT3;
    scoreSum += partial * weights.reverseT3;
  } else missing.push({ key: 'reverseT3', label: 'Reverse T3 brake context', weight: weights.reverseT3 });

  if (tpoAb) {
    const partial = scoreHighOnly(tpoAb.value, tpoAb.range?.max ?? 34, (tpoAb.range?.max ?? 34) * 5);
    available.push({ ...tpoAb, key: 'tpoAb', label: 'TPO antibody context', partial, weight: weights.tpoAb });
    availableWeight += weights.tpoAb;
    scoreSum += partial * weights.tpoAb;
  } else missing.push({ key: 'tpoAb', label: 'TPO antibody context', weight: weights.tpoAb });

  if (tgAb) {
    const partial = scoreHighOnly(tgAb.value, tgAb.range?.max ?? 115, (tgAb.range?.max ?? 115) * 4);
    available.push({ ...tgAb, key: 'tgAb', label: 'Thyroglobulin antibody context', partial, weight: weights.tgAb });
    availableWeight += weights.tgAb;
    scoreSum += partial * weights.tgAb;
  } else missing.push({ key: 'tgAb', label: 'Thyroglobulin antibody context', weight: weights.tgAb });

  const score = availableWeight > 0 && tsh && ft3 ? Math.round(scoreSum / availableWeight) : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  return applyScoreConfidence(applyScoreRecency({ ...def, score, tone: score == null ? null : resolveScoreTone(score), severity: resolveScoreSeverity(score), coverage, coverageLabel: resolveCoverageLabel(coverage), available, missing }));
}
