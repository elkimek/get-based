import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
const mint = 'https://mint.original.test/with/a/long/path/that/must/remain/readable/on/narrow/screens';
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

  test('owned withdrawal controls preserve responsive accessible states themes and private fields', async ({ page, context }) => {
    test.setTimeout(240_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/wallet-withdraw-owned', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="withdraw-host"></div></main></body></html>');
    await page.goto('/wallet-withdraw-owned');
    await page.evaluate(async () => (await import('/js/wallet-withdraw-component.js')).mountWalletWithdraw(document.getElementById('withdraw-host')!, { lightning: () => {}, token: () => {}, maximum: () => {}, quote: () => {}, execute: () => {}, send: () => {}, copy: () => {}, recover: () => {}, reclaim: () => {}, close: () => {} }));
    const panel = page.locator('[data-wallet-withdraw-view]');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
      for (const state of ['loading', 'lightning', 'token-form', 'quote', 'token', 'pending', 'recovery', 'error', 'paid']) {
        await page.evaluate(async ({ state, mint }) => {
          const view = (await import('/js/wallet-withdraw-component.js')).getWalletWithdrawView()!;
          view.clearPrivateFields(); if (state === 'token' || state === 'recovery') view.showToken('cashuAPRIVATE-SYNTHETIC-TOKEN');
          if (state === 'quote') view.showQuote({ id: 'PRIVATE-QUOTE', mint });
          view.setState({ mode: state === 'loading' ? 'choose' : state === 'token-form' || state === 'token' || state === 'recovery' ? 'token' : 'lightning', phase: state === 'quote' ? 'quote' : state === 'token' || state === 'recovery' ? 'token' : state === 'paid' ? 'paid' : 'form', mint, balance: 1500, amount: 123, fee: 4, recovery: state === 'recovery', copied: false, pending: state === 'loading' || state === 'pending', status: { text: state === 'error' ? 'Withdrawal unavailable or awaiting confirmation. Funds and recovery records are preserved.' : state === 'pending' ? 'Checking fee…' : '', tone: state === 'error' ? 'danger' : 'secondary' } });
        }, { state, mint });
        if (state === 'lightning') await panel.locator('#routstr-withdraw-input').fill('alice@very-long-lightning-address.example.test');
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${state} ${width}`).toEqual([]);
          for (const control of await panel.locator('button:visible,input:visible,textarea:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
          expect(await panel.locator('[data-token],[data-clipboard-text],[data-quote-id]').count()).toBe(0);
        }
        expect(await panel.innerHTML()).not.toContain('PRIVATE-QUOTE');
      }
    }
  });
});
test('wallet withdrawal facade scrubs actual close and retains accepted outgoing operations across replacement', async ({ page }) => {
  await routeHtml(page, '**/wallet-withdraw-lifecycle', '<!doctype html><html><body><main id="ai-provider-panel"><div id="routstr-wallet-balance"></div><div id="routstr-wallet-fund-area" style="display:none"></div></main></body></html>');
  await page.goto('/wallet-withdraw-lifecycle');
  const result = await page.evaluate(async mint => {
    localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-chat-backend', 'direct');
    const panels = await import('/js/provider-wallet-panels.js'); const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    let selected = mint; let finish!: (value: unknown) => void; let sends = 0; let captured = ''; let quoteMint = '';
    panels.configureRoutstrWalletRuntime({ cashuGetMintUrl: async () => selected, cashuGetBalance: async () => 1500, cashuGetLocalBalance: async () => 1500,
      cashuSendAsToken: (_amount: number, mint: string) => { sends++; captured = mint; return new Promise(resolve => { finish = resolve; }); }, cashuCreateWithdrawQuote: async (_invoice: string, mint: string) => { quoteMint = mint; return { quote: 'PRIVATE-QUOTE', amount: 123, fee_reserve: 4 }; } });
    await panels.showRoutstrWithdraw(); await panels.showRoutstrWithdrawLightning();
    const input = document.getElementById('routstr-withdraw-input') as HTMLInputElement; input.value = 'lnbcPRIVATE'; input.dispatchEvent(new Event('input', { bubbles: true })); await panels.doRoutstrWithdrawQuote();
    const privateQuote = !document.querySelector('[data-quote-id]') && document.body.textContent!.includes('Fee reserve') && quoteMint === mint;
    panels.clearRoutstrWalletTimers(); const inputScrubbed = input.value === '';
    await panels.showRoutstrWithdraw(); await panels.showRoutstrWithdrawToken(); const pending = panels.doRoutstrSendToken(500); await tick(); panels.clearRoutstrWalletTimers();
    await panels.showRoutstrWithdraw(); await panels.doRoutstrSendToken(500); finish({ token: 'cashuAPRIVATE', amount: 500, remaining: 1000 }); await pending; await tick();
    const replacementSafe = sends === 1 && captured === mint && !document.querySelector('textarea') && !document.body.textContent!.includes('cashuAPRIVATE');
    await panels.showRoutstrWithdrawLightning(); selected = 'https://new.mint.test';
    const edited = document.getElementById('routstr-withdraw-input') as HTMLInputElement; edited.value = 'lnbcOTHER'; await panels.doRoutstrWithdrawQuote();
    const staleMintRejected = document.body.textContent!.includes('Wallet mint changed') && quoteMint === mint;
    panels.clearRoutstrWalletTimers(); panels.configureRoutstrWalletRuntime(); return { privateQuote, inputScrubbed, replacementSafe, staleMintRejected };
  }, mint);
  expect(result).toEqual({ privateQuote: true, inputScrubbed: true, replacementSafe: true, staleMintRejected: true });
});
