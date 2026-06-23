// @ts-check
// provider-wallet-panel-buttons.js - Routstr wallet/node action button renderers

import { escapeAttr } from './utils.js';

export function buildRoutstrNodeActions(nodeUrl, hasKey, active) {
  const _pill = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const _activePill = 'font-size:11px;padding:3px 10px';
  const btns = [];
  if (nodeUrl) btns.push({ id: 'deposit', label: 'Deposit', nodeUrl });
  if (hasKey && nodeUrl) btns.push({ id: 'withdraw', label: 'Withdraw' });
  btns.push({ id: 'browse', label: 'Browse' });
  return btns.map(b => {
    const isActive = b.id === active;
    const nodeAttr = b.nodeUrl ? ` data-node-url="${escapeAttr(b.nodeUrl)}"` : '';
    return `<button class="import-btn ${isActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${isActive ? _activePill : _pill}" data-routstr-wallet-action="node-action" data-node-action="${b.id}"${nodeAttr}>${b.label}</button>`;
  }).join('');
}

export function routstrWalletActionButtons(active) {
  const _pill = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const _active = 'font-size:11px;padding:3px 10px';
  const mainBtns = [
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
  ];
  const menuItems = [
    { id: 'seed', label: '\ud83c\udf31 Seed & Restore' },
    { id: 'backup', label: '\ud83d\udce4 Export Token' },
  ];
  const main = mainBtns.map(b => {
    const isActive = b.id === active;
    return `<button class="import-btn ${isActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${isActive ? _active : _pill}" data-routstr-wallet-action="wallet-action" data-wallet-action="${b.id}">${b.label}</button>`;
  }).join('');
  const menuActive = menuItems.some(b => b.id === active);
  const menu = `<div style="position:relative;display:inline-block">
    <button class="import-btn ${menuActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${menuActive ? _active : _pill}" data-routstr-wallet-action="toggle-wallet-menu">\u22ef</button>
    <div id="routstr-wallet-menu" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:4px;z-index:10;min-width:120px;box-shadow:var(--shadow-lg)">
      ${menuItems.map(b => `<button class="import-btn ${b.id === active ? 'import-btn-primary' : 'import-btn-secondary'}" style="font-size:11px;padding:4px 10px;width:100%;text-align:left;margin-bottom:2px;${b.id === active ? '' : 'background:transparent;border-color:transparent;color:var(--text-primary)'}" data-routstr-wallet-action="wallet-action" data-wallet-action="${b.id}">${b.label}</button>`).join('')}
    </div>
  </div>`;
  return main + menu;
}
