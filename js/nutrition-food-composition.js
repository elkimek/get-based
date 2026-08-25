// @ts-check
// Deterministic, browser-local matching against the compact USDA FNDDS pack.

import { nutrientsForGrams, normalizeNutritionComponent, sumComponentNutrients } from './nutrition-food-data.js';
import { updateFoodCompositionCoverage } from './nutrition-food-composition-metadata.js';
import { normalizeNutritionTotals } from './nutrition-summary.js';

export const FOOD_COMPOSITION_PACK_URL = '/data/nutrition/fndds-2021-2023.json';
export const FOOD_COMPOSITION_SOURCE = 'USDA FoodData Central';
export const FOOD_COMPOSITION_DATASET = 'FNDDS 2021-2023';
const MAX_PACK_BYTES = 3 * 1024 * 1024;
const AUTO_MATCH_MIN_TEXT_SCORE = 0.64;
const AUTO_MATCH_MIN_SCORE = 0.67;
const MACRO_KEYS = Object.freeze(['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG']);

const TOKEN_ALIASES = Object.freeze({
  aubergine: 'eggplant', courgette: 'zucchini', capsicum: 'pepper', chickpeas: 'chickpea',
  garbanzo: 'chickpea', prawns: 'shrimp', prawn: 'shrimp', yoghurt: 'yogurt',
  minced: 'ground', mince: 'ground', breasts: 'breast', thighs: 'thigh',
  potatoes: 'potato', tomatoes: 'tomato', eggs: 'egg', beans: 'bean', lentils: 'lentil',
  grilled: 'dryheat', grill: 'dryheat', baked: 'dryheat', bake: 'dryheat',
  broiled: 'dryheat', broil: 'dryheat', roasted: 'dryheat', roast: 'dryheat',
  steamed: 'moistheat', steam: 'moistheat', boiled: 'moistheat', boil: 'moistheat',
  poached: 'moistheat', poach: 'moistheat', frying: 'fried', fry: 'fried',
  skinless: 'noskin', skin: 'skin', boneless: 'boneless',
});
const STOP_TOKENS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'made', 'of', 'or', 'the', 'to',
  'with', 'without', 'unknown', 'unspecified', 'item', 'portion', 'food', 'fresh',
]);
const PREPARATION_TOKENS = new Set(['raw', 'fried', 'dryheat', 'moistheat']);
const packIndexCache = new WeakMap();
let packPromise = null;

function rounded(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizedFoodText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bfrom raw\b/g, '')
    .replace(/\bfrench fries?\b/g, 'frenchfries')
    .replace(/\bfries\b/g, 'frenchfries')
    .replace(/\bskin not eaten\b|\bwithout skin\b/g, 'noskin')
    .replace(/\bskin eaten\b|\bwith skin\b/g, 'skin')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function foodTokens(value) {
  return normalizedFoodText(value).split(/\s+/).filter(Boolean)
    .map(token => TOKEN_ALIASES[token] || token)
    .filter(token => !STOP_TOKENS.has(token));
}

function decodedNutrients(keys, values) {
  const result = {};
  for (let index = 0; index < keys.length; index += 1) {
    const value = Number(values?.[index]);
    if (values?.[index] !== null && values?.[index] !== undefined && Number.isFinite(value) && value >= 0) {
      result[keys[index]] = value;
    }
  }
  return normalizeNutritionTotals(result);
}

function normalizePack(value) {
  if (Number(value?.schemaVersion) !== 1 || !Array.isArray(value?.nutrientKeys) || !Array.isArray(value?.foods)) {
    throw new Error('The local food-composition data has an unsupported format.');
  }
  const nutrientKeys = value.nutrientKeys.filter(key => typeof key === 'string').slice(0, 64);
  if (value.foods.length < 5_000 || !nutrientKeys.includes('energyKcal') || !nutrientKeys.includes('sodiumMg')) {
    throw new Error('The local food-composition data is incomplete.');
  }
  return { ...value, nutrientKeys };
}

export async function loadFoodCompositionPack(fetchFn = globalThis.fetch) {
  if (packPromise) return packPromise;
  packPromise = (async () => {
    if (typeof fetchFn !== 'function') throw new Error('Food-composition data cannot be loaded in this browser.');
    const response = await fetchFn(FOOD_COMPOSITION_PACK_URL, { cache: 'force-cache', credentials: 'same-origin' });
    if (!response?.ok) throw new Error(`Food-composition data returned HTTP ${response?.status || 0}.`);
    const declaredBytes = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PACK_BYTES) throw new Error('Food-composition data exceeded the size limit.');
    const text = await response.text();
    if (text.length > MAX_PACK_BYTES) throw new Error('Food-composition data exceeded the size limit.');
    return normalizePack(JSON.parse(text));
  })().catch(error => {
    packPromise = null;
    throw error;
  });
  return packPromise;
}

