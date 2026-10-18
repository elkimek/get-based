import { expect, test } from '@playwright/test';
import { openIsolatedSyncSetupPage } from '../helpers/sync-settings-page.js';

// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('Sync panel preserves variants, accessible themes, keyboard switch and live relay edits', async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await openIsolatedSyncSetupPage(page);
    await page.evaluate(() => {
      (window as unknown as { __settingsSyncSetupStub: unknown }).__settingsSyncSetupStub = {
        calls: [], enabled: false, mnemonic: Array.from({ length: 24 }, (_, i) => `synthetic${i + 1}`).join(' '),
        fingerprint: 'A94F-2C71-B803', enableResult: true, restoreResult: true, relay: 'wss://relay.example',
      };
    });
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async value => {
        const theme = await import('/js/theme.js'); await theme.loadExtraThemesStylesheet(); theme.setTheme(value);
      }, theme);
      for (const mode of ['off', 'blocked', 'paused', 'enabled', 'pending']) {
        await page.evaluate(async mode => {
          const stub = (window as unknown as { __settingsSyncSetupStub: Record<string, unknown> }).__settingsSyncSetupStub;
          stub.enabled = ['enabled', 'pending'].includes(mode); stub.paused = mode === 'paused';
          stub.blocker = mode === 'blocked' ? 'Synthetic unsupported browser' : null;
          stub.pending = mode === 'pending' ? [{ id: 'synthetic-deletion', name: 'A long synthetic profile name for deletion review', at: Date.now() }] : [];
          const ui = await import('/js/settings-sync-panel-impl.js');
          document.querySelector('#sync-section')!.innerHTML = ui.renderSyncSection(); ui.hydrateSettingsSyncPanel();
        }, mode);
        const panel = page.locator('[data-sync-settings-view]'); await expect(panel).toBeVisible();
        if (['enabled', 'pending'].includes(mode)) {
          await expect(panel.locator('#sync-identity-code')).toHaveText('A94F-2C71-B803');
          await panel.locator('summary').click();
          await expect(panel.locator('[data-sync-action="toggle-sync"]')).toBeChecked();
          await expect(panel.locator('.sync-settings-toggle-slider')).toHaveCSS('width', '32px');
          const colors = await panel.locator('.sync-settings-toggle-slider').evaluate(element => {
            const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--accent)'; document.body.appendChild(probe);
            const accent = getComputedStyle(probe).backgroundColor; probe.remove();
            return { fill: getComputedStyle(element).backgroundColor, accent };
          });
          expect(colors.fill).toBe(colors.accent);
          await panel.locator('#sync-relay-input').fill('wss://edited.example');
          await panel.locator('#sync-relay-input').focus();
          await page.evaluate(async () => { (await import('/js/settings-sync-panel-impl.js')).hydrateSettingsSyncPanel(); });
          await expect(panel.locator('#sync-relay-input')).toBeFocused(); await expect(panel.locator('#sync-relay-input')).toHaveValue('wss://edited.example');
        }
        for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${mode} ${viewport.width}`).toBe(true);
          const violations = await panel.evaluate(async element => {
            const result = await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
            return result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
          });
          expect(violations, `${theme} ${mode} ${viewport.width}`).toEqual([]);
          for (const button of await panel.locator('button').all()) await expect(button).toHaveCSS('min-height', '44px');
        }
        if (mode === 'blocked') await expect(panel.locator('[data-sync-action="setup-new-direct"]')).toBeDisabled();
      }
    }
    const panel = page.locator('[data-sync-settings-view]');
    await panel.locator('[data-sync-action="toggle-mnemonic"]').click(); await expect(panel.locator('#sync-mnemonic')).toContainText('synthetic24');
    await panel.locator('[data-sync-action="toggle-mnemonic"]').click(); await expect(panel.locator('#sync-mnemonic')).not.toContainText('synthetic24');
    await panel.locator('[data-sync-action="toggle-sync"]').focus(); await page.keyboard.press('Space');
    await expect(panel.locator('.sync-settings-badge')).toHaveText('Paused');
    await panel.locator('[data-sync-action="resume-sync"]').focus(); await page.keyboard.press('Enter');
    await expect(panel.locator('.sync-settings-badge')).toHaveText('Enabled');
    await panel.locator('summary').click(); await panel.locator('#sync-relay-input').fill('wss://saved.example'); await panel.locator('[data-sync-action="save-relay"]').click();
    expect(await page.evaluate(() => (window as unknown as { __settingsSyncSetupStub: { relay: string } }).__settingsSyncSetupStub.relay)).toBe('wss://saved.example');
  });
});

test('replaced Sync panels ignore stale identity and relay replies and remask live secrets', async ({ page }) => {
  await openIsolatedSyncSetupPage(page);
  await page.evaluate(async () => {
    const stub: Record<string, unknown> = {
      calls: [], enabled: true, mnemonic: 'synthetic-private-phrase', relay: 'wss://old.example',
    };
    stub.fingerprintPromise = new Promise(resolve => { stub.resolveIdentity = resolve; });
    stub.relayPromise = new Promise(resolve => { stub.resolveRelay = resolve; });
    (window as unknown as { __settingsSyncSetupStub: unknown }).__settingsSyncSetupStub = stub;
    const ui = await import('/js/settings-sync-panel-impl.js');
    document.querySelector('#sync-section')!.innerHTML = ui.renderSyncSection();
    ui.hydrateSettingsSyncPanel();
  });
  const panel = page.locator('[data-sync-settings-view]');
  await expect(panel.locator('#sync-identity-code')).toHaveText('Resolving…');
  await expect(panel.locator('#sync-identity-copy')).toBeDisabled();
  await panel.locator('[data-sync-action="toggle-mnemonic"]').click();
  await expect(panel.locator('#sync-mnemonic')).toHaveText('synthetic-private-phrase');
  await page.evaluate(async () => {
    const stub = (window as unknown as { __settingsSyncSetupStub: Record<string, unknown> }).__settingsSyncSetupStub;
    stub.fingerprintPromise = null; stub.fingerprint = 'NEW1-NEW2-NEW3';
    stub.relayPromise = null; stub.connected = false; stub.relay = 'wss://new.example';
    const ui = await import('/js/settings-sync-panel-impl.js');
    document.querySelector('#sync-section')!.innerHTML = ui.renderSyncSection(); ui.hydrateSettingsSyncPanel();
  });
  await expect(panel.locator('#sync-identity-code')).toHaveText('NEW1-NEW2-NEW3');
  await expect(panel.locator('#sync-status-text')).toHaveText('Relay unreachable');
  await expect(panel.locator('#sync-mnemonic')).not.toContainText('synthetic-private-phrase');
  await page.evaluate(() => {
    const stub = (window as unknown as { __settingsSyncSetupStub: { resolveIdentity: (value: string) => void; resolveRelay: (value: boolean) => void } }).__settingsSyncSetupStub;
    stub.resolveIdentity('OLD1-OLD2-OLD3'); stub.resolveRelay(true);
  });
  await expect(panel.locator('#sync-identity-code')).toHaveText('NEW1-NEW2-NEW3');
  await expect(panel.locator('#sync-status-text')).toHaveText('Relay unreachable');
  await panel.locator('[data-sync-action="toggle-mnemonic"]').click();
  await expect(panel.locator('#sync-mnemonic')).toHaveText('synthetic-private-phrase');
  await page.evaluate(() => {
    const stub = (window as unknown as { __settingsSyncSetupStub: Record<string, unknown> }).__settingsSyncSetupStub;
    stub.fingerprint = 'NEXT-1234-5678';
    window.dispatchEvent(new Event('labcharts-sync-owner-changed'));
  });
  await expect(panel.locator('#sync-mnemonic')).not.toContainText('synthetic-private-phrase');
  await expect(panel.locator('#sync-identity-code')).toHaveText('NEXT-1234-5678');
  await page.evaluate(async () => {
    const ui = await import('/js/settings-sync-panel-impl.js'); ui.disposeSyncSection();
  });
  await expect(panel).toHaveCount(0);
});
