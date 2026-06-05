import { describe, expect, it } from 'vitest';

import {
  fetchLabshopCatalogue,
  findLabshopCatalogueMatches,
  normalizeLabshopCatalogueProduct,
  parseLabshopEmbeddedCatalogue,
} from '../js/lab-providers/cz/labshop-catalog.js';
import { findLabshopOffersForMarkers } from '../js/lab-providers/cz/labshop.js';

const PRODUCT_FIXTURE = [
  {
    IdProduct: '19297',
    Name: 'TSH',
    Shortcut: 'S TSH',
    GroupName: 'štítná žláza',
    PriceTxt: '  200 Kč',
    Price: '200.00',
    Url: '/produkty/detail/tsh',
    Collection: 'krev',
    SubMethods: [{ Name: 'Tyreotropin', Shortcut: 'S TSH', Collection: 'krev' }],
  },
  {
    IdProduct: '19711',
    Name: 'Kyselina listová (Foláty)',
    Shortcut: 'S FOL',
    GroupName: 'anémie',
    PriceTxt: '  240 Kč',
    Price: '240.00',
    Url: '/produkty/detail/kyselina-listova-folaty',
    Collection: 'krev',
    SubMethods: [{ Name: 'Folat', Shortcut: 'S FOL', Collection: 'krev' }],
  },
  {
    IdProduct: '19315',
    Name: 'Ceruloplasmin',
    Shortcut: 'S Ceru',
    GroupName: 'proteiny',
    PriceTxt: '  225 Kč',
    Price: '225.00',
    Url: '/produkty/detail/ceruloplasmin',
    Collection: 'krev',
    SubMethods: [{ Name: 'Ceruloplazmin', Shortcut: 'S Ceru', Collection: 'krev' }],
  },
  {
    IdProduct: '19749',
    Name: 'a-TG',
    Shortcut: 'S a-TG',
    GroupName: 'štítná žláza',
    PriceTxt: '  250 Kč',
    Price: '250.00',
    Url: '/produkty/detail/a-tg',
    Collection: 'krev',
    SubMethods: [{ Name: 'Protilátky proti thyreoglobulinu', Shortcut: 'S a-TG', Collection: 'krev' }],
  },
];

const HTML_FIXTURE = `
<div id="vysetreniView"
  data-source-products="${JSON.stringify(PRODUCT_FIXTURE).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"
  data-source-groups="[]"></div>`;

