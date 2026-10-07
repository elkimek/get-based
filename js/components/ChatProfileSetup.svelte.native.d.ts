import type { Component } from 'svelte';
import type { ChatProfileFormPort, ChatProfileSetupView } from '../chat-profile-onboarding-contract.js';
declare const component: Component<{ initial: ChatProfileSetupView }, ChatProfileFormPort & { setPresentation(view: ChatProfileSetupView): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
