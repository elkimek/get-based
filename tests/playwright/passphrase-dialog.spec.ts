import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PassphraseKind } from '../../js/passphrase-contract.js';

const modes: PassphraseKind[] = ['enable', 'change', 'unlock', 'erase', 'encryption-nudge', 'backup-nudge'];
async function open(page: Page, mode: PassphraseKind) {
  await page.evaluate(async kind => {
    const dialog = await import('/js/passphrase-component.js');
    const ui = await import('/js/crypto-ui.js');
    dialog.disposePassphraseDialog();
    ui.configureCryptoUi({ getEncryptionEnabled: () => false });
    if (kind === 'enable') await ui.showEnableEncryptionModal();
    else if (kind === 'change') await ui.changePassphrase();
    else if (kind === 'unlock' || kind === 'erase') {
      ui.showPassphraseModal(() => {});
      if (kind === 'erase') document.getElementById('passphrase-forgot-btn')!.click();
    } else if (kind === 'encryption-nudge') {
      localStorage.removeItem('labcharts-encryption-nudge-dismissed');
      ui.maybeShowEncryptionNudge();
    } else {
      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'synthetic' }]));
      localStorage.setItem('labcharts-synthetic-imported', JSON.stringify({ entries: [{}] }));
      for (const key of ['labcharts-backup-nudge-snoozed-until', 'labcharts-last-manual-backup', 'labcharts-folder-backup-last']) localStorage.removeItem(key);
      ui.maybeShowBackupNudge();
    }
  }, mode);
  await expect(page.getByRole('dialog').filter({ has: page.locator('.passphrase-title') })).toBeVisible();
}

test('protection dialogs preserve six modes, theme accessibility, focus and responsive containment', async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'kit-test', location: 'local-test' }));
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async value => {
      const themes = await import('/js/theme.js');
      await themes.loadExtraThemesStylesheet();
      themes.setTheme(value);
    }, theme);
    for (const mode of modes) {
      await open(page, mode);
      if (mode === 'enable') {
        await page.locator('#passphrase-set-input').fill('short');
        await page.locator('#passphrase-confirm-input').fill('short');
        await page.locator('#passphrase-confirm-input').press('Enter');
        await expect(page.locator('#passphrase-set-error')).toHaveText('At least 8 characters');
        await page.locator('#passphrase-set-input').fill('SyntheticStrong1!');
        await page.locator('#passphrase-confirm-input').fill('SyntheticStrong1!');
        await expect(page.locator('.passphrase-rules li.met')).toHaveCount(4);
      } else if (mode === 'change') {
        await page.locator('#passphrase-new2-input').press('Enter');
        await expect(page.locator('#passphrase-change-error')).toHaveText('Enter current passphrase');
      } else if (mode === 'unlock') {
        await page.locator('#passphrase-unlock-input').press('Enter');
        await expect(page.locator('#passphrase-error')).toHaveText('Please enter your passphrase');
      }
      const dialog = page.locator('.passphrase-dialog');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const layout = await dialog.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, overflow: element.scrollWidth > element.clientWidth };
        });
        expect(layout.overflow, `${theme} ${mode} ${viewport.width}`).toBe(false);
        expect(layout.x).toBeGreaterThanOrEqual(0); expect(layout.y).toBeGreaterThanOrEqual(0);
        expect(layout.x + layout.width).toBeLessThanOrEqual(viewport.width);
        expect(layout.y + layout.height).toBeLessThanOrEqual(viewport.height);
        const violations = await dialog.evaluate(async element => {
          const result = await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element,
            { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
          return result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
        });
        expect(violations, `${theme} ${mode} ${viewport.width}`).toEqual([]);
      }
      const controls = dialog.locator('input,button');
      for (const control of await controls.all()) await expect(control).toHaveCSS('min-height', '44px');
      await controls.first().focus(); await page.keyboard.press('Shift+Tab'); await expect(controls.last()).toBeFocused();
      await page.keyboard.press('Tab'); await expect(controls.first()).toBeFocused();
      await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 390, height: 320 }); await open(page, 'enable');
  const dialog = page.locator('.passphrase-dialog');
  expect(await dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.locator('#passphrase-set-input').fill('short'); await page.locator('#passphrase-confirm-input').fill('short');
  await page.locator('#passphrase-confirm-input').press('Enter');
  await expect(page.locator('#passphrase-set-error')).toHaveText('At least 8 characters');
  await page.locator('#passphrase-set-cancel').click(); await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const ui = await import('/js/crypto-ui.js');
    const target = window as unknown as { eraseChecks: { attempts: number; clears: number; reloads: number } };
    target.eraseChecks = { attempts: 0, clears: 0, reloads: 0 };
    ui.configureCryptoUi({ eraseAllLocalAppData: async () => { if (++target.eraseChecks.attempts === 1) throw new Error('Synthetic blocked database'); }, clearEncryptionSession: () => { target.eraseChecks.clears++; }, reloadApp: () => { target.eraseChecks.reloads++; } });
  });
  await open(page, 'erase'); await page.locator('#passphrase-forgot-confirm').click();
  await expect(page.locator('#passphrase-erase-error')).toContainText('Synthetic blocked database');
  expect(await page.evaluate(() => (window as unknown as { eraseChecks: unknown }).eraseChecks)).toEqual({ attempts: 1, clears: 0, reloads: 0 });
  await expect(page.locator('#passphrase-forgot-confirm')).toHaveText('Retry Erase');
  await page.locator('#passphrase-forgot-confirm').click(); await expect(page.locator('.passphrase-dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { eraseChecks: unknown }).eraseChecks)).toEqual({ attempts: 2, clears: 1, reloads: 1 });
  expect(errors).toEqual([]);
});
