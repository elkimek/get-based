import { afterEach, expect, it, vi } from 'vitest';
import { fetchVeniceModels } from '../js/api-models.js';
const keys = ['labcharts-venice-e2ee-models', 'labcharts-venice-models', 'labcharts-venice-pricing', 'labcharts-venice-vision-models', 'labcharts-venice-models-fetched-at', 'labcharts-venice-model'];
const data = [
  { id: 'regular', type: 'text', name: 'Regular', model_spec: { pricing: { input: { usd: '1' }, output: { usd: '2' } }, capabilities: { supportsVision: true } } },
  { id: 'e2ee-private', type: 'text', name: 'Encrypted', model_spec: { capabilities: { supportsE2EE: true } } },
];
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('rejects a stale credential catalog before capability, pricing or selection writes', async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
  for (const key of keys) localStorage.setItem(key, 'KEEP');
  let current = true;
  const request = fetchVeniceModels('synthetic-old-key', { isCurrent: () => current });
  current = false; release(new Response(JSON.stringify({ data }), { status: 200 }));
  expect(await request).toEqual([]);
  for (const key of keys) expect(localStorage.getItem(key)).toBe('KEEP');
});
it('retains explicit-key fetch compatibility and writes confirmed capabilities and separate catalogs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })));
  expect((await fetchVeniceModels('synthetic-explicit-key')).map(model => model.id)).toEqual(['regular']);
  expect(JSON.parse(localStorage.getItem('labcharts-venice-e2ee-models')!)[0].id).toBe('e2ee-private');
  expect(JSON.parse(localStorage.getItem('labcharts-venice-vision-models')!)).toEqual(['regular']);
  expect(JSON.parse(localStorage.getItem('labcharts-venice-pricing')!).regular).toEqual({ input: 1, output: 2 });
  expect(localStorage.getItem('labcharts-venice-model')).toBe('regular');
});
