import type { Component } from 'svelte';
declare const ChatMessageEditor: Component<{ draft: string; busy?: boolean; current(): boolean; cancel(): void; submit(): void }, { setBusy(value: boolean): void }>;
export default ChatMessageEditor;
export { mount, unmount, flushSync } from 'svelte';
