import { expect, test } from './coverage-fixture.js';

test('Routstr wallet DOM flows recover deposits, refunds, and seed onboarding', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const cryptoStore = await import('/js/crypto.js');
    const cloudConsent = await import('/js/cloud-ai-consent.js');
    const providerPanels = await import('/js/provider-panels.js');
    const settings = await import('/js/settings.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
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
    const oldGlobals = {};
    for (const name of globalNames) oldGlobals[name] = window[name];

    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-routstr-key',
      'labcharts-routstr-node',
      'labcharts-routstr-model',
      'labcharts-routstr-models',
      'labcharts-routstr-pricing',
      'labcharts-routstr-vision-models',
      'labcharts-routstr-session-updated-at',
      'labcharts-cashu-wallet-mint',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);

    let currentMint = 'https://mint-old.example';
    let walletBalance = 1500;
    let setMintUrl = null;
    let depositArgs = null;
    let recoverCalled = false;
    let refundCalled = false;
    let importedToken = null;
    let receivedToken = null;
    let fundingInvoiceAmount = null;
    let fundingStatusQuote = null;
    let pendingFundingChecked = false;
    let exportedWallet = false;
    let sentTokenAmount = null;
    let withdrawAddressArgs = null;
    let withdrawQuoteInvoice = null;
    let executeWithdrawQuote = null;
    let savedPendingWithdraw = null;
    let clearPendingWithdrawCalled = false;
    let restoredMnemonic = null;

    try {
      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : url?.url || '';
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
            refundCalled = opts.method === 'POST' && opts.headers?.Authorization === 'Bearer sk-routstr-dom';
            return jsonResponse({ cashu_token: 'cashuArefundtoken' });
          }
          return jsonResponse({}, 404);
        }
        return oldGlobals.fetch.call(window, url, opts);
      };

      window.cashuGetBalance = async () => walletBalance;
      window.cashuGetMintUrl = async () => currentMint;
      window.cashuSetMintUrl = async url => {
        setMintUrl = url;
        currentMint = url;
        localStorage.setItem('labcharts-cashu-wallet-mint', url);
      };
      window.cashuCreateFundingInvoice = async amount => {
        fundingInvoiceAmount = amount;
        return { quote: 'funding-quote-1000', invoice: 'lnbc1000getbasedtestinvoice' };
      };
      window.cashuCheckFundingStatus = async quote => {
        fundingStatusQuote = quote;
        return { paid: true, minted: 1000, fee: 2 };
      };
      window.cashuRecoverPendingFunding = async () => {
        pendingFundingChecked = true;
        return { checked: 1, recovered: 998, pending: 0, failed: 0, cleared: 0 };
      };
      window.cashuDepositToNode = async (url, amount, existingKey) => {
        depositArgs = { url, amount, existingKey };
        throw new Error('mock node rejected deposit');
      };
      window.cashuRecoverPendingDeposit = async () => {
        recoverCalled = true;
        return 'cashuArecoverytoken';
      };
      window.cashuImportWallet = async token => {
        importedToken = token;
        return 888;
      };
      window.cashuReceiveToken = async token => {
        receivedToken = token;
        return { received: 888, balance: 2388 };
      };
      window.cashuExportWallet = async () => {
        exportedWallet = true;
        return 'cashuAbackupwallet';
      };
      window.cashuSendAsToken = async amount => {
        sentTokenAmount = amount;
        return { token: 'cashuAsendtoken', amount, remaining: 1400 - amount };
      };
      window.cashuCreateWithdrawQuote = async invoice => {
        withdrawQuoteInvoice = invoice;
        return { quote: 'withdraw-quote-1', amount: 123, fee_reserve: 4 };
      };
      window.cashuExecuteWithdraw = async quote => {
        executeWithdrawQuote = quote;
        return { paid: true };
      };
      window.cashuWithdrawToAddress = async (address, amount) => {
        withdrawAddressArgs = { address, amount };
        return { paid: true, amount, balance: 1234 };
      };
      window.cashuSavePendingWithdrawToken = async (token, source) => {
        savedPendingWithdraw = { token, source };
      };
      window.cashuClearPendingWithdraw = async () => {
        clearPendingWithdrawCalled = true;
      };
      window.cashuClearPendingDeposit = async () => {};
      window.cashuGetWalletMnemonic = async () => null;
      window.cashuRestoreWalletFromSeed = async mnemonic => {
        restoredMnemonic = mnemonic;
        return { balance: 4321 };
      };
      window.cashuHasWalletSeed = async () => false;
      window.cashuGenerateWalletSeed = async () => ({
        mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      });
      const panels = await import('/js/provider-wallet-panels.js');
      panels.configureRoutstrWalletRuntime({
        cashuGetBalance: window.cashuGetBalance,
        cashuGetMintUrl: window.cashuGetMintUrl,
        cashuSetMintUrl: window.cashuSetMintUrl,
        cashuCreateFundingInvoice: window.cashuCreateFundingInvoice,
        cashuCheckFundingStatus: window.cashuCheckFundingStatus,
        cashuRecoverPendingFunding: window.cashuRecoverPendingFunding,
        cashuDepositToNode: window.cashuDepositToNode,
        cashuRecoverPendingDeposit: window.cashuRecoverPendingDeposit,
        cashuImportWallet: window.cashuImportWallet,
        cashuReceiveToken: window.cashuReceiveToken,
        cashuExportWallet: window.cashuExportWallet,
        cashuSavePendingWithdrawToken: window.cashuSavePendingWithdrawToken,
        cashuClearPendingDeposit: window.cashuClearPendingDeposit,
        cashuClearPendingWithdraw: window.cashuClearPendingWithdraw,
        cashuGetWalletMnemonic: window.cashuGetWalletMnemonic,
        cashuRestoreWalletFromSeed: window.cashuRestoreWalletFromSeed,
        cashuHasWalletSeed: window.cashuHasWalletSeed,
        cashuGenerateWalletSeed: window.cashuGenerateWalletSeed,
        cashuSendAsToken: window.cashuSendAsToken,
        cashuCreateWithdrawQuote: window.cashuCreateWithdrawQuote,
        cashuExecuteWithdraw: window.cashuExecuteWithdraw,
        cashuWithdrawToAddress: window.cashuWithdrawToAddress,
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

      await providerPanels.connectRoutstrNode(nodeUrl);
      await wait(100);
      const fundedWalletRefusesMintSwitch = setMintUrl === null
        && currentMint === 'https://mint-old.example'
        && document.getElementById('routstr-node-picker')?.style.display === 'none';

      walletBalance = 0;
      await providerPanels.connectRoutstrNode(nodeUrl);
      await wait(100);
      const emptyWalletSwitchesMint = setMintUrl === 'https://mint-required.example';

      walletBalance = 1500;
      await providerPanels.connectRoutstrNode(nodeUrl);
      await wait(100);
      const connectRendersDepositPicker = !!document.getElementById('routstr-deposit-amount');

      await providerPanels.doRoutstrNodeDeposit(nodeUrl, 500);
      await wait(150);
      const fundAreaText = document.getElementById('routstr-wallet-fund-area')?.textContent || '';
      const depositUsesSessionKey = depositArgs?.url === nodeUrl
        && depositArgs.amount === 500
        && depositArgs.existingKey === 'sk-routstr-dom';
      const depositFailureChecksRecovery = recoverCalled;
      const depositFailureShowsRecovery = fundAreaText.includes('Deposit failed')
        && fundAreaText.includes('Recover to Wallet')
        && fundAreaText.includes('Copy Token');
      const recoveryButtonCarriesToken = document.querySelector('#routstr-wallet-fund-area [data-token="cashuArecoverytoken"]') !== null;

      localStorage.setItem('labcharts-routstr-key', 'sk-routstr-dom');
      cryptoStore.updateKeyCache('labcharts-routstr-key', 'sk-routstr-dom');
      await providerPanels.doRoutstrNodeWithdraw();
      await wait(50);
      const refundBlockedUntilSeedAck = !refundCalled
        && !!document.getElementById('routstr-seed-continue');
      const refundSeedAck = document.getElementById('routstr-seed-ack');
      if (refundSeedAck) {
        refundSeedAck.checked = true;
        refundSeedAck.dispatchEvent(new Event('change', { bubbles: true }));
        providerPanels.walletSeedAcknowledged();
      }
      await wait(150);
      const refundUsesSessionKey = refundCalled;
      const refundPersistsTokenBeforeReceive = savedPendingWithdraw?.token === 'cashuArefundtoken'
        && savedPendingWithdraw.source === 'routstr-node-refund';
      const refundReceivesToken = receivedToken === 'cashuArefundtoken';
      const refundDoesNotUseBackupImport = importedToken === null;
      const refundClearsPendingWithdraw = clearPendingWithdrawCalled;
      const routstrKeyClearsAfterRefund = !api.getRoutstrKey();

      await providerPanels.showWalletSeedPhrase();
      await wait(50);
      const restoreInput = document.getElementById('routstr-restore-seed');
      const restoreTextareaRenders = !!restoreInput;
      const unseededSetupExplainsMnemonicSplit = (document.getElementById('routstr-wallet-fund-area')?.textContent || '').includes('24-word Data Sync mnemonic')
        && !!document.querySelector('[data-routstr-wallet-action="setup-wallet-seed"]');
      if (restoreInput) {
        restoreInput.value = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
      }
      await providerPanels.doRoutstrWalletRestore();
      await wait(50);
      const restoreUsesNormalizedMnemonic = restoredMnemonic === restoreInput?.value;
      const restoreReportsBalance = (document.getElementById('routstr-restore-status')?.textContent || '').includes('4,321');

      await providerPanels.showRoutstrWalletFund();
      await wait(50);
      const continueBtn = document.getElementById('routstr-seed-continue');
      const ack = document.getElementById('routstr-seed-ack');
      const seedGateRenders = !!continueBtn && !!ack;
      const seedContinueStartsDisabled = continueBtn?.disabled === true;
      let seedAckEnablesContinue = false;
      let seedAckProceedsToFunding = false;
      if (ack && continueBtn) {
        ack.checked = true;
        ack.dispatchEvent(new Event('change', { bubbles: true }));
        seedAckEnablesContinue = !continueBtn.disabled;
        providerPanels.walletSeedAcknowledged();
        await wait(50);
        seedAckProceedsToFunding = !!document.getElementById('routstr-wcashu-input');
      }

      await panels.doRoutstrWalletFund(1000);
      await wait(50);
      const lightningFundingCreatesInvoice = fundingInvoiceAmount === 1000
        && (document.getElementById('routstr-wfund-status')?.textContent || '').includes('Waiting for payment');
      await panels.recoverPendingWalletFunding();
      await wait(50);
      const pendingFundingRecoveryReportsRecovered = pendingFundingChecked
        && (document.getElementById('routstr-wfund-status')?.textContent || '').includes('+998 sats recovered');
      const fundingPollUsesQuote = fundingStatusQuote === null || fundingStatusQuote === 'funding-quote-1000';

      await panels.showRoutstrWalletBackup();
      await wait(50);
      const walletBackupExportCalled = exportedWallet === true;

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
      const lightningInput = document.getElementById('routstr-withdraw-input');
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
      const addressInput = document.getElementById('routstr-withdraw-input');
      if (addressInput) {
        addressInput.value = 'alice@getbased.test';
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const amountInput = document.getElementById('routstr-withdraw-amount');
      if (amountInput) {
        amountInput.value = '42';
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await panels.doRoutstrWithdrawQuote();
      await wait(50);
      const lightningAddressWithdrawUsesAmount = withdrawAddressArgs?.address === 'alice@getbased.test'
        && withdrawAddressArgs.amount === 42;

      return {
        walletRenders,
        nodeBalanceRenders,
        fundedLegacySessionGetsSyncClock,
        unseededWalletStatusRenders,
        fundedWalletRefusesMintSwitch,
        emptyWalletSwitchesMint,
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
        routstrKeyClearsAfterRefund,
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
      for (const name of globalNames) window[name] = oldGlobals[name];
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
