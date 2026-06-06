import { test } from '@playwright/test';
import { runLegacyBrowserScript } from './legacy-browser-runner.js';

const LIGHT_SUN_BROWSER_TESTS = [
  ['Light and Sun UI flow legacy browser script', 'tests/test-sun-ui-flow.js'],
  ['silhouette picker legacy browser script', 'tests/test-silhouette-picker.js'],
  ['silhouette region-map legacy browser script', 'tests/test-silhouette-region-map.js'],
];

for (const [name, path] of LIGHT_SUN_BROWSER_TESTS) {
  test(name, { timeout: 60_000 }, async ({ page }) => {
    await runLegacyBrowserScript(page, path);
  });
}
