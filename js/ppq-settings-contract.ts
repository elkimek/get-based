import type { ProviderSettingsModels, ProviderSettingsMode, ProviderSettingsStatus } from './provider-settings-contract.js';
export interface PpqSettingsSnapshot { connected: boolean; models: ProviderSettingsModels; mode: ProviderSettingsMode }
export interface PpqAccountReveal { apiKey: string; creditId: string; activated: boolean }
export interface PpqPaymentDetails {
  method: string; amount: number; paymentText: string; qrImage: string;
  walletUri: string; cryptoAmount: number | null;
}
export interface PpqTopupState {
  open: boolean; phase: 'picker' | 'pending' | 'invoice' | 'success' | 'error';
  method: string; amount: number; custom: boolean; status: ProviderSettingsStatus;
}
export interface PpqSettingsComponentView {
  refresh(snapshot: PpqSettingsSnapshot): void;
  setModels(models: ProviderSettingsModels): void;
  getModels(): ProviderSettingsModels;
  setMode(mode: ProviderSettingsMode): void;
  setSaveState(state: ProviderSettingsStatus & { pending: boolean }): void;
  setBalance(status: ProviderSettingsStatus): void;
  readKey(): string;
  setStoredKey(key: string): void;
  clearKey(): void;
  showAccount(account: PpqAccountReveal): void;
  readAccount(): PpqAccountReveal | null;
  hideAccount(): void;
  setAccountCopied(): void;
  setTopup(state: PpqTopupState): void;
  getTopup(): PpqTopupState;
  readCustomAmount(): string;
  focusCustomAmount(): void;
  showPayment(payment: PpqPaymentDetails): void;
  readPayment(): string;
  clearPayment(): void;
  setPaymentCopied(): void;
}
export interface PpqSettingsView extends PpqSettingsComponentView { isCurrent(): boolean }
export const PPQ_SETTINGS_HOST = '<div data-ppq-settings-host></div>';
