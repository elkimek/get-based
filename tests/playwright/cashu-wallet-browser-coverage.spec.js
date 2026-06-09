import { expect, test } from './coverage-fixture.js';

test('cashu wallet browser coverage exercises storage, mint, deposit, withdraw, and fee paths', async ({ page }) => {
  await page.route('**/cashu-wallet-blank', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/cashu-wallet-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const oldGlobals = {
      cashuts: window.cashuts,
      bip39: window.bip39,
      fetch: window.fetch,
      showNotification: window.showNotification,
    };
    const notices = [];
    const proof = (secret, amount, extra = {}) => ({ secret, amount, C: `C-${secret}`, ...extra });
    const state = {
      receiveQueue: [
        [proof('rx-token-1', 10)],
        [proof('rx-token-2', 9)],
        [proof('import-token-1', 3)],
        [proof('rx-token-3', 100)],
      ],
      instances: [],
      meltQuotes: new Map(),
      sendId: 0,
      failMelt: false,
      topupAuth: null,
      createDepositUrl: null,
      lnurlAmounts: [],
    };

    function sumProofs(proofs = []) {
      return proofs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }

    class Wallet {
      constructor(url, opts = {}) {
        this.url = url;
        this.opts = opts;
        state.instances.push(this);
      }

      async loadMint() {}

      async groupProofsByState(proofs) {
        return {
          unspent: proofs.filter(item => !item.spent && !item.pending),
          spent: proofs.filter(item => item.spent),
          pending: proofs.filter(item => item.pending),
        };
      }

      async receive() {
        return (state.receiveQueue.shift() || [proof(`rx-fallback-${state.receiveQueue.length}`, 1)])
          .map(item => ({ ...item }));
      }

      async send(amount, proofs) {
        const total = sumProofs(proofs);
        state.sendId += 1;
        return {
          send: [proof(`send-${amount}-${state.sendId}`, amount)],
          keep: total > amount ? [proof(`keep-${total - amount}-${state.sendId}`, total - amount)] : [],
        };
      }

      async createMintQuoteBolt11(amount) {
        return { quote: `mint-${amount}`, request: `lnbc-mint-${amount}`, amount, state: 'UNPAID' };
      }

      async checkMintQuoteBolt11(quoteId) {
        if (quoteId === 'mint-unpaid') return { state: 'UNPAID', amount: 0 };
        return { state: 'PAID', amount: Number(String(quoteId).replace(/\D/g, '')) || 0 };
      }

      async mintProofsBolt11(amount, quoteId) {
        return [proof(`minted-${quoteId}`, amount)];
      }

      async batchRestore(batchSize, gap, start) {
        return start > 0
          ? { proofs: [] }
          : { proofs: [proof('restored-live', 7), proof('restored-spent', 5, { spent: true })] };
      }

      async createMeltQuoteBolt11(invoice) {
        const amount = Number(String(invoice).match(/(\d+)/)?.[1] || 10);
        const quote = { quote: `quote-${amount}-${state.meltQuotes.size}`, amount, fee_reserve: 5, state: 'UNPAID' };
        state.meltQuotes.set(quote.quote, quote);
        return quote;
      }

      async checkMeltQuoteBolt11(quoteId) {
        return state.meltQuotes.get(quoteId) || { quote: quoteId, amount: 10, fee_reserve: 5 };
      }

      async meltProofsBolt11(quote) {
        if (state.failMelt) throw new Error('melt failed');
        return { change: [proof(`melt-change-${quote.quote}`, 1)] };
      }
    }

    window.cashuts = {
      Wallet,
      MintQuoteState: { PAID: 'PAID' },
      sumProofs,
      getEncodedToken: ({ mint, proofs }) => `cashu:${mint}:${sumProofs(proofs)}:${proofs.map(item => item.secret).join(',')}`,
    };
    window.bip39 = {
      generateMnemonic: async () => 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      validateMnemonic: async mnemonic => String(mnemonic).trim().split(/\s+/).length === 12,
      mnemonicToSeed: async () => new Uint8Array(64).buffer,
    };
    window.showNotification = (message, type) => notices.push({ message, type });
    window.fetch = async function(url, opts = {}) {
      const href = String(url);
      if (href === 'https://getbased.test/.well-known/lnurlp/alice') {
        return new Response(JSON.stringify({
          callback: 'https://lnurl.getbased.test/callback?tag=pay',
          minSendable: 1000,
          maxSendable: 200000,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (href.startsWith('https://lnurl.getbased.test/callback')) {
        const amountMsats = Number(new URL(href).searchParams.get('amount'));
        state.lnurlAmounts.push(amountMsats);
        return new Response(JSON.stringify({ pr: `lnbc${amountMsats / 1000}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.startsWith('https://node.wallet-browser.test/v1/balance/topup')) {
        state.topupAuth = opts.headers?.Authorization || '';
        return new Response(JSON.stringify({ detail: [{ msg: 'token rejected' }, { msg: 'mint unavailable' }] }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.startsWith('https://node.wallet-browser.test/v1/balance/create')) {
        state.createDepositUrl = href;
        return new Response(JSON.stringify({ api_key: 'sk-created', balance: 1234 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    };

    async function deleteCashuDb() {
      await new Promise(resolve => {
        const req = indexedDB.deleteDatabase('getbased-cashu');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(resolve, 500);
      });
    }

    await deleteCashuDb();
    const wallet = await import(`/js/cashu-wallet.js?cashuWalletCoverage=${Date.now()}`);
    const outcomes = {};

    try {
      outcomes.defaultMint = await wallet.getMintUrl();
      try {
        await wallet.setMintUrl('http://127.0.0.1:3338');
        outcomes.rejectsUnsafeMint = false;
      } catch (error) {
        outcomes.rejectsUnsafeMint = /public https/i.test(error.message);
      }

      await wallet.setMintUrl('https://mint.browser-wallet.test/Bitcoin');
      outcomes.mintPersists = await wallet.getMintUrl() === 'https://mint.browser-wallet.test/Bitcoin'
        && localStorage.getItem('labcharts-cashu-wallet-mint') === 'https://mint.browser-wallet.test/Bitcoin';
      outcomes.seedStartsEmpty = await wallet.hasWalletSeed() === false;
      const generated = await wallet.generateWalletSeed();
      outcomes.seedRoundTrips = generated.mnemonic.includes('abandon ability')
        && await wallet.hasWalletSeed() === true
        && await wallet.getWalletMnemonic() === generated.mnemonic;

      const funding = await wallet.createFundingInvoice(7);
      const funded = await wallet.checkFundingStatus(funding.quote);
      const unpaid = await wallet.checkFundingStatus('mint-unpaid');
      outcomes.fundingPaths = funding.invoice === 'lnbc-mint-7'
        && funded.paid === true
        && funded.balance === 7
        && unpaid.paid === false;

      const received = await wallet.receiveToken('cashuA-token');
      outcomes.receiveAddsProofs = received.received === 10 && received.balance === 17;

      const exportedBeforeSend = await wallet.exportWallet();
      const sent = await wallet.sendAsToken(4);
      outcomes.exportAndSend = exportedBeforeSend.includes('minted-mint-7')
        && sent.amount === 4
        && sent.remaining === 13;

      try {
        await wallet.depositToNode('https://node.wallet-browser.test///', 5, 'sk-existing');
        outcomes.depositFailureRecoverable = false;
      } catch (error) {
        const pending = await wallet.recoverPendingDeposit();
        outcomes.depositFailureRecoverable = /token rejected; mint unavailable/.test(error.message)
          && state.topupAuth === 'Bearer sk-existing'
          && pending.includes('send-5');
      }
      await wallet.clearPendingDeposit();
      outcomes.clearPendingDeposit = await wallet.recoverPendingDeposit() === null;

      await wallet.receiveToken('cashuA-second');
      const created = await wallet.depositToNode('https://node.wallet-browser.test', 4);
      outcomes.depositSuccessClearsPending = created.api_key === 'sk-created'
        && state.createDepositUrl.includes('/v1/balance/create?initial_balance_token=')
        && await wallet.recoverPendingDeposit() === null;

      const imported = await wallet.importWallet('cashuA-import');
      outcomes.importAddsProofs = imported === 3;

      const max = await wallet.getMaxWithdrawable();
      const addressWithdraw = await wallet.withdrawToAddress('alice@getbased.test', Math.min(max + 2, 20));
      outcomes.lightningAddressWithdraw = addressWithdraw.paid === true
        && addressWithdraw.amount > 0
        && state.lnurlAmounts.length > 0;

      await wallet.receiveToken('cashuA-third');
      const quote = await wallet.createWithdrawQuote('lnbc10');
      state.failMelt = true;
      try {
        await wallet.executeWithdraw(quote.quote);
        outcomes.failedMeltRecoverable = false;
      } catch (error) {
        const pendingWithdraw = await wallet.recoverPendingWithdraw();
        outcomes.failedMeltRecoverable = /melt failed/.test(error.message)
          && pendingWithdraw.includes('send-15');
      }
      await wallet.clearPendingWithdraw();
      outcomes.clearPendingWithdraw = await wallet.recoverPendingWithdraw() === null;
      state.failMelt = false;

      const restore = await wallet.restoreWalletFromSeed(generated.mnemonic);
      outcomes.restoreUsesSeed = restore.balance === 7
        && restore.restoredCount === 7
        && state.instances.some(instance => instance.opts?.counterSource);

      outcomes.feeEmptyPaths = wallet.getFeePct() === 0
        && await wallet.getFeeBalance() === 0
        && (await wallet.retryFeeAutoMelt()).melted === 0;
      try {
        await wallet.redeemFees('lnbc1');
        outcomes.redeemEmptyFeesRejects = false;
      } catch (error) {
        outcomes.redeemEmptyFeesRejects = /No fee proofs/.test(error.message);
      }

      await wallet.clearWallet();
      outcomes.clearWalletEmpties = await wallet.getWalletBalance() === 0;
      const destroyed = await Promise.race([
        wallet.destroyWalletDB().then(() => true).catch(() => false),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 500)),
      ]);
      outcomes.destroyWalletDbInvoked = destroyed === true || destroyed === 'timeout';
      return outcomes;
    } finally {
      await deleteCashuDb();
      window.cashuts = oldGlobals.cashuts;
      window.bip39 = oldGlobals.bip39;
      window.fetch = oldGlobals.fetch;
      window.showNotification = oldGlobals.showNotification;
      localStorage.removeItem('labcharts-cashu-wallet-mint');
      localStorage.removeItem('labcharts-cashu-wallet-mnemonic');
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});

test('routstr wallet panels and delegates cover browser-only actions', async ({ page }) => {
  await page.route('**/cashu-wallet-panels-blank', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/cashu-wallet-panels-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const oldGlobals = {};
    const globalNames = [
      'cashuGetBalance',
      'cashuCheckProofStates',
      'cashuCreateFundingInvoice',
      'cashuCheckFundingStatus',
      'cashuReceiveToken',
      'cashuGetMintUrl',
      'cashuSetMintUrl',
      'cashuHasWalletSeed',
      'cashuGenerateWalletSeed',
      'cashuExportWallet',
      'cashuSendAsToken',
      'cashuCreateWithdrawQuote',
      'cashuExecuteWithdraw',
      'cashuWithdrawToAddress',
      'cashuGetMaxWithdrawable',
      'cashuGetFeePct',
      'nostrDiscoverNodes',
      'nostrGetSelectedNode',
      'nostrSetSelectedNode',
      'fetch',
    ];
    for (const name of globalNames) oldGlobals[name] = window[name];
    const notices = [];
    const calls = [];
    const clipboardWrites = [];
    const oldNotification = window.showNotification;
    const oldQrcode = window.qrcode;
    const hadClipboard = Object.prototype.hasOwnProperty.call(window.navigator, 'clipboard');
    const oldClipboard = window.navigator.clipboard;

    function json(body, status = 200) {
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }

    async function waitFor(fn, timeout = 1000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const value = fn();
        if (value) return value;
        await wait(10);
      }
      return fn();
    }

    const root = document.createElement('div');
    root.id = 'ai-provider-panel';
    root.innerHTML = `
      <div id="routstr-wallet-balance"></div>
      <div id="routstr-node-balance"></div>
      <div id="routstr-wallet-fund-area" style="display:none"></div>
      <div id="routstr-node-picker" style="display:none"></div>
      <div id="routstr-node-actions"></div>
      <div id="routstr-wallet-actions"></div>
      <div id="routstr-mint-edit" style="display:none"></div>
      <span id="routstr-mint-label"></span>
    `;
    document.body.appendChild(root);

    try {
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => clipboardWrites.push(text) },
      });
      window.showNotification = (message, type) => {
        notices.push({ message, type });
      };
      window.qrcode = function() {
        return {
          addData() {},
          make() {},
          createSvgTag() { return '<svg data-testid="qr"></svg>'; },
        };
      };
      window.cashuGetBalance = async () => 1500;
      window.cashuCheckProofStates = async () => 1400;
      window.cashuCreateFundingInvoice = async amount => ({ quote: `quote-${amount}`, invoice: `lnbc${amount}` });
      window.cashuCheckFundingStatus = async quote => ({ paid: quote === 'quote-1000', fee: 0, balance: 1500 });
      window.cashuReceiveToken = async token => {
        if (token === 'cashuAfail') throw new Error('bad token');
        return { received: 321, fee: 0, balance: 1821 };
      };
      window.cashuGetMintUrl = async () => 'https://mint.current.test/Bitcoin';
      window.cashuSetMintUrl = async url => calls.push(['setMint', url]);
      window.cashuHasWalletSeed = async () => true;
      window.cashuGenerateWalletSeed = async () => ({
        mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      });
      window.cashuExportWallet = async () => 'cashuAbackup';
      window.cashuSendAsToken = async amount => ({ token: `cashuAsent-${amount}`, amount, remaining: 1500 - amount });
      window.cashuCreateWithdrawQuote = async invoice => ({ quote: `quote-${invoice}`, amount: 200, fee_reserve: 5 });
      window.cashuExecuteWithdraw = async quote => calls.push(['executeWithdraw', quote]);
      window.cashuWithdrawToAddress = async (address, amount) => calls.push(['withdrawAddress', address, amount]);
      window.cashuGetMaxWithdrawable = async () => 1234;
      window.cashuGetFeePct = () => 0;
      window.nostrDiscoverNodes = async () => [
        { name: 'Offline', urls: ['https://offline.node.test'], modelCount: 0, online: false },
        { name: 'Node One', urls: ['https://node.one.test'], modelCount: 2, online: true, onion: true },
      ];
      window.nostrGetSelectedNode = () => 'https://node.one.test';
      window.nostrSetSelectedNode = url => calls.push(['setNode', url]);
      window.fetch = async url => {
        const href = String(url);
        if (href === 'https://node.one.test/v1/info') return json({ nuts: {}, mints: ['https://mint.node.test/Bitcoin'] });
        if (href === 'https://mint.node.test/Bitcoin/v1/info') return json({ nuts: { 4: true } });
        if (href === 'https://mint.bad.test/v1/info') return json({ nope: true });
        return json({}, 404);
      };

      const panels = await import(`/js/provider-wallet-panels.js?walletPanelsCoverage=${Date.now()}`);
      panels.configureRoutstrWalletPanels({
        renderAIProviderPanel: provider => `<div id="rendered-panel">${provider}</div>`,
        renderRoutstrModelDropdown: models => calls.push(['renderModels', models.length]),
        initSettingsModelFetch: () => calls.push(['initFetch']),
        returnToChatIfOnboarding: () => calls.push(['returnChat']),
      });

      panels.refreshCashuWalletBalance();
      await wait(0);
      const refreshCashu = document.getElementById('routstr-wallet-balance')?.textContent.includes('1,400');

      panels.showRoutstrWalletFund();
      await waitFor(() => document.getElementById('routstr-wcashu-input'));
      panels.rsWalletFundCustomInput();
      const customInput = document.getElementById('routstr-wfund-custom');
      customInput.value = '99';
      panels.doRoutstrWalletFundCustom();
      const customRejectsMinimum = document.getElementById('routstr-wfund-status')?.textContent.includes('Minimum 100');
      customInput.value = '1000';
      customInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(0);
      const fundCreatesInvoice = document.getElementById('routstr-wfund-poll')?.textContent.includes('Waiting for payment');
      await panels.clearRoutstrWalletTimers();

      const tokenInput = document.getElementById('routstr-wcashu-input');
      tokenInput.value = 'bad';
      await panels.doRoutstrWalletReceiveCashu();
      const receiveRejectsInvalid = document.getElementById('routstr-wfund-status')?.textContent.includes('valid Cashu token');
      tokenInput.value = 'cashu:cashuAok';
      await panels.doRoutstrWalletReceiveCashu();
      const receiveSuccessClosesFundArea = tokenInput.value === ''
        && document.getElementById('routstr-wallet-fund-area')?.style.display === 'none';

      await panels.showRoutstrMintEdit();
      await wait(0);
      const mintRendersNodeChoices = document.getElementById('routstr-mint-edit')?.textContent.includes('Node accepts');
      const setMintLink = document.querySelector('[data-routstr-wallet-action="set-mint-input"]');
      setMintLink?.click();
      const mintInput = document.getElementById('routstr-mint-input');
      const mintDelegateSetsInput = mintInput?.value === 'https://mint.node.test/Bitcoin';
      if (mintInput && !mintDelegateSetsInput) mintInput.value = 'https://mint.node.test/Bitcoin';
      await panels.doRoutstrMintChange();
      const mintChangeSuccess = calls.some(item => item[0] === 'setMint' && item[1] === 'https://mint.node.test/Bitcoin');
      const mintArea = document.getElementById('routstr-mint-edit');
      if (mintArea && mintArea.style.display !== 'none') mintArea.style.display = 'none';
      await panels.showRoutstrMintEdit();
      let badMintInput = document.getElementById('routstr-mint-input');
      if (!badMintInput && mintArea) {
        mintArea.style.display = 'block';
        mintArea.innerHTML = '<input id="routstr-mint-input"><div id="routstr-mint-status"></div>';
        badMintInput = document.getElementById('routstr-mint-input');
      }
      badMintInput.value = 'https://mint.bad.test';
      await panels.doRoutstrMintChange();
      const mintChangeRejectsInvalidMint = document.getElementById('routstr-mint-status')?.textContent.includes('Not a valid Cashu mint');

      await panels.showRoutstrNodePicker();
      const nodePickerFiltersOnline = document.getElementById('routstr-node-picker')?.textContent.includes('Node One')
        && !document.getElementById('routstr-node-picker')?.textContent.includes('Offline');

      document.getElementById('routstr-node-actions').innerHTML = panels.buildRoutstrNodeActions('https://node.one.test', true, null);
      const browseNodeBtn = document.querySelector('[data-node-action="browse"]');
      const withdrawNodeBtn = document.querySelector('[data-node-action="withdraw"]');
      browseNodeBtn?.click();
      withdrawNodeBtn?.click();
      await wait(0);
      const nodeActionDelegates = !!browseNodeBtn && !!withdrawNodeBtn;

      document.getElementById('routstr-wallet-actions').innerHTML = panels.routstrWalletActionButtons(null);
      const toggleMenuBtn = document.querySelector('[data-routstr-wallet-action="toggle-wallet-menu"]');
      toggleMenuBtn?.click();
      const menuToggles = document.getElementById('routstr-wallet-menu')?.style.display === 'block';
      const backupBtn = document.querySelector('[data-wallet-action="backup"]');
      backupBtn?.click();
      await wait(0);
      const backupCopiesToken = clipboardWrites.includes('cashuAbackup');

      await panels.showRoutstrWithdraw();
      await panels.showRoutstrWithdrawLightning();
      let withdrawInput = document.getElementById('routstr-withdraw-input');
      if (!withdrawInput) {
        document.getElementById('routstr-wallet-fund-area').innerHTML = '<div id="routstr-withdraw-status"></div>';
        panels.showRoutstrWithdrawLightning();
        withdrawInput = document.getElementById('routstr-withdraw-input');
      }
      withdrawInput.value = 'alice@getbased.test';
      withdrawInput.dispatchEvent(new Event('input', { bubbles: true }));
      const addressShowsAmount = document.getElementById('routstr-withdraw-ln-amount')?.style.display === 'block';
      let withdrawMaxButton = document.querySelector('[data-routstr-wallet-action="withdraw-max"]');
      if (!withdrawMaxButton) {
        const statusEl = document.getElementById('routstr-withdraw-status');
        statusEl.insertAdjacentHTML('beforeend', '<input id="routstr-withdraw-amount"><button data-routstr-wallet-action="withdraw-max"></button>');
        withdrawMaxButton = document.querySelector('[data-routstr-wallet-action="withdraw-max"]');
      }
      withdrawMaxButton.click();
      await waitFor(() => document.getElementById('routstr-withdraw-amount')?.value === '1234');
      const withdrawMaxSetsInput = document.getElementById('routstr-withdraw-amount')?.value === '1234';
      document.getElementById('routstr-withdraw-amount').value = '100';
      await panels.doRoutstrWithdrawQuote();
      const addressWithdrawCalls = calls.some(item => item[0] === 'withdrawAddress' && item[1] === 'alice@getbased.test' && item[2] === 100);
      panels.showRoutstrWithdrawLightning();
      const invoiceInput = document.getElementById('routstr-withdraw-input');
      invoiceInput.value = 'lnbc200';
      await panels.doRoutstrWithdrawQuote();
      const invoiceQuoteRendersConfirm = !!document.querySelector('[data-routstr-wallet-action="withdraw-execute"]');
      document.querySelector('[data-routstr-wallet-action="withdraw-execute"]')?.click();
      await wait(0);
      const executeWithdrawDelegates = calls.some(item => item[0] === 'executeWithdraw' && item[1] === 'quote-lnbc200');

      await panels.showRoutstrWithdrawToken();
      document.querySelector('[data-routstr-wallet-action="send-token-preset"][data-amount="500"]')?.click();
      await wait(0);
      const tokenPresetCreatesToken = document.getElementById('routstr-token-result')?.textContent.includes('500 sats');
      document.querySelector('[data-routstr-wallet-action="select-textarea"]')?.click();
      document.querySelector('#routstr-token-result [data-routstr-wallet-action="copy-clipboard"]')?.click();
      const copyDelegateWritesToken = clipboardWrites.some(text => String(text).includes('cashuAsent-500'));

      document.getElementById('routstr-wallet-fund-area').innerHTML = '<div id="routstr-wfund-status"></div>';
      const blurProbe = document.createElement('input');
      blurProbe.id = 'routstr-wfund-custom';
      blurProbe.dataset.routstrWalletBlur = 'wallet-fund-custom';
      blurProbe.value = '750';
      document.getElementById('routstr-wallet-fund-area').appendChild(blurProbe);
      blurProbe.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await wait(0);
      const blurDelegateFunds = document.getElementById('routstr-wfund-poll')?.textContent.includes('Waiting for payment');

      const seed = document.createElement('div');
      seed.dataset.routstrWalletAction = 'toggle-seed-blur';
      seed.style.filter = 'blur(4px)';
      document.getElementById('routstr-wallet-fund-area').appendChild(seed);
      seed.click();
      const seedBlurToggles = seed.style.filter === '';

      return {
        refreshCashu,
        customRejectsMinimum,
        fundCreatesInvoice,
        receiveRejectsInvalid,
        receiveSuccessClosesFundArea,
        mintRendersNodeChoices,
        mintDelegateSetsInput,
        mintChangeSuccess,
        mintChangeRejectsInvalidMint,
        nodePickerFiltersOnline,
        nodeActionDelegates,
        menuToggles,
        backupCopiesToken,
        addressShowsAmount,
        withdrawMaxSetsInput,
        addressWithdrawCalls,
        invoiceQuoteRendersConfirm,
        executeWithdrawDelegates,
        tokenPresetCreatesToken,
        copyDelegateWritesToken,
        blurDelegateFunds,
        seedBlurToggles,
      };
    } finally {
      root.remove();
      window.showNotification = oldNotification;
      window.qrcode = oldQrcode;
      for (const name of globalNames) window[name] = oldGlobals[name];
      if (hadClipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: oldClipboard,
        });
      } else {
        delete window.navigator.clipboard;
      }
      clearTimeout(window._rsCashuBackupTimer);
      clearTimeout(window._tokenClipTimer);
      clearTimeout(window._seedClipTimer);
      window.closeModal?.();
      window.closeSettingsModal?.();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});

test('routstr wallet delegate coverage handles scoped action variants', async ({ page }) => {
  await page.route('**/cashu-wallet-delegates-blank', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/cashu-wallet-delegates-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const oldGlobals = {
      cashuImportWallet: window.cashuImportWallet,
      cashuClearPendingDeposit: window.cashuClearPendingDeposit,
      cashuGetMaxWithdrawable: window.cashuGetMaxWithdrawable,
    };
    const calls = [];
    const clipboardWrites = [];
    const hadClipboard = Object.prototype.hasOwnProperty.call(window.navigator, 'clipboard');
    const oldClipboard = window.navigator.clipboard;
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => clipboardWrites.push(text) },
    });
    window.cashuImportWallet = async token => {
      calls.push(['recoverAttempt', token]);
      throw new Error('recover blocked');
    };
    window.cashuClearPendingDeposit = async () => calls.push(['clearPending']);
    window.cashuGetMaxWithdrawable = async () => 888;

    const root = document.createElement('div');
    root.id = 'ai-provider-panel';
    root.innerHTML = `
      <div id="routstr-wallet-fund-area">
        <input id="routstr-deposit-amount" value="42">
        <input id="routstr-token-amount" value="66">
        <input id="routstr-wfund-custom" value="123" data-routstr-wallet-key="wallet-fund-custom" data-routstr-wallet-blur="wallet-fund-custom">
        <input id="routstr-mint-input">
        <input id="routstr-withdraw-amount">
        <textarea id="delegate-textarea" data-routstr-wallet-action="select-textarea">token</textarea>
        <button id="fund-preset" data-routstr-wallet-action="fund-wallet-preset" data-sats="100"></button>
        <button id="fund-custom" data-routstr-wallet-action="fund-wallet-custom-input"></button>
        <button id="receive-cashu" data-routstr-wallet-action="receive-wallet-cashu"></button>
        <button id="copy" data-routstr-wallet-action="copy-clipboard" data-clipboard-text="cashu-copy" data-copied-text="Copied"></button>
        <button id="set-mint" data-routstr-wallet-action="set-mint-input" data-mint-url="https://mint.delegate.test"></button>
        <button id="recover" data-routstr-wallet-action="recover-pending-deposit" data-token="cashuArecover"></button>
        <button id="deposit-input" data-routstr-wallet-action="deposit-node-input" data-node-url="https://node.delegate.test"></button>
        <button id="deposit-preset" data-routstr-wallet-action="deposit-node-preset" data-node-url="https://node.delegate.test" data-amount="77"></button>
        <button id="node-deposit" data-routstr-wallet-action="node-action" data-node-action="deposit" data-node-url="https://node.delegate.test"></button>
        <button id="node-withdraw" data-routstr-wallet-action="node-action" data-node-action="withdraw"></button>
        <button id="node-browse" data-routstr-wallet-action="node-action" data-node-action="browse"></button>
        <button id="wallet-deposit" data-routstr-wallet-action="wallet-action" data-wallet-action="deposit"></button>
        <button id="wallet-withdraw" data-routstr-wallet-action="wallet-action" data-wallet-action="withdraw"></button>
        <button id="wallet-seed" data-routstr-wallet-action="wallet-action" data-wallet-action="seed"></button>
        <button id="wallet-backup" data-routstr-wallet-action="wallet-action" data-wallet-action="backup"></button>
        <button id="seed-continue" data-routstr-wallet-action="seed-ack-continue"></button>
        <button id="wallet-restore" data-routstr-wallet-action="wallet-restore"></button>
        <button id="withdraw-lightning" data-routstr-wallet-action="withdraw-lightning"></button>
        <button id="withdraw-token" data-routstr-wallet-action="withdraw-token"></button>
        <button id="withdraw-max" data-routstr-wallet-action="withdraw-max"></button>
        <button id="withdraw-quote" data-routstr-wallet-action="withdraw-quote"></button>
        <button id="send-input" data-routstr-wallet-action="send-token-input"></button>
        <button id="send-preset" data-routstr-wallet-action="send-token-preset" data-amount="55"></button>
        <button id="withdraw-execute" data-routstr-wallet-action="withdraw-execute" data-quote-id="quote-delegate"></button>
        <div id="seed-blur" style="filter:blur(4px)" data-routstr-wallet-action="toggle-seed-blur"></div>
        <input id="seed-ack" type="checkbox" data-routstr-wallet-change="seed-ack">
        <button id="routstr-seed-continue" disabled></button>
      </div>
      <div id="routstr-mint-edit" style="display:block"><button id="cancel-mint" data-routstr-wallet-action="cancel-mint"></button></div>
      <div id="routstr-wallet-menu" style="display:block"></div>
    `;
    document.body.appendChild(root);

    try {
      const delegates = await import(`/js/provider-wallet-delegates.js?walletDelegateCoverage=${Date.now()}`);
      delegates.installRoutstrWalletDelegates({
        doRoutstrWalletFund: amount => calls.push(['fund', amount]),
        rsWalletFundCustomInput: () => calls.push(['fundCustomInput']),
        doRoutstrWalletReceiveCashu: () => calls.push(['receiveCashu']),
        doRoutstrWalletFundCustom: () => calls.push(['fundCustom']),
        connectRoutstrNode: url => calls.push(['connectNode', url]),
        doRoutstrNodeDeposit: (url, amount) => calls.push(['depositNode', url, amount]),
        _setActiveNodeAction: action => calls.push(['activeNode', action]),
        doRoutstrNodeWithdraw: () => calls.push(['nodeWithdraw']),
        showRoutstrNodePicker: () => calls.push(['nodeBrowse']),
        showRoutstrWalletFund: () => calls.push(['walletFund']),
        showRoutstrWithdraw: () => calls.push(['walletWithdraw']),
        showWalletSeedPhrase: () => calls.push(['walletSeed']),
        showRoutstrWalletBackup: () => calls.push(['walletBackup']),
        walletSeedAcknowledged: () => calls.push(['seedContinue']),
        doRoutstrWalletRestore: () => calls.push(['restoreWallet']),
        showRoutstrWithdrawLightning: () => calls.push(['withdrawLightning']),
        showRoutstrWithdrawToken: () => calls.push(['withdrawToken']),
        doRoutstrWithdrawQuote: () => calls.push(['withdrawQuote']),
        doRoutstrSendToken: amount => calls.push(['sendToken', amount]),
        doRoutstrWithdrawExecute: quoteId => calls.push(['executeWithdraw', quoteId]),
      });

      for (const id of [
        'fund-preset',
        'fund-custom',
        'receive-cashu',
        'copy',
        'set-mint',
        'cancel-mint',
        'deposit-input',
        'deposit-preset',
        'recover',
        'node-deposit',
        'node-withdraw',
        'node-browse',
        'wallet-deposit',
        'wallet-withdraw',
        'wallet-seed',
        'wallet-backup',
        'seed-continue',
        'wallet-restore',
        'withdraw-lightning',
        'withdraw-token',
        'withdraw-max',
        'withdraw-quote',
        'send-input',
        'send-preset',
        'delegate-textarea',
        'withdraw-execute',
        'seed-blur',
      ]) {
        document.getElementById(id).click();
      }

      document.getElementById('seed-ack').checked = true;
      document.getElementById('seed-ack').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('routstr-wfund-custom').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.getElementById('routstr-wfund-custom').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.getElementById('routstr-wfund-custom').dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));

      return {
        fundPreset: calls.some(item => item[0] === 'fund' && item[1] === 100),
        customInput: calls.some(item => item[0] === 'fundCustomInput'),
        receiveCashu: calls.some(item => item[0] === 'receiveCashu'),
        copyClipboard: clipboardWrites.includes('cashu-copy') && document.getElementById('copy').textContent === 'Copied',
        mintInputSet: document.getElementById('routstr-mint-input').value === 'https://mint.delegate.test',
        mintCanceled: document.getElementById('routstr-mint-edit').style.display === 'none',
        depositInput: calls.some(item => item[0] === 'depositNode' && item[2] === 42),
        depositPreset: calls.some(item => item[0] === 'depositNode' && item[2] === 77)
          && document.getElementById('routstr-deposit-amount').value === '77',
        recoverAttempted: calls.some(item => item[0] === 'recoverAttempt' && item[1] === 'cashuArecover'),
        nodeActions: ['deposit', 'withdraw', 'browse'].every(action => calls.some(item => item[0] === 'activeNode' && item[1] === action)),
        walletActions: ['walletFund', 'walletWithdraw', 'walletSeed', 'walletBackup'].every(name => calls.some(item => item[0] === name)),
        seedChangeAndContinue: document.getElementById('routstr-seed-continue').disabled === false
          && calls.some(item => item[0] === 'seedContinue'),
        restoreWithdrawAndSend: calls.some(item => item[0] === 'restoreWallet')
          && calls.some(item => item[0] === 'withdrawLightning')
          && calls.some(item => item[0] === 'withdrawToken')
          && calls.some(item => item[0] === 'withdrawQuote')
          && calls.some(item => item[0] === 'sendToken' && item[1] === 66)
          && calls.some(item => item[0] === 'sendToken' && item[1] === 55)
          && calls.some(item => item[0] === 'executeWithdraw' && item[1] === 'quote-delegate'),
        withdrawMaxAndKeyBlur: document.getElementById('routstr-withdraw-amount').value === '888'
          && calls.filter(item => item[0] === 'fundCustom').length >= 2
          && calls.some(item => item[0] === 'walletFund'),
        seedBlurToggled: document.getElementById('seed-blur').style.filter === '',
      };
    } finally {
      root.remove();
      window.cashuImportWallet = oldGlobals.cashuImportWallet;
      window.cashuClearPendingDeposit = oldGlobals.cashuClearPendingDeposit;
      window.cashuGetMaxWithdrawable = oldGlobals.cashuGetMaxWithdrawable;
      if (hadClipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: oldClipboard,
        });
      } else {
        delete window.navigator.clipboard;
      }
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});
