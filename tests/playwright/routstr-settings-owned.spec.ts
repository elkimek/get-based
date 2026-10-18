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

  test('owned Routstr shell preserves slots, owns menus and keeps recovery private in accessible layouts', async ({ page, context }) => {
    test.setTimeout(180_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/routstr-shell-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="shell-host"></div></main></body></html>');
    await page.goto('/routstr-shell-owned-test');
    await page.evaluate(async () => {
      const shell = await import('/js/routstr-settings-component.js'), contract = await import('/js/routstr-settings-contract.js'), models = await import('/js/routstr-model-settings-component.js');
      const node = 'https://synthetic-routstr.test';
      const view = shell.mountRoutstrSettings(document.getElementById('shell-host')!, contract.initialRoutstrSettingsState(node, true), { wallet: () => {}, node: () => {}, mints: () => {}, refreshWallet: () => {}, refreshNode: () => {}, refunds: () => {}, copyRecovery: () => {}, reclaimRecovery: () => {} }, { node, key: 'sk-PRIVATE' });
      models.mountRoutstrModelSettings(document.querySelector<HTMLElement>('[data-routstr-model-settings-host]')!, { connected: true, models: { selectedModel: 'tinfoil-a', modelDisplay: 'Private A', groups: [{ label: '', options: [{ value: 'tinfoil-a', label: 'Private A' }] }], pricing: { text: 'Free', tone: 'success' } }, mode: { enabled: true, available: true, active: true } });
      view.showRecovery('deposit', 'cashuA-PRIVATE-DEPOSIT'); view.showRecovery('withdraw', 'cashuA-PRIVATE-WITHDRAW');
    });
    const panel = page.locator('[data-routstr-settings-view]'), menu = panel.locator('#routstr-wallet-menu'), toggle = panel.getByRole('button', { name: 'More wallet actions', exact: true });
    await toggle.click(); await expect(menu).toBeVisible(); await page.keyboard.press('Escape'); await expect(menu).not.toBeVisible(); await expect(toggle).toBeFocused();
    await toggle.click(); await panel.getByText('Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.').click(); await expect(menu).not.toBeVisible();
    const select = panel.locator('#routstr-model-select'); await select.focus();
    const result = await page.evaluate(async () => {
      const view = (await import('/js/routstr-settings-component.js')).getRoutstrSettingsView()!;
      const slots = ['routstr-wallet-fund-area','routstr-mint-edit','routstr-node-picker'].map(id => document.getElementById(id));
      const before = document.getElementById('routstr-model-select');
      view.setState({ ...view.getState(), walletBalance: '⚡ 120 sats', nodeBalance: { text: 'Balance: ⚡ 75 sats', tone: 'warning' } });
      return { preserved: slots.every((slot, index) => slot === document.getElementById(['routstr-wallet-fund-area','routstr-mint-edit','routstr-node-picker'][index]!)) && before === document.getElementById('routstr-model-select'), private: !JSON.stringify(view.getState()).includes('PRIVATE') && !document.getElementById('shell-host')!.innerHTML.includes('PRIVATE') };
    });
    expect(result).toEqual({ preserved: true, private: true }); await expect(select).toBeFocused();
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.evaluate(async theme => {
        const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet();
        if (await themes.setTheme(theme) !== true) throw new Error('Requested theme failed to load: ' + theme);
        const attribute = document.documentElement.getAttribute('data-theme');
        if (themes.getTheme() !== theme || attribute !== (theme === 'dark' ? null : theme)) throw new Error('Requested theme did not become current: ' + theme);
        await document.fonts.ready;
      }, theme);
      for (const state of ['connected', 'no-node', 'menu-open', 'recovery-pending', 'long-node', 'failure']) {
        await page.evaluate(async state => {
          const view = (await import('/js/routstr-settings-component.js')).getRoutstrSettingsView()!;
          const node = state === 'no-node' ? '' : state === 'long-node' ? 'https://' + 'synthetic-'.repeat(12) + '.test' : 'https://synthetic-routstr.test';
          view.setAccount({ node, key: node ? 'sk-PRIVATE' : '' });
          view.setState({ ...view.getState(), menuOpen: state === 'menu-open', walletBalance: state === 'failure' ? '⚡ check failed' : '⚡ 120 sats', mint: 'mint.minibits.cash/Bitcoin', seed: { text: state === 'failure' ? 'Local wallet setup unavailable' : '12-word wallet seed set up on this device', tone: state === 'failure' ? 'danger' : 'success' }, refundNode: state === 'long-node' ? node : '', recoveries: { deposit: { ...view.getState().recoveries.deposit, pending: state === 'recovery-pending' }, withdraw: { ...view.getState().recoveries.withdraw, pending: state === 'recovery-pending' } } });
        }, state);
        for (const width of [1280,700,390,320]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${state} ${width}`).toEqual([]);
          const controls = await panel.locator('button:visible,select:visible').evaluateAll(elements => elements.map(element => ({ tag: element.tagName, id: element.id, height: element.getBoundingClientRect().height })));
          for (const control of controls) expect(control.height, `${theme} ${state} ${width} ${control.tag}#${control.id}`).toBeGreaterThanOrEqual(44);
        }
      }
    }
    const deposit = panel.getByRole('textbox', { name: 'Pending deposit recovery token', exact: true }); const held = await deposit.elementHandle();
    await page.evaluate(async () => (await import('/js/routstr-settings-component.js')).disposeRoutstrSettings()); expect(await held!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await held!.dispose(); await expect(panel).toHaveCount(0);
  });
});
