import type { Component } from 'svelte';
declare const ChatThinkingStatus: Component<Record<string, never>, { setPhrase(next: string): void }>;
export default ChatThinkingStatus;
export { mount, unmount, flushSync } from 'svelte';
