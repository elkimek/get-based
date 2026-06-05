import { describe, expect, it } from 'vitest';

import {
  buildLabProviderCataloguesScript,
  loadLabProviderCataloguesFromEnv,
} from '../api/lab-provider-catalogues.js';

describe('private lab provider catalogue API payload', () => {
  it('loads only the private runtime catalogue JSON from env and emits a JS global assignment', () => {
    const env = {
      LAB_PROVIDER_CATALOGUES_JSON: JSON.stringify({
        'cz.labshop': {
          catalogueItems: [{
            providerId: 'cz.labshop',
            providerProductId: 'private-vitd',
            name: 'Private Vitamin D row',
            priceCzk: 444,
            searchableText: 'vitamin d private',
          }],
        },
      }),
    };

    const payload = loadLabProviderCataloguesFromEnv(env);
    expect(payload).toEqual({
      'cz.labshop': {
        catalogueItems: [expect.objectContaining({ providerProductId: 'private-vitd', priceCzk: 444 })],
      },
    });

    const script = buildLabProviderCataloguesScript(payload);
    expect(script).toContain('globalThis.__GETBASED_LAB_PROVIDER_CATALOGUES__');
    expect(script).toContain('private-vitd');
    expect(script).not.toContain('</script>');
  });

  it('falls back to an empty catalogue payload when no private source is configured', () => {
    expect(loadLabProviderCataloguesFromEnv({})).toEqual({});
    expect(buildLabProviderCataloguesScript({})).toContain('__GETBASED_LAB_PROVIDER_CATALOGUES__ = {};');
  });

  it('rejects malformed or suspicious env payloads instead of leaking arbitrary data', () => {
    expect(() => loadLabProviderCataloguesFromEnv({ LAB_PROVIDER_CATALOGUES_JSON: '{nope' })).toThrow(/Invalid/);
    expect(() => loadLabProviderCataloguesFromEnv({ LAB_PROVIDER_CATALOGUES_JSON: JSON.stringify([]) })).toThrow(/object/);
    expect(() => loadLabProviderCataloguesFromEnv({ LAB_PROVIDER_CATALOGUES_JSON: JSON.stringify({ secret: 'x' }) })).toThrow(/provider id/);
  });
});
