import { test } from '@playwright/test';
import { runLegacyBrowserScript } from './legacy-browser-runner.js';

const CORE_FLOW_BROWSER_TESTS = [
  ['export/import legacy browser script', 'tests/test-export-import.js'],
  ['UI flows legacy browser script', 'tests/test-ui-flows.js'],
];

for (const [name, path] of CORE_FLOW_BROWSER_TESTS) {
  test(name, { timeout: 120_000 }, async ({ page }) => {
    await runLegacyBrowserScript(page, path);
  });
}
