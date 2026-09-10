import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
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
import { discoverNodes, setSelectedNodeUrl, clearNodeCache } from '../js/nostr-discovery.js';

const MINT = 'https://mint.getbased.test/Bitcoin';
const NODE = 'https://node.test';
const realFetch = globalThis.fetch;
let stub;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearKeyCache(); clearNodeCache();
  globalThis.indexedDB = new IDBFactory();
  configureApiProviderStorageRuntimeDeps({ encryptedSetItem: encryptedSetCredentialItem });
  stub = installCashuStub();
  globalThis.fetch = vi.fn(async () => { throw new Error('Unexpected network request'); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); globalThis.fetch = realFetch; });
async function funded(amount = 100) {
  const wallet = await loadWallet();
  await wallet.setMintUrl(MINT);
  stub.receiveProofs = [proof('source', amount)];
  await wallet.receiveToken('cashuAinitial');
  return wallet;
}
function lnurlFetch(invoice) {
  return vi.fn(async url => String(url).includes('/.well-known/')
    ? jsonResponse({ tag: 'payRequest', metadata: LNURL_METADATA, callback: 'https://lnurl.test/pay', minSendable: 1000, maxSendable: 25000000 })
    : jsonResponse({ pr: invoice }));
}
function signedEvent(keyNumber, created = Math.floor(Date.now() / 1000)) {
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
      await _autoMeltFees(attempt === 1 ? [proof('fee-reserve', 120)] : [], MINT);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(attempt));
    }
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(await wallet.getFeeBalance()).toBe(120);
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
    globalThis.__WEARABLES_TEST = true;
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
      expect(JSON.parse(outbound['labcharts-routstr-sessions']).sessions[NODE].key).toBe('sk-synthetic-private');
    } finally {
      await _setTestSessionKey(null); delete globalThis.__WEARABLES_TEST;
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
    stub.meltQuotes.get(quote.quote).amount = 50;
    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('changed');
    expect(await wallet.getWalletBalance()).toBe(100);
    expect(await readIdbMeta('pendingSwap')).toBeNull();
  });
  it.each(['PENDING', 'UNPAID', 'UNKNOWN'])('retains melt recovery and never reports %s as paid', async state => {
    const wallet = await funded();
    const quote = await wallet.createWithdrawQuote(makeTestInvoice(10));
    stub.meltState = state;
    await expect(wallet.executeWithdraw(quote.quote)).rejects.toThrow('not confirmed paid');
    expect(JSON.parse(await readIdbMeta('pendingWithdraw')).meltOutputs).toHaveLength(1);
    await expect(wallet.clearPendingWithdraw()).rejects.toThrow('still unspent or pending');
  });
  it.each([1, 2])('restores selected swap outputs and retains unselected funds (journal version %s)', async version => {
    const wallet = await loadWallet(); await wallet.setMintUrl(MINT);
    stub.receiveProofs = [proof('small', 10), proof('untouched', 90)];
    await wallet.receiveToken('cashuAinitial');
    stub.selectFirst = true; stub.failSwapAfter = true;
    await expect(wallet.sendAsToken(4)).rejects.toThrow('lost swap response');
    const store = await import('../js/cashu-wallet-store.js');
    const journal = await store._getMeta('pendingSwap');
    expect(journal.localInputs.map(p => p.secret)).toEqual(['small']);
    if (version === 1) await store._setMeta('pendingSwap', { ...journal, version: 1, localInputs: [proof('small', 10), proof('untouched', 90)], unselectedProofs: undefined });
    expect(await wallet.getWalletBalance()).toBe(100);
    expect((await readIdbStore('proofs')).some(p => p.secret === 'untouched')).toBe(true);
  });
  it('does not commit a partial set of restored signatures', async () => {
    const wallet = await funded(); stub.failSwapAfter = true;
    await expect(wallet.sendAsToken(4)).rejects.toThrow('lost swap response');
    const journal = await readIdbMeta('pendingSwap');
    stub.signatures.delete(journal.outputs[0].blindedMessage.B_);
    const rows = await readIdbStore('proofs');
    expect(await wallet.recoverPendingWalletOperation()).toMatchObject({ recovered: 0, pending: true });
    expect(await readIdbStore('proofs')).toEqual(rows);
    expect(await readIdbMeta('pendingSwap')).not.toBeNull();
  });
  it('a rejected incoming token leaves existing funds usable and reuses its prepared outputs on retry', async () => {
    const wallet = await funded(); stub.failReceive = true;
    await expect(wallet.receiveToken('cashuAbad')).rejects.toThrow('receive failed');
    const before = (await readIdbStore('meta')).find(r => r.key.startsWith('pendingReceive:'));
    await expect(wallet.sendAsToken(1)).resolves.toMatchObject({ remaining: 99 });
    stub.failReceive = false;
    await wallet.receiveToken('cashuAbad');
    expect(stub.signatures.has(before.value.outputs[0].blindedMessage.B_)).toBe(true);
    expect((await readIdbStore('meta')).find(r => r.key === before.key)).toBeUndefined();
  });
  it.each([1, 2])('recovers a cross-mint receive into the visible wallet after a lost response (version %s)', async version => {
    const wallet = await loadWallet(); await wallet.setMintUrl('https://old-mint.test');
    stub.failSwapAfter = true;
    await expect(wallet.receiveToken('cashuAforeign')).rejects.toThrow('lost swap response');
    expect(await wallet.getMintUrl()).toBe('https://old-mint.test');
    if (version === 1) {
      const store = await import('../js/cashu-wallet-store.js');
      const [entry] = await store._getMetaEntries('pendingReceive:');
      await store._setMeta('pendingSwap', { ...entry.value, version: 1, selectMint: undefined, incomingToken: undefined });
      await store._deleteMeta(entry.key);
    }
    expect(await wallet.getWalletBalance()).toBe(10);
    expect(await wallet.getMintUrl()).toBe(MINT);
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
    globalThis.fetch = vi.fn(async () => {
      await saveRoutstrSessionKey('sk-replacement', NODE);
      return jsonResponse({ balance: 5000 });
    });
    await expect(wallet.depositToNode(NODE, 5)).rejects.toThrow('session changed');
    expect(getRoutstrSessionKey(NODE)).toBe('sk-replacement');
    expect(await readIdbMeta('pendingDeposit')).toMatchObject({ apiKey: 'sk-original', completed: true });
  });
  it('reconciles a lost node-create response with the durable token-derived credential', async () => {
    const wallet = await funded();
    globalThis.fetch = vi.fn(async () => { throw new Error('lost HTTP response'); });
    await expect(wallet.depositToNode(NODE, 5)).rejects.toThrow('lost HTTP response');
    const record = await readIdbMeta('pendingDeposit');
    expect(record.candidateKey).toBe(tokenAccountKey(record.token));
    globalThis.fetch = vi.fn(async () => jsonResponse({ api_key: record.candidateKey, balance: 5000 }));
    expect(await wallet.recoverPendingDeposit()).toBeNull();
    expect(fetch.mock.calls[0][0]).toBe(NODE + '/v1/balance/info');
    expect(getRoutstrSessionKey(NODE)).toBe(record.candidateKey);
  });
  it('journals pasted-token account conversion before submitting it', async () => {
    const wallet = await loadWallet();
    globalThis.fetch = vi.fn(async () => { expect(await readIdbMeta('pendingDeposit')).toMatchObject({ token: 'cashuApasted', submitted: true }); throw new Error('offline'); });
    await expect(wallet.depositTokenToNode(NODE, 'cashuApasted')).rejects.toThrow('offline');
    expect((await readIdbMeta('pendingDeposit')).token).toBe('cashuApasted');
  });
  it('blocks a node refund before HTTP if durable storage is unavailable', async () => {
    const wallet = await funded(); await saveRoutstrSessionKey('sk-node', NODE);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, ...args) {
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
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, ...args) {
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
    expect(fetch.mock.calls[0][0]).toBe(NODE + '/v1/chat/completions');
  });
  it('rejects forged announcements and keeps two signed operators with the same name distinct', async () => {
    const a = signedEvent(1), b = signedEvent(2);
    const forged = { ...a, content: '{"name":"Attacker"}', created_at: a.created_at + 1 };
    expect(verifyRoutstrAnnouncement(a)).toBe(true);
    expect(verifyRoutstrAnnouncement(forged)).toBe(false);
    class Relay {
      constructor() { queueMicrotask(() => this.onopen()); }
      send(raw) { const sub = JSON.parse(raw)[1]; for (const event of [a, forged, b]) this.onmessage({ data: JSON.stringify(['EVENT', sub, event]) }); this.onmessage({ data: JSON.stringify(['EOSE', sub]) }); }
      close() {}
    }
    vi.stubGlobal('WebSocket', Relay);
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [] }));
    const nodes = await discoverNodes(true);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map(n => n.pubkey)).size).toBe(2);
  });
});
