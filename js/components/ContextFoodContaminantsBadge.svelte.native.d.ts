import type { Component } from 'svelte';
declare const component: Component<{ count: number }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
