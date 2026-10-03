import { installWalletFixtures } from '../helpers/wallet-browser-fixtures.js';
import { expect, test } from './coverage-fixture.js';
test.beforeEach(async ({ page }) => installWalletFixtures(page));

test('Routstr wallet DOM flows recover deposits, refunds, and seed onboarding', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const { makeTestInvoice, LNURL_METADATA: _LNURL_METADATA } = await import('/wallet-test-lightning-invoices.js');
    const { validateLightningInvoice: _validateLightningInvoice } = await import('/js/routstr-validation.js');
    const api = await import('/js/api.js');
    const cryptoStore = await import('/js/crypto.js');
    const cloudConsent = await import('/js/cloud-ai-consent.js');
    const providerPanels = await import('/js/provider-panels.js');
    const settings = await import('/js/settings.js');
    const wait = (ms:number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body:unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      },
    });

    const nodeUrl = 'https://routstr-wallet-dom.test';
    const globalNames = [
      'fetch',
      'cashuGetBalance',
      'cashuGetMintUrl',
      'cashuSetMintUrl',
      'cashuCreateFundingInvoice',
      'cashuCheckFundingStatus',
      'cashuRecoverPendingFunding',
      'cashuDepositToNode',
      'cashuRecoverPendingDeposit',
      'cashuImportWallet',
      'cashuReceiveToken',
      'cashuExportWallet',
      'cashuSavePendingWithdrawToken',
      'cashuClearPendingWithdraw',
      'cashuRefundNodeToToken',
      'cashuFinishNodeRefund',
      'cashuGetPendingNodeRefund',
      'cashuClearPendingDeposit',
      'cashuGetWalletMnemonic',
      'cashuRestoreWalletFromSeed',
      'cashuHasWalletSeed',
      'cashuGenerateWalletSeed',
      'cashuSendAsToken',
      'cashuCreateWithdrawQuote',
      'cashuExecuteWithdraw',
      'cashuWithdrawToAddress',
    ];
    const oldGlobals:Record<string,unknown> = {};
    for (const name of globalNames) oldGlobals[name] = (window as unknown as Record<string,unknown>)[name];

    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-routstr-key',
      'labcharts-routstr-sessions',
      'labcharts-routstr-node',
      'labcharts-routstr-model',
      'labcharts-routstr-models',
      'labcharts-routstr-pricing',
      'labcharts-routstr-vision-models',
      'labcharts-routstr-session-updated-at',
      'labcharts-cashu-wallet-mint',
    ];
    const oldStorage:Record<string,string|null|undefined> = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);

    let currentMint:unknown = 'https://mint-old.example';
    let walletBalance = 1500;
    let setMintUrl:unknown = null;
    let depositArgs:unknown = null;
    let recoverCalled = false;
    let refundCalled = false;
    let importedToken:unknown = null;
    let receivedToken:unknown = null;
    let fundingInvoiceAmount:unknown = null;
    let fundingInvoiceCount = 0;
    let fundingStatusQuote:unknown = null;
    let pendingFundingChecked = false;
    let exportedWallet = false;
    let sentTokenAmount:unknown = null;
    let withdrawAddressArgs:unknown = null;
    let withdrawQuoteInvoice:unknown = null;
    let executeWithdrawQuote:unknown = null;
    let savedPendingWithdraw:unknown = null;
    let clearPendingWithdrawCalled = false;
    let restoredMnemonic:unknown = null;

    try {
      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : (url as Request|undefined)?.url || '';
        if (href.startsWith(nodeUrl)) {
          if (href.endsWith('/v1/info')) return jsonResponse({ nuts: {}, mints: ['https://mint-required.example'] });
          if (href.endsWith('/v1/models')) {
            return jsonResponse({
              data: [{
                id: 'claude-sonnet-4.6',
                name: 'Claude Sonnet 4.6',
                enabled: true,
                pricing: { prompt: '0.000001', completion: '0.000003' },
              }],
            });
          }
          if (href.endsWith('/v1/balance/info')) return jsonResponse({ balance: 777000, total_requests: 0, total_spent: 0 });
          if (href.endsWith('/v1/wallet/refund')) {
            refundCalled = opts.method === 'POST' && (opts.headers as {Authorization?:unknown}|null|undefined)?.Authorization === 'Bearer sk-routstr-dom';
            return jsonResponse({ cashu_token: 'cashuArefundtoken' });
          }
          return jsonResponse({}, 404);
        }
        return (oldGlobals.fetch as typeof fetch).call(window, url, opts);
      };

      (window as unknown as Record<string,unknown>).cashuGetBalance = async () => walletBalance;
      (window as unknown as Record<string,unknown>).cashuGetMintUrl = async () => currentMint;
      (window as unknown as Record<string,unknown>).cashuSetMintUrl = async (url:unknown) => {
        setMintUrl = url;
        currentMint = url;
        localStorage.setItem('labcharts-cashu-wallet-mint', url as string);
      };
      (window as unknown as Record<string,unknown>).cashuCreateFundingInvoice = async (amount:number) => {
        fundingInvoiceAmount = amount;
        fundingInvoiceCount += 1;
        return { quote: 'funding-quote-1000', invoice: makeTestInvoice(amount) };
      };
      (window as unknown as Record<string,unknown>).cashuCheckFundingStatus = async (quote:unknown) => {
        fundingStatusQuote = quote;
        return { paid: true, minted: 1000, fee: 2 };
      };
      (window as unknown as Record<string,unknown>).cashuRecoverPendingFunding = async () => {
        pendingFundingChecked = true;
        return { checked: 1, recovered: 998, pending: 0, failed: 0, cleared: 0 };
      };
      (window as unknown as Record<string,unknown>).cashuDepositToNode = async (url:unknown, amount:unknown, existingKey:unknown) => {
        depositArgs = { url, amount, existingKey };
        throw new Error('mock node rejected deposit');
      };
      (window as unknown as Record<string,unknown>).cashuRecoverPendingDeposit = async () => {
        recoverCalled = true;
        return 'cashuArecoverytoken';
      };
      (window as unknown as Record<string,unknown>).cashuImportWallet = async (token:unknown) => {
        importedToken = token;
        return 888;
      };
      (window as unknown as Record<string,unknown>).cashuReceiveToken = async (token:unknown) => {
        receivedToken = token;
        return { received: 888, balance: 2388 };
      };
      (window as unknown as Record<string,unknown>).cashuExportWallet = async () => {
        exportedWallet = true;
        return 'cashuAbackupwallet';
      };
      (window as unknown as Record<string,unknown>).cashuSendAsToken = async (amount:number) => {
        sentTokenAmount = amount;
        return { token: 'cashuAsendtoken', amount, remaining: 1400 - amount };
      };
      (window as unknown as Record<string,unknown>).cashuCreateWithdrawQuote = async (invoice:unknown) => {
        withdrawQuoteInvoice = invoice;
        return { quote: 'withdraw-quote-1', amount: 123, fee_reserve: 4 };
      };
      (window as unknown as Record<string,unknown>).cashuExecuteWithdraw = async (quote:unknown) => {
        executeWithdrawQuote = quote;
        return { paid: true };
      };
      (window as unknown as Record<string,unknown>).cashuWithdrawToAddress = async (address:unknown, amount:unknown) => {
        withdrawAddressArgs = { address, amount };
        return { paid: true, amount, balance: 1234 };
      };
      (window as unknown as Record<string,unknown>).cashuSavePendingWithdrawToken = async (token:unknown, source:unknown) => {
        savedPendingWithdraw = { token, source };
      };
      (window as unknown as Record<string,unknown>).cashuClearPendingWithdraw = async () => {
        clearPendingWithdrawCalled = true;
      };
      (window as unknown as Record<string,unknown>).cashuRefundNodeToToken = async (url:unknown) => {
        refundCalled = url === nodeUrl && (api.getRoutstrKey as (url:unknown)=>ReturnType<typeof api.getRoutstrKey>)(url) === 'sk-routstr-dom';
        savedPendingWithdraw = { token: 'cashuArefundtoken', source: 'routstr-node-refund' };
        return savedPendingWithdraw;
      };
      (window as unknown as Record<string,unknown>).cashuFinishNodeRefund = async (token:unknown) => { clearPendingWithdrawCalled = token === 'cashuArefundtoken'; };
      (window as unknown as Record<string,unknown>).cashuGetPendingNodeRefund = async () => null;
      (window as unknown as Record<string,unknown>).cashuClearPendingDeposit = async () => {};
      (window as unknown as Record<string,unknown>).cashuGetWalletMnemonic = async () => null;
      (window as unknown as Record<string,unknown>).cashuRestoreWalletFromSeed = async (mnemonic:unknown) => {
        restoredMnemonic = mnemonic;
        return { balance: 4321 };
      };
      (window as unknown as Record<string,unknown>).cashuHasWalletSeed = async () => false;
      (window as unknown as Record<string,unknown>).cashuGenerateWalletSeed = async () => {
        return { mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident' };
      };
      const panels = await import('/js/provider-wallet-panels.js');
      panels.configureRoutstrWalletRuntime({
        cashuGetBalance: (window as unknown as Record<string,unknown>).cashuGetBalance,
        cashuGetMintUrl: (window as unknown as Record<string,unknown>).cashuGetMintUrl,
        cashuSetMintUrl: (window as unknown as Record<string,unknown>).cashuSetMintUrl,
        cashuCreateFundingInvoice: (window as unknown as Record<string,unknown>).cashuCreateFundingInvoice,
        cashuCheckFundingStatus: (window as unknown as Record<string,unknown>).cashuCheckFundingStatus,
        cashuRecoverPendingFunding: (window as unknown as Record<string,unknown>).cashuRecoverPendingFunding,
        cashuDepositToNode: (window as unknown as Record<string,unknown>).cashuDepositToNode,
        cashuRecoverPendingDeposit: (window as unknown as Record<string,unknown>).cashuRecoverPendingDeposit,
        cashuImportWallet: (window as unknown as Record<string,unknown>).cashuImportWallet,
        cashuReceiveToken: (window as unknown as Record<string,unknown>).cashuReceiveToken,
        cashuExportWallet: (window as unknown as Record<string,unknown>).cashuExportWallet,
        cashuSavePendingWithdrawToken: (window as unknown as Record<string,unknown>).cashuSavePendingWithdrawToken,
        cashuClearPendingDeposit: (window as unknown as Record<string,unknown>).cashuClearPendingDeposit,
        cashuClearPendingWithdraw: (window as unknown as Record<string,unknown>).cashuClearPendingWithdraw,
        cashuRefundNodeToToken: (window as unknown as Record<string,unknown>).cashuRefundNodeToToken,
        cashuFinishNodeRefund: (window as unknown as Record<string,unknown>).cashuFinishNodeRefund,
        cashuGetPendingNodeRefund: (window as unknown as Record<string,unknown>).cashuGetPendingNodeRefund,
        cashuGetWalletMnemonic: (window as unknown as Record<string,unknown>).cashuGetWalletMnemonic,
        cashuRestoreWalletFromSeed: (window as unknown as Record<string,unknown>).cashuRestoreWalletFromSeed,
        cashuHasWalletSeed: (window as unknown as Record<string,unknown>).cashuHasWalletSeed,
        cashuGenerateWalletSeed: (window as unknown as Record<string,unknown>).cashuGenerateWalletSeed,
        cashuSendAsToken: (window as unknown as Record<string,unknown>).cashuSendAsToken,
        cashuCreateWithdrawQuote: (window as unknown as Record<string,unknown>).cashuCreateWithdrawQuote,
        cashuExecuteWithdraw: (window as unknown as Record<string,unknown>).cashuExecuteWithdraw,
        cashuWithdrawToAddress: (window as unknown as Record<string,unknown>).cashuWithdrawToAddress,
      });

      localStorage.setItem('labcharts-ai-provider', 'routstr');
      localStorage.setItem('labcharts-routstr-node', nodeUrl);
      localStorage.setItem('labcharts-routstr-key', 'sk-routstr-dom');
      cryptoStore.updateKeyCache('labcharts-routstr-key', 'sk-routstr-dom');
      const routstrScope = cloudConsent.cloudAIConsentDetails('routstr', { endpoint: nodeUrl }).scope;
      localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
        version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
        approvals: { [routstrScope]: { accepted: true } },
      }));

      settings.openSettingsModal('ai');
      await wait(100);
      await providerPanels.switchAIProvider('routstr');
      await wait(150);

      const walletRenders = !!document.getElementById('routstr-wallet-balance');
      const nodeBalanceRenders = (document.getElementById('routstr-node-balance')?.textContent || '').includes('777');
      const fundedLegacySessionGetsSyncClock = Number(localStorage.getItem('labcharts-routstr-session-updated-at') || 0) > 0;
      const unseededWalletStatusRenders = (document.getElementById('routstr-wallet-device-status')?.textContent || '').includes('No 12-word wallet seed');

      await panels.showRoutstrNodeDeposit(nodeUrl);
      await wait(100);
      const fundedWalletRefusesMintSwitch = setMintUrl === null
        && currentMint === 'https://mint-old.example'
        && document.getElementById('routstr-node-picker')?.textContent!.includes('stay available');

      walletBalance = 0;
      await panels.showRoutstrNodeDeposit(nodeUrl);
      await wait(100);
      const emptyWalletDoesNotSwitchMint = setMintUrl === null;
      await ((window as unknown as Record<string,unknown>).cashuSetMintUrl as typeof import('../../js/cashu-wallet.js').setMintUrl)('https://mint-required.example');

      walletBalance = 1500;
      await panels.showRoutstrNodeDeposit(nodeUrl);
      await wait(100);
      const connectRendersDepositPicker = !!document.getElementById('routstr-deposit-amount');

      await providerPanels.doRoutstrNodeDeposit(nodeUrl, 500);
      await wait(150);
      const fundAreaText = document.getElementById('routstr-wallet-fund-area')?.textContent || '';
      const depositUsesSessionKey = (depositArgs as {url?:unknown}|null|undefined)?.url === nodeUrl
        && (depositArgs as {amount?:unknown}).amount === 500
        && (depositArgs as {existingKey?:unknown}).existingKey === 'sk-routstr-dom';
      const depositFailureChecksRecovery = recoverCalled;
      const depositFailureShowsRecovery = fundAreaText.includes('Deposit outcome unconfirmed')
        && fundAreaText.includes('Recover to Wallet')
        && fundAreaText.includes('Copy Token');
      const recoveryButtonCarriesToken = document.querySelector<HTMLElement>('#routstr-wallet-fund-area [data-token="cashuArecoverytoken"]') !== null;

      localStorage.setItem('labcharts-routstr-key', 'sk-routstr-dom');
      cryptoStore.updateKeyCache('labcharts-routstr-key', 'sk-routstr-dom');
      await providerPanels.doRoutstrNodeWithdraw();
      await wait(50);
      const refundBlockedUntilSeedAck = !refundCalled
        && !!(document.getElementById('routstr-seed-continue') as HTMLButtonElement|null);
      const refundSeedAck = (document.getElementById('routstr-seed-ack') as HTMLInputElement|null);
      if (refundSeedAck) {
        refundSeedAck.checked = true;
        refundSeedAck.dispatchEvent(new Event('change', { bubbles: true }));
        panels.configureRoutstrWalletRuntime({ ...panels.walletRuntime, cashuHasWalletSeed: async () => true });
        providerPanels.walletSeedAcknowledged();
      }
      await wait(150);
      const refundUsesSessionKey = refundCalled;
      const refundPersistsTokenBeforeReceive = (savedPendingWithdraw as {token?:unknown}|null|undefined)?.token === 'cashuArefundtoken'
        && (savedPendingWithdraw as {source?:unknown}).source === 'routstr-node-refund';
      const refundReceivesToken = receivedToken === 'cashuArefundtoken';
      const refundDoesNotUseBackupImport = importedToken === null;
      const refundClearsPendingWithdraw = clearPendingWithdrawCalled;
      const routstrKeyRetainedAfterRefund = api.getRoutstrKey() === 'sk-routstr-dom';

      (window as unknown as Record<string,unknown>).cashuHasWalletSeed = async () => false;
      panels.configureRoutstrWalletRuntime({ ...panels.walletRuntime, cashuHasWalletSeed: (window as unknown as Record<string,unknown>).cashuHasWalletSeed });
      await providerPanels.showWalletSeedPhrase();
      await wait(50);
      const restoreInput = (document.getElementById('routstr-restore-seed') as HTMLInputElement|null);
      const restoreTextareaRenders = !!restoreInput;
      const unseededSetupExplainsMnemonicSplit = (document.getElementById('routstr-wallet-fund-area')?.textContent || '').includes('24-word Data Sync mnemonic')
        && !!document.querySelector<HTMLElement>('[data-routstr-wallet-action="setup-wallet-seed"]');
      if (restoreInput) {
        restoreInput.value = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
      }
      await providerPanels.doRoutstrWalletRestore();
      await wait(50);
      const restoreUsesNormalizedMnemonic = restoredMnemonic === restoreInput?.value;
      const restoreReportsBalance = (document.getElementById('routstr-restore-status')?.textContent || '').includes('4,321');

      await providerPanels.showRoutstrWalletFund();
      await wait(50);
      const continueBtn = (document.getElementById('routstr-seed-continue') as HTMLButtonElement|null);
      const ack = (document.getElementById('routstr-seed-ack') as HTMLInputElement|null);
      const seedGateRenders = !!continueBtn && !!ack;
      const seedContinueStartsDisabled = continueBtn?.disabled === true;
      let seedAckEnablesContinue = false;
      let seedAckProceedsToFunding = false;
      if (ack && continueBtn) {
        ack.checked = true;
        ack.dispatchEvent(new Event('change', { bubbles: true }));
        seedAckEnablesContinue = !(continueBtn.disabled as boolean);
        providerPanels.walletSeedAcknowledged();
        await wait(50);
        seedAckProceedsToFunding = !!document.getElementById('routstr-wcashu-input');
      }

      await panels.doRoutstrWalletFund(1000);
      await wait(50);
      const lightningFundingCreatesInvoice = fundingInvoiceAmount === 1000
        && (document.getElementById('routstr-wfund-status')?.textContent || '').includes('Waiting for payment');
      document.querySelector<HTMLElement>('[data-routstr-wallet-action="recover-wallet-funding"]')!.click();
      await wait(50);
      const pendingFundingRecoveryReportsRecovered = pendingFundingChecked
        && (document.getElementById('routstr-wfund-status')?.textContent || '').includes('+998 sats recovered');
      const fundingPollUsesQuote = fundingStatusQuote === null || fundingStatusQuote === 'funding-quote-1000';

      // Reopening the deposit panel must never revive a terminal cached invoice.
      let terminalFundingInvoicesAreReplaced = true;
      for (const state of ['EXPIRED', 'CANCELLED', 'CANCELED']) {
        await panels.showRoutstrWalletFund(); // Close the deposit panel.
        document.getElementById('routstr-wallet-fund-area')!.innerHTML = '';
        let terminalReported = false;
        panels.configureRoutstrWalletRuntime({
          ...panels.walletRuntime,
          cashuHasWalletSeed: async () => true,
          cashuRecoverPendingFunding: async () => {
            const results = terminalReported ? [] : [{ quote: 'funding-quote-1000', paid: false, state }];
            terminalReported = true;
            return { mint: currentMint, balance: walletBalance, recovered: 0, pending: 0, failed: 0, results };
          },
        });
        // Force the newly injected terminal response through the next scan;
        // ordinary activation is idempotent and preserves its polling cadence.
        panels.startRoutstrFundingMonitor({ recheck: true });
        await wait(50);
        await panels.showRoutstrWalletFund();
        await wait(50);
        const status = document.getElementById('routstr-wfund-status');
        terminalFundingInvoicesAreReplaced &&= !status?.querySelector('a[href^="lightning:"]') && !status?.dataset.quote;
        const previousCount = fundingInvoiceCount;
        await panels.doRoutstrWalletFund(1000);
        terminalFundingInvoicesAreReplaced &&= fundingInvoiceCount === previousCount + 1;
      }
      panels.configureRoutstrWalletRuntime({ ...panels.walletRuntime, cashuHasWalletSeed: (window as unknown as Record<string,unknown>).cashuHasWalletSeed, cashuRecoverPendingFunding: (window as unknown as Record<string,unknown>).cashuRecoverPendingFunding });

      await panels.showRoutstrWalletBackup();
      await wait(50);
      const walletBackupExportCalled = (exportedWallet as boolean) === true;

      await panels.showRoutstrWithdraw();
      await wait(50);
      await panels.showRoutstrWithdrawToken();
      await wait(50);
      await panels.doRoutstrSendToken(250);
      await wait(50);
      const sendTokenUsesWalletRuntime = sentTokenAmount === 250
        && (document.getElementById('routstr-token-result')?.textContent || '').includes('Token created');

      await panels.showRoutstrWithdrawLightning();
      await wait(50);
      const lightningInput = (document.getElementById('routstr-withdraw-input') as HTMLInputElement|null);
      if (lightningInput) lightningInput.value = 'lnbc123getbasedtestinvoice';
      await panels.doRoutstrWithdrawQuote();
      await wait(50);
      const lightningWithdrawQuotesInvoice = withdrawQuoteInvoice === 'lnbc123getbasedtestinvoice'
        && (document.getElementById('routstr-withdraw-status')?.textContent || '').includes('Fee reserve');
      await panels.doRoutstrWithdrawExecute('withdraw-quote-1');
      await wait(50);
      const lightningWithdrawExecutesQuote = executeWithdrawQuote === 'withdraw-quote-1'
        && (document.getElementById('routstr-withdraw-status')?.textContent || '').includes('Withdrawn');
      await panels.showRoutstrWithdrawLightning();
      await wait(50);
      const addressInput = (document.getElementById('routstr-withdraw-input') as HTMLInputElement|null);
      if (addressInput) {
        addressInput.value = 'alice@getbased.test';
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const amountInput = (document.getElementById('routstr-withdraw-amount') as HTMLInputElement|null);
      if (amountInput) {
        amountInput.value = '42';
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await panels.doRoutstrWithdrawQuote();
      await wait(50);
      const lightningAddressWithdrawUsesAmount = (withdrawAddressArgs as {address?:unknown}|null|undefined)?.address === 'alice@getbased.test'
        && (withdrawAddressArgs as {amount?:unknown}).amount === 42;

      return {
        walletRenders,
        nodeBalanceRenders,
        fundedLegacySessionGetsSyncClock,
        unseededWalletStatusRenders,
        fundedWalletRefusesMintSwitch,
        emptyWalletDoesNotSwitchMint,
        connectRendersDepositPicker,
        depositUsesSessionKey,
        depositFailureChecksRecovery,
        depositFailureShowsRecovery,
        recoveryButtonCarriesToken,
        refundBlockedUntilSeedAck,
        refundUsesSessionKey,
        refundPersistsTokenBeforeReceive,
        refundReceivesToken,
        refundDoesNotUseBackupImport,
        refundClearsPendingWithdraw,
        routstrKeyRetainedAfterRefund,
        restoreTextareaRenders,
        unseededSetupExplainsMnemonicSplit,
        restoreUsesNormalizedMnemonic,
        restoreReportsBalance,
        seedGateRenders,
        seedContinueStartsDisabled,
        seedAckEnablesContinue,
        seedAckProceedsToFunding,
        lightningFundingCreatesInvoice,
        pendingFundingRecoveryReportsRecovered,
        fundingPollUsesQuote,
        terminalFundingInvoicesAreReplaced,
        walletBackupExportCalled,
        sendTokenUsesWalletRuntime,
        lightningWithdrawQuotesInvoice,
        lightningWithdrawExecutesQuote,
        lightningAddressWithdrawUsesAmount,
      };
    } finally {
      const panels = await import('/js/provider-wallet-panels.js');
      panels.configureRoutstrWalletRuntime();
      panels.clearRoutstrWalletTimers();
      for (const name of globalNames) (window as unknown as Record<string,unknown>)[name] = oldGlobals[name];
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      cryptoStore.updateKeyCache('labcharts-routstr-key', oldStorage['labcharts-routstr-key'] || '');
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      (await import('/js/views.js')).closeModal();
      settings.closeSettingsModal();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
