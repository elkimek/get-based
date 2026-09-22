// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAgentHostService } from '../lib/agent-host-service.js';
function setup(overrides = {}) {
  const client = { getModelCatalog: vi.fn(async () => [{ id: 'local', model: 'local', displayName: 'Local' }]), prompt: vi.fn() };
  const agent = { id: 'hermes', name: 'Hermes', protocol: 'acp', client, ...overrides };
  const service = createAgentHostService({ appServer: null, token: 'pairing-token', workspaceRoot: '/tmp/routing-fixture', agents: [agent] });
  const request = (path, body) => service.handleRequest(new Request(`http://127.0.0.1:8324${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: 'http://127.0.0.1:8000', Authorization: 'Bearer pairing-token', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { request, client };
}
it('keeps the local target available when remote discovery fails', async () => {
  const { request } = setup({ routeProvider: { listRoutes: vi.fn().mockRejectedValue(new Error('private tunnel secret')) } });
  const response = await request('/v1/targets?agent=hermes');
  expect(response.status).toBe(200); const body = await response.json();
  expect(body.targets.map(target => target.id)).toEqual(['local']); expect(JSON.stringify(body)).not.toContain('secret');
});
it('serializes only public route metadata', async () => {
  const { request } = setup({ routes: [{ id: 'gateway', label: 'Remote', kind: 'gateway', token: 'private-token', client: { secret: 'private-secret' }, profile: 'personal', supportsLocalTools: false, supportsFeatureJobs: false, supportsTextFeatureJobs: true }] });
  const response = await request('/v1/targets?agent=hermes'); const body = await response.json();
  expect(body.targets[1]).toMatchObject({ id: 'gateway', kind: 'gateway', supportsLocalTools: false, supportsTextFeatureJobs: true });
  expect(JSON.stringify(body)).not.toContain('private-');
});
it.each(['models', 'turns'])('refuses an unavailable route with a cached client for %s', async endpoint => {
  const remote = { getModelCatalog: vi.fn(), prompt: vi.fn() };
  const { request } = setup({ routes: [{ id: 'gateway', status: 'unavailable', client: remote }] });
  const response = await request(endpoint === 'models' ? '/v1/models?agent=hermes&target=gateway' : '/v1/turns', endpoint === 'turns' ? { agent: 'hermes', target: 'gateway', purpose: 'feature', prompt: 'Hello' } : undefined);
  expect(response.status).toBe(503); expect(remote.getModelCatalog).not.toHaveBeenCalled(); expect(remote.prompt).not.toHaveBeenCalled();
});
it.each(['missing', 'no-client', 'provider-rejection'])('masks %s route resolution failures', async mode => {
  const { request } = setup(mode === 'no-client' ? { routes: [{ id: 'gateway', message: 'private details' }] } : mode === 'provider-rejection' ? { routeProvider: { resolve: vi.fn().mockRejectedValue(new Error('private details')) } } : {});
  const response = await request('/v1/models?agent=hermes&target=gateway');
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('private details');
});
it('passes model and refresh to the selected gateway without contacting the local client', async () => {
  const remote = { getModelCatalog: vi.fn(async () => [{ id: 'remote', model: 'remote', displayName: 'Remote' }]) };
  const resolve = vi.fn(async () => ({ id: 'gateway', client: remote, protocol: 'hermes-gateway' }));
  const { request, client } = setup({ routeProvider: { resolve } });
  const response = await request('/v1/models?agent=hermes&target=gateway&model=remote&refresh=true');
  expect(response.status).toBe(200); expect(resolve).toHaveBeenCalledWith('gateway');
  expect(remote.getModelCatalog).toHaveBeenCalledWith({ model: 'remote', refresh: true }); expect(client.getModelCatalog).not.toHaveBeenCalled();
});
it('masks remote catalog failure', async () => {
  const { request } = setup({ routes: [{ id: 'gateway', client: { getModelCatalog: vi.fn().mockRejectedValue(new Error('secret credentials')) } }] });
  const response = await request('/v1/models?agent=hermes&target=gateway');
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret credentials');
});
it.each(['models', 'turns'])('refuses login-required agents for %s before calling the client', async endpoint => {
  const { request, client } = setup({ status: 'login_required' });
  const response = await request(endpoint === 'models' ? '/v1/models?agent=hermes' : '/v1/turns', endpoint === 'turns' ? { agent: 'hermes', purpose: 'feature', prompt: 'Hello' } : undefined);
  expect(response.status).toBe(401); expect(client.getModelCatalog).not.toHaveBeenCalled(); expect(client.prompt).not.toHaveBeenCalled();
});
