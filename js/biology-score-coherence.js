// @ts-check
// biology-score-coherence.js — Biological Coherence aggregator.

import { applyScoreConfidence, applyScoreRecency, resolveCoverageLabel, resolveScoreTone } from './biology-score-engine.js';
import { BIOLOGY_SCORE_VERSION } from './biology-score-contract.js';

const COHERENCE_DOMAIN_LABELS = {
  metabolic: 'Metabolic health',
  endocrine: 'Thyroid hormones',
  cardiovascular: 'Cardiovascular risk',
  inflammation: 'Inflammation',
  blood: 'Iron and blood health',
  methylation: 'Methylation',
  kidney: 'Kidney and filtration',
  liver: 'Liver and bile flow',
  mineral: 'Bone and mineral balance',
  immune: 'Immune balance',
  recovery: 'Recovery context',
  hormones: 'Hormone axis',
};

// Domain budgets; per-score coherenceWeight only divides a shared domain (iron/blood).
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
  const collectionInputs = [];
  let totalDomainWeight = 0;
  let availableDomainWeight = 0;
  let scoreSum = 0;
  for (const [domain, items] of domainBuckets.entries()) {
    const domainWeight = COHERENCE_DOMAIN_WEIGHTS[/** @type {keyof typeof COHERENCE_DOMAIN_WEIGHTS} */ (domain)] || 1;
    const label = COHERENCE_DOMAIN_LABELS[/** @type {keyof typeof COHERENCE_DOMAIN_LABELS} */ (domain)] || domain;
    totalDomainWeight += domainWeight;
    const live = items.filter(({ score }) => Number.isFinite(score.score));
    if (!live.length) {
      const source = items[0].score;
      const historical = items.some(({ score }) => Number.isFinite(score.rawScore) && ['stale', 'mixed-dates'].includes(score.recencyStatus));
      missing.push({ key: domain, label, weight: domainWeight, core: true,
        primaryScoreId: source.id,
        unavailableReason: historical ? 'Older results' : 'Needs inputs',
      });
      continue;
    }
    collectionInputs.push(...live.flatMap(i => i.score.available.filter(marker => marker.core && !marker.profileContextOnly)));
    const liveWeight = live.reduce((sum, item) => sum + item.weight, 0) || 1;
    const domainScore = Math.round(live.reduce((sum, item) => sum + item.score.score * item.weight, 0) / liveWeight);
    const domainCoverage = live.reduce((sum, item) => sum + (item.score.coverage || 0) * item.weight, 0) / items.reduce((sum, item) => sum + item.weight, 0);
    const weakest = live.slice().sort((a, b) => a.score.score - b.score.score)[0];
    const effectiveDomainWeight = domainWeight;
    availableDomainWeight += effectiveDomainWeight;
    scoreSum += domainScore * effectiveDomainWeight;
    available.push({
      key: domain,
      label,
      displayValue: `${domainScore}/100`,
      unit: '',
      date: live.flatMap(i => i.score.available.filter(marker => marker.core && !marker.profileContextOnly).map(marker => marker.date)).filter(Boolean).sort().at(-1) || '',
      core: true,
      contextLimited: live.some(i => i.score.scoreConfidence !== 'high' || i.score.attention),
      partial: domainScore,
      weight: domainWeight,
      effectiveWeight: effectiveDomainWeight,
      id: '',
      domainCoverage,
      primaryScoreId: weakest?.score.id || live[0]?.score.id || '',
      contributorIds: live.map(item => item.score.id),
    });
  }

  let score = availableDomainWeight > 0 ? Math.round(scoreSum / availableDomainWeight) : null;
  const coverage = totalDomainWeight > 0 ? available.reduce((n, i) => n + i.weight * i.domainCoverage, 0) / totalDomainWeight : 0;
  // Minimum breadth is a product rule, separate from biological certainty.
  const anchorWarning = available.length < 3 || coverage < 0.25 ? 'An overview needs at least 3 domains and 25% core coverage. Your available domain results are shown below.' : '';
  if (anchorWarning) score = null;
  const extendedTotal = scoreDefinitions.filter(scoreDef => scoreDef.id !== def.id && scoreDef.panelTier === 'extended').length;
  const flags = [
    'Built from minimum-panel Biology Score domains; extended-only scores improve depth but do not punish the baseline.',
    `${available.length}/${available.length + missing.length} minimum domains live.`,
  ];
  if (extendedTotal) flags.push(`${extendedTotal} extended-only score${extendedTotal === 1 ? '' : 's'} are outside the baseline coherence denominator.`);
  return applyScoreConfidence(applyScoreRecency({
    contextLimited: componentScores.some(i => i.scoreConfidence !== 'high' || i.attention),
    attention: componentScores.find(i => i.attention)?.attention || '',
    ...def,
    algorithmVersion: BIOLOGY_SCORE_VERSION,
    methodology: 'Weighted range agreement across available baseline domains. Domains share markers, so this is an overview rather than independent confirmation of overall health.',
    score, anchorWarning,
    tone: score == null ? null : score >= 70 && (coverage < 1 || componentScores.some(i => i.attention)) ? 'strained' : resolveScoreTone(score),
    coverage,
    coverageLabel: resolveCoverageLabel(coverage),
    presentationDates: [...new Set(collectionInputs.map(i => i.date))].sort(),
    available,
    missing,
    flags: [...flags, ...componentScores.filter(i => i.attention || i.scoreConfidence !== 'high').map(i => `${i.title}: ${i.attention || i.scoreConfidenceWarning || i.recencyMessage}`)],
  }, collectionInputs));
}
