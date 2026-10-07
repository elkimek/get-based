import { expect, test } from './coverage-fixture.js';
import { routeHtml } from '../helpers/browser-static-routes.js';

test('context insights reject obsolete transport responses and let edits and refresh replace pending work', async ({ page }) => {
  await routeHtml(page, '**/context-insight-owner-fixture', '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Context insight ownership</title></head><body></body></html>');
  await page.goto('/context-insight-owner-fixture');
  const results = await page.evaluate(async () => {
    const { contextStatusFixture, contextStatusElement } = await import('/tests/helpers/context-card-status-fixture.js');
    const [{ state }, health, profile, crypto] = await Promise.all([
      import('/js/state.js'), import('/js/context-card-health-dots.js'), import('/js/profile.js'), import('/js/crypto.js'),
    ]);
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ollama-model', 'context-owner-model');
    crypto.updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'context-owner-model', mode: 'ollama', apiKey: '' }));
    health.configureContextCardHealthDots({ isActiveDemoProfile: () => false, buildLabContext: () => `Reported breakfast: ${state.importedData.diet?.breakfast || ''}` });
    const originalFetch = window.fetch;
    const pending: { finish(text: string): void }[] = [];
    window.fetch = (input, options) => {
      if (String(input).includes('/v1/chat/completions')) {
        return new Promise<Response>(resolve => pending.push({ finish(summary) { resolve(new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ diet: { dot: 'green', tip: 'Reported data', summary } }) } }],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })); } }));
      }
      return originalFetch(input, options);
    };
    const results: Record<string, boolean> = {};
    const cacheKey = () => profile.profileStorageKey('context-owner', 'contextHealth');
    const waitRequests = async (length: number) => {
      for (let attempt = 0; pending.length < length && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
      if (pending.length < length) throw new Error(`Expected ${length} context transport requests; saw ${pending.length}`);
    };
    const reset = () => {
      globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
      state.currentProfile = 'context-owner'; state.importedData = profile.createDefaultProfileData(); state.importedData.diet = { breakfast: 'eggs' };
      state.profileSex = 'female'; state.profileDob = '1990-01-01'; localStorage.removeItem(cacheKey());
      contextStatusFixture(document.body, ['diet']);
    };
    try {
      reset();
      const original = health.loadContextHealthDots(); await waitRequests(1);
      state.importedData.diet!.breakfast = 'oats';
      const edited = health.loadContextHealthDots(); await waitRequests(2);
      pending[1]!.finish('Reported oats'); await edited;
      pending[0]!.finish('Obsolete eggs'); await original;
      results.editedContextWinsRegardlessOfResponseOrder = edited !== original
        && JSON.parse(localStorage.getItem(cacheKey())!).cardSummaries.diet === 'Reported oats'
        && contextStatusElement('summary', 'diet')?.textContent === 'Reported oats';
      reset();
      const previousOriginUsage = JSON.parse(localStorage.getItem('labcharts-context-owner-usage') || '{}').requestCount || 0;
      const oldProfile = health.loadContextHealthDots(); await waitRequests(3);
      state.currentProfile = 'replacement'; state.importedData = profile.createDefaultProfileData();
      contextStatusFixture(document.body, ['diet'], () => 'Replacement profile');
      pending[2]!.finish('Obsolete profile'); await oldProfile;
      results.profileReplacementKeepsBothCacheAndNewViewUntouched = localStorage.getItem(cacheKey()) === null
        && localStorage.getItem(profile.profileStorageKey('replacement', 'contextHealth')) === null
        && contextStatusElement('summary', 'diet')?.textContent === 'Replacement profile';
      results.obsoleteResponseUsageBelongsToItsOriginatingProfile = localStorage.getItem('labcharts-replacement-usage') === null
        && JSON.parse(localStorage.getItem('labcharts-context-owner-usage')!).requestCount === previousOriginUsage + 1;
      reset();
      const oldRefresh = health.loadContextHealthDots(); await waitRequests(4);
      health.refreshAllHealthDots(); const refreshed = health.loadContextHealthDots(); await waitRequests(5);
      pending[4]!.finish('Refreshed result'); await refreshed;
      pending[3]!.finish('Obsolete before refresh'); await oldRefresh;
      results.manualRefreshReplacesPendingInference = refreshed !== oldRefresh
        && JSON.parse(localStorage.getItem(cacheKey())!).cardSummaries.diet === 'Refreshed result';
      reset();
      const oldModel = health.loadContextHealthDots(); await waitRequests(6);
      localStorage.setItem('labcharts-ollama-model', 'changed-model');
      pending[5]!.finish('Obsolete model'); await oldModel;
      results.modelReplacementCannotLabelOldOutputAsCurrent = localStorage.getItem(cacheKey()) === null
        && contextStatusElement('summary', 'diet')?.textContent === 'Local summary';
    } finally { window.fetch = originalFetch; }
    return results;
  });
  for (const [requirement, passed] of Object.entries(results)) expect(passed, requirement).toBe(true);
});
