import type { RoutstrWalletAction, RoutstrNodeAction } from './routstr-settings-contract.js';
export interface RoutstrActionsState { kind: 'wallet' | 'node'; node: string; connected: boolean; active: RoutstrWalletAction | RoutstrNodeAction | null; compatibility?: boolean }
export interface RoutstrActions { wallet(action: RoutstrWalletAction): unknown; node(action: RoutstrNodeAction, node: string): unknown }
export interface RoutstrActionsComponentView { getState(): RoutstrActionsState; setState(state: RoutstrActionsState): void; closeMenu(): void; invoke(action: string): void }
export interface RoutstrActionsView extends RoutstrActionsComponentView { isCurrent(): boolean }
