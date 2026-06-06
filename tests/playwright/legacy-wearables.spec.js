import { test } from '@playwright/test';
import { runLegacyBrowserScript } from './legacy-browser-runner.js';

const WEARABLES_BROWSER_TESTS = [
  ['wearables detail modal and browser DOM islands', 'tests/test-wearables-dom.js'],
  ['wearables click-driven UI flows', 'tests/test-wearables-ui-flows.js'],
];

for (const [name, path] of WEARABLES_BROWSER_TESTS) {
  test(name, async ({ page }) => {
    test.setTimeout(60_000);
    await runLegacyBrowserScript(page, path);
  });
}
