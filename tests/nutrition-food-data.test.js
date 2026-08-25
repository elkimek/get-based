import { describe, expect, it, vi } from 'vitest';

import {
  buildBarcodeMealAnalysis,
  fetchBarcodeFood,
  normalizeBarcode,
  normalizeOpenFoodFactsProduct,
  scaleBarcodeFood,
} from '../js/nutrition-food-data.js';

const payload = {
  code: '3017620422003',
  status: 'success',
  result: { id: 'product_found' },
  product: {
    code: '3017620422003',
    product_name: 'Hazelnut spread',
    brands: 'Example Brand',
    serving_size: '20 g',
    product_quantity: 400,
    product_quantity_unit: 'g',
    nutrition_data_per: '100g',
    schema_version: 999,
    last_modified_t: 1700000000,
    nutriments: {
      'energy-kcal_100g': 500,
      proteins_100g: 8,
      carbohydrates_100g: 60,
      fat_100g: 25,
      sodium_100g: 0.04,
    },
  },
};

describe('barcode food data', () => {
  it('normalizes barcodes and maps standardized per-100 g nutrients', () => {
    expect(normalizeBarcode('3017 6204 22003')).toBe('3017620422003');
    const food = normalizeOpenFoodFactsProduct(payload);
    expect(food).toMatchObject({
      barcode: '3017620422003',
      servingSizeG: 20,
      packageSizeG: 400,
      per100g: { energyKcal: 500, proteinG: 8, sodiumMg: 40 },
      source: { schemaVersion: 999 },
    });
    expect(scaleBarcodeFood(food, 2, 'servings')).toMatchObject({
      grams: 40,
      nutrients: { energyKcal: 200, proteinG: 3.2, sodiumMg: 16 },
    });
  });

  it('labels volume-based database values per 100 mL', () => {
    const food = normalizeOpenFoodFactsProduct({
      ...payload,
      product: {
        ...payload.product,
        nutrition_data_per: '100ml',
        product_quantity: 500,
        product_quantity_unit: 'ml',
        serving_size: '250 ml',
      },
    });
    expect(buildBarcodeMealAnalysis(food, { amount: 250, unit: 'ml' }, false).analysis.label.labelBasis)
      .toBe('database per 100 mL');
  });

  it('uses the current versioned endpoint and handles a missing product', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    await expect(fetchBarcodeFood('3017620422003', { fetchImpl })).resolves.toMatchObject({ name: 'Hazelnut spread' });
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/v3/product/3017620422003');
    expect(decodeURIComponent(fetchImpl.mock.calls[0][0])).toContain('User-Agent=getbased/1.3.9');
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

    await expect(fetchBarcodeFood('3017620422003', {
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    })).resolves.toBeNull();
  });

  it('times out stalled lookups and rejects malformed or oversized responses', async () => {
    const stalled = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    await expect(fetchBarcodeFood('3017620422003', { fetchImpl: stalled, timeoutMs: 50 }))
      .rejects.toThrow('timed out');

    await expect(fetchBarcodeFood('3017620422003', {
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String(2 * 1024 * 1024 + 1) },
        text: async () => '{}',
      }),
    })).rejects.toThrow('too large');

    await expect(fetchBarcodeFood('3017620422003', {
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => '20' },
        text: async () => '{broken',
      }),
    })).rejects.toThrow('malformed');
  });
});
