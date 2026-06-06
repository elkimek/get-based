import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

let importId = 0;
const realFetch = globalThis.fetch;

function proof(secret, amount) {
  return { secret, amount, C: `C-${secret}` };
}

function installCashuStub() {
  const state = {
    receiveProofs: [proof('rx-1', 10)],
    meltQuotes: new Map(),
    failMelt: false,
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
      const total = sumProofs(proofs);
      return {
        send: [proof(`send-${amount}-${state.instances.length}`, amount)],
        keep: total > amount ? [proof(`keep-${total - amount}-${state.instances.length}`, total - amount)] : [],
      };
    }

    async createMintQuoteBolt11(amount) {
      return { quote: `mint-${amount}`, request: `invoice-${amount}`, amount, state: 'UNPAID' };
    }

    async checkMintQuoteBolt11(quoteId) {
      return { state: 'PAID', amount: Number(String(quoteId).replace(/\D/g, '')) || 0 };
    }

    async mintProofsBolt11(amount, quoteId) {
      return [proof(`minted-${quoteId}`, amount)];
    }

    async createMeltQuoteBolt11(invoice) {
      const amount = Number(String(invoice).split(':').pop()) || 10;
      const quote = { quote: `quote-${amount}`, amount, fee_reserve: 5, state: 'UNPAID' };
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
      return { proofs: [proof('restored-1', 7), { ...proof('restored-spent', 3), spent: true }] };
    }
  }

  function sumProofs(proofs = []) {
    return proofs.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }

  globalThis.cashuts = {
    Wallet,
    MintQuoteState: { PAID: 'PAID' },
    sumProofs,
    getEncodedToken: ({ mint, proofs }) => `cashu:${mint}:${sumProofs(proofs)}:${proofs.map(p => p.secret).join(',')}`,
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
    await wallet.clearPendingWithdraw();
    await expect(wallet.recoverPendingWithdraw()).resolves.toBeNull();
  });

  it('handles empty fee pools without mutating the wallet', async () => {
    const wallet = await loadWallet();

    expect(wallet.getFeePct()).toBe(0);
    await expect(wallet.getFeeBalance()).resolves.toBe(0);
    await expect(wallet.retryFeeAutoMelt()).resolves.toEqual({ melted: 0, remaining: 0 });
    await expect(wallet.redeemFees('invoice:1')).rejects.toThrow('No fee proofs to redeem');
  });
});

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
