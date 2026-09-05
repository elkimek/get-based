// @ts-check
// nutrition-analysis.js — provider-agnostic meal-photo extraction.

import { AI_IMPORT_REQUEST_TIMEOUT_MS, callClaudeAPI } from './api.js';
import { callCodexVisionFeature } from './agent-feature-inference.js';
import {
  buildVisionContent, formatImageBlock, imageFileToBase64,
  isValidImageType, resizeImageVariants,
} from './image-utils.js';
import { getMealAISelection, getMealAISelectionForRoute } from './nutrition-ai-settings.js';
import { NUTRITION_KEYS, normalizeNutritionTotals } from './nutrition-summary.js';
import { normalizeNutritionComponent, sumComponentNutrients } from './nutrition-food-data.js';
import { calculateCost, formatCost, getModelPricing, trackUsage } from './schema.js';

const PARSE_DIAGNOSTIC = Symbol('nutrition-parse-diagnostic');

export const PHOTO_ESTIMATED_NUTRIENT_KEYS = NUTRITION_KEYS;
export const PHOTO_NUTRIENT_KEYS = PHOTO_ESTIMATED_NUTRIENT_KEYS;
const PHOTO_COMPONENT_NUTRIENT_KEYS = PHOTO_ESTIMATED_NUTRIENT_KEYS;

const NUTRITION_LABEL_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['servingSizeText', 'servingSizeG', 'servingSizeMl', 'servingsPerContainer', 'labelBasis', 'consumedAmount', 'consumedUnit'],
  properties: {
    servingSizeText: { type: ['string', 'null'] },
    servingSizeG: { type: ['number', 'null'] },
    servingSizeMl: { type: ['number', 'null'] },
    servingsPerContainer: { type: ['number', 'null'] },
    labelBasis: { type: ['string', 'null'] },
    consumedAmount: { type: ['number', 'null'] },
    consumedUnit: { type: ['string', 'null'] },
  },
});

function mealAnalysisSchema(nutrientKeys, componentNutrientKeys) {
  // Keep nullable numbers constraint-light for cross-provider structured
  // output. Client normalization still rejects negative/non-finite values.
  const nutrientSchema = Object.fromEntries(nutrientKeys.map(key => [key, { type: ['number', 'null'] }]));
  const componentSchema = Object.fromEntries(componentNutrientKeys.map(key => [key, { type: ['number', 'null'] }]));
  return Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['mealName', 'components', 'nutrients', 'confidence', 'assumptions', 'warnings', 'label'],
    properties: {
    mealName: { type: 'string' },
    components: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantityG', 'confidence', 'nutrients'],
        properties: {
          name: { type: 'string' },
          quantityG: { type: ['number', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          nutrients: {
            type: 'object',
            additionalProperties: false,
            required: componentNutrientKeys,
            properties: componentSchema,
          },
        },
      },
    },
    nutrients: {
      type: 'object',
      additionalProperties: false,
      required: nutrientKeys,
      properties: nutrientSchema,
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    assumptions: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    // Gemini's Vertex schema adapter requires anyOf to be the only field at
    // its level. Keep object constraints inside one branch so Venice can
    // translate this nullable object without producing forbidden siblings.
    label: { anyOf: [NUTRITION_LABEL_SCHEMA, { type: 'null' }] },
    },
  });
}

export const MEAL_ANALYSIS_SCHEMA = mealAnalysisSchema(NUTRITION_KEYS, NUTRITION_KEYS);
export const MEAL_PHOTO_ANALYSIS_SCHEMA = mealAnalysisSchema(PHOTO_ESTIMATED_NUTRIENT_KEYS, PHOTO_COMPONENT_NUTRIENT_KEYS);

