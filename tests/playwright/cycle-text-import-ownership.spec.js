import { expect, test } from './coverage-fixture.js';

for (const replacement of ['profile', 'data']) {
  test(`generic cycle CSV read rejects ${replacement} replacement`, async ({ page }) => {
    await page.goto('/app', { waitUntil: 'load' });
    await page.evaluate(async replacement => {
      const { handleTextFile } = await import('/js/pdf-import.js');
      const { state } = await import('/js/state.js');
      let release;
      window.cycleTextImportDone = false;
      const file = {
        name: 'drip.csv', type: 'text/csv',
        text: () => new Promise(resolve => { release = resolve; }),
      };
      const pending = handleTextFile(file).then(() => { window.cycleTextImportDone = true; });
      if (replacement === 'profile') state.currentProfile = 'replacement-profile';
      else state.importedData = { ...state.importedData };
      release('date,bleeding.value,bleeding.exclude\n2026-09-01,1,false');
      void pending;
    }, replacement);
    await expect.poll(() => page.evaluate(() => window.cycleTextImportDone), { timeout: 3000 }).toBe(true);
    await expect(page.locator('[data-cycle-import-action="confirm"]')).toHaveCount(0);
  });
}
