// Node custody transitions retain their token/credential before and after HTTP.
import { _getMeta, _setMeta } from './cashu-wallet-store.js';
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
  const record = { nodeUrl, token, recoveryToken: token, localCommit: true, existingKey, createdAt: Date.now() };
  await _setMeta('pendingDeposit', record);
  return submitRoutstrDeposit(record);
}

export async function requestNodeRefund(nodeUrl: unknown): Promise<NodeRefund & { token: string }> {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  const key = getRoutstrSessionKey(nodeUrl as string);
  if (!key) throw new Error('No credential for this node');
  const pending = await _getMeta('pendingNodeRefund') as NodeRefund | null;
  if (pending && (pending.nodeUrl !== nodeUrl || pending.key !== key)) throw new Error('Recover the existing node refund first');
  if (pending?.token) return pending as NodeRefund & { token: string };
  const record = pending || { nodeUrl: nodeUrl as string, key, createdAt: Date.now() };
  // Separate from outgoing Cashu/Lightning journals. A full/locked store fails
  // before money moves. Explicit retry uses the same node/account record.
  await _setMeta('pendingNodeRefund', record);
  const response = await fetchNodePayment(nodeUrl + '/v1/wallet/refund', { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
  if (!response.ok) throw new Error(`Node refund returned HTTP ${response.status}. Its outcome is unconfirmed; retry recovery for this node.`);
  const data = await response.json() as RefundFields | string | null;
  const token = (data as RefundFields | null)?.token || (data as RefundFields | null)?.cashu_token || (typeof data === 'string' ? data : '');
  if (!/^cashu[AB]/.test(token)) throw new Error('Node did not return a Cashu refund token');
  const result = { ...record, token };
  try { await _setMeta('pendingNodeRefund', result); }
  catch (cause) {
    const error = new Error('Refund received but could not be saved. Copy the recovery token before leaving this screen.', { cause });
    Object.assign(error, { recoveryToken: token, nodeUrl });
    throw error;
  }
  return result;
}
export async function completeNodeRefund(token: string) {
  const record = await _getMeta('pendingNodeRefund') as NodeRefund | null;
  if (!record) return;
  if (record.token !== token) throw new Error('Refund recovery record changed');
  // Keep the node credential: partial/sub-sat balances and in-flight use may
  // still exist. Refunding is not authority to delete another session.
  await _setMeta('pendingNodeRefund', null);
}
