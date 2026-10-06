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
