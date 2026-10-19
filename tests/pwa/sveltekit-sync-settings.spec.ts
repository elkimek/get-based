import {nativeTabKey} from '../helpers/native-tab-key.js';
import {awaitStaticThemeReady} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { artifactInputs } from './kit-native-receipts.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const syncOwners = ['js/state.js', 'js/settings-sync-classes.js', 'js/settings-sync-component.js', 'js/components/SyncSettings.svelte',
  'js/sync-dialog-classes.js', 'js/sync-dialog-component.js', 'js/components/SyncDialog.svelte'] as const;
const syncSheets = ['css/settings.css'] as const;
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function openSync(page: Page) {
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, {timeout: 30_000});
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  await page.locator('[data-shell-action="open-settings"]').click();
  await page.locator('#settings-nav-data').click();
  await expect(page.locator('[data-sync-settings-view]')).toBeVisible();
}

test('Sync settings mount on offline first use and cold launch without changing identity or persisted preferences', async ({ page, context }) => {
  test.setTimeout(150_000);
  const ownedArtifact = await artifactInputs(syncOwners, syncSheets);
  expect(ownedArtifact.directory).toBe(artifact);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00.000Z',
      appVersion: 'kit-test', location: 'local-test' }));
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    const preferences = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /sync|messenger|agent-access/.test(key))));
    const missingCapability = await page.evaluate(() => {
      if (!navigator.locks?.request) return 'navigator.locks';
      if (!navigator.storage) return 'StorageManager';
      if (!navigator.storage.getDirectory) return 'OPFS';
      if (!crypto.subtle) return 'crypto.subtle';
      return null;
    });
    server.state.offline = true;
    await openSync(page);
    const panel = page.locator('[data-sync-settings-view]');
    await expect(panel.locator('.sync-settings-badge')).toHaveText('Off');
    await expect(panel.locator('[data-sync-action="toggle-sync"]')).not.toBeChecked();
    const setup = panel.locator('[data-sync-action="setup-new-direct"]');
    if (missingCapability) {
      await expect(setup).toBeDisabled();
      await expect(panel.locator('[role="status"]')).toContainText(missingCapability);
      await expect(panel.locator('[data-sync-action="toggle-sync"]')).toBeDisabled();
    } else {
      await expect(setup).toBeEnabled();
      await expect(panel.locator('[data-sync-action="toggle-sync"]')).toBeEnabled();
    }
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
      await awaitStaticThemeReady(page, theme);
      await page.locator('[data-tweaks-action="close"]').click();
      const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
      await openSync(page);
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await panel.scrollIntoViewIfNeeded();
        expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const violations = await panel.evaluate(async element => {
          const result = await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element,
            { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
          return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
        });
        expect(violations, `${theme} ${viewport.width}`).toEqual([]);
        const join = panel.locator('[data-sync-action="setup-restore-direct"]');
        const coarsePointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
        for (const control of [setup, join]) {
          // Original Sync management controls are 36px on fine pointers;
          // their explicit coarse variants enlarge accessible touch targets.
          expect(await control.evaluate(element => ['gb:sync:min-h-9',
            'gb:sync:[@media(pointer:coarse)]:min-h-11', 'gb:sync:[@media(pointer:coarse)]:min-w-11']
            .every(token => element.classList.contains(token)))).toBe(true);
          expect(await control.evaluate(element => element.classList.contains('gb:sync:min-h-11'))).toBe(false);
          await expect(control).toHaveAttribute('type', 'button');
          await expect(control).toHaveCSS('min-height', coarsePointer ? '44px' : '36px');
          if (coarsePointer) {
            const target = await control.evaluate(element => { const rect = element.getBoundingClientRect(); return {width: rect.width, height: rect.height}; });
            expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
          }
        }
        if (missingCapability) await expect(join).toBeDisabled();
        else {
          await expect(join).toBeEnabled(); await join.focus();
          await page.keyboard.press(nativeTabKey(page)); await page.keyboard.press(nativeTabKey(page, true)); await expect(join).toBeFocused();
        }
      }
    }
    if (!missingCapability) {
      await panel.locator('[data-sync-action="setup-restore-direct"]').press('Enter');
      const dialog = page.locator('[data-sync-dialog-view]');
      await expect(dialog).toBeVisible();
      await expect(page.locator('#sync-setup-restore-input')).toBeFocused();
      await page.locator('#sync-setup-restore-input').fill('invalid synthetic words');
      await expect(page.locator('#sync-setup-restore-msg')).toContainText('3');
      await expect(page.locator('#sync-setup-restore-go')).toBeDisabled();
      await page.locator('#sync-setup-restore-input').fill('synthetic '.repeat(24));
      await expect(page.locator('#sync-setup-restore-go')).toBeEnabled();
      const violations = await dialog.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element,
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
      expect(violations).toEqual([]);
      await page.locator('[data-sync-setup-action="setup-back"]').click();
      await expect(page.locator('#sync-setup-restore-input')).toBeHidden();
      await expect(page.locator('#sync-setup-restore-input')).toHaveValue('');
      await page.locator('[data-sync-setup-action="setup-cancel"]').click();
      await expect(page.locator('#sync-setup-overlay')).toBeHidden();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('#sync-setup-restore-input')).toHaveCount(0);
    }
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /sync|messenger|agent-access/.test(key))))).toEqual(preferences);
    await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(cold); await openSync(cold);
    await expect(cold.locator('.sync-settings-badge')).toHaveText('Off');
    await expect(cold.locator('#sync-mnemonic')).toHaveCount(0);
    expect(await cold.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /sync|messenger|agent-access/.test(key))))).toEqual(preferences);
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    expect(errors).toEqual([]);
    expect(await artifactInputs(syncOwners, syncSheets)).toEqual(ownedArtifact);
  } finally { await server.close(); }
});
