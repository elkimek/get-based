import type { Component } from 'svelte';
import type { ContextHubModel } from '../context-hub-model.js';
import type { ContextSettingMutation } from '../context-hub-session.js';
declare const component: Component<{ initial: ContextHubModel; current(): boolean; change(value: ContextSettingMutation): void; retry(): void; discard(): void; close(): void; pick(key: 'lens' | 'kb'): void }, { update(next: ContextHubModel, saving: boolean, intent: ContextSettingMutation | null, message: string): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
