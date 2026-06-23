import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

let importId = 0;
const realFetch = globalThis.fetch;

function proof(secret, amount) {
  return { secret, amount, C: `C-${secret}` };
}

class AmountStub {
  constructor(value) { this.value = Number(value) || 0; }
  toNumber() { return this.value; }
  toString() { return String(this.value); }
  toJSON() { return String(this.value); }
  add(other) { return new AmountStub(this.value + amountNumber(other)); }
}

function amountNumber(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
}

function installCashuStub(options = {}) {
  const state = {
    receiveProofs: [proof('rx-1', 10)],
    meltQuotes: new Map(),
    mintQuoteStates: new Map(),
    failMelt: false,
    failMintOutputsAlreadySigned: false,
    restoreProofs: [proof('restored-1', 7), { ...proof('restored-spent', 3), spent: true }],
    instances: [],
  };

  class Wallet {
    constructor(url, opts = {}) {
      this.url = url;
      this.opts = opts;
      state.instances.push(this);
    }

    async loadMint() {}

    async groupProofsByState(proofs) {
      return {
        unspent: proofs.filter(p => !p.spent && !p.pending),
        spent: proofs.filter(p => p.spent),
        pending: proofs.filter(p => p.pending),
      };
    }

    async receive() {
      return state.receiveProofs.map(p => ({ ...p }));
    }

    async send(amount, proofs) {
      const amountSats = amountNumber(amount);
      const total = amountNumber(sumProofs(proofs));
      return {
        send: [proof(`send-${amountSats}-${state.instances.length}`, options.amountObjects ? new AmountStub(amountSats) : amountSats)],
        keep: total > amountSats ? [proof(`keep-${total - amountSats}-${state.instances.length}`, options.amountObjects ? new AmountStub(total - amountSats) : total - amountSats)] : [],
      };
    }

    async createMintQuoteBolt11(amount) {
      const amountSats = amountNumber(typeof amount === 'object' && amount ? amount.amount : amount);
      return { quote: `mint-${amountSats}`, request: `invoice-${amountSats}`, amount: options.amountObjects ? new AmountStub(amountSats) : amountSats, state: 'UNPAID' };
    }

    async checkMintQuoteBolt11(quoteId) {
      const quoteState = state.mintQuoteStates.get(quoteId) || 'PAID';
      return { state: quoteState, amount: Number(String(quoteId).replace(/\D/g, '')) || 0 };
    }

    async mintProofsBolt11(amount, quoteId) {
      if (state.failMintOutputsAlreadySigned) throw new Error('outputs already signed');
      return [proof(`minted-${quoteId}`, amount)];
    }

    async createMeltQuoteBolt11(invoice) {
      const amount = Number(String(invoice).split(':').pop()) || 10;
      const quote = {
        quote: `quote-${amount}`,
        amount: options.amountObjects ? new AmountStub(amount) : amount,
        fee_reserve: options.amountObjects ? new AmountStub(5) : 5,
        state: 'UNPAID'
      };
      state.meltQuotes.set(quote.quote, quote);
      return quote;
    }

    async checkMeltQuoteBolt11(quoteId) {
      return state.meltQuotes.get(quoteId) || { quote: quoteId, amount: 10, fee_reserve: 2 };
    }

    async meltProofsBolt11() {
      if (state.failMelt) throw new Error('melt failed');
      return { change: [proof(`melt-change-${state.instances.length}`, 1)] };
    }

    async batchRestore(batchSize, gap, start) {
      if (start > 0) return { proofs: [] };
      return { proofs: state.restoreProofs.map(p => ({ ...p })) };
    }
  }

  function sumProofs(proofs = []) {
    const total = proofs.reduce((sum, p) => sum + amountNumber(p.amount), 0);
    return options.amountObjects ? new AmountStub(total) : total;
  }

  globalThis.cashuts = {
    Wallet,
    MintQuoteState: { PAID: 'PAID', ISSUED: 'ISSUED', EXPIRED: 'EXPIRED' },
    sumProofs,
    getEncodedToken: ({ mint, proofs }) => `cashu:${mint}:${sumProofs(proofs)}:${proofs.map(p => p.secret).join(',')}`,
    getDecodedToken: (token) => {
      const parts = String(token).split(':');
      return parts[0] === 'cashu' && parts[1] && parts[2]
        ? { token: [{ mint: `${parts[1]}:${parts[2]}` }] }
        : {};
    },
  };
  window.cashuts = globalThis.cashuts;
  return state;
}

async function loadWallet() {
  return import(/* @vite-ignore */ `../js/cashu-wallet.js?runtime=${importId++}`);
}

