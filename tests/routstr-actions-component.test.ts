// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { buildRoutstrNodeActions, routstrWalletActionButtons } from '../js/provider-wallet-panel-buttons.js';
import { configureRoutstrActions, disposeRoutstrActions, hydrateRoutstrActions, routstrActionsState, updateRoutstrActions } from '../js/routstr-actions-component.js';
const node = 'https://node.synthetic.test';
const button = (host: HTMLElement, selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
function inserted(html: string) { const host = document.body.appendChild(document.createElement('section')); host.innerHTML = html; return host; }
afterEach(() => { disposeRoutstrActions(); document.body.replaceChildren(); configureRoutstrActions({ wallet: () => {}, node: () => {} }); });
it('returns synchronous inert node controls and dispatches an immediate click exactly once without replacing queried buttons', async () => {
  const callback = vi.fn(); configureRoutstrActions({ wallet: vi.fn(), node: callback });
  const unsafe = node + '/" onclick="unsafe"><svg onload="unsafe">';
  const host = inserted(buildRoutstrNodeActions(unsafe, true, 'deposit'));
  expect(host.querySelector('svg,[onclick],[onload]')).toBeNull();
  const deposit = button(host, '[data-node-action="deposit"]'), withdraw = button(host, '[data-node-action="withdraw"]');
  expect(deposit.dataset.nodeUrl).toBe(unsafe); deposit.click(); withdraw.click(); await Promise.resolve();
  expect(callback.mock.calls).toEqual([['deposit', unsafe], ['withdraw', unsafe]]);
  expect(button(host, '[data-node-action="deposit"]')).toBe(deposit);
  expect(button(host, '[data-node-action="withdraw"]')).toBe(withdraw);
});
it('reuses hydrated controls across active updates and gates withdrawal on the captured connection', () => {
  const callback = vi.fn(); configureRoutstrActions({ wallet: vi.fn(), node: callback });
  const host = inserted(buildRoutstrNodeActions(node, true, null)); const deposit = button(host, '[data-node-action="deposit"]');
  const view = updateRoutstrActions(host, routstrActionsState('node', node, false, 'deposit'));
  expect(button(host, '[data-node-action="deposit"]')).toBe(deposit); expect(host.querySelector('[data-node-action="withdraw"]')).toBeNull();
  view.invoke('withdraw'); view.invoke('unsafe'); expect(callback).not.toHaveBeenCalled(); deposit.click(); expect(callback).toHaveBeenCalledExactlyOnceWith('deposit', node);
  view.setState(routstrActionsState('node', '', false, null)); expect(host.querySelector('[data-node-action="deposit"]')).toBeNull(); button(host, '[data-node-action="browse"]').click(); expect(callback).toHaveBeenLastCalledWith('browse', '');
});
it('owns the synchronous More menu, Escape focus, outside capture and single action dispatch', async () => {
  const callback = vi.fn(); configureRoutstrActions({ wallet: callback, node: vi.fn() });
  const host = inserted(routstrWalletActionButtons('backup')); const toggle = button(host, '[data-routstr-wallet-action="toggle-wallet-menu"]');
  toggle.click(); expect(toggle.getAttribute('aria-expanded')).toBe('true'); expect(host.querySelector<HTMLElement>('#routstr-wallet-menu')!.hidden).toBe(false);
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await Promise.resolve(); expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(toggle);
  toggle.click(); const outside = document.body.appendChild(document.createElement('button')); outside.addEventListener('click', event => event.stopPropagation()); outside.click(); await Promise.resolve(); expect(toggle.getAttribute('aria-expanded')).toBe('false');
  toggle.click(); button(host, '[data-wallet-action="backup"]').click(); await Promise.resolve(); expect(callback).toHaveBeenCalledExactlyOnceWith('backup'); expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(button(host, '[data-routstr-wallet-action="toggle-wallet-menu"]')).toBe(toggle);
});
it('rejects retained controls and ports after replacement, detachment and disposal', async () => {
  const callback = vi.fn(); configureRoutstrActions({ wallet: callback, node: vi.fn() });
  const host = inserted(routstrWalletActionButtons(null)), wrapper = host.firstElementChild as HTMLElement;
  const view = hydrateRoutstrActions(wrapper), retained = button(host, '[data-wallet-action="deposit"]');
  host.replaceChildren(); retained.click(); view.invoke('deposit'); expect(view.isCurrent()).toBe(false); expect(callback).not.toHaveBeenCalled(); await Promise.resolve();
  host.innerHTML = routstrWalletActionButtons(null); button(host, '[data-wallet-action="withdraw"]').click(); expect(callback).toHaveBeenCalledExactlyOnceWith('withdraw');
  disposeRoutstrActions(host); retained.click(); view.invoke('backup'); expect(callback).toHaveBeenCalledTimes(1);
  const retiredHost = host.firstElementChild as HTMLElement; updateRoutstrActions(retiredHost, routstrActionsState('wallet', '', false, null)); button(host, '[data-wallet-action="deposit"]').click(); expect(callback).toHaveBeenLastCalledWith('deposit'); expect(callback).toHaveBeenCalledTimes(2);
});
it('mounts the same owner for legacy containers without requiring serialized markup', () => {
  const callback = vi.fn(); configureRoutstrActions({ wallet: callback, node: vi.fn() });
  const host = inserted(''); const view = updateRoutstrActions(host, routstrActionsState('wallet', '', false, 'deposit'));
  button(host, '[data-wallet-action="deposit"]').click(); expect(callback).toHaveBeenCalledExactlyOnceWith('deposit');
  host.remove(); view.invoke('withdraw'); expect(callback).toHaveBeenCalledTimes(1);
});

it('retires a replaced mounted ancestor without unmounting the new hydrated child owner', async () => {
  const callback = vi.fn(); configureRoutstrActions({ wallet: callback, node: vi.fn() });
  const host = inserted(''); updateRoutstrActions(host, routstrActionsState('wallet', '', false, null));
  host.innerHTML = routstrWalletActionButtons(null); const deposit = button(host, '[data-wallet-action="deposit"]'); deposit.click(); await Promise.resolve();
  expect(host.querySelector('[data-wallet-action="deposit"]')).toBe(deposit);
  updateRoutstrActions(host, routstrActionsState('wallet', '', false, 'withdraw')); deposit.click(); expect(callback.mock.calls).toEqual([['deposit'], ['deposit']]);
});
