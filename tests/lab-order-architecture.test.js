import { describe, expect, it } from 'vitest';

import {
  getExternalIdsForMarker,
  getMarkerCrosswalk,
  resolveMarkerAliases,
} from '../js/lab-standards/marker-crosswalk.js';
import {
  normalizeNclpSearchItem,
  pickPreferredNclpCandidates,
} from '../js/lab-standards/nclp-resolver.js';
import {
  getProvidersForLocation,
  getProviderById,
} from '../js/lab-providers/provider-registry.js';
import {
  findLabshopOffersForMarkers,
} from '../js/lab-providers/cz/labshop.js';

describe('lab ordering architecture foundation', () => {
  it('keeps external standard IDs in a crosswalk keyed by getbased marker key', () => {
    const crosswalk = getMarkerCrosswalk('coagulation.homocysteine');

    expect(crosswalk.markerKey).toBe('coagulation.homocysteine');
    expect(crosswalk.externalIds.nclp.map(x => x.code)).toContain('02073');
    expect(crosswalk.externalIds.nclp.map(x => x.code)).toContain('02079');
    expect(crosswalk.externalIds.nclp.every(x => x.standard === 'NCLP')).toBe(true);
    expect(crosswalk.externalIds.nclp.every(x => x.relation === 'exact')).toBe(true);
  });

  it('resolves aliases without depending on provider product names', () => {
    expect(resolveMarkerAliases('homocystein')).toContain('coagulation.homocysteine');
    expect(resolveMarkerAliases('B12')).toContain('vitamins.vitaminB12');
    expect(resolveMarkerAliases('folát')).toContain('vitamins.folate');
  });

  it('normalizes NČLP API search items into a stable internal candidate shape', () => {
    const candidate = normalizeNclpSearchItem({
      id: 'uuid-02073',
      code: '02073',
      name: 'Homocystein (P; látková konc. [µmol/l] *)',
      component: { symbol: 'HOMOCYS', name: 'Homocystein' },
      system: { code: 'P', name: 'Plazma' },
      unit: { name: 'µmol/l' },
      procedure: { code: '*', name: 'Blíže nespecifikovaná procedura' },
      upToDateness: 'Valid',
    });

    expect(candidate).toEqual(expect.objectContaining({
      country: 'CZ',
      standard: 'NCLP',
      code: '02073',
      uuid: 'uuid-02073',
      name: 'Homocystein (P; látková konc. [µmol/l] *)',
      component: { symbol: 'HOMOCYS', name: 'Homocystein' },
      system: { code: 'P', name: 'Plazma' },
      unit: 'µmol/l',
      procedure: { code: '*', name: 'Blíže nespecifikovaná procedura' },
      validity: 'Valid',
    }));
  });

  it('prefers exact NČLP codes from the crosswalk over unrelated search hits', () => {
    const candidates = [
      normalizeNclpSearchItem({ code: '01529', name: 'Cystathionin (P; látková konc. [µmol/l] *)', component: { symbol: 'CST', name: 'Cystathionin' }, system: { code: 'P', name: 'Plazma' }, unit: { name: 'µmol/l' }, procedure: { code: '*' } }),
      normalizeNclpSearchItem({ code: '02073', name: 'Homocystein (P; látková konc. [µmol/l] *)', component: { symbol: 'HOMOCYS', name: 'Homocystein' }, system: { code: 'P', name: 'Plazma' }, unit: { name: 'µmol/l' }, procedure: { code: '*' } }),
    ];

    const picked = pickPreferredNclpCandidates('coagulation.homocysteine', candidates);

    expect(picked[0].code).toBe('02073');
    expect(picked[0].score).toBeGreaterThan(picked[1].score);
    expect(picked[0].matchedBy).toBe('crosswalk');
  });

  it('filters providers by country/location and excludes same-service Spadia from the roadmap', () => {
    const czProviders = getProvidersForLocation({ country: 'CZ' });
    const providerIds = czProviders.map(p => p.id);

    expect(providerIds).toContain('cz.labshop');
    expect(providerIds).toContain('cz.unilabs');
    expect(providerIds).not.toContain('cz.spadia');
    expect(getProviderById('cz.spadia')).toBeNull();
    expect(getProviderById('cz.labshop').capabilities.serverCartCreate).toBe(true);
    expect(getProviderById('cz.labshop').capabilities.requiresCaptchaAtCheckout).toBe(true);
    expect(getProviderById('cz.unilabs').capabilities.reconnaissanceNeeded).toBe(true);
  });

  it('maps marker intents to Labshop offers as provider-level coverage, not schema metadata', () => {
    const offers = findLabshopOffersForMarkers([
      { markerKey: 'vitamins.vitaminB12', displayName: 'Vitamin B12' },
      { markerKey: 'vitamins.folate', displayName: 'Folate' },
    ]);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      providerProductId: '20036',
      name: 'Vitaminy B - Basic',
      coverage: 'panel_contains',
    }));
    expect(offers[0].covers.map(c => c.markerKey)).toEqual(expect.arrayContaining([
      'vitamins.vitaminB12',
      'vitamins.folate',
    ]));
  });

  it('returns standard IDs separately for future imports/APIs', () => {
    const ids = getExternalIdsForMarker('vitamins.folate', 'NCLP');

    expect(ids.map(x => x.code)).toContain('07322');
    expect(ids.every(x => x.standard === 'NCLP')).toBe(true);
  });
});