function indexedFoods(pack) {
  const cached = packIndexCache.get(pack);
  if (cached) return cached;
  const keys = pack.nutrientKeys || [];
  const rows = (pack.foods || []).flatMap(record => {
    if (!Array.isArray(record) || !record[0] || !record[2] || !Array.isArray(record[3])) return [];
    const tokens = foodTokens(record[2]);
    if (!tokens.length) return [];
    return [{
      fdcId: Number(record[0]),
      foodCode: String(record[1] || ''),
      description: String(record[2] || '').slice(0, 180),
      normalized: normalizedFoodText(record[2]),
      tokens,
      tokenSet: new Set(tokens),
      per100g: decodedNutrients(keys, record[3]),
    }];
  });
  packIndexCache.set(pack, rows);
  return rows;
}

function textSimilarity(query, candidate) {
  const queryTokens = foodTokens(query);
  if (!queryTokens.length) return 0;
  const querySet = new Set(queryTokens);
  let matchedWeight = 0;
  let queryWeight = 0;
  for (const token of querySet) {
    const weight = PREPARATION_TOKENS.has(token) ? 1.35 : 1;
    queryWeight += weight;
    if (candidate.tokenSet.has(token)) matchedWeight += weight;
  }
  const overlap = [...querySet].filter(token => candidate.tokenSet.has(token)).length;
  const recall = queryWeight ? matchedWeight / queryWeight : 0;
  const precision = overlap / Math.max(querySet.size, Math.min(candidate.tokenSet.size, querySet.size * 2));
  const firstFoodToken = queryTokens.find(token => !PREPARATION_TOKENS.has(token));
  const firstBonus = firstFoodToken && candidate.tokenSet.has(firstFoodToken) ? 0.08 : 0;
  const normalizedQuery = normalizedFoodText(query);
  const phraseBonus = normalizedQuery && candidate.normalized.includes(normalizedQuery) ? 0.08 : 0;
  const queryPreparation = [...querySet].find(token => PREPARATION_TOKENS.has(token));
  const candidatePreparations = new Set(candidate.tokens.filter(token => PREPARATION_TOKENS.has(token)));
  const preparationPenalty = queryPreparation && candidatePreparations.size && !candidatePreparations.has(queryPreparation) ? 0.22 : 0;
  return Math.max(0, Math.min(1, recall * 0.76 + precision * 0.16 + firstBonus + phraseBonus - preparationPenalty));
}

function nutrientSimilarity(component, candidate) {
  const profile = normalizeNutritionTotals(component?.nutrientsPer100g || {});
  const similarities = [];
  for (const key of MACRO_KEYS) {
    const expected = Number(profile[key]);
    const actual = Number(candidate.per100g[key]);
    if (!Number.isFinite(expected) || expected < 0 || !Number.isFinite(actual) || actual < 0) continue;
    const scale = key === 'energyKcal' ? 80 : 8;
    similarities.push(1 - Math.min(1, Math.abs(expected - actual) / Math.max(scale, expected, actual)));
  }
  if (similarities.length < 3) return null;
  return similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
}

