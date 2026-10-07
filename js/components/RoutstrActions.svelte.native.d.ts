import type { Component } from 'svelte';
import type { RoutstrActionsState, RoutstrActions, RoutstrActionsComponentView } from '../routstr-actions-contract.js';
declare const RoutstrActions: Component<{ state: RoutstrActionsState; actions?: RoutstrActions; menuOpen?: boolean }, RoutstrActionsComponentView>;
export default RoutstrActions;
export { mount, hydrate, unmount, flushSync } from 'svelte';