const MEAL_PROMPT = `Analyze these views of one meal for user review. Return only JSON matching the schema. Whole-meal nutrient keys are ${PHOTO_ESTIMATED_NUTRIENT_KEYS.join(', ')}. Component nutrient keys are ${PHOTO_COMPONENT_NUTRIENT_KEYS.join(', ')}.

Rules:
- Work weight-first: identify visible foods/drinks, estimate actual consumed grams from geometry and genuine scale cues, then calculate nutrients. Never substitute a standard serving or work backward from calories. Cross-check combined mass; without scale, use a conservative estimate and warn.
- Use prepared-food density unless raw. Every component contains the same complete nutrient field set so reviewed gram changes can scale its profile; top totals equal the sum of all non-null component values. Include material oils, sauces, toppings, and drinks; keep hidden amounts conservative and list assumptions.
- Name each component as a specific food identity, including visible preparation (raw, boiled, baked, grilled, fried), skin/fat state, and material sauce or breading when known. Do not include portion size in the name.
- Estimate a numeric quantityG for every component even without a scale; a null component quantity makes the estimate unusable. Warn when uncertain. Use null for unknown nutrients, never zero.
- Estimate detailed whole-meal nutrients from the identified foods, preparation, and portion weights using food-composition knowledge. These are approximate composition estimates, not visually measured values. Return null instead of forcing a value when identity, fortification, recipe, or preparation makes a nutrient unreliable. Distinguish total sugar from added sugar and total fat from fatty-acid subtypes.
- fluidMl is visible consumed drink volume, not hydration; plainWaterMl is identified plain water only.
- Images are views of one meal: never double-count. Warn about ambiguity; do not state uncertain ingredients/allergens as facts.
- confidence rates identity only: 0.90 distinct, 0.75 likely, 0.50 ambiguous, 0.25 contextual. Use no other values; top confidence is the lowest material component.
- Make a best effort and set label to null.`;

const LABEL_PROMPT = `Read these views of one food or drink Nutrition Facts label. Return only schema JSON with consumed totals for keys: ${NUTRITION_KEYS.join(', ')}.

Rules:
- Transcribe absolute amounts, never % Daily Value. Read serving size, container servings, and basis before scaling to the user's amount. A serving is not a recommendation.
- Resolve dual columns; warn about ambiguity or unreadable rows. Images show one product, not multiple packages.
- Convert kJ to kcal with kJ / 4.184 and salt to sodium with salt / 2.5; record conversions in assumptions.
- Use null for absent/unreadable values and never invent micronutrients or use zero for unknown.
- The component represents the consumed product. Derive grams and drink volume when possible; plainWaterMl is only plain water.`;

export function buildMealAnalysisPrompt({ correctedMealName = '', previousMealName = '', analysisKind = 'meal-photo', consumedAmount = 1, consumedUnit = 'servings', userContext = '' } = {}) {
  const correction = cleanString(correctedMealName, 120);
  const isLabel = analysisKind === 'nutrition-label';
  const amount = Number(consumedAmount);
  const safeAmount = Number.isFinite(amount) && amount > 0 ? Math.min(amount, 100000) : 1;
  const unit = ['servings', 'g', 'ml', 'packages'].includes(consumedUnit) ? consumedUnit : 'servings';
  let prompt = isLabel
    ? `${LABEL_PROMPT}\n\nUser-reported consumption: ${safeAmount} ${unit}. Nutrient totals and component quantity must represent this consumed amount, not automatically the whole container.`
    : MEAL_PROMPT;
  const context = cleanString(userContext, 500);
  if (context) prompt += `\n\nUser-provided facts (treat as authoritative where they describe the meal):\n${context}`;
  if (!correction) return prompt;
  const previous = cleanString(previousMealName, 120);
  prompt += `

User correction: "${correction}" is authoritative.${previous ? ` Earlier identification "${previous}" was wrong.` : ''}
Recalculate components, grams, and nutrients from scratch without anchoring to the old estimate. Keep visible sides, sauces, and drinks unless excluded; warn about uncertain preparation, portions, or hidden ingredients.`;
  return prompt;
}

