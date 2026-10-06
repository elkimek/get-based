import type { ProviderWalletDefaults } from '../js/provider-wallet-runtime.js';
import type { createFundingMonitor, recoverPendingWalletFunding, renderFundingInvoice } from '../js/provider-wallet-funding-recovery.js';
// Private consumed operations preserve unchecked injected values and errors.
// The exported registry and configuration never promise validated results.
export type WalletOperations = {[Key in keyof ProviderWalletDefaults]: (...args: Parameters<ProviderWalletDefaults[Key]>) => ReturnType<ProviderWalletDefaults[Key]> extends Promise<unknown> ? Promise<unknown> : unknown};
export type FundingMonitorReader = (runtime: WalletOperations, ...args: Parameters<typeof createFundingMonitor> extends [unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof createFundingMonitor>;
export type FundingRecoveryReader = (runtime: WalletOperations, ...args: Parameters<typeof recoverPendingWalletFunding> extends [unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof recoverPendingWalletFunding>;
export interface InvoiceOperations {invoice: unknown; quote: unknown; amount: number; mint: unknown}
export type InvoiceRendererReader = (invoice: InvoiceOperations) => ReturnType<typeof renderFundingInvoice>;
export interface WalletCallbacks {account?: import('../js/routstr-settings-contract.js').RoutstrAccountActions;renderAIProviderPanel?: unknown; renderRoutstrModelDropdown?: unknown; initSettingsModelFetch?: unknown; hydrateRoutstrModelSettings?: unknown; hydrateRoutstrSettings?: unknown; requestProviderActivation?: unknown; returnToChatIfOnboarding?: unknown}
export interface PanelHTMLWriter {innerHTML: unknown}
