import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
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

  test('owned Routstr account controls keep secrets private and preserve accessible receipt/error layouts', async ({ page, context }) => {
    test.setTimeout(180_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/routstr-account-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="shell-host"></div></main></body></html>');
    await page.goto('/routstr-account-owned-test');
    await page.evaluate(async () => {
      const shell = await import('/js/routstr-settings-component.js'), contract = await import('/js/routstr-settings-contract.js');
      const node = 'https://synthetic-routstr.test';
      shell.mountRoutstrSettings(document.getElementById('shell-host')!, contract.initialRoutstrSettingsState(node, true), { wallet: () => {}, node: () => {}, mints: () => {}, refreshWallet: () => {}, refreshNode: () => {}, refunds: () => {}, copyRecovery: () => {}, reclaimRecovery: () => {}, account: { save: () => {}, remove: () => {}, copy: () => {}, acknowledge: () => {} } }, { node, key: 'sk-SYNTHETIC' });
    });
    const panel = page.locator('[data-routstr-settings-view]'), disclosure = panel.locator('details');
    await disclosure.locator('summary').click(); const input = panel.locator('#routstr-key-input'); await input.fill('cashuA-PRIVATE-DRAFT');
    expect(await panel.innerHTML()).not.toContain('cashuA-PRIVATE-DRAFT'); await expect(input).toHaveAttribute('type','password');
    await page.evaluate(async () => { const view = (await import('/js/routstr-settings-component.js')).getRoutstrSettingsView()!; view.setState({ ...view.getState(), walletBalance: '⚡ 99 sats' }); }); await expect(input).toHaveValue('cashuA-PRIVATE-DRAFT');
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.evaluate(async theme => {
        const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet();
        if (await themes.setTheme(theme) !== true) throw new Error('Requested theme failed to load: ' + theme);
        const attribute = document.documentElement.getAttribute('data-theme');
        if (themes.getTheme() !== theme || attribute !== (theme === 'dark' ? null : theme)) throw new Error('Requested theme did not become current: ' + theme);
        await document.fonts.ready;
      }, theme);
      for (const mode of ['draft','pending','invalid','receipt','clipboard-error']) {
        await page.evaluate(async mode => {
          const view = (await import('/js/routstr-settings-component.js')).getRoutstrSettingsView()!;
          view.hideReceipt(); view.setConnection({ pending: mode === 'pending', receipt: false, copied: false, text: mode === 'invalid' ? 'Key should start with sk-... (session key) or cashu... (eCash token)' : mode === 'clipboard-error' ? 'Clipboard copy failed. Select and copy the session key manually.' : mode === 'pending' ? 'Converting token to session key…' : '✓ Connected', tone: mode === 'invalid' || mode === 'clipboard-error' ? 'danger' : 'secondary' });
          if (mode === 'receipt' || mode === 'clipboard-error') view.showReceipt({ node: view.getState().node, key: 'sk-' + 'SYNTHETIC-'.repeat(25) });
          document.querySelector('details')!.open = true;
        }, mode);
        for (const width of [1280,700,390,320]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${mode} ${width}`).toBe(true);
          const violations = await disclosure.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations,`${theme} ${mode} ${width}`).toEqual([]);
          const controls = await disclosure.locator('button:visible,input:visible,summary').evaluateAll(elements => elements.map(element => ({ tag: element.tagName, id: element.id, height: element.getBoundingClientRect().height })));
          for (const control of controls) expect(control.height, `${theme} ${mode} ${width} ${control.tag}#${control.id}`).toBeGreaterThanOrEqual(44);
        }
      }
    }
    const receipt = panel.locator('#routstr-session-key-receipt'); await receipt.focus(); expect(await receipt.evaluate(element => (element as HTMLTextAreaElement).selectionEnd - (element as HTMLTextAreaElement).selectionStart)).toBe((await receipt.inputValue()).length);
    await page.screenshot({ path: test.info().outputPath('routstr-account-receipt.png'), fullPage: true });
    expect(await panel.locator('[data-clipboard-text],[data-token],[data-key]').count()).toBe(0); const held = await receipt.elementHandle(); await page.evaluate(async () => (await import('/js/routstr-settings-component.js')).disposeRoutstrSettings()); expect(await held!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await held!.dispose();
  });
});
