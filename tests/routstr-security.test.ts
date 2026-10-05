type SecurityWalletOperations = Pick<typeof import('../js/cashu-wallet.js'), "clearPendingWithdraw" | "createFundingInvoice" | "createWithdrawQuote" | "depositToNode" | "startNewNodeSession" | "depositTokenToNode" | "executeWithdraw" | "finishNodeRefund" | "getFeeBalance" | "getMintUrl" | "getPendingNodeRefund" | "getPendingNodeRefunds" | "getWalletBalance" | "getWalletMints" | "receiveToken" | "recoverPendingDeposit" | "recoverPendingWalletOperation" | "recoverPendingWithdraw" | "refundNodeToToken" | "sendAsToken" | "setMintUrl" | "withdrawToAddress">;
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type {Mock} from 'vitest';
type JournalFixtureRead = Record<string, unknown> & {localInputs: {secret?: unknown}[]; outputs: {blindedMessage: {B_: string}}[]};
type MetaRowFixtureRead = {key: string; value: JournalFixtureRead};
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { installCashuStub, loadWallet, proof, readIdbMeta, readIdbStore, jsonResponse } from './helpers/cashu-wallet.js';
import { makeTestInvoice, LNURL_METADATA } from './fixtures/lightning-invoices.js';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
import { encryptedSetCredentialItem, encryptedGetItem, decryptKeyCache, _setTestSessionKey } from '../js/crypto.js';
import { clearKeyCache, updateKeyCache, getCachedKey } from '../js/crypto-key-cache.js';
import { getRoutstrSessionKey, saveRoutstrSessionKey } from '../js/routstr-session.js';
import { validateLightningInvoice, verifyRoutstrAnnouncement, bytesHex, tokenAccountKey } from '../js/routstr-validation.js';
import { schnorr, sha256 } from '../vendor/routstr-crypto.js';
import { applyAISettings } from '../js/sync-apply.js';
import { configureSyncRuntimeCallbacks } from '../js/sync-runtime.js';
import { discoverNodes, setSelectedNodeUrl, clearNodeCache } from '../js/nostr-discovery.js';

const MINT = 'https://mint.getbased.test/Bitcoin';
const NODE = 'https://node.test';
const realFetch = globalThis.fetch;
let stub: ReturnType<typeof installCashuStub>;
let previousSyncRuntimeCallbacks: ReturnType<typeof configureSyncRuntimeCallbacks>;
beforeEach(() => {
  // Credential sync owns no UI in this suite. Prevent deferred wallet-panel
  // imports from issuing balance reads during a later inference assertion.
  previousSyncRuntimeCallbacks = configureSyncRuntimeCallbacks({ refreshRoutstrBalance: () => false });
  localStorage.clear(); sessionStorage.clear(); clearKeyCache(); clearNodeCache();
  setSelectedNodeUrl(NODE);
  globalThis.indexedDB = new IDBFactory();
  configureApiProviderStorageRuntimeDeps({ encryptedSetItem: encryptedSetCredentialItem });
  stub = installCashuStub();
  globalThis.fetch = vi.fn(async () => { throw new Error('Unexpected network request'); });
});
afterEach(() => {
  configureSyncRuntimeCallbacks(previousSyncRuntimeCallbacks);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); globalThis.fetch = realFetch;
});
async function funded(amount = 100) {
  const wallet = await loadWallet() as SecurityWalletOperations;
  await wallet.setMintUrl(MINT);
  stub.receiveProofs = [proof('source', amount)];
  await wallet.receiveToken('cashuAinitial');
  return wallet;
}
function lnurlFetch(invoice: string) {
  return vi.fn(async (url: unknown) => String(url).includes('/.well-known/')
    ? jsonResponse({ tag: 'payRequest', metadata: LNURL_METADATA, callback: 'https://lnurl.test/pay', minSendable: 1000, maxSendable: 25000000 })
    : jsonResponse({ pr: invoice }));
}
function signedEvent(keyNumber: number, created = Math.floor(Date.now() / 1000)) {
  const key = new Uint8Array(32); key[31] = keyNumber;
  const event = { pubkey: bytesHex(schnorr.getPublicKey(key)), created_at: created, kind: 38421,
    tags: [['d', 'same-name'], ['u', `https://node-${keyNumber}.test`]], content: '{"name":"Node"}' };
  const digest = sha256(new TextEncoder().encode(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])));
  return { ...event, id: bytesHex(digest), sig: bytesHex(schnorr.sign(digest, key)) };
}

