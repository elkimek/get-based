// Regression cases from the Routstr fund-safety audit. Simulated services only.
import { expect, test } from './coverage-fixture.js';

test('displaying a token preserves its durable journal before copying', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-wallet-fund-area"><div id="routstr-token-result"></div></div>';
    let clearCalls = 0;
    panels.configureRoutstrWalletRuntime({
      cashuSendAsToken: async () => ({ token: 'cashuA-audit-only', amount: 10, remaining: 90 }),
      cashuClearPendingWithdraw: async () => { clearCalls++; },
      cashuHasWalletSeed: async () => true,
    });
    await panels.doRoutstrSendToken(10);
    const visible = document.querySelector('textarea')?.value;
    document.getElementById('routstr-wallet-fund-area').innerHTML = '';
    return { clearCalls, visible, retainedInDom: document.body.textContent.includes('cashuA-audit-only') };
  });
  expect(result).toEqual({ clearCalls: 0, visible: 'cashuA-audit-only', retainedInDom: false });
});

test('depositing into node B never forwards node A bearer key', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    const cryptoStore = await import('/js/crypto.js');
    document.body.innerHTML = '<div id="routstr-deposit-status"></div>';
    localStorage.setItem('labcharts-routstr-node', 'https://node-a.test');
    cryptoStore.updateKeyCache('labcharts-routstr-key', 'sk-node-a-audit');
    window.fetch = async () => new Response(JSON.stringify({ mints: ['https://mint.test'] }));
    let captured;
    panels.configureRoutstrWalletPanels({ requestProviderActivation: async () => true });
    panels.configureRoutstrWalletRuntime({
      cashuGetMintUrl: async () => 'https://mint.test',
      cashuDepositToNode: async (...args) => { captured = args; throw new Error('stop after capturing outbound arguments'); },
      cashuRecoverPendingDeposit: async () => null,
      cashuHasWalletSeed: async () => true,
    });
    await panels.doRoutstrNodeDeposit('https://node-b.test', 10);
    return captured;
  });
  expect(result).toEqual(['https://node-b.test', 10, '']);
});

test('refund journal storage failure displays the already-returned bearer token', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    const cryptoStore = await import('/js/crypto.js');
    cryptoStore.updateKeyCache('labcharts-routstr-key', 'sk-node-a-audit');
    document.body.innerHTML = '<div id="routstr-node-picker"></div>';
    let receiveCalls = 0;
    window.fetch = async () => new Response(JSON.stringify({ token: 'cashuA-refund-audit-only' }));
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      nostrGetSelectedNode: () => 'https://node-a.test',
      cashuRefundNodeToToken: async () => { throw Object.assign(new Error('QuotaExceededError'), { recoveryToken: 'cashuA-refund-audit-only' }); },
      cashuReceiveToken: async () => { receiveCalls++; return { received: 10 }; },
    });
    await panels.doRoutstrNodeWithdraw();
    return { receiveCalls, text: document.body.textContent, hasToken: document.body.innerHTML.includes('cashuA-refund-audit-only') };
  });
  expect(result.receiveCalls).toBe(0);
  expect(result.text).toContain('QuotaExceededError');
  expect(result.hasToken).toBe(true);
});

test('malicious mint invoice is rejected without injecting wallet markup', async ({ page }) => {
  await page.goto('/app');
  await page.addScriptTag({ url: '/vendor/cashu-ts.js' });
  const result = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-wallet-fund-area"><div id="routstr-wfund-status"></div></div>';
    const invoice = 'lnbc10u1q"><img id="audit-injected" src="/audit-missing-image" onerror="window.__auditInjected=true"><a href="';
    // Exercise the real shipped validator; no mint is contacted.
    const wallet = new window.cashuts.Wallet('https://mint.test');
    const amount = window.cashuts.Amount.from(1000);
    wallet.assertBolt11MintQuoteAmount({ amount, request: invoice }, amount);
    window.qrcode = () => ({ addData() {}, make() {}, createSvgTag: () => '<svg></svg>' });
    panels.configureRoutstrWalletRuntime({
      cashuCreateFundingInvoice: async () => ({ quote: 'audit-quote', invoice }),
      cashuCheckFundingStatus: async () => ({ paid: false }),
    });
    await panels.doRoutstrWalletFund(1000);
    panels.clearRoutstrWalletTimers();
    return { injectedElement: !!document.getElementById('audit-injected') };
  });
  expect(result.injectedElement).toBe(false);
  expect(await page.evaluate(() => window.__auditInjected)).toBeUndefined();
});

test('withdrawal UI reports the reduced amount and refuses non-paid results', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<input id="routstr-withdraw-input" value="alice@node.test"><input id="routstr-withdraw-amount" value="50"><div id="routstr-withdraw-status"></div>';
    panels.configureRoutstrWalletRuntime({ cashuWithdrawToAddress: async () => ({ paid: true, amount: 43 }), cashuExecuteWithdraw: async () => ({ paid: false }) });
    await panels.doRoutstrWithdrawQuote();
    const reduced = document.getElementById('routstr-withdraw-status').textContent;
    await panels.doRoutstrWithdrawExecute('pending-quote');
    return { reduced, pending: document.getElementById('routstr-withdraw-status').textContent };
  });
  expect(result.reduced).toContain('Sent 43 sats');
  expect(result.pending).toContain('awaiting confirmation');
  expect(result.pending).not.toContain('Withdrawn');
});

