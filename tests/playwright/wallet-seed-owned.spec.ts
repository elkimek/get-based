import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
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

  test('owned wallet seed preserves private controls across states themes and widths', async ({ page, context }) => {
    test.setTimeout(180_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/wallet-seed-owned', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="seed-host"></div></main></body></html>');
    await page.goto('/wallet-seed-owned');
    await page.evaluate(async () => { (window as unknown as { seedCalls: string[] }).seedCalls = []; (await import('/js/wallet-seed-component.js')).mountWalletSeed(document.getElementById('seed-host')!, { copy: () => { (window as unknown as { seedCalls: string[] }).seedCalls.push('copy'); }, create: () => {}, restore: () => {}, continue: () => {} }); });
    const panel = page.locator('[data-wallet-seed-view]');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
      for (const state of ['loading', 'missing', 'onboarding', 'manage', 'restore-pending', 'restored', 'error']) {
        await page.evaluate(async ({ state, words }) => {
          const view = (await import('/js/wallet-seed-component.js')).getWalletSeedView()!;
          view.setMnemonic(['onboarding', 'manage', 'restored', 'error'].includes(state) ? words : '');
          view.setState({ mode: state === 'loading' ? 'loading' : state === 'missing' || state === 'restore-pending' ? 'missing' : state === 'onboarding' ? 'onboarding' : 'manage', pending: state === 'loading' || state === 'restore-pending', status: { text: state === 'error' ? 'Cannot replace the wallet seed while funds or recovery records exist. Back up and empty this wallet first.' : state === 'restored' ? '✓ Restored! Balance: ⚡ 4,321 sats' : state === 'restore-pending' ? 'Restoring from mint… (this may take a moment)' : '', tone: state === 'error' ? 'danger' : state === 'restored' ? 'success' : 'secondary' } });
        }, { state, words });
        expect(await panel.textContent()).not.toContain(words);
        if (['manage', 'restored', 'error'].includes(state)) await panel.locator('#wallet-seed-display').click();
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 900 }); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${state} ${width}`).toEqual([]);
        }
        for (const control of await panel.locator('button:visible,input:visible').all()) {
          if (await control.getAttribute('type') === 'checkbox') continue;
          expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        }
        expect(await panel.locator('[data-token],[data-mnemonic],[data-clipboard-text]').count()).toBe(0);
      }
    }
    await page.evaluate(async words => {
      const view = (await import('/js/wallet-seed-component.js')).getWalletSeedView()!; view.setMnemonic(words); view.setState({ mode: 'onboarding', pending: false, status: { text: '', tone: 'secondary' } });
    }, words);
    const reveal = panel.locator('#routstr-seed-phrase'); await reveal.focus(); await reveal.press('Enter'); await expect(reveal).toHaveText(words);
    await reveal.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    await expect(reveal).toHaveText(words); expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(words);
    await page.evaluate(() => window.getSelection()!.removeAllRanges()); await reveal.press('Space'); await expect(reveal).not.toHaveText(words);
    await expect(panel.locator('#routstr-seed-continue')).toBeDisabled(); await panel.locator('#routstr-seed-ack').check(); await expect(panel.locator('#routstr-seed-continue')).toBeEnabled();
    await panel.getByRole('button', { name: 'Copy Seed', exact: true }).click(); expect(await page.evaluate(() => (window as unknown as { seedCalls: string[] }).seedCalls)).toEqual(['copy']);
    await page.evaluate(async () => (await import('/js/wallet-seed-component.js')).disposeWalletSeed()); await expect(panel).toHaveCount(0);
  });
});
test('wallet seed facade rejects late reads generation and acknowledgement after close or owner switch', async ({ page }) => {
  await routeHtml(page, '**/wallet-seed-lifecycle', '<!doctype html><html><body><main id="ai-provider-panel"><div id="routstr-wallet-fund-area" style="display:none"></div></main></body></html>');
  await page.goto('/wallet-seed-lifecycle');
  const results = await page.evaluate(async words => {
    localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-chat-backend', 'direct');
    const panels = await import('/js/provider-wallet-panels.js'); const seed = await import('/js/wallet-seed-component.js'); const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    let mnemonic!: (value: string) => void;
    panels.configureRoutstrWalletRuntime({ cashuGetWalletMnemonic: () => new Promise(resolve => { mnemonic = resolve; }), cashuGetBalance: async () => 0 });
    const reading = panels.showWalletSeedPhrase(); await panels.showRoutstrWithdraw(); mnemonic(words); await reading;
    const readBlocked = !document.querySelector('[data-wallet-seed-view]') && !!document.querySelector('[data-routstr-wallet-action="withdraw-lightning"]');
    let generated!: (value: { mnemonic: string }) => void;
    panels.configureRoutstrWalletRuntime({ cashuHasWalletSeed: async () => false, cashuGenerateWalletSeed: () => new Promise(resolve => { generated = resolve; }) });
    panels.showRoutstrWalletFund(); await tick(); panels.clearRoutstrWalletTimers(); generated({ mnemonic: words }); await tick();
    const generationBlocked = !seed.getWalletSeedView() && !document.body.textContent!.includes(words);
    panels.configureRoutstrWalletRuntime({ cashuHasWalletSeed: async () => false, cashuGenerateWalletSeed: async () => ({ mnemonic: words }) });
    panels.showRoutstrWalletFund(); await tick(); await panels.walletSeedAcknowledged();
    const requiresAck = !!document.getElementById('routstr-seed-continue') && !document.querySelector('[data-wallet-funding-view]');
    const checkbox = document.getElementById('routstr-seed-ack') as HTMLInputElement; checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await panels.showRoutstrWithdraw(); await panels.walletSeedAcknowledged();
    const oldAckBlocked = !!document.querySelector('[data-routstr-wallet-action="withdraw-lightning"]') && !document.querySelector('[data-wallet-funding-view]');
    panels.clearRoutstrWalletTimers(); panels.configureRoutstrWalletRuntime(); return { readBlocked, generationBlocked, requiresAck, oldAckBlocked };
  }, words);
  expect(results).toEqual({ readBlocked: true, generationBlocked: true, requiresAck: true, oldAckBlocked: true });
});
