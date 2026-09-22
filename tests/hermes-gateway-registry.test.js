// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHermesGatewayRouteProvider } from '../lib/hermes-gateway-client.js';
let root, registryPath, provider, fetchImpl;
const connection = { id: 'home', kind: 'remote', label: 'Home', url: 'https://one.example', authMode: 'token', token: { encoding: 'plain', value: 'secret-one' } };
const save = connections => writeFileSync(registryPath, JSON.stringify({ connections }));
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gateway-registry-')); registryPath = join(root, 'connections.json');
  fetchImpl = vi.fn(async () => new Response(JSON.stringify({ profiles: [{ name: 'default' }] })));
  provider = createHermesGatewayRouteProvider({ registryPath, fetchImpl }); save([connection]);
});
afterEach(async () => { await provider.close(); rmSync(root, { force: true, recursive: true }); vi.restoreAllMocks(); });
it.each(['token', 'url'])('replaces and closes cached clients when %s changes', async field => {
  const [first] = await provider.listRoutes(); const close = vi.spyOn(first.client, 'close');
  save([{ ...connection, ...(field === 'token' ? { token: { encoding: 'plain', value: 'secret-two' } } : { url: 'https://two.example' }) }]);
  const next = await provider.resolve(first.id);
  expect(close).toHaveBeenCalledOnce(); expect(next.client).not.toBe(first.client);
  expect(next.client[field === 'token' ? 'token' : 'baseUrl']).toBe(field === 'token' ? 'secret-two' : 'https://two.example');
  expect(JSON.stringify(next)).not.toContain('secret-');
});
it('closes and refuses a removed route without requiring a manual refresh', async () => {
  const [route] = await provider.listRoutes(); const close = vi.spyOn(route.client, 'close'); save([]);
  await expect(provider.resolve(route.id)).rejects.toThrow('no longer registered'); expect(close).toHaveBeenCalledOnce();
});
it.each(['oauth', 'protected', 'missing'])('revokes a client when credentials become %s', async mode => {
  const [route] = await provider.listRoutes(); const close = vi.spyOn(route.client, 'close');
  save([{ ...connection, authMode: mode === 'oauth' ? 'oauth' : 'token', token: mode === 'protected' ? { encoding: 'safeStorage', value: 'encrypted' } : undefined }]);
  await expect(provider.resolve(route.id)).rejects.toThrow(); expect(close).toHaveBeenCalledOnce();
  const [unavailable] = await provider.listRoutes(); expect(unavailable.status).toBe('unavailable'); expect(unavailable.client).toBeFalsy();
});
it.each(['reject', 'status', 'json'])('marks profile fetch %s failures unavailable and closes the old client', async mode => {
  const [route] = await provider.listRoutes(); const close = vi.spyOn(route.client, 'close');
  if (mode === 'reject') fetchImpl.mockRejectedValue(new Error('offline'));
  else fetchImpl.mockImplementation(async () => new Response(mode === 'json' ? '{' : '{}', { status: mode === 'status' ? 401 : 200 }));
  await expect(provider.resolve(route.id)).rejects.toThrow('not reachable'); expect(close).toHaveBeenCalledOnce();
});
it.each(['missing', 'malformed', 'oversized'])('handles a %s registry without retaining stale clients', async mode => {
  const [route] = await provider.listRoutes(); const close = vi.spyOn(route.client, 'close');
  if (mode === 'missing') rmSync(registryPath); else writeFileSync(registryPath, mode === 'malformed' ? '{' : ' '.repeat(1024 * 1024 + 1));
  expect(await provider.listRoutes()).toEqual([]); expect(close).toHaveBeenCalledOnce();
});
it('waits for in-flight discovery before closing all created clients', async () => {
  let release; fetchImpl.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const listing = provider.listRoutes();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const closeSpy = vi.spyOn((await import('../lib/hermes-gateway-client.js')).HermesGatewayClient.prototype, 'close');
  const closing = provider.close(); release(new Response('{"profiles":[{"name":"default"}]}'));
  await listing; await closing; expect(closeSpy).toHaveBeenCalledOnce();
});
it('exposes invalid URLs as unavailable and skips non-remote entries', async () => {
  save([null, { kind: 'local' }, { ...connection, url: 'http://unsafe.example' }]);
  const routes = await provider.listRoutes(); expect(routes).toHaveLength(1); expect(routes[0].status).toBe('unavailable'); expect(fetchImpl).not.toHaveBeenCalled();
});
it('uses a default profile when discovery returns no valid names', async () => {
  fetchImpl.mockImplementation(async () => new Response('{"profiles":[null,{"name":""}]}'));
  const [route] = await provider.listRoutes(); expect(route.profile).toBe('default'); expect(route.client).toBeTruthy();
});
