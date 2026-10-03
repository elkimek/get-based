import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

const CORE_FLOW_BROWSER_TESTS: [string, string][] = [
  ['export/import browser fixture', 'tests/test-export-import.js'],
  ['UI flows browser fixture', 'tests/test-ui-flows.js'],
];

for (const [name, path] of CORE_FLOW_BROWSER_TESTS) {
  (test as (title: string, details: Parameters<typeof test>[1] & {timeout: number}, body: Parameters<typeof test>[2]) => ReturnType<typeof test>)(name, { timeout: 120_000 }, async ({ page }) => {
    await runBrowserScript(page, path);
  });
}