describe('Routstr security boundaries', () => {
  it('keeps cached node credentials separate from the persisted Ollama model', async () => {
    const { saveOllamaConfig, getOllamaMainModel, setOllamaMainModel } = await import('../js/api-provider-storage.js');
    await saveOllamaConfig({ url: 'http://localhost:11434', model: 'llama3.2', apiKey: 'ollama-secret' });
    await saveRoutstrSessionKey('sk-node-secret', NODE);
    setOllamaMainModel(getOllamaMainModel());
    expect(localStorage.getItem('labcharts-ollama-model')).toBe('llama3.2');
    expect(localStorage.getItem('labcharts-routstr-sessions')).not.toContain('sk-node-secret');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-node-secret');
  });
  it('warns once after three consecutive background fee failures while retaining the pool', async () => {
    const wallet = await funded();
    const notify = vi.fn();
    vi.stubGlobal('window', { ...globalThis.window, showNotification: notify });
    const { _autoMeltFees } = await import('../js/cashu-wallet-transfers.js');
    for (let attempt = 1; attempt <= 4; attempt++) {
      await (_autoMeltFees as (proofs: ReturnType<typeof proof>[], mint: Parameters<typeof _autoMeltFees>[1]) => ReturnType<typeof _autoMeltFees>)(attempt === 1 ? [proof('fee-reserve', 120)] : [], MINT);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(attempt));
    }
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(await wallet.getFeeBalance()).toBe(120);
  });
  it('isolates fee warnings by mint and resets the streak after a successful no-op', async () => {
    await funded();
    const notify = vi.fn();
    vi.stubGlobal('window', { ...globalThis.window, showNotification: notify });
    const { _autoMeltFees } = await import('../js/cashu-wallet-transfers.js');
    const a = 'https://fee-a.test', b = 'https://fee-b.test';
    let requests = 0;
    const attempt = async (mint: string, inputs: ReturnType<typeof proof>[] = []) => {
      await (_autoMeltFees as (proofs: ReturnType<typeof proof>[], mint: Parameters<typeof _autoMeltFees>[1]) => ReturnType<typeof _autoMeltFees>)(inputs, mint);
      requests++;
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(requests));
    };
    await attempt(a, [proof('fee-a', 120)]);
    await attempt(a);
    await attempt(b, [proof('fee-b', 120)]);
    expect(notify).not.toHaveBeenCalled();
    (globalThis.fetch as Mock<typeof realFetch>).mockImplementation(async () => jsonResponse({ tag: 'payRequest', metadata: LNURL_METADATA,
      callback: 'https://lnurl.test/pay', minSendable: 1000000, maxSendable: 2000000 }));
    await attempt(a);
    (globalThis.fetch as Mock<typeof realFetch>).mockImplementation(async () => { throw new Error('Offline mint'); });
    await attempt(a);
    await attempt(a);
    expect(notify).not.toHaveBeenCalled();
    await attempt(a);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(stub.instances.some(wallet => wallet.url === a)).toBe(true);
  });
  it('retains funded keys by canonical node and rejects forwarding another node key', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-a', 'https://node-a.test/');
    setSelectedNodeUrl('https://node-a.test');
    setSelectedNodeUrl('https://node-b.test/');
    expect(getRoutstrSessionKey()).toBe('');
    await expect(wallet.depositToNode('https://node-b.test', 5, 'sk-a')).rejects.toThrow('does not belong');
    expect(fetch).not.toHaveBeenCalled();
    await saveRoutstrSessionKey('sk-b', 'https://node-b.test');
    expect(getRoutstrSessionKey('https://node-a.test')).toBe('sk-a');
    expect(getRoutstrSessionKey()).toBe('sk-b');
  });
  it.each([false, true])('sync keeps origin bindings regardless of field order (node first: %s)', async nodeFirst => {
    localStorage.setItem('labcharts-routstr-node', 'https://local.test');
    localStorage.setItem('labcharts-routstr-key', 'sk-local');
    updateKeyCache('labcharts-routstr-key', 'sk-local');
    const entries = [['labcharts-routstr-key', 'sk-remote'], ['labcharts-routstr-node', 'https://remote.test']];
    await applyAISettings(Object.fromEntries(nodeFirst ? entries.reverse() : entries), { preferRemote: true });
    expect(getRoutstrSessionKey()).toBe('sk-remote');
    expect(getRoutstrSessionKey('https://local.test')).toBe('sk-local');
    await applyAISettings({ 'labcharts-routstr-key': 'sk-unbound' }, { preferRemote: true });
    expect(getRoutstrSessionKey()).toBe('sk-remote');
  });
  it('merges concurrent local node credential saves without dropping either session', async () => {
    await Promise.all([saveRoutstrSessionKey('sk-a', 'https://a.test'), saveRoutstrSessionKey('sk-b', 'https://b.test')]);
    expect(getRoutstrSessionKey('https://a.test')).toBe('sk-a');
    expect(getRoutstrSessionKey('https://b.test')).toBe('sk-b');
  });
  it('encrypts node maps in their own setting and sends old clients an empty legacy key', async () => {
    const { collectAISettings } = await import('../js/sync-payload-collectors.js');
    (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await _setTestSessionKey('RoutstrTestPassword1!');
    try {
      localStorage.setItem('labcharts-routstr-node', NODE);
      await saveRoutstrSessionKey('sk-synthetic-private', NODE);
      expect(localStorage.getItem('labcharts-routstr-sessions')).toMatch(/^v1:/);
      expect(localStorage.getItem('labcharts-routstr-sessions')).not.toContain('sk-synthetic-private');
      expect(await encryptedGetItem('labcharts-routstr-key')).toBe('');
      clearKeyCache(); await decryptKeyCache();
      expect(getRoutstrSessionKey()).toBe('sk-synthetic-private');
      expect(getCachedKey('labcharts-routstr-key')).toBe('');
      const outbound = await collectAISettings();
      expect(outbound['labcharts-routstr-key']).toBeNull();
      expect((JSON.parse as (text: unknown) => {sessions: Record<string, {key?: unknown}>})(outbound['labcharts-routstr-sessions']).sessions[NODE]!.key).toBe('sk-synthetic-private');
    } finally {
      await _setTestSessionKey(null); delete (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
      localStorage.removeItem('labcharts-encryption-enabled');
    }
  });
  it('rejects a larger LNURL invoice before obtaining or paying a mint quote', async () => {
    const wallet = await funded(1000);
    globalThis.fetch = lnurlFetch(makeTestInvoice(500));
    await expect(wallet.withdrawToAddress('alice@lnurl.test', 50)).rejects.toThrow('requested amount');
    expect(stub.meltQuotes.size).toBe(0);
    expect(await wallet.getWalletBalance()).toBe(1000);
  });
  it.each([
    { metadata: 'provider-specific invoice description' },
    { description: 'Provider payment' },
  ])('accepts current LUD-06 invoices with provider descriptions: %j', async options => {
    const wallet = await funded(1000);
    globalThis.fetch = lnurlFetch(makeTestInvoice(20, options));
    await expect(wallet.withdrawToAddress('alice@lnurl.test', 20)).resolves.toMatchObject({ paid: true, amount: 20 });
    expect(stub.meltQuotes.size).toBe(1);
    expect(await wallet.getWalletBalance()).toBeLessThan(1000);
  });
  it('still rejects expired provider invoices before requesting a mint quote', async () => {
    const wallet = await funded(1000);
    globalThis.fetch = lnurlFetch(makeTestInvoice(20, { metadata: 'provider description', timestamp: 1 }));
    await expect(wallet.withdrawToAddress('alice@lnurl.test', 20)).rejects.toThrow('expired');
    expect(stub.meltQuotes.size).toBe(0);
    expect(await wallet.getWalletBalance()).toBe(1000);
  });
  it('validates signed invoices, expiry, metadata, checksum and integer amounts', async () => {
    const invoice = makeTestInvoice(50);
    expect(validateLightningInvoice(invoice, 50, LNURL_METADATA).msats).toBe(50000);
    expect(() => validateLightningInvoice(invoice, 50, 'wrong metadata')).toThrow('metadata');
    expect(() => validateLightningInvoice(makeTestInvoice(50, { timestamp: 1 }), 50)).toThrow('expired');
    expect(() => validateLightningInvoice(invoice.slice(0, -1) + (invoice.endsWith('q') ? 'p' : 'q'))).toThrow();
    const wallet = await funded();
    for (const amount of [NaN, Infinity, 0, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(wallet.sendAsToken(amount)).rejects.toThrow('positive safe integer');
    }
  });
  it('rejects changed withdrawal quotes before swapping any wallet inputs', async () => {
    const wallet = await funded();
    const quote = await wallet.createWithdrawQuote(makeTestInvoice(10));
    stub.meltQuotes.get(quote.quote)!.amount = 50;
    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('changed');
    expect(await wallet.getWalletBalance()).toBe(100);
    expect(await readIdbMeta('pendingSwap')).toBeNull();
  });
  it.each(['PENDING', 'UNPAID', 'UNKNOWN'])('retains melt recovery and never reports %s as paid', async state => {
    const wallet = await funded();
    const quote = await wallet.createWithdrawQuote(makeTestInvoice(10));
    stub.meltState = state;
    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('not confirmed paid');
    expect((JSON.parse as (text: unknown) => {meltOutputs?: unknown})(await readIdbMeta('pendingWithdraw')).meltOutputs).toHaveLength(1);
    await expect(wallet.clearPendingWithdraw()).rejects.toThrow('still unspent or pending');
  });
  it.each([1, 2])('restores selected swap outputs and retains unselected funds (journal version %s)', async version => {
    const wallet = await loadWallet() as SecurityWalletOperations; await wallet.setMintUrl(MINT);
    stub.receiveProofs = [proof('small', 10), proof('untouched', 90)];
    await wallet.receiveToken('cashuAinitial');
    stub.selectFirst = true; stub.failSwapAfter = true;
    await expect(wallet.sendAsToken(4)).rejects.toThrow('lost swap response');
    const store = await import('../js/cashu-wallet-store.js');
    const journal = await store._getMeta('pendingSwap') as JournalFixtureRead;
    expect(journal.localInputs.map(p => p.secret)).toEqual(['small']);
    if (version === 1) await store._setMeta('pendingSwap', { ...journal, version: 1, localInputs: [proof('small', 10), proof('untouched', 90)], unselectedProofs: undefined });
    expect(await wallet.getWalletBalance()).toBe(100);
    expect((await readIdbStore('proofs') as {secret?: unknown}[]).some(p => p.secret === 'untouched')).toBe(true);
  });
  it('does not commit a partial set of restored signatures', async () => {
    const wallet = await funded(); stub.failSwapAfter = true;
    await expect(wallet.sendAsToken(4)).rejects.toThrow('lost swap response');
    const journal = await readIdbMeta('pendingSwap') as JournalFixtureRead;
    stub.signatures.delete(journal.outputs[0]!.blindedMessage.B_);
    const rows = await readIdbStore('proofs');
    expect(await wallet.recoverPendingWalletOperation()).toMatchObject({ recovered: 0, pending: true });
    expect(await readIdbStore('proofs')).toEqual(rows);
    expect(await readIdbMeta('pendingSwap')).not.toBeNull();
  });
  it('a rejected incoming token leaves existing funds usable and reuses its prepared outputs on retry', async () => {
    const wallet = await funded(); stub.failReceive = true;
    await expect(wallet.receiveToken('cashuAbad')).rejects.toThrow('receive failed');
    const before = (await readIdbStore('meta') as MetaRowFixtureRead[]).find(r => r.key.startsWith('pendingReceive:'));
    await expect(wallet.sendAsToken(1)).resolves.toMatchObject({ remaining: 99 });
    stub.failReceive = false;
    await wallet.receiveToken('cashuAbad');
    expect(stub.signatures.has(before!.value.outputs[0]!.blindedMessage.B_)).toBe(true);
    expect((await readIdbStore('meta') as MetaRowFixtureRead[]).find(r => r.key === before!.key)).toBeUndefined();
  });
  it('preserves a spent-token import and node refund across mint selection and reload without retrying them', async () => {
    const wallet = await funded(5);
    const store = await import('../js/cashu-wallet-store.js');
    const sdk = (globalThis as import('./helpers/cashu-wallet.js').CashuStubGlobal).cashuts;
    const refund = { nodeUrl: NODE, key: 'sk-original', createdAt: 1, token: 'cashuAspent-refund' };
    await store._setMeta('pendingNodeRefund', refund);
    vi.spyOn(sdk.Wallet.prototype, 'completeSwap').mockRejectedValue(new Error('Proof already spent'));
    await expect(wallet.receiveToken(refund.token)).rejects.toThrow('Proof already spent');
    const [journal] = await store._getMetaEntries('pendingReceive:');
    const rows = await readIdbStore('proofs');
    const restore = vi.spyOn(sdk.Mint!.prototype, 'restore');
    const reloaded = await loadWallet() as SecurityWalletOperations;
    await reloaded.setMintUrl('https://mint.minibits.cash/Bitcoin');
    await reloaded.setMintUrl('https://mint.cubabitcoin.org');
    expect(await reloaded.getMintUrl()).toBe('https://mint.cubabitcoin.org');
    expect(await readIdbMeta(journal!.key)).toEqual(journal!.value);
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(refund);
    expect(await readIdbStore('proofs')).toEqual(rows);
    expect(restore).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    // Empty restoration is unresolved, not evidence that this wallet was paid.
    expect(await reloaded.recoverPendingWalletOperation()).toMatchObject({ recovered: 0, pending: true,
      results: expect.arrayContaining([expect.objectContaining({ operation: 'receive', mint: MINT, pending: true })]) });
    await expect(reloaded.receiveToken(refund.token)).rejects.toThrow('Proof already spent');
    expect(await readIdbMeta(journal!.key)).toEqual(journal!.value);
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(refund);
    expect(await readIdbStore('proofs')).toEqual(rows);
  });
  it('restores an interrupted import at its original mint after selection without switching back', async () => {
    const wallet = await funded(5);
    stub.receiveProofs = [proof('refund-output', 3)];
    stub.failSwapAfter = true;
    await expect(wallet.receiveToken('cashuAlost-import')).rejects.toThrow('lost swap response');
    const store = await import('../js/cashu-wallet-store.js');
    const [journal] = await store._getMetaEntries('pendingReceive:');
    const rows = await readIdbStore('proofs');
    await wallet.setMintUrl('https://mint.minibits.cash/Bitcoin');
    expect(await readIdbMeta(journal!.key)).toEqual(journal!.value);
    expect(await readIdbStore('proofs')).toEqual(rows);
    expect(await wallet.recoverPendingWalletOperation()).toMatchObject({ recovered: 3, pending: false,
      results: expect.arrayContaining([expect.objectContaining({ operation: 'receive', mint: MINT, recovered: 3 })]) });
    expect(await wallet.getMintUrl()).toBe('https://mint.minibits.cash/Bitcoin');
    expect(await wallet.getWalletMints()).toEqual(expect.arrayContaining([expect.objectContaining({ mint: MINT, balance: 8 })]));
    expect(await readIdbMeta(journal!.key)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['partial', 'invalid', 'offline'])('retains an unresolved %s import after changing mint without crediting partial value', async mode => {
    const wallet = await funded(5);
    stub.receiveProofs = [proof('refund-output-a', 1), proof('refund-output-b', 2)];
    stub.failSwapAfter = true;
    await expect(wallet.receiveToken('cashuAuncertain-import')).rejects.toThrow('lost swap response');
    const store = await import('../js/cashu-wallet-store.js');
    const [journal] = await store._getMetaEntries('pendingReceive:') as MetaRowFixtureRead[];
    const firstOutput = journal!.value.outputs[0]!.blindedMessage.B_;
    if (mode === 'partial') stub.signatures.delete(firstOutput);
    if (mode === 'invalid') stub.signatures.get(firstOutput)!.id = 'wrong-keyset';
    if (mode === 'offline') {
      const sdk = (globalThis as import('./helpers/cashu-wallet.js').CashuStubGlobal).cashuts;
      vi.spyOn(sdk.Mint!.prototype, 'restore').mockRejectedValue(new Error('mint unreachable'));
    }
    const rows = await readIdbStore('proofs');
    await wallet.setMintUrl('https://mint.cubabitcoin.org');
    expect(await wallet.recoverPendingWalletOperation()).toMatchObject({ recovered: 0, pending: true,
      results: expect.arrayContaining([expect.objectContaining({ operation: 'receive', mint: MINT, pending: true, error: expect.any(String) })]) });
    expect(await readIdbMeta(journal!.key)).toEqual(journal!.value);
    expect(await readIdbStore('proofs')).toEqual(rows);
    expect(await wallet.getMintUrl()).toBe('https://mint.cubabitcoin.org');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { operation: 'receive' },
    { operation: 'receive', mint: 'http://localhost:8000' },
    { operation: 'send', mint: MINT },
  ])('keeps an unbound or non-receive import record blocked (%j)', async record => {
    const wallet = await funded(5);
    const store = await import('../js/cashu-wallet-store.js');
    await store._setMeta('pendingReceive:invalid', record);
    await expect(wallet.setMintUrl('https://mint.cubabitcoin.org')).rejects.toThrow('(token import)');
    expect(await readIdbMeta('pendingReceive:invalid')).toEqual(record);
    expect(await wallet.getMintUrl()).toBe(MINT);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([1, 2])('recovers a cross-mint receive without changing the selected mint after a lost response (version %s)', async version => {
    const wallet = await loadWallet() as SecurityWalletOperations; await wallet.setMintUrl('https://old-mint.test');
    stub.failSwapAfter = true;
    await expect(wallet.receiveToken('cashuAforeign')).rejects.toThrow('lost swap response');
    expect(await wallet.getMintUrl()).toBe('https://old-mint.test');
    if (version === 1) {
      const store = await import('../js/cashu-wallet-store.js');
      const [entry] = await store._getMetaEntries('pendingReceive:') as MetaRowFixtureRead[];
      await store._setMeta('pendingSwap', { ...entry!.value, version: 1, selectMint: undefined, incomingToken: undefined });
      await store._deleteMeta(entry!.key);
    }
    expect(await wallet.getWalletBalance()).toBe(0);
    expect(await wallet.getMintUrl()).toBe('https://old-mint.test');
    await expect(wallet.recoverPendingWalletOperation()).resolves.toMatchObject({ recovered: 10, pending: false });
    expect(await wallet.getMintUrl()).toBe('https://old-mint.test');
    expect(await wallet.getWalletMints()).toEqual(expect.arrayContaining([expect.objectContaining({ mint: MINT, balance: 10, active: false })]));
  });
  it('includes incoming tokens and outstanding funding in the wallet cap', async () => {
    const wallet = await funded(24990);
    stub.receiveProofs = [proof('too-large', 20)];
    await expect(wallet.receiveToken('cashuAtooLarge')).rejects.toThrow('safety cap');
    await wallet.createFundingInvoice(10);
    await expect(wallet.createFundingInvoice(1)).rejects.toThrow('safety cap');
    stub.receiveProofs = [proof('also-too-large', 1)];
    await expect(wallet.receiveToken('cashuAone')).rejects.toThrow('safety cap');
  });
  it('persists the completed node credential before clearing its deposit recovery', async () => {
    const wallet = await funded();
    configureApiProviderStorageRuntimeDeps({ encryptedSetItem: async () => { throw new Error('credential store full'); } });
    globalThis.fetch = vi.fn(async () => jsonResponse({ api_key: 'sk-created' }));
    await expect(wallet.depositToNode(NODE, 5)).rejects.toThrow('credential store full');
    expect(await readIdbMeta('pendingDeposit')).toMatchObject({ completed: true, apiKey: 'sk-created', nodeUrl: NODE });
    configureApiProviderStorageRuntimeDeps({ encryptedSetItem: encryptedSetCredentialItem });
    expect(await wallet.recoverPendingDeposit()).toBeNull();
    expect(getRoutstrSessionKey(NODE)).toBe('sk-created');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains both credentials when the active node session changes during a deposit', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-original', NODE);
    globalThis.fetch = vi.fn(async (_url, options) => {
      if (options?.method !== 'POST') return jsonResponse({ balance: 0 });
      await saveRoutstrSessionKey('sk-replacement', NODE);
      return jsonResponse({ balance: 5000 });
    });
    await expect(wallet.depositToNode(NODE, 5)).rejects.toThrow('session changed');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-replacement');
    expect(await readIdbMeta('pendingDeposit')).toMatchObject({ apiKey: 'sk-original', completed: true });
  });
  it.each(['401', '403', 'offline', 'malformed'])('does not swap wallet proofs or create a deposit journal when session preflight fails (%s)', async failure => {
    const wallet = await funded(1000);
    await saveRoutstrSessionKey('sk-rejected', NODE);
    const store = await import('../js/cashu-wallet-store.js');
    const oldRefund = { nodeUrl: NODE, key: 'sk-rejected', createdAt: 1, token: 'cashuAold-refund' };
    await store._setMeta('pendingNodeRefund', oldRefund);
    const before = await readIdbStore('proofs');
    const swap = vi.spyOn((globalThis as import('./helpers/cashu-wallet.js').CashuStubGlobal).cashuts.Wallet.prototype, 'completeSwap');
    globalThis.fetch = vi.fn(async () => {
      if (failure === 'offline') throw new Error('node unreachable');
      return failure === 'malformed' ? jsonResponse({}) : new Response('', { status: Number(failure) });
    });
    await expect(wallet.depositToNode(NODE, 500)).rejects.toThrow();
    expect(swap).not.toHaveBeenCalled();
    expect(await readIdbStore('proofs')).toEqual(before);
    expect(await readIdbMeta('pendingDeposit')).toBeNull();
    expect(await readIdbMeta('pendingSwap')).toBeNull();
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(oldRefund);
    expect(getRoutstrSessionKey(NODE)).toBe('sk-rejected');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as Mock<typeof realFetch>).mock.calls[0]![0]).toBe(NODE + '/v1/balance/info');
    expect((fetch as Mock<typeof realFetch>).mock.calls[0]![1]?.method).not.toBe('POST');
  });
  it('rejects a session changed during preflight before swapping wallet proofs', async () => {
    const wallet = await funded(1000);
    await saveRoutstrSessionKey('sk-old', NODE);
    const before = await readIdbStore('proofs');
    const swap = vi.spyOn((globalThis as import('./helpers/cashu-wallet.js').CashuStubGlobal).cashuts.Wallet.prototype, 'completeSwap');
    globalThis.fetch = vi.fn(async () => {
      await saveRoutstrSessionKey('sk-new', NODE);
      return jsonResponse({ balance: 0 });
    });
    await expect(wallet.depositToNode(NODE, 500)).rejects.toThrow('session changed');
    expect(swap).not.toHaveBeenCalled();
    expect(await readIdbStore('proofs')).toEqual(before);
    expect(await readIdbMeta('pendingDeposit')).toBeNull();
    expect(getRoutstrSessionKey(NODE)).toBe('sk-new');
  });
  it('allows a top-up of an authenticated node account with a negative finite balance', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-overdrawn', NODE);
    globalThis.fetch = vi.fn(async (_url, options) => jsonResponse(options?.method === 'POST' ? { balance: 5000 } : { balance: -2000 }));
    await wallet.depositToNode(NODE, 5);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as Mock<typeof realFetch>).mock.calls[1]![0]).toBe(NODE + '/v1/balance/topup');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-overdrawn');
  });
  it('retries a preserved token-less refund with its original account after an explicit reset', async () => {
    const wallet = await funded();
    const store = await import('../js/cashu-wallet-store.js');
    await saveRoutstrSessionKey('sk-old', NODE);
    await store._setMeta('pendingNodeRefund', { nodeUrl: NODE, key: 'sk-old', generation: 'old-generation', createdAt: 1 });
    await wallet.startNewNodeSession(NODE);
    await saveRoutstrSessionKey('sk-new', NODE);
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAold-refund' }));
    expect(await wallet.refundNodeToToken(NODE, 'pendingNodeRefund', undefined, 'old-generation')).toMatchObject({ key: 'sk-old', token: 'cashuAold-refund' });
    expect(fetch).toHaveBeenCalledWith(NODE + '/v1/wallet/refund', expect.objectContaining({ headers: { Authorization: 'Bearer sk-old' } }));
    expect(getRoutstrSessionKey(NODE)).toBe('sk-new');
    expect(await wallet.refundNodeToToken(NODE, 'pendingNodeRefund', undefined, 'old-generation')).toMatchObject({ token: 'cashuAold-refund' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(wallet.refundNodeToToken(NODE, 'pendingDeposit')).rejects.toThrow('Invalid refund recovery');
  });
  it('requires pending deposit recovery before an explicit session reset and preserves the old key on reset', async () => {
    const wallet = await funded(1000);
    const store = await import('../js/cashu-wallet-store.js');
    const { getArchivedRoutstrSessionKeys } = await import('../js/routstr-session.js');
    await saveRoutstrSessionKey('sk-old', NODE);
    const deposit = { nodeUrl: NODE, token: 'cashuAdeposit', submitted: true };
    await store._setMeta('pendingDeposit', deposit);
    await expect(wallet.startNewNodeSession(NODE)).rejects.toThrow('pending deposit');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-old');
    expect(await readIdbMeta('pendingDeposit')).toEqual(deposit);
    await store._setMeta('pendingDeposit', null);
    const rows = await readIdbStore('proofs');
    await wallet.startNewNodeSession(NODE);
    expect(getRoutstrSessionKey(NODE)).toBe('');
    expect(getArchivedRoutstrSessionKeys(NODE)).toEqual(['sk-old']);
    expect(await readIdbStore('proofs')).toEqual(rows);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['offline', 'http', 'invalid-json'])('keeps the saved account identity when an initial refund fails (%s)', async failure => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-old', NODE);
    globalThis.fetch = vi.fn(async () => {
      if (failure === 'offline') throw new Error('offline');
      return failure === 'http' ? new Response('', { status: 401 }) : new Response('invalid-json', { status: 200 });
    });
    await expect(wallet.refundNodeToToken(NODE)).rejects.toMatchObject({ recoveryId: 'pendingNodeRefund', nodeUrl: NODE, createdAt: expect.any(Number) });
    const pending = (await wallet.getPendingNodeRefunds(NODE))[0]!;
    await wallet.startNewNodeSession(NODE);
    await saveRoutstrSessionKey('sk-new', NODE);
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAold-refund' }));
    await wallet.refundNodeToToken(NODE, 'pendingNodeRefund', undefined, pending.generation);
    expect(fetch).toHaveBeenCalledWith(NODE + '/v1/wallet/refund', expect.objectContaining({ headers: { Authorization: 'Bearer sk-old' } }));
    expect(getRoutstrSessionKey(NODE)).toBe('sk-new');
  });
  it('retries receipt of a returned refund after its final save failed without another refund request', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-old', NODE);
    const put = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: { key?: unknown; value?: { token?: unknown } }, ...args: Parameters<IDBObjectStore['put']> extends [unknown, ...infer Rest] ? Rest : never) {
      if (value.key === 'pendingNodeRefund' && value.value?.token) throw new Error('quota full');
      return put.call(this, value, ...args);
    });
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAreturned' }));
    await expect(wallet.refundNodeToToken(NODE)).rejects.toMatchObject({ recoveryToken: 'cashuAreturned', recoveryId: 'pendingNodeRefund', nodeUrl: NODE });
    fail.mockRestore();
    const pending = (await wallet.getPendingNodeRefunds(NODE))[0]!;
    await wallet.startNewNodeSession(NODE);
    await saveRoutstrSessionKey('sk-new', NODE);
    const retry = await wallet.refundNodeToToken(NODE, 'pendingNodeRefund', 'cashuAreturned', pending.generation);
    expect(retry).toMatchObject({ token: 'cashuAreturned', key: 'sk-old' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(wallet.refundNodeToToken(NODE, 'pendingNodeRefund', 'cashuAdifferent', pending.generation)).rejects.toThrow('does not match');
    await wallet.receiveToken(retry.token);
    await wallet.finishNodeRefund(retry.token);
    expect(await wallet.getPendingNodeRefunds(NODE)).toEqual([]);
    expect(getRoutstrSessionKey(NODE)).toBe('sk-new');
  });
  it('rejects a stale token-less refund card after its journal key is reused, even when creation times collide', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-old', NODE);
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    globalThis.fetch = vi.fn(async () => { throw new Error('lost response'); });
    await expect(wallet.refundNodeToToken(NODE)).rejects.toThrow('lost response');
    const old = (await wallet.getPendingNodeRefunds(NODE))[0]!;
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAold-refund' }));
    const recovered = await wallet.refundNodeToToken(NODE, old.recoveryId, undefined, old.generation);
    await wallet.receiveToken(recovered.token);
    await wallet.startNewNodeSession(NODE);
    await saveRoutstrSessionKey('sk-new', NODE);
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAnew-refund' }));
    const replacement = await wallet.refundNodeToToken(NODE);
    expect(replacement.recoveryId).toBe(old.recoveryId);
    expect(replacement.createdAt).toBe(old.createdAt);
    expect(replacement.generation).not.toBe(old.generation);
    (fetch as Mock<typeof realFetch>).mockClear();
    await expect(wallet.refundNodeToToken(NODE, old.recoveryId, undefined, old.generation)).rejects.toThrow('record changed');
    expect(fetch).not.toHaveBeenCalled();
    expect(await wallet.getPendingNodeRefunds(NODE)).toEqual([replacement]);
  });
  it('creates a new explicitly selected node session and keeps its refund separate from the preserved old account refund', async () => {
    const wallet = await funded(1000);
    const store = await import('../js/cashu-wallet-store.js');
    const { getArchivedRoutstrSessionKeys } = await import('../js/routstr-session.js');
    await saveRoutstrSessionKey('sk-old', NODE);
    const oldRefund = { nodeUrl: NODE, key: 'sk-old', generation: 'old-generation', createdAt: 1, token: 'cashuAold-refund' };
    await store._setMeta('pendingNodeRefund', oldRefund);
    await wallet.startNewNodeSession(NODE);
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/v1/balance/create')) return jsonResponse({ api_key: 'sk-new', balance: 500000 });
      if (String(url).endsWith('/v1/wallet/refund')) return jsonResponse({ token: 'cashuAnew-refund' });
      throw new Error('Unexpected endpoint');
    });
    await wallet.depositToNode(NODE, 500);
    expect(getRoutstrSessionKey(NODE)).toBe('sk-new');
    expect(getArchivedRoutstrSessionKeys(NODE)).toEqual(['sk-old']);
    expect((fetch as Mock<typeof realFetch>).mock.calls[0]![0]).toBe(NODE + '/v1/balance/create');
    expect((fetch as Mock<typeof realFetch>).mock.calls[0]![1]?.headers).not.toHaveProperty('Authorization');
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(oldRefund);
    const newRefund = await wallet.refundNodeToToken(NODE);
    expect(newRefund).toMatchObject({ token: 'cashuAnew-refund', key: 'sk-new' });
    expect(await wallet.refundNodeToToken(NODE, 'pendingNodeRefund', undefined, 'old-generation')).toMatchObject(oldRefund);
    expect(await wallet.getPendingNodeRefunds(NODE)).toHaveLength(2);
    await expect(wallet.refundNodeToToken('https://other-node.test', newRefund.recoveryId, undefined, newRefund.generation)).rejects.toThrow('unavailable');
    expect(await wallet.refundNodeToToken(NODE)).toEqual(newRefund);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Settling the older account must not hide the current saved refund.
    await store._setMeta('pendingNodeRefund', null);
    expect(await wallet.refundNodeToToken(NODE)).toEqual(newRefund);
    expect(fetch).toHaveBeenCalledTimes(2);
    await wallet.startNewNodeSession(NODE);
    await saveRoutstrSessionKey('sk-third', NODE);
    expect(await wallet.getPendingNodeRefunds(NODE)).toEqual([newRefund]);
    expect(await wallet.refundNodeToToken(NODE, newRefund.recoveryId, undefined, newRefund.generation)).toEqual(newRefund);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await store._getMetaEntries('pendingNodeRefund:')).toHaveLength(1);
    await wallet.receiveToken(newRefund.token);
    expect((await store._getMetaEntries('pendingNodeRefund:')).filter(entry => entry.value)).toEqual([]);
    // Idempotent completion cannot clear another account's saved refund.
    await store._setMeta('pendingNodeRefund', oldRefund);
    await wallet.finishNodeRefund(newRefund.token);
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(oldRefund);
    expect(getArchivedRoutstrSessionKeys(NODE)).toEqual(['sk-new', 'sk-old']);
  });
  it('reconciles a lost node-create response with the durable token-derived credential', async () => {
    const wallet = await funded();
    globalThis.fetch = vi.fn(async () => { throw new Error('lost HTTP response'); });
    await expect(wallet.depositToNode(NODE, 5)).rejects.toThrow('lost HTTP response');
    const record = await readIdbMeta('pendingDeposit') as {candidateKey: unknown; token: Parameters<typeof tokenAccountKey>[0]};
    expect(record.candidateKey).toBe(tokenAccountKey(record.token));
    globalThis.fetch = vi.fn(async () => jsonResponse({ api_key: record.candidateKey, balance: 5000 }));
    expect(await wallet.recoverPendingDeposit()).toBeNull();
    expect((fetch as Mock<typeof realFetch>).mock.calls[0]![0]).toBe(NODE + '/v1/balance/info');
    expect(getRoutstrSessionKey(NODE)).toBe(record.candidateKey);
  });
  it('journals pasted-token account conversion before submitting it', async () => {
    const wallet = await loadWallet() as SecurityWalletOperations;
    globalThis.fetch = vi.fn(async () => { expect(await readIdbMeta('pendingDeposit')).toMatchObject({ token: 'cashuApasted', submitted: true }); throw new Error('offline'); });
    await expect(wallet.depositTokenToNode(NODE, 'cashuApasted')).rejects.toThrow('offline');
    expect((await readIdbMeta('pendingDeposit') as {token?: unknown}).token).toBe('cashuApasted');
  });
  it.each(['offline', 'http-error', 'invalid-json', 'missing-token'])('keeps a bound %s node refund recoverable while selecting another mint', async failure => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-node', NODE);
    globalThis.fetch = vi.fn(async () => {
      if (failure === 'offline') throw new Error('lost refund response');
      if (failure === 'http-error') return new Response('', { status: 503 });
      if (failure === 'invalid-json') return new Response('invalid JSON', { status: 200 });
      return jsonResponse({});
    });
    await expect(wallet.refundNodeToToken(NODE)).rejects.toThrow();
    const pending = await readIdbMeta('pendingNodeRefund');
    const proofs = await readIdbStore('proofs');
    (fetch as Mock<typeof realFetch>).mockClear();
    const reloaded = await loadWallet() as SecurityWalletOperations;
    await reloaded.setMintUrl('https://mint.other.test/Bitcoin');
    expect(await reloaded.getMintUrl()).toBe('https://mint.other.test/Bitcoin');
    expect(await reloaded.getPendingNodeRefund()).toEqual(pending);
    expect(await readIdbStore('proofs')).toEqual(proofs);
    expect(await reloaded.getWalletMints()).toEqual(expect.arrayContaining([
      expect.objectContaining({ mint: MINT, balance: 100 }),
      expect.objectContaining({ mint: 'https://mint.other.test/Bitcoin', balance: 0 }),
    ]));
    const secondReload = await loadWallet() as SecurityWalletOperations;
    await secondReload.setMintUrl(MINT);
    expect(await secondReload.getPendingNodeRefund()).toEqual(pending);
    expect(getRoutstrSessionKey(NODE)).toBe('sk-node');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains a saved refund token across mint selection and receives it at its original mint without another refund request', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-node', NODE);
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuArefund' }));
    const pending = await wallet.refundNodeToToken(NODE);
    (fetch as Mock<typeof realFetch>).mockClear();
    const reloaded = await loadWallet() as SecurityWalletOperations;
    await reloaded.setMintUrl('https://mint.other.test/Bitcoin');
    const { recoveryId, ...savedRecord } = pending;
    expect(recoveryId).toBe('pendingNodeRefund');
    expect(await reloaded.getPendingNodeRefund()).toEqual(savedRecord);
    expect(await reloaded.refundNodeToToken(NODE)).toEqual(pending);
    stub.receiveProofs = [proof('recovered-node-refund', 7)];
    await reloaded.receiveToken(pending.token);
    expect(await reloaded.getPendingNodeRefund()).toBeNull();
    expect(await reloaded.getMintUrl()).toBe(MINT);
    expect(await reloaded.getWalletMints()).toEqual(expect.arrayContaining([
      expect.objectContaining({ mint: MINT, balance: 107 }),
      expect.objectContaining({ mint: 'https://mint.other.test/Bitcoin', balance: 0 }),
    ]));
    expect(getRoutstrSessionKey(NODE)).toBe('sk-node');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { nodeUrl: 'http://127.0.0.1', key: 'sk-node', createdAt: 1 },
    { nodeUrl: NODE, key: 'sk-different-account', createdAt: 1 },
    { nodeUrl: NODE, key: 'sk-node', createdAt: 1, token: 'invalid-token' },
    { nodeUrl: NODE, createdAt: 1 },
    { nodeUrl: NODE, key: 'sk-node' },
  ])('preserves legacy or unmatched node refund record %# without using it during mint selection', async record => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-node', NODE);
    const store = await import('../js/cashu-wallet-store.js');
    await store._setMeta('pendingNodeRefund', record);
    const proofs = await readIdbStore('proofs');
    await wallet.setMintUrl('https://mint.other.test/Bitcoin');
    expect(await wallet.getMintUrl()).toBe('https://mint.other.test/Bitcoin');
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(record);
    expect(await readIdbStore('proofs')).toEqual(proofs);
    expect(getRoutstrSessionKey(NODE)).toBe('sk-node');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['different-node', 'different-account', 'legacy-receive'])('refunds the current Cuba account while preserving an unrelated spent Cashu recovery (%s)', async mode => {
    const wallet = await funded(10);
    const store = await import('../js/cashu-wallet-store.js');
    const sdk = (globalThis as import('./helpers/cashu-wallet.js').CashuStubGlobal).cashuts;
    const metadata = sdk.getTokenMetadata;
    vi.spyOn(sdk, 'getTokenMetadata').mockImplementation(token => token === 'cashuAspent-old'
      ? { mint: 'https://cashu.cz', unit: 'sat', amount: '1' }
      : token === 'cashuACuba-refund' ? { mint: 'https://mint.cubabitcoin.org', unit: 'sat', amount: '5750' } : metadata(token));
    const old = { nodeUrl: mode === 'different-account' ? NODE : 'https://routstr.cypherpunk.today', key: 'sk-old-account',
      generation: 'old-generation', createdAt: 1, token: 'cashuAspent-old' };
    await store._setMeta('pendingNodeRefund', old);
    const swap = vi.spyOn(sdk.Wallet.prototype, 'completeSwap').mockRejectedValue(new Error('Proof already spent'));
    stub.receiveProofs = [proof('old-receive', 1)];
    await expect(wallet.receiveToken(old.token)).rejects.toThrow('Proof already spent');
    swap.mockRestore();
    const [oldEntry] = await store._getMetaEntries('pendingReceive:') as MetaRowFixtureRead[];
    // The unknown amount conservatively occupies the whole incoming-token cap.
    const oldJournal = { ...oldEntry!.value, incomingAmount: undefined };
    await store._setMeta(oldEntry!.key, oldJournal);
    await wallet.setMintUrl('https://mint.cubabitcoin.org');
    if (mode === 'legacy-receive') {
      await store._setMeta('pendingSwap', oldJournal);
      await store._deleteMeta(oldEntry!.key);
    }
    const restore = vi.spyOn(sdk.Mint!.prototype, 'restore').mockRejectedValue(new Error('Cashu mint unreachable'));
    await saveRoutstrSessionKey('sk-redshift-current', NODE);
    expect(await wallet.getPendingNodeRefund()).toBeNull();
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuACuba-refund' }));
    const current = await wallet.refundNodeToToken(NODE);
    expect(current).toMatchObject({ key: 'sk-redshift-current', token: 'cashuACuba-refund' });
    expect(current.recoveryId).toMatch(/^pendingNodeRefund:/);
    expect(await wallet.refundNodeToToken(NODE)).toEqual(current);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(NODE + '/v1/wallet/refund', expect.objectContaining({ headers: { Authorization: 'Bearer sk-redshift-current' } }));
    stub.receiveProofs = [proof('cuba-refund', 5750)];
    await expect(wallet.receiveToken(current.token)).resolves.toMatchObject({ received: 5750 });
    await wallet.finishNodeRefund(current.token);
    expect(await wallet.getWalletBalance()).toBe(5750);
    expect(await wallet.getMintUrl()).toBe('https://mint.cubabitcoin.org');
    expect(await wallet.getWalletMints()).toEqual(expect.arrayContaining([expect.objectContaining({ mint: MINT, balance: 10 })]));
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(old);
    expect((await store._getMetaEntries('pendingReceive:')).filter(entry => entry.value).map(entry => entry.value)).toEqual([oldJournal]);
    expect(await readIdbMeta('pendingSwap')).toBeNull();
    expect(restore).not.toHaveBeenCalled();
    expect(getRoutstrSessionKey(NODE)).toBe('sk-redshift-current');
    expect(await wallet.getPendingNodeRefunds(NODE)).toHaveLength(mode === 'different-account' ? 1 : 0);
    expect(await wallet.getPendingNodeRefunds()).toEqual([{ ...old, recoveryId: 'pendingNodeRefund' }]);
  });
  it('retains a legacy receive journal and all proofs if its atomic isolation write fails', async () => {
    const wallet = await funded(10);
    const store = await import('../js/cashu-wallet-store.js');
    const sdk = (globalThis as import('./helpers/cashu-wallet.js').CashuStubGlobal).cashuts;
    const swap = vi.spyOn(sdk.Wallet.prototype, 'completeSwap').mockRejectedValue(new Error('spent incoming token'));
    await expect(wallet.receiveToken('cashuAold-import')).rejects.toThrow('spent incoming token');
    swap.mockRestore();
    const [entry] = await store._getMetaEntries('pendingReceive:') as MetaRowFixtureRead[];
    await store._setMeta('pendingSwap', entry!.value);
    await store._deleteMeta(entry!.key);
    await saveRoutstrSessionKey('sk-current', NODE);
    const proofs = await readIdbStore('proofs');
    const put = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: { key?: unknown }, ...args: Parameters<IDBObjectStore['put']> extends [unknown, ...infer Rest] ? Rest : never) {
      if (String(value.key).startsWith('pendingReceive:')) throw new Error('quota full');
      return put.call(this, value, ...args);
    });
    await expect(wallet.refundNodeToToken(NODE)).rejects.toThrow('quota full');
    expect(await readIdbMeta('pendingSwap')).toEqual(entry!.value);
    expect(await store._getMetaEntries('pendingReceive:')).toEqual([]);
    expect(await readIdbStore('proofs')).toEqual(proofs);
    expect(fetch).not.toHaveBeenCalled();
    fail.mockRestore();
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAcurrent-refund' }));
    await wallet.refundNodeToToken(NODE);
    expect(await readIdbMeta('pendingSwap')).toBeNull();
    expect((await store._getMetaEntries('pendingReceive:')).map(item => item.value)).toEqual([entry!.value]);
    expect(await readIdbStore('proofs')).toEqual(proofs);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps a previous account refund intact while independently refunding the changed account', async () => {
    const wallet = await funded();
    await saveRoutstrSessionKey('sk-original-node-account', NODE);
    globalThis.fetch = vi.fn(async () => { throw new Error('lost refund response'); });
    await expect(wallet.refundNodeToToken(NODE)).rejects.toThrow('lost refund response');
    const pending = await readIdbMeta('pendingNodeRefund');
    const proofs = await readIdbStore('proofs');
    await saveRoutstrSessionKey('sk-replacement-node-account', NODE);
    (fetch as Mock<typeof realFetch>).mockClear();
    const reloaded = await loadWallet() as SecurityWalletOperations;
    await reloaded.setMintUrl('https://mint.other.test/Bitcoin');
    expect(await reloaded.getMintUrl()).toBe('https://mint.other.test/Bitcoin');
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(pending);
    expect(await readIdbStore('proofs')).toEqual(proofs);
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuAreplacement-refund' }));
    const currentRefund = await reloaded.refundNodeToToken(NODE);
    expect(currentRefund).toMatchObject({ key: 'sk-replacement-node-account', token: 'cashuAreplacement-refund' });
    expect(currentRefund.recoveryId).toMatch(/^pendingNodeRefund:/);
    expect(fetch).toHaveBeenCalledWith(NODE + '/v1/wallet/refund', expect.objectContaining({ headers: { Authorization: 'Bearer sk-replacement-node-account' } }));
    expect(getRoutstrSessionKey(NODE)).toBe('sk-replacement-node-account');
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['pendingSwap', 'pendingFeeMelt'])('still blocks %s when an independent node refund is also retained', async key => {
    const wallet = await funded();
    const store = await import('../js/cashu-wallet-store.js');
    const refund = { nodeUrl: NODE, key: 'sk-saved-account', createdAt: 1 };
    const operation = { mint: MINT, operation: 'send' };
    await store._setMeta('pendingNodeRefund', refund);
    await store._setMeta(key, operation);
    const proofs = await readIdbStore('proofs');
    await expect(wallet.setMintUrl('https://mint.other.test/Bitcoin')).rejects.toThrow('pending wallet operation');
    expect(await wallet.getMintUrl()).toBe(MINT);
    expect(await readIdbMeta('pendingNodeRefund')).toEqual(refund);
    expect(await readIdbMeta(key)).toEqual(operation);
    expect(await readIdbStore('proofs')).toEqual(proofs);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks a node refund before HTTP if durable storage is unavailable', async () => {
    const wallet = await funded(); await saveRoutstrSessionKey('sk-node', NODE);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: {key?: unknown; value?: {token?: unknown}}, ...args: Parameters<IDBObjectStore['put']> extends [unknown, ...infer Rest] ? Rest : never) {
      if (value.key === 'pendingNodeRefund') throw new Error('quota full');
      return put.call(this, value, ...args);
    });
    await expect(wallet.refundNodeToToken(NODE)).rejects.toThrow('quota full');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps refunds independent of outgoing tokens and exposes tokens when post-refund storage fails', async () => {
    const wallet = await funded(); await saveRoutstrSessionKey('sk-node', NODE);
    const sent = await wallet.sendAsToken(5);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: {key?: unknown; value?: {token?: unknown}}, ...args: Parameters<IDBObjectStore['put']> extends [unknown, ...infer Rest] ? Rest : never) {
      if (value.key === 'pendingNodeRefund' && value.value?.token) throw new Error('quota full');
      return put.call(this, value, ...args);
    });
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuArefund' }));
    await expect(wallet.refundNodeToToken(NODE)).rejects.toMatchObject({ recoveryToken: 'cashuArefund' });
    expect(await wallet.recoverPendingWithdraw()).toBe(sent.token);
    expect(await wallet.getPendingNodeRefund()).toMatchObject({ key: 'sk-node', nodeUrl: NODE });
  });
  it('atomically settles a saved refund when receive completes and retains the node credential', async () => {
    const wallet = await funded(); await saveRoutstrSessionKey('sk-node', NODE);
    globalThis.fetch = vi.fn(async () => jsonResponse({ token: 'cashuArefund' }));
    const pending = await wallet.refundNodeToToken(NODE);
    expect(fetch).toHaveBeenCalledWith(NODE + '/v1/wallet/refund', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer sk-node' }, redirect: 'error',
    }));
    await wallet.receiveToken(pending.token);
    expect(await wallet.getPendingNodeRefund()).toBeNull();
    await wallet.finishNodeRefund(pending.token);
    expect(getRoutstrSessionKey(NODE)).toBe('sk-node');
  });
  it('submits ordinary paid inference only once after an ambiguous network failure', async () => {
    await saveRoutstrSessionKey('sk-node', NODE); setSelectedNodeUrl(NODE);
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const { callRoutstrAPI } = await import('../js/api-routstr.js');
    await expect(callRoutstrAPI({ modelOverride: 'test-model', messages: [{ role: 'user', content: 'Synthetic request' }], maxTokens: 8, forceNonStream: true, requestRetries: 5 })).rejects.toThrow('Failed to fetch');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as Mock<typeof realFetch>).mock.calls[0]![0]).toBe(NODE + '/v1/chat/completions');
  });
  it('reuses discovered nodes after selection and expires or explicitly refreshes the five-minute cache', async () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const announcement = signedEvent(1);
    let connections = 0;
    class Relay {
      declare onopen: () => void;
      declare onmessage: (event: { data: string }) => void;
      constructor() { connections++; queueMicrotask(() => this.onopen()); }
      send(raw: string) {
        const sub = (JSON.parse as (text: string) => unknown[])(raw)[1];
        this.onmessage({ data: JSON.stringify(['EVENT', sub, announcement]) });
        this.onmessage({ data: JSON.stringify(['EOSE', sub]) });
      }
      close() {}
    }
    vi.stubGlobal('WebSocket', Relay);
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [{ id: 'fixture-model' }] }));
    const first = await discoverNodes();
    expect(first).toHaveLength(1);
    expect(first[0]!.online).toBe(true);
    setSelectedNodeUrl('https://node-2.test');
    expect(await discoverNodes()).toBe(first);
    expect(connections).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(1);
    const refreshed = await discoverNodes(true);
    expect(refreshed).not.toBe(first);
    expect(connections).toBe(8);
    now += 5 * 60 * 1000 + 1;
    expect(await discoverNodes()).not.toBe(refreshed);
    expect(connections).toBe(12);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('shares relay and health checks when Browse or refresh is requested during discovery', async () => {
    const announcement = signedEvent(1);
    let connections = 0;
    class Relay {
      declare onopen: () => void;
      declare onmessage: (event: { data: string }) => void;
      constructor() { connections++; queueMicrotask(() => this.onopen()); }
      send(raw: string) {
        const sub = (JSON.parse as (text: string) => unknown[])(raw)[1];
        this.onmessage({ data: JSON.stringify(['EVENT', sub, announcement]) });
        this.onmessage({ data: JSON.stringify(['EOSE', sub]) });
      }
      close() {}
    }
    vi.stubGlobal('WebSocket', Relay);
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [{ id: 'fixture-model' }] }));
    const [first, reopened, refresh] = await Promise.all([discoverNodes(), discoverNodes(), discoverNodes(true)]);
    expect(reopened).toBe(first);
    expect(refresh).toBe(first);
    expect(connections).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not let an invalidated discovery replace a newer cache or clear its active search', async () => {
    const announcement = signedEvent(1);
    class Relay {
      declare onopen: () => void;
      declare onmessage: (event: { data: string }) => void;
      constructor() { queueMicrotask(() => this.onopen()); }
      send(raw: string) {
        const sub = (JSON.parse as (text: string) => unknown[])(raw)[1];
        this.onmessage({ data: JSON.stringify(['EVENT', sub, announcement]) });
        this.onmessage({ data: JSON.stringify(['EOSE', sub]) });
      }
      close() {}
    }
    vi.stubGlobal('WebSocket', Relay);
    let finishOld!: (response: Response) => void;
    globalThis.fetch = vi.fn<typeof realFetch>()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockResolvedValue(jsonResponse({ data: [{ id: 'new-model' }] }));
    const oldSearch = discoverNodes();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    clearNodeCache();
    const newNodes = await discoverNodes();
    finishOld(jsonResponse({ data: [{ id: 'old-model' }] }));
    expect((await oldSearch)[0]!.models[0]!.id).toBe('old-model');
    expect(newNodes[0]!.models[0]!.id).toBe('new-model');
    expect(await discoverNodes()).toBe(newNodes);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects forged announcements and keeps two signed operators with the same name distinct', async () => {
    const a = signedEvent(1), b = signedEvent(2);
    const forged = { ...a, content: '{"name":"Attacker"}', created_at: a.created_at + 1 };
    expect(verifyRoutstrAnnouncement(a)).toBe(true);
    expect(verifyRoutstrAnnouncement(forged)).toBe(false);
    class Relay {
      declare onopen: () => void;
      declare onmessage: (event: {data: string}) => void;
      constructor() { queueMicrotask(() => this.onopen()); }
      send(raw: string) { const sub = (JSON.parse as (text: string) => unknown[])(raw)[1]; for (const event of [a, forged, b]) this.onmessage({ data: JSON.stringify(['EVENT', sub, event]) }); this.onmessage({ data: JSON.stringify(['EOSE', sub]) }); }
      close() {}
    }
    vi.stubGlobal('WebSocket', Relay);
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [] }));
    const nodes = await discoverNodes(true);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map(n => n.pubkey)).size).toBe(2);
  });
});


