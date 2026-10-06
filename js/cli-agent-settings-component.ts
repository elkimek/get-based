import CliAgentSettings,{ mount,unmount,flushSync } from './components/CliAgentSettings.svelte.native.js';
import { disposeCliAgentModels } from './cli-agent-models-component.js';
import type { CliAgentSettingsSnapshot,CliAgentSettingsActions,CliAgentSettingsComponentView,CliAgentSettingsView } from './cli-agent-settings-contract.js';
let component: CliAgentSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: CliAgentSettingsView | null = null;
export function disposeCliAgentSettings(): void {
  disposeCliAgentModels();
  if (component) { void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function getCliAgentSettingsView(): CliAgentSettingsView | null { return view?.isCurrent() ? view : null; }
export function mountCliAgentSettings(host: HTMLElement, initial: CliAgentSettingsSnapshot, actions: CliAgentSettingsActions): CliAgentSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeCliAgentSettings(); host.replaceChildren(); target = host;
  let owned: CliAgentSettingsView | null = null;
  const guard = (callback: () => unknown) => owned?.isCurrent() ? callback() : undefined;
  const owner = mount(CliAgentSettings,{ target:host,props:{ initial,actions:{
    scan:() => guard(actions.scan),platform:value => guard(() => actions.platform(value)),copy:value => guard(() => actions.copy(value)),
    login:agent => guard(() => actions.login(agent)),test:agent => guard(() => actions.test(agent)),toggle:(enabled,agent) => guard(() => actions.toggle(enabled,agent)),
    disclose:agent => guard(() => actions.disclose(agent)),control:value => guard(() => actions.control(value)),
  } } }); component = owner; flushSync();
  const root = host.querySelector('[data-cli-agent-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (callback: () => void) => { if (isCurrent()) flushSync(callback); };
  view = { isCurrent,getSnapshot:() => owner.getSnapshot(),setStatus:text => apply(() => owner.setStatus(text)),setBusy:value => apply(() => owner.setBusy(value)),
    getModelHost:() => isCurrent() ? owner.getModelHost() : null,resizeFrame:event => apply(() => owner.resizeFrame(event)),
    refresh:next => { if (!isCurrent()) return; const previous = owner.getModelHost(); apply(() => owner.refresh(next)); if (previous !== owner.getModelHost()) disposeCliAgentModels(); } };
  owned = view; return view;
}
