import { expect, test } from './coverage-fixture.js';

test('saved funding stays quiet on OpenRouter and stops on provider or backend changes', async ({page}) => {
  await page.route('**/provider-polling-fixture', route => route.fulfill({contentType:'text/html',body:'<div id="routstr-wfund-poll"></div>'}));
  const external = [];
  await page.route(/^https:\/\//, route => { external.push(route.request().url()); return route.abort(); });
  await page.clock.install();
  await page.goto('/provider-polling-fixture');
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-provider','openrouter');
    localStorage.setItem('labcharts-cashu-wallet-mnemonic','synthetic-encrypted-wallet');
    const panels = await import('/js/provider-wallet-panels.js');
    window.pollStats = {checks:0,subscribes:0,cancels:0};
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      cashuGetLocalWalletBalance: async () => 0,
      cashuRecoverPendingFunding: async () => {
        window.pollStats.checks++;
        return {pending:1,results:[],pendingQuotes:[{mint:'https://mint.synthetic.test',quote:'q1'}]};
      },
      cashuSubscribeFundingQuotes: async () => {
        window.pollStats.subscribes++;
        return () => { window.pollStats.cancels++; };
      },
    });
    await import('/js/settings-provider-bridge.js');
    panels.startRoutstrFundingMonitor();
  });
  await page.clock.runFor(120000);
  expect(await page.evaluate(() => window.pollStats)).toEqual({checks:0,subscribes:0,cancels:0});
  await page.evaluate(async () => (await import('/js/api.js')).setAIProvider('routstr'));
  await expect.poll(() => page.evaluate(() => window.pollStats.checks)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.pollStats.subscribes)).toBe(1);
  await page.evaluate(async () => (await import('/js/api.js')).setAIProvider('openrouter'));
  await expect.poll(() => page.evaluate(() => window.pollStats.cancels)).toBe(1);
  await page.clock.runFor(120000);
  expect(await page.evaluate(() => window.pollStats.checks)).toBe(1);
  await page.evaluate(async () => (await import('/js/api.js')).setAIProvider('routstr'));
  await expect.poll(() => page.evaluate(() => window.pollStats.checks)).toBe(2);
  await page.evaluate(async () => (await import('/js/agent-chat-settings.js')).setChatBackend('codex'));
  await page.clock.runFor(120000);
  expect(await page.evaluate(() => window.pollStats.checks)).toBe(2);
  await page.evaluate(async () => (await import('/js/agent-chat-settings.js')).setChatBackend('direct'));
  await expect.poll(() => page.evaluate(() => window.pollStats.checks)).toBe(3);
  await page.evaluate(() => {
    localStorage.setItem('labcharts-ai-provider','venice');
    window.dispatchEvent(new StorageEvent('storage',{key:'labcharts-ai-provider',newValue:'venice'}));
  });
  await page.clock.runFor(120000);
  expect(await page.evaluate(() => window.pollStats.checks)).toBe(3);
  // Exercise the real profile-sync apply path, which writes in this same tab
  // without firing either a local-edit event or a browser storage event.
  const applySynced = settings => page.evaluate(async settings => {
    await (await import('/js/sync-apply.js')).applyAISettings(settings, {preferRemote:true});
  }, settings);
  await applySynced({'labcharts-ai-provider':'routstr'});
  await expect.poll(() => page.evaluate(() => window.pollStats.checks)).toBe(4);
  await expect.poll(() => page.evaluate(() => window.pollStats.subscribes)).toBe(4);
  await applySynced({'labcharts-ai-provider':'openrouter'});
  await expect.poll(() => page.evaluate(() => window.pollStats.cancels)).toBe(4);
  await page.clock.runFor(120000);
  expect(await page.evaluate(() => window.pollStats.checks)).toBe(4);
  await applySynced({'labcharts-ai-provider':'routstr'});
  await expect.poll(() => page.evaluate(() => window.pollStats.checks)).toBe(5);
  await expect.poll(() => page.evaluate(() => window.pollStats.subscribes)).toBe(5);
  // The companion backend is device-local and is not accepted from sync.
  await applySynced({'labcharts-chat-backend':'codex'});
  expect(await page.evaluate(() => localStorage.getItem('labcharts-chat-backend'))).toBe('direct');
  expect(external).toEqual([]);
});

test('profile sync lazily starts saved funding when it first selects Routstr', async ({page}) => {
  await page.route('**/provider-polling-fixture', route => route.fulfill({contentType:'text/html',body:'<div></div>'}));
  let walletLoads = 0;
  await page.route('**/js/provider-wallet-panels.js', route => {
    walletLoads++;
    return route.fulfill({contentType:'text/javascript',body:'export function startRoutstrFundingMonitor() { window.fundingStarted = true; }'});
  });
  await page.goto('/provider-polling-fixture');
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-provider','openrouter');
    localStorage.setItem('labcharts-cashu-wallet-mnemonic','synthetic-encrypted-wallet');
    await import('/js/settings-provider-bridge.js');
  });
  expect(walletLoads).toBe(0);
  await page.evaluate(async () => {
    await (await import('/js/sync-apply.js')).applyAISettings({'labcharts-ai-provider':'routstr'}, {preferRemote:true});
  });
  await expect.poll(() => page.evaluate(() => window.fundingStarted)).toBe(true);
  expect(walletLoads).toBe(1);
});
