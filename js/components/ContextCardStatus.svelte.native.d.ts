import type { Component } from 'svelte';
import type { ContextCardStatusSlot } from '../context-card-status.js';
declare const component: Component<{ cardKey: string; slot: ContextCardStatusSlot; renderId: string; ticket: string; localSummary?: string; cardLabel?: string }>;
export default component;
export { hydrate, unmount, flushSync } from 'svelte';
