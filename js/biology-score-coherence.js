// @ts-check
// biology-score-coherence.js — Biological Coherence aggregator.

import { applyScoreConfidence, resolveCoverageLabel, resolveScoreTone } from './biology-score-engine.js';

const COHERENCE_DOMAIN_LABELS = {
  metabolic: 'Metabolic health',
  endocrine: 'Thyroid hormones',
  cardiovascular: 'Cardiovascular risk',
  inflammation: 'Inflammation',
  blood: 'Iron and blood health',
  methylation: 'Methylation',
  kidney: 'Kidney and hydration',
  liver: 'Liver and bile flow',
  mineral: 'Bone and mineral balance',
  immune: 'Immune balance',
  recovery: 'Recovery capacity',
  hormones: 'Hormone axis',
};

const COHERENCE_DOMAIN_WEIGHTS = {
  metabolic: 1.25,
  endocrine: 1.0,
  cardiovascular: 1.1,
  inflammation: 1.05,
  blood: 1.05,
  methylation: 0.85,
  kidney: 0.9,
  liver: 0.9,
  mineral: 0.85,
  immune: 0.9,
  recovery: 0.8,
  hormones: 0.95,
};

/**
 * @param {any} data
 * @param {any} def
 * @param {any[]} scoreDefinitions
 * @param {(data: any, defs: any[]) => any[]} computeComponents
 */
export function computeBiologicalCoherence(data, def, scoreDefinitions, computeComponents) {
  const componentDefs = scoreDefinitions.filter((scoreDef) =>
    scoreDef.id !== def.id && scoreDef.panelTier !== 'extended'
  );
  const componentScores = computeComponents(data, componentDefs);
  const domainBuckets = new Map();
  for (const score of componentScores) {
    const domain = score.coherenceDomain || 'metabolic';
    const weight = score.coherenceWeight || 1;
    if (!domainBuckets.has(domain)) domainBuckets.set(domain, []);
    domainBuckets.get(domain).push({ score, weight });
  }

  const available = [];
  const missing = [];
  let totalDomainWeight = 0;
  let availableDomainWeight = 0;
  let scoreSum = 0;
  for (const [domain, items] of domainBuckets.entries()) {
    const domainWeight = COHERENCE_DOMAIN_WEIGHTS[/** @type {keyof typeof COHERENCE_DOMAIN_WEIGHTS} */ (domain)] || 1;
    const label = COHERENCE_DOMAIN_LABELS[/** @type {keyof typeof COHERENCE_DOMAIN_LABELS} */ (domain)] || domain;
    totalDomainWeight += domainWeight;
    const live = items.filter(({ score }) => Number.isFinite(score.score));
    if (!live.length) {
      missing.push({ key: domain, label, weight: domainWeight });
      continue;
    }
    const liveWeight = live.reduce((sum, item) => sum + item.weight, 0) || 1;
    const domainScore = Math.round(live.reduce((sum, item) => sum + item.score.score * item.weight, 0) / liveWeight);
    const domainCoverage = live.reduce((sum, item) => sum + (item.score.coverage || 0) * item.weight, 0) / liveWeight;
    const weakest = live.slice().sort((a, b) => a.score.score - b.score.score)[0];
    const effectiveDomainWeight = domainWeight * Math.max(0.25, Math.min(1, domainCoverage || 0));
    availableDomainWeight += effectiveDomainWeight;
    scoreSum += domainScore * effectiveDomainWeight;
    available.push({
      key: domain,
      label,
      displayValue: `${domainScore}/100`,
      unit: '',
      date: '—',
      partial: domainScore,
      weight: domainWeight,
      effectiveWeight: effectiveDomainWeight,
      id: '',
      domainCoverage,
      primaryScoreId: weakest?.score.id || live[0]?.score.id || '',
    });
  }

  const score = availableDomainWeight > 0 ? Math.round(scoreSum / availableDomainWeight) : null;
  const coverage = totalDomainWeight > 0 ? availableDomainWeight / totalDomainWeight : 0;
  const extendedTotal = scoreDefinitions.filter(scoreDef => scoreDef.id !== def.id && scoreDef.panelTier === 'extended').length;
  const flags = [
    'Built from minimum-panel Biology Score domains; extended-only scores improve depth but do not punish the baseline.',
    `${available.length}/${available.length + missing.length} minimum domains live.`,
  ];
  if (extendedTotal) flags.push(`${extendedTotal} extended-only score${extendedTotal === 1 ? '' : 's'} are outside the baseline coherence denominator.`);
  return applyScoreConfidence({
    ...def,
    score,
    tone: score == null ? null : resolveScoreTone(score),
    coverage,
    coverageLabel: resolveCoverageLabel(coverage),
    available,
    missing,
    flags,
    recencyStatus: 'fresh',
    recencyBadge: 'Domain snapshot',
  });
}
