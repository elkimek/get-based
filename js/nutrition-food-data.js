// @ts-check
// nutrition-food-data.js — barcode lookup and deterministic product scaling.

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

export const FOOD_DATA_SOURCE = 'Open Food Facts';
export const FOOD_DATA_API_VERSION = '3.6';
export const FOOD_DATA_CACHE_VERSION = 1;

const OFF_APP_ID = 'getbased/1.3.9 (https://getbased.health)';
const OFF_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const OFF_LOOKUP_WINDOW_MS = 60_000;
const OFF_LOOKUP_LIMIT = 12;
const lookupTimes = [];

const OFF_FIELDS = [
  'code', 'product_name', 'brands', 'quantity', 'product_quantity', 'product_quantity_unit',
  'serving_size', 'serving_quantity', 'nutrition_data_per', 'nutriments',
  'schema_version', 'last_modified_t',
].join(',');

export function normalizeBarcode(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : '';
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function boundedText(value, max) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nutrientValue(nutriments, id, suffix = '_100g') {
  const value = Number(nutriments?.[`${id}${suffix}`]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function parsedQuantity(value, expectedUnit = '') {
  const text = String(value || '').trim().toLowerCase().replace(',', '.');
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|ml|cl|l)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (expectedUnit === 'g' && unit === 'kg') return amount * 1000;
  if (expectedUnit === 'g' && unit === 'g') return amount;
  if (expectedUnit === 'ml' && unit === 'l') return amount * 1000;
  if (expectedUnit === 'ml' && unit === 'cl') return amount * 10;
  if (expectedUnit === 'ml' && unit === 'ml') return amount;
  return null;
}

function mapPer100Nutrients(nutriments = {}) {
  const milligrams = id => {
    const value = nonNegative(nutrientValue(nutriments, id));
    return value === null ? null : value * 1000;
  };
  const values = {
    energyKcal: nutrientValue(nutriments, 'energy-kcal'),
    proteinG: nutrientValue(nutriments, 'proteins'),
    carbohydrateG: nutrientValue(nutriments, 'carbohydrates'),
    fatG: nutrientValue(nutriments, 'fat'),
    fiberG: nutrientValue(nutriments, 'fiber'),
    sugarG: nutrientValue(nutriments, 'sugars'),
    addedSugarG: nutrientValue(nutriments, 'added-sugars'),
    saturatedFatG: nutrientValue(nutriments, 'saturated-fat'),
    transFatG: nutrientValue(nutriments, 'trans-fat'),
    sodiumMg: milligrams('sodium'),
    potassiumMg: milligrams('potassium'),
    calciumMg: milligrams('calcium'),
    ironMg: milligrams('iron'),
    magnesiumMg: milligrams('magnesium'),
    cholesterolMg: milligrams('cholesterol'),
    caffeineMg: milligrams('caffeine'),
    alcoholG: nutrientValue(nutriments, 'alcohol'),
  };
  return normalizeNutritionTotals(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)));
}

