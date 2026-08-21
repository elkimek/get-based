import { afterEach, describe, expect, it } from 'vitest';

import { createCompatProxyServer } from '../server/compat-proxy-server.js';

const servers = new Set();

afterEach(async () => {
  await Promise.all(Array.from(servers, server => new Promise(resolve => server.close(resolve))));
  servers.clear();
});

async function listen(server) {
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

describe('compatibility proxy Node adapter', () => {
  it('exposes a body-free health response and rejects unrelated paths', async () => {
    const port = await listen(createCompatProxyServer({
      proxyHandler: () => new Response(null, { status: 204 }),
    }));
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
    const missing = await fetch(`http://127.0.0.1:${port}/other`);
    expect(missing.status).toBe(404);
  });

  it('adapts forwarded HTTPS requests and streams the handler response', async () => {
    const port = await listen(createCompatProxyServer({
      proxyHandler: async request => new Response(JSON.stringify({
        url: request.url,
        method: request.method,
        body: await request.json(),
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'X-Adapter': 'ok' },
      }),
    }));
    const response = await fetch(`http://127.0.0.1:${port}/api/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Host': 'sync.getbased.health',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ operation: 'test' }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-adapter')).toBe('ok');
    await expect(response.json()).resolves.toEqual({
      url: 'https://sync.getbased.health/api/proxy',
      method: 'POST',
      body: { operation: 'test' },
    });
  });
});
