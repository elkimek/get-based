import { makeTestInvoice } from '../fixtures/lightning-invoices.js';
import { validateLightningInvoice } from '../../js/routstr-validation.js';
let importId = 0;
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
  options = { durableOps: true, ...options };
  const signatures = new Map();
  const tokens = new Map();
  const spent = new Set();
  const state = {
    receiveProofs: [proof('rx-1', 10)],
    meltQuotes: new Map(),
    mintQuoteStates: new Map(),
    failMelt: false,
    failReceive: false,
    failRestore: false,
    failProofPersistence: false,
    failEncodeOnce: false,
    failMintPersistenceOnce: false,
    failMintOutputsAlreadySigned: false,
    restoreProofs: [proof('restored-1', 7), { ...proof('restored-spent', 3), spent: true }],
    instances: [],
    spent,
    signatures,
    meltState: 'PAID',
    failSwapAfter: false,
    selectFirst: false,
    receives: 0,
  };

  function splitSend(amount, proofs) {
    const amountSats = amountNumber(amount);
    const total = amountNumber(sumProofs(proofs));
    const result = {
      send: [proof(`send-${amountSats}-${state.instances.length}`, options.amountObjects ? new AmountStub(amountSats) : amountSats)],
      keep: total > amountSats ? [proof(`keep-${total - amountSats}-${state.instances.length}`, options.amountObjects ? new AmountStub(total - amountSats) : total - amountSats)] : [],
    };
    return result;
  }

  function outputForProof(p, index) {
    return {
      blindedMessage: { B_: `B-${p.secret}-${index}`, amount: p.amount, id: 'keyset-stub' },
      fixtureProof: { ...p },
    };
  }

  class Wallet {
    constructor(url, opts = {}) {
      this.url = url;
      this.opts = opts;
      this.keysetId = 'keyset-stub';
      this.keyChain = {
        getKeysets: () => [{ id: this.keysetId }],
        ensureKeysetKeys: async id => ({ id, keys: {} }),
      };
      this.counters = {
        advanceToAtLeast: (keysetId, value) => opts.counterSource?.advanceToAtLeast(keysetId, value),
      };
      if (options.durableOps) {
        this.ops = {
          send: (amount, proofs) => {
            const builder = {
              includeFees: () => builder,
              prepare: async () => {
                const selected = state.selectFirst ? proofs.slice(0, 1) : proofs;
                const unselected = state.selectFirst ? proofs.slice(1) : [];
                const result = splitSend(amount, selected);
                result.keep.push(...unselected);
                const preview = {
                  inputs: selected.map(p => ({ ...p })),
                  sendOutputs: result.send.map(outputForProof),
                  keepOutputs: result.keep.filter(p => !unselected.includes(p)).map(outputForProof),
                  unselectedProofs: unselected,
                  keysetId: 'keyset-stub',
                };
                preview.fixtureResult = result;
                return preview;
              },
            };
            return builder;
          },
          receive: token => ({
            prepare: async () => {
              const count = state.receives++;
              const result = { keep: state.receiveProofs.map(p => ({ ...p, secret: count ? p.secret + '-rx' + count : p.secret })), send: [] };
              const preview = {
                inputs: (tokens.get(token)?.proofs || []).map(p => ({ ...p })),
                sendOutputs: [],
                keepOutputs: result.keep.map(outputForProof),
                unselectedProofs: [],
                keysetId: 'keyset-stub',
                fixtureResult: result,
              };
              return preview;
            },
          }),
        };
        this.prepareMint = async (method, amount, quote) => {
          const mintedProof = proof(`minted-${quote.quote}`, amountNumber(amount));
          return {
            method,
            payload: { quote: quote.quote },
            outputData: [outputForProof(mintedProof, 0)],
            keysetId: 'keyset-stub',
            quote,
          };
        };
        this.prepareMelt = async (method, quote, proofs) => ({
          method,
          inputs: proofs,
          outputData: [outputForProof(proof(`melt-change-${quote.quote}`, 1), 0)],
          keysetId: 'keyset-stub',
          quote,
        });
      }
      state.instances.push(this);
    }

    async loadMint() {}

    async groupProofsByState(proofs) {
      return {
        unspent: proofs.filter(p => !p.spent && !spent.has(p.secret) && !p.pending),
        spent: proofs.filter(p => p.spent || spent.has(p.secret)),
        pending: proofs.filter(p => p.pending),
      };
    }

    async receive() {
      if (state.failReceive) throw new Error('receive failed');
      return state.receiveProofs.map(p => ({ ...p }));
    }

    async send(amount, proofs) {
      return splitSend(amount, proofs);
    }

    async completeSwap(preview) {
      if (state.failReceive && !preview.sendOutputs.length) throw new Error('receive failed');
      for (const input of preview.inputs) spent.add(input.secret);
      for (const output of [...preview.sendOutputs, ...preview.keepOutputs]) signatures.set(output.blindedMessage.B_, { id: output.blindedMessage.id, amount: output.blindedMessage.amount });
      if (state.failSwapAfter) { state.failSwapAfter = false; throw new Error('lost swap response'); }
      const result = preview.fixtureResult || { send: preview.sendOutputs.map(o => ({ ...o.fixtureProof })), keep: [...preview.keepOutputs.map(o => ({ ...o.fixtureProof })), ...preview.unselectedProofs] };
      if (state.failProofPersistence && result.keep[0]) result.keep[0].uncloneable = () => {};
      return result;
    }

    async completeMint(preview) {
      if (state.failMintOutputsAlreadySigned && !state.restoreProofs.length) throw new Error('outputs already signed');
      for (const output of preview.outputData) signatures.set(output.blindedMessage.B_, { id: output.blindedMessage.id, amount: output.blindedMessage.amount });
      if (state.failMintOutputsAlreadySigned) { state.mintQuoteStates.set(preview.quote.quote, 'ISSUED'); throw new Error('outputs already signed'); }
      const proofs = preview.outputData.map(output => ({ ...output.fixtureProof }));
      if (state.failMintPersistenceOnce) {
        state.failMintPersistenceOnce = false;
        proofs[0].uncloneable = () => {};
      }
      return proofs;
    }

    async completeMelt(preview) {
      if (state.failMelt) throw new Error('melt failed');
      if (state.meltState === 'PAID') for (const input of preview.inputs) spent.add(input.secret);
      const quote = { ...preview.quote, state: state.meltState }; state.meltQuotes.set(quote.quote, quote);
      return { quote, change: preview.outputData.map(output => ({ ...output.fixtureProof })) };
    }

    createMeltChangeProofs(outputData) {
      return outputData.map(output => output.toProof());
    }

    async createMintQuoteBolt11(amount) {
      const amountSats = amountNumber(typeof amount === 'object' && amount ? amount.amount : amount);
      return { quote: `mint-${amountSats}`, request: makeTestInvoice(amountSats), amount: options.amountObjects ? new AmountStub(amountSats) : amountSats, state: 'UNPAID' };
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
      const amount = validateLightningInvoice(invoice).msats / 1000;
      const quote = {
        quote: `quote-${amount}`,
        amount: options.amountObjects ? new AmountStub(amount) : amount,
        fee_reserve: options.amountObjects ? new AmountStub(5) : 5,
        state: 'UNPAID', request: invoice
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
      if (state.failRestore) throw new Error('restore unavailable');
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
    Mint: options.durableOps ? class Mint {
      async restore({ outputs }) {
        return {
          outputs: outputs.filter(output => signatures.has(output.B_)),
          signatures: outputs.filter(output => signatures.has(output.B_)).map(output => signatures.get(output.B_)),
        };
      }
    } : undefined,
    OutputData: options.durableOps ? {
      serialize: output => ({ blindedMessage: output.blindedMessage, fixtureProof: output.fixtureProof }),
      deserialize: output => ({
        blindedMessage: output.blindedMessage, fixtureProof: output.fixtureProof,
        toProof: () => ({ ...output.fixtureProof }),
      }),
    } : undefined,
    MintQuoteState: { PAID: 'PAID', ISSUED: 'ISSUED', EXPIRED: 'EXPIRED' },
    sumProofs,
    getEncodedToken: ({ mint, proofs }) => {
      if (state.failEncodeOnce) {
        state.failEncodeOnce = false;
        throw new Error('codec failed after swap');
      }
      const token = `cashu:${mint}:${sumProofs(proofs)}:${proofs.map(p => p.secret).join(',')}`;
      tokens.set(token, { mint, proofs: proofs.map(p => ({ ...p })) });
      return token;
    },
    getDecodedToken: token => tokens.get(token) || { mint: 'https://mint.getbased.test/Bitcoin', proofs: [proof('external-' + token, 10)] },
    getTokenMetadata: (token) => {
      const parts = String(token).split(':');
      return parts[0] === 'cashu' && parts[1] && parts[2]
        ? { mint: `${parts[1]}:${parts[2]}`, unit: 'sat', amount: parts[3] || String(sumProofs(state.receiveProofs)) }
        : { mint: 'https://mint.getbased.test/Bitcoin', unit: 'sat', amount: String(sumProofs(state.receiveProofs)) };
    },
  };
  window.cashuts = globalThis.cashuts;
  return state;
}

async function loadWallet() {
  return import(/* @vite-ignore */ `../../js/cashu-wallet.js?runtime=${importId++}`);
}

async function readCashuStore(storeName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('getbased-cashu', 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(storeName, 'readonly');
      const getAll = tx.objectStore(storeName).getAll();
      getAll.onsuccess = () => { db.close(); resolve(getAll.result || []); };
      getAll.onerror = () => { db.close(); reject(getAll.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

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

export { proof, AmountStub, installCashuStub, loadWallet, readCashuStore, openCashuTestDB, seedExistingUserCashuState, readIdbMeta, readIdbStore, jsonResponse };
