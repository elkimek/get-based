import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

const UI_REGRESSION_BROWSER_TESTS = [
  ['mobile browser regression fixture', 'tests/test-mobile.js'],
  ['chat panel UX browser fixture', 'tests/test-chat-panel-ux.js'],
  ['Lens local worker browser fixture', 'tests/test-lens-local-worker.js'],
  ['audit-fix browser fixture', 'tests/test-audit-fixes.js'],
];

for (const [name, path] of UI_REGRESSION_BROWSER_TESTS) {
  test(name, { timeout: 60_000 }, async ({ page }) => {
    if (path === 'tests/test-chat-panel-ux.js') {
      // Opening awaits lazy stylesheets; exceed the old fixture's 50 ms sleep.
      await page.route('**/css/chat-panel-open.css*', async route => {
        await new Promise(resolve => setTimeout(resolve, 150));
        await route.continue();
      });
    }
    await runBrowserScript(page, path);
  });
}
