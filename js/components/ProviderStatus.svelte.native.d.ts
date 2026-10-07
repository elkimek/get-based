import type { Component } from 'svelte';
import type { ProviderStatusState, ProviderStatusOptions, ProviderStatusComponentView } from '../provider-status-contract.js';
declare const ProviderStatus: Component<{ status: ProviderStatusState; id?: string } & ProviderStatusOptions, ProviderStatusComponentView>;
export default ProviderStatus;
export { mount, unmount, flushSync } from 'svelte';
