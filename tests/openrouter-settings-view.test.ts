import { afterEach, expect, it } from 'vitest';
import { buildOpenRouterModelState, buildOpenRouterSettingsSnapshot } from '../js/openrouter-settings-view.js';
import { updateKeyCache } from '../js/crypto.js';

afterEach(() => { localStorage.clear(); updateKeyCache('labcharts-openrouter-key', null); });
it('builds a real domain snapshot from a damaged cache without losing the saved manual choice', () => {
  localStorage.setItem('labcharts-openrouter-model', 'custom/saved-model');
  for (const cached of ['null', '{}', '[null, {"id": 7}, {"id": "valid", "name": "Visible model"}]']) {
    localStorage.setItem('labcharts-openrouter-models', cached);
    const snapshot = buildOpenRouterSettingsSnapshot();
    expect(snapshot.models.selectedModel).toBe('custom/saved-model');
    expect(snapshot.models.modelDisplay).toBe('custom/saved-model');
    expect(snapshot.models.groups.flatMap(group => group.options).map(option => option.value)).toEqual(cached.startsWith('[') ? ['valid'] : []);
  }
});
it('projects model labels and pricing while excluding credentials and raw catalog metadata', () => {
  updateKeyCache('labcharts-openrouter-key', 'PRIVATE SYNTHETIC KEY');
  localStorage.setItem('labcharts-openrouter-model', 'synthetic-a');
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id:'synthetic-a', name:'Synthetic A', endpoint:'PRIVATE ENDPOINT', secret:'PRIVATE METADATA' }]));
  localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({ 'synthetic-a': {input:1,output:2} }));
  const snapshot = buildOpenRouterSettingsSnapshot();
  expect(snapshot.connected).toBe(true);
  expect(snapshot.models.modelDisplay).toBe('Synthetic A');
  expect(snapshot.models.pricing.text).toBe('$1.00/M in · $2.00/M out');
  expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE/);
  expect(buildOpenRouterModelState([{id:'synthetic-a',name:'Fresh catalog label'}]).modelDisplay).toBe('Fresh catalog label');
});
