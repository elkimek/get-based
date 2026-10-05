import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

const WEARABLES_BROWSER_TESTS: [string, string][] = [
  ['wearables detail modal and browser DOM islands', 'tests/test-wearables-dom.js'],
  ['wearables click-driven UI flows', 'tests/test-wearables-ui-flows.js'],
];

for (const [name, path] of WEARABLES_BROWSER_TESTS) {
  (test as (title: string, details: Parameters<typeof test>[1] & {timeout: number}, body: Parameters<typeof test>[2]) => ReturnType<typeof test>)(name, { timeout: 60_000 }, async ({ page }) => {
    await runBrowserScript(page, path);
  });
}
