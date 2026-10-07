import type { Component } from 'svelte';
import type { ChatSpeechMode } from '../chat-voice-contract.js';
declare const ChatSpeechButton: Component<{ index: number; mode?: ChatSpeechMode; act?: () => void }, { setMode(mode: ChatSpeechMode): void }>;
export default ChatSpeechButton;
export { hydrate, unmount, flushSync } from 'svelte';
