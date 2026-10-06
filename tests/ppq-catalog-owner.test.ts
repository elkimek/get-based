import { afterEach, expect, it, vi } from 'vitest';
import { fetchPpqModels } from '../js/api-ppq.js';
const keys = ['labcharts-ppq-pricing', 'labcharts-ppq-vision-models', 'labcharts-ppq-private-vision-models', 'labcharts-ppq-models', 'labcharts-ppq-private-models', 'labcharts-ppq-model'];
const data = [{ id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' }, architecture: { input_modalities: ['text', 'image'] } }, { id: 'private/glm-5-2', name: 'GLM private', input: ['text'] }];
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('rejects every stale account catalog write, including model slots, pricing and vision capabilities', async () => {
  let release!: (response: Response) => void; vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
  for (const key of keys) localStorage.setItem(key, 'KEEP'); localStorage.setItem('labcharts-ppq-model-private', 'KEEP');
  let current = true; const work = fetchPpqModels('SYNTHETIC KEY', { isCurrent: () => current }); current = false;
  release(new Response(JSON.stringify({ data }), { status: 200 })); expect(await work).toEqual([]);
  for (const key of keys) expect(localStorage.getItem(key)).toBe('KEEP'); expect(localStorage.getItem('labcharts-ppq-model-private')).toBe('KEEP');
});
it('preserves explicit-key callers and caches only API-listed private entitlement and confirmed capabilities', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })));
  expect((await fetchPpqModels('EXPLICIT KEY')).map(model => model.id)).toEqual(['claude-sonnet-4.6']);
  expect(JSON.parse(localStorage.getItem('labcharts-ppq-private-models')!).map((model: { id: string }) => model.id)).toEqual(['private/glm-5-2']);
  expect(JSON.parse(localStorage.getItem('labcharts-ppq-vision-models')!)).toEqual(['claude-sonnet-4.6']);
  expect(JSON.parse(localStorage.getItem('labcharts-ppq-private-vision-models')!)).toEqual([]);
  expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing')!)['claude-sonnet-4.6']).toEqual({ input: 3, output: 15 });
});
