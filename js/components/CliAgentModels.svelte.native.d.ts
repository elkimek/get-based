import type { Component } from 'svelte';
import type { CliAgentModelsAction, CliAgentModelsSnapshot, CliAgentModelsComponentView } from '../cli-agent-models-contract.js';
declare const CliAgentModels: Component<{ initial: CliAgentModelsSnapshot; action: CliAgentModelsAction }, CliAgentModelsComponentView>;
export default CliAgentModels;
export { mount, unmount, flushSync } from 'svelte';
