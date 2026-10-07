import type { Component } from 'svelte';
import type { ChatTranscriptView } from '../chat-transcript-presentation.js';
declare const component: Component<Record<string, never>, { setView(view: ChatTranscriptView): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
