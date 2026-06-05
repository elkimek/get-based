import { describe, expect, it } from 'vitest';

import {
  findProviderCatalogueMatches,
  normalizeSearchText,
} from '../js/lab-providers/provider-catalog-matcher.js';

const catalogue = [
  {
    providerProductId: 'u-hba1c',
    name: 'HbA1c (glykovaný hemoglobin)',
    searchableText: normalizeSearchText('HbA1c glykovaný hemoglobin dlouhodobá glykémie'),
    priceCzk: 236,
  },
  {
    providerProductId: 'u-ft4',
    name: 'fT4',
    searchableText: normalizeSearchText('fT4 T4 volný'),
    priceCzk: 190,
  },
  {
    providerProductId: 'u-vit-b12',
    name: 'Vitamín B12',
    searchableText: normalizeSearchText('Vitamín B12 kobalamin'),
    priceCzk: 291,
  },
];

describe('shared provider catalogue matcher', () => {
  it('matches stable marker intents through marker aliases plus provider synonyms', () => {
    const matches = findProviderCatalogueMatches([
      { markerKey: 'diabetes.hba1c', displayName: 'HbA1c' },
      { markerKey: 'thyroid.freeT4', displayName: 'Free T4' },
    ], catalogue, {
      synonymMap: {
        'diabetes.hba1c': ['glykovany hemoglobin'],
        'thyroid.freeT4': ['ft4', 't4 volny'],
      },
    });

    expect(Object.fromEntries(matches.map(match => [match.markerKey, match.product.providerProductId]))).toEqual({
      'diabetes.hba1c': 'u-hba1c',
      'thyroid.freeT4': 'u-ft4',
    });
  });

  it('does not match unmapped AI candidates or generic display-token ghosts', () => {
    const matches = findProviderCatalogueMatches([
      { markerKey: 'unmapped.vitamin_panel', displayName: 'Vitamin panel' },
      { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D3' },
    ], catalogue, {
      synonymMap: {
        'vitamins.vitaminD': ['vitamin d3', '25 oh vitamin d'],
      },
    });

    expect(matches).toEqual([]);
  });
});
