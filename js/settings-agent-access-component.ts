// The lazy sync UI owns this lifecycle; audio and sync services stay component-free.
import AgentAccessSettings, { mount, unmount, flushSync } from './components/AgentAccessSettings.svelte.native.js';
import type { AgentAccessSnapshot, AgentAccessView } from './settings-agent-access-contract.js';

let component: AgentAccessView | null = null;
let target: HTMLElement | null = null;

export function disposeAgentAccessSection(): void {
  if (component) {
    void unmount(component);
    flushSync();
  }
  component = null;
  target = null;
}

export function mountAgentAccessSection(host: HTMLElement, initial: AgentAccessSnapshot, refresh = false): void {
  if (host === target) {
    if (refresh && component) flushSync(() => component?.refresh(initial));
    return;
  }
  disposeAgentAccessSection();
  target = host;
  component = mount(AgentAccessSettings, { target: host, props: { initial } });
  flushSync();
}

export function getAgentAccessView(): AgentAccessView | null {
  if (!target?.isConnected || !component) return null;
  const mounted = component;
  return {
    refresh: next => flushSync(() => mounted.refresh(next)),
    toggleSecret: (kind, value) => flushSync(() => mounted.toggleSecret(kind, value)),
  };
}