const NUTRIENT_ALIASES = Object.freeze({
  energyKcal: ['calories', 'calorie', 'kcal', 'energy'],
  proteinG: ['protein'],
  carbohydrateG: ['carbohydrate', 'carbohydrates', 'carbs', 'totalcarbohydrate', 'totalcarbs'],
  fatG: ['fat', 'totalfat'],
  fiberG: ['fiber', 'fibre', 'dietaryfiber'],
  sugarG: ['sugar', 'sugars', 'totalsugars'],
  addedSugarG: ['addedsugar', 'addedsugars', 'includesaddedsugars'],
  saturatedFatG: ['saturatedfat', 'satfat'],
  transFatG: ['transfat'],
  sodiumMg: ['sodium'],
  potassiumMg: ['potassium'],
  calciumMg: ['calcium'],
  ironMg: ['iron'],
  magnesiumMg: ['magnesium'],
  zincMg: ['zinc'],
  vitaminAMcgRae: ['vitamina', 'vitaminarae'],
  vitaminCMg: ['vitaminc'],
  vitaminDMcg: ['vitamind'],
  vitaminEMg: ['vitamine'],
  vitaminKMcg: ['vitamink'],
  thiaminMg: ['thiamin', 'vitaminb1'],
  riboflavinMg: ['riboflavin', 'vitaminb2'],
  niacinMg: ['niacin', 'vitaminb3'],
  vitaminB6Mg: ['vitaminb6'],
  folateMcgDfe: ['folate', 'folicacid', 'vitaminb9'],
  vitaminB12Mcg: ['vitaminb12'],
  cholineMg: ['choline'],
  seleniumMcg: ['selenium'],
  cholesterolMg: ['cholesterol'],
  omega3G: ['omega3', 'omega3fattyacids'],
  phosphorusMg: ['phosphorus', 'phosphorous'],
  copperMg: ['copper'],
  manganeseMg: ['manganese'],
  waterG: ['water'],
  fluidMl: ['fluid', 'fluids', 'liquid', 'liquids', 'beveragevolume', 'drinkvolume', 'fluidvolume'],
  plainWaterMl: ['plainwater', 'waterintake', 'plainwatervolume'],
  caffeineMg: ['caffeine'],
  alcoholG: ['alcohol'],
});

function cleanString(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function boundedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const normalized = number >= 10 && number <= 100 ? number / 100 : number;
  return Math.min(1, Math.max(0, normalized));
}

/**
 * Convert an uncalibrated model-written confidence value into an honest,
 * low-precision UI label. The raw value is retained for local evaluation, but
 * should never be presented as measured correctness.
 */
export function modelSelfRating(value) {
  const missing = { label: 'Not provided', tone: 'unknown', percent: null, explanation: 'No structured self-check returned' };
  if (value === null || value === undefined || value === '') return missing;
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return missing;
  const bounded = Math.min(1, Math.max(0, confidence >= 10 && confidence <= 100 ? confidence / 100 : confidence));
  if (bounded >= 0.85) return { label: 'High', tone: 'high', percent: 90, explanation: 'Identity looks distinctive and unobscured' };
  if (bounded >= 0.65) return { label: 'Medium', tone: 'medium', percent: 75, explanation: 'Identity looks likely, but alternatives remain' };
  if (bounded >= 0.375) return { label: 'Low', tone: 'low', percent: 50, explanation: 'Multiple food identities may be plausible' };
  return { label: 'Very low', tone: 'very-low', percent: 25, explanation: 'Identity is mostly inferred from context' };
}

export function normalizeNutritionAIUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const inputTokens = Math.max(0, Math.trunc(Number(value.inputTokens ?? value.prompt_tokens ?? value.input_tokens) || 0));
  const outputTokens = Math.max(0, Math.trunc(Number(value.outputTokens ?? value.completion_tokens ?? value.output_tokens) || 0));
  return inputTokens || outputTokens ? { inputTokens, outputTokens } : null;
}

export function nutritionUsageSummary(source = {}) {
  const usage = normalizeNutritionAIUsage(source?.usage);
  if (!usage) return null;
  const provider = String(source?.provider || '');
  const model = String(source?.model || '');
  const costUsd = calculateCost(provider, model, usage.inputTokens, usage.outputTokens);
  const pricing = getModelPricing(provider, model);
  return {
    ...usage,
    totalTokens: usage.inputTokens + usage.outputTokens,
    costUsd,
    costLabel: `${pricing?.approx && costUsd > 0 ? '≈' : ''}${formatCost(costUsd)}`,
  };
}

function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function objectLookup(value) {
  const lookup = new Map();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return lookup;
  for (const [key, item] of Object.entries(value)) lookup.set(normalizedKey(key), item);
  return lookup;
}

function pick(value, names) {
  const lookup = objectLookup(value);
  for (const name of names) {
    const found = lookup.get(normalizedKey(name));
    if (found !== undefined) return found;
  }
  return undefined;
}

function numericValue(value) {
  if (value && typeof value === 'object') value = pick(value, ['value', 'amount', 'estimate', 'total']);
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return number;
  const grams = typeof value === 'string' ? value.match(/(\d+(?:[.,]\d+)?)\s*g(?:rams?)?\b/i) : null;
  if (!grams) return null;
  return Number(grams[1].replace(',', '.'));
}

