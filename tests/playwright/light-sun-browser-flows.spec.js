import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

const LIGHT_SUN_BROWSER_TESTS = [
  ['Light and Sun UI flow browser fixture', 'tests/test-sun-ui-flow.js'],
  ['silhouette picker browser fixture', 'tests/test-silhouette-picker.js'],
  ['silhouette region-map browser fixture', 'tests/test-silhouette-region-map.js'],
];

for (const [name, path] of LIGHT_SUN_BROWSER_TESTS) {
  test(name, { timeout: 60_000 }, async ({ page }) => {
    await runBrowserScript(page, path);
  });
}
