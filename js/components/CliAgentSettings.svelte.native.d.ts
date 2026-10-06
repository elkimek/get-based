import type { Component } from 'svelte';
import type { CliAgentSettingsSnapshot, CliAgentSettingsActions, CliAgentSettingsComponentView } from '../cli-agent-settings-contract.js';
declare const CliAgentSettings: Component<{ initial:CliAgentSettingsSnapshot; actions:CliAgentSettingsActions },CliAgentSettingsComponentView>;
export default CliAgentSettings;
export { mount,unmount,flushSync } from 'svelte';
