import type { Component } from 'svelte';
import type { AgentAccessSnapshot, AgentAccessView } from '../settings-agent-access-contract.js';
declare const AgentAccessSettings: Component<{ initial: AgentAccessSnapshot }, AgentAccessView>;
export default AgentAccessSettings;
export { mount, unmount, flushSync } from 'svelte';
