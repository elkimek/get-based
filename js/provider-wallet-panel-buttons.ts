// Published HTML compatibility for consumers outside the owned application panel.
// Action definitions and Tailwind controls are shared with RoutstrSettings.
import { escapeAttr } from './utils.js';
import { ROUTSTR_NODE_ACTIONS, ROUTSTR_WALLET_ACTIONS, ROUTSTR_WALLET_MENU } from './routstr-settings-contract.js';
import { PROVIDER_PRIMARY, PROVIDER_SECONDARY } from './provider-settings-classes.js';
const buttonClass = (active: boolean) => 'import-btn ' + (active ? 'import-btn-primary ' + PROVIDER_PRIMARY : 'import-btn-secondary ' + PROVIDER_SECONDARY);
export function buildRoutstrNodeActions(nodeUrl: unknown, hasKey: unknown, active: unknown): string {
  return ROUTSTR_NODE_ACTIONS.filter(action => action.id === 'browse' || !!nodeUrl && (action.id !== 'withdraw' || !!hasKey)).map(action => {
    const node = action.id === 'deposit' ? ` data-node-url="${escapeAttr(nodeUrl)}"` : '';
    return `<button type="button" data-cloud-provider-settings-view class="${buttonClass(action.id === active)}" data-routstr-wallet-action="node-action" data-node-action="${action.id}"${node}>${action.label}</button>`;
  }).join('');
}
export function routstrWalletActionButtons(active: unknown): string {
  const button = (action: { id: string; label: string }, menu = false) => `<button type="button" class="${buttonClass(action.id === active)}${menu ? ' gb:cloud-provider:w-full gb:cloud-provider:text-left' : ''}" data-routstr-wallet-action="wallet-action" data-wallet-action="${action.id}">${action.label}</button>`;
  return `<div data-cloud-provider-settings-view class="gb:cloud-provider:flex gb:cloud-provider:flex-wrap gb:cloud-provider:gap-2">
    ${ROUTSTR_WALLET_ACTIONS.map(action => button(action)).join('')}
    <div class="gb:cloud-provider:relative">
      <button type="button" class="${buttonClass(ROUTSTR_WALLET_MENU.some(action => action.id === active))}" aria-label="More wallet actions" data-routstr-wallet-action="toggle-wallet-menu">⋯</button>
      <div id="routstr-wallet-menu" style="display:none" class="gb:cloud-provider:absolute gb:cloud-provider:right-0 gb:cloud-provider:top-full gb:cloud-provider:z-10 gb:cloud-provider:min-w-48 gb:cloud-provider:rounded-control gb:cloud-provider:border gb:cloud-provider:border-line gb:cloud-provider:bg-secondary-surface gb:cloud-provider:p-2">${ROUTSTR_WALLET_MENU.map(action => button(action, true)).join('')}</div>
    </div>
  </div>`;
}
