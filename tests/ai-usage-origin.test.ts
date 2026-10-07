import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { trackUsage } from '../js/schema.js';
const previousProfile = state.currentProfile;
beforeEach(() => { localStorage.clear(); state.currentProfile = 'replacement'; });
afterEach(() => { state.currentProfile = previousProfile; });
describe('AI usage origin', () => {
  it('retains four-argument attribution to the active profile', () => {
    trackUsage('ollama', 'local-model', 7, 3);
    expect(JSON.parse(localStorage.getItem('labcharts-replacement-usage')!)).toMatchObject({ totalInputTokens: 7, totalOutputTokens: 3, requestCount: 1 });
  });
  it('records accepted request usage against its explicit origin without changing the active profile', () => {
    trackUsage('ollama', 'local-model', 7, 3, 'origin');
    expect(JSON.parse(localStorage.getItem('labcharts-origin-usage')!)).toMatchObject({ totalInputTokens: 7, totalOutputTokens: 3, requestCount: 1 });
    expect(JSON.parse(localStorage.getItem('labcharts-global-usage')!)).toMatchObject({ totalInputTokens: 7, totalOutputTokens: 3, requestCount: 1 });
    expect(localStorage.getItem('labcharts-replacement-usage')).toBeNull();
    expect(state.currentProfile).toBe('replacement');
  });
  it('retains default-profile fallback and ignores zero-token results', () => {
    trackUsage('ollama', 'local-model', 0, 0, 'origin');
    expect(localStorage.getItem('labcharts-origin-usage')).toBeNull();
    expect(localStorage.getItem('labcharts-global-usage')).toBeNull();
    trackUsage('ollama', 'local-model', 2, 1, '');
    expect(JSON.parse(localStorage.getItem('labcharts-default-usage')!)).toMatchObject({ totalInputTokens: 2, totalOutputTokens: 1, requestCount: 1 });
  });
});
