import { describe, expect, it } from 'vitest';

import {
  assessFuelStrategy, calculateFuelOverlap, summarizeFuelOverlap, summarizeFuelResponses,
} from '../js/nutrition-fuel-mix.js';

describe('dietary carb-fat overlap', () => {
  it('uses energy rather than gram equality', () => {
    const equalEnergy = calculateFuelOverlap({ carbohydrateG: 90, fatG: 40 });
    expect(equalEnergy).toMatchObject({
      carbEnergyKcal: 360,
      fatEnergyKcal: 360,
      carbEnergyPercent: 50,
      fatEnergyPercent: 50,
      overlapScore: 100,
      direction: 'Mixed intake',
      ratioLabel: '1:1 carb:fat energy',
    });

    const equalGrams = calculateFuelOverlap({ carbohydrateG: 10, fatG: 10 });
    expect(equalGrams).toMatchObject({
      carbEnergyKcal: 40,
      fatEnergyKcal: 90,
      carbEnergyPercent: 31,
      fatEnergyPercent: 69,
      overlapScore: 62,
      direction: 'Fat-led',
    });
  });

  it('is symmetric for 3:1 and 1:3 energy splits', () => {
    const carbLed = calculateFuelOverlap({ carbohydrateG: 75, fatG: 100 / 9 });
    const fatLed = calculateFuelOverlap({ carbohydrateG: 25, fatG: 300 / 9 });
    expect(carbLed).toMatchObject({ overlapScore: 50, carbEnergyPercent: 75, ratioLabel: '3:1 carb:fat energy' });
    expect(fatLed).toMatchObject({ overlapScore: 50, carbEnergyPercent: 25, ratioLabel: '1:3 carb:fat energy' });
  });

  it('requires both known macros and does not invent missing values', () => {
    expect(calculateFuelOverlap({ carbohydrateG: 30 })).toBeNull();
    expect(calculateFuelOverlap({ fatG: 20 })).toBeNull();
    expect(calculateFuelOverlap({ carbohydrateG: 0, fatG: 0 })).toBeNull();
    expect(calculateFuelOverlap({ carbohydrateG: 30, fatG: 0 })).toMatchObject({ overlapScore: 0, carbEnergyPercent: 100 });
  });

  it('calculates each meal before aggregation so separated fuels do not look mixed', () => {
    const separated = summarizeFuelOverlap([
      { nutrients: { carbohydrateG: 90, fatG: 0 } },
      { nutrients: { carbohydrateG: 0, fatG: 40 } },
    ]);
    const mixed = summarizeFuelOverlap([
      { nutrients: { carbohydrateG: 90, fatG: 40 } },
    ]);

    expect(separated).toMatchObject({ available: true, overlapScore: 0, carbEnergyPercent: 50, completeMeals: 2 });
    expect(mixed).toMatchObject({ available: true, overlapScore: 100, carbEnergyPercent: 50, completeMeals: 1 });
  });

  it('reports macro coverage and excludes volume-only drink shortcuts', () => {
    const summary = summarizeFuelOverlap([
      { nutrients: { carbohydrateG: 45, fatG: 20 } },
      { nutrients: { carbohydrateG: 30 } },
      { source: { kind: 'manual-water' }, nutrients: { carbohydrateG: 0, fatG: 0 } },
    ]);

    expect(summary).toMatchObject({
      available: true,
      totalMeals: 2,
      completeMeals: 1,
      contributingMeals: 1,
      coverageRatio: 0.5,
      overlapScore: 100,
    });
  });

  it('uses a saved macro plan as an adherence destination without inventing an overlap target', () => {
    const period = {
      fuelOverlap: { available: true, carbEnergyPercent: 70, fatEnergyPercent: 30, completeMeals: 7, totalMeals: 7 },
      dailyAverages: { energyKcal: 1900, fiberG: 28 },
      nutrientCoverage: { energyKcal: { completeDays: 5 }, fiberG: { completeDays: 5 } },
    };
    const strategy = assessFuelStrategy(period, {
      configured: true, carbohydrateG: 225, fatG: 100, energyKcal: 2000, fiberG: 25,
    });

    expect(strategy.targetMix).toMatchObject({ carbEnergyPercent: 50, fatEnergyPercent: 50 });
    expect(strategy).toMatchObject({ planDelta: 20, aligned: false });
    expect(strategy.actions).toEqual([
      expect.objectContaining({ kind: 'plan', title: 'Move toward your own plan' }),
    ]);
    expect(assessFuelStrategy(period, { configured: false }).actions[0]).toMatchObject({ kind: 'setup' });
  });

  it('prioritizes energy and fiber over overlap plan alignment', () => {
    const strategy = assessFuelStrategy({
      fuelOverlap: { available: true, carbEnergyPercent: 70, completeMeals: 2, totalMeals: 6 },
      dailyAverages: { energyKcal: 2300, fiberG: 15 },
      nutrientCoverage: { energyKcal: { completeDays: 4 }, fiberG: { completeDays: 4 } },
    }, {
      configured: true, carbohydrateG: 225, fatG: 100, energyKcal: 2000, fiberG: 25,
    });

    expect(strategy.actions.map(action => action.kind)).toEqual(['coverage', 'energy', 'fiber']);
  });

  it('waits for repeated, varied check-ins before showing a personal association', () => {
    const meal = (carbPercent, satiety2h, energy2h) => ({
      nutrients: {
        carbohydrateG: carbPercent / 4,
        fatG: (100 - carbPercent) / 9,
      },
      responseCheckIn: { satiety2h, energy2h },
    });
    const early = summarizeFuelResponses([
      meal(100, 3, 3), meal(90, 3, 3), meal(80, 3, 2),
    ]);
    expect(early).toMatchObject({ checkIns: 3, minimum: 6, remaining: 3, ready: false });

    const ready = summarizeFuelResponses([
      meal(100, 1, 1), meal(90, 1, 2), meal(80, 2, 2),
      meal(70, 3, 3), meal(60, 3, 3), meal(50, 3, 3),
    ]);
    expect(ready).toMatchObject({
      checkIns: 6,
      remaining: 0,
      ready: true,
      satiety: { available: true, direction: 'higher', observations: 6 },
      energy: { available: true, direction: 'higher', observations: 6 },
    });
  });
});
