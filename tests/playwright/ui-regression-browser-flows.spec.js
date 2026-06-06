import { test } from '@playwright/test';
import { runBrowserScript } from './browser-script-runner.js';

const UI_REGRESSION_BROWSER_TESTS = [
  ['mobile browser regression fixture', 'tests/test-mobile.js'],
  ['chat panel UX browser fixture', 'tests/test-chat-panel-ux.js'],
  ['Lens local worker browser fixture', 'tests/test-lens-local-worker.js'],
  ['audit-fix browser fixture', 'tests/test-audit-fixes.js'],
];

for (const [name, path] of UI_REGRESSION_BROWSER_TESTS) {
  test(name, { timeout: 60_000 }, async ({ page }) => {
    await runBrowserScript(page, path);
  });
}