beforeEach(() => {
  localStorage.clear();
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
  });

  it('receives, exports, sends, and restores proofs through the wallet store', async () => {
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');

    await expect(wallet.receiveToken('cashu-token')).resolves.toEqual({ received: 10, fee: 0, balance: 10 });
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
    await expect(wallet.exportWallet()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:10:rx-1');

    await expect(wallet.sendAsToken(4)).resolves.toMatchObject({ amount: 4, remaining: 6 });
    await expect(wallet.sendAsToken(99)).rejects.toThrow('Insufficient balance: 6 sats, need 99');

    await expect(wallet.restoreWalletFromSeed('too short')).rejects.toThrow('Invalid mnemonic');
    await expect(wallet.restoreWalletFromSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).resolves.toEqual({
      balance: 7,
      restoredCount: 7,
    });
  });

  it('keeps failed node deposits recoverable and clears pending tokens after success', async () => {
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');

    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({
      detail: [{ msg: 'token rejected' }, { msg: 'mint unavailable' }],
    }, { status: 400 }));

    await expect(wallet.depositToNode('https://node.getbased.test/', 5, 'sk-existing')).rejects.toThrow('token rejected; mint unavailable');
    await expect(wallet.recoverPendingDeposit()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:5:send-5');

    await wallet.clearPendingDeposit();
    await expect(wallet.recoverPendingDeposit()).resolves.toBeNull();

    const stub = installCashuStub();
    stub.receiveProofs = [proof('rx-2', 9)];
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await expect(wallet.receiveToken('another-token')).resolves.toEqual({ received: 9, fee: 0, balance: 14 });
    fetch.mockResolvedValueOnce(jsonResponse({ api_key: 'sk-new', balance: 4000 }));

    await expect(wallet.depositToNode('https://node.getbased.test///', 4)).resolves.toEqual({ api_key: 'sk-new', balance: 4000 });
    expect(fetch.mock.calls.at(-1)[0]).toMatch(/^https:\/\/node\.getbased\.test\/v1\/balance\/create\?initial_balance_token=/);
    await expect(wallet.recoverPendingDeposit()).resolves.toBeNull();
    await expect(wallet.getWalletBalance()).resolves.toBe(10);
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

  it('recovers already-issued funding outputs from seed restore when retrying a paid quote reports outputs already signed', async () => {
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

  it('clears already-issued pending funding when restored proofs are already present locally', async () => {
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
      failed: 0,
      balance: 200,
    });
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 0, recovered: 0 });
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
        return jsonResponse({ callback: 'https://lnurl.getbased.test/cb', minSendable: 1000, maxSendable: 200000 });
      }
      if (String(url).startsWith('https://lnurl.getbased.test/cb')) {
        const amountMsats = Number(new URL(String(url)).searchParams.get('amount'));
        return jsonResponse({ pr: `invoice:${amountMsats / 1000}` });
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
    const quote = await wallet.createWithdrawQuote('invoice:10');

    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('melt failed');
    await expect(wallet.recoverPendingWithdraw()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:15:send-15');
    await expect(wallet.savePendingWithdrawToken('cashu:node-refund-token', 'routstr-node-refund')).resolves.toBe(false);
    await expect(wallet.recoverPendingWithdraw()).resolves.toContain('cashu:https://mint.getbased.test/Bitcoin:15:send-15');
    await expect(wallet.recoverPendingWithdraw()).resolves.not.toContain('cashu:node-refund-token');
    await wallet.clearPendingWithdraw();

    await expect(wallet.savePendingWithdrawToken('cashu:first-node-refund', 'routstr-node-refund')).resolves.toBe(true);
    await expect(wallet.savePendingWithdrawToken('cashu:second-node-refund', 'routstr-node-refund')).resolves.toBe(false);
    await expect(wallet.recoverPendingWithdraw()).resolves.toBe('cashu:first-node-refund');
    await wallet.clearPendingWithdraw();
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

    await wallet.setMintUrl('https://mint.node.test/Bitcoin/');
    await wallet.receiveToken('cashu:https://mint.node.test/Bitcoin:500:node-refund');
    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.node.test/Bitcoin/');
    await expect(wallet.recoverPendingWithdraw()).resolves.toBeNull();
  });

  it('tops up an existing Routstr node key without creating a replacement session', async () => {
    const wallet = await loadWallet();
    await wallet.setMintUrl('https://mint.getbased.test/Bitcoin');
    await wallet.receiveToken('cashu-token');

    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: 100000 }));

    await expect(wallet.depositToNode('https://node.getbased.test/', 5, 'sk-existing')).resolves.toEqual({ balance: 100000 });
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
    await seedExistingUserCashuState({
      mintUrl: 'https://mint.existing.test/Bitcoin',
      proofs: [proof('legacy-proof-a', 31), proof('legacy-proof-b', 19)],
      pendingQuote: { quote: 'legacy-paid-quote', amount: 12 },
      pendingDeposit: 'cashu:https://mint.existing.test/Bitcoin:7:pending-deposit-secret',
      pendingWithdraw: { token: 'cashu:https://mint.refund.test/Bitcoin:9:pending-withdraw-secret', source: 'routstr-node-refund', savedAt: 1710000000000 },
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      counters: { 'counter:keyset-alpha': 12, 'counter:keyset-beta': 0 },
      feeProofs: [proof('legacy-fee-proof', 2)],
    });
    localStorage.setItem('labcharts-cashu-wallet-mint', 'https://mint.existing.test/Bitcoin');
    localStorage.setItem('labcharts-routstr-node', 'https://node.existing.test/');
    localStorage.setItem('labcharts-routstr-key', 'sk-existing-user-session');

    const stub = installCashuStub();
    stub.mintQuoteStates.set('legacy-paid-quote', 'UNPAID');
    const wallet = await loadWallet();

    await expect(wallet.getMintUrl()).resolves.toBe('https://mint.existing.test/Bitcoin');
    await expect(wallet.getWalletBalance()).resolves.toBe(50);
    await expect(wallet.recoverPendingDeposit()).resolves.toBe('cashu:https://mint.existing.test/Bitcoin:7:pending-deposit-secret');
    await expect(wallet.recoverPendingWithdraw()).resolves.toBe('cashu:https://mint.refund.test/Bitcoin:9:pending-withdraw-secret');
    await expect(wallet.recoverPendingFunding()).resolves.toMatchObject({ checked: 1, recovered: 0, pending: 1, failed: 0 });
    expect(localStorage.getItem('labcharts-routstr-key')).toBe('sk-existing-user-session');
    expect(localStorage.getItem('labcharts-routstr-node')).toBe('https://node.existing.test/');

    const seededWalletInstance = stub.instances.at(-1);
    await expect(seededWalletInstance.opts.counterSource.reserve('keyset-alpha', 3)).resolves.toEqual({ start: 12, count: 3 });
    await expect(readIdbMeta('counter:keyset-alpha')).resolves.toBe(15);

    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: 123000 }));
    await expect(wallet.depositToNode(localStorage.getItem('labcharts-routstr-node'), 5, localStorage.getItem('labcharts-routstr-key'))).resolves.toEqual({ balance: 123000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://node.existing.test/v1/balance/topup');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-existing-user-session');
    expect(fetch.mock.calls[0][0]).not.toContain('/v1/balance/create');
    await expect(wallet.recoverPendingDeposit()).resolves.toBeNull();
    await expect(wallet.recoverPendingWithdraw()).resolves.toBe('cashu:https://mint.refund.test/Bitcoin:9:pending-withdraw-secret');
    expect(localStorage.getItem('labcharts-routstr-key')).toBe('sk-existing-user-session');
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
    await expect(wallet.redeemFees('invoice:1')).rejects.toThrow('No fee proofs to redeem');
  });
});

