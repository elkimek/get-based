// Regression cases from the Routstr fund-safety audit. Simulated services only.
import { expect, test } from './coverage-fixture.js';

test('a new node can be selected while old mint funds remain, with explicit mint selection', async ({ page }) => {
  await page.goto('/app');
  const initial = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { profileStorageKey } = await import('/js/profile-storage-key.js');
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profileStorageKey(state.currentProfile, suffix), 'completed');
    (await import('/js/tour.js')).endTour({ openEmptyChat: false });
    const panels = await import('/js/provider-wallet-panels.js');
    const api = await import('/js/api.js');
    const discovery = await import('/js/nostr-discovery.js');
    const first = 'https://mint.first.test', second = 'https://mint.second.test';
    let selectedMint = first;
    const balances = { [first]: 879, [second]: 0 };
    window.__mintTest = { changes: [], requests: [] };
    await api.saveRoutstrKey('sk-existing-zero-node', 'https://old-node.test');
    discovery.setSelectedNodeUrl('https://old-node.test');
    const render = () => '<div id="routstr-wallet-balance"></div><div id="routstr-mint-label"></div><div id="routstr-mint-edit" style="display:none"></div><div id="routstr-wallet-fund-area" style="display:none"></div><div id="routstr-node-picker"></div>';
    document.body.innerHTML = '<div id="ai-provider-panel">' + render() + '</div>';
    window.fetch = async (url, options) => {
      window.__mintTest.requests.push({ url, method: options?.method || 'GET' });
      return new Response(JSON.stringify(String(url).endsWith('/models') ? { data: [] } : { nuts: {}, mints: [second + '/'] }));
    };
    panels.configureRoutstrWalletPanels({ requestProviderActivation: async () => true, renderAIProviderPanel: render });
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      cashuGetMintUrl: async () => selectedMint,
      cashuGetBalance: async () => balances[selectedMint],
      cashuGetWalletMints: async () => Object.entries(balances).map(([mint, balance]) => ({ mint, balance, active: mint === selectedMint })),
      cashuSetMintUrl: async mint => { selectedMint = mint; window.__mintTest.changes.push(mint); },
      cashuDepositToNode: async () => { throw new Error('Node selection must not deposit'); },
    });
    await panels.connectRoutstrNode('https://new-node.test');
    return { selectedNode: discovery.getSelectedNodeUrl(), selectedMint, key: api.getRoutstrKey(), previousKey: api.getRoutstrKey('https://old-node.test') };
  });
  expect(initial).toEqual({ selectedNode: 'https://new-node.test', selectedMint: 'https://mint.first.test', key: '', previousKey: 'sk-existing-zero-node' });
  await expect(page.locator('#routstr-node-picker')).toContainText('879 sats');
  await page.locator('[data-routstr-wallet-action="choose-node-mint"]').click();
  await expect(page.locator('#routstr-mint-input')).toHaveValue('https://mint.second.test');
  await expect(page.locator('#routstr-mint-edit')).toContainText('879 sats');
  expect(await page.evaluate(() => window.__mintTest.changes)).toEqual([]);
  await page.locator('[data-routstr-wallet-action="save-mint"]').click();
  await expect(page.locator('#routstr-mint-label')).toHaveText('mint.second.test');
  await expect(page.locator('#routstr-wallet-balance')).toContainText('0 sats');
  await expect(page.locator('#routstr-node-picker')).toBeHidden();
  await page.evaluate(async () => (await import('/js/provider-wallet-panels.js')).showRoutstrNodeDeposit('https://new-node.test'));
  await expect(page.locator('#routstr-node-picker')).toContainText('Use Deposit in the Wallet section above');
  await page.evaluate(async () => (await import('/js/provider-wallet-panels.js')).showRoutstrMintEdit());
  await page.locator('[data-routstr-wallet-action="set-mint-input"][data-mint-url="https://mint.first.test"]').click();
  await page.locator('[data-routstr-wallet-action="save-mint"]').click();
  await expect(page.locator('#routstr-wallet-balance')).toContainText('879 sats');
  expect(await page.evaluate(() => window.__mintTest.requests.every(request => request.method === 'GET'))).toBe(true);
});

test('funding recovery cannot show an old balance under a newly selected mint', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-provider', 'routstr');
    localStorage.setItem('labcharts-chat-backend', 'direct');
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-wallet-balance"></div><div id="routstr-mint-label"></div>';
    let mint = 'https://mint.first.test';
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      cashuRecoverPendingFunding: async () => ({ mint, balance: 879, recovered: 0, pending: 0, results: [] }),
      cashuGetMintUrl: async () => mint,
      cashuGetBalance: async () => {
        if (mint === 'https://mint.first.test') {
          mint = 'https://mint.second.test';
          return 879;
        }
        return 0;
      },
      cashuGetLocalBalance: async () => {
        if (mint === 'https://mint.first.test') { mint = 'https://mint.second.test'; return 879; }
        return 0;
      },
    });
    panels.startRoutstrFundingMonitor();
  });
  await expect(page.locator('#routstr-mint-label')).toHaveText('mint.second.test');
  await expect(page.locator('#routstr-wallet-balance')).toHaveText('⚡ 0 sats');
});

test('a failed node mint lookup cannot submit a deposit', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/provider-wallet-panels.js');
    document.body.innerHTML = '<div id="routstr-deposit-status"></div>';
    let deposits = 0;
    window.fetch = async () => new Response('{}', { status: 503 });
    panels.configureRoutstrWalletRuntime({ cashuDepositToNode: async () => { deposits++; } });
    await panels.doRoutstrNodeDeposit('https://node.test', 10);
    return { deposits, message: document.body.textContent };
  });
  expect(result.deposits).toBe(0);
  expect(result.message).toContain('Could not check');
});

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
