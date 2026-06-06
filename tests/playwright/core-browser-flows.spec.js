import { test } from '@playwright/test';
import { runBrowserScript } from './browser-script-runner.js';

const CORE_FLOW_BROWSER_TESTS = [
  ['export/import browser fixture', 'tests/test-export-import.js'],
  ['UI flows browser fixture', 'tests/test-ui-flows.js'],
];

for (const [name, path] of CORE_FLOW_BROWSER_TESTS) {
  test(name, { timeout: 120_000 }, async ({ page }) => {
    await runBrowserScript(page, path);
  });
}
