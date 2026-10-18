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

  test('owned wallet funding keeps private drafts and accessible states across themes and widths', async ({ page, context }) => {
    test.setTimeout(180_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/wallet-funding-owned', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="funding-host"></div></main></body></html>');
    await page.goto('/wallet-funding-owned');
    await page.evaluate(async () => (await import('/js/wallet-funding-component.js')).mountWalletFunding(document.getElementById('funding-host')!, 0.03, { submitCustom: () => {}, cancelCustom: () => {} }));
    const panel = page.locator('[data-wallet-funding-view]'); const input = panel.locator('#routstr-wcashu-input'); await input.fill('cashuAPRIVATE SYNTHETIC TOKEN');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
      for (const phase of ['idle', 'custom', 'pending', 'invoice', 'paid', 'terminal', 'error']) {
        await page.evaluate(async phase => {
          const view = (await import('/js/wallet-funding-component.js')).getWalletFundingView()!;
          view.clearInvoice(); view.setState({ ...view.getState(), phase: ['invoice', 'paid', 'terminal', 'pending'].includes(phase) ? phase as 'invoice' | 'paid' | 'terminal' | 'pending' : 'idle', custom: phase === 'custom', pending: phase === 'pending', amount: 1000, credited: 998, status: { text: phase === 'error' ? 'Token deposit could not be confirmed. Saved recovery data is retained.' : phase === 'terminal' ? 'This invoice expired or was cancelled. Request a new invoice to deposit.' : phase === 'pending' ? 'Creating invoice…' : '', tone: phase === 'error' ? 'danger' : phase === 'terminal' ? 'warning' : 'secondary' }, poll: 'Waiting for payment… Deposits are credited automatically.' });
          if (phase === 'invoice') view.showInvoice({ invoice: 'synthetic-long-invoice-for-private-text-layout-and-user-disclosure', quote: 'private-synthetic-quote', mint: 'https://synthetic-long-original-mint.test/Bitcoin', amount: 1000, qrImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="220" height="220"%3E%3Crect width="220" height="220" fill="white"/%3E%3C/svg%3E' });
        }, phase);
        if (phase === 'invoice') await panel.locator('summary').click();
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 900 }); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${phase} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${phase} ${width}`).toEqual([]);
        }
        for (const control of await panel.locator('button:visible,summary:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        expect(await panel.locator('[data-token],[data-quote],[data-mint],[data-clipboard-text]').count()).toBe(0); await expect(input).toHaveValue('cashuAPRIVATE SYNTHETIC TOKEN');
      }
    }
    await page.evaluate(async () => { const input = document.getElementById('routstr-wcashu-input') as HTMLInputElement; (await import('/js/wallet-funding-component.js')).disposeWalletFunding(); if (input.value) throw new Error('Private token retained after close'); });
    await expect(panel).toHaveCount(0);
  });
});

test('wallet funding entry rejects late seed prerequisites after close or a different wallet action', async ({ page }) => {
  await routeHtml(page, '**/wallet-funding-lifecycle', '<!doctype html><html><body><main id="ai-provider-panel"><div id="routstr-wallet-fund-area" style="display:none"></div></main></body></html>');
  await page.goto('/wallet-funding-lifecycle');
  const result = await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-chat-backend', 'direct');
    const panels = await import('/js/provider-wallet-panels.js'); const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    let seedReady!: (value: boolean) => void;
    panels.configureRoutstrWalletRuntime({ cashuHasWalletSeed: () => new Promise<boolean>(resolve => { seedReady = resolve; }), cashuGetBalance: async () => 0 });
    panels.showRoutstrWalletFund(); panels.clearRoutstrWalletTimers(); seedReady(true); await tick();
    const closeBlocked = !document.querySelector('[data-wallet-funding-view]');
    let seedCreated!: (value: { mnemonic: string }) => void;
    panels.configureRoutstrWalletRuntime({ cashuHasWalletSeed: async () => false, cashuGenerateWalletSeed: () => new Promise(resolve => { seedCreated = resolve; }), cashuGetBalance: async () => 0 });
    panels.showRoutstrWalletFund(); await tick(); await panels.showRoutstrWithdraw(); seedCreated({ mnemonic: 'PRIVATE SYNTHETIC RECOVERY WORDS' }); await tick();
    const withdrawalRetained = !!document.querySelector('[data-routstr-wallet-action="withdraw-lightning"]') && !document.body.textContent!.includes('PRIVATE SYNTHETIC');
    panels.clearRoutstrWalletTimers(); panels.configureRoutstrWalletRuntime(); return { closeBlocked, withdrawalRetained };
  });
  expect(result).toEqual({ closeBlocked: true, withdrawalRetained: true });
});
