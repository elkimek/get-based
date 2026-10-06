import type { PROVIDER_TONES } from './provider-settings-classes.js';
export interface WalletSeedState {
  mode: 'loading' | 'onboarding' | 'manage' | 'missing';
  pending: boolean;
  status: { text: string; tone: keyof typeof PROVIDER_TONES };
}
export interface WalletSeedActions { copy(): unknown; create(): unknown; restore(): unknown; continue(): unknown }
export interface WalletSeedComponentView {
  getState(): WalletSeedState; setState(state: WalletSeedState): void;
  setMnemonic(words: string): void; readMnemonic(): string;
  readRestore(): string; clearRestore(): void; isAcknowledged(): boolean;
  setCopied(): void; clearPrivateFields(): void;
}
export interface WalletSeedView extends WalletSeedComponentView { isCurrent(): boolean }
export const initialWalletSeedState = (): WalletSeedState => ({ mode: 'loading', pending: true, status: { text: 'Checking local wallet setup…', tone: 'secondary' } });
