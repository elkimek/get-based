// @ts-check
// biology-score-mitothyroid.js — Thyroid–Mito Signal (experimental).

import {
  applyScoreRecency,
  clamp,
  getMarkerHit,
  lerp,
  resolveCoverageLabel,
  resolveScoreTone,
} from './biology-score-engine.js';

function mapMitoThyroidRawIndexToScore(rawIndex) {
  const lowMin = 0.7 * 0.7 * 0.45;
  const highMax = 1.3 * 1.35;
  if (rawIndex <= 0.75) return Math.round(clamp(lerp(rawIndex, lowMin, 0.75, 0, 49), 0, 49));
  if (rawIndex <= 0.85) return Math.round(clamp(lerp(rawIndex, 0.75, 0.85, 50, 69), 50, 69));
  if (rawIndex <= 1.15) return Math.round(clamp(lerp(rawIndex, 0.85, 1.15, 70, 100), 70, 100));
  if (rawIndex <= 1.25) return Math.round(clamp(lerp(rawIndex, 1.15, 1.25, 84, 70), 70, 84));
  return Math.round(clamp(lerp(clamp(rawIndex, 1.25, highMax), 1.25, highMax, 69, 50), 50, 69));
}

export function computeMitoThyroid(data, def) {
  const ft3 = getMarkerHit(data, 'thyroid.ft3');
  const tsh = getMarkerHit(data, 'thyroid.tsh');
  const tag = getMarkerHit(data, 'lipids.triglycerides');
  const available = [ft3, tsh, tag].filter(Boolean).map((hit) => ({ ...hit, partial: 100, weight: 1 }));
  const missing = [
    !ft3 ? { key: 'ft3', label: 'Free T3', weight: 1 } : null,
    !tsh ? { key: 'tsh', label: 'TSH', weight: 1 } : null,
    !tag ? { key: 'tag', label: 'Triglycerides', weight: 1 } : null,
  ].filter(Boolean);
  const coverage = available.length / 3;
  if (!ft3 || !tsh || !tag || tag.canonicalValue <= 0) {
    return applyScoreRecency({ ...def, score: null, tone: null, coverage, coverageLabel: resolveCoverageLabel(coverage), available, missing });
  }
  const ft3Factor = clamp(ft3.canonicalValue / 4.8, 0.7, 1.3);
  const tagFactor = clamp(Math.sqrt(0.7 / tag.canonicalValue), 0.7, 1.35);
  const tshPenalty = clamp(1 / (1 + Math.abs(tsh.canonicalValue - 1.5) / 1.2), 0.45, 1.0);
  const rawIndex = ft3Factor * tagFactor * tshPenalty;
  const score = mapMitoThyroidRawIndexToScore(rawIndex);
  return applyScoreRecency({ ...def, score, rawIndex, tone: resolveScoreTone(score), coverage, coverageLabel: resolveCoverageLabel(coverage), available, missing });
}
