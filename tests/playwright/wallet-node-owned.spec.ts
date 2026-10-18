import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
const node = 'https://node.original.test/with/a/long/path/that/must/remain-readable-on-narrow-screens';
const mint = 'https://mint.original.test/with/a/long/path/that/must/remain-readable-on-narrow-screens';
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

  test('owned node controls preserve responsive accessible states themes and private recovery fields', async ({ page, context }) => {
    test.setTimeout(240_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/wallet-node-owned', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="node-host"></div></main></body></html>');
    await page.goto('/wallet-node-owned');
    await page.evaluate(async () => (await import('/js/wallet-node-component.js')).mountWalletNode(document.getElementById('node-host')!, { connect: () => {}, refresh: () => {}, chooseMint: () => {}, deposit: () => {}, newSession: () => {}, retry: () => {}, copy: () => {}, reclaim: () => {}, close: () => {} }, 'browse'));
    const panel = page.locator('[data-wallet-node-view]');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
      for (const state of ['loading', 'browse', 'discovery-empty', 'deposit', 'mints', 'empty', 'rejected', 'refunds', 'recovery', 'error', 'paid']) {
        await page.evaluate(async ({ state, node, mint }) => {
          const view = (await import('/js/wallet-node-component.js')).getWalletNodeView()!;
          view.clearPrivateFields(); if (state === 'refunds' || state === 'recovery') view.setRecoveries([{ node, mint, token: 'cashuAPRIVATE-SYNTHETIC-TOKEN', id: 'PRIVATE-RECORD', generation: 'PRIVATE-GENERATION', createdAt: 1 }, ...(state === 'refunds' ? [{ node, mint, token: '', id: 'ANOTHER-PRIVATE-RECORD', generation: 'ANOTHER-PRIVATE-GENERATION', createdAt: 2 }] : [])]);
          view.setState({ ...view.getState(), mode: state === 'loading' || state === 'browse' || state === 'discovery-empty' ? 'browse' : state === 'refunds' ? 'refunds' : state === 'recovery' ? 'recovery' : 'deposit', phase: state === 'loading' ? 'loading' : state === 'mints' ? 'mints' : state === 'empty' || state === 'discovery-empty' ? 'empty' : state === 'rejected' ? 'rejected' : state === 'error' ? 'error' : state === 'paid' ? 'paid' : 'ready', node, mint, balance: 1500, discovered: 2, nodes: state === 'browse' ? [{ url: node, name: 'Synthetic node', operator: 'npub-very-long-operator-that-wraps-in-narrow-layouts', models: 2, privateTee: true, tor: true }] : [], accepted: [{ mint, balance: 1500 }, { mint: 'https://another-accepted.mint.test', balance: null }], pending: state === 'loading', status: { text: state === 'error' ? 'Node operation unavailable or awaiting confirmation. Funds and recovery records are preserved.' : state === 'paid' ? 'Node operation confirmed.' : '', tone: state === 'error' ? 'danger' : state === 'paid' ? 'success' : 'secondary' } });
        }, { state, node, mint });
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 }); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${state} ${width}`).toEqual([]);
          for (const control of await panel.locator('button:visible,input:visible,textarea:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
          expect(await panel.locator('[data-token],[data-clipboard-text],[data-recovery-id],[data-generation]').count()).toBe(0);
        }
        expect(await panel.innerHTML()).not.toContain('PRIVATE-RECORD'); expect(await panel.innerHTML()).not.toContain('PRIVATE-GENERATION');
      }
    }
  });
});
test('node wallet facade scrubs actual close and keeps accepted deposits bound to their originating mint and account', async ({ page }) => {
  await routeHtml(page, '**/wallet-node-lifecycle', '<!doctype html><html><body><main id="ai-provider-panel"><div id="routstr-wallet-balance"></div><div id="routstr-wallet-fund-area" style="display:none"></div><div id="routstr-node-picker" style="display:none"></div></main></body></html>');
  await page.goto('/wallet-node-lifecycle');
  const result = await page.evaluate(async ({ node, mint }) => {
    localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-chat-backend', 'direct');
    const panels = await import('/js/provider-wallet-panels.js'); const views = await import('/js/wallet-node-component.js'); const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0)); const oldFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ mints: [mint] }), { headers: { 'Content-Type': 'application/json' } });
    let finish!: (value: unknown) => void; let sends = 0; let captured: unknown[] = [];
    panels.configureRoutstrWalletRuntime({ nostrGetSelectedNode: () => node, cashuGetMintUrl: async () => mint, cashuGetBalance: async () => 1500, cashuGetLocalBalance: async () => 1500, cashuHasWalletSeed: async () => true,
      cashuDepositToNode: (...args: unknown[]) => { sends++; captured = args; return new Promise(resolve => { finish = resolve; }); },
      cashuGetPendingNodeRefunds: async () => [{ nodeUrl: node, token: 'cashuAPRIVATE', recoveryId: 'pendingNodeRefund', generation: 'PRIVATE-GENERATION' }], cashuGetTokenMintUrl: async () => mint });
    try {
      await panels.showRoutstrNodeDeposit(node); const input = document.getElementById('routstr-deposit-amount') as HTMLInputElement; input.value = '500'; const pending = panels.doRoutstrNodeDeposit(node, 500);
      for (let i = 0; i < 20 && !sends; i++) await tick(); panels.clearRoutstrWalletTimers(); const inputScrubbed = input.value === '';
      await panels.showSavedNodeRefunds(); const text = document.querySelector('textarea') as HTMLTextAreaElement; await panels.doRoutstrNodeDeposit(node, 500); finish({ api_key: 'sk-synthetic' }); await pending;
      const replacementSafe = sends === 1 && captured[0] === node && captured[1] === 500 && captured[3] === mint && views.getWalletNodeView()!.getState().mode === 'refunds' && text.value === 'cashuAPRIVATE';
      const privateRecovery = !document.querySelector('[data-token],[data-generation],[data-recovery-id]'); panels.clearRoutstrWalletTimers(); const tokenScrubbed = text.value === '';
      return { inputScrubbed, replacementSafe, privateRecovery, tokenScrubbed };
    } finally { window.fetch = oldFetch; panels.configureRoutstrWalletRuntime(); panels.clearRoutstrWalletTimers(); }
  }, { node, mint });
  expect(result).toEqual({ inputScrubbed: true, replacementSafe: true, privateRecovery: true, tokenScrubbed: true });
});
