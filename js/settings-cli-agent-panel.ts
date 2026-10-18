import { mountCliAgentModels, getCliAgentModelsView, captureCliAgentModelsLifetime } from './cli-agent-models-component.js';
import { buildCliAgentModelsSnapshot, selectedModelEntry, getCLIAgentModelProvider } from './cli-agent-models-presentation.js';
import type { CliAgentSettingsView } from './cli-agent-settings-contract.js';
import type { DiscoveredAgent } from './agent-host-discovery.js';
import type { AgentModel } from './agent-model-catalog.js';
import type { AgentExecutionTarget } from './agent-chat-client.js';

// settings-cli-agent-panel.js — Settings → AI → CLI agents rendering/actions.

import { controlAgentHost, listAgentExecutionTargets, listAgentModels } from './agent-chat-client.js';
import { cacheAgentModelCatalog } from './agent-model-catalog.js';
import { createCliAgentSettingsController } from './cli-agent-settings-controller.js';
import { mountCliAgentSettings,getCliAgentSettingsView } from './cli-agent-settings-component.js';
import { buildCliAgentSettingsSnapshot,selectCliCompanion } from './cli-agent-settings-presentation.js';
import { detectCompanionPlatform,getCompanionCommand,type CompanionPlatform } from './cli-companion-commands.js';
import {
  connectDetectedAgent,
  discoverLocalChatAgents,
  getAgentHostEffort,
  getAgentHostAgent,
  getAgentHostEndpoint,
  getAgentHostModel,
  getAgentHostTarget,
  getAgentHostToken,
  getChatBackend,
  saveAgentChatSettings,
  setChatBackend,
} from './agent-chat-settings.js';
import { showConfirmDialog, showNotification } from './utils.js';

let modelRequest = 0;
let selectionRequest = 0;
let discoveryRequest = 0;
let agentModels: AgentModel[] = [];
let agentTargets: AgentExecutionTarget[] = [];
let agentModelsAgentId = '';
let agentModelsTargetId = '';
let agentProviderFilter = '';
let hydratedAgentId = '';
const collapsedAgentOptions = new Set<string>();

export function toggleCLIAgentOptions() {
  const view = getCliAgentSettingsView(); if (!view) return;
  const agent = getAgentHostAgent();
  if (collapsedAgentOptions.has(agent)) collapsedAgentOptions.delete(agent); else collapsedAgentOptions.add(agent);
  const snapshot = view.getSnapshot(); view.refresh({ ...snapshot,rows:snapshot.rows.map(row => row.id === agent ? { ...row,collapsed:collapsedAgentOptions.has(agent) } : row) });
}
const presentedCompanions = new WeakMap<CliAgentSettingsView, Pick<DiscoveredAgent,'id'|'endpoint'|'token'> | null>();
let companionPlatformOverride: CompanionPlatform | '' = '';
export { detectCompanionPlatform,getCompanionCommand,getLinuxCompanionInstallCommand,getLinuxCompanionRunCommand } from './cli-companion-commands.js';
export { getCLIAgentModelProvider } from './cli-agent-models-presentation.js';

export function renderCLIAgentProviderPanel(): string {
  const lifetimeCurrent = captureCliAgentModelsLifetime();
  queueMicrotask(() => { if (lifetimeCurrent()) hydrateCliAgentSettings(); });
  return '<div data-cli-agent-settings-host></div>';
}
export function hydrateCliAgentSettings(host = document.querySelector<HTMLElement>('[data-cli-agent-settings-host]')): void {
  if (!host?.isConnected) return;
  const initial = { ...buildCliAgentSettingsSnapshot([],presentationContext()),phase:'scanning' as const,showSetup:false };
  const view = mountCliAgentSettings(host,initial,{
    scan:() => refreshDetectedAgentList({ refresh:true }),platform:setCLICompanionPlatform,copy:action => action === 'run' ? copyCLICompanionRunCommand() : action === 'start' ? copyCLICompanionStartCommand() : copyCLICompanionUpdateCommand(),
    login:copyCLIAgentLoginCommand,test:testLocalCodex,toggle:toggleLocalCodex,disclose:toggleCLIAgentOptions,control:controlCLICompanion,
  }); view.setBusy(cliController.isBusy()); void refreshDetectedAgentList({ refresh:true });
}
function presentationContext() {
  return { selectedAgent:getAgentHostAgent(),backend:getChatBackend(),collapsed:collapsedAgentOptions,
    platform:companionPlatformOverride || detectCompanionPlatform(),origin:globalThis.location?.origin || 'https://app.getbased.health',theme:document.documentElement.dataset.theme || 'dark' };
}
export function setCLICompanionPlatform(platform: string): void {
  if (!['linux','macos','windows'].includes(platform)) return;
  companionPlatformOverride = platform as CompanionPlatform;
  const view = getCliAgentSettingsView(); if (!view) return;
  view.refresh({ ...view.getSnapshot(),platform:companionPlatformOverride,runCommand:getCompanionCommand(companionPlatformOverride,'run'),startCommand:getCompanionCommand(companionPlatformOverride,'start') });
}
export const copyCLICompanionRunCommand = () => cliController.copy('run');
export const copyCLICompanionStartCommand = () => cliController.copy('start');
export const copyCLICompanionUpdateCommand = () => cliController.copy('install');
export const copyCLIAgentLoginCommand = (agent: string) => cliController.login(agent);

