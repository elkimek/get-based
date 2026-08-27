// @ts-check
// nutrition-food-data.js — reviewed nutrient and portion calculations.

import { NUTRITION_KEYS, normalizeNutritionTotals } from './nutrition-summary.js';

export const COMPONENT_NUTRIENT_KEYS = Object.freeze([
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG',
  'sugarG', 'saturatedFatG', 'sodiumMg',
]);

/** @param {any} value @returns {number | null} */
function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function roundedProfile(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** @param {any} nutrients @param {any} quantityG */
export function nutrientsPer100G(nutrients = {}, quantityG = null) {
  const grams = finiteNonNegative(quantityG);
  if (!grams) return {};
  const normalized = normalizeNutritionTotals(nutrients);
  // Keep extra precision in the hidden multiplier. Rounding the profile to the
  // same two decimals as visible totals causes values to drift after repeated
  // portion edits (for example 8 g at 300 g became 4.01 g at 150 g).
  return Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, roundedProfile((value * 100) / grams)]));
}

/** @param {any} per100g @param {any} quantityG */
export function nutrientsForGrams(per100g = {}, quantityG = null) {
  const grams = finiteNonNegative(quantityG);
  if (grams === null) return {};
  const normalized = normalizeNutritionTotals(per100g);
  return Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, rounded((value * grams) / 100)]));
}

/** @param {any} [component] @returns {any} */
export function normalizeNutritionComponent(component = {}) {
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

export function sumComponentNutrients(components = {}) {
  const rows = (Array.isArray(components) ? components : []).map(normalizeNutritionComponent);
  if (!rows.length) return { nutrients: {}, completeKeys: [] };
  const totals = {};
  const completeKeys = [];
  for (const key of NUTRITION_KEYS) {
    const values = rows.map(row => finiteNonNegative(row.nutrients?.[key]));
    if (values.every(value => value !== null)) {
      totals[key] = rounded(values.reduce((sum, value) => sum + Number(value), 0));
      completeKeys.push(key);
    }
  }
  return { nutrients: normalizeNutritionTotals(totals), completeKeys };
}

export function updateComponentQuantity(component, quantityG) {
  const normalized = normalizeNutritionComponent(component);
  const grams = finiteNonNegative(quantityG);
  return {
    ...normalized,
    quantityG: grams === null ? null : Math.round(grams * 10) / 10,
    nutrients: grams === null ? {} : nutrientsForGrams(normalized.nutrientsPer100g, grams),
    portionReviewed: true,
  };
}

export function recalculateMealFromComponents(components, previousTotals = {}, userEditedTotals = {}) {
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
