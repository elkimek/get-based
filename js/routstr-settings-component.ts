import RoutstrSettings, { mount, unmount, flushSync } from './components/RoutstrSettings.svelte.native.js';
import type { RoutstrSettingsAccount, RoutstrSettingsActions, RoutstrSettingsComponentView, RoutstrSettingsState, RoutstrSettingsView } from './routstr-settings-contract.js';
import { disposeRoutstrModelSettings } from './routstr-model-settings-component.js';
import { disposeWalletNode } from './wallet-node-component.js';
import { disposeWalletMint } from './wallet-mint-component.js';
import { disposeWalletSeed } from './wallet-seed-component.js';
import { disposeWalletFunding } from './wallet-funding-component.js';
import { disposeWalletExport } from './wallet-export-component.js';
import { disposeWalletWithdraw } from './wallet-withdraw-component.js';
let component: RoutstrSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: RoutstrSettingsView | null = null;
export function disposeRoutstrSettings(): void {
  if (component) {
    const child = (selector: string, dispose: () => void) => {
      const root = target?.querySelector(selector), live = document.querySelector(selector);
      if (root && (!live || live === root)) dispose();
    };
    child('[data-routstr-model-settings-view]', disposeRoutstrModelSettings);
    child('[data-wallet-node-view]', disposeWalletNode); child('[data-wallet-mint-view]', disposeWalletMint);
    child('[data-wallet-seed-view]', disposeWalletSeed); child('[data-wallet-funding-view]', disposeWalletFunding);
    child('[data-wallet-export-view]', disposeWalletExport); child('[data-wallet-withdraw-view]', disposeWalletWithdraw);
  }
  view?.clearPrivateFields();
  if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountRoutstrSettings(host: HTMLElement, initial: RoutstrSettingsState, actions: RoutstrSettingsActions, account: RoutstrSettingsAccount): RoutstrSettingsView {
  if (target === host && view?.isCurrent()) { view.setAccount(account); return view; }
  disposeRoutstrSettings(); host.replaceChildren(); target = host;
  let owned: RoutstrSettingsView | null = null, privateAccount: RoutstrSettingsAccount | null = { ...account };
  const run = (action: () => unknown) => owned?.isCurrent() ? action() : undefined;
  const scoped: RoutstrSettingsActions = { account: actions.account ? { save: () => run(actions.account!.save), remove: () => run(actions.account!.remove), copy: () => run(actions.account!.copy), acknowledge: () => run(actions.account!.acknowledge) } : undefined, wallet: action => run(() => actions.wallet(action)), node: (action, node) => run(() => actions.node(action, node)), mints: () => run(actions.mints), refreshWallet: () => run(actions.refreshWallet), refreshNode: () => run(actions.refreshNode), refunds: node => run(() => actions.refunds(node)), copyRecovery: kind => run(() => actions.copyRecovery(kind)), reclaimRecovery: kind => run(() => actions.reclaimRecovery(kind)) };
  const owner = mount(RoutstrSettings, { target: host, props: { initial, actions: scoped } }); component = owner; flushSync();
  const root = host.querySelector('[data-routstr-settings-view]');
  const isCurrent = () => component === owner && target === host && !!root && host.isConnected && host.contains(root);
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent,
    readCredential: () => isCurrent() ? owner.readCredential() : '', setCredential: value => apply(() => owner.setCredential(value)),
    getConnection: () => owner.getConnection(), setConnection: state => apply(() => owner.setConnection(state)),
    showReceipt: account => apply(() => owner.showReceipt(account)), readReceipt: () => isCurrent() ? owner.readReceipt() : null, hideReceipt: () => { const showing = !!owner.readReceipt(); apply(() => owner.hideReceipt()); if (showing && isCurrent()) host.querySelector<HTMLElement>('summary')?.focus(); },
    getState: () => owner.getState(), setState: state => apply(() => owner.setState(state)),
    showRecovery: (kind, token) => apply(() => owner.showRecovery(kind, token)), readRecovery: kind => isCurrent() ? owner.readRecovery(kind) : '',
    clearPrivateFields: () => { privateAccount = null; owner.clearPrivateFields(); }, closeMenu: () => apply(() => owner.closeMenu()),
    readAccount: () => isCurrent() && privateAccount ? { ...privateAccount } : null,
    setAccount: (next, label) => apply(() => { const receipt = owner.readReceipt(); if (receipt && (receipt.node !== next.node || receipt.key !== next.key)) owner.hideReceipt(); privateAccount = { ...next }; owner.setState({ ...owner.getState(), node: next.node, nodeLabel: label || (next.node === owner.getState().node ? owner.getState().nodeLabel : next.node ? next.node.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'discovering…'), connected: !!next.key }); }),
  }; owned = view; return view;
}
export function getRoutstrSettingsView(): RoutstrSettingsView | null { return view?.isCurrent() ? view : null; }
