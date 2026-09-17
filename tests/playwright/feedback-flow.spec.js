import { expect, test } from './coverage-fixture.js';

async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    (await import('/js/tour.js')).endTour({ openEmptyChat: false });
    (await import('/js/utils.js')).dismissAnalyticsConsent();
    globalThis.feedbackOpened = [];
    window.open = (...args) => { globalThis.feedbackOpened.push(args); return null; };
    const { state } = await import('/js/state.js');
    state.unitSystem = 'US';
    state.rangeMode = 'both';
    state.importedData.contextNotes = 'PRIVATE_HEALTH_SENTINEL';
  });
}

for (const width of [1440, 390]) test(`feedback is recoverable and readable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page);
  if (width === 1440) await page.getByRole('button', { name: 'Send Feedback', exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Tweaks', exact: true }).click();
    await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Send Feedback' });
  await expect(dialog).toBeVisible();
  await page.locator('#feedback-title').fill('Units & ranges <check>');
  await page.locator('#feedback-desc').fill('   ');
  await page.getByRole('button', { name: 'Open GitHub draft' }).click();
  expect(await page.evaluate(() => globalThis.feedbackOpened)).toEqual([]);
  await page.locator('#feedback-desc').fill('1. Select US units.\nExpected mg/dL; received mmol/L.');
  await page.getByRole('button', { name: 'Open GitHub draft' }).click();
  const opened = await page.evaluate(() => globalThis.feedbackOpened);
  expect(opened).toHaveLength(1);
  expect(opened[0].slice(1)).toEqual(['_blank', 'noopener,noreferrer']);
  const issue = new URL(opened[0][0]);
  const body = issue.searchParams.get('body');
  expect(body).toContain('- Units: US (conventional)');
  expect(body).toContain('- Ranges: both');
  expect(body).toMatch(/- App version: \d+\.\d+\.\d+/);
  expect(body).not.toContain('PRIVATE_HEALTH_SENTINEL');
  expect(issue.searchParams.get('title')).toBe('[Bug] Units & ranges <check>');
  await expect(page.locator('#feedback-draft')).toHaveValue(body);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue on GitHub' })).toHaveAttribute('href', opened[0][0]);
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  expect(await page.evaluate(async () => (await globalThis.axe.run('#feedback-modal', {
    runOnly: { type: 'rule', values: ['label', 'button-name', 'aria-dialog-name', 'aria-valid-attr-value'] },
  })).violations.map(v => v.id))).toEqual([]);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.evaluate(() => document.getElementById('notification-container')?.replaceChildren());
  await page.screenshot({ path: `/tmp/feedback-review-${width}.png` });
  if (width === 390) {
    await page.evaluate(async () => (await import('/js/theme.js')).setTheme('light'));
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Open GitHub draft' }).scrollIntoViewIfNeeded();
    await expect(page.locator('.feedback-modal-head')).toBeInViewport();
    await page.screenshot({ path: '/tmp/feedback-review-mobile-light.png' });
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.evaluate(async () => (await import('/js/feedback.js')).openFeedbackModal());
  await expect(page.locator('#feedback-title')).toHaveValue('Units & ranges <check>');
  await expect(page.locator('#feedback-desc')).toHaveValue('1. Select US units.\nExpected mg/dL; received mmol/L.');
  await page.locator('#feedback-desc').fill('New report');
  await expect(page.locator('#feedback-result')).not.toBeVisible();
});

test('all feedback types route correctly and long reports survive clipboard denial', async ({ page }) => {
  await prepare(page);
  await page.evaluate(async () => (await import('/js/feedback.js')).openFeedbackModal());
  for (const [type, prefix, label] of [['bug', '[Bug] ', 'bug'], ['feature', '[Feature] ', 'enhancement'], ['idea', '[Idea] ', 'enhancement'], ['other', '', null]]) {
    await page.locator('#feedback-type').selectOption(type);
    await page.locator('#feedback-title').fill('Title');
    await page.locator('#feedback-desc').fill('Meaningful description');
    await page.getByRole('button', { name: 'Open GitHub draft' }).click();
    const url = new URL(await page.evaluate(() => globalThis.feedbackOpened.at(-1)[0]));
    expect(url.searchParams.get('title')).toBe(`${prefix}Title`);
    expect(url.searchParams.get('labels')).toBe(label);
  }
  const longDescription = '</textarea><img src=x onerror=alert(1)> 🧪'.repeat(150);
  await page.locator('#feedback-desc').fill(longDescription);
  await page.getByRole('button', { name: 'Open GitHub draft' }).click();
  expect(await page.evaluate(() => globalThis.feedbackOpened.length)).toBe(4);
  await expect(page.locator('#feedback-result')).toContainText('too long for a prefilled link');
  expect(await page.locator('#feedback-draft').inputValue()).toContain(longDescription);
  await expect(page.locator('#feedback-result img')).toHaveCount(0);
  const link = new URL(await page.getByRole('link', { name: 'Continue on GitHub' }).getAttribute('href'));
  expect(link.searchParams.has('body')).toBe(false);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }));
  await page.getByRole('button', { name: 'Copy report', exact: true }).click();
  expect(await page.locator('#feedback-draft').evaluate(el => el.selectionEnd - el.selectionStart)).toBe((await page.locator('#feedback-draft').inputValue()).length);
});

test('marker suggestions follow US, ANZ and SI after switching units without including personal ranges', async ({ page }) => {
  await prepare(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries = [{ date: '2026-09-17', markers: { 'biochemistry.glucose': 17.1234, 'biochemistry.ast': 1.2345 } }];
    state.profileDob = '1987-11-22';
    state.profileSex = 'female';
    state.importedData.markerLabels = { 'biochemistry.glucose': 'PRIVATE_MARKER_NAME' };
  });
  for (const [profile, marker, range] of [['US', 'glucose', '74.05 to 100.9 mg/dl'], ['ANZ', 'ast', '10.2 to 51 U/L'], ['EU', 'glucose', '4.11 to 5.6 mmol/l']]) {
    await page.evaluate(async ({ profile, marker }) => {
      const { state } = await import('/js/state.js');
      state.unitSystem = profile;
      (await import('/js/data.js')).invalidateActiveDataCache();
      (await import('/js/views.js')).showCategory('biochemistry');
      await (await import('/js/marker-detail-modal.js')).showDetailModal(`biochemistry_${marker}`);
    }, { profile, marker });
    const link = page.locator('.marker-range-suggest');
    const body = new URL(await link.getAttribute('href')).searchParams.get('body');
    expect(body).toContain(`**Default reference:** ${range}`);
    expect(body).not.toMatch(/PRIVATE_|1987-11-22|17\.1234|1\.2345/);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await page.keyboard.press('Escape');
  }
});
