import type { PROVIDER_TONES } from './provider-settings-classes.js';
export interface WalletMintEntry { mint: string; balance: number | null }
export interface WalletMintState {
  mint: string; saved: WalletMintEntry[]; accepted: string[];
  loading: boolean; pending: boolean;
  hints: 'none' | 'loading' | 'ready' | 'unavailable';
  status: { text: string; tone: keyof typeof PROVIDER_TONES };
}
export interface WalletMintActions { save(): unknown; cancel(): unknown; reload(): unknown }
export interface WalletMintComponentView {
  getState(): WalletMintState; setState(state: WalletMintState): void;
  readDraft(): string; setDraft(mint: string): void; focusSelect(): void; clearFields(): void;
}
export interface WalletMintView extends WalletMintComponentView { isCurrent(): boolean }
export const initialWalletMintState = (): WalletMintState => ({ mint: '', saved: [], accepted: [], loading: true, pending: false, hints: 'none', status: { text: '', tone: 'secondary' } });
