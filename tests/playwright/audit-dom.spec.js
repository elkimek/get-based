import { expect, test } from './coverage-fixture.js';

test('audit runtime guards no-op on adversarial marker ids', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.showCategory === 'function'
      && typeof window.renderChartCard === 'function'
      && !!window._labState
  );

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const originalData = state.importedData;
    const originalSex = state.profileSex;
    const originalDob = state.profileDob;
    const originalView = state.currentView;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      if (!state.importedData?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        state.importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        window.saveImportedData?.();
        window.buildSidebar?.();
      }

      window.showCategory('biochemistry');
      await delay(50);
      const beforeHeading = document.querySelector('.category-header h2')?.textContent || null;

      let quoteInjectionNoop = false;
      let protoNoop = false;
      if (beforeHeading) {
        window.showCategory("hormones');alert(1);//");
        await delay(30);
        quoteInjectionNoop = document.querySelector('.category-header h2')?.textContent === beforeHeading;

        window.showCategory('__proto__');
        await delay(30);
        protoNoop = document.querySelector('.category-header h2')?.textContent === beforeHeading;
      }

      const overlay = document.getElementById('modal-overlay');
      const openBefore = !!overlay?.classList.contains('show');
      window.showDetailModal("biochemistry_glucose');alert(2);//");
      await delay(30);

      const safeRender = window.renderChartCard('biochemistry_glucose', { name: 'Glucose', values: [5] }, ['2025-01-01']) || '';
      return {
        controlCategoryRendered: !!beforeHeading,
        quoteInjectionNoop,
        protoNoop,
        detailModalInjectionNoop: !!overlay?.classList.contains('show') === openBefore,
        unsafeChartCardEmpty: window.renderChartCard("foo';evil('", { name: 'x', values: [1] }, ['2025-01-01']) === '',
        safeChartCardRenders: safeRender.includes('biochemistry_glucose') && safeRender.includes('chart-card'),
      };
    } finally {
      state.importedData = originalData;
      state.profileSex = originalSex;
      state.profileDob = originalDob;
      if (originalView) window.navigate?.(originalView);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
