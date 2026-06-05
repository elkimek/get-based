import { expect, test } from '@playwright/test';

test('blood pressure manual log form is idempotent', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(() => {
    if (typeof window.openManualLogForm !== 'function') {
      return { available: false };
    }

    const card = document.createElement('div');
    card.className = 'wearable-card-empty';
    card.dataset.emptyMetric = 'bp_systolic';
    document.body.appendChild(card);

    try {
      window.openManualLogForm('bp_systolic');
      const formCountFirst = card.querySelectorAll('.wearable-log-form').length;

      window.openManualLogForm('bp_systolic');
      const formCountSecond = card.querySelectorAll('.wearable-log-form').length;
      const sysInputPresent = !!document.getElementById('wl-bp-sys');

      return {
        available: true,
        formCountFirst,
        formCountSecond,
        sysInputPresent,
      };
    } finally {
      card.remove();
    }
  });

  if (!result.available) {
    throw new Error('window.openManualLogForm is not exposed - wearables.js handler missing');
  }
  expect(result.formCountFirst).toBe(1);
  expect(result.formCountSecond).toBe(1);
  expect(result.sysInputPresent).toBe(true);
});
