import type { ProviderSettingsStatus } from './provider-settings-contract.js';
export interface WalletNodeRow { url: string; name: string; operator: string; models: number; tor: boolean; privateTee: boolean }
export interface WalletNodeMint { mint: string; balance: number | null }
export interface WalletNodeState {
  mode: 'browse' | 'deposit' | 'refunds' | 'refund' | 'recovery';
  phase: 'loading' | 'ready' | 'mints' | 'empty' | 'rejected' | 'paid' | 'error';
  node: string; mint: string; balance: number; discovered: number; nodes: WalletNodeRow[]; accepted: WalletNodeMint[];
  pending: boolean; status: ProviderSettingsStatus;
}
/** Private ports never expose credentials/tokens/record generations in shared state. */
export interface WalletNodeSession { node: string; key: string }
export interface WalletNodeRecovery { node: string; mint: string; createdAt: number; id: string; generation: string; token: string }
export interface WalletNodeActions {
  connect(node: string): unknown; refresh(): unknown; chooseMint(mint: string): unknown;
  deposit(amount?: number): unknown; newSession(): unknown; retry(index: number): unknown;
  copy(index: number): unknown; reclaim(index: number): unknown; close(): unknown;
}
export interface WalletNodeComponentView {
  getState(): WalletNodeState; setState(next: WalletNodeState): void;
  readAmount(): string; setAmount(amount: number): void;
  setSession(session: WalletNodeSession): void; readSession(): WalletNodeSession | null;
  setRecoveries(records: WalletNodeRecovery[]): void; readRecovery(index: number): WalletNodeRecovery | null;
  clearPrivateFields(): void;
}
export interface WalletNodeView extends WalletNodeComponentView { isCurrent(): boolean }
export const initialWalletNodeState = (): WalletNodeState => ({ mode: 'browse', phase: 'loading', node: '', mint: '', balance: 0, discovered: 0, nodes: [], accepted: [], pending: true, status: { text: '', tone: 'secondary' } });
