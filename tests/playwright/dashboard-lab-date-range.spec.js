import { expect, test } from './coverage-fixture.js';

for (const [layout, width] of [['desktop', 1280], ['mobile', 390]]) {
  test(`${layout} dashboard can restore an older specialty category with All`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      for (const suffix of ['tour', 'emptyTour']) {
        localStorage.setItem(`labcharts-default-${suffix}`, 'completed');
      }
    });
    await page.goto('/app');
    const originalEntries = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const data = await import('/js/data.js');
      (await import('/js/tour.js')).endTour({ openEmptyChat: false });
      (await import('/js/chat-panel.js')).closeChatPanel();
      const key = 'metabolomixMitochondrial.citric';
      state.importedData = {
        entries: [
          { date: '2020-05-26', markers: { [key]: 200 }, markerSources: {
            [key]: { snapshotId: 'synthetic-specialty', file: 'synthetic-specialty.pdf', at: 1000 },
          } },
          { date: new Date().toISOString().slice(0, 10), markers: { 'biochemistry.glucose': 5 } },
        ],
        customMarkers: { [key]: {
          name: 'Citric Acid', unit: 'mmol/mol creatinine',
          categoryLabel: 'Cellular Energy', group: 'Metabolomix+', refMin: 100, refMax: 400,
        } },
      };
      state.dateRangeFilter = '1y';
      data.invalidateActiveDataCache();
      (await import('/js/nav.js')).buildSidebar();
      (await import('/js/views.js')).navigate('dashboard');
      return JSON.stringify(state.importedData.entries);
    });

    const range = page.locator('.dashboard-lab-date-range');
    const specialty = page.locator('#sidebar-nav [data-category="metabolomixMitochondrial"]');
    await expect(range).toBeVisible();
    await expect(page.getByRole('group', { name: 'Lab date range', exact: true })).toHaveCount(1);
    await expect(range).toContainText('Older results and categories may be hidden');
    await expect(range.getByRole('button', { name: '1Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(specialty).toHaveCount(0);
    const bounds = await range.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);

    await range.getByRole('button', { name: 'All', exact: true }).click();
    await expect(range.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(range).toContainText('All saved dates are included');
    await expect(specialty).toHaveCount(1);
    expect(await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      return JSON.stringify(state.importedData.entries);
    })).toBe(originalEntries);
    await page.screenshot({ path: `/tmp/getbased-lab-date-range-${layout}.png` });
  });
}
