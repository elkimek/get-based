import type { Component } from 'svelte';
import type { ChatThreadNavigationState, ChatThreadNavigationActions, ChatThreadNavigationComponentView } from '../chat-thread-navigation-contract.js';
declare const ChatThreadNavigation: Component<{ initial: ChatThreadNavigationState; actions: ChatThreadNavigationActions }, ChatThreadNavigationComponentView>;
export default ChatThreadNavigation;
export { mount, unmount, flushSync } from 'svelte';
