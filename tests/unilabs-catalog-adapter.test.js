import { describe, expect, it } from 'vitest';

import {
  findUnilabsCatalogueMatches,
  normalizeUnilabsCatalogueProduct,
  parseUnilabsConfiguratorCatalogue,
} from '../js/lab-providers/cz/unilabs-catalog.js';
import { findUnilabsOffersForMarkers } from '../js/lab-providers/cz/unilabs.js';

const HTML = `
<div data-id="2709" data-category="114" class="product-configurator-item">
  <div class="flex items-center">
    <div class="js-select-product checkbox-illusion">
      <a class="hidden ajax" href="/sestavte-si-vlastni-vysetreni?productId=2709&amp;do=AddProduct"></a>
    </div>
    <div class="product-configurator-item__text">
      <strong><strong>Test na testosteron</strong></strong>
      <div>Testosteron (TST) je nejdůležitějším zástupcem androgenů.</div>
    </div>
  </div>
  <div class="product-configurator-item__price">217 Kč</div>
</div>
<div data-id="2888" data-category="114" class="product-configurator-item">
  <div class="flex items-center">
    <div class="js-select-product checkbox-illusion"><a class="hidden ajax" href="/sestavte-si-vlastni-vysetreni?productId=2888&amp;do=AddProduct"></a></div>
    <div class="product-configurator-item__text"><strong><strong>Inzulin</strong></strong><div>Regulace hladiny cukru v krvi.</div></div>
  </div>
  <div class="product-configurator-item__price">183 Kč</div>
</div>`;

const NEXT_DRAW_MARKERS = [
  { markerKey: 'hormones.totalTestosterone', displayName: 'Testosterone Total' },
  { markerKey: 'hormones.shbg', displayName: 'SHBG' },
  { markerKey: 'metabolism.insulin', displayName: 'Fasting insulin' },
  { markerKey: 'biochemistry.glucose', displayName: 'Glucose (for HOMA-IR)' },
  { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D Total (25-OH)' },
  { markerKey: 'liver.alt', displayName: 'ALT' },
  { markerKey: 'liver.ast', displayName: 'AST' },
  { markerKey: 'liver.ggt', displayName: 'GGT' },
  { markerKey: 'diabetes.hba1c', displayName: 'HbA1c' },
  { markerKey: 'inflammation.hsCRP', displayName: 'hsCRP' },
  { markerKey: 'biochemistry.uricAcid', displayName: 'Uric acid' },
  { markerKey: 'biochemistry.cystatinC', displayName: 'Cystatin C' },
  { markerKey: 'kidney.egfr', displayName: 'EGFR' },
];

describe('Unilabs configurator catalogue adapter', () => {
  it('parses server-rendered configurator product rows with AJAX add-product hrefs', () => {
    const items = parseUnilabsConfiguratorCatalogue(HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      providerProductId: '2709',
      name: 'Test na testosteron',
      priceCzk: 217,
      addProductPath: '/sestavte-si-vlastni-vysetreni?productId=2709&do=AddProduct',
      source: 'unilabs_online_configurator_html',
    }));
  });

  it('matches stable marker intents against catalogue rows, not a tiny hard-coded product map', () => {
    const catalogue = [
      normalizeUnilabsCatalogueProduct({ id: '2709', name: 'Test na testosteron', description: 'Testosteron (TST)', priceText: '217 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2888', name: 'Inzulin', description: '', priceText: '183 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2673', name: 'Glukóza', description: '', priceText: '28 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2540', name: 'ALT (Alaninaminotransferáza)', description: '', priceText: '28 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2542', name: 'AST (Aspartátaminotransferáza)', description: '', priceText: '28 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2552', name: 'GGT', description: '', priceText: '28 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2553', name: 'HbA1c (glykovaný hemoglobin)', description: 'Glykovaný hemoglobin', priceText: '236 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2544', name: 'CRP test', description: 'C-reaktivní protein (CRP)', priceText: '171 Kč' }),
      normalizeUnilabsCatalogueProduct({ id: '2561', name: 'Kyselina močová', description: '', priceText: '29 Kč' }),
    ].filter(Boolean);

    const matches = findUnilabsCatalogueMatches(NEXT_DRAW_MARKERS, catalogue);

    expect(Object.fromEntries(matches.map(match => [match.markerKey, match.product.providerProductId]))).toEqual({
      'hormones.totalTestosterone': '2709',
      'metabolism.insulin': '2888',
      'biochemistry.glucose': '2673',
      'liver.alt': '2540',
      'liver.ast': '2542',
      'liver.ggt': '2552',
      'diabetes.hba1c': '2553',
      'inflammation.hsCRP': '2544',
      'biochemistry.uricAcid': '2561',
    });
  });

  it('builds Unilabs custom-cart offers from the catalogue and keeps unavailable markers missing', () => {
    const offers = findUnilabsOffersForMarkers(NEXT_DRAW_MARKERS);
    const custom = offers.find(offer => offer.providerProductId === 'unilabs-custom-cart');

    expect(custom).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      bloodDrawFeeCzk: 81,
      coverage: 'exact',
    }));
    expect(Object.fromEntries(custom.items.map(item => [item.markerKey, item.providerProductId]))).toEqual({
      'hormones.totalTestosterone': '2709',
      'metabolism.insulin': '2888',
      'biochemistry.glucose': '2673',
      'liver.alt': '2540',
      'liver.ast': '2542',
      'liver.ggt': '2552',
      'diabetes.hba1c': '2553',
      'inflammation.hsCRP': '2544',
      'biochemistry.uricAcid': '2561',
    });
    expect(custom.items.map(item => item.markerKey)).not.toContain('vitamins.vitaminD');
    expect(custom.items.map(item => item.markerKey)).not.toContain('hormones.shbg');
    expect(custom.items.map(item => item.markerKey)).not.toContain('biochemistry.cystatinC');
    expect(custom.items.map(item => item.markerKey)).not.toContain('kidney.egfr');
    expect(custom.covers.find(cover => cover.markerKey === 'inflammation.hsCRP')).toEqual(expect.objectContaining({
      coverage: 'approximate',
      note: expect.stringContaining('not explicitly high-sensitivity CRP'),
    }));
  });
});