describe('node session reset deposit ownership', () => {
  it.each(['queued','submitted','completed'] as const)('resets another node while preserving its %s deposit and credential across reload', async stage => {
    const wallet=await funded(1000),origin='https://origin-node.test';
    const store=await import('../js/cashu-wallet-store.js');
    const {getArchivedRoutstrSessionKeys}=await import('../js/routstr-session.js');
    await saveRoutstrSessionKey('sk-origin',origin);await saveRoutstrSessionKey('sk-target',NODE);
    const deposit={nodeUrl:origin+'/',token:'cashuAorigin-deposit',existingKey:'sk-origin',createdAt:1,submitted:stage!=='queued',completed:stage==='completed'};
    await store._setMeta('pendingDeposit',deposit);
    const rows=await readIdbStore('proofs');
    await wallet.startNewNodeSession(NODE);
    expect(getRoutstrSessionKey(NODE)).toBe('');expect(getArchivedRoutstrSessionKeys(NODE)).toEqual(['sk-target']);
    expect(getRoutstrSessionKey(origin)).toBe('sk-origin');expect(getArchivedRoutstrSessionKeys(origin)).toEqual([]);
    expect(await readIdbMeta('pendingDeposit')).toEqual(deposit);expect(await readIdbStore('proofs')).toEqual(rows);
    clearKeyCache();await decryptKeyCache();
    const reloaded=await loadWallet() as SecurityWalletOperations;
    expect(getRoutstrSessionKey(origin)).toBe('sk-origin');expect(getRoutstrSessionKey(NODE)).toBe('');
    expect(getArchivedRoutstrSessionKeys(NODE)).toEqual(['sk-target']);expect(await readIdbMeta('pendingDeposit')).toEqual(deposit);
    expect(await reloaded.getWalletBalance()).toBe(1000);expect(fetch).not.toHaveBeenCalled();
  });
  it.each([NODE+'/',NODE.toUpperCase()])('blocks reset for a canonical alias of the same deposit owner: %s', async owner => {
    const wallet=await funded(),store=await import('../js/cashu-wallet-store.js');
    const {getArchivedRoutstrSessionKeys}=await import('../js/routstr-session.js');
    await saveRoutstrSessionKey('sk-target',NODE);const deposit={nodeUrl:owner,token:'cashuApending',existingKey:'sk-target'};
    await store._setMeta('pendingDeposit',deposit);const rows=await readIdbStore('proofs');
    await expect(wallet.startNewNodeSession(NODE)).rejects.toThrow('pending deposit');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-target');expect(getArchivedRoutstrSessionKeys(NODE)).toEqual([]);
    expect(await readIdbMeta('pendingDeposit')).toEqual(deposit);expect(await readIdbStore('proofs')).toEqual(rows);expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['cashuAlegacy',{}, {nodeUrl:42}, {nodeUrl:'http://origin-node.test'}, {nodeUrl:'https://user:secret@origin-node.test'}])('retains ambiguous or malformed deposit ownership without resetting a session: %j', async deposit => {
    const wallet=await funded(),store=await import('../js/cashu-wallet-store.js');
    const {getArchivedRoutstrSessionKeys}=await import('../js/routstr-session.js');
    await saveRoutstrSessionKey('sk-target',NODE);await store._setMeta('pendingDeposit',deposit);
    await expect(wallet.startNewNodeSession(NODE)).rejects.toThrow('pending deposit');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-target');expect(getArchivedRoutstrSessionKeys(NODE)).toEqual([]);
    expect(await readIdbMeta('pendingDeposit')).toEqual(deposit);expect(fetch).not.toHaveBeenCalled();
  });
});
