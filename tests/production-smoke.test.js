import { describe, expect, it, vi } from 'vitest';

import {
  runProductionSmoke,
  smokeProductionApis,
  waitForExpectedDeployment,
} from '../scripts/production-smoke.mjs';

const SHA = 'a'.repeat(40);

function response(status, body, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers });
}

describe('production API smoke canary', () => {
  it('waits for the exact main deployment before probing runtime routes', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(200, { sha: 'b'.repeat(40), ref: 'main' }))
      .mockResolvedValueOnce(response(200, { sha: SHA, ref: 'main' }));
    const sleep = vi.fn();

    await expect(waitForExpectedDeployment({
      baseUrl: 'https://app.getbased.health',
      expectedSha: SHA,
      fetchImpl,
      attempts: 2,
      retryDelayMs: 1,
      sleep,
    })).resolves.toEqual({ sha: SHA, ref: 'main' });
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('fails when production never converges to the expected commit', async () => {
    const fetchImpl = vi.fn(async () => response(200, { sha: 'b'.repeat(40), ref: 'main' }));

    await expect(waitForExpectedDeployment({
      baseUrl: 'https://app.getbased.health',
      expectedSha: SHA,
      fetchImpl,
      attempts: 2,
      retryDelayMs: 1,
      sleep: vi.fn(),
    })).rejects.toThrow(/did not converge/);
  });

  it('checks proxy POST liveness, Withings validation, origin rejection, method handling, and share liveness', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const pathname = new URL(url).pathname;
      const origin = init.headers.origin;
      if (pathname === '/api/proxy' && init.method === 'OPTIONS' && origin.endsWith('.invalid')) {
        return response(403);
      }
      if (pathname === '/api/proxy' && init.method === 'GET') {
        return response(405, {}, { 'access-control-allow-origin': origin });
      }
      if (pathname === '/api/proxy' && init.method === 'POST') {
        const body = JSON.parse(init.body);
        if (body.wearable_runtime_config) {
          return response(200, { overrides: { fitbit: 'public-client-id' } }, {
            'access-control-allow-origin': origin,
          });
        }
        if (body.withings_token_exchange) {
          expect(body.withings_token_exchange).toEqual({
            client_id: 'a91db99c24c9b52cea01993ad2bd67bb1515921b09d0a3c04d40a7dc1d1b748a',
            redirect_uri: 'https://app.getbased.health/',
          });
          return response(400, {
            error: 'withings_token_exchange requires code, redirect_uri, client_id',
          }, {
            'access-control-allow-origin': origin,
          });
        }
      }
      return response(204, null, { 'access-control-allow-origin': origin });
    });

    await expect(smokeProductionApis({
      baseUrl: 'https://app.getbased.health',
      fetchImpl,
    })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('rejects a deployment whose proxy POST adapter is still hanging', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const pathname = new URL(url).pathname;
      const origin = init.headers.origin;
      if (pathname === '/api/proxy' && init.method === 'OPTIONS' && origin.endsWith('.invalid')) {
        return response(403);
      }
      if (pathname === '/api/proxy' && init.method === 'GET') return response(405);
      if (pathname === '/api/proxy' && init.method === 'POST') {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      return response(204, null, { 'access-control-allow-origin': origin });
    });

    await expect(smokeProductionApis({
      baseUrl: 'https://app.getbased.health',
      fetchImpl,
    })).rejects.toThrow(
      'POST /api/proxy failed: The operation was aborted due to timeout',
    );
  });

  it('validates the expected SHA before touching production', async () => {
    const fetchImpl = vi.fn();
    await expect(runProductionSmoke({
      expectedSha: 'short',
      fetchImpl,
    })).rejects.toThrow(/full Git SHA/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('identifies the exact production probe that times out', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    await expect(smokeProductionApis({
      baseUrl: 'https://app.getbased.health',
      fetchImpl,
    })).rejects.toThrow(
      'OPTIONS /api/proxy failed: The operation was aborted due to timeout',
    );
  });

  it('preserves the original fetch diagnostic when the base URL is malformed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('original fetch failure');
    });

    await expect(waitForExpectedDeployment({
      baseUrl: 'not-an-absolute-url',
      expectedSha: SHA,
      fetchImpl,
      attempts: 1,
    })).rejects.toThrow(
      'GET not-an-absolute-url/api/commit failed: original fetch failure',
    );
  });
});
