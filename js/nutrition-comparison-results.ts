// Stable DOM adapter for authored benchmark results; execution stays in the controller.
import { renderHTML as renderComparisonResults } from './components/NutritionComparisonResults.svelte.html.js';
import { projectNutritionComparisonResults } from './nutrition-comparison-results-model.js';
import type { NutritionComparisonResultsOptions } from './nutrition-comparison-results-model.js';
export { comparisonTotalWeight } from './nutrition-comparison-results-model.js';
export type { ComparisonComponentView, ComparisonAnalysisView, ComparisonResultView, ComparisonRunView, ComparisonReferenceView, NutritionComparisonResultsOptions } from './nutrition-comparison-results-model.js';

export function renderNutritionComparisonResults(options: NutritionComparisonResultsOptions = {}) {
  const area = document.getElementById('nutrition-comparison-results');
  if (!area) return;
  const view = projectNutritionComparisonResults(options);
  area.innerHTML = renderComparisonResults({ view });
  if (view.cards.length) area.dataset.resultCount = String(view.cards.length);
  else area.removeAttribute('data-result-count');
  const button = document.querySelector<HTMLButtonElement>('[data-nutrition-action="toggle-comparison-presentation"]');
  if (button) button.hidden = !view.cards.length;
}

function setComparisonPresentation(active: unknown) {
  const workspace = document.getElementById('nutrition-model-comparison');
  const modal = document.getElementById('detail-modal');
  const enabled = Boolean(active && workspace && !workspace.hidden);
  workspace?.classList.toggle('is-presentation', enabled);
  modal?.classList.toggle('nutrition-comparison-presentation', enabled);
  document.body?.classList.toggle('nutrition-comparison-presenting', enabled);
  const button = document.querySelector('[data-nutrition-action="toggle-comparison-presentation"]') as HTMLButtonElement | null;
  if (button) {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Exit full-screen comparison' : 'Open full-screen comparison');
    button.title = enabled ? 'Exit full-screen comparison' : 'Open full-screen comparison';
    const label = button.querySelector('[data-nutrition-presentation-label]');
    if (label) label.textContent = enabled ? 'Exit full screen' : 'Full screen';
  }
  if (enabled) workspace?.scrollTo({ top: 0 });
  return enabled;
}

export function toggleComparisonPresentation() {
  const workspace = document.getElementById('nutrition-model-comparison');
  if (!workspace || workspace.hidden) return false;
  return setComparisonPresentation(!workspace.classList.contains('is-presentation'));
}

export function exitComparisonPresentation() {
  const workspace = document.getElementById('nutrition-model-comparison');
  const modal = document.getElementById('detail-modal');
  const wasActive = workspace?.classList.contains('is-presentation')
    || modal?.classList.contains('nutrition-comparison-presentation')
    || document.body?.classList.contains('nutrition-comparison-presenting');
  if (!wasActive) return false;
  setComparisonPresentation(false);
  return true;
}
