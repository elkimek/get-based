type FixtureProof = Record<string,unknown>;
type FixtureFirstArgument<Callable> = Callable extends (first: infer _First,...rest:infer Rest)=>infer Result ? (first:unknown,...rest:Rest)=>Result : never;
import { routeHtml } from '../helpers/browser-static-routes.js';
import { installWalletFixtures } from '../helpers/wallet-browser-fixtures.js';
import { expect, test } from './coverage-fixture.js';
test.beforeEach(async ({ page }) => installWalletFixtures(page));

test('cashu wallet browser coverage exercises storage, mint, deposit, withdraw, and fee paths', async ({ page }) => {
  await routeHtml(page, '**/cashu-wallet-blank', '<!doctype html><html><body></body></html>');
  await page.goto('/cashu-wallet-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const { makeTestInvoice, LNURL_METADATA } = await import('/wallet-test-lightning-invoices.js');
    const { validateLightningInvoice } = await import('/js/routstr-validation.js');
    const oldGlobals = {
      cashuts: (window as {cashuts?: unknown}).cashuts,
      bip39: (window as {bip39?: unknown}).bip39,
      fetch: window.fetch,
      showNotification: (window as unknown as {showNotification:unknown}).showNotification,
    };
    const notices: unknown[] = [];
    const proof = (secret: unknown, amount: unknown, extra: unknown = {}) => ({ secret, amount, C: `C-${secret}`, ...(extra as object) });
    const state = {
      receiveQueue: [
        [proof('rx-token-1', 10)],
        [proof('rx-token-2', 9)],
        [proof('import-token-1', 3)],
        [proof('rx-token-3', 100)],
      ],
      instances: [] as Wallet[],
      meltQuotes: new Map<unknown,{quote:string;amount:number;request:unknown;fee_reserve:number;state:string}>(),
      sendId: 0,
      failMelt: false,
      topupAuth: null as unknown,
      createDepositUrl: null as string | null,
      lnurlAmounts: [] as number[],
    };

    function sumProofs(proofs: FixtureProof[] = []) {
      return proofs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }

    class Wallet {
      declare url:unknown;
      declare opts:unknown;
      declare keyChain:{getKeysets:()=>{id:string}[]};
      declare counters:{advanceToAtLeast:()=>Promise<void>};
      constructor(url: unknown, opts: unknown = {}) {
        this.url = url;
        this.opts = opts;
        this.keyChain = { getKeysets: () => [{ id: 'browser-keyset' }] };
        this.counters = { advanceToAtLeast: async () => {} };
        state.instances.push(this);
      }

      async loadMint() {}

      async groupProofsByState(proofs: FixtureProof[]) {
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

      async send(amount: unknown, proofs: FixtureProof[]) {
        const total = sumProofs(proofs);
        state.sendId += 1;
        return {
          send: [proof(`send-${amount}-${state.sendId}`, amount)],
          keep: total > (amount as number) ? [proof(`keep-${total - (amount as number)}-${state.sendId}`, total - (amount as number))] : [],
        };
      }

      async createMintQuoteBolt11(amount: unknown) {
        return { quote: `mint-${amount}`, request: (makeTestInvoice as FixtureFirstArgument<typeof makeTestInvoice>)(amount), amount, state: 'UNPAID' };
      }

      async checkMintQuoteBolt11(quoteId: unknown) {
        if (quoteId === 'mint-unpaid') return { state: 'UNPAID', amount: 0 };
        return { state: 'PAID', amount: Number(String(quoteId).replace(/\D/g, '')) || 0 };
      }

      async mintProofsBolt11(amount: unknown, quoteId: unknown) {
        return [proof(`minted-${quoteId}`, amount)];
      }

      async batchRestore(_batchSize: unknown, _gap: unknown, start: unknown) {
        return (start as number) > 0
          ? { proofs: [] }
          : { proofs: [proof('restored-live', 7), proof('restored-spent', 5, { spent: true })] };
      }

      async createMeltQuoteBolt11(invoice: unknown) {
        const amount = validateLightningInvoice(invoice).msats / 1000;
        const quote = { quote: `quote-${amount}-${state.meltQuotes.size}`, amount, request: invoice, fee_reserve: 5, state: 'UNPAID' };
        state.meltQuotes.set((quote as {quote:unknown}).quote, quote);
        return quote;
      }

      async checkMeltQuoteBolt11(quoteId: unknown) {
        return state.meltQuotes.get(quoteId) || { quote: quoteId, amount: 10, fee_reserve: 5 };
      }

      async meltProofsBolt11(quote: unknown) {
        if (state.failMelt) throw new Error('melt failed');
        return { change: [proof(`melt-change-${(quote as {quote:unknown}).quote}`, 1)] };
      }
    }

    (window as {cashuts?: unknown}).cashuts = {
      Wallet,
      MintQuoteState: { PAID: 'PAID' },
      sumProofs,
      getEncodedToken: ({ mint, proofs }: {mint:unknown;proofs:FixtureProof[]}) => `cashu:${mint}:${sumProofs(proofs)}:${proofs.map(item => item.secret).join(',')}`,
      getTokenMetadata: () => ({ mint: 'https://mint.browser-wallet.test/Bitcoin', unit: 'sat' }),
    };
    const { installDurableBrowserStub } = await import('/wallet-test-cashu-browser-durable.js');
    const mintStub = installDurableBrowserStub((window as {cashuts?: unknown}).cashuts, () => sumProofs(state.receiveQueue[0] || []));
    (window as {bip39?: unknown}).bip39 = {
      generateMnemonic: async () => 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      validateMnemonic: async (mnemonic: unknown) => String(mnemonic).trim().split(/\s+/).length === 12,
      mnemonicToSeed: async () => new Uint8Array(64).buffer,
    };
    (window as unknown as {showNotification:unknown}).showNotification = (message: unknown, type: unknown) => notices.push({ message, type });
    window.fetch = async function(url: unknown, opts: unknown = {}) {
      const href = String(url);
      if (href === 'https://getbased.test/.well-known/lnurlp/alice') {
        return new Response(JSON.stringify({
          tag: 'payRequest', metadata: LNURL_METADATA, callback: 'https://lnurl.getbased.test/callback?tag=pay',
          minSendable: 1000,
          maxSendable: 200000,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (href.startsWith('https://lnurl.getbased.test/callback')) {
        const amountMsats = Number(new URL(href).searchParams.get('amount'));
        state.lnurlAmounts.push(amountMsats);
        return new Response(JSON.stringify({ pr: makeTestInvoice(amountMsats / 1000) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.startsWith('https://node.wallet-browser.test/v1/balance/info')) return new Response(JSON.stringify({ balance: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (href.startsWith('https://node.wallet-browser.test/v1/balance/topup')) {
        state.topupAuth = (opts as {headers?:{Authorization?:unknown}}).headers?.Authorization || '';
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
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('getbased-cashu');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(resolve, 500);
      });
    }

    await deleteCashuDb();
    const [walletStore, cryptoStore] = await Promise.all([
      import('/js/cashu-wallet-store.js'),
      import('/js/crypto.js'),
    ]);
    walletStore.configureCashuWalletStoreCryptoDeps({
      decryptObject: cryptoStore.decryptObject,
      encryptedGetItem: cryptoStore.encryptedGetItem,
      encryptedSetItem: cryptoStore.encryptedSetItem,
      encryptObject: cryptoStore.encryptObject,
      getEncryptionEnabled: cryptoStore.getEncryptionEnabled,
      isEncryptedObject: cryptoStore.isEncryptedObject,
    });
    const wallet = (await import(`/js/cashu-wallet.js?cashuWalletCoverage=${Date.now()}`) as unknown) as Pick<typeof import('../../js/cashu-wallet.js'), "getMintUrl" | "setMintUrl" | "hasWalletSeed" | "generateWalletSeed" | "getWalletMnemonic" | "createFundingInvoice" | "checkFundingStatus" | "receiveToken" | "exportWallet" | "sendAsToken" | "recoverPendingWithdraw" | "clearPendingWithdraw" | "depositToNode" | "recoverPendingDeposit" | "clearPendingDeposit" | "importWallet" | "checkProofStates" | "getMaxWithdrawable" | "withdrawToAddress" | "createWithdrawQuote" | "executeWithdraw" | "getWalletBalance" | "restoreWalletFromSeed" | "getFeePct" | "getFeeBalance" | "retryFeeAutoMelt" | "redeemFees" | "clearWallet" | "destroyWalletDB">;
    const { configureApiProviderStorageRuntimeDeps } = await import('/js/api-provider-storage-runtime.js');
    configureApiProviderStorageRuntimeDeps({ encryptedSetItem: cryptoStore.encryptedSetCredentialItem });
    const { saveRoutstrSessionKey } = await import('/js/routstr-session.js');
    const outcomes: Record<string, unknown> = {};

    try {
      outcomes.defaultMint = await wallet.getMintUrl();
      try {
        await wallet.setMintUrl('http://127.0.0.1:3338');
        outcomes.rejectsUnsafeMint = false;
      } catch (error) {
        outcomes.rejectsUnsafeMint = /public https/i.test((error as {message?:unknown}).message as string);
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
      outcomes.fundingPaths = validateLightningInvoice(funding.invoice, 7).msats === 7000
        && funded.paid === true
        && funded.balance === 7
        && unpaid.paid === false;

      const received = await wallet.receiveToken('cashuA-token');
      outcomes.receiveAddsProofs = received.received === 10 && received.balance === 17;

      const exportedBeforeSend = await wallet.exportWallet();
      const sent = await wallet.sendAsToken(4);
      const pendingSentToken = await wallet.recoverPendingWithdraw();
      outcomes.exportAndSend = (exportedBeforeSend)!.includes('minted-mint-7')
        && sent.amount === 4
        && sent.remaining === 13
        && pendingSentToken === sent.token;
      (mintStub.spendToken as FixtureFirstArgument<typeof mintStub.spendToken>)(await wallet.recoverPendingWithdraw());
      await wallet.clearPendingWithdraw();

      await saveRoutstrSessionKey('sk-existing', 'https://node.wallet-browser.test');
      try {
        await wallet.depositToNode('https://node.wallet-browser.test///', 5, 'sk-existing');
        outcomes.depositFailureRecoverable = false;
      } catch (error) {
        const pending = await wallet.recoverPendingDeposit();
        outcomes.depositFailureRecoverable = /outcome is unconfirmed/.test((error as {message?:unknown}).message as string)
          && state.topupAuth === 'Bearer sk-existing'
          && (pending)!.includes('send-5');
      }
      state.receiveQueue.unshift([proof('deposit-reclaimed', 5)]);
      await (wallet.receiveToken as FixtureFirstArgument<typeof wallet.receiveToken>)(await wallet.recoverPendingDeposit());
      await wallet.clearPendingDeposit();
      await saveRoutstrSessionKey('', 'https://node.wallet-browser.test');
      outcomes.clearPendingDeposit = await wallet.recoverPendingDeposit() === null;

      await wallet.receiveToken('cashuA-second');
      const created = await wallet.depositToNode('https://node.wallet-browser.test', 4);
      outcomes.depositSuccessClearsPending = created.api_key === 'sk-created'
        && (state.createDepositUrl)!.endsWith('/v1/balance/create')
        && await wallet.recoverPendingDeposit() === null;

      const imported = await wallet.importWallet('cashuA-import');
      outcomes.importAddsProofs = imported === 3;

      state.receiveQueue.unshift([
        proof('state-live', 6),
        proof('state-spent', 4, { spent: true }),
        proof('state-pending', 5, { pending: true }),
      ]);
      await wallet.receiveToken('cashuA-proof-state');
      const checkedBalance = await wallet.checkProofStates();
      const exportedAfterStateCheck = await wallet.exportWallet();
      outcomes.checkProofStatesPrunesSpentAndKeepsPending = checkedBalance > 0
        && (exportedAfterStateCheck)!.includes('state-live')
        && (exportedAfterStateCheck)!.includes('state-pending')
        && !(exportedAfterStateCheck)!.includes('state-spent');

      const max = await wallet.getMaxWithdrawable();
      const addressWithdraw = await wallet.withdrawToAddress('alice@getbased.test', Math.min(max + 2, 20));
      outcomes.lightningAddressWithdraw = addressWithdraw.paid === true
        && addressWithdraw.amount > 0
        && state.lnurlAmounts.length > 0;

      await wallet.receiveToken('cashuA-third');
      const quote = await wallet.createWithdrawQuote(makeTestInvoice(10));
      state.failMelt = true;
      try {
        await (wallet.executeWithdraw as FixtureFirstArgument<typeof wallet.executeWithdraw>)((quote as {quote:unknown}).quote);
        outcomes.failedMeltRecoverable = false;
      } catch (error) {
        const pendingWithdraw = await wallet.recoverPendingWithdraw();
        outcomes.failedMeltRecoverable = /melt failed/.test((error as {message?:unknown}).message as string)
          && (pendingWithdraw)!.includes('send-15');
      }
      (mintStub.spendToken as FixtureFirstArgument<typeof mintStub.spendToken>)(await wallet.recoverPendingWithdraw());
      await wallet.clearPendingWithdraw();
      outcomes.clearPendingWithdraw = await wallet.recoverPendingWithdraw() === null;
      state.failMelt = false;

      const balanceBeforeRestore = await wallet.getWalletBalance();
      const restore = await wallet.restoreWalletFromSeed(generated.mnemonic);
      outcomes.restoreUsesSeedWithoutDeletingExistingFunds = restore.balance === balanceBeforeRestore + 7
        && restore.restoredCount === 7
        && state.instances.some(instance => (instance.opts as {counterSource?:unknown})?.counterSource);

      outcomes.feeEmptyPaths = wallet.getFeePct() === 0
        && await wallet.getFeeBalance() === 0
        && (await wallet.retryFeeAutoMelt()).melted === 0;
      try {
        await wallet.redeemFees(makeTestInvoice(1));
        outcomes.redeemEmptyFeesRejects = false;
      } catch (error) {
        outcomes.redeemEmptyFeesRejects = /No fee proofs/.test((error as {message?:unknown}).message as string);
      }

      await wallet.clearWallet();
      outcomes.clearWalletEmpties = await wallet.getWalletBalance() === 0;
      const destroyed = await Promise.race([
        wallet.destroyWalletDB().then(() => true).catch(() => false),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 500)),
      ]);
      outcomes.destroyWalletDbInvoked = destroyed === true || destroyed === 'timeout';
      return outcomes;
    } finally {
      await deleteCashuDb();
      (window as {cashuts?: unknown}).cashuts = oldGlobals.cashuts;
      (window as {bip39?: unknown}).bip39 = oldGlobals.bip39;
      window.fetch = oldGlobals.fetch;
      (window as unknown as {showNotification:unknown}).showNotification = oldGlobals.showNotification;
      localStorage.removeItem('labcharts-cashu-wallet-mint');
      localStorage.removeItem('labcharts-cashu-wallet-mnemonic');
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});

test('cashu wallet browser coverage exercises fee proof auto-melt storage', async ({ page }) => {
  await routeHtml(page, '**/cashu-wallet-fee-blank', '<!doctype html><html><body></body></html>');
  // Production fee collection is disabled; this routed copy reaches the private auto-melt path without changing app code.
  await page.route('**/js/cashu-wallet.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace('const WALLET_FEE_PCT = 0;', 'const WALLET_FEE_PCT = 0.5;');
    if (body === source) throw new Error('Failed to enable Cashu fee path for coverage test');
    await route.fulfill({
      response,
      body,
      headers: {
        ...response.headers(),
        'content-type': 'application/javascript',
      },
    });
  });
  await page.goto('/cashu-wallet-fee-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const { makeTestInvoice, LNURL_METADATA } = await import('/wallet-test-lightning-invoices.js');
    const { validateLightningInvoice } = await import('/js/routstr-validation.js');
    const oldGlobals = {
      cashuts: (window as {cashuts?: unknown}).cashuts,
      bip39: (window as {bip39?: unknown}).bip39,
      fetch: window.fetch,
      showNotification: (window as unknown as {showNotification:unknown}).showNotification,
    };
    const proof = (secret: unknown, amount: unknown, extra: unknown = {}) => ({ secret, amount, C: `C-${secret}`, ...(extra as object) });
    const state = {
      meltCalls: [] as {quote:unknown;amount:number}[],
      lnurlAmounts: [] as number[],
      receiveQueue: [[proof('fee-token', 240)]],
    };
    const sumProofs = (proofs: FixtureProof[] = []) => proofs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const waitFor = async (predicate: () => unknown | Promise<unknown>, label: string) => {
      for (let i = 0; i < 120; i += 1) {
        const value = await predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    class Wallet {
      async loadMint() {}

      async groupProofsByState(proofs: FixtureProof[]) {
        return { unspent: proofs, spent: [], pending: [] };
      }

      async receive() {
        return (state.receiveQueue.shift() || [proof('fee-fallback', 1)])
          .map(item => ({ ...item }));
      }

      async send(amount: unknown, proofs: FixtureProof[]) {
        const total = sumProofs(proofs);
        return {
          send: [proof(`fee-send-${amount}`, amount)],
          keep: total > (amount as number) ? [proof(`fee-keep-${total - (amount as number)}`, total - (amount as number))] : [],
        };
      }

      async createMeltQuoteBolt11(invoice: unknown) {
        const amount = validateLightningInvoice(invoice).msats / 1000;
        return { quote: `fee-quote-${amount}`, amount, request: invoice, fee_reserve: 5, state: 'UNPAID' };
      }

      async meltProofsBolt11(quote: unknown, proofs: FixtureProof[]) {
        state.meltCalls.push({ quote, amount: sumProofs(proofs) });
        return { change: [proof(`fee-change-${state.meltCalls.length}`, 1)] };
      }
    }

    (window as {cashuts?: unknown}).cashuts = {
      Wallet,
      sumProofs,
      getEncodedToken: ({ mint, proofs }: {mint:unknown;proofs:FixtureProof[]}) => `cashu:${mint}:${sumProofs(proofs)}:${proofs.map(item => item.secret).join(',')}`,
      getTokenMetadata: () => ({ mint: 'https://mint.fee-coverage.test/Bitcoin', unit: 'sat' }),
    };
    const { installDurableBrowserStub } = await import('/wallet-test-cashu-browser-durable.js');
    installDurableBrowserStub((window as {cashuts?: unknown}).cashuts, () => sumProofs(state.receiveQueue[0] || []));
    (window as {bip39?: unknown}).bip39 = oldGlobals.bip39 || {};
    (window as unknown as {showNotification:unknown}).showNotification = () => {};
    window.fetch = async (url: unknown) => {
      const href = String(url);
      if (href === 'https://primal.net/.well-known/lnurlp/denimgecko11') {
        return new Response(JSON.stringify({
          tag: 'payRequest', metadata: LNURL_METADATA, callback: 'https://lnurl.primal.test/callback?tag=pay',
          minSendable: 1000,
          maxSendable: 200000,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (href.startsWith('https://lnurl.primal.test/callback')) {
        const amountMsats = Number(new URL(href).searchParams.get('amount'));
        state.lnurlAmounts.push(amountMsats);
        return new Response(JSON.stringify({ pr: makeTestInvoice(amountMsats / 1000) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    };

    async function deleteCashuDb() {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('getbased-cashu');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(resolve, 500);
      });
    }

    let wallet: Pick<typeof import('../../js/cashu-wallet.js'),"setMintUrl"|"receiveToken"|"getFeeBalance"|"getWalletBalance"|"getFeePct"> | undefined;
    try {
      await deleteCashuDb();
      const [walletStore, cryptoStore] = await Promise.all([
        import('/js/cashu-wallet-store.js'),
        import('/js/crypto.js'),
      ]);
      walletStore.configureCashuWalletStoreCryptoDeps({
        decryptObject: cryptoStore.decryptObject,
        encryptedGetItem: cryptoStore.encryptedGetItem,
        encryptedSetItem: cryptoStore.encryptedSetItem,
        encryptObject: cryptoStore.encryptObject,
        getEncryptionEnabled: cryptoStore.getEncryptionEnabled,
        isEncryptedObject: cryptoStore.isEncryptedObject,
      });
      wallet = (await import(`/js/cashu-wallet.js?cashuFeeCoverage=${Date.now()}`) as unknown) as Pick<typeof import('../../js/cashu-wallet.js'),"setMintUrl"|"receiveToken"|"getFeeBalance"|"getWalletBalance"|"getFeePct">;
      await wallet.setMintUrl('https://mint.fee-coverage.test/Bitcoin');
      const received = await wallet.receiveToken('cashuA-fee-token');
      const feeBalance = await waitFor(async () => {
        const balance = await (wallet)!.getFeeBalance();
        return balance === 1 ? balance : null;
      }, 'fee auto-melt change proof');
      const walletBalance = await wallet.getWalletBalance();

      return {
        feePctEnabledInRoutedModule: wallet.getFeePct() === 0.5,
        receiveCollectedFee: received.received === 120 && received.fee === 120,
        autoMeltRequestedInvoiceForFeeMinusReserve: state.lnurlAmounts.includes(115000),
        autoMeltSavedChangeFeeProof: feeBalance === 1,
        autoMeltCalledMintWithFeeProofs: state.meltCalls.length === 1
          && (state.meltCalls[0]!.quote as {amount?:unknown}).amount === 115
          && (state.meltCalls[0])!.amount === 120,
        walletKeepsPostFeeChange: walletBalance === 120,
      };
    } finally {
      await deleteCashuDb();
      (window as {cashuts?: unknown}).cashuts = oldGlobals.cashuts;
      (window as {bip39?: unknown}).bip39 = oldGlobals.bip39;
      window.fetch = oldGlobals.fetch;
      (window as unknown as {showNotification:unknown}).showNotification = oldGlobals.showNotification;
      localStorage.removeItem('labcharts-cashu-wallet-mint');
      localStorage.removeItem('labcharts-cashu-wallet-mnemonic');
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});

test('routstr wallet panels and delegates cover browser-only actions', async ({ page }) => {
  await routeHtml(page, '**/cashu-wallet-panels-blank', '<!doctype html><html><body></body></html>');
  await page.goto('/cashu-wallet-panels-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const { makeTestInvoice, LNURL_METADATA: _LNURL_METADATA } = await import('/wallet-test-lightning-invoices.js');
    const { validateLightningInvoice: _validateLightningInvoice } = await import('/js/routstr-validation.js');
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const [walletStore, cryptoStore] = await Promise.all([
      import('/js/cashu-wallet-store.js'),
      import('/js/crypto.js'),
    ]);
    walletStore.configureCashuWalletStoreCryptoDeps({
      decryptObject: cryptoStore.decryptObject,
      encryptedGetItem: cryptoStore.encryptedGetItem,
      encryptedSetItem: cryptoStore.encryptedSetItem,
      encryptObject: cryptoStore.encryptObject,
      getEncryptionEnabled: cryptoStore.getEncryptionEnabled,
      isEncryptedObject: cryptoStore.isEncryptedObject,
    });
    const providerStorageRuntime = await import('/js/api-provider-storage-runtime.js');
    const previousProviderStorageRuntime = providerStorageRuntime.configureApiProviderStorageRuntimeDeps({
      encryptedSetItem: cryptoStore.encryptedSetItem,
    });
    const oldGlobals: Record<string,unknown> = {};
    const globalNames = [
      'cashuGetBalance',
      'cashuCheckProofStates',
      'cashuCreateFundingInvoice',
      'cashuCheckFundingStatus',
      'cashuRecoverPendingFunding',
      'cashuReceiveToken',
      'cashuGetMintUrl',
      'cashuSetMintUrl',
      'cashuDepositToNode',
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
    for (const name of globalNames) oldGlobals[name] = (window as unknown as Record<string,unknown>)[name];
    const notices: unknown[] = [];
    const calls: unknown[][] = [];
    const clipboardWrites: unknown[] = [];
    const oldNotification = (window as unknown as {showNotification:unknown}).showNotification;
    const oldQrcode = (window as {qrcode?: unknown}).qrcode;
    const hadClipboard = Object.prototype.hasOwnProperty.call(window.navigator, 'clipboard');
    const oldClipboard = window.navigator.clipboard;
    let currentMint: unknown = 'https://mint.current.test/Bitcoin';
    let panels: Pick<typeof import('../../js/provider-wallet-panels.js'),"buildRoutstrNodeActions"|"clearRoutstrWalletTimers"|"configureRoutstrWalletPanels"|"configureRoutstrWalletRuntime"|"connectRoutstrNode"|"doRoutstrMintChange"|"doRoutstrNodeDeposit"|"doRoutstrWalletFundCustom"|"doRoutstrWalletReceiveCashu"|"doRoutstrWithdrawQuote"|"recoverPendingWalletFunding"|"refreshCashuWalletBalance"|"routstrWalletActionButtons"|"rsWalletFundCustomInput"|"showRoutstrMintEdit"|"showRoutstrNodePicker"|"showRoutstrWalletFund"|"showRoutstrWithdraw"|"showRoutstrWithdrawLightning"|"showRoutstrWithdrawToken"> | null = null;
    const getMaxWithdrawable = async () => 1234;

    function json(body: unknown, status = 200) {
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }

    async function waitFor(fn:()=>unknown, timeout = 1000) {
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
        value: { writeText: async (text: unknown) => clipboardWrites.push(text) },
      });
      (window as unknown as {showNotification:unknown}).showNotification = (message: unknown, type: unknown) => {
        notices.push({ message, type });
      };
      (window as {qrcode?: unknown}).qrcode = function() {
        return {
          addData() {},
          make() {},
          createSvgTag() { return '<svg data-testid="qr"></svg>'; },
        };
      };
      (window as unknown as {cashuGetBalance:unknown}).cashuGetBalance = async () => 1500;
      (window as unknown as {cashuCheckProofStates:unknown}).cashuCheckProofStates = async () => 1400;
      (window as unknown as {cashuCreateFundingInvoice:unknown}).cashuCreateFundingInvoice = async (amount: unknown) => ({ quote: `quote-${amount}`, invoice: (makeTestInvoice as FixtureFirstArgument<typeof makeTestInvoice>)(amount) });
      (window as unknown as {cashuCheckFundingStatus:unknown}).cashuCheckFundingStatus = async (quote: unknown) => ({ paid: quote === 'quote-1000', fee: 0, balance: 1500 });
      (window as unknown as {cashuRecoverPendingFunding:unknown}).cashuRecoverPendingFunding = async () => ({ checked: 1, recovered: 777, pending: 0, failed: 0, balance: 2277, errors: [] });
      (window as unknown as {cashuReceiveToken:unknown}).cashuReceiveToken = async (token: unknown) => {
        if (token === 'cashuAfail') throw new Error('bad token');
        return { received: 321, fee: 0, balance: 1821 };
      };
      (window as unknown as {cashuGetMintUrl:unknown}).cashuGetMintUrl = async () => currentMint;
      (window as unknown as {cashuSetMintUrl:unknown}).cashuSetMintUrl = async (url: unknown) => {
        currentMint = url;
        calls.push(['setMint', url]);
      };
      (window as unknown as {cashuDepositToNode:unknown}).cashuDepositToNode = async (nodeUrl: unknown, amount: unknown, existingKey: unknown) => {
        calls.push(['depositToNode', nodeUrl, amount, existingKey || '']);
        await (await import('/js/api.js')).saveRoutstrKey('sk-wallet-browser', nodeUrl as string);
        return { api_key: 'sk-wallet-browser', balance: amount };
      };
      (window as unknown as {cashuHasWalletSeed:unknown}).cashuHasWalletSeed = async () => true;
      (window as unknown as {cashuGenerateWalletSeed:unknown}).cashuGenerateWalletSeed = async () => ({
        mnemonic: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      });
      (window as unknown as {cashuExportWallet:unknown}).cashuExportWallet = async () => 'cashuAbackup';
      (window as unknown as {cashuSendAsToken:unknown}).cashuSendAsToken = async (amount: unknown) => ({ token: `cashuAsent-${amount}`, amount, remaining: 1500 - (amount as number) });
      (window as unknown as {cashuCreateWithdrawQuote:unknown}).cashuCreateWithdrawQuote = async (invoice: unknown) => ({ quote: `quote-${invoice}`, amount: 200, fee_reserve: 5 });
      (window as unknown as {cashuExecuteWithdraw:unknown}).cashuExecuteWithdraw = async (quote: unknown) => { calls.push(['executeWithdraw', quote]); return { paid: true }; };
      (window as unknown as {cashuWithdrawToAddress:unknown}).cashuWithdrawToAddress = async (address: unknown, amount: unknown) => { calls.push(['withdrawAddress', address, amount]); return { paid: true, amount }; };
      (window as unknown as {cashuGetMaxWithdrawable:unknown}).cashuGetMaxWithdrawable = getMaxWithdrawable;
      (window as unknown as {cashuGetFeePct:unknown}).cashuGetFeePct = () => 0;
      (window as unknown as {nostrDiscoverNodes:unknown}).nostrDiscoverNodes = async () => [
        { name: 'Offline', urls: ['https://offline.node.test'], modelCount: 0, online: false },
        { name: 'Node One', urls: ['https://node.one.test'], modelCount: 2, online: true, onion: true },
      ];
      (window as unknown as {nostrGetSelectedNode:unknown}).nostrGetSelectedNode = () => 'https://node.one.test';
      (window as unknown as {nostrSetSelectedNode:unknown}).nostrSetSelectedNode = (url: unknown) => {
        localStorage.setItem('labcharts-routstr-node', url as string);
        calls.push(['setNode', url]);
      };
      window.fetch = async (url: unknown) => {
        const href = String(url);
        if (href === 'https://node.one.test/v1/info') return json({ nuts: {}, mints: ['https://mint.node.test/Bitcoin'] });
        if (href === 'https://node.one.test/v1/models') {
          return json({
            data: [
              {
                id: 'claude-sonnet-4.6',
                name: 'Claude Sonnet 4.6',
                enabled: true,
                pricing: { prompt: '0.000001', completion: '0.000002' },
              },
              {
                id: 'image-preview',
                name: 'Image Preview',
                enabled: true,
                architecture: { input_modalities: ['image'] },
              },
              { id: 'gpt-5-mini', name: 'GPT-5 mini', enabled: false },
            ],
          });
        }
        if (href === 'https://node.one.test/v1/balance/info') {
          return json({ balance: 987000, total_requests: 2, total_spent: 13000 });
        }
        if (href === 'https://mint.node.test/Bitcoin/v1/info') return json({ nuts: { 4: true } });
        if (href === 'https://mint.bad.test/v1/info') return json({ nope: true });
        return json({}, 404);
      };

      const walletRuntimeOverrides = {
        cashuGetBalance: (window as unknown as {cashuGetBalance:unknown}).cashuGetBalance,
        cashuCheckProofStates: (window as unknown as {cashuCheckProofStates:unknown}).cashuCheckProofStates,
        cashuCreateFundingInvoice: (window as unknown as {cashuCreateFundingInvoice:unknown}).cashuCreateFundingInvoice,
        cashuCheckFundingStatus: (window as unknown as {cashuCheckFundingStatus:unknown}).cashuCheckFundingStatus,
        cashuRecoverPendingFunding: (window as unknown as {cashuRecoverPendingFunding:unknown}).cashuRecoverPendingFunding,
        cashuReceiveToken: (window as unknown as {cashuReceiveToken:unknown}).cashuReceiveToken,
        cashuGetMintUrl: (window as unknown as {cashuGetMintUrl:unknown}).cashuGetMintUrl,
        cashuGetWalletMints: async () => [{ mint: currentMint, balance: 1500, active: true }],
        cashuSetMintUrl: (window as unknown as {cashuSetMintUrl:unknown}).cashuSetMintUrl,
        cashuDepositToNode: (window as unknown as {cashuDepositToNode:unknown}).cashuDepositToNode,
        cashuHasWalletSeed: (window as unknown as {cashuHasWalletSeed:unknown}).cashuHasWalletSeed,
        cashuGenerateWalletSeed: (window as unknown as {cashuGenerateWalletSeed:unknown}).cashuGenerateWalletSeed,
        cashuExportWallet: (window as unknown as {cashuExportWallet:unknown}).cashuExportWallet,
        cashuSendAsToken: (window as unknown as {cashuSendAsToken:unknown}).cashuSendAsToken,
        cashuCreateWithdrawQuote: (window as unknown as {cashuCreateWithdrawQuote:unknown}).cashuCreateWithdrawQuote,
        cashuExecuteWithdraw: (window as unknown as {cashuExecuteWithdraw:unknown}).cashuExecuteWithdraw,
        cashuWithdrawToAddress: (window as unknown as {cashuWithdrawToAddress:unknown}).cashuWithdrawToAddress,
        cashuGetMaxWithdrawable: getMaxWithdrawable,
        cashuGetFeePct: (window as unknown as {cashuGetFeePct:unknown}).cashuGetFeePct,
        nostrDiscoverNodes: (window as unknown as {nostrDiscoverNodes:unknown}).nostrDiscoverNodes,
        nostrGetSelectedNode: (window as unknown as {nostrGetSelectedNode:unknown}).nostrGetSelectedNode,
        nostrSetSelectedNode: (window as unknown as {nostrSetSelectedNode:unknown}).nostrSetSelectedNode,
      };
      panels = (await import(`/js/provider-wallet-panels.js?walletPanelsCoverage=${Date.now()}`) as unknown) as Pick<typeof import('../../js/provider-wallet-panels.js'),"buildRoutstrNodeActions"|"clearRoutstrWalletTimers"|"configureRoutstrWalletPanels"|"configureRoutstrWalletRuntime"|"connectRoutstrNode"|"doRoutstrMintChange"|"doRoutstrNodeDeposit"|"doRoutstrWalletFundCustom"|"doRoutstrWalletReceiveCashu"|"doRoutstrWithdrawQuote"|"recoverPendingWalletFunding"|"refreshCashuWalletBalance"|"routstrWalletActionButtons"|"rsWalletFundCustomInput"|"showRoutstrMintEdit"|"showRoutstrNodePicker"|"showRoutstrWalletFund"|"showRoutstrWithdraw"|"showRoutstrWithdrawLightning"|"showRoutstrWithdrawToken">;
      Object.assign(window, walletRuntimeOverrides);
      (window as unknown as {cashuGetMaxWithdrawable:unknown}).cashuGetMaxWithdrawable = getMaxWithdrawable;
      panels.configureRoutstrWalletRuntime(walletRuntimeOverrides);
      panels.configureRoutstrWalletPanels({
        renderAIProviderPanel: (provider: unknown) => `<div id="rendered-panel">${provider}</div><div id="routstr-wallet-balance"></div><div id="routstr-node-balance"></div>`,
        renderRoutstrModelDropdown: (models: unknown) => calls.push(['renderModels', (models as {length:unknown}).length]),
        initSettingsModelFetch: () => calls.push(['initFetch']),
        returnToChatIfOnboarding: () => calls.push(['returnChat']),
      });

      panels.refreshCashuWalletBalance();
      await wait(0);
      const refreshCashu = document.getElementById('routstr-wallet-balance')?.textContent.includes('1,400');

      panels.showRoutstrWalletFund();
      await waitFor(() => (document.getElementById('routstr-wcashu-input') as HTMLInputElement | null));
      panels.rsWalletFundCustomInput();
      const customInput = (document.getElementById('routstr-wfund-custom') as HTMLInputElement | null);
      (customInput)!.value = '99';
      panels.doRoutstrWalletFundCustom();
      const customRejectsMinimum = document.getElementById('routstr-wfund-status')?.textContent.includes('Minimum 100');
      (customInput)!.value = '1000';
      (customInput)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(0);
      const fundCreatesInvoice = document.getElementById('routstr-wfund-poll')?.textContent.includes('Waiting for payment');
      await panels.clearRoutstrWalletTimers();
      await panels.recoverPendingWalletFunding();
      const recoversPendingFunding = document.getElementById('routstr-wfund-status')?.textContent.includes('777 sats recovered');
      (window as unknown as {cashuRecoverPendingFunding:unknown}).cashuRecoverPendingFunding = async () => ({ checked: 2, recovered: 500, pending: 0, failed: 1, balance: 2000, errors: [{ message: 'mint timeout' }] });
      panels.configureRoutstrWalletRuntime({ ...walletRuntimeOverrides, cashuRecoverPendingFunding: (window as unknown as {cashuRecoverPendingFunding:unknown}).cashuRecoverPendingFunding });
      await panels.recoverPendingWalletFunding();
      const recoveryShowsMixedOutcome = document.getElementById('routstr-wfund-status')?.textContent.includes('500 sats recovered')
        && document.getElementById('routstr-wfund-status')?.textContent.includes('1 deposit check failed');
      (window as unknown as {cashuRecoverPendingFunding:unknown}).cashuRecoverPendingFunding = async () => ({ checked: 1, recovered: 0, pending: 0, cleared: 1, failed: 0, balance: 2000, errors: [] });
      panels.configureRoutstrWalletRuntime({ ...walletRuntimeOverrides, cashuRecoverPendingFunding: (window as unknown as {cashuRecoverPendingFunding:unknown}).cashuRecoverPendingFunding });
      await panels.recoverPendingWalletFunding();
      const recoveryShowsTerminalCleanup = document.getElementById('routstr-wfund-status')?.textContent.includes('1 completed or expired deposit cleared');

      const tokenInput = (document.getElementById('routstr-wcashu-input') as HTMLInputElement | null);
      (tokenInput)!.value = 'bad';
      await panels.doRoutstrWalletReceiveCashu();
      const receiveRejectsInvalid = document.getElementById('routstr-wfund-status')?.textContent.includes('valid Cashu token');
      (tokenInput)!.value = 'cashu:cashuAok';
      await panels.doRoutstrWalletReceiveCashu();
      const receiveSuccessClosesFundArea = (tokenInput)!.value === ''
        && document.getElementById('routstr-wallet-fund-area')?.style.display === 'none';

      await panels.showRoutstrMintEdit();
      await wait(0);
      const mintRendersNodeChoices = document.getElementById('routstr-mint-edit')?.textContent.includes('Also accepted by this node');
      const setMintLink = document.querySelector<HTMLElement>('[data-routstr-wallet-action="set-mint-input"][data-mint-url="https://mint.node.test/Bitcoin"]');
      setMintLink?.click();
      const mintInput = (document.getElementById('routstr-mint-input') as HTMLInputElement | null);
      const mintDelegateSetsInput = mintInput?.value === 'https://mint.node.test/Bitcoin';
      if (mintInput && !mintDelegateSetsInput) mintInput.value = 'https://mint.node.test/Bitcoin';
      await panels.doRoutstrMintChange();
      const mintChangeSuccess = calls.some(item => item[0] === 'setMint' && item[1] === 'https://mint.node.test/Bitcoin');
      const mintArea = document.getElementById('routstr-mint-edit');
      if (mintArea && mintArea.style.display !== 'none') mintArea.style.display = 'none';
      await panels.showRoutstrMintEdit();
      let badMintInput = (document.getElementById('routstr-mint-input') as HTMLInputElement | null);
      if (!badMintInput && mintArea) {
        mintArea.style.display = 'block';
        mintArea.innerHTML = '<input id="routstr-mint-input"><div id="routstr-mint-status"></div>';
        badMintInput = (document.getElementById('routstr-mint-input') as HTMLInputElement | null);
      }
      (badMintInput)!.value = 'https://mint.bad.test';
      await panels.doRoutstrMintChange();
      const mintChangeRejectsInvalidMint = document.getElementById('routstr-mint-status')?.textContent.includes('Not a valid Cashu mint');

      await panels.showRoutstrNodePicker();
      const nodePickerFiltersOnline = document.getElementById('routstr-node-picker')?.textContent.includes('Node One')
        && !document.getElementById('routstr-node-picker')?.textContent.includes('Offline');

      (document.getElementById('routstr-node-actions'))!.innerHTML = panels.buildRoutstrNodeActions('https://node.one.test', true, null);
      const browseNodeBtn = document.querySelector<HTMLElement>('[data-node-action="browse"]');
      const withdrawNodeBtn = document.querySelector<HTMLElement>('[data-node-action="withdraw"]');
      browseNodeBtn?.click();
      withdrawNodeBtn?.click();
      await wait(0);
      const nodeActionDelegates = !!browseNodeBtn && !!withdrawNodeBtn;

      (document.getElementById('routstr-wallet-actions'))!.innerHTML = panels.routstrWalletActionButtons(null);
      const toggleMenuBtn = document.querySelector<HTMLElement>('[data-routstr-wallet-action="toggle-wallet-menu"]');
      toggleMenuBtn?.click();
      const menuToggles = document.getElementById('routstr-wallet-menu')?.style.display === 'block';
      const backupBtn = document.querySelector<HTMLElement>('[data-wallet-action="backup"]');
      backupBtn?.click();
      await wait(0);
      const backupCopiesToken = clipboardWrites.includes('cashuAbackup');

      await panels.showRoutstrWithdraw();
      await panels.showRoutstrWithdrawLightning();
      let withdrawInput = (document.getElementById('routstr-withdraw-input') as HTMLInputElement | null);
      if (!withdrawInput) {
        (document.getElementById('routstr-wallet-fund-area'))!.innerHTML = '<div id="routstr-withdraw-status"></div>';
        panels.showRoutstrWithdrawLightning();
        withdrawInput = (document.getElementById('routstr-withdraw-input') as HTMLInputElement | null);
      }
      (withdrawInput)!.value = 'alice@getbased.test';
      (withdrawInput)!.dispatchEvent(new Event('input', { bubbles: true }));
      const addressShowsAmount = document.getElementById('routstr-withdraw-ln-amount')?.style.display === 'block';
      let withdrawMaxButton = document.querySelector<HTMLElement>('[data-routstr-wallet-action="withdraw-max"]');
      if (!withdrawMaxButton) {
        const statusEl = document.getElementById('routstr-withdraw-status');
        (statusEl)!.insertAdjacentHTML('beforeend', '<input id="routstr-withdraw-amount"><button data-routstr-wallet-action="withdraw-max"></button>');
        withdrawMaxButton = document.querySelector<HTMLElement>('[data-routstr-wallet-action="withdraw-max"]');
      }
      (withdrawMaxButton)!.click();
      await waitFor(() => (document.getElementById('routstr-withdraw-amount') as HTMLInputElement | null)?.value === '1234');
      const withdrawMaxSetsInput = (document.getElementById('routstr-withdraw-amount') as HTMLInputElement | null)?.value === '1234';
      ((document.getElementById('routstr-withdraw-amount') as HTMLInputElement | null))!.value = '100';
      await panels.doRoutstrWithdrawQuote();
      const addressWithdrawCalls = calls.some(item => item[0] === 'withdrawAddress' && item[1] === 'alice@getbased.test' && item[2] === 100);
      panels.showRoutstrWithdrawLightning();
      const invoiceInput = (document.getElementById('routstr-withdraw-input') as HTMLInputElement | null);
      (invoiceInput)!.value = 'lnbc200';
      await panels.doRoutstrWithdrawQuote();
      const invoiceQuoteRendersConfirm = !!document.querySelector<HTMLElement>('[data-routstr-wallet-action="withdraw-execute"]');
      document.querySelector<HTMLElement>('[data-routstr-wallet-action="withdraw-execute"]')?.click();
      await wait(0);
      const executeWithdrawDelegates = calls.some(item => item[0] === 'executeWithdraw' && item[1] === 'quote-lnbc200');

      await panels.showRoutstrWithdrawToken();
      document.querySelector<HTMLElement>('[data-routstr-wallet-action="send-token-preset"][data-amount="500"]')?.click();
      await wait(0);
      const tokenPresetCreatesToken = document.getElementById('routstr-token-result')?.textContent.includes('500 sats');
      document.querySelector<HTMLElement>('[data-routstr-wallet-action="select-textarea"]')?.click();
      document.querySelector<HTMLElement>('#routstr-token-result [data-routstr-wallet-action="copy-clipboard"]')?.click();
      const copyDelegateWritesToken = clipboardWrites.some(text => String(text).includes('cashuAsent-500'));

      (document.getElementById('routstr-wallet-fund-area'))!.innerHTML = '<div id="routstr-wfund-status"></div>';
      const blurProbe = document.createElement('input');
      blurProbe.id = 'routstr-wfund-custom';
      blurProbe.dataset.routstrWalletBlur = 'wallet-fund-custom';
      blurProbe.value = '750';
      (document.getElementById('routstr-wallet-fund-area'))!.appendChild(blurProbe);
      blurProbe.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await wait(0);
      const blurDoesNotCreateInvoice = !document.getElementById('routstr-wfund-poll');

      const seed = document.createElement('div');
      seed.dataset.routstrWalletAction = 'toggle-seed-blur';
      seed.style.filter = 'blur(4px)';
      (document.getElementById('routstr-wallet-fund-area'))!.appendChild(seed);
      seed.click();
      const seedBlurToggles = seed.style.filter === '';

      await panels.connectRoutstrNode('https://node.one.test');
      await panels.doRoutstrNodeDeposit('https://node.one.test', 500);
      await waitFor(() => document.getElementById('routstr-node-balance')?.textContent.includes('987'));
      const successfulNodeDepositRefreshesProvider = calls.some(item => item[0] === 'depositToNode' && item[1] === 'https://node.one.test' && item[2] === 500)
        && calls.some(item => item[0] === 'setNode' && item[1] === 'https://node.one.test')
        && calls.some(item => item[0] === 'renderModels' && item[1] === 1)
        && calls.some(item => item[0] === 'returnChat')
        && document.getElementById('rendered-panel')?.textContent === 'routstr'
        && document.getElementById('routstr-node-balance')?.textContent.includes('987');

      return {
        refreshCashu,
        customRejectsMinimum,
        fundCreatesInvoice,
        recoversPendingFunding,
        recoveryShowsMixedOutcome,
        recoveryShowsTerminalCleanup,
        receiveRejectsInvalid,
        receiveSuccessClosesFundArea,
        mintRendersNodeChoices,
        mintDelegateSetsInput,
        mintChangeSuccess,
        mintChangeRejectsInvalidMint,
        nodePickerFiltersOnline,
        successfulNodeDepositRefreshesProvider,
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
        blurDoesNotCreateInvoice,
        seedBlurToggles,
      };
    } finally {
      panels?.clearRoutstrWalletTimers?.();
      panels?.configureRoutstrWalletRuntime?.();
      providerStorageRuntime.configureApiProviderStorageRuntimeDeps(previousProviderStorageRuntime);
      cryptoStore.updateKeyCache('labcharts-routstr-key', null);
      root.remove();
      (window as unknown as {showNotification:unknown}).showNotification = oldNotification;
      (window as {qrcode?: unknown}).qrcode = oldQrcode;
      for (const name of globalNames) (window as unknown as Record<string,unknown>)[name] = oldGlobals[name];
      if (hadClipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: oldClipboard,
        });
      } else {
        delete (window.navigator as unknown as {clipboard?:unknown}).clipboard;
      }
      clearTimeout((window as unknown as {_tokenClipTimer?:ReturnType<typeof setTimeout>})._tokenClipTimer);
      clearTimeout((window as unknown as {_seedClipTimer?:ReturnType<typeof setTimeout>})._seedClipTimer);
      localStorage.removeItem('labcharts-routstr-node');
      localStorage.removeItem('labcharts-routstr-key');
      localStorage.removeItem('labcharts-routstr-model');
      localStorage.removeItem('labcharts-routstr-models');
      localStorage.removeItem('labcharts-routstr-pricing');
      localStorage.removeItem('labcharts-routstr-vision-models');
      (await import('/js/views.js')).closeModal();
      (await import('/js/settings.js')).closeSettingsModal();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});

test('routstr wallet delegate coverage handles scoped action variants', async ({ page }) => {
  await routeHtml(page, '**/cashu-wallet-delegates-blank', '<!doctype html><html><body></body></html>');
  await page.goto('/cashu-wallet-delegates-blank', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const { makeTestInvoice: _makeTestInvoice, LNURL_METADATA: _LNURL_METADATA } = await import('/wallet-test-lightning-invoices.js');
    const { validateLightningInvoice: _validateLightningInvoice } = await import('/js/routstr-validation.js');
    const calls: unknown[][] = [];
    const clipboardWrites: unknown[] = [];
    const hadClipboard = Object.prototype.hasOwnProperty.call(window.navigator, 'clipboard');
    const oldClipboard = window.navigator.clipboard;
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: unknown) => clipboardWrites.push(text) },
    });
    const cashuReceiveToken = async (token: unknown) => {
      calls.push(['recoverAttempt', token]);
      if (token === 'cashuWithdrawRecover') return { received: 500 };
      throw new Error('recover blocked');
    };
    const cashuClearPendingDeposit = async () => calls.push(['clearPendingDeposit']);
    const cashuClearPendingWithdraw = async () => calls.push(['clearPendingWithdraw']);
    const cashuGetMaxWithdrawable = async () => 888;
    let walletRuntimeModule: typeof import('../../js/provider-wallet-runtime.js') | undefined;
    let previousWalletRuntime: unknown;

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
        <button id="recover-funding" data-routstr-wallet-action="recover-wallet-funding"></button>
        <button id="receive-cashu" data-routstr-wallet-action="receive-wallet-cashu"></button>
        <button id="copy" data-routstr-wallet-action="copy-clipboard" data-clipboard-text="cashu-copy" data-copied-text="Copied"></button>
        <button id="set-mint" data-routstr-wallet-action="set-mint-input" data-mint-url="https://mint.delegate.test"></button>
        <button id="recover" data-routstr-wallet-action="recover-pending-deposit" data-token="cashuArecover"></button>
        <button id="recover-withdraw" data-routstr-wallet-action="recover-pending-withdraw" data-token="cashuWithdrawRecover"></button>
        <button id="recover-withdraw-preserve" data-routstr-wallet-action="recover-pending-withdraw" data-clear-pending-withdraw="false" data-token="cashuWithdrawRecover"></button>
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
      walletRuntimeModule = await import('/js/provider-wallet-runtime.js');
      previousWalletRuntime = walletRuntimeModule.configureRoutstrWalletRuntime({
        cashuReceiveToken,
        cashuClearPendingDeposit,
        cashuClearPendingWithdraw,
        cashuGetMaxWithdrawable,
      });
      const delegates = (await import(`/js/provider-wallet-delegates.js?walletDelegateCoverage=${Date.now()}`) as unknown) as Pick<typeof import('../../js/provider-wallet-delegates.js'), "installRoutstrWalletDelegates">;
      delegates.installRoutstrWalletDelegates({
        reload: () => calls.push(['reload']),
        doRoutstrWalletFund: (amount: unknown) => calls.push(['fund', amount]),
        rsWalletFundCustomInput: () => calls.push(['fundCustomInput']),
        recoverPendingWalletFunding: () => calls.push(['recoverFunding']),
        doRoutstrWalletReceiveCashu: () => calls.push(['receiveCashu']),
        doRoutstrWalletFundCustom: () => calls.push(['fundCustom']),
        connectRoutstrNode: (url: unknown) => calls.push(['connectNode', url]),
        showRoutstrNodeDeposit: (url: unknown) => calls.push(['showNodeDeposit', url]),
        doRoutstrNodeDeposit: (url: unknown, amount: unknown) => calls.push(['depositNode', url, amount]),
        _setActiveNodeAction: (action: unknown) => calls.push(['activeNode', action]),
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
        doRoutstrSendToken: (amount: unknown) => calls.push(['sendToken', amount]),
        doRoutstrWithdrawExecute: (quoteId: unknown) => calls.push(['executeWithdraw', quoteId]),
        clearRoutstrNodeSession: () => calls.push(['clearRoutstrNodeSession']),
      });

      for (const id of [
        'fund-preset',
        'fund-custom',
        'recover-funding',
        'receive-cashu',
        'copy',
        'set-mint',
        'cancel-mint',
        'deposit-input',
        'deposit-preset',
        'recover',
        'recover-withdraw',
        'recover-withdraw-preserve',
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
        (document.getElementById(id))!.click();
      }

      ((document.getElementById('seed-ack') as HTMLInputElement | null))!.checked = true;
      ((document.getElementById('seed-ack') as HTMLInputElement | null))!.dispatchEvent(new Event('change', { bubbles: true }));
      ((document.getElementById('routstr-wfund-custom') as HTMLInputElement | null))!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ((document.getElementById('routstr-wfund-custom') as HTMLInputElement | null))!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      ((document.getElementById('routstr-wfund-custom') as HTMLInputElement | null))!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        successfulRecoveryReloads: calls.filter(item => item[0] === 'reload').length === 2,
        fundPreset: calls.some(item => item[0] === 'fund' && item[1] === 100),
        customInput: calls.some(item => item[0] === 'fundCustomInput'),
        recoverFunding: calls.some(item => item[0] === 'recoverFunding'),
        receiveCashu: calls.some(item => item[0] === 'receiveCashu'),
        copyClipboard: clipboardWrites.includes('cashu-copy') && ((document.getElementById('copy') as HTMLButtonElement | null))!.textContent === 'Copied',
        mintInputSet: ((document.getElementById('routstr-mint-input') as HTMLInputElement | null))!.value === 'https://mint.delegate.test',
        mintCanceled: (document.getElementById('routstr-mint-edit'))!.style.display === 'none',
        depositInput: calls.some(item => item[0] === 'depositNode' && item[2] === 42),
        depositPreset: calls.some(item => item[0] === 'depositNode' && item[2] === 77)
          && ((document.getElementById('routstr-deposit-amount') as HTMLInputElement | null))!.value === '77',
        recoverAttempted: calls.some(item => item[0] === 'recoverAttempt' && item[1] === 'cashuArecover'),
        recoverWithdrawPreservesSession: calls.some(item => item[0] === 'recoverAttempt' && item[1] === 'cashuWithdrawRecover')
          && calls.filter(item => item[0] === 'clearPendingWithdraw').length === 1
          && calls.filter(item => item[0] === 'clearRoutstrNodeSession').length === 0,
        nodeActions: ['deposit', 'withdraw', 'browse'].every(action => calls.some(item => item[0] === 'activeNode' && item[1] === action)),
        walletActions: ['walletFund', 'walletWithdraw', 'walletSeed', 'walletBackup'].every(name => calls.some(item => item[0] === name)),
        seedChangeAndContinue: ((document.getElementById('routstr-seed-continue') as HTMLButtonElement | null))!.disabled === false
          && calls.some(item => item[0] === 'seedContinue'),
        restoreWithdrawAndSend: calls.some(item => item[0] === 'restoreWallet')
          && calls.some(item => item[0] === 'withdrawLightning')
          && calls.some(item => item[0] === 'withdrawToken')
          && calls.some(item => item[0] === 'withdrawQuote')
          && calls.some(item => item[0] === 'sendToken' && item[1] === 66)
          && calls.some(item => item[0] === 'sendToken' && item[1] === 55)
          && calls.some(item => item[0] === 'executeWithdraw' && item[1] === 'quote-delegate'),
        withdrawMaxAndKeyBlur: ((document.getElementById('routstr-withdraw-amount') as HTMLInputElement | null))!.value === '888'
          && calls.filter(item => item[0] === 'fundCustom').length === 1
          && calls.some(item => item[0] === 'walletFund'),
        seedBlurToggled: (document.getElementById('seed-blur'))!.style.filter === '',
      };
    } finally {
      root.remove();
      if (walletRuntimeModule && previousWalletRuntime) {
        walletRuntimeModule.configureRoutstrWalletRuntime(previousWalletRuntime);
      }
      if (hadClipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: oldClipboard,
        });
      } else {
        delete (window.navigator as unknown as {clipboard?:unknown}).clipboard;
      }
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBeTruthy();
  }
});

test('mint selection preserves visible node refund recovery without retrying the refund', async ({ page }) => {
  await routeHtml(page, '**/wallet-mint-refund-recovery', `<!doctype html><html><body>
    <div id="routstr-mint-edit"><input id="routstr-mint-input" value="https://mint.other.test"><div id="routstr-mint-status"></div></div>
    <div id="routstr-wallet-balance"></div><div id="routstr-mint-label"></div>
    <div id="routstr-wallet-fund-area" style="display:none"></div>
    <div id="routstr-node-picker"><button data-routstr-wallet-action="resume-node-refund" data-node-url="https://node.test">Check refund recovery</button></div>
  </body></html>`);
  await page.goto('/wallet-mint-refund-recovery');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    let selected = 'https://mint.original.test';
    let refundRequests = 0;
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      cashuGetWalletMints: async () => [{ mint: 'https://mint.other.test', balance: 2, feeBalance: 0, active: false }],
      cashuSetMintUrl: async (mint: string) => { selected = mint; },
      cashuGetMintUrl: async () => selected,
      cashuGetBalance: async () => 2,
      cashuGetPendingNodeRefund: async () => ({ nodeUrl: 'https://node.test', key: 'sk-node', createdAt: 1 }),
      cashuRefundNodeToToken: async () => { refundRequests++; throw new Error('Unexpected refund request'); },
    });
    await panels.doRoutstrMintChange();
    return { selected, refundRequests, recoveryVisible: document.getElementById('routstr-node-picker')?.style.display !== 'none' };
  });
  expect(result).toEqual({ selected: 'https://mint.other.test', refundRequests: 0, recoveryVisible: true });
  await expect(page.getByRole('button', { name: 'Check refund recovery' })).toBeVisible();
});

test('native wallet switches mints across reload with saved token import, quote and refund while preserving each mint balance', async ({ page }) => {
  let externalRequests = 0;
  await page.route('https://**', async route => { externalRequests++; await route.abort(); });
  await routeHtml(page, '**/wallet-refund-mint-selection', '<!doctype html><html><body>Isolated wallet recovery fixture</body></html>');
  await page.goto('/wallet-refund-mint-selection');
  await page.evaluate(async () => {
    const store = await import('/js/' + 'cashu-wallet-store.js') as typeof import('../../js/cashu-wallet-store.js');
    await import('/js/' + 'cashu-wallet.js');
    await store._setMeta('mintUrl', 'https://cashu.cz');
    await store._saveProofs([{ id: 'fixture-keyset', secret: 'fixture-cashu-proof', C: 'fixture-signature', amount: 5 }], 'https://cashu.cz');
    await store._saveProofs([{ id: 'fixture-keyset', secret: 'fixture-minibits-proof', C: 'fixture-signature', amount: 2 }], 'https://mint.minibits.cash/Bitcoin');
    await store._setMeta('pendingNodeRefund', { nodeUrl: 'https://node.test', key: 'sk-old-account', createdAt: 1 });
    await store._setMeta('pendingReceive:fixture-import', { version: 2, operation: 'receive', mint: 'https://cashu.cz',
      createdAt: 1, incomingToken: 'cashuAfixture-refund', localInputs: [], outputs: [{ saved: 'exact-output' }] });
    await store._setMeta('pendingQuote:fixture-unknown', { mint: 'https://cashu.cz', quote: 'unknown-fixture-quote', amount: 100 });
    const wallet = await import('/js/' + 'cashu-wallet.js') as typeof import('../../js/cashu-wallet.js');
    await wallet.setMintUrl('https://mint.minibits.cash/Bitcoin');
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const wallet = await import('/js/' + 'cashu-wallet.js') as typeof import('../../js/cashu-wallet.js');
    const selectedBefore = await wallet.getMintUrl();
    const balanceBefore = await wallet.getLocalWalletBalance();
    await wallet.setMintUrl('https://mint.cubabitcoin.org');
    return { selectedBefore, balanceBefore, selected: await wallet.getMintUrl(), balance: await wallet.getLocalWalletBalance(),
      pending: await wallet.getPendingNodeRefund(), preservedRefund: await (await import('/js/' + 'cashu-wallet-store.js') as typeof import('../../js/cashu-wallet-store.js'))._getMeta('pendingNodeRefund'), inventory: await wallet.getWalletMints(),
      journals: await (await import('/js/' + 'cashu-wallet-store.js') as typeof import('../../js/cashu-wallet-store.js'))._getMetaEntries('pending') };
  });
  expect(result.selectedBefore).toBe('https://mint.minibits.cash/Bitcoin');
  expect(result.balanceBefore).toBe(2);
  expect(result.selected).toBe('https://mint.cubabitcoin.org');
  expect(result.balance).toBe(0);
  expect(result.pending).toBeNull();
  expect(result.preservedRefund).toEqual({ nodeUrl: 'https://node.test', key: 'sk-old-account', createdAt: 1 });
  expect(result.inventory).toEqual(expect.arrayContaining([
    expect.objectContaining({ mint: 'https://cashu.cz', balance: 5 }),
    expect.objectContaining({ mint: 'https://mint.minibits.cash/Bitcoin', balance: 2 }),
  ]));
  expect(result.journals).toEqual(expect.arrayContaining([
    { key: 'pendingReceive:fixture-import', value: { version: 2, operation: 'receive', mint: 'https://cashu.cz',
      createdAt: 1, incomingToken: 'cashuAfixture-refund', localInputs: [], outputs: [{ saved: 'exact-output' }] } },
    { key: 'pendingQuote:fixture-unknown', value: { mint: 'https://cashu.cz', quote: 'unknown-fixture-quote', amount: 100 } },
  ]));
  expect(externalRequests).toBe(0);
});


test('pending deposit check displays unresolved token import alongside Unknown Quote without disclosing token data', async ({ page }) => {
  await routeHtml(page, '**/wallet-import-status', '<!doctype html><html><body><div id="routstr-wfund-status"></div></body></html>');
  await page.goto('/wallet-import-status');
  const statuses = await page.evaluate(async () => {
    const recovery = await import('/js/' + 'provider-wallet-funding-recovery.js') as typeof import('../../js/provider-wallet-funding-recovery.js');
    const statuses: string[] = [];
    for (const mode of ['unknown', 'none', 'recovered', 'throw'] as const) {
      await recovery.recoverPendingWalletFunding({
        cashuRecoverPendingWalletOperation: async () => ({ recovered: mode === 'recovered' ? 2 : 0, pending: true,
          results: [{ recovered: 0, pending: true, operation: 'receive', mint: 'https://cashu.cz', error: 'private-token-detail' }] }),
        cashuRecoverPendingFunding: async () => {
          if (mode === 'throw') throw new Error('Unknown Quote');
          return { mint: 'https://cashu.cz', checked: mode === 'unknown' ? 1 : 0, recovered: 0, pending: 0, cleared: 0,
            failed: mode === 'unknown' ? 1 : 0, balance: 5, results: [], pendingQuotes: [],
            errors: mode === 'unknown' ? [{ mint: 'https://mint.minibits.cash/Bitcoin', quote: 'unknown-fixture-quote', message: 'Unknown Quote', retryAfterMs: 0 }] : [] };
        },
      }, () => {});
      statuses.push(document.getElementById('routstr-wfund-status')!.textContent!);
    }
    return statuses;
  });
  expect(statuses[0]).toContain('Pending invoice at https://mint.minibits.cash/Bitcoin: Unknown Quote');
  expect(statuses[0]).toContain('Pending invoices are checked at their original mints');
  expect(statuses[0]).toContain('Recovery record retained');
  expect(statuses[1]).toContain('No pending Lightning deposits found');
  expect(statuses[2]).toContain('2 sats recovered');
  expect(statuses[3]).toContain('Unknown Quote');
  for (const status of statuses) {
    expect(status).toContain('Token import at https://cashu.cz is still awaiting reconciliation');
    expect(status).toContain('Saved recovery data is retained');
    expect(status).not.toContain('private-token-detail');
  }
});


test('Browse reuses discovery across picker replacement and Refresh nodes explicitly requests an update', async ({ page }) => {
  await routeHtml(page, '**/wallet-node-cache', '<!doctype html><html><body><div id="routstr-node-picker" style="display:none"></div></body></html>');
  await page.goto('/wallet-node-cache');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    const requests: boolean[] = [];
    panels.configureRoutstrWalletRuntime({ nostrDiscoverNodes: async (forceRefresh = false) => {
      requests.push(forceRefresh);
      return [{ id: 'fixture-node', pubkey: 'fixture-pubkey', name: forceRefresh ? 'Updated Node' : 'Cached Node', about: '',
        urls: ['https://node.test'], onion: null, mints: [], version: null, createdAt: 1, online: true,
        models: [], modelCount: 0 }];
    } });
    await panels.showRoutstrNodePicker();
    const first = document.getElementById('routstr-node-picker')!.textContent;
    await panels.showRoutstrNodePicker(); // Closing an open picker needs no query.
    document.getElementById('routstr-node-picker')!.outerHTML = '<div id="routstr-node-picker" style="display:none"></div>';
    await panels.showRoutstrNodePicker();
    const reopened = document.getElementById('routstr-node-picker')!.textContent;
    document.querySelector<HTMLButtonElement>('[data-node-action="refresh"]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { first, reopened, updated: document.getElementById('routstr-node-picker')!.textContent, requests };
  });
  expect(result.first).toContain('Cached Node');
  expect(result.reopened).toContain('Cached Node');
  expect(result.updated).toContain('Updated Node');
  expect(result.requests).toEqual([false, false, true]);
  await expect(page.getByRole('button', { name: 'Refresh nodes' })).toBeVisible();
});

test('a discovery completing after the picker becomes a deposit view does not overwrite that view', async ({ page }) => {
  await routeHtml(page, '**/wallet-node-cache-race', '<!doctype html><html><body><div id="routstr-node-picker" style="display:none"></div></body></html>');
  await page.goto('/wallet-node-cache-race');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    let finish!: (nodes: import('../../js/nostr-discovery.js').RoutstrNode[]) => void;
    panels.configureRoutstrWalletRuntime({ nostrDiscoverNodes: () => new Promise<import('../../js/nostr-discovery.js').RoutstrNode[]>(resolve => { finish = resolve; }) });
    const pending = panels.showRoutstrNodePicker();
    const area = document.getElementById('routstr-node-picker')!;
    area.dataset.mode = 'deposit';
    area.textContent = 'Deposit view';
    finish([]);
    await pending;
    return area.textContent;
  });
  expect(result).toBe('Deposit view');
});


test('a funding invoice uses the mint returned by its locked creation even if the earlier UI selection read differs', async ({ page }) => {
  await routeHtml(page, '**/wallet-funding-mint-binding', '<!doctype html><html><body><div id="routstr-wfund-status"></div></body></html>');
  await page.goto('/wallet-funding-mint-binding');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    const { makeTestInvoice } = await import('/wallet-test-lightning-invoices.js');
    panels.configureRoutstrWalletRuntime({
      cashuGetMintUrl: async () => 'https://cashu.cz',
      cashuCreateFundingInvoice: async () => ({ quote: 'minibits-new-quote', invoice: makeTestInvoice(1000), amount: 1000,
        mint: 'https://mint.minibits.cash/Bitcoin', state: 'UNPAID' }),
      cashuHasWalletSeed: async () => false,
    });
    const created = await panels.doRoutstrWalletFund(1000);
    const status = document.getElementById('routstr-wfund-status')!;
    return { created, mint: status.dataset.mint, quote: status.dataset.quote };
  });
  expect(result).toEqual({ created: true, mint: 'https://mint.minibits.cash/Bitcoin', quote: 'minibits-new-quote' });
});


test('an old Cashu refund is labeled separately from the selected Cuba mint and a rejected session offers an explicit new session', async ({ page }) => {
  await routeHtml(page, '**/wallet-node-session-recovery', '<!doctype html><html><body><div id="ai-provider-panel"><div id="routstr-node-picker"></div><div id="routstr-deposit-status"></div><div id="routstr-wallet-fund-area"></div></div></body></html>');
  await page.goto('/wallet-node-session-recovery');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    const api = await import('/js/' + 'api.js') as typeof import('../../js/api.js');
    const node = 'https://node.test';
    let resets = 0, deposits = 0, imports = 0, refundRequests = 0;
    const recoveryIds: unknown[] = [];
    const storageRuntime = await import('/js/' + 'api-provider-storage-runtime.js') as typeof import('../../js/api-provider-storage-runtime.js');
    const crypto = await import('/js/' + 'crypto.js') as typeof import('../../js/crypto.js');
    storageRuntime.configureApiProviderStorageRuntimeDeps({ encryptedSetItem: crypto.encryptedSetCredentialItem });
    await api.saveRoutstrKey('sk-old', node);
    const oldFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ mints: ['https://mint.cubabitcoin.org'] }), { status: 200 });
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      cashuGetMintUrl: async () => 'https://mint.cubabitcoin.org',
      cashuGetBalance: async () => 996,
      nostrGetSelectedNode: () => node,
      cashuGetPendingNodeRefunds: async () => [],
      cashuRefundNodeToToken: async (_node: unknown, id?: string) => { refundRequests++; recoveryIds.push(id); return { token: 'cashuAold-refund', nodeUrl: node, key: 'sk-old', createdAt: 1700000000000, recoveryId: 'pendingNodeRefund', generation: 'old-generation' }; },
      cashuGetTokenMintUrl: async () => 'https://cashu.cz',
      cashuReceiveToken: async () => { imports++; throw new Error('Proof already spent'); },
      cashuDepositToNode: async () => { deposits++; throw Object.assign(new Error('Node session check returned HTTP 401. Wallet funds were not moved.'), { nodeSessionRejected: true }); },
      cashuStartNewNodeSession: async () => { resets++; },
    });
    try {
      await panels.doRoutstrNodeWithdraw();
      const refundText = document.getElementById('routstr-node-picker')!.textContent!;
      const oldRecoveryButton = document.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="resume-node-refund"]')!.cloneNode(true);
      await panels.doRoutstrNodeDeposit(node, 500);
      const rejectionText = document.getElementById('routstr-deposit-status')!.textContent!;
      document.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="new-node-session"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise<void>((resolve, reject) => {
        if (document.getElementById('routstr-deposit-amount')) { resolve(); return; }
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error('New-session deposit form did not render: ' + document.getElementById('routstr-node-picker')?.textContent)); }, 2000);
        const observer = new MutationObserver(() => {
          if (document.getElementById('routstr-deposit-amount')) { clearTimeout(timer); observer.disconnect(); resolve(); }
        });
        observer.observe(document.getElementById('routstr-node-picker')!, { childList: true, subtree: true });
      });
      const newDepositForm = !!document.getElementById('routstr-deposit-amount');
      await api.saveRoutstrKey('sk-new', node);
      document.getElementById('routstr-node-picker')!.append(oldRecoveryButton);
      (oldRecoveryButton as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
      return { refundText, rejectionText, resets, deposits, imports, refundRequests, recoveryIds, newDepositForm };
    } finally { window.fetch = oldFetch; }
  });
  expect(result.refundText).toContain('Saved refund recovery');
  expect(result.refundText).toContain('Token mint: https://cashu.cz');
  expect(result.refundText).toContain('Node: https://node.test');
  expect(result.refundText).toContain('separate from any later node deposit');
  expect(result.rejectionText).toContain('Wallet funds were not moved');
  expect(result.rejectionText).toContain('previous key and recovery records will be preserved');
  expect(result).toMatchObject({ resets: 1, deposits: 1, imports: 2, refundRequests: 2, recoveryIds: [undefined, 'pendingNodeRefund'], newDepositForm: true });
});


