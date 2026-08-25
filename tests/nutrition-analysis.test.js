import { describe, expect, it } from 'vitest';

import { MEAL_ANALYSIS_SCHEMA, MEAL_PHOTO_ANALYSIS_SCHEMA, PHOTO_NUTRIENT_KEYS, buildMealAnalysisPrompt, hasActionableMealAnalysis, mealAnalysisImageBlocks, mealImagesFromPreparedPhotos, modelSelfRating, normalizeMealAnalysis, normalizeNutritionAIUsage, nutritionUsageSummary, parseMealAnalysisText, prepareMealPhotos } from '../js/nutrition-analysis.js';
import { imageFileToBase64 } from '../js/image-utils.js';

describe('meal-photo analysis normalization', () => {
  it('keeps nullable numeric schema fields portable across provider validators', () => {
    expect(MEAL_ANALYSIS_SCHEMA.properties.components.items.properties.quantityG).not.toHaveProperty('minimum');
    for (const nutrient of Object.values(MEAL_ANALYSIS_SCHEMA.properties.nutrients.properties)) {
      expect(nutrient.type).toEqual(['number', 'null']);
      expect(nutrient).not.toHaveProperty('minimum');
    }
    const label = MEAL_ANALYSIS_SCHEMA.properties.label;
    expect(Object.keys(label)).toEqual(['anyOf']);
    expect(label.anyOf).toEqual([
      expect.objectContaining({ type: 'object', properties: expect.any(Object) }),
      { type: 'null' },
    ]);
  });

  it('keeps visual estimates limited to reviewable core nutrients', () => {
    expect(Object.keys(MEAL_PHOTO_ANALYSIS_SCHEMA.properties.nutrients.properties)).toEqual([...PHOTO_NUTRIENT_KEYS]);
    expect(MEAL_PHOTO_ANALYSIS_SCHEMA.properties.nutrients.properties).not.toHaveProperty('vitaminDMcg');
    expect(MEAL_PHOTO_ANALYSIS_SCHEMA.properties.nutrients.properties).not.toHaveProperty('sodiumMg');
    expect(buildMealAnalysisPrompt()).toContain('Do not infer sugar, sodium, vitamins, minerals');
  });

  it('uses a reviewed dish identity without anchoring to the earlier estimate', () => {
    const prompt = buildMealAnalysisPrompt({
      correctedMealName: 'Fried Edam cheese with fries, tartar sauce, and beer',
      previousMealName: 'Fish and chips with tartar sauce and beer',
    });

    expect(prompt).toContain('Fried Edam cheese with fries, tartar sauce, and beer');
    expect(prompt).toContain('Fish and chips with tartar sauce and beer');
    expect(prompt).toContain('authoritative');
    expect(prompt).toContain('from scratch');
    expect(prompt).toContain('sides, sauces, and drinks');
  });

  it('uses a fixed visual-confidence rubric without presenting it as nutrient accuracy', () => {
    const prompt = buildMealAnalysisPrompt();
    expect(prompt).toContain('actual consumed grams');
    expect(prompt).toContain('Work weight-first');
    expect(prompt).toContain('Never substitute a standard serving');
    expect(prompt).toContain('without scale, use a conservative estimate');
    expect(prompt).toContain('keep hidden amounts conservative');
    expect(prompt).toContain('confidence rates identity only');
    expect(prompt).toContain('Use no other values');
    expect(modelSelfRating(0.91)).toMatchObject({ label: 'High', tone: 'high', percent: 90 });
    expect(modelSelfRating(74)).toMatchObject({ label: 'Medium', tone: 'medium', percent: 75 });
    expect(modelSelfRating(0.5)).toMatchObject({ label: 'Low', percent: 50, explanation: 'Multiple food identities may be plausible' });
    expect(modelSelfRating(0.25)).toMatchObject({ label: 'Very low', percent: 25, explanation: 'Identity is mostly inferred from context' });
    expect(modelSelfRating(null)).toMatchObject({ label: 'Not provided', tone: 'unknown', percent: null });
  });

  it('normalizes provider token usage and calculates the matching request cost', () => {
    localStorage.setItem('labcharts-venice-pricing', JSON.stringify({
      'openai-gpt-56-sol': { input: 4, output: 20 },
    }));

    expect(normalizeNutritionAIUsage({ prompt_tokens: 120, completion_tokens: 80 }))
      .toEqual({ inputTokens: 120, outputTokens: 80 });
    expect(nutritionUsageSummary({
      provider: 'venice', model: 'openai-gpt-56-sol',
      usage: { inputTokens: 120, outputTokens: 80 },
    })).toMatchObject({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      costUsd: 0.00208,
      costLabel: '$0.0021',
    });
  });

  it('builds a serving-aware label prompt and normalizes label metadata', () => {
    const prompt = buildMealAnalysisPrompt({ analysisKind: 'nutrition-label', consumedAmount: 2, consumedUnit: 'servings' });
    expect(prompt).toContain('Nutrition Facts');
    expect(prompt).toContain('User-reported consumption: 2 servings');
    expect(prompt).toContain('never % Daily Value');

    const result = normalizeMealAnalysis({
      mealName: 'Greek yogurt',
      components: [{ name: 'Greek yogurt', quantityG: 300, confidence: 0.98 }],
      nutrients: { calories: 240, added_sugars: 8, trans_fat: 0 },
      confidence: 0.96,
      assumptions: [],
      warnings: [],
      nutrition_label: {
        serving_size: '1 tub (150 g)',
        serving_grams: 150,
        servings_per_container: 2,
        basis: 'per serving',
        consumed_amount: 2,
        consumed_unit: 'servings',
      },
    });

    expect(result.nutrients).toMatchObject({ energyKcal: 240, addedSugarG: 8, transFatG: 0 });
    expect(result.components[0]).toMatchObject({
      quantityG: 300,
      nutrients: { energyKcal: 240, addedSugarG: 8, transFatG: 0 },
      nutrientsPer100g: { energyKcal: 80, transFatG: 0 },
    });
    expect(result.components[0].nutrientsPer100g.addedSugarG).toBeCloseTo(2.666667, 6);
    expect(result.label).toMatchObject({
      servingSizeText: '1 tub (150 g)',
      servingSizeG: 150,
      servingsPerContainer: 2,
      labelBasis: 'per serving',
      consumedAmount: 2,
      consumedUnit: 'servings',
    });
  });

  it('bounds untrusted model output and preserves unknown nutrients as unknown', () => {
    const result = normalizeMealAnalysis({
      mealName: '  Lentil   bowl  ',
      components: [
        { name: ' Lentils ', quantityG: 210.4, confidence: 2 },
        { name: '', quantityG: -1, confidence: -4 },
      ],
      nutrients: { energyKcal: 610.2, proteinG: 31, sodiumMg: null, ironMg: -8 },
      confidence: 0.73,
      assumptions: ['  one tablespoon olive oil  '],
      warnings: ['hidden dressing'],
    });

    expect(result).toMatchObject({
      mealName: 'Lentil bowl',
      components: [{ name: 'Lentils', quantityG: 210, confidence: 1 }],
      nutrients: { energyKcal: 610.2, proteinG: 31 },
      confidence: 0.73,
      assumptions: ['one tablespoon olive oil'],
    });
    expect(result.nutrients).not.toHaveProperty('sodiumMg');
    expect(result.nutrients).not.toHaveProperty('ironMg');
  });

  it('accepts common multimodal model aliases without silently dropping the estimate', () => {
    const result = normalizeMealAnalysis({
      result: {
        meal_name: 'Chicken rice bowl',
        food_items: [
          { food: 'Chicken breast', estimated_grams: '145 g', confidence_score: 82 },
          { food: 'Rice', portion_grams: 190, confidence: 0.76 },
        ],
        nutrition_totals: {
          calories: { value: 640, unit: 'kcal' },
          protein: 48,
          carbs: 71,
          total_fat: 18,
          sodium: 720,
        },
        confidence_score: 74,
        uncertainties: 'Sauce quantity is partly hidden.',
      },
    });

    expect(result).toMatchObject({
      mealName: 'Chicken rice bowl',
      components: [
        { name: 'Chicken breast', quantityG: 145, confidence: 0.82 },
        { name: 'Rice', quantityG: 190, confidence: 0.76 },
      ],
      nutrients: {
        energyKcal: 640,
        proteinG: 48,
        carbohydrateG: 71,
        fatG: 18,
        sodiumMg: 720,
      },
      confidence: 0.74,
      warnings: ['Sauce quantity is partly hidden.'],
    });
    expect(hasActionableMealAnalysis(result)).toBe(true);
  });

  it('recognizes common gram aliases and flags components whose portion is still missing', () => {
    const result = normalizeMealAnalysis({
      mealName: 'Mixed plate',
      components: [
        { name: 'Rice', portionWeightG: 180, confidence: 0.7 },
        { name: 'Sauce', amountGrams: 30, confidence: 0.5 },
        { name: 'Garnish', quantityG: null, confidence: 0.5 },
      ],
      nutrients: { energyKcal: 500 },
      warnings: [],
    });

    expect(result.components.map(component => component.quantityG)).toEqual([180, 30, null]);
    expect(result.warnings).toContain('Portion not quantified for Garnish; enter grams and recalculate before relying on adjusted totals.');
  });

  it('does not treat an uncertainty-only response as an analyzed meal', () => {
    const result = normalizeMealAnalysis({
      mealName: 'Uncertain',
      components: [],
      nutrients: {},
      warnings: ['Unable to estimate from this image.'],
    });

    expect(hasActionableMealAnalysis(result)).toBe(false);
  });

  it('repairs a missing separator between Gemini array objects', () => {
    const parsed = parseMealAnalysisText('```json\n{"mealName":"Lunch","components":[{"name":"Rice","quantityG":180}{"name":"Chicken","quantityG":140}],"nutrients":{"energyKcal":620}}\n```');

    expect(parsed.components).toEqual([
      { name: 'Rice', quantityG: 180 },
      { name: 'Chicken', quantityG: 140 },
    ]);
  });

  it('rejects a structurally incomplete provider response', () => {
    expect(() => parseMealAnalysisText('{"mealName":"Soup","components":[{"name":"Beans","quantityG":180}],"nutrients":{"energyKcal":420'))
      .toThrow('returned malformed meal data');
  });

  it('rejects image selections that exceed bounded count or byte limits before decoding', async () => {
    const small = () => new File(['photo'], 'meal.jpg', { type: 'image/jpeg' });
    await expect(prepareMealPhotos([small(), small(), small(), small(), small()]))
      .rejects.toThrow('no more than four');
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' });
    await expect(prepareMealPhotos(oversized)).rejects.toThrow('20 MB or smaller');
  });

  it('keeps original upload bytes for AI while producing a thumbnail-only saved image', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 253, 254, 255])], 'meal.jpg', { type: 'image/jpeg' });
    const originalBase64 = await imageFileToBase64(file);
    const prepared = [{
      item: file,
      analysisImage: { base64: originalBase64, mediaType: 'image/jpeg' },
      qualityPreview: {
        base64: 'RESIZED_PREVIEW', mediaType: 'image/jpeg', width: 1280, height: 960,
        origWidth: 4032, origHeight: 3024, quality_warnings: ['Image may be slightly blurry'],
      },
      thumbnail: {
        base64: 'VEhVTUI=', mediaType: 'image/jpeg', width: 240, height: 180,
        origWidth: 4032, origHeight: 3024, quality_warnings: [],
      },
    }];

    expect(mealAnalysisImageBlocks(prepared, 'openrouter')[0].image_url.url)
      .toBe(`data:image/jpeg;base64,${originalBase64}`);
    const stored = mealImagesFromPreparedPhotos(prepared);
    expect(stored).toEqual([expect.objectContaining({
      thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=',
      width: 240,
      height: 180,
      originalWidth: 4032,
      originalHeight: 3024,
    })]);
    expect(JSON.stringify(stored)).not.toContain(originalBase64);
    expect(JSON.stringify(stored)).not.toContain('RESIZED_PREVIEW');
  });

  it('accepts compatible APIs that return JSON in a text content part', () => {
    expect(parseMealAnalysisText([{ type: 'text', text: '{"mealName":"Soup","components":[]}' }]))
      .toMatchObject({ mealName: 'Soup', components: [] });
  });

  it('surfaces an actionable provider-neutral error for unrecoverable JSON', () => {
    expect(() => parseMealAnalysisText('I could not inspect the image.'))
      .toThrow('returned malformed meal data');
  });
});