function unwrapAnalysis(value) {
  let parsed = Array.isArray(value) && value.length === 1 ? value[0] : value;
  parsed = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  for (let depth = 0; depth < 3; depth += 1) {
    if (pick(parsed, ['mealName', 'components', 'nutrients', 'foods', 'items'])) break;
    const nested = pick(parsed, ['analysis', 'mealAnalysis', 'meal', 'result', 'data']);
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) break;
    parsed = nested;
  }
  return parsed;
}

function normalizeNutrientInput(parsed, nutrientKeys = NUTRITION_KEYS) {
  const source = pick(parsed, ['nutrients', 'nutrition', 'nutritionTotals', 'nutrientTotals', 'totals', 'macros']) || parsed;
  const lookup = new Map();
  if (Array.isArray(source)) {
    for (const row of source) {
      const name = pick(row, ['key', 'name', 'nutrient']);
      if (name) lookup.set(normalizedKey(name), pick(row, ['value', 'amount', 'estimate', 'total']));
    }
  } else {
    for (const [key, value] of objectLookup(source)) lookup.set(key, value);
  }
  const normalized = {};
  for (const key of nutrientKeys) {
    const aliases = [key, ...(NUTRIENT_ALIASES[key] || [])];
    let raw;
    for (const alias of aliases) {
      raw = lookup.get(normalizedKey(alias));
      if (raw !== undefined) break;
    }
    const number = numericValue(raw);
    if (number !== null) normalized[key] = number;
  }
  return normalizeNutritionTotals(normalized);
}

function contentText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(part => typeof part === 'string' ? part : part?.text || part?.content || '').join('');
  }
  return '';
}

function firstBalancedJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  return text.slice(start);
}

function repairCommonMealJson(text) {
  const original = text;
  let repaired = text
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/,\s*([}\]])/g, '$1')
    // Gemini-compatible routes occasionally omit a separator between array
    // objects even though the remainder of the response is valid JSON.
    .replace(/}\s*(?={)/g, '},')
    .replace(/]\s*(?=\[)/g, '],');
  try {
    return {
      parsed: JSON.parse(repaired),
      diagnostic: repaired === original ? '' : 'missing-separator-repaired',
    };
  } catch {}

  throw new Error('The response did not contain complete JSON.');
}

function withParseDiagnostic(parsed, diagnostic) {
  if (parsed && typeof parsed === 'object' && diagnostic) {
    Object.defineProperty(parsed, PARSE_DIAGNOSTIC, { value: diagnostic, enumerable: false });
  }
  return parsed;
}

export function parseMealAnalysisText(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const raw = contentText(value).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || raw;
  const candidates = [fenced, firstBalancedJsonObject(fenced)].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    try { return JSON.parse(candidate); } catch {}
    try {
      const repaired = repairCommonMealJson(candidate);
      return withParseDiagnostic(repaired.parsed, repaired.diagnostic);
    } catch {}
  }
  throw new Error('The vision model returned malformed meal data. Try the analysis again or choose another meal-photo model.');
}

