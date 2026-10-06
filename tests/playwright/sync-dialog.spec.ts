import { expect, test } from '@playwright/test';
import { openIsolatedSyncSetupPage } from '../helpers/sync-settings-page.js';

test('owned Sync dialogs preserve accessible themes, word entry, focus and short-screen scrolling', async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await openIsolatedSyncSetupPage(page);
  const modes = ['choices', 'generated', 'join-empty', 'join-valid', 'join-error', 'join-pending', 'restore-valid', 'restore-error', 'restore-pending', 'reloading'];
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async value => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(value); }, theme);
    for (const mode of modes) {
      await page.evaluate(async mode => {
        const dialogs = await import('/js/sync-dialog-component.js');
        const owner = dialogs.openSyncDialog(mode.startsWith('restore') ? 'restore' : 'setup', () => dialogs.disposeSyncDialog());
        const words = Array.from({ length: 24 }, (_, i) => `synthetic${i + 1}`).join(' ');
        if (mode === 'generated') { owner.patch({ step: 'new' }); owner.showGeneratedPhrase(words); }
        if (mode.startsWith('join') || mode === 'reloading') owner.patch({ step: 'join' });
        if (!['choices', 'generated', 'join-empty'].includes(mode)) {
          (document.querySelector('textarea') as HTMLTextAreaElement).value = words; owner.validate();
        }
        if (mode.endsWith('error')) owner.patch({ message: 'Could not restore. Verify all 24 words and try again.', tone: 'danger' });
        if (mode.endsWith('pending')) owner.patch({ pending: true, message: 'Checking the 24-word identity…' });
        if (mode === 'reloading') { owner.clearSecrets(); owner.patch({ pending: true, reloading: true, message: 'Identity accepted. Reloading this device…', tone: 'success' }); }
        owner.focusFirst();
      }, mode);
      const dialog = page.locator('[data-sync-dialog-view]'); await expect(dialog).toBeVisible();
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${mode}`).toBe(true);
        const violations = await dialog.evaluate(async element => {
          const result = await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element,
            { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
          return result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
        });
        expect(violations, `${theme} ${mode} ${viewport.width}`).toEqual([]);
      }
      for (const button of await dialog.locator('button:visible').all()) await expect(button).toHaveCSS('min-height', '44px');
    }
  }
  await page.evaluate(async () => {
    const dialogs = await import('/js/sync-dialog-component.js'); const owner = dialogs.openSyncDialog('restore', () => dialogs.disposeSyncDialog()); owner.focusFirst();
  });
  const dialog = page.locator('[data-sync-dialog-view]'); const field = dialog.locator('textarea');
  await expect(field).toBeFocused(); await field.fill('synthetic '.repeat(23));
  await page.evaluate(async () => (await import('/js/sync-dialog-component.js')).getSyncDialogOwner()!.validate());
  await expect(dialog.locator('#sync-restore-dialog-go')).toBeDisabled();
  await expect(field).toHaveAttribute('autocorrect', 'off'); await expect(field).toHaveAttribute('autocapitalize', 'none'); await expect(field).toHaveAttribute('spellcheck', 'false');
  const cancel = dialog.locator('[data-sync-action="close-restore-dialog"]'); await cancel.focus(); await page.keyboard.press('Tab'); await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(cancel).toBeFocused();
  await page.setViewportSize({ width: 390, height: 320 });
  expect(await dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await cancel.scrollIntoViewIfNeeded(); await expect(cancel).toBeInViewport();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});
