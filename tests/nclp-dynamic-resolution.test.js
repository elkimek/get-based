import { describe, expect, it } from 'vitest';

import { buildProviderCoverageMatrix } from '../js/lab-order-coverage.js';
import { createMemoryNclpCache, createPersistentNclpCache, enrichMarkersWithNclpCandidates } from '../js/lab-standards/nclp-cache.js';
import { searchNclp } from '../js/lab-standards/nclp-client.js';

const CERULOPLASMIN_NCLP_RESPONSE = Object.freeze({
  items: [{
    id: 'nclp-cerulo-uuid',
    code: '12345',
    upToDateness: 'Valid',
    label: '12345 - Ceruloplazmin (S; hmotn. konc. [g/l] *)',
    component: { symbol: 'CERUL', name: 'Ceruloplazmin', label: 'Ceruloplazmin' },
    system: { code: 'S', name: 'Sérum', label: 'Sérum' },
    unit: { name: 'g/l', label: 'g/l' },
    procedure: { code: '*', name: 'Blíže nespecifikovaná procedura' },
  }],
  totalCount: 1,
});

describe('dynamic NČLP resolution cache', () => {
  it('fetches unknown marker NCLP candidates once, reuses cache, and does not imply provider coverage', async () => {
    const requested = [{
      markerKey: 'unmapped.ceruloplasmin',
      displayName: 'Ceruloplasmin',
      confidence: 'llm_recommended_unmapped',
    }];
    const calls = [];
    const fetch = async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => CERULOPLASMIN_NCLP_RESPONSE,
      };
    };
    const cache = createMemoryNclpCache();

    const first = await enrichMarkersWithNclpCandidates(requested, { fetch, cache });
    const second = await enrichMarkersWithNclpCandidates(requested, { fetch, cache });

    expect(calls).toHaveLength(1);
    expect(first[0]).toEqual(expect.objectContaining({
      markerKey: 'unmapped.ceruloplasmin',
      nclpStatus: 'live_exact_candidate',
      nclpCandidates: [expect.objectContaining({
        standard: 'NCLP',
        code: '12345',
        matchedBy: 'search',
      })],
    }));
    expect(second[0].nclpCandidates[0].code).toBe('12345');

    const matrix = buildProviderCoverageMatrix(first, { country: 'CZ' });
    for (const provider of matrix.providers) {
      expect(provider.coveredCount).toBe(0);
      expect(provider.missingMarkerKeys).toEqual(['unmapped.ceruloplasmin']);
      expect(provider.cells['unmapped.ceruloplasmin']).toEqual(expect.objectContaining({
        status: 'missing',
        coverage: 'unavailable',
        nclpCandidates: [expect.objectContaining({ code: '12345' })],
      }));
    }
  });

  it('uses the same-origin proxy in browser runtime so NČLP CORS does not block lookup', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    globalThis.window = { location: { origin: 'http://127.0.0.1:8174' } };
    try {
      const fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return {
          ok: true,
          json: async () => CERULOPLASMIN_NCLP_RESPONSE,
        };
      };

      const result = await searchNclp('Full thyroid panel (TSH', { fetch });

      expect(result.totalCount).toBe(1);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('/api/proxy');
      expect(calls[0].init.method).toBe('POST');
      const body = JSON.parse(calls[0].init.body);
      expect(body.method).toBe('GET');
      expect(body.url).toContain('https://www.nclp.cz/api/v1/nationallaboratoryitems/search');
      expect(body.url).toContain('query=Full+thyroid+panel+%28TSH');
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it('persists cache entries through a storage-backed cache', () => {
    const backing = new Map();
    const storage = {
      getItem: key => backing.get(key) || null,
      setItem: (key, value) => backing.set(key, value),
      removeItem: key => backing.delete(key),
    };
    const first = createPersistentNclpCache({ storage, namespace: 'test.nclp' });
    first.set('CZ:NCLP:ceruloplasmin', { status: 'live_exact_candidate', fetchedAt: '2026-06-04T00:00:00.000Z', candidates: [{ code: '01487' }] });

    const second = createPersistentNclpCache({ storage, namespace: 'test.nclp' });

    expect(second.get('CZ:NCLP:ceruloplasmin')).toEqual(expect.objectContaining({
      status: 'live_exact_candidate',
      candidates: [{ code: '01487' }],
    }));
  });

  it('merges storage-backed cache writes so concurrent workers do not evict earlier entries', () => {
    const backing = new Map();
    const storage = {
      getItem: key => backing.get(key) || null,
      setItem: (key, value) => backing.set(key, value),
      removeItem: key => backing.delete(key),
    };
    const cache = createPersistentNclpCache({ storage, namespace: 'test.nclp.merge' });

    cache.set('CZ:NCLP:alpha', { status: 'live_exact_candidate', fetchedAt: '2026-06-04T00:00:00.000Z', candidates: [{ code: 'A' }] });
    backing.set('test.nclp.merge', JSON.stringify({
      'CZ:NCLP:beta': { status: 'live_exact_candidate', fetchedAt: '2026-06-04T00:00:00.000Z', candidates: [{ code: 'B' }] },
    }));
    cache.set('CZ:NCLP:gamma', { status: 'live_exact_candidate', fetchedAt: '2026-06-04T00:00:00.000Z', candidates: [{ code: 'C' }] });

    const persisted = JSON.parse(backing.get('test.nclp.merge'));
    expect(Object.keys(persisted).sort()).toEqual(['CZ:NCLP:alpha', 'CZ:NCLP:beta', 'CZ:NCLP:gamma']);
  });

  it('starts uncached live NČLP lookups concurrently instead of serially blocking a broad panel', async () => {
    const requested = ['Alpha marker', 'Beta marker', 'Gamma marker', 'Delta marker'].map((displayName, index) => ({
      markerKey: `unmapped.nclpConcurrency${index}`,
      displayName,
      confidence: 'llm_recommended_unmapped',
    }));
    const pending = [];
    const fetch = async (url) => new Promise(resolve => {
      pending.push({
        url: String(url),
        resolve: () => resolve({
          ok: true,
          json: async () => ({
            items: [{
              code: `C${pending.length}`,
              validity: 'Valid',
              standard: 'NCLP',
              name: 'Synthetic candidate',
            }],
          }),
        }),
      });
    });

    const promise = enrichMarkersWithNclpCandidates(requested, { fetch, cache: createMemoryNclpCache() });
    await Promise.resolve();

    expect(pending).toHaveLength(4);
    pending.forEach(entry => entry.resolve());
    const enriched = await promise;

    expect(enriched).toHaveLength(4);
    expect(enriched.map(marker => marker.markerKey)).toEqual(requested.map(marker => marker.markerKey));
    expect(enriched.every(marker => marker.nclpStatus === 'live_exact_candidate')).toBe(true);
  });
});
