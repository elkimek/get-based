import type { Component } from 'svelte';
import type { ChatMessageActionsView } from '../chat-message-actions-contract.js';
declare const ChatMessageActions: Component<{ view: ChatMessageActionsView }>;
export default ChatMessageActions;
export { hydrate, unmount, flushSync } from 'svelte';
