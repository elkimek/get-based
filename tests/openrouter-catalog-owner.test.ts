// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchOpenRouterModels } from '../js/api-models.js';
beforeEach(() => {
  localStorage.clear();
  const data = [{id:'openai/gpt-6-sol',name:'GPT-6 Sol',pricing:{prompt:'0.000001',completion:'0.000002'},architecture:{input_modalities:['text','image']}}];
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data}),{status:200})));
});
afterEach(()=>vi.unstubAllGlobals());
it('rejects stale catalogs before writing pricing, vision, selection or model caches',async()=>{
  const write=vi.spyOn(Storage.prototype,'setItem');
  expect(await fetchOpenRouterModels('test-key',{isCurrent:()=>false})).toEqual([]);
  expect(write).not.toHaveBeenCalled();
});
it('retains the published default fetch contract for current catalogs',async()=>{
  expect(await fetchOpenRouterModels('test-key')).toHaveLength(1);
  expect(localStorage.getItem('labcharts-openrouter-models')).toContain('openai/gpt-6-sol');
  expect(localStorage.getItem('labcharts-openrouter-vision-models')).toContain('openai/gpt-6-sol');
  expect(localStorage.getItem('labcharts-openrouter-pricing')).toContain('openai/gpt-6-sol');
});
