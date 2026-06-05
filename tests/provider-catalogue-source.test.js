import { afterEach, describe, expect, it } from 'vitest';

import {
  clearProviderCatalogueSourceForTests,
  getProviderCatalogueItems,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { findLabshopOffersForMarkers } from '../js/lab-providers/cz/labshop.js';

const injectedPthRow = {
  providerId: 'cz.labshop',
  providerProductId: 'private-pth-offer',
  name: 'Private catalogue PTH',
  shortcut: 'S PTH',
  priceCzk: 777,
  searchableText: 'private catalogue pth s pth parathormon',
  source: 'private_provider_catalogue_snapshot',
};

describe('provider catalogue source boundary', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('lets provider adapters consume injected private catalogue rows instead of relying on hardcoded public rows', () => {
    setProviderCatalogueItemsForTests('cz.labshop', [injectedPthRow]);

    expect(getProviderCatalogueItems('cz.labshop')).toEqual([injectedPthRow]);

    const offers = findLabshopOffersForMarkers([
      { markerKey: 'hormones.pth', displayName: 'PTH' },
    ], { useDefaultCatalogue: false });

    expect(offers).toEqual([
      expect.objectContaining({
        providerProductId: 'private-pth-offer',
        name: 'Private catalogue PTH',
        priceCzk: 777,
        catalogueSource: 'private_provider_catalogue_snapshot',
      }),
    ]);
  });
});
