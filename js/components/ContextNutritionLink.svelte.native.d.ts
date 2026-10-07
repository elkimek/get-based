import type { Component } from 'svelte';
declare const component: Component<{ title: string; detail: string }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