export function filterCLIAgentModelOptions(query: unknown) {
  getCliAgentModelsView()?.filter(String(query || ''));
}

export function setCLIAgentProviderFilter(provider: unknown): void {
  agentProviderFilter = String(provider || '').slice(0,80);
  const host = document.getElementById('cli-agent-options');
  if (host?.isConnected) showAgentModelControls(host, agentModels);
}

function modelsSnapshot(models: AgentModel[]) {
  const state = buildCliAgentModelsSnapshot(models, agentTargets, { agent: getAgentHostAgent(), target: getAgentHostTarget(),
    model: getAgentHostModel(), effort: getAgentHostEffort(), providerFilter: agentProviderFilter });
  agentProviderFilter = state.providerFilter;
  return state;
}
function showAgentModelControls(host: HTMLElement, models: AgentModel[], error = '', loading = '') {
  return mountCliAgentModels(host, { ...modelsSnapshot(models), error, loading }, (action,value): unknown => {
    if (action === 'set-cli-agent-provider-filter') return setCLIAgentProviderFilter(value);
    if (action === 'set-cli-agent-model') return setCLIAgentModel(value);
    if (action === 'set-cli-agent-target') return setCLIAgentTarget(value);
    return setCLIAgentEffort(value);
  });
}

export async function refreshDetectedAgentList(options: { refresh?: boolean | undefined } = {}) {
  const view = getCliAgentSettingsView(); if (!view) return;
  const request = ++discoveryRequest;
  ++modelRequest;
  const context = JSON.stringify([getAgentHostAgent(),getChatBackend()]);
  const current = () => request === discoveryRequest && view.isCurrent() && context === JSON.stringify([getAgentHostAgent(),getChatBackend()]);
  view.refresh({ ...view.getSnapshot(),phase:'scanning',error:'' });
  try {
    const agents = await discoverLocalChatAgents({ refresh:options.refresh }); if (!current()) return;
    const companion = selectCliCompanion(agents,getAgentHostAgent());
    presentedCompanions.set(view,companion ? { id:companion.id,endpoint:companion.endpoint,token:companion.token } : null);
    view.refresh(buildCliAgentSettingsSnapshot(agents,presentationContext()));
    if (view.getModelHost()) void hydrateAgentModelControls();
  } catch (error) {
    if (!current()) return;
    view.refresh({ ...view.getSnapshot(),phase:'error',error:'CLI detection is unavailable.' });
  }
}
export const controlCLICompanion = (action: string) => cliController.control(action);

function captureAgentConnection() {
  const endpoint = getAgentHostEndpoint(), token = getAgentHostToken();
  return { endpoint, token, isCurrent: () => getAgentHostEndpoint() === endpoint && getAgentHostToken() === token };
}

