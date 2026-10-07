import type { Component } from 'svelte';
declare const ChatImageLightbox: Component<{ src: string; close(): void }>;
export default ChatImageLightbox;
export { mount, unmount, flushSync } from 'svelte';
