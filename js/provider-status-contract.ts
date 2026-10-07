import type { ProviderSettingsStatus } from './provider-settings-contract.js';
export interface ProviderStatusState { text: string; tone: ProviderSettingsStatus['tone'] | 'primary' }
export interface ProviderStatusOptions { compact?: boolean; emphasis?: boolean; monospace?: boolean; announce?: boolean }
export interface ProviderStatusComponentView { setStatus(status: ProviderStatusState): void }
export interface ProviderStatusView extends ProviderStatusComponentView { isCurrent(): boolean }