async function hydrateAgentModelControls() {
  const settingsOwner = getCliAgentSettingsView();
  const options = settingsOwner?.getModelHost();
  if (!options) return;
  const request = ++modelRequest;
  const requestedAgent = getAgentHostAgent();
  const initialTarget = getAgentHostTarget(requestedAgent), initialModel = getAgentHostModel(), initialEffort = getAgentHostEffort(), backend = getChatBackend();
  if (hydratedAgentId !== requestedAgent) {
    hydratedAgentId = requestedAgent; agentProviderFilter = ''; agentTargets = [];
  }
  const owned = showAgentModelControls(options, agentModelsAgentId === requestedAgent && agentModelsTargetId === initialTarget ? agentModels : [], '', 'Loading CLI model options…');
  const current = () => request === modelRequest && owned.isCurrent() && getAgentHostAgent() === requestedAgent && getChatBackend() === backend;
  const unchanged = () => current() && getAgentHostTarget(requestedAgent) === initialTarget && getAgentHostModel() === initialModel && getAgentHostEffort() === initialEffort;
  let requestedTarget = '';
  const initiatingConnection = captureAgentConnection();
  let connection: ReturnType<typeof captureAgentConnection> | null = null;
  try {
    const agent = requestedAgent;
    await connectDetectedAgent(agent,{ isCurrent:() => unchanged() && initiatingConnection.isCurrent() });
    if (!unchanged()) return;
    connection = captureAgentConnection();
    const targets = await listAgentExecutionTargets({
      endpoint: connection.endpoint, token: connection.token, agent,
    });
    if (!unchanged() || !connection.isCurrent()) return;
    agentTargets = targets;
    if (!agentTargets.some(target => target.id === getAgentHostTarget(agent))) {
      await saveAgentChatSettings({ target: 'local' });
      if (!current() || !connection.isCurrent()) return;
    }
    const activeTarget = agentTargets.find(target => target.id === getAgentHostTarget(agent));
    if (activeTarget?.status === 'unavailable') {
      throw new Error(activeTarget.message || 'This personal gateway is currently offline.');
    }
    const selectedModel = getAgentHostModel();
    const selectedEffort = getAgentHostEffort();
    const target = getAgentHostTarget(agent);
    requestedTarget = target;
    const models = await listAgentModels({
      endpoint: connection.endpoint,
      token: connection.token,
      agent,
      target,
      model: selectedModel || undefined,
    });
    if (!current() || !connection.isCurrent() || getAgentHostAgent() !== agent || getAgentHostTarget(agent) !== target || getAgentHostModel() !== selectedModel || getAgentHostEffort() !== selectedEffort) return;
    agentModels = cacheAgentModelCatalog(models, agent, target);
    agentModelsAgentId = agent;
    agentModelsTargetId = target;
    showAgentModelControls(options, agentModels);
  } catch (error) {
    if (!current() || !(connection || initiatingConnection).isCurrent() || getAgentHostAgent() !== requestedAgent
      || (requestedTarget && getAgentHostTarget(requestedAgent) !== requestedTarget)) return;
    agentModels = []; agentModelsAgentId = ''; agentModelsTargetId = '';
    showAgentModelControls(options, [], error instanceof Error ? error.message : 'Could not load this execution target. Check its connection, then try again.');
    console.warn('[agent-chat] CLI model discovery failed', error);
  }
}

export const testLocalCodex = (agent = getAgentHostAgent()) => cliController.test(agent || getAgentHostAgent());
export const toggleLocalCodex = (enabled: boolean, agent = getAgentHostAgent()) => cliController.toggle(enabled,agent || getAgentHostAgent());

function captureModelSelection() {
  const request = ++selectionRequest;
  ++modelRequest;
  const owner = getCliAgentModelsView();
  const viewCurrent = () => owner?.isCurrent() === true;
  const agent = getAgentHostAgent(), target = getAgentHostTarget(agent), model = getAgentHostModel(), effort = getAgentHostEffort(), backend = getChatBackend();
  const current = () => request === selectionRequest && viewCurrent() && getAgentHostAgent() === agent && getAgentHostTarget(agent) === target && getChatBackend() === backend;
  const unchanged = () => current() && getAgentHostModel() === model && getAgentHostEffort() === effort;
  const currentAfterTarget = (nextTarget: string) => request === selectionRequest && viewCurrent() && getAgentHostAgent() === agent && getAgentHostTarget(agent) === nextTarget && getChatBackend() === backend;
  return { current, unchanged, currentAfterTarget };
}

export async function setCLIAgentModel(model: string) {
  const operation = captureModelSelection();
  if (!operation.unchanged()) return;
  const initiatingConnection = captureAgentConnection();
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  let connection: ReturnType<typeof captureAgentConnection> | null = null;
  try {
    await connectDetectedAgent(agent,{ isCurrent:() => operation.unchanged() && initiatingConnection.isCurrent() });
    if (!operation.unchanged()) return;
    connection = captureAgentConnection();
    const models = await listAgentModels({
      endpoint: connection.endpoint, token: connection.token, agent,
      target, model: model || undefined,
    });
    if (!operation.unchanged() || !connection.isCurrent()) return;
    agentModels = cacheAgentModelCatalog(models, agent, target);
    agentModelsAgentId = agent;
    agentModelsTargetId = target;
    await saveAgentChatSettings({ model });
    if (!operation.current() || !connection.isCurrent()) return;
    const selected = selectedModelEntry(agentModels, model);
    const provider = getCLIAgentModelProvider(agent, selected);
    if (provider) agentProviderFilter = provider;
    showNotification(model ? 'CLI model updated for getbased' : 'getbased will use the CLI default model', 'success');
    const options = document.getElementById('cli-agent-options');
    if (options?.isConnected) showAgentModelControls(options, agentModels);
  } catch (error) {
    if (!operation.unchanged() || !(connection || initiatingConnection).isCurrent()) return;
    showNotification(error instanceof Error ? error.message : 'Could not select this CLI model.', 'error', 9000);
  }
}

