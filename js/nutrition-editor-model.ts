// Editor presentation snapshots; live drafts and analysis remain controller-owned.
import { NUTRIENT_DEFINITIONS, NUTRIENT_GROUPS, nutrientFieldsForGroup } from './nutrition-nutrient-registry.js';
import type { getMealAISelection, listNutritionVisionModels } from './nutrition-ai-settings.js';
import type { NutritionEditorRenderOptions } from './nutrition-render.js';

const reviewFields = (fields: readonly typeof NUTRIENT_DEFINITIONS[number][]) => Object.freeze(fields.map(field => Object.freeze([
  field.key, field.label, field.unit, field.step,
] as const)));
export const ALL_REVIEW_FIELDS = reviewFields(NUTRIENT_DEFINITIONS);
export const MACRO_REVIEW_FIELDS = reviewFields(nutrientFieldsForGroup('core'));
export const DETAILED_REVIEW_GROUPS = Object.freeze(NUTRIENT_GROUPS.filter(group => group.id !== 'core').map(group => Object.freeze({
  ...group, fields: reviewFields(nutrientFieldsForGroup(group.id)),
})));
export const NUTRITION_PHOTO_PRIVACY = 'Sent only when you choose Analyze photo. Full-size originals are not saved; resized copies stay with the meal. First cloud use asks for approval.';

export function projectNutritionMealModel(selection: ReturnType<typeof getMealAISelection>, models: ReturnType<typeof listNutritionVisionModels>, checkingLocal: boolean, price: string, analysisKind: unknown = 'meal-photo') {
  const selectedValue = selection.usesAutomatic ? '' : JSON.stringify({ provider: selection.provider, model: selection.model });
  const choices = models.filter(model => model.provider === selection.provider);
  return {
    purpose: analysisKind === 'nutrition-label' ? 'Label model' : 'Photo model',
    accessibleLabel: analysisKind === 'nutrition-label' ? 'Nutrition label analysis model' : 'Meal photo analysis model',
    selectedValue, automatic: selection.usesAutomatic, available: selection.available,
    automaticLabel: `${selection.fallback ? 'Automatic fallback' : 'Follow chat assistant'} · ${selection.modelDisplay}`,
    savedChoice: selectedValue && !choices.some(model => model.value === selectedValue) ? `${selection.modelDisplay} · saved choice` : '',
    options: choices.map(model => ({ value: model.value, label: model.modelDisplay })),
    provider: selection.providerDisplay, price,
    status: selection.available ? selection.adapter === 'codex' ? 'Connected' : selection.local ? 'Local' : 'Ready'
      : selection.local && checkingLocal ? 'Checking…' : 'Unavailable',
  };
}
export type NutritionMealModelView = ReturnType<typeof projectNutritionMealModel>;
export function projectNutritionEditor(options: NutritionEditorRenderOptions, now: string, available: boolean, debug: boolean, model: NutritionMealModelView) {
  const { editingMealId = '', reusedMealId = '', returnTo = '', returnMealId = '', returnMealOrigin = 'history' } = options;
  return {
    title: editingMealId ? 'Edit meal' : reusedMealId ? 'Log this meal again' : 'Log a meal',
    subtitle: editingMealId ? 'Update the saved meal.' : reusedMealId ? 'Adjust the time or portions.' : 'Use a photo, scan a label, or enter values manually.',
    backAction: returnTo === 'history' ? 'return-history' : returnTo === 'detail' && returnMealId ? 'return-detail' : '',
    returnMealId: String(returnMealId), returnMealOrigin: String(returnMealOrigin),
    saveLabel: editingMealId ? 'Save changes' : 'Save meal', now, available, debug, model,
  };
}
export type NutritionEditorView = ReturnType<typeof projectNutritionEditor>;
export interface NutritionMealPhotoView { urls: readonly string[]; kind: 'stored' | 'selected' }
export interface NutritionProgressView {
  label: string; detail: string; percent: number | null; state: string;
  accessibleLabel: string; cancel?: boolean;
}
