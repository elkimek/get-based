// Published synchronous HTML contracts use the same Svelte owner as Settings.
import { escapeAttr } from './utils.js';
import { renderHTML } from './components/RoutstrActions.svelte.html.js';
import { installRoutstrActionHydration, routstrActionsState } from './routstr-actions-component.js';
import type { RoutstrActionsState } from './routstr-actions-contract.js';
function renderActions(state: RoutstrActionsState): string {
  installRoutstrActionHydration();
  return `<div data-routstr-actions-host data-routstr-actions-kind="${state.kind}" data-node-url="${escapeAttr(state.node)}" data-connected="${state.connected}" data-active="${state.active || ''}">${renderHTML({ state })}</div>`;
}
export function buildRoutstrNodeActions(nodeUrl: unknown, hasKey: unknown, active: unknown): string { return renderActions(routstrActionsState('node', nodeUrl, hasKey, active)); }
export function routstrWalletActionButtons(active: unknown): string { return renderActions(routstrActionsState('wallet', '', false, active)); }
