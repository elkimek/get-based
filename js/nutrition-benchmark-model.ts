// Plain presentation snapshots. Provider selection, requests and storage stay in services.
import { MEAL_COMPARISON_REFERENCE_FIELDS } from './nutrition-comparison.js';
import { NUTRIENT_GROUPS } from './nutrition-nutrient-registry.js';
import type { listNutritionVisionModels } from './nutrition-ai-settings.js';

export function projectNutritionComparisonPicker(
  models: ReturnType<typeof listNutritionVisionModels>, selected: readonly string[],
  checkingLocal: boolean, query: unknown = '',
) {
  const defaults = new Set(selected);
  const providers = new Set(models.map(model => model.provider)).size;
  const label = `${providers} ${providers === 1 ? 'provider' : 'providers'} available`;
  return {
    query: String(query ?? ''), selectedCount: defaults.size,
    providerSummary: checkingLocal ? `${label} · checking Local AI…`
      : providers > 1 ? `${label} · cross-provider pair selected` : label,
    models: models.map(model => ({
      value: model.value, selected: defaults.has(model.value), current: model.current,
      searchText: `${model.providerDisplay} ${model.provider} ${model.modelDisplay} ${model.model}`,
      providerLabel: `${model.providerDisplay}${model.current ? ' · meal model' : model.providerCurrent ? ' · active model' : ''}`,
      label: model.modelDisplay, price: model.priceLabel,
    })),
  };
}
export type NutritionComparisonPickerView = ReturnType<typeof projectNutritionComparisonPicker>;

const referenceFields = MEAL_COMPARISON_REFERENCE_FIELDS.map(([key, label, unit, , step, group]) => ({
  key, label, unit, step: step || '0.1', group,
}));
export const nutritionBenchmarkReference = {
  primary: referenceFields.filter(field => field.group === 'amount' || field.group === 'core'),
  groups: NUTRIENT_GROUPS.filter(group => group.id !== 'core').map(group => ({
    label: group.label, fields: referenceFields.filter(field => field.group === group.id),
  })),
};
export type NutritionBenchmarkStatusView =
  | { kind: 'history'; label: string; savedLabel: string }
  | { kind: 'progress'; state: string; label: string; detail: string; percent: number | null };
export function projectNutritionComparisonProgress(completed: number, total: number, label: unknown, state: string): NutritionBenchmarkStatusView {
  return {
    kind: 'progress', state, label: String(label ?? ''),
    detail: state === 'running' ? `${completed} of ${total} finished`
      : state === 'success' ? `${total} model${total === 1 ? '' : 's'} finished`
      : state === 'partial' ? 'Retry or replace failed models below' : 'Stopped',
    percent: state === 'success' || state === 'partial' ? 100
      : Math.max(4, Math.min(96, Math.round(completed / Math.max(1, total) * 100))),
  };
}
