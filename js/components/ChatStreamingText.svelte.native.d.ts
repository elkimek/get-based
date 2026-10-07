import type { Component } from 'svelte';
declare const component: Component<Record<string, never>, { setText(text: string): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
