import type { Component } from 'svelte';
import type { ChatOptionalSetupView } from '../chat-optional-onboarding-presentation.js';
declare const component: Component<{ initial: ChatOptionalSetupView }, { setPresentation(view: ChatOptionalSetupView): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