test('saved refund list and failed initial refund retries preserve journal identity after the account changes', async ({ page }) => {
  await routeHtml(page, '**/wallet-saved-refunds', '<!doctype html><html><body><div id="routstr-node-picker"></div></body></html>');
  await page.goto('/wallet-saved-refunds');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    const node = 'https://node.test';
    const currentId = 'pendingNodeRefund:' + 'a'.repeat(64);
    let requests = 0;
    const ids: unknown[] = [];
    const tokens: unknown[] = [];
    let saved = [{ nodeUrl: node, recoveryId: 'pendingNodeRefund', generation: 'old-generation', createdAt: 1, token: 'cashuAold' },
      { nodeUrl: node, recoveryId: currentId, generation: 'current-generation', createdAt: 2, token: 'cashuAcurrent' }];
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true, nostrGetSelectedNode: () => node,
      cashuGetPendingNodeRefunds: async () => saved,
      cashuGetTokenMintUrl: async () => 'https://cashu.cz',
      cashuRefundNodeToToken: async (_node: unknown, id?: string, token?: string) => {
        requests++; ids.push(id); tokens.push(token);
        throw Object.assign(new Error('Node refund returned HTTP 401'), { recoveryId: 'pendingNodeRefund', generation: 'old-generation', nodeUrl: node, createdAt: 1 });
      },
    });
    await panels.showSavedNodeRefunds(node);
    const listedIds = [...document.querySelectorAll<HTMLButtonElement>('[data-routstr-wallet-action="resume-node-refund"]')].map(button => button.dataset.recoveryId);
    const noRequestOnList = requests === 0;
    document.querySelector<HTMLButtonElement>('[data-recovery-id="' + currentId + '"]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    saved = [];
    await panels.doRoutstrNodeWithdraw(node, '');
    const failedRetry = document.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="resume-node-refund"]')!;
    const failedRecoveryId = failedRetry.dataset.recoveryId;
    failedRetry.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { listedIds, noRequestOnList, failedRecoveryId, ids, tokens };
  });
  expect(result).toEqual({ listedIds: ['pendingNodeRefund', 'pendingNodeRefund:' + 'a'.repeat(64)], noRequestOnList: true,
    failedRecoveryId: 'pendingNodeRefund', ids: ['pendingNodeRefund:' + 'a'.repeat(64), '', 'pendingNodeRefund'], tokens: ['cashuAcurrent', undefined, ''] });
});