describe('Labshop embedded catalogue adapter', () => {
  it('parses the server-rendered data-source-products catalogue instead of requiring hardcoded products', () => {
    const products = parseLabshopEmbeddedCatalogue(HTML_FIXTURE);

    expect(products).toHaveLength(4);
    expect(products[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      providerProductId: '19297',
      name: 'TSH',
      shortcut: 'S TSH',
      groupName: 'štítná žláza',
      priceCzk: 200,
      url: '/produkty/detail/tsh',
      raw: expect.objectContaining({ IdProduct: '19297' }),
    }));
  });

  it('normalizes Labshop catalogue rows into provider catalogue items', () => {
    expect(normalizeLabshopCatalogueProduct(PRODUCT_FIXTURE[1])).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      providerProductId: '19711',
      name: 'Kyselina listová (Foláty)',
      shortcut: 'S FOL',
      priceCzk: 240,
      searchableText: expect.stringContaining('folat'),
      source: 'labshop_embedded_data_source_products',
    }));
  });

  it('fetches the Labshop catalogue through an injectable adapter fetcher', async () => {
    const calls = [];
    const fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, text: async () => HTML_FIXTURE };
    };

    const products = await fetchLabshopCatalogue({ fetch, baseUrl: 'https://www.labshop.cz' });

    expect(calls).toEqual(['https://www.labshop.cz/produkty/vysetreni']);
    expect(products.map(product => product.providerProductId)).toEqual(['19297', '19711', '19315', '19749']);
  });

  it('matches marker intents against catalogue names, aliases, shortcuts, and submethods', () => {
    const catalogue = parseLabshopEmbeddedCatalogue(HTML_FIXTURE);
    const matches = findLabshopCatalogueMatches([
      { markerKey: 'thyroid.tsh', displayName: 'TSH' },
      { markerKey: 'vitamins.folate', displayName: 'Folate' },
      { markerKey: 'proteins.ceruloplasmin', displayName: 'Ceruloplasmin' },
      { markerKey: 'thyroid.tgAb', displayName: 'Thyroglobulin antibodies / TgAb' },
    ], catalogue);

    expect(matches.map(match => [match.markerKey, match.product.providerProductId, match.matchType])).toEqual([
      ['thyroid.tsh', '19297', 'alias_or_name'],
      ['vitamins.folate', '19711', 'alias_or_name'],
      ['proteins.ceruloplasmin', '19315', 'alias_or_name'],
      ['thyroid.tgAb', '19749', 'alias_or_name'],
    ]);
  });

  it('lets Labshop offers come from supplied catalogue data rather than a marker-key product constant', () => {
    const catalogue = parseLabshopEmbeddedCatalogue(HTML_FIXTURE);
    const offers = findLabshopOffersForMarkers([
      { markerKey: 'thyroid.tsh', displayName: 'TSH' },
      { markerKey: 'proteins.ceruloplasmin', displayName: 'Ceruloplasmin' },
    ], { catalogueItems: catalogue });

    expect(offers.map(offer => offer.providerProductId)).toEqual(['19297', '19315']);
    expect(offers.every(offer => offer.confidence === 'public_labshop_embedded_catalogue')).toBe(true);
    expect(offers.every(offer => offer.catalogueSource === 'labshop_embedded_data_source_products')).toBe(true);
  });

  it('does not turn unmapped AI candidates into provider coverage by display-name matching', () => {
    const catalogue = parseLabshopEmbeddedCatalogue(HTML_FIXTURE);
    const offers = findLabshopOffersForMarkers([
      { markerKey: 'unmapped.ceruloplasmin', displayName: 'Ceruloplasmin' },
    ], { catalogueItems: catalogue });

    expect(offers).toEqual([]);
  });

  it('covers the common hormone/metabolic/liver retest plan from the Labshop catalogue adapter', () => {
    const offers = findLabshopOffersForMarkers([
      { markerKey: 'hormones.totalTestosterone', displayName: 'Total testosterone' },
      { markerKey: 'hormones.shbg', displayName: 'SHBG' },
      { markerKey: 'metabolism.insulin', displayName: 'Fasting insulin' },
      { markerKey: 'biochemistry.glucose', displayName: 'Glucose' },
      { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' },
      { markerKey: 'liver.alt', displayName: 'ALT' },
      { markerKey: 'liver.ast', displayName: 'AST' },
      { markerKey: 'liver.ggt', displayName: 'GGT' },
      { markerKey: 'inflammation.hsCRP', displayName: 'hs-CRP' },
      { markerKey: 'biochemistry.uricAcid', displayName: 'Uric acid' },
      { markerKey: 'biochemistry.cystatinC', displayName: 'Cystatin C' },
      { markerKey: 'kidney.egfr', displayName: 'eGFR' },
    ]);

    const covered = new Set(offers.flatMap(offer => offer.matchedMarkerKeys || []));
    expect(covered).toEqual(new Set([
      'hormones.totalTestosterone',
      'hormones.shbg',
      'metabolism.insulin',
      'biochemistry.glucose',
      'vitamins.vitaminD',
      'liver.alt',
      'liver.ast',
      'liver.ggt',
      'inflammation.hsCRP',
      'biochemistry.uricAcid',
      'biochemistry.cystatinC',
      'kidney.egfr',
    ]));
    expect(offers.find(offer => offer.matchedMarkerKeys?.includes('kidney.egfr'))?.name).toContain('CKD-EPI');
  });
});
