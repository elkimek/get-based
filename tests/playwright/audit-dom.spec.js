import { expect, test } from './coverage-fixture.js';

test('audit runtime guards no-op on adversarial marker ids', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window._labState);

  const results = await page.evaluate(async () => {
    const [{ state }, dataModule, viewsModule, navModule, categoryPageModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/views.js'),
      import('/js/nav.js'),
      import('/js/category-page-view.js'),
    ]);
    const originalData = state.importedData;
    const originalSex = state.profileSex;
    const originalDob = state.profileDob;
    const originalView = state.currentView;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let renameCategoryKey = '';
    const previousCategoryPageDeps = categoryPageModule.configureCategoryPageViewDeps({
      renameCategory: key => { renameCategoryKey = key; },
    });

    try {
      if (!state.importedData?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        state.importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        await dataModule.saveImportedData();
        navModule.buildSidebar();
      }

      viewsModule.showCategory('biochemistry');
      await delay(50);
      const beforeHeading = document.querySelector('.category-header h2')?.textContent || null;
      const tableBtn = document.querySelector('[data-category-page-action="switch-view"][data-category-page-view="table"]');
      tableBtn?.click();
      await delay(30);
      const categoryDelegatesSwitchViews =
        tableBtn?.classList.contains('active') === true
        && !!document.querySelector('.gb-table-shell-data')
        && !document.querySelector('.view-toggle')?.innerHTML.includes('onclick=');

      document.querySelector('[data-category-page-action="rename-category"]')?.click();
      await delay(10);
      const categoryDelegatesRename = renameCategoryKey === 'biochemistry';

      let quoteInjectionNoop = false;
      let protoNoop = false;
      if (beforeHeading) {
        viewsModule.showCategory("hormones');alert(1);//");
        await delay(30);
        quoteInjectionNoop = document.querySelector('.category-header h2')?.textContent === beforeHeading;

        viewsModule.showCategory('__proto__');
        await delay(30);
        protoNoop = document.querySelector('.category-header h2')?.textContent === beforeHeading;
      }

      const overlay = document.getElementById('modal-overlay');
      const openBefore = !!overlay?.classList.contains('show');
      viewsModule.showDetailModal("biochemistry_glucose');alert(2);//");
      await delay(30);

      const safeRender = viewsModule.renderChartCard('biochemistry_glucose', { name: 'Glucose', values: [5] }, ['2025-01-01']) || '';
      return {
        controlCategoryRendered: !!beforeHeading,
        quoteInjectionNoop,
        protoNoop,
        categoryDelegatesSwitchViews,
        categoryDelegatesRename,
        detailModalInjectionNoop: !!overlay?.classList.contains('show') === openBefore,
        unsafeChartCardEmpty: viewsModule.renderChartCard("foo';evil('", { name: 'x', values: [1] }, ['2025-01-01']) === '',
        safeChartCardRenders: safeRender.includes('biochemistry_glucose') && safeRender.includes('chart-card'),
      };
    } finally {
      state.importedData = originalData;
      state.profileSex = originalSex;
      state.profileDob = originalDob;
      categoryPageModule.configureCategoryPageViewDeps(previousCategoryPageDeps);
      if (originalView) viewsModule.navigate(originalView);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
