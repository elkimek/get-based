import type { clearVeniceE2EESession, hasAIProvider } from '../js/api.js';
import type { loadFocusCard } from '../js/focus-card.js';
import type { openChatPanel } from '../js/chat-loader.js';
import type { ProviderWalletDefaults } from '../js/provider-wallet-runtime.js';

// Private consumed methods retain raw injected values and their original errors.
export interface ProviderPanelOperations {
  clearE2EESession: typeof clearVeniceE2EESession;
  closeSettingsModal(): unknown;
  hadProviderBeforeSettings(): unknown;
  hasAIProvider: typeof hasAIProvider;
  loadFocusCard: typeof loadFocusCard;
  openChatPanel: typeof openChatPanel;
  openExternal(...args: unknown[]): unknown;
  openSettingsModal(): unknown;
  reloadPage(): unknown;
}
export type ProviderPanelDependencies = { [Key in keyof ProviderPanelOperations]: unknown };
export interface ProviderPanelActionReader {
  dataset?: { copiedText?: unknown; clipboardText?: unknown; token?: unknown; clearTimerKey?: unknown; clearClipboardAfter?: unknown } | null;
  select?: unknown;
}
export interface ProviderPanelWalletOperations {
  cashuGetBalance(): Promise<{ toLocaleString(): unknown }>;
  cashuGetMintUrl(): unknown;
  cashuRecoverPendingDeposit(): Promise<unknown>;
  cashuRecoverPendingWithdraw(): Promise<unknown>;
  cashuGetPendingNodeRefund?: ((...args: Parameters<ProviderWalletDefaults['cashuGetPendingNodeRefund']>) => Promise<{ nodeUrl?: unknown } | null | undefined>) | null;
  cashuReceiveToken(token: unknown): unknown;
}
export interface ProviderPanelVeniceBalance { diem?: unknown; canConsume?: unknown }
