// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {disposeRoutstrSettings, mountRoutstrSettings} from '../js/routstr-settings-component.js';
import {initialRoutstrSettingsState, type RoutstrSettingsActions} from '../js/routstr-settings-contract.js';

afterEach(() => {
  disposeRoutstrSettings();
  document.body.replaceChildren();
});

it('scopes session and saved refund actions to the active native settings controls', () => {
  const account = {node: 'https://fixture-node.invalid', key: 'synthetic-connection-key'};
  const scope = initialRoutstrSettingsState(account.node, true);
  const controls: RoutstrSettingsActions = {
    account: {save: vi.fn(), remove: vi.fn(), copy: vi.fn(), acknowledge: vi.fn()},
    wallet: vi.fn(), node: vi.fn(), mints: vi.fn(), refreshWallet: vi.fn(),
    refreshNode: vi.fn(), refunds: vi.fn(), copyRecovery: vi.fn(), reclaimRecovery: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const view = mountRoutstrSettings(host, {...scope, refundNode: account.node}, controls, account);
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(node => node.textContent === label)!;
  const details = host.querySelector<HTMLDetailsElement>('details')!;
  details.open = true;
  const credential = host.querySelector<HTMLInputElement>('#routstr-key-input')!;
  view.setCredential('synthetic-edited-credential');
  expect(credential.type).toBe('password');
  expect(view.readCredential()).toBe('synthetic-edited-credential');
  const save = host.querySelector<HTMLButtonElement>('#save-routstr-key-btn')!;
  const remove = button('Remove session key');
  const checkRefund = host.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="saved-node-refunds"]')!;
  save.click();
  remove.click();
  checkRefund.click();
  expect(controls.account?.save).toHaveBeenCalledOnce();
  expect(controls.account?.remove).toHaveBeenCalledOnce();
  expect(controls.refunds).toHaveBeenCalledExactlyOnceWith(account.node);

  view.showReceipt(account);
  const receipt = host.querySelector<HTMLTextAreaElement>('#routstr-session-key-receipt')!;
  expect(receipt.value).toBe(account.key);
  expect(receipt.readOnly).toBe(true);
  expect(JSON.stringify(view.getState())).not.toContain(account.key);
  const copy = button('Copy Key');
  const acknowledge = host.querySelector<HTMLButtonElement>('[data-provider-panel-action="acknowledge-routstr-key"]')!;
  copy.click();
  acknowledge.click();
  expect(controls.account?.copy).toHaveBeenCalledOnce();
  expect(controls.account?.acknowledge).toHaveBeenCalledOnce();

  const replacementHost = document.createElement('div');
  document.body.append(replacementHost);
  mountRoutstrSettings(replacementHost, scope, controls, {...account, key: 'replacement-fixture'});
  expect(view.isCurrent()).toBe(false);
  expect(receipt.isConnected).toBe(false);
  expect(receipt.value).toBe('');
  expect(view.readReceipt()).toBeNull();
  expect(view.readCredential()).toBe('');
  for (const stale of [save, remove, checkRefund, copy, acknowledge]) stale.click();
  for (const action of [...Object.values(controls.account!), controls.refunds]) expect(action).toHaveBeenCalledOnce();
});
