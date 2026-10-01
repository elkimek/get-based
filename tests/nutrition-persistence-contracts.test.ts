import { describe, expect, it } from 'vitest';
import { persistedNutritionComponents } from '../js/nutrition-photo-provenance.js';
import { sanitizeNutritionMeal, sanitizeNutritionProfileData } from '../js/nutrition-sync-sanitize.js';
import { stripGeneticsSnpsFromBlob, stripLocalOnlyProfileData, stripNutritionMealsFromBlob, stripWearableCredentials } from '../js/sync-payload-codec.js';
import type { MealImage } from '../types/nutrition-data.js';

describe('actual nutrition persistence contracts', () => {
  it('retains the different primitive and array guards at the two component boundaries', () => {
    const array = ['kept'];
    const components = [null, 0, 'food', array];
    expect(persistedNutritionComponents(components)).toEqual([{}, {}, { 0: 'f', 1: 'o', 2: 'o', 3: 'd' }, { 0: 'kept' }]);
    const meal = sanitizeNutritionMeal({ components }) as { components: unknown[] };
    expect(meal.components).toEqual(components);
    expect(meal.components[3]).toBe(array);
  });

  it('reads and copies original enumerable component properties before removing transient fields', () => {
    const reads: string[] = [];
    const component = {
      get name() { reads.push('name'); return 'Rice'; },
      get foodDataCandidates() { reads.push('candidates'); return ['private']; },
      foodCompositionAttempted: true,
      visualNutrients: { proteinG: 2 },
      visualNutrientsPer100g: { proteinG: 3 },
      foodData: { source: 'historical' },
    };
    expect(persistedNutritionComponents([component])).toEqual([{ name: 'Rice', foodData: { source: 'historical' } }]);
    expect(reads).toEqual(['name', 'candidates']);
    expect(component).toHaveProperty('visualNutrients');
  });

  it('keeps a thumbnail at the exact byte limit, rejects the next byte, and removes arbitrary image fields', () => {
    const thumbnailUrl = `data:image/png;base64,${Buffer.alloc(160 * 1024).toString('base64')}`;
    const tooLarge = `data:image/png;base64,${Buffer.alloc(160 * 1024 + 1).toString('base64')}`;
    const output = sanitizeNutritionMeal({ images: [
      { thumbnailUrl, originalBytes: 'private', width: '50000', height: 50001, qualityWarnings: Array(10).fill('x'.repeat(200)) },
      { thumbnailUrl: tooLarge },
    ] }) as { images: MealImage[] };
    expect(output.images).toHaveLength(1);
    expect(output.images[0]).toEqual({ thumbnailUrl, width: 50000, qualityWarnings: Array(8).fill('x'.repeat(160)) });
  });

  it.each([undefined, null, false, 0, '', ['opaque']])('retains malformed root identity for %j', value => {
    expect(sanitizeNutritionMeal(value)).toBe(value);
    expect(sanitizeNutritionProfileData(value)).toBe(value);
  });

  it('keeps the original redaction guards and leaves the caller unmodified', () => {
    const emptyCredential = { wearableConnections: false };
    expect(stripWearableCredentials(emptyCredential)).toBe(emptyCredential);
    const profile = { wearableConnections: { token: 'secret' }, genetics: { snps: { gene: 'AA' }, source: 'lab' }, nutritionMeals: [1], importBenchmarks: [2], deletedImportBenchmarkIds: ['3'], entries: [] };
    const safe = stripLocalOnlyProfileData(stripNutritionMealsFromBlob(stripGeneticsSnpsFromBlob(stripWearableCredentials(profile))));
    expect(safe).toEqual({ genetics: { source: 'lab' }, entries: [] });
    expect(profile.wearableConnections.token).toBe('secret');
    expect(profile.genetics.snps).toEqual({ gene: 'AA' });
    expect(profile.nutritionMeals).toEqual([1]);
  });
});
