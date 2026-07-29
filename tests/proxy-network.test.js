import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  createPinnedProxyLookup,
  fetchWithPinnedProxyDns,
  resolveProxyAddresses,
} from '../lib/proxy-network.js';

describe('proxy DNS pinning transport', () => {
  it('pins the proven Node 24 transport and keeps it out of proxy initialization', () => {
    const packageJson = JSON.parse(readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    ));
    const packageLock = JSON.parse(readFileSync(
      new URL('../package-lock.json', import.meta.url),
      'utf8',
    ));
    const source = readFileSync(
      new URL('../lib/proxy-network.js', import.meta.url),
      'utf8',
    );

    expect(packageJson.engines.node).toBe('24.x');
    expect(packageJson.dependencies.undici).toBe('7.28.0');
    expect(packageLock.packages['node_modules/undici'].version).toBe('7.28.0');
    expect(source).toContain("import('undici')");
    expect(source).not.toMatch(/from\s+['"]undici['"]/);
  });

  it('deduplicates public DNS answers and pins the validated address set', async () => {
    const lookup = vi.fn(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      { address: '93.184.216.34', family: 4 },
    ]);
    const addresses = await resolveProxyAddresses('example.com', lookup);
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
    expect(addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);

    const pinnedLookup = createPinnedProxyLookup(addresses);
    const all = await new Promise((resolve, reject) => {
      pinnedLookup('ignored.example', { all: true }, (error, records) => {
        if (error) reject(error);
        else resolve(records);
      });
    });
    expect(all).toEqual(addresses);

    const ipv6 = await new Promise((resolve, reject) => {
      pinnedLookup('ignored.example', { family: 6 }, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    expect(ipv6).toEqual({
      address: '2606:2800:220:1:248:1893:25c8:1946',
      family: 6,
    });
  });

  it('rejects DNS failures, empty answers, and any answer set containing a private address', async () => {
    for (const lookup of [
      vi.fn(async () => { throw new Error('NXDOMAIN'); }),
      vi.fn(async () => []),
      vi.fn(async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]),
      vi.fn(async () => [{ address: 'fd00::1', family: 6 }]),
    ]) {
      await expect(resolveProxyAddresses('attacker.example', lookup)).rejects.toMatchObject({
        code: 'PROXY_DNS_BLOCKED',
      });
    }
  });

  it('does not fetch blocked resolutions and binds public fetches to the pinned lookup', async () => {
    const blockedFetch = vi.fn();
    await expect(fetchWithPinnedProxyDns('https://attacker.example/private', {}, {
      lookup: vi.fn(async () => [{ address: '10.0.0.8', family: 4 }]),
      fetch: blockedFetch,
    })).rejects.toMatchObject({ code: 'PROXY_DNS_BLOCKED' });
    expect(blockedFetch).not.toHaveBeenCalled();

    const close = vi.fn(async () => {});
    const destroy = vi.fn(async () => {});
    let pinnedLookup;
    const fetch = vi.fn(async (_url, init) => {
      expect(init.dispatcher).toEqual({ close, destroy });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const response = await fetchWithPinnedProxyDns('https://models.example.com/v1/list', {
      method: 'GET',
    }, {
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
      fetch,
      createDispatcher: lookup => {
        pinnedLookup = lookup;
        return { close, destroy };
      },
    });

    expect(await response.json()).toEqual({ ok: true });
    expect(close).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    const pinned = await new Promise((resolve, reject) => {
      pinnedLookup('models.example.com', {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('destroys the pinned dispatcher when the network fetch fails', async () => {
    const destroy = vi.fn(async () => {});
    await expect(fetchWithPinnedProxyDns('https://models.example.com/v1/list', {}, {
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
      fetch: vi.fn(async () => { throw new Error('offline'); }),
      createDispatcher: () => ({ close: vi.fn(), destroy }),
    })).rejects.toThrow('offline');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('honors an upstream abort while DNS resolution is still pending', async () => {
    const controller = new AbortController();
    const fetch = vi.fn();
    const pendingLookup = vi.fn(() => new Promise(() => {}));
    const request = fetchWithPinnedProxyDns('https://slow.example.com/v1/list', {
      signal: controller.signal,
    }, {
      lookup: pendingLookup,
      fetch,
    });
    controller.abort(new Error('deadline exceeded'));

    await expect(request).rejects.toThrow('deadline exceeded');
    expect(fetch).not.toHaveBeenCalled();
  });
});
