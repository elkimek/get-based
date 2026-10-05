import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { getErrorMessage } from './caught-error.js';
import { canonicalRoutstrUrl } from './routstr-validation.js';

export interface RefundIdentity { nodeUrl?: unknown; createdAt?: unknown; mint?: unknown; recoveryId?: unknown; generation?: unknown }
export function refundRecoveryHtml(error: unknown, token: unknown, target: unknown, identity: RefundIdentity) {
  const node = typeof identity.nodeUrl === 'string' ? identity.nodeUrl : typeof target === 'string' ? target : '';
  const mint = typeof identity.mint === 'string' ? identity.mint : '';
  const savedAt = typeof identity.createdAt === 'number' && Number.isSafeInteger(identity.createdAt) && identity.createdAt > 0
    ? new Date(identity.createdAt).toLocaleString() : '';
  const details = [node ? 'Node: ' + escapeHTML(node) : '', mint ? 'Token mint: ' + escapeHTML(mint) : '', savedAt ? 'Saved: ' + escapeHTML(savedAt) : ''].filter(Boolean).join('<br>');
  return '<div class="routstr-wallet-message routstr-wallet-message-error" role="status">' + escapeHTML(getErrorMessage(error)) + '</div>'
    + (token ? '<p class="routstr-wallet-help"><strong>Saved refund recovery</strong><br>' + details
      + '<br>This saved refund is separate from any later node deposit.</p><p class="routstr-wallet-help" id="routstr-refund-token-hint">Keep this refund token until recovery succeeds.</p>'
      + '<textarea class="api-key-input routstr-refund-token" aria-label="Node refund recovery token" aria-describedby="routstr-refund-token-hint" readonly>' + escapeHTML(token) + '</textarea>' : '')
    + (identity.recoveryId && identity.generation ? '<button class="import-btn import-btn-primary" data-routstr-wallet-action="resume-node-refund" data-node-url="' + escapeAttr(node) + '" data-recovery-id="' + escapeAttr(identity.recoveryId) + '" data-token="' + escapeAttr(token || '') + '" data-generation="' + escapeAttr(identity.generation) + '">Retry refund recovery</button>' : '');
}
export function nodeSessionRejectedHtml(nodeUrl: string) {
  return '<p class="routstr-wallet-help">The node rejected this saved session. You can start a new session; the previous key and recovery records will be preserved.</p>'
    + '<button class="import-btn import-btn-secondary" data-routstr-wallet-action="new-node-session" data-node-url="' + escapeAttr(nodeUrl) + '">Start a new node session</button>';
}

export async function startNewNodeSessionView(nodeUrl: string, reset: (node: string) => Promise<unknown>, renderDeposit: (node: string) => Promise<void>) {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  const picker = document.getElementById('routstr-node-picker');
  try {
    await reset(nodeUrl);
    await renderDeposit(nodeUrl);
    showNotification('Previous node session preserved. Your next deposit creates a new session.', 'success');
  } catch (error) { if (picker) picker.textContent = getErrorMessage(error); }
}

import type { WalletOperations } from '../types/provider-wallet-panels.js';
import { walletRuntime } from './provider-wallet-runtime.js';
let nodeRefundInFlight = false;
export async function withdrawNodeToWallet(nodeUrl: unknown, recoveryId: string | undefined, recoveryToken: string | undefined, generation: string | undefined, ensureSeed: (resume: () => unknown) => Promise<unknown>, refreshWallet: () => unknown, refreshNode: () => unknown) {
  if (nodeRefundInFlight) return;
  const runtime = walletRuntime as WalletOperations;
  const target = typeof nodeUrl === 'string' ? nodeUrl : runtime.nostrGetSelectedNode?.();
  if (!await runtime.cashuHasWalletSeed?.()) {
    await ensureSeed(() => withdrawNodeToWallet(target, recoveryId, recoveryToken, generation, ensureSeed, refreshWallet, refreshNode));
    return;
  }
  if (nodeRefundInFlight) return;
  nodeRefundInFlight = true;
  const picker = document.getElementById('routstr-node-picker');
  if (picker) { picker.style.display = 'block'; picker.dataset.mode = 'refund'; picker.textContent = 'Checking node refund…'; }
  let token: unknown = recoveryToken || '';
  let identity: RefundIdentity = { recoveryId, generation };
  try {
    const refund = await runtime.cashuRefundNodeToToken(target, recoveryId, recoveryToken, generation) as RefundIdentity & { token?: unknown };
    token = refund.token;
    identity = { nodeUrl: refund.nodeUrl, createdAt: refund.createdAt, recoveryId: refund.recoveryId, generation: refund.generation };
    if (typeof token === 'string') identity.mint = await runtime.cashuGetTokenMintUrl(token);
    const result = await runtime.cashuReceiveToken(token as string) as { received?: unknown };
    await runtime.cashuFinishNodeRefund(token as string);
    showNotification('Withdrawn ⚡ ' + Number(result.received).toLocaleString() + ' sats to wallet', 'success');
    if (picker) picker.textContent = 'Node refund received in your wallet.';
    refreshWallet(); refreshNode();
  } catch (error) {
    token = token || (error as { recoveryToken?: unknown } | null | undefined)?.recoveryToken || '';
    const recovery = error as RefundIdentity | null | undefined;
    identity = { ...identity, recoveryId: recovery?.recoveryId || identity.recoveryId, nodeUrl: recovery?.nodeUrl || identity.nodeUrl, createdAt: recovery?.createdAt || identity.createdAt, generation: recovery?.generation || identity.generation };
    if (picker) picker.innerHTML = refundRecoveryHtml(error, token, target, identity);
  } finally { nodeRefundInFlight = false; }
}

export async function showSavedNodeRefunds(nodeUrl?: unknown) {
  const picker = document.getElementById('routstr-node-picker');
  if (!picker) return;
  picker.style.display = 'block'; picker.dataset.mode = 'saved-refunds'; picker.textContent = 'Loading saved node refunds…';
  try {
    const runtime = walletRuntime as WalletOperations;
    const saved = await runtime.cashuGetPendingNodeRefunds(nodeUrl) as Array<RefundIdentity & { token?: string; recoveryId: string }>;
    const cards = await Promise.all(saved.map(async record => {
      let mint: unknown;
      try { if (record.token) mint = await runtime.cashuGetTokenMintUrl(record.token); } catch {}
      return refundRecoveryHtml('Saved refund awaits recovery.', record.token, record.nodeUrl, { ...record, mint });
    }));
    if (picker !== document.getElementById('routstr-node-picker') || picker.dataset.mode !== 'saved-refunds') return;
    picker.innerHTML = '<p class="routstr-wallet-help">Saved node refunds. These records do not block other node accounts.</p>'
      + (cards.join('') || '<p class="routstr-wallet-help">No saved refunds.</p>');
  } catch (error) { if (picker.dataset.mode === 'saved-refunds') picker.textContent = getErrorMessage(error); }
}
