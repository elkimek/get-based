// nutrition-targets.js — profile-scoped nutrition goals and weight-aware protein math.

import { state } from './state.js';
import { NUTRITION_KEYS } from './nutrition-summary.js';
import { weightToKilograms } from './wearables-formatters.js';

import type { ProfileData } from '../types/app-state.js';
import type { BiometricValue } from '../types/profile-context-data.js';
import type { WearableMetricSummary } from './wearables-summary-model.js';

export type NutritionTargetsInput = { [Field in keyof typeof DEFAULT_NUTRITION_TARGETS]?: unknown };
export type NutritionTargetProfile = { [Field in keyof Pick<ProfileData, 'nutritionTargets' | 'biometrics'>]?: unknown } & { wearableSummary?: unknown };
type NutritionWeightMetricReader = { [Field in keyof Pick<WearableMetricSummary, 'latest' | 'latestDate' | 'primarySource'>]?: unknown };
type NutritionWeightRowReader = { [Field in keyof Pick<BiometricValue, 'date' | 'value' | 'unit' | 'source'>]?: unknown };
export interface NormalizedNutritionTargets {
  configured: boolean; energyKcal: number; proteinBasis: string; proteinGPerKg: number; proteinFixedG: number;
  carbohydrateG: number; fatG: number; fiberG: number; fluidMl: number; sugarG: number; sodiumMg: number; widgetNutrients: string[];
}

export const NUTRITION_WIDGET_NUTRIENTS = Object.freeze(
  NUTRITION_KEYS.filter(key => key !== 'energyKcal')
);

export const DEFAULT_NUTRITION_WIDGET_NUTRIENTS = Object.freeze([
  'proteinG', 'carbohydrateG', 'fatG', 'fiberG',
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

const PROTEIN_FACTORS: Readonly<Record<string, unknown>> = Object.freeze({
  general: 0.83,
  active: 1.6,
  high: 2,
});

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function normalizedWidgetNutrients(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_NUTRITION_WIDGET_NUTRIENTS];
  const allowed = new Set(NUTRITION_WIDGET_NUTRIENTS);
  return [...new Set((value as unknown[]).map(String).filter(id => allowed.has(id)))];
}

export function normalizeNutritionTargets(value: unknown = {}): NormalizedNutritionTargets {
  const basis = ['general', 'active', 'high', 'custom', 'fixed'].includes(String((value as NutritionTargetsInput | null | undefined)?.proteinBasis))
    ? String((value as NutritionTargetsInput).proteinBasis)
    : DEFAULT_NUTRITION_TARGETS.proteinBasis;
  return {
    configured: (value as NutritionTargetsInput | null | undefined)?.configured === true,
    energyKcal: boundedNumber((value as NutritionTargetsInput | null | undefined)?.energyKcal, DEFAULT_NUTRITION_TARGETS.energyKcal, 500, 10000),
    proteinBasis: basis,
    proteinGPerKg: boundedNumber((value as NutritionTargetsInput | null | undefined)?.proteinGPerKg, DEFAULT_NUTRITION_TARGETS.proteinGPerKg, 0.4, 3.5),
    proteinFixedG: boundedNumber((value as NutritionTargetsInput | null | undefined)?.proteinFixedG, DEFAULT_NUTRITION_TARGETS.proteinFixedG, 10, 500),
    carbohydrateG: boundedNumber((value as NutritionTargetsInput | null | undefined)?.carbohydrateG, DEFAULT_NUTRITION_TARGETS.carbohydrateG, 0, 1500),
    fatG: boundedNumber((value as NutritionTargetsInput | null | undefined)?.fatG, DEFAULT_NUTRITION_TARGETS.fatG, 0, 500),
    fiberG: boundedNumber((value as NutritionTargetsInput | null | undefined)?.fiberG, DEFAULT_NUTRITION_TARGETS.fiberG, 0, 150),
    fluidMl: boundedNumber((value as NutritionTargetsInput | null | undefined)?.fluidMl, DEFAULT_NUTRITION_TARGETS.fluidMl, 0, 10000),
    sugarG: boundedNumber((value as NutritionTargetsInput | null | undefined)?.sugarG, DEFAULT_NUTRITION_TARGETS.sugarG, 0, 500),
    sodiumMg: boundedNumber((value as NutritionTargetsInput | null | undefined)?.sodiumMg, DEFAULT_NUTRITION_TARGETS.sodiumMg, 0, 10000),
    widgetNutrients: normalizedWidgetNutrients((value as NutritionTargetsInput | null | undefined)?.widgetNutrients),
  };
}

export function getNutritionTargets(profileData: NutritionTargetProfile | null | undefined = state.importedData) {
  return normalizeNutritionTargets(profileData?.nutritionTargets || {});
}

function readableSource(value: unknown) {
  const source = String(value || '').trim();
  if (!source) return 'body measurement';
  if (source === 'manual') return 'manual measurement';
  return source.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function resolveNutritionWeight(profileData: NutritionTargetProfile | null | undefined = state.importedData) {
  const metric = (profileData?.wearableSummary as {metrics?: {weight?: NutritionWeightMetricReader | null} | null} | null | undefined)?.metrics?.weight;
  const wearableValue = Number(metric?.latest);
  if (Number.isFinite(wearableValue) && wearableValue > 0) {
    return {
      kg: wearableValue,
      source: readableSource(metric?.primarySource),
      date: String(metric?.latestDate || ''),
      kind: 'wearable-summary',
    };
  }

  const rows = Array.isArray((profileData?.biometrics as {weight?: unknown} | null | undefined)?.weight) ? (profileData!.biometrics as {weight: Array<NutritionWeightRowReader | null | undefined>}).weight : [];
  const latest = [...rows].filter(row => Number.isFinite(Number(row?.value)) && Number(row!.value) > 0)
    .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))[0];
  if (!latest) return null;
  return {
    kg: (weightToKilograms as (value: number, unit: unknown) => ReturnType<typeof weightToKilograms>)(Number(latest.value), latest.unit || 'kg'),
    source: readableSource(latest.source || 'manual'),
    date: String(latest.date || ''),
    kind: 'legacy-biometric',
  };
}

export function resolveNutritionTargets(profileData: NutritionTargetProfile | null | undefined = state.importedData) {
  const targets = getNutritionTargets(profileData);
  const weight = resolveNutritionWeight(profileData);
  const fixed = targets.proteinBasis === 'fixed';
  const factor = PROTEIN_FACTORS[targets.proteinBasis] || targets.proteinGPerKg;
  const proteinG = fixed
    ? targets.proteinFixedG
    : (weight ? Math.round(weight.kg * (factor as number) * 10) / 10 : targets.proteinFixedG);
  const basisLabels: Record<string, unknown> = {
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