export function matchFoodCompositionCandidates(component, pack, limit = 5) {
  const query = String(component?.name || '').trim();
  if (!query) return [];
  return indexedFoods(pack).map(candidate => {
    const textScore = textSimilarity(query, candidate);
    if (textScore < 0.34) return null;
    const nutrientScore = nutrientSimilarity(component, candidate);
    const score = nutrientScore === null ? textScore : textScore * 0.78 + nutrientScore * 0.22;
    return { ...candidate, textScore: rounded(textScore), nutrientScore: nutrientScore === null ? null : rounded(nutrientScore), score: rounded(score) };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || b.textScore - a.textScore || a.description.length - b.description.length)
    .slice(0, Math.max(1, Math.min(8, Number(limit) || 5)));
}

function candidateReference(candidate) {
  return {
    fdcId: candidate.fdcId,
    foodCode: candidate.foodCode,
    description: candidate.description,
    score: candidate.score,
    textScore: candidate.textScore,
  };
}

function withCompositionMatch(component, candidate, reviewed = false) {
  const normalized = normalizeNutritionComponent(component);
  const visualNutrients = component?.visualNutrients || normalized.nutrients;
  const visualNutrientsPer100g = component?.visualNutrientsPer100g || normalized.nutrientsPer100g;
  const nutrients = normalized.quantityG === null ? {} : nutrientsForGrams(candidate.per100g, normalized.quantityG);
  for (const key of ['fluidMl', 'plainWaterMl']) {
    if (Object.hasOwn(visualNutrients, key)) nutrients[key] = visualNutrients[key];
  }
  return normalizeNutritionComponent({
    ...normalized,
    nutrients,
    nutrientsPer100g: candidate.per100g,
    visualNutrients,
    visualNutrientsPer100g,
    foodCompositionAttempted: true,
    foodData: {
      sourceName: FOOD_COMPOSITION_SOURCE,
      dataset: FOOD_COMPOSITION_DATASET,
      fdcId: candidate.fdcId,
      foodCode: candidate.foodCode,
      description: candidate.description,
      matchScore: candidate.score,
      reviewed,
    },
  });
}

export function clearFoodCompositionMatch(component) {
  const restored = normalizeNutritionComponent({
    ...component,
    nutrients: component?.visualNutrients || component?.nutrients || {},
    nutrientsPer100g: component?.visualNutrientsPer100g || component?.nutrientsPer100g || {},
    foodData: undefined,
    foodCompositionAttempted: true,
  });
  delete restored.foodData;
  return restored;
}

function refreshCompositionSummary(result, pack, visualTotals = null) {
  const components = (result?.analysis?.components || []).map(normalizeNutritionComponent);
  const summed = sumComponentNutrients(components);
  const base = normalizeNutritionTotals(visualTotals || result.analysis.visualNutrients || result.analysis.nutrients || {});
  result.analysis.components = components;
  result.analysis.visualNutrients = result.analysis.visualNutrients || base;
  result.analysis.nutrients = { ...base, ...summed.nutrients };
  result.source.foodComposition = {
    sourceName: pack?.source?.name || FOOD_COMPOSITION_SOURCE,
    dataset: pack?.source?.dataset || FOOD_COMPOSITION_DATASET,
    published: pack?.source?.published || '2024-10-31',
  };
  updateFoodCompositionCoverage(result, summed.completeKeys);
  return result;
}

export function applyFoodCompositionCandidate(result, componentIndex, fdcId, pack, reviewed = true) {
  const component = result?.analysis?.components?.[componentIndex];
  if (!component) return result;
  const candidate = indexedFoods(pack).find(item => item.fdcId === Number(fdcId));
  result.analysis.components[componentIndex] = candidate
    ? withCompositionMatch(component, { ...candidate, score: component?.foodDataCandidates?.find(item => item.fdcId === candidate.fdcId)?.score ?? 1 }, reviewed)
    : clearFoodCompositionMatch(component);
  return refreshCompositionSummary(result, pack);
}

export async function enrichPhotoAnalysisWithFoodComposition(result, { pack = null, fetchFn = globalThis.fetch } = {}) {
  if (result?.source?.kind !== 'ai-photo-estimate' || !result?.analysis?.components?.length) return result;
  const loadedPack = pack || await loadFoodCompositionPack(fetchFn);
  const visualTotals = { ...(result.analysis.nutrients || {}) };
  const proposals = result.analysis.components.map(component => {
    const candidates = matchFoodCompositionCandidates(component, loadedPack, 5);
    const references = candidates.map(candidateReference);
    const top = candidates[0];
    const second = candidates[1];
    const queryTokens = foodTokens(component?.name);
    const exactDescription = top && normalizedFoodText(top.description) === normalizedFoodText(component?.name);
    const hasDisambiguatingEvidence = queryTokens.length >= 3
      || queryTokens.some(token => PREPARATION_TOKENS.has(token))
      || top?.nutrientScore !== null;
    const hasRankingMargin = !second || Number(top?.score || 0) - Number(second.score || 0) >= 0.005;
    const canSuggest = top && top.textScore >= AUTO_MATCH_MIN_TEXT_SCORE && top.score >= AUTO_MATCH_MIN_SCORE
      && (exactDescription || (hasDisambiguatingEvidence && hasRankingMargin));
    return { component, top, canSuggest, references };
  });
  // Do not silently create a hybrid total from database values for some foods
  // and visual values for others. Automatic enrichment is all-or-none; the
  // reviewer can still choose individual candidates in the ingredient rows.
  const canEnrichWholeMeal = proposals.every(proposal => proposal.canSuggest);
  result.analysis.components = proposals.map(({ component, top, references }) => {
    const next = canEnrichWholeMeal ? withCompositionMatch(component, top, false) : normalizeNutritionComponent(component);
    return { ...next, foodCompositionAttempted: true, foodDataCandidates: references };
  });
  return refreshCompositionSummary(result, loadedPack, visualTotals);
}

export function foodCompositionCandidateById(pack, fdcId) {
  return indexedFoods(pack).find(item => item.fdcId === Number(fdcId)) || null;
}
