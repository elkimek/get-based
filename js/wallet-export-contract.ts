import type { PROVIDER_TONES } from './provider-settings-classes.js';
export interface WalletExportState { phase: 'loading' | 'ready' | 'empty' | 'error'; mint: string; pending: boolean; copied: boolean; status: { text: string; tone: keyof typeof PROVIDER_TONES } }
export interface WalletExportActions { prepare(): unknown; copy(): unknown; close(): unknown }
export interface WalletExportComponentView {
  getState(): WalletExportState; setState(state: WalletExportState): void;
  showToken(token: string): void; readToken(): string; clearPrivateFields(): void;
}
export interface WalletExportView extends WalletExportComponentView { isCurrent(): boolean }
export const initialWalletExportState = (): WalletExportState => ({ phase: 'loading', mint: '', pending: true, copied: false, status: { text: 'Preparing wallet export…', tone: 'secondary' } });