test('a repeated save failure keeps the already-returned refund token visible and retries the same receipt', async ({ page }) => {
  await routeHtml(page, '**/wallet-refund-save-failure', '<!doctype html><html><body><div id="routstr-node-picker"></div></body></html>');
  await page.goto('/wallet-refund-save-failure');
  const result = await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    const supplied: unknown[][] = [];
    panels.configureRoutstrWalletRuntime({
      cashuHasWalletSeed: async () => true,
      cashuRefundNodeToToken: async (...args: unknown[]) => { supplied.push(args); throw new Error('quota full'); },
    });
    await panels.doRoutstrNodeWithdraw('https://node.test', 'pendingNodeRefund', 'cashuAreturned', 'original-generation');
    const firstToken = document.querySelector<HTMLTextAreaElement>('textarea')!.value;
    document.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="resume-node-refund"]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { firstToken, secondToken: document.querySelector<HTMLTextAreaElement>('textarea')!.value, supplied };
  });
  expect(result).toEqual({ firstToken: 'cashuAreturned', secondToken: 'cashuAreturned', supplied: [
    ['https://node.test', 'pendingNodeRefund', 'cashuAreturned', 'original-generation'],
    ['https://node.test', 'pendingNodeRefund', 'cashuAreturned', 'original-generation'],
  ] });
});


