import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchRoutstrModels } from '../js/api-routstr.js';
import { clearKeyCache, updateKeyCache } from '../js/crypto-key-cache.js';
const node = 'https://synthetic-routstr.test';
const keys = ['labcharts-routstr-models', 'labcharts-routstr-private-models', 'labcharts-routstr-pricing', 'labcharts-routstr-vision-models', 'labcharts-routstr-model', 'labcharts-routstr-model-regular', 'labcharts-routstr-model-private'];
const data = [
  { id: 'claude-sonnet-4.6', name: 'Claude', enabled: true, pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { input_modalities: ['text','image'] } },
  { id: 'tinfoil-gemma4-31b', name: 'Private', enabled: true },
];
beforeEach(() => { clearKeyCache(); localStorage.clear(); localStorage.setItem('labcharts-routstr-node', node); updateKeyCache('labcharts-routstr-key', 'sk-old-synthetic'); });
afterEach(() => { vi.unstubAllGlobals(); clearKeyCache(); localStorage.clear(); });
it.each(['node','key','view'])('rejects a replaced initiating %s before all cache and selection writes', async replacement => {
  let release!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
  for (const key of keys) localStorage.setItem(key, 'KEEP');
  let current = true; const request = fetchRoutstrModels({ isCurrent: () => current });
  if (replacement === 'node') localStorage.setItem('labcharts-routstr-node', 'https://replacement.test');
  if (replacement === 'key') updateKeyCache('labcharts-routstr-key', 'sk-replacement-synthetic');
  if (replacement === 'view') current = false;
  release(new Response(JSON.stringify({ data })));
  expect(await request).toEqual([]); for (const key of keys) expect(localStorage.getItem(key)).toBe('KEEP');
});
it('accepts only the latest catalog request for a node, preserving capability and private-mode caches', async () => {
  const releases: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { releases.push(resolve); })));
  const older = fetchRoutstrModels(), latest = fetchRoutstrModels();
  releases[1]!(new Response(JSON.stringify({ data }))); expect((await latest).map(row => row.id)).toEqual(['claude-sonnet-4.6']);
  releases[0]!(new Response(JSON.stringify({ data: [{ id: 'gpt-6-astra', enabled: true }] }))); expect(await older).toEqual([]);
  expect(JSON.parse(localStorage.getItem(keys[0]!)!).map((row: { id: string }) => row.id)).toEqual(['claude-sonnet-4.6']);
  expect(JSON.parse(localStorage.getItem(keys[1]!)!)[0].id).toBe('tinfoil-gemma4-31b');
  expect(JSON.parse(localStorage.getItem(keys[2]!)!)['claude-sonnet-4.6']).toEqual({ input: 1, output: 2 });
  expect(JSON.parse(localStorage.getItem(keys[3]!)!)).toEqual(['claude-sonnet-4.6']);
});
it('retains the no-argument API and returns the private catalog for a selected private model', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }))));
  localStorage.setItem('labcharts-routstr-model', 'tinfoil-gemma4-31b');
  expect((await fetchRoutstrModels()).map(row => row.id)).toEqual(['tinfoil-gemma4-31b']);
  expect(localStorage.getItem('labcharts-routstr-model')).toBe('tinfoil-gemma4-31b');
});
