import { expect, test } from '@playwright/test';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { runBrowserScript } from './browser-script-runner.js';

type ConsoleSnapshot = typeof globalThis & { fixtureOriginalLog: typeof console.log; fixtureOriginalError: typeof console.error };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const scope = globalThis as ConsoleSnapshot;
    scope.fixtureOriginalLog = console.log;
    scope.fixtureOriginalError = console.error;
  });
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => {
    const scope = globalThis as ConsoleSnapshot;
    return console.log === scope.fixtureOriginalLog && console.error === scope.fixtureOriginalError;
  })).toBe(true);
});

test('native script runner retains returned results and successful console output', async ({ page }) => {
  await routeJavaScript(page, '**/tests/fixture-runner.js', 'console.log("2 passed, 0 failed"); return { pass: 2, fail: 0 };');
  const result = await runBrowserScript(page, '/tests/fixture-runner.js');
  expect(result.returnValue).toEqual({ pass: 2, fail: 0 });
  expect(result.messages).toContainEqual({ kind: 'log', text: '2 passed, 0 failed' });
  expect(result.failures).toEqual([]);
});

for (const [source, failure] of [
  ['return { nested: { pass: 1, fail: 1 } };', 'returnValue.nested: 1 passed, 1 failed'],
  ['window.__TEST_RESULTS = { nested: { pass: 1, fail: 1 } };', 'window.__TEST_RESULTS.nested: 1 passed, 1 failed'],
  ['window.__testResults = { nested: { pass: 1, fail: 1 } };', 'window.__testResults.nested: 1 passed, 1 failed'],
  ['console.error("FAIL: fixture console failure");', 'FAIL: fixture console failure'],
  ['throw new Error("fixture crash");', 'CRASH /tests/fixture-runner.js: fixture crash'],
  ['setTimeout(() => { throw new Error("fixture asynchronous error"); }, 0);', 'fixture asynchronous error'],
]) {
  test(`native script runner reports ${failure} and restores console hooks`, async ({ page }) => {
    await routeJavaScript(page, '**/tests/fixture-runner.js', source!);
    await expect(runBrowserScript(page, '/tests/fixture-runner.js')).rejects.toThrow(failure!);
  });
}
