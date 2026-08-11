import { expect, test } from '@playwright/test';

async function seedMarkerPlacementProfile(page) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  const legalOverlay = page.locator('#legal-consent-overlay');
  if (await legalOverlay.count()) {
    await page.locator('#legal-consent-checkbox').check();
    await page.locator('[data-legal-consent-action="accept"]').click();
    await expect(legalOverlay).toHaveCount(0);
  }
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    state.currentProfile = 'marker-placement-browser-coverage';
    state.currentView = 'biochemistry';
    state.profileSex = null;
    state.profileDob = null;
    state.unitSystem = 'EU';
    state.markerRegistry = {};
    state.importedData = {
      entries: [{
        date: '2026-08-01',
        markers: {
          'biochemistry.glucose': 5.2,
          'lipids.cholesterol': 4.4,
        },
      }],
      notes: [],
      supplements: [],
      healthGoals: [],
      customMarkers: {},
      markerPlacements: {},
      markerNotes: { 'biochemistry.glucose': 'Fasting sample' },
      markerValueNotes: { 'biochemistry.glucose:2026-08-01': 'Morning draw' },
      refOverrides: { 'biochemistry.glucose': { refMin: 4, refMax: 6 } },
      manualValues: { 'biochemistry.glucose:2026-08-01': true },
    };
    data.invalidateActiveDataCache();
    const modal = await import('/js/marker-detail-modal.js');
    await modal.showDetailModal('biochemistry_glucose');
  });
}

test('marker detail moves and restores a marker without re-keying profile data', async ({ page }) => {
  await seedMarkerPlacementProfile(page);

  const detail = page.locator('#detail-modal');
  await expect(detail).toHaveAttribute('data-sync-refresh-item-id', 'biochemistry_glucose');
  await expect(detail.getByRole('button', { name: 'Change category for Glucose' })).toBeVisible();
  await detail.getByRole('button', { name: 'Change category for Glucose' }).click();

  const form = page.locator('#detail-modal.marker-placement-form');
  await expect(form).toBeVisible();
  await expect(form.getByRole('note')).toContainText('Only where this marker appears will change.');
  const category = form.getByLabel('Category');
  await expect(category).toHaveValue('biochemistry');
  await expect(category.locator('option[value="calculatedRatios"]')).toHaveCount(0);
  expect((await category.locator('option').evaluateAll(options => options.map(option => ({
    value: option.value,
    label: option.textContent,
  })))).slice(0, 4)).toEqual([
    { value: 'biochemistry', label: 'Biochemistry' },
    { value: 'lipids', label: 'Lipid Panel' },
    { value: 'hormones', label: 'Hormones' },
    { value: 'electrolytes', label: 'Electrolytes & Minerals' },
  ]);
  await category.selectOption('lipids');
  await form.getByRole('button', { name: 'Move marker' }).click();

  await expect(detail).toHaveAttribute('data-sync-refresh-item-id', 'lipids_glucose');
  await expect(detail).toContainText('Originally Biochemistry');
  const movedState = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      placements: state.importedData.markerPlacements,
      entries: state.importedData.entries,
      markerNotes: state.importedData.markerNotes,
      markerValueNotes: state.importedData.markerValueNotes,
      refOverrides: state.importedData.refOverrides,
      manualValues: state.importedData.manualValues,
    };
  });
  expect(movedState.placements).toEqual({
    'gb:marker:glucose': { categoryKey: 'lipids' },
  });
  expect(movedState.entries[0].markers).toEqual({
    'biochemistry.glucose': 5.2,
    'lipids.cholesterol': 4.4,
  });
  expect(movedState.markerNotes).toEqual({ 'biochemistry.glucose': 'Fasting sample' });
  expect(movedState.markerValueNotes).toEqual({ 'biochemistry.glucose:2026-08-01': 'Morning draw' });
  expect(movedState.refOverrides).toEqual({ 'biochemistry.glucose': expect.objectContaining({ refMin: 4, refMax: 6 }) });
  expect(movedState.manualValues).toEqual({ 'biochemistry.glucose:2026-08-01': true });

  await detail.getByRole('button', { name: 'Restore' }).click();
  await expect(detail).toHaveAttribute('data-sync-refresh-item-id', 'biochemistry_glucose');
  await expect(detail).not.toContainText('Originally Biochemistry');
  expect(await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.importedData.markerPlacements;
  })).toEqual({});
});

test('calculated ratio can move to a regular category and keeps its diagnostics', async ({ page }) => {
  await seedMarkerPlacementProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    state.importedData.entries[0].markers['lipids.triglycerides'] = 1.5;
    state.importedData.entries[0].markers['lipids.hdl'] = 1.2;
    data.invalidateActiveDataCache();
    const modal = await import('/js/marker-detail-modal.js');
    await modal.showDetailModal('calculatedRatios_tgHdlRatio');
  });

  const detail = page.locator('#detail-modal');
  await detail.getByRole('button', { name: 'Change category for TG/HDL Ratio' }).click();
  const category = detail.getByLabel('Category');
  await expect(category.locator('option[value="lipids"]')).toHaveCount(1);
  await category.selectOption('lipids');
  await detail.getByRole('button', { name: 'Move marker' }).click();

  await expect(detail).toHaveAttribute('data-sync-refresh-item-id', 'lipids_tgHdlRatio');
  await expect(detail).toContainText('Originally Calculated Ratios');
  await expect(detail).not.toContainText('Not calculated');
  const movedState = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { getActiveData } = await import('/js/data.js');
    const active = getActiveData();
    return {
      placements: state.importedData.markerPlacements,
      storedMarkers: state.importedData.entries[0].markers,
      ratio: active.categories.lipids.markers.tgHdlRatio,
    };
  });
  expect(movedState.placements).toEqual({
    'gb:marker:tgHdlRatio': { categoryKey: 'lipids' },
  });
  expect(movedState.storedMarkers).not.toHaveProperty('lipids.tgHdlRatio');
  expect(movedState.ratio).toMatchObject({
    storageDotKey: 'calculatedRatios.tgHdlRatio',
    values: [1.25],
  });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    delete state.importedData.entries[0].markers['lipids.hdl'];
    data.invalidateActiveDataCache();
    const modal = await import('/js/marker-detail-modal.js');
    await modal.showDetailModal('lipids_tgHdlRatio');
  });
  await expect(detail).toContainText('Not calculated — Missing: HDL');
});

test('marker placement form remains focused and usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seedMarkerPlacementProfile(page);
  await page.getByRole('button', { name: 'Change category for Glucose' }).click();

  const form = page.locator('#detail-modal.marker-placement-form');
  const category = form.getByLabel('Category');
  await expect(form).toBeVisible();
  await expect(category).toBeFocused();
  await expect(form.getByRole('button', { name: 'Back to marker details' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Move marker' })).toBeVisible();

  const layout = await form.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});
