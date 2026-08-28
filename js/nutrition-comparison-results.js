// @ts-check
// Rendering for meal benchmark results, kept separate from execution state.

import { nutritionUsageSummary } from './nutrition-analysis.js';
import { rankMealComparisonRuns } from './nutrition-comparison.js';
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { actionAttrs, formatNumber, hasFiniteNumber } from './nutrition-render.js';
import { escapeAttr, escapeHTML } from './utils.js';

function comparisonTotalWeight(analysis) {
  const quantities = (analysis?.components || []).map(item => Number(item?.quantityG)).filter(Number.isFinite);
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null;
}

function relativeDifference(value, reference) {
  if (!hasFiniteNumber(value) || !hasFiniteNumber(reference)) return null;
  const numericValue = Number(value);
  const numericReference = Number(reference);
  if (numericReference === 0) return numericValue === 0 ? 0 : null;
  return (numericValue - numericReference) / Math.abs(numericReference) * 100;
}

const PRIMARY_COMPARISON_NUTRIENTS = new Set(['energyKcal', 'proteinG', 'carbohydrateG', 'fatG']);
const DETAILED_COMPARISON_FIELDS = NUTRIENT_DEFINITIONS.filter(field => !PRIMARY_COMPARISON_NUTRIENTS.has(field.key));
const NUTRIENT_DEFINITION_BY_KEY = new Map(NUTRIENT_DEFINITIONS.map(field => [field.key, field]));

function nutrientFractionDigits(step) {
  const match = String(step || '').match(/\.(\d+)/);
  return match ? Math.min(2, match[1].length) : 0;
}

function comparisonDifference(value, reference, isReference = false) {
  if (isReference && hasFiniteNumber(value)) return { label: 'Reference', tone: ' is-reference' };
  const difference = relativeDifference(value, reference);
  if (difference === null) return { label: '—', tone: '' };
  if (Math.abs(difference) < 0.05) return { label: 'Same', tone: ' is-close' };
  return {
    label: `${difference > 0 ? '+' : '−'}${formatNumber(Math.abs(difference), 1)}%`,
    tone: Math.abs(difference) <= 10 ? ' is-close' : Math.abs(difference) >= 30 ? ' is-far' : '',
  };
}

function nutrientValue(value, field) {
  return hasFiniteNumber(value)
    ? `${formatNumber(value, nutrientFractionDigits(field.step))} ${escapeHTML(field.unit)}`
    : '—';
}

