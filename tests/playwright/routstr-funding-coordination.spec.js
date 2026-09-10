import { expect, test } from './coverage-fixture.js';

test('the vendored Cashu library receives NUT-17 updates and closes its subscription', async ({ page }) => {
  await page.route('**/funding-monitor-fixture', route => route.fulfill({ contentType: 'text/html', body: '<div>Mint notification fixture</div>' }));
  const requests = [], messages = [];
  await page.route('https://mint.push.test/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ name: 'Test mint', nuts: { '17': { supported: [{ method: 'bolt11', unit: 'sat', commands: ['bolt11_mint_quote'] }] } } }) });
  });
  await page.routeWebSocket('wss://mint.push.test/v1/ws', ws => {
    ws.onMessage(raw => {
      const message = JSON.parse(String(raw));
      messages.push(message);
      if (message.method === 'subscribe') {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { status: 'OK', subId: message.params.subId } }));
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'subscribe', params: { subId: message.params.subId, payload: { quote: 'q1', state: 'PAID', amount: 12 } } }));
      }
    });
  });
  await page.goto('/funding-monitor-fixture');
  await page.addScriptTag({ url: '/vendor/cashu-ts.js' });
  await page.evaluate(async () => {
    const wallet = await import('/js/cashu-wallet.js');
    window.__quoteUpdates = [];
    window.__stopQuoteUpdates = await wallet.subscribeFundingQuotes('https://mint.push.test', ['q1'], update => window.__quoteUpdates.push(update), error => { throw error; });
  });
  await expect.poll(() => page.evaluate(() => window.__quoteUpdates)).toEqual([{ quote: 'q1', state: 'PAID', amount: 12 }]);
  await page.evaluate(() => window.__stopQuoteUpdates());
  await expect.poll(() => messages.map(message => message.method)).toContain('unsubscribe');
  expect(messages[0].params).toMatchObject({ kind: 'bolt11_mint_quote', filters: ['q1'] });
  expect(requests).toEqual(['https://mint.push.test/v1/info']);
});

test('one tab monitors invoices, shares committed receipts, and hands over when closed', async ({ page, context }) => {
  await context.route('**/funding-monitor-fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="routstr-wfund-status" data-quote="q1" data-mint="https://mint.test">Invoice QR</div>' }));
  const start = async tab => {
    await tab.goto('/funding-monitor-fixture');
    await tab.evaluate(async () => {
      const { createFundingMonitor } = await import('/js/provider-wallet-funding-recovery.js');
      window.__fundingStats = { checks: 0, refreshes: 0, paid: false };
      window.__fundingMonitor = createFundingMonitor({
        cashuHasWalletSeed: async () => true,
        cashuRecoverPendingFunding: async () => {
          const stats = window.__fundingStats;
          stats.checks++;
          const paid = stats.paid;
          stats.paid = false;
          return { mint: 'https://mint.test', pending: paid ? 0 : 1, recovered: paid ? 12 : 0, balance: paid ? 12 : 0, pendingQuotes: [], results: paid ? [{ quote: 'q1', mint: 'https://mint.test', paid: true, minted: 12, fee: 0 }] : [] };
        },
      }, async () => { window.__fundingStats.refreshes++; });
      window.__fundingMonitor.start();
    });
  };
  await start(page);
  await expect.poll(() => page.evaluate(() => window.__fundingStats.checks)).toBe(1);
  const follower = await context.newPage();
  await start(follower);
  expect(await follower.evaluate(() => window.__fundingStats.checks)).toBe(0);
  await page.evaluate(() => { window.__fundingStats.paid = true; });
  // Invoice creation in the follower wakes the owner instead of polling twice.
  await follower.evaluate(() => window.__fundingMonitor.start({ recheck: true }));
  await expect(page.locator('#routstr-wfund-status')).toContainText('Payment received');
  await expect(follower.locator('#routstr-wfund-status')).toContainText('Payment received');
  expect(await follower.evaluate(() => window.__fundingStats.checks)).toBe(0);
  await page.close();
  await expect.poll(() => follower.evaluate(() => window.__fundingStats.checks)).toBe(1);
  await follower.close();
});