export function normalizeMealAnalysis(value, { nutrientKeys = NUTRITION_KEYS, componentNutrientKeys = NUTRITION_KEYS } = {}) {
  const responseDiagnostic = value && typeof value === 'object' ? value[PARSE_DIAGNOSTIC] || '' : '';
  const parsed = unwrapAnalysis(value);
  const componentSource = pick(parsed, ['components', 'foods', 'foodItems', 'items', 'ingredients']);
  const components = (Array.isArray(componentSource) ? componentSource : [])
    .map(component => {
      const quantity = numericValue(pick(component, [
        'quantityG', 'quantityGrams', 'amountG', 'amountGrams', 'weightG', 'weightGrams',
        'estimatedWeightG', 'estimatedWeightGrams', 'estimatedGrams', 'grams',
        'portionG', 'portionGrams', 'portionWeightG', 'servingWeightG',
      ]));
      return {
        name: cleanString(pick(component, ['name', 'food', 'item', 'label']), 120),
        quantityG: quantity === null ? null : Math.round(quantity),
        confidence: boundedConfidence(pick(component, ['confidence', 'confidenceScore'])),
        nutrients: normalizeNutrientInput(component, componentNutrientKeys),
      };
    })
    .filter(component => component.name)
    .map(normalizeNutritionComponent)
    .slice(0, 24);
  const cleanList = list => (Array.isArray(list) ? list : (typeof list === 'string' ? [list] : []))
    .map(item => cleanString(item))
    .filter(Boolean)
    .slice(0, 12);
  const labelSource = pick(parsed, ['label', 'nutritionLabel', 'servingInfo']);
  const servingSizeG = numericValue(pick(labelSource, ['servingSizeG', 'servingGrams', 'gramsPerServing']));
  const servingSizeMl = numericValue(pick(labelSource, ['servingSizeMl', 'servingMilliliters', 'millilitersPerServing']));
  const servingsPerContainer = numericValue(pick(labelSource, ['servingsPerContainer', 'servings', 'containerServings']));
  const consumedAmount = numericValue(pick(labelSource, ['consumedAmount', 'amountConsumed']));
  const label = labelSource && typeof labelSource === 'object' && !Array.isArray(labelSource) ? {
    servingSizeText: cleanString(pick(labelSource, ['servingSizeText', 'servingSize', 'portionSize']), 120) || null,
    servingSizeG,
    servingSizeMl,
    servingsPerContainer,
    labelBasis: cleanString(pick(labelSource, ['labelBasis', 'basis', 'nutritionBasis']), 40) || null,
    consumedAmount,
    consumedUnit: cleanString(pick(labelSource, ['consumedUnit', 'amountUnit']), 24) || null,
  } : null;
  const suppliedTotals = normalizeNutrientInput(parsed, nutrientKeys);
  // A label or single-food result sometimes returns complete meal totals but
  // omits the duplicate component-level object. With one quantified component,
  // those totals describe that component exactly, so retain them as its linked
  // profile. This makes later gram edits deterministic instead of clearing or
  // freezing the extended nutrient fields.
  if (components.length === 1 && components[0].quantityG !== null && Object.keys(suppliedTotals).length) {
    components[0] = normalizeNutritionComponent({
      ...components[0],
      nutrients: { ...suppliedTotals, ...(components[0].nutrients || {}) },
    });
  }
  const componentSum = sumComponentNutrients(components);
  const componentCoreComplete = componentNutrientKeys.every(key => componentSum.completeKeys.includes(key));
  const warnings = cleanList(pick(parsed, ['warnings', 'uncertainties', 'limitations']));
  const missingPortions = components.filter(component => component.quantityG === null).map(component => component.name);
  if (missingPortions.length) {
    warnings.push(`Portion not quantified for ${missingPortions.slice(0, 3).join(', ')}; enter grams and recalculate before relying on adjusted totals.`);
  }
  return {
    mealName: cleanString(pick(parsed, ['mealName', 'name', 'dishName', 'mealTitle']), 120) || components.map(item => item.name).slice(0, 3).join(', ') || 'Meal',
    components,
    nutrients: componentCoreComplete
      ? { ...suppliedTotals, ...Object.fromEntries(Object.entries(componentSum.nutrients).filter(([key]) => nutrientKeys.includes(key))) }
      : suppliedTotals,
    confidence: boundedConfidence(pick(parsed, ['confidence', 'confidenceScore'])),
    assumptions: cleanList(pick(parsed, ['assumptions', 'estimatedAssumptions'])),
    warnings: warnings.slice(0, 12),
    responseDiagnostic: responseDiagnostic || null,
    label,
  };
}

export function hasActionableMealAnalysis(analysis) {
  return !!(analysis?.components?.length
    || Object.values(analysis?.nutrients || {}).some(value => Number(value) > 0));
}

export function getMealAnalysisAvailability() {
  return getMealAISelection();
}

export async function prepareMealPhotos(file) {
  const files = (Array.isArray(file) ? file : [file]).filter(item => item instanceof File);
  if (files.length > 4) throw new Error('Choose no more than four photos for one analysis.');
  if (!files.length || files.some(item => !isValidImageType(item.type))) {
    throw new Error('Choose up to four JPG, PNG, WebP, or GIF photos.');
  }
  const maxFileBytes = 20 * 1024 * 1024;
  const totalBytes = files.reduce((sum, item) => sum + Number(item.size || 0), 0);
  if (files.some(item => item.size > maxFileBytes)) throw new Error('Each photo must be 20 MB or smaller.');
  if (totalBytes > 50 * 1024 * 1024) throw new Error('The selected photos must total 50 MB or less.');
  const prepared = [];
  for (const [index, item] of files.entries()) {
    const [analysisBase64, [qualityPreview, thumbnail]] = await Promise.all([
      imageFileToBase64(item),
      resizeImageVariants(item, [
        // This preview exists only long enough to run blur/exposure checks. It
        // is neither sent to the model nor persisted in browser storage.
        { maxDim: 1280, quality: 0.86, includeQualityWarnings: true },
        { maxDim: 240, quality: 0.78, includeQualityWarnings: false },
      ]),
    ]);
    prepared.push({
      item,
      analysisImage: { base64: analysisBase64, mediaType: item.type },
      qualityPreview,
      thumbnail,
      index,
    });
  }
  return prepared;
}

