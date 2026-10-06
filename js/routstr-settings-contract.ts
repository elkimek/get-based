import type { ProviderSettingsStatus } from './provider-settings-contract.js';
export type RoutstrWalletAction = 'deposit' | 'withdraw' | 'seed' | 'backup' | 'refunds';
export type RoutstrNodeAction = 'deposit' | 'withdraw' | 'browse';
export type RoutstrRecoveryKind = 'deposit' | 'withdraw';
export const ROUTSTR_WALLET_ACTIONS = [{ id: 'deposit', label: 'Deposit' }, { id: 'withdraw', label: 'Withdraw' }] as const;
export const ROUTSTR_WALLET_MENU = [{ id: 'seed', label: '🌱 Seed & Restore' }, { id: 'backup', label: '📤 Export Token' }, { id: 'refunds', label: 'Saved node refunds' }] as const;
export const ROUTSTR_NODE_ACTIONS = [{ id: 'deposit', label: 'Deposit' }, { id: 'withdraw', label: 'Withdraw' }, { id: 'browse', label: 'Browse' }] as const;
export interface RoutstrSettingsAccount { node: string; key: string }
export interface RoutstrRecoveryStatus { visible: boolean; pending: boolean; copied: boolean; status: ProviderSettingsStatus }
/** Credentials and recovery tokens stay behind private ports, outside display state. */
export interface RoutstrSettingsState {
  node: string; nodeLabel: string; connected: boolean;
  walletBalance: string; mint: string; seed: ProviderSettingsStatus; nodeBalance: ProviderSettingsStatus;
  walletAction: RoutstrWalletAction | null; nodeAction: RoutstrNodeAction | null; menuOpen: boolean;
  refundNode: string; recoveries: Record<RoutstrRecoveryKind, RoutstrRecoveryStatus>;
}
export interface RoutstrConnectionState extends ProviderSettingsStatus { pending: boolean; receipt: boolean; copied: boolean }
export interface RoutstrCredentialPorts {
  readCredential(): string; setCredential(value: string): void;
  getConnection(): RoutstrConnectionState; setConnection(state: RoutstrConnectionState): void;
  showReceipt(account: RoutstrSettingsAccount): void; readReceipt(): RoutstrSettingsAccount | null; hideReceipt(): void;
}
export interface RoutstrAccountActions { save(): unknown; remove(): unknown; copy(): unknown; acknowledge(): unknown }
export interface RoutstrSettingsActions {
  account?: RoutstrAccountActions | undefined;
  wallet(action: RoutstrWalletAction): unknown; node(action: RoutstrNodeAction, node: string): unknown;
  mints(): unknown; refreshWallet(): unknown; refreshNode(): unknown; refunds(node: string): unknown;
  copyRecovery(kind: RoutstrRecoveryKind): unknown; reclaimRecovery(kind: RoutstrRecoveryKind): unknown;
}
export interface RoutstrSettingsComponentView extends RoutstrCredentialPorts {
  getState(): RoutstrSettingsState; setState(state: RoutstrSettingsState): void;
  showRecovery(kind: RoutstrRecoveryKind, token: string): void; readRecovery(kind: RoutstrRecoveryKind): string;
  clearPrivateFields(): void; closeMenu(): void;
}
export interface RoutstrSettingsView extends RoutstrSettingsComponentView {
  isCurrent(): boolean; readAccount(): RoutstrSettingsAccount | null; setAccount(account: RoutstrSettingsAccount, label?: string): void;
}
export function initialRoutstrSettingsState(node: string, connected: boolean): RoutstrSettingsState {
  const recovery = (): RoutstrRecoveryStatus => ({ visible: false, pending: false, copied: false, status: { text: '', tone: 'secondary' } });
  return { node, nodeLabel: node ? node.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'discovering…', connected,
    walletBalance: '⚡ loading...', mint: 'loading...', seed: { text: 'Checking local wallet setup…', tone: 'secondary' },
    nodeBalance: { text: 'Balance: loading...', tone: 'secondary' }, walletAction: null, nodeAction: null, menuOpen: false,
    refundNode: '', recoveries: { deposit: recovery(), withdraw: recovery() } };
}
export const ROUTSTR_SETTINGS_HOST = '<div data-routstr-settings-host></div>';
