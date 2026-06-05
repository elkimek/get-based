import { expect, test } from '@playwright/test';

async function prepareApp(page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.navigate === 'function');
}

test('lens page shell delegates move and dashboard toggle actions', async ({ page }) => {
  await prepareApp(page);

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const originalView = state.currentView;
    const originalAddDashboard = window.addDashboardWidgetFromLens;
    const originalRemoveDashboard = window.removeDashboardWidgetFromLens;
    const profileId = window.getActiveProfileId?.() || state.currentProfile || 'default';
    const labsOrderKey = `labcharts-${profileId}-lensPageOrder-labs-v1`;
    const savedLabsOrder = localStorage.getItem(labsOrderKey);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      if (!window.getActiveData?.()?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        state.importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        window.saveImportedData?.();
        window.buildSidebar?.();
      }

      localStorage.removeItem(labsOrderKey);
      window.navigate?.('labs');
      await delay(120);

      const widgets = document.querySelector('.lens-page-widgets[data-lens-route="labs"]');
      const beforeFirst = widgets?.querySelector('.dashboard-widget[data-widget-id]')?.dataset.widgetId || '';
      widgets?.querySelector('.dashboard-widget[data-widget-id] [data-lens-page-action="move-widget"][data-lens-page-direction="1"]')?.click();
      await delay(120);
      const afterFirst = document.querySelector('.lens-page-widgets[data-lens-route="labs"] .dashboard-widget[data-widget-id]')?.dataset.widgetId || '';

      const calls = [];
      window.addDashboardWidgetFromLens = id => calls.push(['add', id]);
      window.removeDashboardWidgetFromLens = id => calls.push(['remove', id]);
      const dashboardToggle = document.querySelector('.lens-page-widgets[data-lens-route="labs"] .lens-widget-dashboard-toggle[data-lens-page-action]');
      const toggleAction = dashboardToggle?.dataset.lensPageAction || '';
      const toggleId = dashboardToggle?.dataset.lensPageId || '';
      dashboardToggle?.click();
      await delay(50);

      return {
        shellRenders: !!widgets,
        noInlineHandlers: !!widgets && !widgets.querySelector('.dashboard-widget-tools [onclick], .dashboard-widget-tools [onkeydown]'),
        moveDataAttributes: !!widgets?.querySelector('[data-lens-page-action="move-widget"][data-lens-page-direction="1"]'),
        moveReordersSections: !!beforeFirst && !!afterFirst && beforeFirst !== afterFirst,
        dashboardToggleCallsBridge: !!toggleAction && !!toggleId
          && calls.some(([kind, id]) => id === toggleId && `${kind}-dashboard-widget` === toggleAction),
      };
    } finally {
      window.addDashboardWidgetFromLens = originalAddDashboard;
      window.removeDashboardWidgetFromLens = originalRemoveDashboard;
      if (savedLabsOrder == null) localStorage.removeItem(labsOrderKey);
      else localStorage.setItem(labsOrderKey, savedLabsOrder);
      if (originalView) window.navigate?.(originalView);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
