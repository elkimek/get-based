import type { Component } from 'svelte';
import type { ChatTranscriptMessage } from '../chat-transcript-presentation.js';
declare const component: Component<{ initial: ChatTranscriptMessage; label: string | null }, { setToolActivity(activity: import('../../shared/chat-tool-activity.js').ChatToolActivity[]): void; setText(text: string): void; complete(view: ChatTranscriptMessage): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
