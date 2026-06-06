import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

const WEARABLES_BROWSER_TESTS = [
  ['wearables detail modal and browser DOM islands', 'tests/test-wearables-dom.js'],
  ['wearables click-driven UI flows', 'tests/test-wearables-ui-flows.js'],
];

for (const [name, path] of WEARABLES_BROWSER_TESTS) {
  test(name, { timeout: 60_000 }, async ({ page }) => {
    await runBrowserScript(page, path);
  });
}