export function mealImagesFromPreparedPhotos(prepared) {
  return (Array.isArray(prepared) ? prepared : []).map(({ item, qualityPreview, resized, thumbnail }) => {
    // `resized` is accepted only for in-memory compatibility with an analysis
    // started by the previous module version. It is never persisted.
    const preview = qualityPreview || resized || thumbnail;
    return ({
      thumbnailUrl: `data:${thumbnail.mediaType};base64,${thumbnail.base64}`,
      mediaType: thumbnail.mediaType,
      width: thumbnail.width,
      height: thumbnail.height,
      originalWidth: preview.origWidth,
      originalHeight: preview.origHeight,
      qualityWarnings: preview.quality_warnings,
      fileName: cleanString(item.name, 160),
    });
  });
}

export async function mealAnalysisFiles(selected, storedImages = []) {
  if (selected.length) return selected;
  return Promise.all(storedImages.slice(0, 4)
    .filter(image => image?.dataUrl || image?.thumbnailUrl)
    .map(async (image, index) => {
      const response = await fetch(image.dataUrl || image.thumbnailUrl);
      const blob = await response.blob();
      const extension = String(blob.type || 'image/jpeg').split('/')[1] || 'jpg';
      return new File([blob], image.fileName || `meal-view-${index + 1}.${extension}`, {
        type: blob.type || image.mediaType || 'image/jpeg',
      });
    }));
}

export function mealAnalysisImageBlocks(prepared, provider) {
  return (Array.isArray(prepared) ? prepared : []).map(({ analysisImage, item, resized }) => {
    // Prepared objects from this version carry the original file bytes. The
    // legacy fallback keeps a comparison already in progress functional after
    // a hot module update, but new analysis never uses the resized preview.
    const source = analysisImage || { base64: resized?.base64, mediaType: resized?.mediaType || item?.type };
    return formatImageBlock(source.base64, source.mediaType, provider);
  });
}

/**
 * @param {File | File[]} file
 * @param {{ onProgress?: (phase: number, label: string) => void, correctedMealName?: string, previousMealName?: string, analysisKind?: 'meal-photo'|'nutrition-label', consumedAmount?: number, consumedUnit?: 'servings'|'g'|'ml'|'packages', userContext?: string, selection?: {provider: string, model: string}, preparedPhotos?: Array<any>, includeImages?: boolean, signal?: AbortSignal }} [options]
 */
