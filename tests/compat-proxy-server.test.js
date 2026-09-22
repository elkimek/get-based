import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCompatProxyServer } from '../server/compat-proxy-server.js';

const servers = new Set();

afterEach(async () => {
  for (const server of servers) server.closeAllConnections();
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
        'X-Forwarded-Host': 'integrations.getbased.health',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ operation: 'test' }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-adapter')).toBe('ok');
    await expect(response.json()).resolves.toEqual({
      url: 'https://integrations.getbased.health/api/proxy',
      method: 'POST',
      body: { operation: 'test' },
    });
  });
});


it('cancels the upstream request and response when the browser disconnects mid-stream', async () => {
  let signal;
  const cancel = vi.fn();
  const port = await listen(createCompatProxyServer({ proxyHandler: request => {
    signal = request.signal;
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('first chunk')); }, cancel,
    }));
  } }));
  const response = await fetch(`http://127.0.0.1:${port}/api/proxy`);
  const reader = response.body.getReader();
  expect((await reader.read()).value.byteLength).toBeGreaterThan(0);
  await reader.cancel();
  await vi.waitFor(() => expect(signal.aborted).toBe(true));
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
});

it.each(['throw', 'reject'])('masks private handler failures by %s', async mode => {
  const port = await listen(createCompatProxyServer({ proxyHandler: () => {
    if (mode === 'throw') throw new Error('private credential');
    return Promise.reject(new Error('private credential'));
  } }));
  const response = await fetch(`http://127.0.0.1:${port}/api/proxy`);
  expect(response.status).toBe(500);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'Compatibility relay failed' });
});
it.each(['GET', 'HEAD'])('handles body-free %s responses', async method => {
  const handler = vi.fn(request => {
    expect(request.body).toBeNull(); return new Response(null, { status: 204 });
  });
  const port = await listen(createCompatProxyServer({ proxyHandler: handler }));
  const response = await fetch(`http://127.0.0.1:${port}/api/proxy`, { method });
  expect(response.status).toBe(204); expect(await response.text()).toBe('');
  expect(handler).toHaveBeenCalledOnce();
});
it('closes the connection on an upstream stream error after headers', async () => {
  const port = await listen(createCompatProxyServer({ proxyHandler: () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('secret transport failure')); },
  })) }));
  await expect(fetch(`http://127.0.0.1:${port}/api/proxy`).then(response => response.text())).rejects.toThrow();
});
it('uses only the first forwarded host and protocol and preserves the query', async () => {
  let url;
  const port = await listen(createCompatProxyServer({ proxyHandler: request => { url = request.url; return new Response(null, { status: 204 }); } }));
  await fetch(`http://127.0.0.1:${port}/api/proxy?provider=test`, { headers: {
    'x-forwarded-host': 'first.test, second.test', 'x-forwarded-proto': 'https, http',
  } });
  expect(url).toBe('https://first.test/api/proxy?provider=test');
});
it('rejects malformed forwarded origins without invoking the handler', async () => {
  const handler = vi.fn(); const port = await listen(createCompatProxyServer({ proxyHandler: handler }));
  const response = await fetch(`http://127.0.0.1:${port}/api/proxy`, { headers: { 'x-forwarded-host': '[' } });
  expect(response.status).toBe(500); expect(handler).not.toHaveBeenCalled();
});
