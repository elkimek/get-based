import { describe, expect, it } from 'vitest';

import {
  parseReferenceIngredients,
  rankMealComparisonRuns,
  scoreMealAnalysis,
} from '../js/nutrition-comparison.js';

const friedCheeseReference = {
  mealName: 'Fried Edam cheese with fries and tartar sauce',
  ingredients: ['Breaded Edam cheese', 'French fries', 'Tartar sauce'],
  totalWeightG: 445,
  energyKcal: 1120,
  proteinG: 39,
  carbohydrateG: 104,
  fatG: 61,
};

describe('meal model comparison scoring', () => {
  it('parses a compact reference ingredient list without duplicates', () => {
    expect(parseReferenceIngredients('Edam cheese\nFrench fries; tartar sauce, French fries')).toEqual([
      'Edam cheese', 'French fries', 'tartar sauce',
    ]);
  });

  it('ranks closeness to entered reference separately from model confidence', () => {
    const close = {
      mealName: 'Breaded fried Edam cheese, fries and tartar sauce',
      components: [
        { name: 'Breaded Edam cheese', quantityG: 180 },
        { name: 'French fries', quantityG: 220 },
        { name: 'Tartar sauce', quantityG: 45 },
      ],
      nutrients: { energyKcal: 1100, proteinG: 40, carbohydrateG: 101, fatG: 60 },
      confidence: 0.62,
    };
    const confidentButWrong = {
      mealName: 'Fish and chips with beer',
      components: [
        { name: 'Fried cod', quantityG: 240 },
        { name: 'French fries', quantityG: 300 },
        { name: 'Beer', quantityG: 500 },
      ],
      nutrients: { energyKcal: 1690, proteinG: 62, carbohydrateG: 178, fatG: 78 },
      confidence: 0.96,
    };

    const ranked = rankMealComparisonRuns([
      { modelLabel: 'Confident model', status: 'complete', result: { analysis: confidentButWrong } },
      { modelLabel: 'Closer model', status: 'complete', result: { analysis: close } },
    ], friedCheeseReference);

    expect(ranked[0].modelLabel).toBe('Closer model');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].evaluation.score).toBeGreaterThan(90);
    expect(ranked[1].evaluation.score).toBeLessThan(ranked[0].evaluation.score);
  });

  it('does not manufacture a correctness score without reference data', () => {
    const evaluation = scoreMealAnalysis({
      mealName: 'Lentil bowl', components: [], nutrients: { energyKcal: 600 }, confidence: 0.99,
    });
    expect(evaluation).toMatchObject({ score: null, hasReference: false });
  });

  it('excludes the model baseline from competitive ranking', () => {
    const baseline = { mealName: 'Rice bowl', components: [{ name: 'Rice', quantityG: 200 }], nutrients: { energyKcal: 300 } };
    const candidate = { mealName: 'Rice bowl', components: [{ name: 'Rice', quantityG: 190 }], nutrients: { energyKcal: 310 } };
    const ranked = rankMealComparisonRuns([
      { modelLabel: 'Baseline', result: { analysis: baseline } },
      { modelLabel: 'Candidate', result: { analysis: candidate } },
    ], { mealName: 'Rice bowl', totalWeightG: 200, energyKcal: 300 }, { excludedIndex: 0 });

    expect(ranked.find(run => run.modelLabel === 'Baseline')?.rank).toBeNull();
    expect(ranked.find(run => run.modelLabel === 'Candidate')?.rank).toBe(1);
  });

  it('penalizes plausible-sounding extra ingredients instead of scoring recall alone', () => {
    const precise = scoreMealAnalysis({
      mealName: 'Rice and chicken',
      components: [{ name: 'Rice' }, { name: 'Chicken breast' }],
      nutrients: {},
    }, { ingredients: ['Rice', 'Chicken breast'] });
    const hallucinated = scoreMealAnalysis({
      mealName: 'Rice and chicken',
      components: [{ name: 'Rice' }, { name: 'Chicken breast' }, { name: 'Cream sauce' }, { name: 'Beer' }],
      nutrients: {},
    }, { ingredients: ['Rice', 'Chicken breast'] });

    expect(precise.identityScore).toBe(100);
    expect(hallucinated.identityScore).toBeLessThan(precise.identityScore);
  });
});
