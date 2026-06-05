import { describe, expect, it } from 'vitest';

import {
  buildLabProviderCataloguesPayload,
  diffProviderCatalogues,
  serializeLabProviderCataloguesEnv,
} from '../scripts/build-lab-provider-catalogues.mjs';

const labshopHtml = `
<div id="vysetreniView" data-source-products='[{&quot;IdProduct&quot;:19312,&quot;Name&quot;:&quot;Vitamin B12&quot;,&quot;Shortcut&quot;:&quot;S B12&quot;,&quot;GroupName&quot;:&quot;Vitaminy&quot;,&quot;Price&quot;:260,&quot;PriceTxt&quot;:&quot;260 Kč&quot;,&quot;Url&quot;:&quot;/produkty/vysetreni/vitamin-b12&quot;}]'></div>
`;

const unilabsHtml = `
<div data-id="2709" data-category="vitamins" class="product-configurator-item">
  <div class="product-configurator-item__text"><strong><strong>Vitamin B12</strong></strong><div>test na vitamin b12</div></div>
  <div class="product-configurator-item__price">299 Kč</div>
  <a href="?productId=2709&amp;do=AddProduct">Add</a>
</div>
`;

function fetchFixture(url) {
  const body = String(url).includes('labshop') ? labshopHtml : unilabsHtml;
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
}

describe('lab provider catalogue builder', () => {
  it('builds the private runtime catalogue payload from provider HTML without raw scraper blobs', async () => {
    const payload = await buildLabProviderCataloguesPayload({ fetch: fetchFixture });

    expect(payload).toEqual({
      'cz.labshop': {
        catalogueItems: [expect.objectContaining({
          providerId: 'cz.labshop',
          providerProductId: '19312',
          name: 'Vitamin B12',
          priceCzk: 260,
          source: 'labshop_embedded_data_source_products',
        })],
      },
      'cz.unilabs': {
        catalogueItems: [expect.objectContaining({
          providerId: 'cz.unilabs',
          providerProductId: '2709',
          name: 'Vitamin B12',
          priceCzk: 299,
          source: 'unilabs_online_configurator_html',
        })],
      },
    });
    expect(payload['cz.labshop'].catalogueItems[0].raw).toBeUndefined();
    expect(payload['cz.unilabs'].catalogueItems[0].raw).toBeUndefined();
  });

  it('serializes to an env-safe compact JSON string', async () => {
    const payload = await buildLabProviderCataloguesPayload({ fetch: fetchFixture });
    const envJson = serializeLabProviderCataloguesEnv(payload);
    expect(JSON.parse(envJson)['cz.labshop'].catalogueItems[0].providerProductId).toBe('19312');
    expect(envJson).not.toContain('\n');
  });

  it('summarizes added, removed, and price-changed catalogue rows', () => {
    const previous = {
      'cz.labshop': { catalogueItems: [
        { providerProductId: 'old', name: 'Old row', priceCzk: 100 },
        { providerProductId: 'same', name: 'Same row', priceCzk: 200 },
      ] },
    };
    const current = {
      'cz.labshop': { catalogueItems: [
        { providerProductId: 'same', name: 'Same row', priceCzk: 250 },
        { providerProductId: 'new', name: 'New row', priceCzk: 300 },
      ] },
    };

    expect(diffProviderCatalogues(previous, current)).toEqual({
      'cz.labshop': {
        added: [expect.objectContaining({ providerProductId: 'new' })],
        removed: [expect.objectContaining({ providerProductId: 'old' })],
        priceChanged: [expect.objectContaining({ providerProductId: 'same', before: 200, after: 250 })],
        renamed: [],
      },
    });
  });
});
