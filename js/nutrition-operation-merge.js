// @ts-check
// Scoped sync merge for long-running meal persistence operations.

import { mergeImportedData } from './data-merge.js';

const NUTRITION_TOMBSTONE_KEYS = ['_deleted', '_deletedAt', '_deletedClearedAt'];

function nutritionSyncSurface(importedData) {
  const surface = { nutritionMeals: importedData?.nutritionMeals };
  for (const key of NUTRITION_TOMBSTONE_KEYS) {
    const source = importedData?.[key];
    if (source && typeof source === 'object' && Object.hasOwn(source, 'nutritionMeals')) {
      surface[key] = { nutritionMeals: source.nutritionMeals };
    }
  }
  return surface;
}

export function mergeNutritionOperationSurface(active, committed, { mutate = false } = {}) {
  const merged = mergeImportedData(nutritionSyncSurface(active), nutritionSyncSurface(committed));
  const result = mutate ? active : { ...active };
  result.nutritionMeals = merged.nutritionMeals;
  for (const key of NUTRITION_TOMBSTONE_KEYS) {
    const from = merged[key];
    const current = result[key];
    if (from && typeof from === 'object' && Object.hasOwn(from, 'nutritionMeals')) {
      const value = from.nutritionMeals;
      result[key] = { ...(current && typeof current === 'object' ? current : {}), nutritionMeals: Array.isArray(value) ? [...value] : value && typeof value === 'object' ? { ...value } : value };
    } else if (current && typeof current === 'object' && Object.hasOwn(current, 'nutritionMeals')) {
      const remaining = { ...current };
      delete remaining.nutritionMeals;
      if (Object.keys(remaining).length) result[key] = remaining;
      else delete result[key];
    }
  }
  return result;
}
