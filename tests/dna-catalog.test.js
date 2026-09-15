import { afterEach, describe, expect, it, vi } from 'vitest';
const table = note => ({ rs1: { genotypes: { AA: { note } } } });
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('shared Genome catalog', () => {
  it('shares a cold request and retries HTTP or invalid catalog failures', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify(table('current'))));
    vi.stubGlobal('fetch', fetch);
    const { loadSnpCatalog, getCachedSnpCatalog } = await import('../js/dna-evidence.js');
    const first = loadSnpCatalog();
    expect(loadSnpCatalog()).toBe(first);
    await expect(first).rejects.toThrow('unavailable');
    expect(getCachedSnpCatalog()).toBeNull();
    await expect(loadSnpCatalog()).rejects.toThrow('Invalid');
    await expect(loadSnpCatalog()).resolves.toEqual(table('current'));
    await expect(loadSnpCatalog()).resolves.toEqual(table('current'));
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not let an older request replace a force-refreshed catalog', async () => {
    let resolveOld;
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(table('new')))));
    const { loadSnpCatalog, getCachedSnpCatalog } = await import('../js/dna-evidence.js');
    const old = loadSnpCatalog();
    await loadSnpCatalog({ forceFresh: true });
    resolveOld(new Response(JSON.stringify(table('old'))));
    await old;
    expect(getCachedSnpCatalog()).toEqual(table('new'));
  });
});
