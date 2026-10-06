// provider-wallet-panel-renderers.js - Routstr/Cashu wallet action markup

import { escapeHTML, escapeAttr } from './utils.js';
import type { RoutstrNode } from './nostr-discovery.js';

type WalletMintInventoryEntry = Awaited<ReturnType<typeof import('./cashu-wallet.js').getWalletMints>>[number];
export type WalletMintPanelEntry = Pick<WalletMintInventoryEntry, 'mint'> & { balance?: unknown; active?: unknown };
export interface WalletMintRowOptions { balance?: unknown; active?: unknown; accepted?: unknown; action?: unknown }
export type RoutstrNodePanelReader = Pick<RoutstrNode, 'urls'> & {
  [Field in keyof Pick<RoutstrNode, 'name' | 'modelCount' | 'onion' | 'pubkey'>]?: unknown;
} & { models?: Array<{ id?: RoutstrNode['models'][number]['id'] } | null | undefined> | null | undefined };


export function walletMintRowHtml(mint: WalletMintInventoryEntry['mint'], { balance = null, active = false, accepted = false, action = 'set-mint-input' }: WalletMintRowOptions = {}) {
  return `<button type="button" class="routstr-mint-row" data-routstr-wallet-action="${escapeAttr(action)}" data-mint-url="${escapeAttr(mint)}"${action === 'set-mint-input' ? ` aria-pressed="${active}"` : ''}>
    <span class="routstr-mint-row-copy">
      <span class="routstr-mint-name">${escapeHTML(mint.replace(/^https?:\/\//, ''))}</span>
      ${active || accepted ? `<span class="routstr-mint-tags">${active ? '<span class="routstr-mint-current">Current mint</span>' : ''}${accepted ? '<span>Accepted by node</span>' : ''}</span>` : ''}
    </span>
    ${balance !== null ? `<span class="routstr-mint-amount">${Number(balance).toLocaleString()} <span>sats</span></span>` : ''}
    <span class="routstr-mint-choice" aria-hidden="true">${action === 'set-mint-input' ? '✓' : '›'}</span>
  </button>`;
}

export function routstrNodePickerRowHtml(node: RoutstrNodePanelReader) {
  const url = node.urls[0] || '';
  const domain = escapeHTML(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  const label = escapeHTML(node.name || domain);
  const models = node.modelCount + ' model' + (node.modelCount !== 1 ? 's' : '');
  const hasPrivateTee = (node.models || []).some(model => String(model!.id || '').startsWith('tinfoil-'));
  const privateTee = hasPrivateTee ? ' <span style="font-size:9px;color:var(--green);font-weight:600">&#128274; Advertises Private TEE</span>' : '';
  const onion = node.onion ? ' <span style="font-size:10px" title="Tor available">\ud83e\udde5</span>' : '';
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
    <div><span style="font-size:12px;font-weight:500">${label}</span>${onion}${privateTee}<br><span style="font-size:10px;color:var(--text-muted)">${domain} \u00b7 ${models}<br>Operator: ${escapeHTML(node.pubkey || 'unknown')}</span></div>
    <button class="import-btn import-btn-primary"  data-routstr-wallet-action="connect-node" data-node-url="${escapeAttr(url)}">Connect</button>
  </div>`;
}

export function walletWithdrawHtml(balance: unknown) {
  return `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Withdraw</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${(balance as { toLocaleString: () => unknown }).toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="withdraw-lightning">\u26a1 Lightning</button>
      <button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="withdraw-token">Cashu Token</button>
    </div>
    <div id="routstr-withdraw-status"></div>
  </div>`;
}

export function walletWithdrawLightningHtml() {
  return `<div style="margin-top:4px">
    <input type="text" class="api-key-input" id="routstr-withdraw-input" placeholder="Lightning address (user@domain) or invoice (lnbc...)" style="font-size:11px;font-family:monospace">
    <div id="routstr-withdraw-ln-amount" style="display:none;margin-top:4px">
      <div style="display:flex;gap:4px;align-items:center">
        <input type="number" class="api-key-input" id="routstr-withdraw-amount" placeholder="sats" style="font-size:11px;flex:1" min="1">
        <button class="import-btn import-btn-secondary" style="background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="withdraw-max">Max</button>
      </div>
    </div>
    <button class="import-btn import-btn-primary" style="margin-top:6px;width:100%" data-routstr-wallet-action="withdraw-quote">Withdraw</button>
  </div>`;
}

export function walletWithdrawTokenHtml(balance: unknown, presets: unknown[]) {
  return `<div style="margin-top:4px">
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Send as Cashu token</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-token-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${balance}">
      <button class="import-btn import-btn-primary" style="white-space:nowrap" data-routstr-wallet-action="send-token-input">Send</button>
    </div>
    ${(balance as number) > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(value => `<button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="send-token-preset" data-amount="${value}">\u26a1 ${(value as { toLocaleString: () => unknown }).toLocaleString()}</button>`).join('')}
      <button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="send-token-preset" data-amount="${balance}">All (${(balance as { toLocaleString: () => unknown }).toLocaleString()})</button>
    </div>` : '<div style="font-size:11px;color:var(--text-muted)">No balance to withdraw</div>'}
    <div id="routstr-token-result"></div>
  </div>`;
}
