import type { Component } from 'svelte';
import type { ProtectionAction, ProtectionCard } from '../data-protection-picker-model.js';
declare const component: Component<{ cards: ProtectionCard[]; pick(key: ProtectionAction): void; close(): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
