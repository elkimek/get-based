import { makeTestInvoice } from '../fixtures/lightning-invoices.js';
import { validateLightningInvoice } from '../../js/routstr-validation.js';
type FixtureAmount = number | AmountStub;
export interface FixtureProof { secret: string; amount: FixtureAmount; C: string; id?: string; spent?: boolean; pending?: boolean; uncloneable?: () => void }
interface AmountStub { value: number }
interface FixtureOutput { blindedMessage: { B_: string; amount: FixtureAmount; id: string }; fixtureProof: FixtureProof; toProof?: () => FixtureProof }
interface FixtureBuilder {includeFees(...args: unknown[]): FixtureBuilder; prepare(): Promise<FixturePreview>}
interface FixtureSignature { id: string; amount: FixtureAmount }
interface FixtureQuote { change?: unknown[]; quote: string; amount?: FixtureAmount; fee_reserve?: FixtureAmount; state?: string; request?: string }
interface FixturePreview { inputs: FixtureProof[]; sendOutputs: FixtureOutput[]; keepOutputs: FixtureOutput[]; unselectedProofs: FixtureProof[]; keysetId: string; fixtureResult?: { send: FixtureProof[]; keep: FixtureProof[] } }
interface FixtureMintPreview { method: string; payload: { quote: string }; outputData: FixtureOutput[]; keysetId: string; quote: FixtureQuote }
interface FixtureMeltPreview { method: string; inputs: FixtureProof[]; outputData: FixtureOutput[]; keysetId: string; quote: FixtureQuote }
interface CounterSource { advanceToAtLeast(keysetId: string, value: number): unknown; reserve(keysetId: string, count: number): Promise<{start: number; count: number}> }
interface WalletOptions { counterSource?: CounterSource; bip39seed?: unknown }
interface SeedInput { mintUrl: unknown; proofs?: object[]; pendingQuote?: {quote: unknown; amount?: unknown}; pendingDeposit?: unknown; pendingWithdraw?: unknown; mnemonic?: unknown; counters?: Record<string, unknown>; feeProofs?: object[] }
export type CashuStubWallet = ReturnType<typeof installCashuStub>['instances'][number];
interface FixtureMintReader {restore(request: {outputs: {B_: string}[]}): Promise<{outputs: {B_: string}[]; signatures: (Partial<FixtureSignature> | undefined)[]}>}
export interface CashuStubSDK {
  Wallet: {new (url: string, opts?: WalletOptions): CashuStubWallet; prototype: Pick<CashuStubWallet, 'checkMintQuoteBolt11' | 'checkMeltQuoteBolt11' | 'completeSwap' | 'completeMelt' | 'groupProofsByState' | 'mintProofsBolt11' | 'batchRestore'>};
  Mint: {new (): FixtureMintReader; prototype: FixtureMintReader} | undefined;
  OutputData: {serialize(output: FixtureOutput): object; deserialize(output: FixtureOutput): FixtureOutput} | undefined;
  MintQuoteState: { PAID: string; ISSUED: string; EXPIRED: string };
  sumProofs(proofs?: FixtureProof[]): FixtureAmount;
  getEncodedToken(data: { mint: string; proofs: FixtureProof[] }): string;
  getDecodedToken(token: string): {mint: string; proofs: FixtureProof[]};
  getTokenMetadata(token: string): {mint: string; unit: string; amount: string};
}
export type CashuStubGlobal = typeof globalThis & {cashuts: CashuStubSDK};
export type CashuStubWindow = Window & {cashuts: CashuStubSDK};
let importId = 0;
function proof<Amount extends FixtureAmount>(secret: string, amount: Amount) {
  return { secret, amount, C: `C-${secret}` };
}

class AmountStub {
  constructor(value: unknown) { this.value = Number(value) || 0; }
  toNumber() { return this.value; }
  toString() { return String(this.value); }
  toJSON() { return String(this.value); }
  add(other: FixtureAmount) { return new AmountStub(this.value + amountNumber(other)); }
}

function amountNumber(value: FixtureAmount | string | bigint | null | undefined) {
  if (value && typeof (value as {toNumber?: () => number}).toNumber === 'function') return (value as {toNumber: () => number}).toNumber();
  return Number(value) || 0;
}

