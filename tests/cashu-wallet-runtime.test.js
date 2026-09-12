import { proof, AmountStub, installCashuStub, loadWallet, readCashuStore, openCashuTestDB, seedExistingUserCashuState, readIdbMeta, readIdbStore, jsonResponse } from './helpers/cashu-wallet.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { makeTestInvoice, LNURL_METADATA } from './fixtures/lightning-invoices.js';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
import { encryptedSetCredentialItem } from '../js/crypto.js';
import { clearKeyCache } from '../js/crypto-key-cache.js';
import existingUserFixture from './fixtures/cashu-wallet-v4.6.1.json';

const realFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  clearKeyCache();
  configureApiProviderStorageRuntimeDeps({ encryptedSetItem: encryptedSetCredentialItem });
  sessionStorage.clear();
  globalThis.fetch = realFetch;
  globalThis.indexedDB = new IDBFactory();
  globalThis.bip39 = {
    generateMnemonic: vi.fn(async () => 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),
    validateMnemonic: vi.fn(async mnemonic => mnemonic.split(/\s+/).length === 12),
    mnemonicToSeed: vi.fn(async () => new Uint8Array(64).buffer),
  };
  window.bip39 = globalThis.bip39;
  installCashuStub();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Cashu wallet runtime behavior', () => {
  it('pauses rejected quotes across reloads and notifications without deleting recoverable deposits', async () => {
    const wallet = await loadWallet();
    const mint = 'https://mint.rejected.test';
    await wallet.setMintUrl(mint);
    await wallet.createFundingInvoice(12);
    const check = vi.spyOn(globalThis.cashuts.Wallet.prototype, 'checkMintQuoteBolt11').mockRejectedValue(Object.assign(new Error('Quote not found'), {status:400}));
    try {
      const first = await wallet.recoverPendingFunding({automatic:true});
      expect(first).toMatchObject({failed:1,pendingQuotes:[]});
      expect(first.results[0].state).toBe('PAUSED');
      const reloaded = await loadWallet();
      for (let i=0;i<5;i++) await reloaded.recoverPendingFunding({automatic:true,notified:[{mint,quote:'mint-12'}]});
      expect(check).toHaveBeenCalledTimes(1);
      expect((await reloaded.recoverPendingFunding({automatic:true})).checked).toBe(1);
      check.mockRestore();
      await expect(reloaded.recoverPendingFunding()).resolves.toMatchObject({recovered:12});
    } finally { check.mockRestore(); }
  });

  it('backs off transient quote errors even when notifications request another check', async () => {
    const wallet = await loadWallet();
    const mint = 'https://mint.transient.test';
    await wallet.setMintUrl(mint); await wallet.createFundingInvoice(12);
    const check = vi.spyOn(globalThis.cashuts.Wallet.prototype, 'checkMintQuoteBolt11').mockRejectedValue(Object.assign(new Error('Unavailable'),{status:503}));
    let now = Date.now();
    const clock = vi.spyOn(Date,'now').mockImplementation(()=>now);
    try {
      await wallet.recoverPendingFunding({automatic:true});
      const reloaded = await loadWallet();
      now += 59999;
      await reloaded.recoverPendingFunding({automatic:true,notified:[{mint,quote:'mint-12'}]});
      expect(check).toHaveBeenCalledTimes(1);
      now += 1; await reloaded.recoverPendingFunding({automatic:true});
      expect(check).toHaveBeenCalledTimes(2);
      now += 119999; await reloaded.recoverPendingFunding({automatic:true,notified:[{mint,quote:'mint-12'}]});
      expect(check).toHaveBeenCalledTimes(2);
      now += 1; await reloaded.recoverPendingFunding({automatic:true});
      expect(check).toHaveBeenCalledTimes(3);
    } finally { check.mockRestore(); clock.mockRestore(); }
  });

  it('does not start queued quote requests after automatic monitoring is disabled', async () => {
    const wallet = await loadWallet();
    await wallet.createFundingInvoice(12);
    const check = vi.spyOn(globalThis.cashuts.Wallet.prototype,'checkMintQuoteBolt11');
    try {
      await wallet.recoverPendingFunding({automatic:true,shouldContinue:()=>false});
      await wallet.checkFundingStatus('mint-12',null,{automatic:true,shouldContinue:()=>false});
      expect(check).not.toHaveBeenCalled();
    } finally { check.mockRestore(); }
  });

  it('shares automatic invoice pacing across reloads and caps checks per mint', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    const mint = 'https://mint.pacing.test';
    await wallet.setMintUrl(mint);
    await wallet.createFundingInvoice(12);
    await wallet.createFundingInvoice(13);
    stub.mintQuoteStates.set('mint-12', 'UNPAID');
    stub.mintQuoteStates.set('mint-13', 'UNPAID');
    const check = vi.spyOn(globalThis.cashuts.Wallet.prototype, 'checkMintQuoteBolt11');
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await wallet.recoverPendingFunding({ automatic: true });
      expect(check).toHaveBeenCalledTimes(1);
      const reloaded = await loadWallet();
      await reloaded.recoverPendingFunding({ automatic: true });
      expect(check).toHaveBeenCalledTimes(1);
      now += 5000;
      await reloaded.recoverPendingFunding({ automatic: true });
      expect(check).toHaveBeenCalledTimes(2);
      now += 5000;
      await reloaded.recoverPendingFunding({ automatic: true });
      expect(check).toHaveBeenCalledTimes(3);
      expect(check.mock.calls.some(([id]) => id === 'mint-13')).toBe(true);
    } finally { check.mockRestore(); clock.mockRestore(); }
  });

  it('persists Retry-After across reloads and applies it to proof verification too', async () => {
    const wallet = await loadWallet();
    const store = await import('../js/cashu-wallet-store.js');
    const mint = 'https://mint.rate-limited.test';
    await wallet.setMintUrl(mint);
    await wallet.createFundingInvoice(12);
    await store._saveProofs([proof('existing-rate-limit-funds', 7)], mint);
    const check = vi.spyOn(globalThis.cashuts.Wallet.prototype, 'checkMintQuoteBolt11').mockRejectedValueOnce(Object.assign(new Error('Slow down'), { status: 429, retryAfterMs: 120000 }));
    const states = vi.spyOn(globalThis.cashuts.Wallet.prototype, 'groupProofsByState');
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const first = await wallet.recoverPendingFunding({ automatic: true });
      expect(first.errors[0]).toMatchObject({ mint, retryAfterMs: 120000 });
      const reloaded = await loadWallet();
      now += 60000;
      await reloaded.recoverPendingFunding({ automatic: true, notified: [{ mint, quote: 'mint-12' }] });
      await store._pruneSpentProofs(true, mint);
      expect(check).toHaveBeenCalledTimes(1);
      expect(states).not.toHaveBeenCalled();
      now += 60001;
      await expect(reloaded.recoverPendingFunding({ automatic: true })).resolves.toMatchObject({ recovered: 12 });
      expect(check).toHaveBeenCalledTimes(2);
      expect(states).not.toHaveBeenCalled();
    } finally { check.mockRestore(); states.mockRestore(); clock.mockRestore(); }
  });

  it('uses a slow safety check with notifications and verifies a paid notification normally', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    const mint = 'https://mint.push.test';
    await wallet.setMintUrl(mint);
    await wallet.createFundingInvoice(12);
    stub.mintQuoteStates.set('mint-12', 'UNPAID');
    const check = vi.spyOn(globalThis.cashuts.Wallet.prototype, 'checkMintQuoteBolt11');
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await wallet.recoverPendingFunding({ automatic: true, subscribedMints: [mint] });
      now += 10000;
      await wallet.recoverPendingFunding({ automatic: true, subscribedMints: [mint] });
      expect(check).toHaveBeenCalledTimes(1);
      await expect(wallet.getLocalWalletBalance()).resolves.toBe(0);
      stub.mintQuoteStates.set('mint-12', 'PAID');
      await expect(wallet.recoverPendingFunding({ automatic: true, subscribedMints: [mint], notified: [{ mint, quote: 'mint-12' }] })).resolves.toMatchObject({ recovered: 12 });
      expect(check).toHaveBeenCalledTimes(2);
      await expect(wallet.recoverPendingFunding({ automatic: true })).resolves.toMatchObject({ checked: 0, recovered: 0 });
    } finally { check.mockRestore(); clock.mockRestore(); }
  });

  it('sets up and cleans up NUT-17 without loading a wallet seed or mint keysets', async () => {
    const wallet = await loadWallet();
    const OriginalWallet = globalThis.cashuts.Wallet;
    const cancel = vi.fn(), disconnect = vi.fn(), load = vi.fn();
    let closed;
    globalThis.cashuts.Wallet = class {
      mint = { getLazyMintInfo: async () => ({ isSupported: () => ({ supported: true, params: [{ method: 'bolt11', unit: 'sat', commands: ['bolt11_mint_quote'] }] }) }), disconnectWebSocket: disconnect, webSocketConnection: { onClose: callback => { closed = callback; } } };
      on = { mintQuoteUpdates: async (ids, update) => { update({ quote: ids[0], state: 'UNPAID' }); return cancel; } };
      loadMint = load;
    };
    try {
      const update = vi.fn(), error = vi.fn();
      const stop = await wallet.subscribeFundingQuotes('https://mint.push.test', ['quote-1'], update, error);
      expect(update).toHaveBeenCalledWith({ quote: 'quote-1', state: 'UNPAID' });
      expect(load).not.toHaveBeenCalled();
      closed(); expect(error).toHaveBeenCalledTimes(1);
      stop(); closed();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
    } finally { globalThis.cashuts.Wallet = OriginalWallet; }
  });

  it('keeps funded mint balances selectable across reload without sending funds', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    const first = 'https://mint.first.test', second = 'https://mint.second.test';
    await wallet.setMintUrl(first);
    stub.receiveProofs = [proof('first-funds', 12)];
    await wallet.receiveToken('cashu:' + first + ':12:first');
    await wallet.setMintUrl(second);
    await expect(wallet.getWalletBalance()).resolves.toBe(0);
    stub.receiveProofs = [proof('second-funds', 7)];
    await wallet.receiveToken('cashu:' + second + ':7:second');
    const reloaded = await loadWallet();
    await expect(reloaded.getWalletMints()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ mint: first, balance: 12, active: false }),
      expect.objectContaining({ mint: second, balance: 7, active: true }),
    ]));
    await reloaded.setMintUrl(first);
    await expect(reloaded.getWalletBalance()).resolves.toBe(12);
    expect(await reloaded.exportWallet()).toContain(first);
    await expect(reloaded.sendAsToken(4)).resolves.toMatchObject({ amount: 4, remaining: 8 });
    await expect(reloaded.getWalletMints()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ mint: second, balance: 7 })]));
  });

  it('credits a paid invoice at its original inactive mint, including a legacy quote', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    const first = 'https://mint.first.test', second = 'https://mint.second.test';
    await wallet.setMintUrl(first);
    const quote = await wallet.createFundingInvoice(12);
    const store = await import('../js/cashu-wallet-store.js');
    for (const entry of await store._getMetaEntries('pendingQuote:')) await store._deleteMeta(entry.key);
    await store._setMeta('pendingQuote:' + quote.quote, 12);
    stub.mintQuoteStates.set(quote.quote, 'UNPAID');
    await wallet.setMintUrl(second);
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ pending: 1, recovered: 0, mint: second });
    stub.mintQuoteStates.set(quote.quote, 'PAID');
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ recovered: 12, balance: 0, mint: second, results: [expect.objectContaining({ mint: first, paid: true })] });
    await expect(wallet.getMintUrl()).resolves.toBe(second);
    await wallet.setMintUrl(first);
    await expect(wallet.getWalletBalance()).resolves.toBe(12);
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 0 });
  });

  it('keeps the wallet safety cap and seed replacement guard across inactive mints', async () => {
    const wallet = await loadWallet();
    const store = await import('../js/cashu-wallet-store.js');
    await wallet.generateWalletSeed();
    await wallet.setMintUrl('https://mint.first.test');
    await store._saveProofs([proof('large-inactive-balance', 25000)], 'https://mint.first.test');
    await wallet.setMintUrl('https://mint.second.test');
    await expect(wallet.createFundingInvoice(1)).rejects.toThrow('safety cap');
    await expect(wallet.restoreWalletFromSeed('ability '.repeat(11) + 'about')).rejects.toThrow('Cannot replace');
    await expect(wallet.getWalletMints()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ mint: 'https://mint.first.test', balance: 25000 })]));
  });

  it('refuses proof collisions across mints without overwriting existing funds', async () => {
    const wallet = await loadWallet();
    const store = await import('../js/cashu-wallet-store.js');
    await store._saveProofs([proof('same-secret', 12)], 'https://mint.first.test');
    await expect(store._replaceProofs([], [proof('same-secret', 2)], 'https://mint.second.test')).rejects.toThrow('another mint');
    await store._saveFeeProofs([proof('same-fee-secret', 3)], 'https://mint.first.test');
    await expect(store._saveFeeProofs([proof('same-fee-secret', 2)], 'https://mint.second.test')).rejects.toThrow('another mint');
    await expect(store._replaceFeeProofs([], [proof('same-fee-secret', 2)], 'https://mint.second.test')).rejects.toThrow('another mint');
    await expect(store._replaceProofs([], [], 'https://mint.second.test', { feeProofs: [proof('same-fee-secret', 2)] })).rejects.toThrow('another mint');
    await expect(wallet.getWalletMints()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ mint: 'https://mint.first.test', balance: 12 })]));
    await expect(store._getAllFeeProofs('https://mint.first.test')).resolves.toEqual([expect.objectContaining({ secret: 'same-fee-secret', amount: 3 })]);
  });

  it('fails closed when the Cashu storage encryption runtime is not configured', async () => {
    const store = await import('../js/cashu-wallet-store.js');
    const previous = store.configureCashuWalletStoreCryptoDeps({
      decryptObject: null,
      encryptedGetItem: null,
      encryptedSetItem: null,
      encryptObject: null,
      getEncryptionEnabled: null,
      isEncryptedObject: null,
    });
    try {
      await expect(store._saveProofs([proof('must-not-write-plaintext', 1)], 'https://mint.getbased.test/Bitcoin'))
        .rejects.toThrow('Cashu wallet storage encryption is not configured.');
      await expect(store._saveMnemonic('must-not-write-plaintext'))
        .rejects.toThrow('Cashu wallet storage encryption is not configured.');
    } finally {
      store.configureCashuWalletStoreCryptoDeps(previous);
    }
  });

  it('encrypts Cashu bearer state at rest and migrates it without changing wallet behavior', async () => {
    const wallet = await loadWallet();
    const store = await import('../js/cashu-wallet-store.js');
    const cryptoModule = await import('../js/crypto.js');
    const mint = 'https://mint.getbased.test/Bitcoin';
    window.__WEARABLES_TEST = true;
    try {
      await wallet.setMintUrl(mint);
      await wallet.generateWalletSeed();
      await store._saveProofs([proof('wallet-bearer-secret', 9)], mint);
      await store._saveFeeProofs([proof('fee-bearer-secret', 2)], mint);
      await store._setMeta('pendingWithdraw', JSON.stringify({ token: 'cashu-sensitive-token', mint }));
      await store._setMeta('pendingQuote:legacy-secret-quote', {
        quote: 'legacy-secret-quote', amount: 12, mint,
      });
      await store._createCounterSource('encrypt-test', false).reserve('keyset-stub', 3);

      expect((await readCashuStore('proofs'))[0].secret).toBe('wallet-bearer-secret');
      expect((await readCashuStore('meta')).some(row => row.key === 'pendingQuote:legacy-secret-quote')).toBe(true);

      localStorage.setItem('labcharts-encryption-enabled', 'true');
      await cryptoModule._setTestSessionKey('CashuEncryptionPass1!');
      // Exercise the crypto-owned migration seam without relying on the
      // wallet module's earlier configuration.
      store.configureCashuWalletStoreCryptoDeps({
        decryptObject: null,
        encryptedGetItem: null,
        encryptedSetItem: null,
        encryptObject: null,
        getEncryptionEnabled: null,
        isEncryptedObject: null,
      });
      await cryptoModule._migrateAllStorageForTest('encrypted');
      await store._saveProofs([proof('new-encrypted-wallet-secret', 1)], mint);

      const encryptedProofs = await readCashuStore('proofs');
      const encryptedFees = await readCashuStore('fee-proofs');
      const encryptedMeta = await readCashuStore('meta');
      expect(encryptedProofs).toHaveLength(2);
      expect(encryptedProofs.every(row => row.secret.startsWith('enc:v1:'))).toBe(true);
      expect(JSON.stringify(encryptedProofs.map(row => row.secret))).not.toContain('wallet-secret');
      expect(encryptedProofs.every(row => cryptoModule.isEncryptedObject(row._payload))).toBe(true);
      expect(encryptedFees[0].secret).toMatch(/^enc:v1:/);
      expect(cryptoModule.isEncryptedObject(encryptedFees[0]._payload)).toBe(true);
      expect(encryptedMeta.find(row => row.key === 'pendingWithdraw')).not.toHaveProperty('value');
      expect(cryptoModule.isEncryptedObject(encryptedMeta.find(row => row.key === 'pendingWithdraw')._payload)).toBe(true);
      expect(encryptedMeta.some(row => row.key.includes('legacy-secret-quote'))).toBe(false);
      expect(encryptedMeta.some(row => row.key.startsWith('pendingQuote:v2:'))).toBe(true);
      expect(encryptedMeta.find(row => row.key.startsWith('counter:'))?.value).toBe(3);

      await expect(wallet.getWalletBalance()).resolves.toBe(10);
      await expect(store._getAllFeeProofs(mint)).resolves.toMatchObject([{ secret: 'fee-bearer-secret', amount: 2 }]);
      await expect(store._getMeta('pendingWithdraw')).resolves.toContain('cashu-sensitive-token');
      await expect(store._getMetaEntries('pendingQuote:')).resolves.toMatchObject([{
        value: { quote: 'legacy-secret-quote', amount: 12, mint },
      }]);

      await cryptoModule._migrateAllStorageForTest('plain');
      expect((await readCashuStore('proofs')).map(row => row.secret).sort()).toEqual([
        'new-encrypted-wallet-secret', 'wallet-bearer-secret',
      ]);
      expect((await readCashuStore('fee-proofs'))[0].secret).toBe('fee-bearer-secret');
      expect((await readCashuStore('meta')).find(row => row.key === 'pendingWithdraw')?.value).toContain('cashu-sensitive-token');
    } finally {
      try { await cryptoModule._migrateAllStorageForTest('plain'); } catch {}
      localStorage.removeItem('labcharts-encryption-enabled');
      try { await cryptoModule._setTestSessionKey(null); } catch {}
      try { await wallet.destroyWalletDB(); } catch {}
      delete window.__WEARABLES_TEST;
    }
  });

  it('stores mint and seed metadata while rejecting unsafe mint URLs', async () => {
    const wallet = await loadWallet();

    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.minibits.cash/Bitcoin');
    await expect(wallet.setMintUrl('http://127.0.0.1:3338')).rejects.toThrow('public https');

    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.getbased.test/Bitcoin');
    expect(localStorage.getItem('labcharts-cashu-wallet-mint')).toBe('https://mint.getbased.test/Bitcoin');

    await expect(wallet.hasWalletSeed()).resolves.toBe(false);
    await expect(wallet.generateWalletSeed()).resolves.toEqual({
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    });
    await expect(wallet.hasWalletSeed()).resolves.toBe(true);
    await expect(wallet.getWalletMnemonic()).resolves.toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    await expect(wallet.generateWalletSeed()).resolves.toEqual({
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    });
    expect(globalThis.bip39.generateMnemonic).toHaveBeenCalledTimes(1);
  });

  it('receives, exports, sends, and restores proofs through the wallet store', async () => {
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');

    await expect(wallet.receiveToken('cashu-token')).resolves.toEqual({ received: 10, fee: 0, balance: 10 });
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
    await expect(wallet.exportWallet()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:10:rx-1');

    await expect(wallet.sendAsToken(4)).resolves.toMatchObject({ amount: 4, remaining: 6 });
    await expect(wallet.clearPendingWithdraw()).rejects.toThrow('still unspent');
    const state = globalThis.cashuts;
    const outgoing = await wallet.recoverPendingWithdraw();
    const stubWallet = await import('../js/cashu-wallet-store.js');
    const inputs = state.getDecodedToken(outgoing).proofs;
    // Simulate delivery: the recipient spends the outgoing token at the mint.
    const sdkWallet = new state.Wallet('https://mint.getbased.test/Bitcoin');
    await sdkWallet.completeSwap({ inputs, sendOutputs: [], keepOutputs: [], unselectedProofs: [] });
    await wallet.clearPendingWithdraw();
    await expect(stubWallet._getMeta('pendingWithdraw')).resolves.toBeNull();
    await expect(wallet.sendAsToken(99)).rejects.toThrow('Insufficient balance: 6 sats, need 99');

    await expect(wallet.restoreWalletFromSeed('too short')).rejects.toThrow('Invalid mnemonic');
    await expect(wallet.restoreWalletFromSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).resolves.toEqual({
      balance: 13,
      restoredCount: 7,
    });
  });

  it('keeps failed node deposits recoverable and clears pending tokens after success', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');

    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({
      detail: [{ msg: 'token rejected' }, { msg: 'mint unavailable' }],
    }, { status: 400 }));

    await expect(wallet.depositToNode('https://node.getbased.test/', 5)).rejects.toThrow('outcome is unconfirmed');
    await expect(wallet.recoverPendingDeposit()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:5:send-5');

    await expect(wallet.clearPendingDeposit()).rejects.toThrow('Recover or reconcile');
    const pending = await wallet.recoverPendingDeposit();
    stub.receiveProofs = [proof('reclaimed-deposit', 5)];
    await wallet.receiveToken(pending);
    await expect(wallet.recoverPendingDeposit()).resolves.toBeNull();

    stub.receiveProofs = [proof('rx-2', 9)];
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await expect(wallet.receiveToken('another-token')).resolves.toEqual({ received: 9, fee: 0, balance: 19 });
    fetch.mockResolvedValueOnce(jsonResponse({ api_key: 'sk-new', balance: 4000 }));

    await expect(wallet.depositToNode('https://node.getbased.test///', 4)).resolves.toEqual({ api_key: 'sk-new', balance: 4000 });
    expect(fetch.mock.calls.at(-1)[0]).toBe('https://node.getbased.test/v1/balance/create');
    expect(fetch.mock.calls.at(-1)[1].method).toBe('POST');
    await expect(wallet.recoverPendingDeposit()).resolves.toBeNull();
    await expect(wallet.getWalletBalance()).resolves.toBe(15);
  });

  it('recovers paid wallet funding quotes after reload and keeps unpaid quotes pending', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');

    const paidFunding = await wallet.createFundingInvoice(12);
    const reloadedWallet = await loadWallet();
    await expect(reloadedWallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 12,
      pending: 0,
      failed: 0,
      balance: 12,
    });
    await expect(reloadedWallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 0, recovered: 0 });
    await expect(reloadedWallet.getWalletBalance()).resolves.toBe(12);

    stub.mintQuoteStates.set('mint-9', 'UNPAID');
    const unpaidFunding = await reloadedWallet.createFundingInvoice(9);
    expect(unpaidFunding.quote).toBe('mint-9');
    await expect(reloadedWallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 0,
      pending: 1,
      failed: 0,
    });

    stub.mintQuoteStates.set('mint-9', 'PAID');
    await expect(reloadedWallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 9,
      pending: 0,
      failed: 0,
      balance: 21,
    });
    stub.mintQuoteStates.set('mint-3', 'EXPIRED');
    await reloadedWallet.createFundingInvoice(3);
    await expect(reloadedWallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 0,
      pending: 0,
      cleared: 1,
      failed: 0,
    });
    await expect(reloadedWallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 0 });
    expect(paidFunding.quote).toBe('mint-12');
  });

  it.each(['EXPIRED', 'CANCELLED', 'CANCELED', 'cancelled'])('removes a %s funding quote durably without crediting funds', async state => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    const funding = await wallet.createFundingInvoice(7);
    stub.mintQuoteStates.set(funding.quote, state);

    const reloaded = await loadWallet();
    await expect(reloaded.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1, pending: 0, cleared: 1, recovered: 0, failed: 0, balance: 0,
      results: [{ quote: funding.quote, paid: false, state }],
    });
    const afterCleanup = await loadWallet();
    await expect(afterCleanup.recoverPendingFunding()).resolves.toMatchObject({ checked: 0, recovered: 0, balance: 0 });
  });

  it('retains unrecognized funding states for later reconciliation', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    const funding = await wallet.createFundingInvoice(7);
    stub.mintQuoteStates.set(funding.quote, 'UNKNOWN');
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 1, pending: 1, cleared: 0 });
    const reloaded = await loadWallet();
    await expect(reloaded.recoverPendingFunding()).resolves.toMatchObject({ checked: 1, pending: 1, cleared: 0 });
  });

  it('recovers already-issued funding outputs from the exact prepared quote after a lost response', async () => {
    const stub = installCashuStub();
    stub.failMintOutputsAlreadySigned = true;
    stub.restoreProofs = [proof('issued-after-lost-response', 200)];
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.generateWalletSeed();

    const funding = await wallet.createFundingInvoice(200);
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 200,
      pending: 0,
      failed: 0,
      balance: 200,
    });
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 0, recovered: 0 });
    await expect(wallet.getWalletBalance()).resolves.toBe(200);
    expect(funding.quote).toBe('mint-200');
  });

  it('keeps already-issued pending funding when quote-specific proof recovery cannot be established', async () => {
    const stub = installCashuStub();
    stub.receiveProofs = [proof('already-present-issued-proof', 200)];
    stub.restoreProofs = [];
    stub.failMintOutputsAlreadySigned = true;
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.generateWalletSeed();
    await wallet.receiveToken('cashu-token');

    const funding = await wallet.createFundingInvoice(200);
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 0,
      pending: 0,
      failed: 1,
      balance: 200,
    });
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 1, recovered: 0, failed: 1 });
    await expect(wallet.getWalletBalance()).resolves.toBe(200);
    expect(funding.quote).toBe('mint-200');
  });

  it('auto-reduces lightning-address withdrawals and exposes failed melt recovery', async () => {
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    const stub = installCashuStub();
    stub.receiveProofs = [proof('rx-100', 100)];
    await wallet.receiveToken('cashu-token');

    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/.well-known/lnurlp/alice')) {
        return jsonResponse({ tag: 'payRequest', metadata: LNURL_METADATA, callback: 'https://lnurl.getbased.test/cb', minSendable: 1000, maxSendable: 200000 });
      }
      if (String(url).startsWith('https://lnurl.getbased.test/cb')) {
        const amountMsats = Number(new URL(String(url)).searchParams.get('amount'));
        return jsonResponse({ pr: makeTestInvoice(amountMsats / 1000) });
      }
      return new Response('', { status: 404 });
    });

    await expect(wallet.getMaxWithdrawable()).resolves.toBe(96);
    await expect(wallet.withdrawToAddress('alice@getbased.test', 98)).resolves.toMatchObject({
      paid: true,
      amount: 93,
      balance: 3,
    });

    await wallet.receiveToken('cashu-token');
    stub.failMelt = true;
    const quote = await wallet.createWithdrawQuote(makeTestInvoice(10));

    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('melt failed');
    await expect(wallet.recoverPendingWithdraw()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:15:send-15');
    await expect(wallet.savePendingWithdrawToken('cashu:node-refund-token', 'routstr-node-refund')).resolves.toBe(false);
    await expect(wallet.recoverPendingWithdraw()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:15:send-15');
    await expect(wallet.recoverPendingWithdraw()).resolves.not.toContain('cashu:node-refund-token');
    await expect(wallet.clearPendingWithdraw()).rejects.toThrow('still unspent');
    stub.receiveProofs = [proof('reclaimed-withdraw', 15)];
    await wallet.receiveToken(await wallet.recoverPendingWithdraw());

    await expect(wallet.savePendingWithdrawToken('cashu:first-node-refund', 'routstr-node-refund')).resolves.toBe(true);
    await expect(wallet.savePendingWithdrawToken('cashu:second-node-refund', 'routstr-node-refund')).resolves.toBe(false);
    await expect(wallet.recoverPendingWithdraw()).resolves.toBe('cashu:first-node-refund');
    await wallet.receiveToken(await wallet.recoverPendingWithdraw());
    await expect(wallet.recoverPendingWithdraw()).resolves.toBeNull();
  });

  it('keeps Cashu v4 Amount objects at the library boundary and stores JSON-safe proof rows', async () => {
    const stub = installCashuStub({ amountObjects: true });
    stub.receiveProofs = [proof('amount-rx', new AmountStub(11))];
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');

    await expect(wallet.receiveToken('cashu-token')).resolves.toEqual({ received: 11, fee: 0, balance: 11 });
    await expect(wallet.getWalletBalance()).resolves.toBe(11);
    await expect(wallet.sendAsToken(4)).resolves.toMatchObject({ amount: 4, remaining: 7 });

    const rows = await readIdbStore('proofs');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row._mint).toBe('https://mint.getbased.test/Bitcoin');
      expect(typeof row.amount === 'number' || typeof row.amount === 'string').toBe(true);
      expect(row.amount && typeof row.amount.toNumber).toBe('undefined');
    }
  });

  it('switches to the token mint before receiving a node refund token', async () => {
    const stub = installCashuStub();
    stub.receiveProofs = [proof('node-refund', 500)];
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.original.test/Bitcoin');

    await expect(wallet.receiveToken('cashu:https://mint.node.test/Bitcoin:500:node-refund')).resolves.toMatchObject({
      received: 500,
      fee: 0,
      balance: 500,
    });
    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.node.test/Bitcoin');
    expect(stub.instances.at(-1).url).toBe('https://mint.node.test/Bitcoin');

    await wallet.receiveToken('cashu:https://mint.node.test/Bitcoin:500:node-refund');
    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.node.test/Bitcoin');
    await expect(wallet.recoverPendingWithdraw()).resolves.toBeNull();
  });

  it('tops up an existing Routstr node key without creating a replacement session', async () => {
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');

    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: 100000 }));

    const { saveRoutstrSessionKey } = await import('../js/routstr-session.js');
    await saveRoutstrSessionKey('sk-existing', 'https://node.getbased.test/');
    await expect(wallet.depositToNode('https://node.getbased.test/', 5, 'sk-existing')).resolves.toEqual({ balance: 100000, api_key: 'sk-existing' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://node.getbased.test/v1/balance/topup');
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer sk-existing', 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).cashu_token).toContain('cashu:https://mint.getbased.test/Bitcoin:5:send-5');
    await expect(wallet.recoverPendingDeposit()).resolves.toBeNull();
    await expect(wallet.getWalletBalance()).resolves.toBe(5);
  });

  it('keeps existing user wallet DB, pending recovery state, counters, and Routstr session compatible after reload', async () => {
    await seedExistingUserCashuState(existingUserFixture);
    localStorage.setItem('labcharts-cashu-wallet-mint', 'https://mint.existing.test/Bitcoin');
    localStorage.setItem('labcharts-routstr-node', 'https://node.existing.test/');
    localStorage.setItem('labcharts-routstr-key', 'sk-existing-user-session');

    const stub = installCashuStub();
    stub.mintQuoteStates.set('legacy-paid-quote', 'UNPAID');
    const wallet = await loadWallet();

    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.existing.test/Bitcoin');
    await expect(wallet.getWalletBalance()).resolves.toBe(50);
    await expect(wallet.getFeeBalance()).resolves.toBe(2);
    await expect(wallet.getWalletMnemonic()).resolves.toBe(existingUserFixture.mnemonic);
    expect(await readIdbStore('proofs')).toEqual(expect.arrayContaining(
      existingUserFixture.proofs.map(p => expect.objectContaining({ ...p, _mint: existingUserFixture.mintUrl }))
    ));
    await expect(wallet.recoverPendingDeposit()).resolves.toBe(existingUserFixture.pendingDeposit);
    await expect(wallet.recoverPendingWithdraw()).resolves.toBe(existingUserFixture.pendingWithdraw.token);
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 1, recovered: 0, pending: 1, failed: 0 });
    expect(localStorage.getItem('labcharts-routstr-key')).toBe('sk-existing-user-session');
    expect(localStorage.getItem('labcharts-routstr-node')).toBe('https://node.existing.test/');

    const seededWalletInstance = stub.instances.at(-1);
    await expect(seededWalletInstance.opts.counterSource.reserve('keyset-alpha', 3)).resolves.toEqual({ start: 12, count: 3 });
    await expect(readIdbMeta('counter:keyset-alpha')).resolves.toBe(12);
    const metaRows = await readIdbStore('meta');
    expect(metaRows.find(row => row.key.startsWith('counter:') && row.key.endsWith(':keyset-alpha'))?.value).toBe(15);

    await expect(wallet.clearPendingDeposit()).rejects.toThrow('Recover or reconcile');
    await expect(wallet.clearPendingWithdraw()).rejects.toThrow('still unspent');
    await expect(wallet.recoverPendingDeposit()).resolves.toBe(existingUserFixture.pendingDeposit);
  });

  it('migrates oldest untagged default-mint proof rows without dropping balance', async () => {
    const db = await openCashuTestDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['proofs', 'meta'], 'readwrite');
        const proofStore = tx.objectStore('proofs');
        const metaStore = tx.objectStore('meta');
        proofStore.put(proof('old-default-proof-a', 4));
        proofStore.put(proof('old-default-proof-b', 3));
        metaStore.put({ key: 'mintUrl', value: 'https://mint.minibits.cash/Bitcoin' });
        metaStore.put({ key: 'walletMnemonic', value: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }

    const wallet = await loadWallet();

    await expect(wallet.getWalletBalance()).resolves.toBe(7);
    await expect(wallet.getWalletMnemonic()).resolves.toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    const rows = await readIdbStore('proofs');
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ secret: 'old-default-proof-a', _mint: 'https://mint.minibits.cash/Bitcoin' }),
      expect.objectContaining({ secret: 'old-default-proof-b', _mint: 'https://mint.minibits.cash/Bitcoin' }),
    ]));
    await expect(readIdbMeta('walletMnemonic')).resolves.toBeNull();
    expect(localStorage.getItem('labcharts-cashu-wallet-mnemonic')).toBeTruthy();
  });

  it('handles empty fee pools without mutating the wallet', async () => {
    const wallet = await loadWallet();

    expect(wallet.getFeePct()).toBe(0);
    await expect(wallet.getFeeBalance()).resolves.toBe(0);
    await expect(wallet.retryFeeAutoMelt()).resolves.toEqual({ melted: 0, remaining: 0 });
    await expect(wallet.redeemFees(makeTestInvoice(1))).rejects.toThrow('No fee proofs to redeem');
  });

  it('keeps existing proofs and the original seed when restore cannot be proven', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.generateWalletSeed();
    await wallet.receiveToken('cashu-token');
    const rowsBefore = await readIdbStore('proofs');
    stub.failRestore = true;

    await expect(wallet.restoreWalletFromSeed(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    )).rejects.toThrow('without changing local funds');
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
    expect(await readIdbStore('proofs')).toEqual(rowsBefore);
    await expect(wallet.getWalletMnemonic()).resolves.toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    );

    await expect(wallet.restoreWalletFromSeed(
      'legal winner thank year wave sausage worth useful legal winner thank yellow'
    )).rejects.toThrow('Cannot replace the wallet seed');
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
  });

  it('preserves the selected mint after failed receive and keeps balances at both mints', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.original.test/Bitcoin');
    stub.failReceive = true;

    await expect(wallet.receiveToken(
      'cashu:https://mint.other.test/Bitcoin:5:failed-token'
    )).rejects.toThrow('receive failed');
    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.original.test/Bitcoin');

    stub.failReceive = false;
    await expect(wallet.receiveToken('cashu:https://mint.original.test/Bitcoin:5:local-token')).rejects.toThrow('original mint');
    await expect(wallet.createFundingInvoice(5)).rejects.toThrow('original mint');
    await wallet.receiveToken('cashu:https://mint.other.test/Bitcoin:5:failed-token');
    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.other.test/Bitcoin');
    stub.receiveProofs = [proof('foreign-receive', 5)];
    await wallet.receiveToken('cashu:https://mint.original.test/Bitcoin:5:foreign-token');
    await expect(wallet.getWalletBalance()).resolves.toBe(5);
    await wallet.setMintUrl('https://mint.other.test/Bitcoin');
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
  });

  it('serializes deterministic counter reservations across reloaded modules', async () => {
    const stub = installCashuStub();
    const walletA = await loadWallet();
    await walletA.setMintUrl('https://mint.getbased.test/Bitcoin');
    await walletA.generateWalletSeed();
    await walletA.createWithdrawQuote(makeTestInvoice(1));
    const sourceA = stub.instances.at(-1).opts.counterSource;

    const walletB = await loadWallet();
    await walletB.createWithdrawQuote(makeTestInvoice(1));
    const sourceB = stub.instances.at(-1).opts.counterSource;
    const ranges = await Promise.all([
      sourceA.reserve('keyset-concurrent', 3),
      sourceB.reserve('keyset-concurrent', 4),
    ]);
    const counters = ranges.flatMap(range => Array.from({ length: range.count }, (_, i) => range.start + i));
    expect(new Set(counters).size).toBe(7);
    expect(counters.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await expect(sourceA.reserve('keyset-concurrent', 0)).resolves.toEqual({ start: 7, count: 0 });
  });

  it('retains ISSUED funding records until quote-specific proofs are recovered', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    const funding = await wallet.createFundingInvoice(21);
    stub.mintQuoteStates.set(funding.quote, 'ISSUED');

    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({
      checked: 1,
      recovered: 0,
      pending: 1,
      cleared: 0,
      failed: 0,
    });
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 1, pending: 1 });
  });

  it('completes a paid invoice stored under the previous mint-namespaced quote key', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    const store = await import('../js/cashu-wallet-store.js');
    const mint = 'https://mint.getbased.test/Bitcoin';
    const quoteId = 'pre-upgrade-quote';
    await wallet.setMintUrl(mint);
    await store._setMeta(store._legacyNamespacedPendingQuoteKey(mint, quoteId), {
      quote: quoteId,
      amount: 27,
      mint,
      createdAt: Date.now() - 1000,
    });
    stub.mintQuoteStates.set(quoteId, 'PAID');

    await expect(wallet.checkFundingStatus(quoteId)).resolves.toMatchObject({
      paid: true,
      minted: 27,
      balance: 27,
    });
    await expect(store._getMeta(store._legacyNamespacedPendingQuoteKey(mint, quoteId))).resolves.toBeNull();
  });

  it('aborts proof replacement atomically and keeps a full recovery token on storage failure', async () => {
    const stub = installCashuStub();
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');
    const rowsBefore = await readIdbStore('proofs');
    stub.failProofPersistence = true;

    await expect(wallet.sendAsToken(4)).rejects.toThrow();
    expect(await readIdbStore('proofs')).toEqual(rowsBefore);
    await expect(wallet.recoverPendingWithdraw()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:10:');
    stub.failProofPersistence = false;
    await expect(wallet.recoverPendingWalletOperation()).resolves.toMatchObject({ recovered: 10, pending: false });
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
  });

  it('restores prepared swap outputs after a crash boundary before local persistence', async () => {
    const stub = installCashuStub({ durableOps: true });
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');
    stub.failEncodeOnce = true;

    await expect(wallet.sendAsToken(4)).rejects.toThrow('codec failed after swap');
    await expect(readIdbMeta('pendingSwap')).resolves.toMatchObject({
      version: 2,
      operation: 'send',
      mint: 'https://mint.getbased.test/Bitcoin',
    });

    const reloaded = await loadWallet();
    await expect(reloaded.getWalletBalance()).resolves.toBe(10);
    await expect(readIdbMeta('pendingSwap')).resolves.toBeNull();
    expect((await readIdbStore('proofs')).map(row => row.amount).sort((a, b) => a - b)).toEqual([4, 6]);
  });

  it('automatically recovers an ISSUED invoice from its exact mint journal', async () => {
    const stub = installCashuStub({ durableOps: true });
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.generateWalletSeed();
    const funding = await wallet.createFundingInvoice(23);
    stub.failMintPersistenceOnce = true;
    await expect(wallet.checkFundingStatus(funding.quote)).rejects.toThrow();
    stub.mintQuoteStates.set(funding.quote, 'ISSUED');
    await expect(wallet.checkFundingStatus(funding.quote)).resolves.toMatchObject({ paid: true, minted: 23, balance: 23 });
    await expect(readIdbMeta('pendingSwap')).resolves.toBeNull();
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 0, recovered: 0 });
  });

  it('restores quote-specific prepared mint outputs after proof persistence fails', async () => {
    const stub = installCashuStub({ durableOps: true });
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.generateWalletSeed();
    const funding = await wallet.createFundingInvoice(23);
    stub.failMintPersistenceOnce = true;

    await expect(wallet.checkFundingStatus(funding.quote)).rejects.toThrow();
    await expect(readIdbMeta('pendingSwap')).resolves.toMatchObject({
      operation: 'mint',
      quoteId: funding.quote,
    });

    const reloaded = await loadWallet();
    await expect(reloaded.getWalletBalance()).resolves.toBe(23);
    await expect(readIdbMeta('pendingSwap')).resolves.toBeNull();
    await expect(reloaded.recoverPendingFunding()).resolves.toMatchObject({ checked: 0 });
  });

  it('reconciles paid melt change from the durable pending withdrawal record', async () => {
    const stub = installCashuStub({ durableOps: true });
    stub.receiveProofs = [proof('melt-source', 100)];
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');
    const quote = await wallet.createWithdrawQuote(makeTestInvoice(10));
    stub.failMelt = true;

    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('melt failed');
    const pendingRaw = await readIdbMeta('pendingWithdraw');
    expect(JSON.parse(pendingRaw)).toMatchObject({ quoteId: quote.quote, localCommit: true });
    expect(JSON.parse(pendingRaw).meltOutputs).toHaveLength(1);

    stub.failMelt = false;
    stub.meltQuotes.set(quote.quote, {
      ...stub.meltQuotes.get(quote.quote),
      state: 'PAID',
      change: [{ id: 'keyset-stub', amount: 1 }],
    });
    await expect(wallet.recoverPendingWithdraw()).resolves.toBeNull();
    await expect(wallet.getWalletBalance()).resolves.toBe(86);
    await expect(readIdbMeta('pendingWithdraw')).resolves.toBeNull();
  });
});
