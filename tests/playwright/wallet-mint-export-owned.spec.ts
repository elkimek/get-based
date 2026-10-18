import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
const mint = 'https://mint.minibits.cash/Bitcoin', other = 'https://mint.other.test/with/a/very/long/path/that/must/remain/readable/on/a/narrow/screen';
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

  test('owned mint and export controls preserve responsive accessible states themes and private fields', async ({ page, context }) => {
    test.setTimeout(240_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/wallet-tools-owned', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="mint-host"></div><div id="export-host"></div></main></body></html>');
    await page.goto('/wallet-tools-owned');
    await page.evaluate(async () => { (await import('/js/wallet-mint-component.js')).mountWalletMint(document.getElementById('mint-host')!, { save: () => {}, cancel: () => {}, reload: () => {} }); (await import('/js/wallet-export-component.js')).mountWalletExport(document.getElementById('export-host')!, { prepare: () => {}, copy: () => {}, close: () => {} }); });
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
      for (const state of ['loading', 'saved', 'checking', 'node-unavailable', 'error', 'export-ready', 'export-empty', 'export-error']) {
        await page.evaluate(async ({ state, mint, other }) => {
          const picker = (await import('/js/wallet-mint-component.js')).getWalletMintView()!, exporter = (await import('/js/wallet-export-component.js')).getWalletExportView()!;
          picker.setDraft(other); picker.setState({ mint, saved: state === 'loading' ? [] : [{ mint, balance: 12 }, { mint: other, balance: 7 }], accepted: [other], loading: state === 'loading', pending: state === 'checking', hints: state === 'node-unavailable' ? 'unavailable' : 'ready', status: { text: state === 'error' ? 'Mint selection could not be confirmed. Existing balances and recovery records are preserved; reload balances before retrying.' : state === 'checking' ? 'Checking mint…' : '', tone: state === 'error' ? 'danger' : 'secondary' } });
          exporter.showToken(state === 'export-ready' ? 'cashuAPRIVATE-SYNTHETIC-TOKEN' : ''); exporter.setState({ phase: state === 'export-ready' ? 'ready' : state === 'export-empty' ? 'empty' : state === 'export-error' ? 'error' : 'loading', mint: other, copied: false, pending: !state.startsWith('export-'), status: { text: state === 'export-ready' ? 'Clipboard copy failed. Open Token text to select and copy it manually.' : state === 'export-empty' ? 'Wallet is empty' : state === 'export-error' ? 'Wallet export unavailable. Funds and recovery records are preserved.' : 'Preparing wallet export…', tone: state === 'export-ready' || state === 'export-error' ? 'danger' : 'secondary' } });
        }, { state, mint, other });
        if (state === 'export-ready') await page.locator('[data-wallet-export-view] summary').click();
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const panel of [page.locator('[data-wallet-mint-view]'), page.locator('[data-wallet-export-view]')]) {
            expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
            const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
            expect(violations, `${theme} ${state} ${width}`).toEqual([]);
            for (const control of await panel.locator('button:visible,input:visible,summary:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
            expect(await panel.locator('[data-token],[data-clipboard-text]').count()).toBe(0);
          }
        }
        expect(await page.locator('[data-wallet-export-view]').textContent()).not.toContain('cashuAPRIVATE');
      }
    }
  });
});
test('wallet mint export and balance facades reject late owners while accepted selection preserves a new private view', async ({ page }) => {
  await routeHtml(page, '**/wallet-tools-lifecycle', '<!doctype html><html><body><main id="ai-provider-panel"><div id="routstr-wallet-balance"></div><div id="routstr-mint-label"></div><div id="routstr-mint-edit" style="display:none"></div><div id="routstr-wallet-fund-area" style="display:none"></div><div id="routstr-node-picker" style="display:none"></div></main></body></html>');
  await page.goto('/wallet-tools-lifecycle');
  const results = await page.evaluate(async ({ mint, other }) => {
    localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-chat-backend', 'direct');
    const panels = await import('/js/provider-wallet-panels.js'), tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    let selected = mint, select!: () => void, checked!: (value: number) => void, balance!: (value: number) => void;
    const runtime = { cashuGetMintUrl: async () => selected, nostrGetSelectedNode: () => '', cashuHasWalletSeed: async () => true, cashuGetWalletMints: async () => [{ mint, balance: 12 }, { mint: other, balance: 7 }], cashuSetMintUrl: () => new Promise<void>(resolve => { select = () => { selected = other; resolve(); }; }), cashuGetBalance: async () => 7, cashuGetLocalBalance: async () => 7, cashuGetPendingNodeRefund: async () => null, cashuExportWallet: async () => 'cashuAPRIVATE' }; panels.configureRoutstrWalletRuntime(runtime);
    await panels.showRoutstrMintEdit(); (document.getElementById('routstr-mint-input') as HTMLInputElement).value = other; const selection = panels.doRoutstrMintChange(); await tick();
    await panels.showRoutstrWalletBackup(); const owner = document.querySelector('[data-wallet-export-view]');
    document.getElementById('routstr-node-picker')!.innerHTML = '<button>New recovery action</button>'; document.getElementById('routstr-node-picker')!.style.display = 'block';
    select(); await selection; const acceptedKeptNewOwner = owner === document.querySelector('[data-wallet-export-view]') && document.getElementById('routstr-node-picker')!.textContent!.includes('New recovery action');
    panels.configureRoutstrWalletRuntime({ ...runtime, cashuGetBalance: () => new Promise(resolve => { balance = resolve; }) });
    // A late native withdrawal balance must not replace the owned export slot.
    const withdrawal = panels.showRoutstrWithdraw(); await tick(); await panels.showRoutstrWalletBackup(); balance(99); await withdrawal;
    const lateWithdrawalBlocked = !!document.querySelector('[data-wallet-export-view]') && !document.querySelector('[data-routstr-wallet-action="withdraw-lightning"]');
    panels.configureRoutstrWalletRuntime({ ...runtime, cashuCheckProofStates: () => new Promise(resolve => { checked = resolve; }) });
    const verify = panels.refreshCashuWalletBalance(); await tick(); const old = document.getElementById('routstr-wallet-balance')!; old.replaceWith(Object.assign(document.createElement('div'), { id: old.id, textContent: 'new owner' })); checked(12); await verify;
    const lateBalanceBlocked = document.getElementById(old.id)!.textContent === 'new owner';
    const verifyProvider = panels.refreshCashuWalletBalance(); await tick(); localStorage.setItem('labcharts-ai-provider', 'openrouter'); checked(55); await verifyProvider;
    const providerReplyBlocked = !document.getElementById(old.id)!.textContent!.includes('55');
    localStorage.setItem('labcharts-ai-provider', 'routstr'); panels.configureRoutstrWalletRuntime({ ...runtime, cashuCheckProofStates: async () => { throw new Error('PRIVATE ERROR'); }, cashuGetLocalBalance: async () => 7 }); await panels.refreshCashuWalletBalance();
    const verificationFailureHonest = document.getElementById(old.id)!.textContent!.includes('7 sats (saved balance; check failed)');
    panels.configureRoutstrWalletRuntime({ ...runtime, cashuCheckProofStates: () => new Promise(resolve => { checked = resolve; }) });
    const closed = panels.refreshCashuWalletBalance(); await tick(); panels.clearRoutstrWalletTimers(); checked(17); await closed;
    const closeReplyBlocked = !document.getElementById(old.id)!.textContent!.includes('17');
    panels.configureRoutstrWalletRuntime(); return { closeReplyBlocked, acceptedKeptNewOwner, lateWithdrawalBlocked, lateBalanceBlocked, providerReplyBlocked, verificationFailureHonest };
  }, { mint, other });
  expect(results).toEqual({ closeReplyBlocked: true, acceptedKeptNewOwner: true, lateWithdrawalBlocked: true, lateBalanceBlocked: true, providerReplyBlocked: true, verificationFailureHonest: true });
});