function renderDetailedNutrientComparison(analysis, reference, isReference, referenceRun) {
  const rows = DETAILED_COMPARISON_FIELDS.flatMap(field => {
    const predicted = analysis?.nutrients?.[field.key];
    const expected = reference?.[field.key];
    if (!hasFiniteNumber(predicted) && !hasFiniteNumber(expected)) return [];
    const difference = comparisonDifference(predicted, expected, isReference);
    return [`<tr><th scope="row">${escapeHTML(field.label)}</th><td>${nutrientValue(predicted, field)}</td><td>${nutrientValue(expected, field)}</td><td class="nutrition-comparison-difference${difference.tone}">${escapeHTML(difference.label)}</td></tr>`];
  });
  if (!rows.length) return '';
  const returnedCount = DETAILED_COMPARISON_FIELDS.filter(field => hasFiniteNumber(analysis?.nutrients?.[field.key])).length;
  const comparedCount = DETAILED_COMPARISON_FIELDS.filter(field => hasFiniteNumber(reference?.[field.key])).length;
  const countLabel = `${returnedCount} returned${comparedCount ? ` · ${comparedCount} compared` : ''}`;
  return `<details class="nutrition-comparison-detailed"><summary>Detailed nutrition <span>${escapeHTML(countLabel)}</span></summary><div class="nutrition-comparison-error-table-wrap" role="region" aria-label="Detailed nutrient comparison table" tabindex="0"><table><thead><tr><th scope="col">Nutrient</th><th scope="col">Estimate</th><th scope="col">${referenceRun ? 'Baseline' : 'Known value'}</th><th scope="col">Difference</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

function renderComparisonMetric(label, value, unit, digits = 0, reference = null, isReference = false) {
  const difference = relativeDifference(value, reference);
  const relative = isReference && hasFiniteNumber(value)
    ? '<small class="is-reference">Reference</small>'
    : difference === null
      ? ''
      : Math.abs(difference) < 0.05
        ? '<small class="is-close">Same</small>'
        : `<small class="${Math.abs(difference) <= 10 ? 'is-close' : Math.abs(difference) >= 30 ? 'is-far' : ''}">${difference > 0 ? '+' : '−'}${formatNumber(Math.abs(difference), 1)}%</small>`;
  return `<div><span>${escapeHTML(label)}</span><strong>${hasFiniteNumber(value) ? `${formatNumber(value, digits)} ${escapeHTML(unit)}` : '—'}</strong>${relative}</div>`;
}

function renderReferenceDifference(metric) {
  const difference = metric.predicted == null ? null : relativeDifference(metric.predicted, metric.expected);
  const differenceLabel = difference == null
    ? 'Missing estimate'
    : Math.abs(difference) < 0.05
      ? 'Same'
      : `${difference > 0 ? '+' : '−'}${formatNumber(Math.abs(difference), 1)}%`;
  const differenceTone = difference == null
    ? ' is-missing'
    : Math.abs(difference) <= 10
      ? ' is-close'
      : Math.abs(difference) >= 30
        ? ' is-far'
        : '';
  const definition = NUTRIENT_DEFINITION_BY_KEY.get(metric.key);
  const digits = definition ? nutrientFractionDigits(definition.step) : 0;
  return `<tr><th scope="row">${escapeHTML(metric.label)}</th><td>${metric.predicted == null ? 'Missing' : `${formatNumber(metric.predicted, digits)} ${escapeHTML(metric.unit)}`}</td><td>${formatNumber(metric.expected, digits)} ${escapeHTML(metric.unit)}</td><td class="nutrition-comparison-difference${differenceTone}">${escapeHTML(differenceLabel)}</td></tr>`;
}

function renderRemoveComparisonButton(run) {
  return `<button type="button" class="nutrition-text-btn nutrition-comparison-remove-btn" aria-label="Remove ${escapeAttr(run.modelLabel)} result" ${actionAttrs('remove-comparison-run', { index: run.originalIndex })}>Remove</button>`;
}

export function renderNutritionComparisonResults({ runs = [], reference = /** @type {any} */ ({}), referenceRun = null, referenceRunIndex = null, isRestored = false } = {}) {
  const area = document.getElementById('nutrition-comparison-results');
  if (!area) return;
  const presentationButton = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-nutrition-action="toggle-comparison-presentation"]'));
  if (!runs.length) {
    area.innerHTML = '';
    area.removeAttribute('data-result-count');
    if (presentationButton) presentationButton.hidden = true;
    return;
  }
  const ranked = rankMealComparisonRuns(runs, reference, { excludedIndex: referenceRunIndex });
  area.dataset.resultCount = String(ranked.length);
  if (presentationButton) presentationButton.hidden = false;
  const hasManualReference = !referenceRun && ranked.some(run => run.evaluation?.hasReference);
  const referenceBanner = referenceRun
    ? `<div class="nutrition-comparison-reference-banner"><span>Comparing against <strong>${escapeHTML(referenceRun.modelLabel)}</strong>. A model baseline is not ground truth.</span><button type="button" class="nutrition-text-btn" ${actionAttrs('clear-comparison-reference')}>Use known values</button></div>`
    : hasManualReference
      ? '<div class="nutrition-comparison-reference-banner is-manual"><span><strong>Known values active.</strong> Ranking depends on the values entered.</span></div>'
      : '<div class="nutrition-comparison-reference-banner is-empty"><span>Add known values above to rank results.</span></div>';
  area.innerHTML = referenceBanner + ranked.map(run => {
    if (run.status === 'running') {
      return `<article class="nutrition-comparison-card is-running"><div class="nutrition-comparison-card-head"><div><span>${escapeHTML(run.providerLabel)}</span><strong>${escapeHTML(run.modelLabel)}</strong></div><span class="nutrition-comparison-state">Running…</span></div><div class="nutrition-comparison-skeleton" aria-hidden="true"></div><div class="nutrition-comparison-card-actions"><button type="button" class="nutrition-text-btn nutrition-comparison-cancel-btn" aria-label="Cancel ${escapeAttr(run.modelLabel)} analysis" ${actionAttrs('cancel-comparison-run', { index: run.originalIndex })}>Cancel this model</button></div></article>`;
    }
    if (!run.result) {
      const cancelled = run.status === 'cancelled';
      const retry = isRestored
        ? '<span>Choose a photo and run a new comparison to retry.</span>'
        : `<button type="button" class="import-btn import-btn-secondary" ${actionAttrs('retry-comparison', { index: run.originalIndex })}>Retry this model</button>`;
      const replace = isRestored
        ? renderRemoveComparisonButton(run)
        : `<button type="button" class="nutrition-text-btn nutrition-comparison-replace-btn" ${actionAttrs('replace-comparison-run', { index: run.originalIndex })}>Replace model</button>`;
      return `<article class="nutrition-comparison-card ${cancelled ? 'is-cancelled' : 'is-error'}"><div class="nutrition-comparison-card-head"><div><span>${escapeHTML(run.providerLabel)}</span><strong>${escapeHTML(run.modelLabel)}</strong></div><span class="nutrition-comparison-state">${cancelled ? 'Canceled' : 'Could not finish'}</span></div>${cancelled ? '' : '<div class="nutrition-comparison-usage is-unavailable"><strong>Cost unknown</strong><span>The provider returned no token count. This request may still be billable.</span></div>'}<p>${escapeHTML(run.error || (cancelled ? 'Canceled by user.' : 'No usable estimate returned.'))}</p><div class="nutrition-comparison-card-actions">${replace}${retry}</div></article>`;
    }
    const analysis = run.result.analysis;
    const isReference = run.originalIndex === referenceRunIndex;
    const score = run.evaluation?.score;
    const usage = nutritionUsageSummary(run.result.source);
    const usageLine = usage
      ? `<div class="nutrition-comparison-usage"><strong>${escapeHTML(usage.costLabel)}</strong><span>${usage.totalTokens.toLocaleString()} tokens · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out</span></div>`
      : '<div class="nutrition-comparison-usage is-unavailable"><strong>Cost unknown</strong><span>This provider did not return token counts; do not assume the request was free.</span></div>';
    const components = Array.isArray(analysis.components) ? analysis.components : [];
    const ingredients = components.slice(0, 6).map(item => `${item.name}${hasFiniteNumber(item.quantityG) ? ` · ${formatNumber(item.quantityG, 0)} g` : ''}`);
    const ingredientCount = components.length > ingredients.length
      ? `${ingredients.length} of ${components.length} shown`
      : `${ingredients.length} returned`;
    const ingredientPanel = `<section class="nutrition-comparison-ingredient-panel" aria-label="Ingredients returned"><div class="nutrition-comparison-ingredient-head"><strong>Ingredients</strong><span>${escapeHTML(ingredientCount)}</span></div>${ingredients.length ? `<div class="nutrition-comparison-ingredients">${ingredients.map(item => `<span title="${escapeAttr(item)}">${escapeHTML(item)}</span>`).join('')}</div>` : '<p class="nutrition-comparison-ingredient-empty">No ingredients returned.</p>'}</section>`;
    const ranking = isReference
      ? '<div class="nutrition-comparison-score is-reference"><strong>Baseline</strong><span>Selected model</span></div>'
      : score == null
      ? '<div class="nutrition-comparison-score is-unscored"><strong>Not ranked</strong><span>Add known values</span></div>'
      : `<div class="nutrition-comparison-score${run.rank === 1 ? ' is-best' : ''}"><strong>${formatNumber(score, 1)}</strong><span>${referenceRun ? 'Baseline agreement' : 'Known-value agreement'} / 100</span><small>${run.rank === 1 ? `Closest to ${referenceRun ? 'baseline' : 'known values'}` : `Rank #${run.rank}`}</small></div>`;
    const referenceMetrics = {
      totalWeightG: reference.totalWeightG,
      energyKcal: reference.energyKcal,
      proteinG: reference.proteinG,
      carbohydrateG: reference.carbohydrateG,
      fatG: reference.fatG,
    };
    const scoredValueCount = run.evaluation?.metrics?.length || 0;
    const breakdown = score == null ? '' : `<details class="nutrition-comparison-breakdown"><summary>Score breakdown</summary><div><span>Nutrition + amount <strong>${formatNumber(run.evaluation?.numericScore, 1)}/100</strong> · ${scoredValueCount} value${scoredValueCount === 1 ? '' : 's'}</span><span>Ingredients <strong>${formatNumber(run.evaluation?.identityScore, 1)}/100</strong></span></div></details>`;
    const modelChecks = [...new Set([...(analysis.warnings || []), ...(analysis.assumptions || [])])].slice(0, 8);
    const detailedNutrition = renderDetailedNutrientComparison(analysis, reference, isReference, referenceRun);
    return `<article class="nutrition-comparison-card${run.rank === 1 && !isReference ? ' is-best' : ''}"><div class="nutrition-comparison-card-head"><div><span>${escapeHTML(run.providerLabel)} · ${formatNumber(run.durationMs / 1000, 1)}s</span><strong>${escapeHTML(run.modelLabel)}</strong></div>${ranking}</div>
      ${usageLine}
      <div class="nutrition-comparison-identity"><strong>${escapeHTML(analysis.mealName || 'Meal')}</strong></div>
      ${breakdown}
      <div class="nutrition-comparison-metrics">${renderComparisonMetric('Amount', comparisonTotalWeight(analysis), 'g', 0, referenceMetrics.totalWeightG, isReference)}${renderComparisonMetric('Energy', analysis.nutrients?.energyKcal, 'kcal', 0, referenceMetrics.energyKcal, isReference)}${renderComparisonMetric('Protein', analysis.nutrients?.proteinG, 'g', 1, referenceMetrics.proteinG, isReference)}${renderComparisonMetric('Carbs', analysis.nutrients?.carbohydrateG, 'g', 1, referenceMetrics.carbohydrateG, isReference)}${renderComparisonMetric('Fat', analysis.nutrients?.fatG, 'g', 1, referenceMetrics.fatG, isReference)}</div>
      ${detailedNutrition}
      ${ingredientPanel}
      ${modelChecks.length ? `<details class="nutrition-comparison-checks"><summary>Model checks and assumptions (${modelChecks.length})</summary><ul>${modelChecks.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></details>` : ''}
      ${run.evaluation?.metrics?.length ? `<details class="nutrition-comparison-errors"><summary>${referenceRun ? 'Baseline' : 'Known-value'} differences (${run.evaluation.metrics.length})</summary><div class="nutrition-comparison-error-table-wrap" role="region" aria-label="Comparison differences table" tabindex="0"><table><thead><tr><th scope="col">Metric</th><th scope="col">Estimate</th><th scope="col">${referenceRun ? 'Baseline' : 'Known value'}</th><th scope="col">Difference</th></tr></thead><tbody>${run.evaluation.metrics.map(renderReferenceDifference).join('')}</tbody></table></div></details>` : ''}
      <div class="nutrition-comparison-card-actions">${renderRemoveComparisonButton(run)}${isReference ? '<span>Model baseline</span>' : `<button type="button" class="nutrition-text-btn" ${actionAttrs('set-comparison-reference', { index: run.originalIndex })}>Use as baseline</button>`}<button type="button" class="import-btn import-btn-secondary" ${actionAttrs('use-comparison', { index: run.originalIndex })}>Use this estimate</button></div>
    </article>`;
  }).join('');
}