export function normalizeOpenFoodFactsProduct(payload, requestedBarcode = '') {
  const product = payload?.product;
  const barcode = normalizeBarcode(product?.code || payload?.code || requestedBarcode);
  if (!barcode || !product || payload?.status === 'failure' || payload?.result?.id === 'product_not_found') return null;
  const per100g = mapPer100Nutrients(product.nutriments || {});
  if (!Object.keys(per100g).length) return null;
  const quantityUnit = String(product.product_quantity_unit || '').toLowerCase();
  const quantityNumber = positive(product.product_quantity);
  const packageSizeG = quantityUnit === 'g' && quantityNumber ? quantityNumber
    : quantityUnit === 'kg' && quantityNumber ? quantityNumber * 1000
    : parsedQuantity(product.quantity, 'g');
  const packageSizeMl = quantityUnit === 'ml' && quantityNumber ? quantityNumber
    : quantityUnit === 'cl' && quantityNumber ? quantityNumber * 10
    : quantityUnit === 'l' && quantityNumber ? quantityNumber * 1000
    : parsedQuantity(product.quantity, 'ml');
  const servingSizeG = positive(product.serving_quantity) || parsedQuantity(product.serving_size, 'g');
  const servingSizeMl = parsedQuantity(product.serving_size, 'ml');
  const brands = String(product.brands || '').split(',').map(value => boundedText(value, 120)).filter(Boolean);
  return {
    version: FOOD_DATA_CACHE_VERSION,
    barcode,
    name: boundedText(product.product_name, 160) || `Product ${barcode}`,
    brand: brands[0] || '',
    servingSizeText: boundedText(product.serving_size, 120) || null,
    servingSizeG,
    servingSizeMl,
    packageSizeG,
    packageSizeMl,
    basis: product.nutrition_data_per === '100ml' ? '100ml' : '100g',
    per100g,
    source: {
      name: FOOD_DATA_SOURCE,
      apiVersion: FOOD_DATA_API_VERSION,
      schemaVersion: Number.isFinite(Number(product.schema_version)) ? Number(product.schema_version) : null,
      productUpdatedAt: Number.isFinite(Number(product.last_modified_t)) ? new Date(Number(product.last_modified_t) * 1000).toISOString() : null,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export function consumedGrams(food, amount, unit) {
  const value = positive(amount);
  if (!value) return null;
  if (unit === 'g') return value;
  if (unit === 'servings') return positive(food?.servingSizeG) ? value * Number(food.servingSizeG) : null;
  if (unit === 'packages') return positive(food?.packageSizeG) ? value * Number(food.packageSizeG) : null;
  return null;
}

function consumedBasisAmount(food, amount, unit) {
  const value = positive(amount);
  if (!value) return null;
  if (food?.basis === '100ml') {
    if (unit === 'ml') return { value, unit: 'ml' };
    if (unit === 'servings' && positive(food?.servingSizeMl)) return { value: value * Number(food.servingSizeMl), unit: 'ml' };
    if (unit === 'packages' && positive(food?.packageSizeMl)) return { value: value * Number(food.packageSizeMl), unit: 'ml' };
    return null;
  }
  const grams = consumedGrams(food, value, unit);
  return grams ? { value: grams, unit: 'g' } : null;
}

export function scaleBarcodeFood(food, amount = 1, unit = 'servings') {
  const consumed = consumedBasisAmount(food, amount, unit);
  if (!consumed) throw new Error(unit === 'ml'
    ? 'This product is recorded by weight rather than volume. Enter the consumed grams or scan its label.'
    : `The database does not provide the ${unit === 'packages' ? 'package weight' : 'serving weight'}. Enter the consumed grams instead.`);
  const nutrients = normalizeNutritionTotals(Object.fromEntries(
    Object.entries(food.per100g || {}).map(([key, value]) => [key, Math.round((Number(value) * consumed.value / 100) * 100) / 100]),
  ));
  return {
    grams: consumed.unit === 'g' ? Math.round(consumed.value * 10) / 10 : null,
    milliliters: consumed.unit === 'ml' ? Math.round(consumed.value * 10) / 10 : null,
    nutrients,
  };
}

export function buildBarcodeMealAnalysis(food, consumption, cacheHit) {
  const scaled = scaleBarcodeFood(food, consumption.amount, consumption.unit);
  const displayName = [food.brand, food.name].filter(Boolean).join(' · ');
  return {
    analysis: {
      mealName: food.name,
      components: [normalizeNutritionComponent({
        name: displayName || food.name,
        quantityG: scaled.grams,
        confidence: 1,
        nutrients: scaled.nutrients,
        nutrientsPer100g: food.per100g,
      })],
      nutrients: scaled.nutrients,
      confidence: null,
      assumptions: [],
      warnings: [],
      label: {
        servingSizeText: food.servingSizeText,
        servingSizeG: food.servingSizeG,
        servingSizeMl: food.servingSizeMl,
        servingsPerContainer: food.packageSizeG && food.servingSizeG ? Math.round((food.packageSizeG / food.servingSizeG) * 100) / 100 : null,
        labelBasis: food.basis === '100ml' ? 'database per 100 mL' : 'database per 100 g',
        consumedAmount: consumption.amount,
        consumedUnit: consumption.unit,
      },
    },
    image: null,
    images: [],
    source: {
      kind: 'barcode-database',
      analysisKind: 'nutrition-label',
      label: null,
      foodData: {
        barcode: food.barcode,
        sourceName: food.source?.name || 'Open Food Facts',
        apiVersion: food.source?.apiVersion || '',
        schemaVersion: food.source?.schemaVersion ?? null,
        productUpdatedAt: food.source?.productUpdatedAt || null,
        fetchedAt: food.source?.fetchedAt || null,
        cacheHit,
        catalogFood: food,
      },
      analyzedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {string} barcode
 * @param {{ fetchImpl?: any, signal?: AbortSignal | null, timeoutMs?: number, now?: () => number }} [options]
 */
export async function fetchBarcodeFood(barcode, {
  fetchImpl = globalThis.fetch,
  signal = null,
  timeoutMs = 12000,
  now = () => Date.now(),
} = {}) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) throw new Error('Enter an 8–14 digit barcode.');
  if (typeof fetchImpl !== 'function') throw new Error('Barcode lookup is unavailable in this browser.');
  const currentTime = now();
  while (lookupTimes.length && currentTime - lookupTimes[0] >= OFF_LOOKUP_WINDOW_MS) lookupTimes.shift();
  if (lookupTimes.length >= OFF_LOOKUP_LIMIT) throw new Error('Too many food lookups. Wait a minute and try again.');
  lookupTimes.push(currentTime);

  const query = new URLSearchParams({ fields: OFF_FIELDS, 'User-Agent': OFF_APP_ID });
  const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(normalized)}?${query}`;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason || new DOMException('Food lookup cancelled.', 'AbortError'));
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Food lookup timed out.', 'TimeoutError')), Math.max(50, Number(timeoutMs) || 12000));
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Food database lookup failed (${response.status}).`);
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (contentLength > OFF_MAX_RESPONSE_BYTES) throw new Error('The food database response was too large.');
    let payload;
    if (typeof response.text === 'function') {
      const body = await response.text();
      if (body.length > OFF_MAX_RESPONSE_BYTES) throw new Error('The food database response was too large.');
      try { payload = JSON.parse(body); }
      catch { throw new Error('The food database returned malformed data.'); }
    } else {
      payload = await response.json();
    }
    return normalizeOpenFoodFactsProduct(payload, normalized);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason?.name === 'TimeoutError') {
      throw new Error('The food database lookup timed out. Try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}
