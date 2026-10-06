import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchCustomApiModels } from '../js/api-custom.js';
import { clearKeyCache, updateKeyCache } from '../js/crypto-key-cache.js';
const keys = ['labcharts-custom-models','labcharts-custom-vision-models','labcharts-custom-model'];
beforeEach(() => { clearKeyCache(); localStorage.clear(); localStorage.setItem('labcharts-custom-url','https://synthetic.test/v1'); updateKeyCache('labcharts-custom-key','SYNTHETIC-OLD'); });
afterEach(() => { vi.unstubAllGlobals(); clearKeyCache(); localStorage.clear(); });
it.each(['endpoint','key','owner'])('rejects a replaced %s before catalog/capability/model writes', async change => {
  let release!: (value: Response) => void; vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { release = done; })));
  for (const key of keys) localStorage.setItem(key,'KEEP'); let current = true;
  const pending = fetchCustomApiModels(undefined, undefined, { isCurrent: () => current });
  if (change === 'endpoint') localStorage.setItem('labcharts-custom-url','https://new.test/v1'); if (change === 'key') updateKeyCache('labcharts-custom-key','NEW'); if (change === 'owner') current = false;
  release(new Response(JSON.stringify({ data: [{ id: 'old-model' }] }))); expect(await pending).toEqual([]); for (const key of keys) expect(localStorage.getItem(key)).toBe('KEEP');
});
it('accepts only the latest request, retains manual choice and publishes vision capabilities', async () => {
  const replies: ((value: Response) => void)[] = []; vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => replies.push(done)))); localStorage.setItem('labcharts-custom-model','manual');
  const older = fetchCustomApiModels(), newest = fetchCustomApiModels(); replies[1]!(new Response(JSON.stringify({ data: [{ id: 'new-model', architecture: { input_modalities: ['text','image'] } }] })));
  expect((await newest)[0]!.id).toBe('new-model'); replies[0]!(new Response(JSON.stringify({ data: [{ id: 'old-model' }] }))); expect(await older).toEqual([]);
  expect(JSON.parse(localStorage.getItem('labcharts-custom-vision-models')!)).toEqual(['new-model']); expect(localStorage.getItem('labcharts-custom-model')).toBe('manual');
});
