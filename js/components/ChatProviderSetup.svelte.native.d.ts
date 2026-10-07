import type { Component } from 'svelte';
import type { ChatProviderSetupView } from '../chat-onboarding-presentation.js';
declare const component: Component<{ initial: ChatProviderSetupView }, { setView(view: ChatProviderSetupView): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
