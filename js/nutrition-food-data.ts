// nutrition-food-data.js — reviewed nutrient and portion calculations.

import { NUTRITION_KEYS, normalizeNutritionTotals } from './nutrition-summary.js';

export const COMPONENT_NUTRIENT_KEYS = Object.freeze([
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG',
  'sugarG', 'saturatedFatG', 'sodiumMg',
]);

function finiteNonNegative(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function roundedProfile(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function nutrientsPer100G(nutrients: unknown = {}, quantityG: unknown = null) {
  const grams = finiteNonNegative(quantityG);
  if (!grams) return {};
  const normalized = normalizeNutritionTotals(nutrients);
  // Keep extra precision in the hidden multiplier. Rounding the profile to the
  // same two decimals as visible totals causes values to drift after repeated
  // portion edits (for example 8 g at 300 g became 4.01 g at 150 g).
  return Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, roundedProfile((value * 100) / grams)]));
}

export function nutrientsForGrams(per100g: unknown = {}, quantityG: unknown = null) {
  const grams = finiteNonNegative(quantityG);
  if (grams === null) return {};
  const normalized = normalizeNutritionTotals(per100g);
  return Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, rounded((value * grams) / 100)]));
}

interface NutritionComponentInput {
  [key: string]: unknown;
  name?: unknown;
  quantityG?: unknown;
  nutrients?: unknown;
  nutrientsPer100g?: unknown;
}

interface NormalizedNutritionComponent extends NutritionComponentInput {
  quantityG: number | null;
  nutrients: Record<string, number>;
  nutrientsPer100g: Record<string, number>;
}

type NormalizedNutritionFields = Pick<NormalizedNutritionComponent, 'quantityG' | 'nutrients' | 'nutrientsPer100g'>;

export function normalizeNutritionComponent<Input extends NutritionComponentInput>(component: Input): Omit<Input, keyof NormalizedNutritionFields> & NormalizedNutritionFields;
export function normalizeNutritionComponent(component?: NutritionComponentInput | null | undefined): NormalizedNutritionComponent;
export function normalizeNutritionComponent(component: NutritionComponentInput | null | undefined = {}): NormalizedNutritionComponent {
  const quantity = finiteNonNegative(component?.quantityG);
  const nutrients = normalizeNutritionTotals(component?.nutrients || {});
  const suppliedPer100g = normalizeNutritionTotals(component?.nutrientsPer100g || {});
  const per100g = Object.keys(suppliedPer100g).length ? suppliedPer100g : nutrientsPer100G(nutrients, quantity);
  return {
    ...component,
    quantityG: quantity === null ? null : Math.round(quantity * 10) / 10,
    nutrients,
    nutrientsPer100g: per100g,
  };
}

export function sumComponentNutrients(components: unknown = {}) {
  const rows = (Array.isArray(components) ? components as Array<NutritionComponentInput | null | undefined> : []).map(normalizeNutritionComponent);
  if (!rows.length) return { nutrients: {}, completeKeys: [] };
  const totals: Record<string, number> = {};
  const completeKeys: string[] = [];
  for (const key of NUTRITION_KEYS) {
    const values = rows.map(row => finiteNonNegative(row.nutrients?.[key]));
    if (values.every(value => value !== null)) {
      totals[key] = rounded(values.reduce<number>((sum, value) => sum + Number(value), 0));
      completeKeys.push(key);
    }
  }
  return { nutrients: normalizeNutritionTotals(totals), completeKeys };
}

export function updateComponentQuantity(component: NutritionComponentInput | null | undefined, quantityG: unknown) {
  const normalized = normalizeNutritionComponent(component);
  const grams = finiteNonNegative(quantityG);
  return {
    ...normalized,
    quantityG: grams === null ? null : Math.round(grams * 10) / 10,
    nutrients: grams === null ? {} : nutrientsForGrams(normalized.nutrientsPer100g, grams),
    portionReviewed: true,
  };
}

export function recalculateMealFromComponents(components: unknown, previousTotals: unknown = {}, userEditedTotals: unknown = {}) {
  const { nutrients, completeKeys } = sumComponentNutrients(components);
  const explicit = normalizeNutritionTotals(userEditedTotals);
  const next = { ...nutrients, ...explicit };
  return {
    nutrients: next,
    recalculatedKeys: completeKeys,
    removedEstimatedKeys: Object.keys(normalizeNutritionTotals(previousTotals))
      .filter(key => !Object.hasOwn(next, key)),
  };
}
