import type { ProviderSettingsStatus } from './provider-settings-contract.js';
/** Presentation snapshots contain neither destination, quote identifiers nor tokens. */
export interface WalletWithdrawState {
  mode: 'choose' | 'lightning' | 'token'; phase: 'form' | 'quote' | 'token' | 'paid';
  mint: string; balance: number; pending: boolean; copied: boolean; recovery: boolean;
  amount: number; fee: number; status: ProviderSettingsStatus;
}
export interface WalletWithdrawDraft { destination: string; amount: string }
export interface WalletWithdrawQuote { id: string; mint: string }
export interface WalletWithdrawActions {
  lightning(): unknown; token(): unknown; maximum(): unknown; quote(): unknown;
  execute(): unknown; send(amount?: number): unknown; copy(): unknown; recover(): unknown; reclaim(): unknown; close(): unknown;
}
export interface WalletWithdrawComponentView {
  getState(): WalletWithdrawState; setState(state: WalletWithdrawState): void;
  readDraft(): WalletWithdrawDraft; setAmount(amount: number): void;
  showQuote(quote: WalletWithdrawQuote): void; readQuote(): WalletWithdrawQuote | null;
  showToken(token: string): void; readToken(): string; clearPrivateFields(): void;
}
export interface WalletWithdrawView extends WalletWithdrawComponentView { isCurrent(): boolean }
export const initialWalletWithdrawState = (): WalletWithdrawState => ({ mode: 'choose', phase: 'form', mint: '', balance: 0, pending: true, copied: false, recovery: false, amount: 0, fee: 0, status: { text: 'Loading wallet balance…', tone: 'secondary' } });