export async function analyzeMealPhoto(file, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const correctedMealName = cleanString(options.correctedMealName, 120);
  const previousMealName = cleanString(options.previousMealName, 120);
  const analysisKind = options.analysisKind === 'nutrition-label' ? 'nutrition-label' : 'meal-photo';
  const consumedAmount = Number.isFinite(Number(options.consumedAmount)) && Number(options.consumedAmount) > 0 ? Number(options.consumedAmount) : 1;
  /** @type {'servings'|'g'|'ml'|'packages'} */
  const consumedUnit = ['servings', 'g', 'ml', 'packages'].includes(String(options.consumedUnit))
    ? /** @type {'servings'|'g'|'ml'|'packages'} */ (options.consumedUnit)
    : 'servings';
  const availability = options.selection
    ? getMealAISelectionForRoute(options.selection)
    : getMealAnalysisAvailability();
  if (!availability.available) {
    throw new Error('The meal-photo model is not connected or is not marked as vision-capable. Choose another model in AI Settings or enter the meal manually.');
  }
  onProgress(1, analysisKind === 'nutrition-label' ? 'Preparing label photo…' : 'Preparing photo…');
  const prepared = options.preparedPhotos?.length
    ? options.preparedPhotos.slice(0, 4)
    : await prepareMealPhotos(file);
  onProgress(2, `${correctedMealName ? 'Recalculating with' : analysisKind === 'nutrition-label' ? 'Reading label with' : 'Waiting for'} ${availability.modelDisplay}…`);
  const prompt = buildMealAnalysisPrompt({ correctedMealName, previousMealName, analysisKind, consumedAmount, consumedUnit, userContext: options.userContext });
  const jsonSchema = analysisKind === 'nutrition-label' ? MEAL_ANALYSIS_SCHEMA : MEAL_PHOTO_ANALYSIS_SCHEMA;
  const result = availability.adapter === 'codex'
    ? await callCodexVisionFeature({
      files: prepared.map(item => item.item),
      prompt,
      model: availability.model,
      outputSchema: jsonSchema,
      signal: options.signal,
    })
    : await callClaudeAPI({
      messages: [{ role: 'user', content: buildVisionContent(mealAnalysisImageBlocks(prepared, availability.provider), prompt, availability.provider) }],
      maxTokens: 8192,
      forceNonStream: true,
      requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS,
      requestRetries: 0,
      jsonMode: true,
      jsonSchema,
      reasoningEffort: 'low',
      minOutputTokens: analysisKind === 'nutrition-label' ? 1536 : 1024,
      preferNativeContext: true,
      temperature: 0,
      signal: options.signal,
      consentKind: 'meal-photo',
      modelOverride: availability.model,
    }, availability.provider);
  const usage = normalizeNutritionAIUsage(result?.usage);
  if (usage && availability.adapter !== 'codex') trackUsage(availability.provider, availability.model, usage.inputTokens, usage.outputTokens);
  onProgress(3, 'Checking foods, portions, and nutrients…');
  if (result?.truncated) {
    throw new Error('The vision model cut off the meal data before it was complete. Try again or choose a faster meal-photo model.');
  }
  const analysis = normalizeMealAnalysis(parseMealAnalysisText(result?.text), analysisKind === 'nutrition-label'
    ? undefined
    : { nutrientKeys: PHOTO_ESTIMATED_NUTRIENT_KEYS, componentNutrientKeys: PHOTO_COMPONENT_NUTRIENT_KEYS });
  if (!hasActionableMealAnalysis(analysis)) {
    throw new Error('This model could not identify a usable meal estimate from the photo. Try a clearer photo, choose another meal-photo model in AI Settings, or enter the meal manually.');
  }
  if (correctedMealName) analysis.mealName = correctedMealName;
  if (analysisKind === 'nutrition-label') {
    const detectedLabel = analysis.label;
    analysis.label = {
      servingSizeText: detectedLabel?.servingSizeText || null,
      servingSizeG: detectedLabel?.servingSizeG ?? null,
      servingSizeMl: detectedLabel?.servingSizeMl ?? null,
      servingsPerContainer: detectedLabel?.servingsPerContainer ?? null,
      labelBasis: detectedLabel?.labelBasis || null,
      consumedAmount,
      consumedUnit,
    };
  }
  onProgress(4, 'Building editable review…');
  const analyzedAt = new Date().toISOString();
  const images = options.includeImages === false ? [] : mealImagesFromPreparedPhotos(prepared);
  const aiEstimatedNutrientKeys = analysisKind === 'meal-photo'
    ? Object.keys(analysis.nutrients || {}).filter(key => PHOTO_ESTIMATED_NUTRIENT_KEYS.includes(key))
    : [];
  return {
    analysis,
    image: images[0] || null,
    images,
    source: {
      kind: analysisKind === 'nutrition-label' ? 'ai-label-scan' : 'ai-photo-estimate',
      analysisKind,
      provider: availability.provider,
      model: availability.model,
      modelDisplay: availability.modelDisplay,
      ...(usage ? { usage } : {}),
      analyzedAt,
      ...(analysisKind === 'meal-photo' ? {
        aiNutritionEstimate: {
          nutrientKeys: aiEstimatedNutrientKeys,
          basis: 'model-estimated-from-food-identity-and-portions',
        },
      } : {}),
      ...(analysisKind === 'nutrition-label' ? { label: analysis.label } : {}),
      ...(correctedMealName ? {
        correction: {
          previousMealName,
          userProvidedMealName: correctedMealName,
          correctedAt: analyzedAt,
        },
      } : {}),
    },
  };
}
