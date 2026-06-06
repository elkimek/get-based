import { test } from '@playwright/test';
import { runLegacyBrowserScript } from './legacy-browser-runner.js';

const UI_REGRESSION_BROWSER_TESTS = [
  ['mobile browser regression script', 'tests/test-mobile.js'],
  ['chat panel UX legacy browser script', 'tests/test-chat-panel-ux.js'],
  ['Lens local worker legacy browser script', 'tests/test-lens-local-worker.js'],
  ['audit-fix legacy browser script', 'tests/test-audit-fixes.js'],
];

for (const [name, path] of UI_REGRESSION_BROWSER_TESTS) {
  test(name, { timeout: 60_000 }, async ({ page }) => {
    await runLegacyBrowserScript(page, path);
  });
}
