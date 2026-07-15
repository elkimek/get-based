import { expect, test } from './coverage-fixture.js';

const SESSION_COUNT = 12;

test('all sessions modal renders scrollable session list', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const before = await page.locator('.modal-overlay').count();

  await page.evaluate(async (sessionCount) => {
    const viewsModule = await import('/js/views.js');
    const state = window._labState;
    if (!state?.importedData) throw new Error('window._labState.importedData unavailable');
    if (typeof viewsModule._openAllSessionsModal !== 'function') {
      throw new Error('views._openAllSessionsModal unavailable');
    }

    state.importedData.sunSessions = Array.from({ length: sessionCount }, (_, i) => ({
      id: `sess-modal-probe-${i}`,
      startedAt: Date.now() - (i + 1) * 600000,
      endedAt: Date.now() - (i + 1) * 600000 + 300000,
      doses: { vitamin_d: 100 },
      bodyExposure: { fraction: 0.3, rotatedSides: false },
      safety: { fitzpatrick: 'III' },
      atmosphere: { uvIndex: 6 },
    }));
    state.importedData.deviceSessions = [];

    viewsModule._openAllSessionsModal();
  }, SESSION_COUNT);

  await expect(page.locator('.modal-overlay')).toHaveCount(before + 1);

  const overlay = page.locator('.modal-overlay').nth(before);
  const modal = overlay.locator('.light-sessions-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal).toHaveAttribute('aria-labelledby', 'light-all-sessions-title');

  const summary = modal.locator('.light-sessions-modal-summary');
  await expect(summary).toContainText(/Total\s*12/);
  await expect(summary).toContainText(/Sun\s*12/);
  await expect(summary).toContainText(/Device\s*0/);
  await expect(modal.locator('.sun-sessions-list .sun-session')).toHaveCount(SESSION_COUNT);

  const scrollTop = await modal.evaluate((modalEl) => {
    const body = modalEl.querySelector('.light-sessions-modal-body');
    if (!body) throw new Error('modal body unavailable');
    body.scrollTop = 0;
    // The modal wheel handler intentionally updates scrollTop synchronously.
    modalEl.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 600 }));
    return body.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
});