async function openCashuTestDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('getbased-cashu', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('proofs')) db.createObjectStore('proofs', { keyPath: 'secret' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('fee-proofs')) db.createObjectStore('fee-proofs', { keyPath: 'secret' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function seedExistingUserCashuState({ mintUrl, proofs = [], pendingQuote, pendingDeposit, pendingWithdraw, mnemonic, counters = {}, feeProofs = [] }) {
  const db = await openCashuTestDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['proofs', 'meta', 'fee-proofs'], 'readwrite');
      const proofStore = tx.objectStore('proofs');
      const metaStore = tx.objectStore('meta');
      const feeStore = tx.objectStore('fee-proofs');
      for (const p of proofs) proofStore.put({ ...p, _mint: mintUrl });
      for (const p of feeProofs) feeStore.put({ ...p, _mint: mintUrl });
      metaStore.put({ key: 'mintUrl', value: mintUrl });
      if (mnemonic) metaStore.put({ key: 'walletMnemonic', value: mnemonic });
      if (pendingQuote) metaStore.put({ key: 'pendingQuote:' + pendingQuote.quote, value: pendingQuote.amount });
      if (pendingDeposit) metaStore.put({ key: 'pendingDeposit', value: pendingDeposit });
      if (pendingWithdraw) metaStore.put({ key: 'pendingWithdraw', value: JSON.stringify(pendingWithdraw) });
      for (const [key, value] of Object.entries(counters)) metaStore.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function readIdbMeta(key) {
  const db = await openCashuTestDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function readIdbStore(storeName) {
  const db = await openCashuTestDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
