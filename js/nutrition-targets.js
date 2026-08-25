// @ts-check
// nutrition-targets.js — profile-scoped nutrition goals and weight-aware protein math.

import { state } from './state.js';
import { weightToKilograms } from './wearables-formatters.js';

export const NUTRITION_WIDGET_NUTRIENTS = Object.freeze([
  'proteinG', 'carbohydrateG', 'fatG', 'fiberG',
  'fluidMl', 'plainWaterMl',
  'sugarG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'magnesiumMg', 'ironMg',
]);

export const DEFAULT_NUTRITION_WIDGET_NUTRIENTS = Object.freeze([
  'proteinG', 'fatG', 'fiberG', 'fluidMl',
]);

export const DEFAULT_NUTRITION_TARGETS = Object.freeze({
  configured: false,
  energyKcal: 2000,
  proteinBasis: 'general',
  proteinGPerKg: 0.83,
  proteinFixedG: 75,
  carbohydrateG: 250,
  fatG: 67,
  fiberG: 25,
  fluidMl: 2000,
  sugarG: 50,
  sodiumMg: 2000,
  widgetNutrients: DEFAULT_NUTRITION_WIDGET_NUTRIENTS,
});

const PROTEIN_FACTORS = Object.freeze({
  general: 0.83,
  active: 1.6,
  high: 2,
});

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function normalizedWidgetNutrients(value) {
  if (!Array.isArray(value)) return [...DEFAULT_NUTRITION_WIDGET_NUTRIENTS];
  const allowed = new Set(NUTRITION_WIDGET_NUTRIENTS);
  return [...new Set(value.map(String).filter(id => allowed.has(id)))].slice(0, 4);
}

export function normalizeNutritionTargets(value = {}) {
  const basis = ['general', 'active', 'high', 'custom', 'fixed'].includes(String(value?.proteinBasis))
    ? String(value.proteinBasis)
    : DEFAULT_NUTRITION_TARGETS.proteinBasis;
  return {
    configured: value?.configured === true,
    energyKcal: boundedNumber(value?.energyKcal, DEFAULT_NUTRITION_TARGETS.energyKcal, 500, 10000),
    proteinBasis: basis,
    proteinGPerKg: boundedNumber(value?.proteinGPerKg, DEFAULT_NUTRITION_TARGETS.proteinGPerKg, 0.4, 3.5),
    proteinFixedG: boundedNumber(value?.proteinFixedG, DEFAULT_NUTRITION_TARGETS.proteinFixedG, 10, 500),
    carbohydrateG: boundedNumber(value?.carbohydrateG, DEFAULT_NUTRITION_TARGETS.carbohydrateG, 0, 1500),
    fatG: boundedNumber(value?.fatG, DEFAULT_NUTRITION_TARGETS.fatG, 0, 500),
    fiberG: boundedNumber(value?.fiberG, DEFAULT_NUTRITION_TARGETS.fiberG, 0, 150),
    fluidMl: boundedNumber(value?.fluidMl, DEFAULT_NUTRITION_TARGETS.fluidMl, 0, 10000),
    sugarG: boundedNumber(value?.sugarG, DEFAULT_NUTRITION_TARGETS.sugarG, 0, 500),
    sodiumMg: boundedNumber(value?.sodiumMg, DEFAULT_NUTRITION_TARGETS.sodiumMg, 0, 10000),
    widgetNutrients: normalizedWidgetNutrients(value?.widgetNutrients),
  };
}

export function getNutritionTargets(profileData = state.importedData) {
  return normalizeNutritionTargets(profileData?.nutritionTargets || {});
}

function readableSource(value) {
  const source = String(value || '').trim();
  if (!source) return 'body measurement';
  if (source === 'manual') return 'manual measurement';
  return source.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function resolveNutritionWeight(profileData = state.importedData) {
  const metric = profileData?.wearableSummary?.metrics?.weight;
  const wearableValue = Number(metric?.latest);
  if (Number.isFinite(wearableValue) && wearableValue > 0) {
    return {
      kg: wearableValue,
      source: readableSource(metric?.primarySource),
      date: String(metric?.latestDate || ''),
      kind: 'wearable-summary',
    };
  }

  const rows = Array.isArray(profileData?.biometrics?.weight) ? profileData.biometrics.weight : [];
  const latest = [...rows].filter(row => Number.isFinite(Number(row?.value)) && Number(row.value) > 0)
    .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))[0];
  if (!latest) return null;
  return {
    kg: weightToKilograms(Number(latest.value), latest.unit || 'kg'),
    source: readableSource(latest.source || 'manual'),
    date: String(latest.date || ''),
    kind: 'legacy-biometric',
  };
}

export function resolveNutritionTargets(profileData = state.importedData) {
  const targets = getNutritionTargets(profileData);
  const weight = resolveNutritionWeight(profileData);
  const fixed = targets.proteinBasis === 'fixed';
  const factor = PROTEIN_FACTORS[targets.proteinBasis] || targets.proteinGPerKg;
  const proteinG = fixed
    ? targets.proteinFixedG
    : (weight ? Math.round(weight.kg * factor * 10) / 10 : targets.proteinFixedG);
  const basisLabels = {
    general: 'General adult',
    active: 'Active / training',
    high: 'High training',
    custom: 'Custom per kg',
    fixed: 'Fixed grams',
  };
  return {
    ...targets,
    proteinG,
    proteinFactor: fixed ? null : factor,
    proteinBasisLabel: basisLabels[targets.proteinBasis] || 'Custom',
    proteinUsesWeight: !fixed && !!weight,
    proteinUsesFallback: !fixed && !weight,
    weight,
  };
}