export async function setCLIAgentTarget(target: string) {
  const operation = captureModelSelection();
  if (!operation.unchanged()) return;
  const initiatingConnection = captureAgentConnection();
  const agent = getAgentHostAgent();
  let connection: ReturnType<typeof captureAgentConnection> | null = null;
  try {
    await connectDetectedAgent(agent,{ isCurrent:() => operation.unchanged() && initiatingConnection.isCurrent() });
    if (!operation.unchanged()) return;
    connection = captureAgentConnection();
    const targets = await listAgentExecutionTargets({
      endpoint: connection.endpoint, token: connection.token, agent,
    });
    if (!operation.unchanged() || !connection.isCurrent()) return;
    const selected = targets.find(item => item.id === target);
    if (!selected) throw new Error('This execution target is no longer available.');
    await saveAgentChatSettings({ target });
    if (!operation.currentAfterTarget(target) || !connection.isCurrent()) return;
    agentTargets = targets;
    agentModels = [];
    agentModelsAgentId = '';
    agentModelsTargetId = '';
    agentProviderFilter = '';
    const options = document.getElementById('cli-agent-options');
    if (options?.isConnected) {
      showAgentModelControls(options, [], selected.status === 'unavailable' ? (selected.message || 'This gateway is currently offline. Start it, then check the connection again.') : '',
        selected.status === 'unavailable' ? '' : 'Loading models for this execution target…');
      if (selected.status !== 'unavailable') void hydrateAgentModelControls();
    }
    showNotification(selected.kind === 'gateway'
      ? `Personal agent selected: ${selected.label}` : 'Local CLI execution selected', 'success', 7000);
  } catch (error) {
    if (!operation.unchanged() || !(connection || initiatingConnection).isCurrent()) return;
    showNotification(error instanceof Error ? error.message : 'Could not select this execution target.', 'error', 9000);
  }
}

export async function setCLIAgentEffort(effort: string) {
  const operation = captureModelSelection();
  if (!operation.unchanged()) return;
  const initiatingConnection = captureAgentConnection();
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  await saveAgentChatSettings({ effort });
  if (!operation.current() || !initiatingConnection.isCurrent()) return;
  showNotification(effort ? `Reasoning set to ${effort}` : 'The agent will use its default reasoning effort', 'success');
  const options = document.getElementById('cli-agent-options');
  if (options?.isConnected && agentModelsAgentId === agent && agentModelsTargetId === target) showAgentModelControls(options, agentModels);
  else if (options?.isConnected) {
    showAgentModelControls(options, [], '', 'Refreshing CLI model options…');
    void hydrateAgentModelControls();
  }
}

export function resizeCLICompanionPanel(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>): void {
  const view = getCliAgentSettingsView();
  const companion = view?.getSnapshot().companion;
  if (!view || companion?.mode !== 'embedded') return;
  let expectedOrigin: string;
  try { expectedOrigin = new URL(companion.managementHref).origin; } catch { return; }
  if (event.origin !== expectedOrigin) return;
  // The component additionally verifies the live iframe's source browsing context.
  view.resizeFrame(event);
}
if (typeof document !== 'undefined') document.defaultView?.addEventListener('message',resizeCLICompanionPanel);

const cliController = createCliAgentSettingsController({
  view:getCliAgentSettingsView,platform:() => companionPlatformOverride || detectCompanionPlatform(),
  context:() => ({ agent:getAgentHostAgent(),target:getAgentHostTarget(),model:getAgentHostModel(),effort:getAgentHostEffort(),backend:getChatBackend() }),
  connection:() => ({ endpoint:getAgentHostEndpoint(),token:getAgentHostToken() }),
  companion:() => { const owner = getCliAgentSettingsView(); return owner ? presentedCompanions.get(owner) || null : null; },
  connect:connectDetectedAgent,models:listAgentModels,discover:discoverLocalChatAgents,save:saveAgentChatSettings,control:controlAgentHost,
  setBackend:setChatBackend,notify:showNotification,confirm:showConfirmDialog,clipboard:text => navigator.clipboard.writeText(text),
  refresh:refreshDetectedAgentList,resetModels:() => { ++selectionRequest; ++modelRequest; agentModels=[];agentTargets=[];agentModelsAgentId='';agentModelsTargetId='';hydratedAgentId='';agentProviderFilter=''; },
  busyChanged:busy => getCliAgentSettingsView()?.setBusy(busy),
});
