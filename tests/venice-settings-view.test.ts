import { afterEach, expect, it } from 'vitest';
import { buildVeniceSettingsSnapshot, readVeniceModels, veniceBalance } from '../js/venice-settings-view.js';
import { getVeniceE2EE } from '../js/api.js';
import { updateKeyCache } from '../js/crypto.js';
afterEach(() => { localStorage.clear(); updateKeyCache('labcharts-venice-key', null); });
it('reads malformed regular and encrypted catalogs without changing the saved model or encryption preference', () => {
  localStorage.setItem('labcharts-venice-model', 'e2ee-saved');
  localStorage.setItem('labcharts-venice-e2ee', 'on');
  for (const cached of ['null', '{}', '{bad', '[null, {"id":7}, {"id":"valid","name":"Visible model"}]']) {
    localStorage.setItem('labcharts-venice-e2ee-models', cached);
    const snapshot = buildVeniceSettingsSnapshot();
    expect(snapshot.models.selectedModel).toBe('e2ee-saved');
    expect(snapshot.mode.enabled).toBe(true); expect(getVeniceE2EE()).toBe(true);
    expect(readVeniceModels(true).map(model => model.id)).toEqual(cached.startsWith('[') ? ['valid'] : []);
  }
});
it('projects each mode catalog and pricing without raw metadata or API keys', () => {
  updateKeyCache('labcharts-venice-key', 'PRIVATE SYNTHETIC KEY');
  localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'regular', name: 'Regular', secret: 'PRIVATE DATA' }]));
  localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-private', name: 'Encrypted', endpoint: 'PRIVATE ENDPOINT' }]));
  localStorage.setItem('labcharts-venice-pricing', JSON.stringify({ 'e2ee-private': { input: 1, output: 2 } }));
  localStorage.setItem('labcharts-venice-e2ee', 'on'); localStorage.setItem('labcharts-venice-model', 'e2ee-private');
  let snapshot = buildVeniceSettingsSnapshot();
  expect(snapshot.connected).toBe(true); expect(snapshot.models.modelDisplay).toBe('Encrypted');
  expect(snapshot.models.pricing.text).toBe('$1.00/M in · $2.00/M out'); expect(snapshot.mode.active).toBe(true);
  expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE/);
  localStorage.setItem('labcharts-venice-e2ee', 'off'); localStorage.setItem('labcharts-venice-model', 'regular');
  snapshot = buildVeniceSettingsSnapshot(); expect(snapshot.models.modelDisplay).toBe('Regular'); expect(snapshot.mode.active).toBe(false);
});
it.each([
  [null, 'Balance: unavailable', 'secondary'], [{ diem: 'invalid' }, 'Balance: unavailable', 'secondary'],
  [{ diem: 0.05 }, 'Balance: $0.05', 'danger'], [{ diem: '0.25' }, 'Balance: $0.25', 'warning'], [{ diem: 1 }, 'Balance: $1.00', 'success'],
  [{ canConsume: true }, 'Balance: Active', 'success'], [{ canConsume: false }, 'Balance: No balance', 'danger'],
] as const)('renders finite balance and account status %j', (input, text, tone) => { expect(veniceBalance(input)).toEqual({ text, tone }); });