function installCashuStub(options: {durableOps?: boolean; amountObjects?: boolean} = {}) {
  options = { durableOps: true, ...options };
  const signatures = new Map<string, FixtureSignature>();
  const tokens = new Map<string, {mint: string; proofs: FixtureProof[]}>();
  const spent = new Set<string>();
  const state = {
    receiveProofs: [proof('rx-1', 10)] as FixtureProof[],
    meltQuotes: new Map<string, FixtureQuote>(),
    mintQuoteStates: new Map<string, string>(),
    failMelt: false,
    failReceive: false,
    failRestore: false,
    failProofPersistence: false,
    failEncodeOnce: false,
    failMintPersistenceOnce: false,
    failMintOutputsAlreadySigned: false,
    restoreProofs: [proof('restored-1', 7), { ...proof('restored-spent', 3), spent: true }] as FixtureProof[],
    instances: [] as Wallet[],
    spent,
    signatures,
    meltState: 'PAID',
    failSwapAfter: false,
    selectFirst: false,
    receives: 0,
  };

  function splitSend(amount: FixtureAmount, proofs: FixtureProof[]) {
    const amountSats = amountNumber(amount);
    const total = amountNumber(sumProofs(proofs));
    const result = {
      send: [proof(`send-${amountSats}-${state.instances.length}`, options.amountObjects ? new AmountStub(amountSats) : amountSats)],
      keep: total > amountSats ? [proof(`keep-${total - amountSats}-${state.instances.length}`, options.amountObjects ? new AmountStub(total - amountSats) : total - amountSats)] : [],
    };
    return result;
  }

  function outputForProof(p: FixtureProof, index: number) {
    return {
      blindedMessage: { B_: `B-${p.secret}-${index}`, amount: p.amount, id: 'keyset-stub' },
      fixtureProof: { ...p },
    };
  }

  interface Wallet {
    url: string; opts: WalletOptions; keysetId: string;
    keyChain: { getKeysets(): {id: string}[]; ensureKeysetKeys(id: string): Promise<{id: string; keys: object}> };
    counters: { advanceToAtLeast(keysetId: string, value: number): unknown };
    ops?: {send(amount: FixtureAmount, proofs: FixtureProof[]): FixtureBuilder; receive(token: string): {prepare(): Promise<FixturePreview>}};
    prepareMint?: (method: string, amount: FixtureAmount, quote: FixtureQuote) => Promise<FixtureMintPreview>;
    prepareMelt?: (method: string, quote: FixtureQuote, proofs: FixtureProof[]) => Promise<FixtureMeltPreview>;
  }
  class Wallet {
    constructor(url: string, opts: WalletOptions = {}) {
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
          send: (amount: FixtureAmount, proofs: FixtureProof[]) => {
            const builder = {
              includeFees: () => builder,
              prepare: async () => {
                const selected = state.selectFirst ? proofs.slice(0, 1) : proofs;
                const unselected = state.selectFirst ? proofs.slice(1) : [];
                const result = splitSend(amount, selected);
                result.keep.push(...unselected);
                const preview: FixturePreview = {
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
          receive: (token: string) => ({
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

    async groupProofsByState(proofs: FixtureProof[]) {
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

    async send(amount: FixtureAmount, proofs: FixtureProof[]) {
      return splitSend(amount, proofs);
    }

    async completeSwap(preview: Omit<FixturePreview, 'keysetId'> & {keysetId?: string}) {
      if (state.failReceive && !preview.sendOutputs.length) throw new Error('receive failed');
      for (const input of preview.inputs) spent.add(input.secret);
      for (const output of [...preview.sendOutputs, ...preview.keepOutputs]) signatures.set(output.blindedMessage.B_, { id: output.blindedMessage.id, amount: output.blindedMessage.amount });
      if (state.failSwapAfter) { state.failSwapAfter = false; throw new Error('lost swap response'); }
      const result = preview.fixtureResult || { send: preview.sendOutputs.map(o => ({ ...o.fixtureProof })), keep: [...preview.keepOutputs.map(o => ({ ...o.fixtureProof })), ...preview.unselectedProofs] };
      if (state.failProofPersistence && result.keep[0]) result.keep[0].uncloneable = () => {};
      return result;
    }

    async completeMint(preview: FixtureMintPreview) {
      if (state.failMintOutputsAlreadySigned && !state.restoreProofs.length) throw new Error('outputs already signed');
      for (const output of preview.outputData) signatures.set(output.blindedMessage.B_, { id: output.blindedMessage.id, amount: output.blindedMessage.amount });
      if (state.failMintOutputsAlreadySigned) { state.mintQuoteStates.set(preview.quote.quote, 'ISSUED'); throw new Error('outputs already signed'); }
      const proofs = preview.outputData.map(output => ({ ...output.fixtureProof }));
      if (state.failMintPersistenceOnce) {
        state.failMintPersistenceOnce = false;
        proofs[0]!.uncloneable = () => {};
      }
      return proofs;
    }

    async completeMelt(preview: FixtureMeltPreview) {
      if (state.failMelt) throw new Error('melt failed');
      if (state.meltState === 'PAID') for (const input of preview.inputs) spent.add(input.secret);
      const quote = { ...preview.quote, state: state.meltState }; state.meltQuotes.set(quote.quote, quote);
      return { quote, change: preview.outputData.map(output => ({ ...output.fixtureProof })) };
    }

    createMeltChangeProofs(outputData: (FixtureOutput & {toProof: () => FixtureProof})[]) {
      return outputData.map(output => output.toProof());
    }

    async createMintQuoteBolt11(amount: FixtureAmount | {amount: FixtureAmount}) {
      const amountSats = amountNumber(typeof amount === 'object' && amount ? (amount as {amount: FixtureAmount}).amount : amount as FixtureAmount);
      return { quote: `mint-${amountSats}`, request: makeTestInvoice(amountSats), amount: options.amountObjects ? new AmountStub(amountSats) : amountSats, state: 'UNPAID' };
    }

    async checkMintQuoteBolt11(quoteId: string) {
      const quoteState = state.mintQuoteStates.get(quoteId) || 'PAID';
      return { state: quoteState, amount: Number(String(quoteId).replace(/\D/g, '')) || 0 };
    }

    async mintProofsBolt11(amount: FixtureAmount, quoteId: string) {
      if (state.failMintOutputsAlreadySigned) throw new Error('outputs already signed');
      return [proof(`minted-${quoteId}`, amount)];
    }

    async createMeltQuoteBolt11(invoice: string) {
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

    async checkMeltQuoteBolt11(quoteId: string) {
      return state.meltQuotes.get(quoteId) || { quote: quoteId, amount: 10, fee_reserve: 2 };
    }

    async meltProofsBolt11() {
      if (state.failMelt) throw new Error('melt failed');
      return { change: [proof(`melt-change-${state.instances.length}`, 1)] };
    }

    async batchRestore(_batchSize: number, _gap: number, start: number) {
      if (state.failRestore) throw new Error('restore unavailable');
      if (start > 0) return { proofs: [] };
      return { proofs: state.restoreProofs.map(p => ({ ...p })) };
    }
  }

  function sumProofs(proofs: FixtureProof[] = []) {
    const total = proofs.reduce((sum, p) => sum + amountNumber(p.amount), 0);
    return options.amountObjects ? new AmountStub(total) : total;
  }

  (globalThis as CashuStubGlobal).cashuts = {
    Wallet,
    Mint: options.durableOps ? class Mint {
      async restore({ outputs }: {outputs: {B_: string}[]}) {
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
  (window as unknown as CashuStubWindow).cashuts = (globalThis as CashuStubGlobal).cashuts;
  return state;
}

async function loadWallet(): Promise<unknown> {
  return import(/* @vite-ignore */ `../../js/cashu-wallet.js?runtime=${importId++}`);
}

async function readCashuStore(storeName: string) {
  return new Promise<unknown[]>((resolve, reject) => {
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
  return new Promise<IDBDatabase>((resolve, reject) => {
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

async function seedExistingUserCashuState({ mintUrl, proofs = [], pendingQuote, pendingDeposit, pendingWithdraw, mnemonic, counters = {}, feeProofs = [] }: SeedInput) {
  const db = await openCashuTestDB();
  try {
    await new Promise<void>((resolve, reject) => {
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

async function readIdbMeta(key: IDBValidKey) {
  const db = await openCashuTestDB();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function readIdbStore(storeName: string) {
  const db = await openCashuTestDB();
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function jsonResponse(body: unknown, init: {status?: number} = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export { proof, AmountStub, installCashuStub, loadWallet, readCashuStore, openCashuTestDB, seedExistingUserCashuState, readIdbMeta, readIdbStore, jsonResponse };