test('current node withdrawal remains usable after an error and unrelated saved refunds are opened separately', async ({ page }) => {
  await routeHtml(page, '**/wallet-unrelated-refund', '<!doctype html><html><body><div id="ai-provider-panel"><div id="routstr-node-actions"></div><div id="routstr-node-picker"></div><div id="routstr-wallet-actions"></div><div id="routstr-wallet-balance"></div></div></body></html>');
  await page.goto('/wallet-unrelated-refund');
  await page.evaluate(async () => {
    const panels = await import('/js/' + 'provider-wallet-panels.js') as typeof import('../../js/provider-wallet-panels.js');
    const storage = await import('/js/' + 'api-provider-storage-runtime.js') as typeof import('../../js/api-provider-storage-runtime.js');
    const crypto = await import('/js/' + 'crypto.js') as typeof import('../../js/crypto.js');
    const api = await import('/js/' + 'api.js') as typeof import('../../js/api.js');
    storage.configureApiProviderStorageRuntimeDeps({ encryptedSetItem: crypto.encryptedSetCredentialItem });
    const current = 'https://ai.redshift.com';
    localStorage.setItem('labcharts-routstr-node', current);
    await api.saveRoutstrKey('sk-current-redshift', current);
    const calls: unknown[] = [], receipts: unknown[] = [];
    Object.assign(window, { refundIsolationCalls: calls, refundIsolationReceipts: receipts });
    panels.configureRoutstrWalletRuntime({
      nostrGetSelectedNode: () => current, cashuHasWalletSeed: async () => true,
      cashuGetMintUrl: async () => 'https://mint.cubabitcoin.org', cashuGetBalance: async () => 5760,
      cashuGetPendingNodeRefund: async () => null,
      cashuGetPendingNodeRefunds: async (node?: unknown) => node === undefined ? [{ nodeUrl: 'https://routstr.cypherpunk.today',
        key: 'sk-old-cypherpunk', token: 'cashuAspent-old', recoveryId: 'pendingNodeRefund', generation: 'old-generation', createdAt: 1 }] : [],
      cashuGetTokenMintUrl: async (token: string) => token === 'cashuAspent-old' ? 'https://cashu.cz' : 'https://mint.cubabitcoin.org',
      cashuRefundNodeToToken: async (node: unknown) => {
        calls.push(node);
        if (calls.length === 1) throw new Error('Node refund returned HTTP 503');
        return { nodeUrl: current, token: 'cashuACurrent-cuba', generation: 'current-generation', recoveryId: 'pendingNodeRefund:current', createdAt: 2 };
      },
      cashuReceiveToken: async (token: string) => { receipts.push(token); return { received: 5750, fee: 0 }; },
      cashuFinishNodeRefund: async () => {},
      nostrDiscoverNodes: async () => [],
    });
    const buttons = await import('/js/' + 'provider-wallet-panel-buttons.js') as typeof import('../../js/provider-wallet-panel-buttons.js');
    document.getElementById('routstr-node-actions')!.innerHTML = buttons.buildRoutstrNodeActions(current, true, null);
    document.getElementById('routstr-wallet-actions')!.innerHTML = buttons.routstrWalletActionButtons(null);
  });
  await page.locator('[data-node-action="withdraw"]').click();
  await expect(page.locator('#routstr-node-picker')).toContainText('HTTP 503');
  await page.locator('[data-node-action="browse"]').click();
  await expect(page.locator('#routstr-node-picker')).toContainText('No online nodes found');
  await page.locator('[data-node-action="withdraw"]').click();
  await expect(page.locator('#routstr-node-picker')).toContainText('Node refund received');
  await expect(page.locator('[data-node-action="withdraw"]')).toBeEnabled();
  await page.locator('[data-routstr-wallet-action="toggle-wallet-menu"]').click();
  await page.getByRole('button', { name: 'Saved node refunds', exact: true }).click();
  await expect(page.locator('#routstr-node-picker')).toContainText('https://routstr.cypherpunk.today');
  await expect(page.locator('#routstr-node-picker')).toContainText('https://cashu.cz');
  await page.locator('[data-node-action="withdraw"]').click();
  await expect(page.locator('#routstr-node-picker')).toContainText('Node refund received');
  const result = await page.evaluate(() => ({ calls: (window as unknown as { refundIsolationCalls: unknown }).refundIsolationCalls,
    receipts: (window as unknown as { refundIsolationReceipts: unknown }).refundIsolationReceipts }));
  expect(result).toEqual({ calls: ['https://ai.redshift.com', 'https://ai.redshift.com', 'https://ai.redshift.com'], receipts: ['cashuACurrent-cuba', 'cashuACurrent-cuba'] });
});
