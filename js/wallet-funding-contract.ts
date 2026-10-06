import type { ProviderSettingsStatus } from './provider-settings-contract.js';
/** Public presentation state excludes invoices, quotes and pasted tokens. */
export interface WalletFundingState {
  phase: 'idle' | 'pending' | 'invoice' | 'paid' | 'terminal';
  pending: boolean; custom: boolean; amount: number; credited: number;
  status: ProviderSettingsStatus; poll: string;
}
/** Private view ports; never serialize these into shared snapshots or attributes. */
export interface WalletFundingInvoice { invoice: string; quote: string; mint: string; amount: number; qrImage: string }
export interface WalletFundingActions { submitCustom(): void; cancelCustom(): void }
export interface WalletFundingComponentView {
  getState(): WalletFundingState; setState(state: WalletFundingState): void;
  showInvoice(invoice: WalletFundingInvoice): void; readInvoice(): WalletFundingInvoice | null;
  clearInvoice(): void; setCopied(): void;
  readCustomAmount(): string; focusCustomAmount(): void;
  readToken(): string; clearToken(): void; clearPrivateFields(): void;
}
export interface WalletFundingView extends WalletFundingComponentView { isCurrent(): boolean }
export const initialWalletFundingState = (): WalletFundingState => ({ phase: 'idle', pending: false, custom: false, amount: 0, credited: 0, status: { text: '', tone: 'secondary' }, poll: '' });
