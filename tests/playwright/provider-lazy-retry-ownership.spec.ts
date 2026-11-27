import {expect, test} from './coverage-fixture.js';
import {routeHtml} from '../helpers/browser-static-routes.js';

const providerEntries = [
  {module: 'api-local', action: 'callOpenAICompatibleLocalAPI'},
  {module: 'api-venice', action: 'getVeniceBalance'},
  {module: 'api-openrouter', action: 'getOpenRouterBalance'},
  {module: 'api-routstr', action: 'getRoutstrBalance'},
  {module: 'api-ppq', action: 'callPpqPrivateAPI'},
  {module: 'api-custom', action: 'callCustomAPI'},
] as const;

for (const {module, action} of providerEntries) {
  test('shares the cold ' + module + ' load and retries only at its fixed public URL', async ({page}) => {
    await routeHtml(page, '**/provider-lazy-retry-ownership', '<!doctype html><p>Provider loader fixture</p>', 200);
    const requests: string[] = [];
    await page.route('**/js/' + module + '.js*', async route => {
      const url = new URL(route.request().url());
      const target = url.pathname + url.search;
      requests.push(target);
      if (url.search === '') {
        await route.fulfill({status: 503, contentType: 'application/javascript', body: '// Temporarily unavailable'});
      } else {
        await route.fulfill({status: 200, contentType: 'application/javascript', body:
          'export function ' + action + '(...args) { return { action: ' + JSON.stringify(action) + ', args }; }'});
      }
    });
    await page.goto('/provider-lazy-retry-ownership');

    const result = await page.evaluate(async actionName => {
      const source = '/js/api.js';
      const facade = await import(source) as Record<string, (input: unknown) => Promise<unknown>>;
      const invoke = facade[actionName];
      if (!invoke) throw new Error('Provider façade does not expose ' + actionName);
      const first = await Promise.allSettled([invoke({fixture: 'initial-a'}), invoke({fixture: 'initial-b'})]);
      const [second, third] = await Promise.all([invoke({fixture: 'retry-a'}), invoke({fixture: 'retry-b'})]);
      return {first: first.map(value => value.status), second, third};
    }, action);
    expect(result).toEqual({
      first: ['rejected', 'rejected'],
      second: {action, args: [{fixture: 'retry-a'}]},
      third: {action, args: [{fixture: 'retry-b'}]},
    });
    expect(requests).toEqual(['/js/' + module + '.js', '/js/' + module + '.js?lazy-retry=1']);
  });
}
