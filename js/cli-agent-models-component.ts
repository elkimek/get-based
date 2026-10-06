import CliAgentModels, { mount, unmount, flushSync } from './components/CliAgentModels.svelte.native.js';
import type { CliAgentModelsAction, CliAgentModelsSnapshot, CliAgentModelsComponentView, CliAgentModelsView } from './cli-agent-models-contract.js';
let lifetime = 0;
let component: CliAgentModelsComponentView | null = null;
let target: HTMLElement | null = null;
let view: CliAgentModelsView | null = null;
export function disposeCliAgentModels(): void {
  ++lifetime;
  if (component) { void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function getCliAgentModelsView(): CliAgentModelsView | null { return view?.isCurrent() ? view : null; }
export function mountCliAgentModels(host: HTMLElement, initial: CliAgentModelsSnapshot, action: CliAgentModelsAction): CliAgentModelsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeCliAgentModels(); host.replaceChildren(); target = host;
  let owned: CliAgentModelsView | null = null;
  const owner = mount(CliAgentModels, { target: host, props: { initial, action: (name, value) => owned?.isCurrent() ? action(name,value) : undefined } });
  component = owner; flushSync();
  const root = host.querySelector('[data-cli-agent-models-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (callback: () => void) => { if (isCurrent()) flushSync(callback); };
  view = { isCurrent, refresh: next => apply(() => owner.refresh(next)), filter: query => apply(() => owner.filter(query)) };
  owned = view; return view;
}

// Native discovery may finish after close while Settings keeps its DOM attached.
export function captureCliAgentModelsLifetime(): () => boolean {
  const captured = lifetime;
  return () => captured === lifetime;
}
