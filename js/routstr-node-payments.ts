// Node custody transitions retain their token/credential before and after HTTP.
import { _getMeta, _setMeta, _getMetaEntries, _digestStorageKey } from './cashu-wallet-store.js';
import { canonicalRoutstrUrl, tokenAccountKey } from './routstr-validation.js';
import { getRoutstrSessionKey, saveRoutstrSessionKey } from './routstr-session.js';

import type { PendingDeposit, NodeRefund } from './cashu-wallet-storage-types.js';
interface NodePaymentResponse extends Record<string, unknown> { api_key?: unknown }
interface RefundFields { token?: string; cashu_token?: string }

export async function fetchNodePayment(url: RequestInfo | URL, options: RequestInit = {}) {
  return fetch(url, { ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
}
function responseKey(response: NodePaymentResponse | null | undefined) {
  if (typeof response?.api_key !== 'string' || !/^sk-[A-Za-z0-9_-]+$/.test(response.api_key)) throw new Error('Node did not return a valid account key');
  return response.api_key;
}
async function commitDeposit(record: PendingDeposit, response: NodePaymentResponse | null | undefined) {
  const apiKey = record.existingKey || responseKey(response);
  // A top-up cannot replace the account that owns the pre-existing balance.
  if (response?.api_key && record.existingKey && response.api_key !== record.existingKey) throw new Error('Node returned a different account for this top-up');
  await _setMeta('pendingDeposit', { ...record, apiKey, completed: true });
  await saveRoutstrSessionKey(apiKey, record.nodeUrl, record.existingKey || '');
  await _setMeta('pendingDeposit', null);
  return { ...response, api_key: apiKey };
}
/** Check authentication before swapping local wallet proofs into a deposit. */
export async function verifyNodeDepositSession(nodeUrl: string, key: string) {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  if (!key) return;
  if (!/^sk-[A-Za-z0-9_-]+$/.test(key)) throw new Error('This legacy node credential needs reconciliation before another deposit. Wallet funds were not moved.');
  const response = await fetchNodePayment(nodeUrl + '/v1/balance/info', { headers: { Authorization: 'Bearer ' + key } });
  if (!response.ok) {
    const error = new Error(`Node session check returned HTTP ${response.status}. Wallet funds were not moved.`);
    Object.assign(error, { nodeSessionRejected: response.status === 401 || response.status === 403 });
    throw error;
  }
  const info = await response.json() as { api_key?: unknown; balance?: unknown } | null;
  if (!info || typeof info.balance !== 'number' || !Number.isFinite(info.balance)
    || (info.api_key !== undefined && info.api_key !== key)) throw new Error('Node returned an invalid session check. Wallet funds were not moved.');
  if (getRoutstrSessionKey(nodeUrl) !== key) throw new Error('Node session changed before this deposit. Wallet funds were not moved.');
}

export async function prepareNewNodeSession(nodeUrl: string) {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  const deposit = await _getMeta('pendingDeposit');
  let depositNode: string | undefined;
  if (deposit && typeof deposit === 'object') {
    const recordedNode = (deposit as { nodeUrl?: unknown }).nodeUrl;
    if (typeof recordedNode === 'string') {
      try { depositNode = canonicalRoutstrUrl(recordedNode); } catch {}
    }
  }
  // A reset cannot change the credential needed to finish this node's deposit.
  // An unrelated, explicitly bound journal and its origin key remain untouched.
  if (deposit && (!depositNode || depositNode === nodeUrl)) throw new Error('Recover or reconcile the pending deposit before starting a new node session.');
  const key = getRoutstrSessionKey(nodeUrl);
  if (key) await saveRoutstrSessionKey('', nodeUrl, key, true);
}

export async function submitRoutstrDeposit(record: PendingDeposit) {
  const nodeUrl = canonicalRoutstrUrl(record.nodeUrl);
  const boundKey = getRoutstrSessionKey(nodeUrl);
  if (record.existingKey && record.existingKey !== boundKey) throw new Error('Deposit credential does not belong to this node session');
  record = { ...record, nodeUrl, candidateKey: record.existingKey || tokenAccountKey(record.token), submitted: true };
  // Persist the deterministic candidate credential before the first request.
  // Routstr Core hashes the exact Cashu token to derive its account key.
  await _setMeta('pendingDeposit', record);
  const response = await fetchNodePayment(nodeUrl + (record.existingKey ? '/v1/balance/topup' : '/v1/balance/create'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(record.existingKey ? { Authorization: 'Bearer ' + record.existingKey } : {}) },
    body: JSON.stringify(record.existingKey ? { cashu_token: record.token } : { initial_balance_token: record.token }),
  });
  if (!response.ok) throw new Error(`Node deposit returned HTTP ${response.status}. Its outcome is unconfirmed; check recovery before retrying.`);
  return commitDeposit(record, await response.json() as NodePaymentResponse);
}
export async function reconcileRoutstrDeposit() {
  const record = await _getMeta('pendingDeposit') as PendingDeposit | string | null;
  if (!record || typeof record === 'string') return record;
  if (record.completed && record.apiKey) {
    await commitDeposit(record, { api_key: record.apiKey });
    return null;
  }
  if (record.submitted && !record.existingKey && record.candidateKey) {
    const response = await fetchNodePayment(canonicalRoutstrUrl(record.nodeUrl) + '/v1/balance/info', { headers: { Authorization: 'Bearer ' + record.candidateKey } });
    if (response.ok) {
      const info = await response.json() as NodePaymentResponse;
      if (responseKey(info) !== record.candidateKey) throw new Error('Recovered node account does not match the deposit');
      await commitDeposit(record, info);
      return null;
    }
  }
  return record;
}
export async function depositExternalTokenToNode(nodeUrl: string, token: string) {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  if (await _getMeta('pendingDeposit') as PendingDeposit | string | null) throw new Error('Reconcile the previous node deposit before importing another token');
  const existingKey = getRoutstrSessionKey(nodeUrl);
  await verifyNodeDepositSession(nodeUrl, existingKey);
  const record = { nodeUrl, token, recoveryToken: token, localCommit: true, existingKey, createdAt: Date.now() };
  await _setMeta('pendingDeposit', record);
  return submitRoutstrDeposit(record);
}

export async function requestNodeRefund(nodeUrl: unknown, recoveryId?: string, recoveryToken?: string, generation?: string): Promise<NodeRefund & { token: string; recoveryId: string }> {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  let key = getRoutstrSessionKey(nodeUrl as string);
  let journalKey: string;
  let pending: NodeRefund | null;
  if (recoveryId) {
    if (!/^pendingNodeRefund(?::[a-f0-9]{64})?$/.test(recoveryId)) throw new Error('Invalid refund recovery record');
    journalKey = recoveryId;
    pending = await _getMeta(journalKey) as NodeRefund | null;
    if (!pending || pending.nodeUrl !== nodeUrl || !pending.key) throw new Error('Saved refund recovery is unavailable for this node');
    if (!generation || pending.generation !== generation) throw new Error('Refund recovery record changed; reopen saved refunds before retrying');
    key = pending.key;
  } else {
    if (!key) throw new Error('No credential for this node');
    const legacy = await _getMeta('pendingNodeRefund') as NodeRefund | null;
    const scopedKey = 'pendingNodeRefund:' + await _digestStorageKey(String(nodeUrl) + '\n' + key);
    const scoped = await _getMeta(scopedKey) as NodeRefund | null;
    const differentSession = legacy && (legacy.nodeUrl !== nodeUrl || legacy.key !== key);
    journalKey = scoped || differentSession ? scopedKey : 'pendingNodeRefund';
    pending = await _getMeta(journalKey) as NodeRefund | null;
    if (pending && (pending.nodeUrl !== nodeUrl || pending.key !== key)) throw new Error('Refund record does not belong to this node session');
  }
  if (pending && !pending.generation) {
    pending = { ...pending, generation: crypto.randomUUID() };
    await _setMeta(journalKey, pending);
  }
  if (recoveryToken) {
    if (!recoveryId || !pending || !/^cashu[AB]/.test(recoveryToken) || (pending.token && pending.token !== recoveryToken)) throw new Error('Refund token does not match this recovery record');
    // A prior HTTP response can contain a token even if its final save failed.
    // Save that same token before receiving it; never issue another refund.
    pending = { ...pending, token: recoveryToken };
    await _setMeta(journalKey, pending);
  }
  if (pending?.token) return { ...pending, token: pending.token, recoveryId: journalKey };
  const record = pending || { nodeUrl: nodeUrl as string, key, createdAt: Date.now(), generation: crypto.randomUUID() };
  // Separate from outgoing Cashu/Lightning journals. A full/locked store fails
  // before money moves. Explicit retry uses the same node/account record.
  await _setMeta(journalKey, record);
  try {
    const response = await fetchNodePayment(nodeUrl + '/v1/wallet/refund', { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
    if (!response.ok) throw new Error(`Node refund returned HTTP ${response.status}. Its outcome is unconfirmed; retry recovery for this node.`);
    const data = await response.json() as RefundFields | string | null;
    const token = (data as RefundFields | null)?.token || (data as RefundFields | null)?.cashu_token || (typeof data === 'string' ? data : '');
    if (!/^cashu[AB]/.test(token)) throw new Error('Node did not return a Cashu refund token');
    const result = { ...record, token };
    try { await _setMeta(journalKey, result); }
    catch (cause) {
      const error = new Error('Refund received but could not be saved. Copy the recovery token before leaving this screen.', { cause });
      Object.assign(error, { recoveryToken: token, nodeUrl, recoveryId: journalKey, createdAt: record.createdAt, generation: record.generation });
      throw error;
    }
    return { ...result, recoveryId: journalKey };
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { recoveryId: journalKey, nodeUrl, createdAt: record.createdAt, generation: record.generation });
    throw error;
  }
}
export async function completeNodeRefund(token: string) {
  const entries = await _getMetaEntries('pendingNodeRefund');
  const matching = entries.filter(entry => (entry.value as NodeRefund | null)?.token === token);
  // Receive already clears its matching journal atomically with the proofs.
  // Finishing again must leave other accounts' recovery records untouched.
  // Keep all unrelated refunds and every node credential.
  for (const entry of matching) await _setMeta(entry.key, null);
}
export async function pendingNodeRefundForSession() {
  const legacy = await _getMeta('pendingNodeRefund') as NodeRefund | null;
  const nodeUrl = localStorage.getItem('labcharts-routstr-node');
  const key = getRoutstrSessionKey(nodeUrl);
  if (nodeUrl && key) {
    const current = await _getMeta('pendingNodeRefund:' + await _digestStorageKey(canonicalRoutstrUrl(nodeUrl) + '\n' + key)) as NodeRefund | null;
    if (current) return current;
  }
  return legacy && nodeUrl && legacy.nodeUrl === canonicalRoutstrUrl(nodeUrl) && legacy.key === key ? legacy : null;
}

export async function pendingNodeRefundsForNode(nodeUrl?: unknown) {
  const node = nodeUrl === undefined ? null : canonicalRoutstrUrl(nodeUrl);
  const records: Array<NodeRefund & { recoveryId: string }> = [];
  for (const entry of await _getMetaEntries<NodeRefund>('pendingNodeRefund')) {
    if (!entry.value || (node && entry.value.nodeUrl !== node)) continue;
    const record = entry.value.generation ? entry.value : { ...entry.value, generation: crypto.randomUUID() };
    if (record !== entry.value) await _setMeta(entry.key, record);
    records.push({ ...record, recoveryId: entry.key });
  }
  return records;
}