test('refund UI single-flights concurrent clicks across its seed readiness check', async ({ page }) => {
  await page.goto('/app');
  const calls = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-node-picker"></div>';
    let calls = 0;
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      nostrGetSelectedNode: () => 'https://node.test',
      cashuRefundNodeToToken: async () => { calls++; throw new Error('Unconfirmed synthetic refund'); },
    });
    await Promise.all([panels.doRoutstrNodeWithdraw(), panels.doRoutstrNodeWithdraw()]);
    return calls;
  });
  expect(calls).toBe(1);
});

test('wallet refuses to mutate funds without a cross-tab browser lock', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const wallet = await import('/js/cashu-wallet.js');
    try { await wallet.sendAsToken(1); return 'unexpected send'; }
    catch (error) { return error.message; }
  });
  expect(result).toContain('Web Locks support');
});

test('switching back to a saved funded node does not require another deposit', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const panels = await import('/js/provider-wallet-panels.js');
    const discovery = await import('/js/nostr-discovery.js');
    await api.saveRoutstrKey('sk-node-a', 'https://node-a.test');
    await api.saveRoutstrKey('sk-node-b', 'https://node-b.test');
    discovery.setSelectedNodeUrl('https://node-b.test');
    document.body.innerHTML = '<div id="routstr-node-picker"></div>';
    const requests = [];
    window.fetch = async (url, options) => {
      requests.push({ url, key: options?.headers?.Authorization });
      return new Response(JSON.stringify(String(url).endsWith('/models') ? { data: [] } : { balance: 5000 }));
    };
    panels.configureRoutstrWalletPanels({ requestProviderActivation: async () => true });
    panels.configureRoutstrWalletRuntime({
      cashuGetBalance: async () => 0,
      cashuDepositToNode: async () => { throw new Error('Unexpected new deposit'); },
    });
    await panels.connectRoutstrNode('https://node-a.test');
    return { selected: discovery.getSelectedNodeUrl(), key: api.getRoutstrKey(), otherKey: api.getRoutstrKey('https://node-b.test'), requests };
  });
  expect(result.selected).toBe('https://node-a.test');
  expect(result.key).toBe('sk-node-a');
  expect(result.otherKey).toBe('sk-node-b');
  expect(result.requests.some(request => request.url === 'https://node-a.test/v1/balance/info' && request.key === 'Bearer sk-node-a')).toBe(true);
  expect(result.requests.some(request => /create|topup|refund/.test(request.url))).toBe(false);
});

test('custom funding Enter then blur creates exactly one invoice and keeps its QR', async ({ page }) => {
  await page.goto('/app');
  const invoice = (await import('../fixtures/lightning-invoices.js')).makeTestInvoice(500);
  await page.evaluate(async invoice => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-wallet-fund-area"><div id="routstr-wfund-custom-slot"></div><div id="routstr-wfund-status"></div></div><button id="elsewhere">Elsewhere</button>';
    window.qrcode = () => ({ addData() {}, make() {}, createSvgTag: () => '<svg></svg>' });
    window.__fundingCalls = 0;
    panels.configureRoutstrWalletRuntime({
      cashuGetMintUrl: async () => 'https://mint.test',
      cashuHasWalletSeed: async () => false,
      cashuCreateFundingInvoice: async () => { window.__fundingCalls++; return { quote: 'original', invoice }; },
    });
    panels.rsWalletFundCustomInput();
  }, invoice);
  await page.locator('#routstr-wfund-custom').fill('500');
  await page.locator('#routstr-wfund-custom').press('Enter');
  await expect(page.locator('#routstr-wfund-status a')).toHaveAttribute('href', 'lightning:' + invoice);
  await page.locator('#elsewhere').click();
  expect(await page.evaluate(() => window.__fundingCalls)).toBe(1);
  await expect(page.locator('#routstr-wfund-status a')).toHaveAttribute('href', 'lightning:' + invoice);
});

test('concurrent funding clicks cannot replace a slow invoice response', async ({ page }) => {
  await page.goto('/app');
  const invoice = (await import('../fixtures/lightning-invoices.js')).makeTestInvoice(500);
  const result = await page.evaluate(async invoice => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-wfund-status"></div>';
    window.qrcode = () => ({ addData() {}, make() {}, createSvgTag: () => '<svg></svg>' });
    let release, calls = 0;
    panels.configureRoutstrWalletRuntime({
      cashuGetMintUrl: async () => 'https://mint.test', cashuHasWalletSeed: async () => false,
      cashuCreateFundingInvoice: async () => { calls++; return new Promise(resolve => { release = resolve; }); },
    });
    const first = panels.doRoutstrWalletFund(500);
    await Promise.resolve(); await Promise.resolve();
    await panels.doRoutstrWalletFund(1000);
    release({ quote: 'original', invoice }); await first;
    return { calls, href: document.querySelector('a')?.getAttribute('href') };
  }, invoice);
  expect(result).toEqual({ calls: 1, href: 'lightning:' + invoice });
});
