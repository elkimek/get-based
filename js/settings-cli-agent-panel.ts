import { mountCliAgentModels, getCliAgentModelsView, disposeCliAgentModels } from './cli-agent-models-component.js';
import { buildCliAgentModelsSnapshot, selectedModelEntry, getCLIAgentModelProvider } from './cli-agent-models-presentation.js';
import type { AgentModel } from './agent-model-catalog.js';
import type { AgentExecutionTarget } from './agent-chat-client.js';
import type { DiscoveredAgent } from './agent-host-discovery.js';

type CompanionPlatform = 'linux' | 'macos' | 'windows';
interface CompanionLocation { origin?: string; hostname?: string }
interface CompanionNavigator { userAgentData?: { platform?: string }; platform?: string; userAgent?: string }
// settings-cli-agent-panel.js — Settings → AI → CLI agents rendering/actions.

import { controlAgentHost, listAgentExecutionTargets, listAgentModels } from './agent-chat-client.js';
import { cacheAgentModelCatalog } from './agent-model-catalog.js';
import { renderCLIAgentBrandIcon } from './cli-agent-brand-assets.js';
import { AGENT_HOST_CAPABILITIES, isAllowedCompanionManagementParent } from '../shared/agent-host-protocol.js';
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
import { escapeAttr, escapeHTML, showConfirmDialog, showNotification } from './utils.js';

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
  const button = document.querySelector('[data-settings-action="toggle-cli-agent-options"]');
  const options = document.getElementById('cli-agent-options');
  if (!button || !options) return;
  options.hidden = !options.hidden;
  button.setAttribute('aria-expanded', String(!options.hidden));
  if (options.hidden) collapsedAgentOptions.add(getAgentHostAgent());
  else collapsedAgentOptions.delete(getAgentHostAgent());
}
let companionPlatformOverride: CompanionPlatform | '' = '';

export function detectCompanionPlatform(navigatorLike: CompanionNavigator = globalThis.navigator || {}) {
  const value = String(navigatorLike.userAgentData?.platform || navigatorLike.platform || navigatorLike.userAgent || '').toLowerCase();
  if (value.includes('win')) return ('windows' as const);
  if (value.includes('mac')) return ('macos' as const);
  return ('linux' as const);
}

function getCompanionDownloadOrigin(location: CompanionLocation = {}) {
  return String(location.origin ?? globalThis.location?.origin ?? 'https://app.getbased.health').replace(/\/$/, '');
}

export function getCompanionCommand(platform: CompanionPlatform, action: 'run' | 'install' | 'start', location: CompanionLocation = {}) {
  const url = `${getCompanionDownloadOrigin(location)}/getbased-companion.mjs`;
  if (platform === 'windows') {
    return `$ErrorActionPreference='Stop'; $p=Join-Path $env:TEMP 'getbased-companion.mjs'; Invoke-WebRequest '${url}' -OutFile $p; node $p ${action}`;
  }
  return `curl -fsSL '${url}' -o "\${TMPDIR:-/tmp}/getbased-companion.mjs" && node "\${TMPDIR:-/tmp}/getbased-companion.mjs" ${action}`;
}

export function getLinuxCompanionInstallCommand(location: CompanionLocation = {}) {
  return getCompanionCommand('linux', 'install', location);
}

export function getLinuxCompanionRunCommand(location: CompanionLocation = {}) {
  return getCompanionCommand('linux', 'run', location);
}

function renderCompanionSetup() {
  const platform = companionPlatformOverride || detectCompanionPlatform();
  const runCommand = getCompanionCommand(platform, 'run');
  const startCommand = getCompanionCommand(platform, 'start');
  const terminal = platform === 'windows' ? 'PowerShell' : 'Terminal';
  return `<div class="local-agent-install-card" role="region" aria-label="Connect local CLI agents">
    <div class="local-agent-install-copy">
      <strong>Connect your installed CLI agents</strong>
      <p>A browser cannot launch a local program by itself. Copy this one bootstrap command into ${terminal}, then select <strong>Check connection</strong>. Once connected, getbased can install and manage the companion directly.</p>
    </div>
    <div class="local-agent-platforms" role="group" aria-label="Operating system">
      ${[['linux', 'Linux'], ['macos', 'macOS'], ['windows', 'Windows']].map(([value, label]) => `<button type="button" class="import-btn settings-mini-btn${platform === value ? ' active' : ''}" aria-pressed="${platform === value}" data-settings-action="set-cli-companion-platform" data-value="${value}">${label}</button>`).join('')}
    </div>
    <div class="local-agent-install-options local-agent-install-options-single">
      <div class="local-agent-install-option">
        <div><strong>Connect once</strong><span>Downloads one open-source file to your temporary folder. Nothing is installed automatically.</span></div>
        <code title="${escapeAttr(runCommand)}">${escapeHTML(runCommand)}</code>
        <button type="button" class="import-btn import-btn-primary settings-mini-btn" data-settings-action="copy-cli-companion-run">Copy connection command</button>
      </div>
    </div>
    <small>Already installed but stopped? <button type="button" class="settings-link-btn" data-settings-action="copy-cli-companion-start" data-command="${escapeAttr(startCommand)}">Copy the start command</button>. Requires Node.js 20+ and at least one configured supported CLI. No port or pairing token is needed. <a href="https://github.com/elkimek/get-based/blob/main/bin/getbased-companion.js" target="_blank" rel="noopener">Review the source on GitHub</a>.</small>
  </div>`;
}

export function setCLICompanionPlatform(platform: string) {
  if (!['linux', 'macos', 'windows'].includes(platform)) return;
  companionPlatformOverride = (platform as CompanionPlatform);
  const card = document.querySelector('.local-agent-install-card');
  if (card) card.outerHTML = renderCompanionSetup();
}

export async function copyCLICompanionRunCommand() {
  try {
    const platform = companionPlatformOverride || detectCompanionPlatform();
    await navigator.clipboard.writeText(getCompanionCommand(platform, 'run'));
    const terminal = platform === 'windows' ? 'PowerShell' : 'Terminal';
    showNotification(`Run-once command copied. Paste it into ${terminal}, then check the connection.`, 'success', 7000);
  } catch {
    showNotification('Could not access the clipboard', 'error');
  }
}

export async function copyCLICompanionStartCommand() {
  try {
    const platform = companionPlatformOverride || detectCompanionPlatform();
    await navigator.clipboard.writeText(getCompanionCommand(platform, 'start'));
    showNotification(`Start command copied. Paste it into ${platform === 'windows' ? 'PowerShell' : 'Terminal'}.`, 'success', 7000);
  } catch {
    showNotification('Could not access the clipboard', 'error');
  }
}

export async function copyCLICompanionUpdateCommand() {
  try {
    const platform = companionPlatformOverride || detectCompanionPlatform();
    await navigator.clipboard.writeText(getCompanionCommand(platform, 'install'));
    showNotification(`Update command copied. Run it in ${platform === 'windows' ? 'PowerShell' : 'Terminal'}, then check the connection.`, 'success', 8000);
  } catch {
    showNotification('Could not access the clipboard', 'error');
  }
}

export async function copyCLIAgentLoginCommand(agentId: string) {
  const command = agentId === 'claude' ? 'claude auth login --console' : agentId === 'codex' ? 'codex login' : '';
  if (!command) return;
  try {
    await navigator.clipboard.writeText(command);
    showNotification(`${agentId === 'claude' ? 'Claude Agent' : 'Codex'} sign-in command copied`, 'success');
  } catch { showNotification('Could not access the clipboard', 'error'); }
}

export function renderCLIAgentProviderPanel() {
  queueMicrotask(() => { void refreshDetectedAgentList({ refresh: true }); });
  return `
    <div class="ai-provider-panel cli-agent-provider-panel" data-ai-provider-mode="cli">
      <div class="local-agent-chat-head">
        <div class="settings-copy">
          <div id="local-agent-chat-title" class="settings-copy-title">CLI agents</div>
          <div class="settings-copy-desc">Use an installed agent with its existing account or configured model provider. A small local companion connects the browser to CLI programs on this computer.</div>
        </div>
        <button class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="rescan-cli-agents">Check connection</button>
      </div>
      <div class="local-agent-capability-note"><strong>One assistant across getbased.</strong> The selected CLI agent powers chat, supported image and document imports, summaries, explanations, and other AI features. It can read enabled active-profile context through constrained tools; any proposed data change stays a draft until you apply it.</div>
      <div class="local-agent-list-kicker">Installed CLIs</div>
      <div id="local-agent-list" class="local-agent-list" aria-live="polite">
        <div class="local-agent-scan-state"><span class="local-agent-spinner" aria-hidden="true"></span>Scanning this computer…</div>
      </div>
      <div id="local-agent-companion-section" class="local-agent-companion-section"></div>
      <div id="local-agent-status" class="sr-only" role="status" aria-live="polite"></div>
      <details class="local-agent-details">
        <summary>How CLI agents work</summary>
        <p>getbased uses a local companion and the selected agent&rsquo;s existing sign-in. Connection details stay hidden. Local CLI sessions receive health data only through getbased&rsquo;s approved tools; permission prompts, shell, local files, browser control, plugins, and other computer capabilities stay off. A personal gateway may use tools already configured there under that gateway&rsquo;s own approval policy, but it does not receive getbased&rsquo;s local tools. Focused feature jobs such as imports receive no getbased tools.</p>
      </details>
    </div>`;
}

export { getCLIAgentModelProvider } from './cli-agent-models-presentation.js';

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
  host.classList.remove('local-agent-options-loading');
  return mountCliAgentModels(host, { ...modelsSnapshot(models), error, loading }, (action,value): unknown => {
    if (action === 'set-cli-agent-provider-filter') return setCLIAgentProviderFilter(value);
    if (action === 'set-cli-agent-model') return setCLIAgentModel(value);
    if (action === 'set-cli-agent-target') return setCLIAgentTarget(value);
    return setCLIAgentEffort(value);
  });
}

function renderDetectedAgent(agent: DiscoveredAgent) {
  const selected = agent.id === getAgentHostAgent() && getChatBackend() === 'codex';
  const isReady = agent.status === 'available';
  const expandable = selected && isReady;
  const collapsed = collapsedAgentOptions.has(agent.id);
  const isPaused = agent.status === 'paused' || agent.paused === true;
  const statusLabel = isReady ? 'Ready · companion running'
    : isPaused ? 'Companion paused'
      : agent.status === 'starting' ? 'Companion starting…'
        : agent.status === 'login_required' ? (agent.message || 'Installed · sign-in required')
          : agent.compatible ? 'Installed · companion not running' : 'Installed · adapter unavailable';
  return `
    <div class="local-agent-row${agent.compatible ? ' local-agent-row-compatible' : ''}">
      <div class="local-agent-row-main">
        <div class="local-agent-icon local-agent-icon-${escapeHTML(agent.id)}" aria-hidden="true">${renderCLIAgentBrandIcon(agent.id)}</div>
        ${expandable ? `<button type="button" class="local-agent-copy local-agent-disclosure" data-settings-action="toggle-cli-agent-options" aria-expanded="${!collapsed}" aria-controls="cli-agent-options">` : '<div class="local-agent-copy">'}
          <span class="local-agent-name">${escapeHTML(agent.name || agent.id)}${expandable ? '<span class="local-agent-chevron" aria-hidden="true">⌄</span>' : ''}</span>
          <span class="local-agent-meta">${escapeHTML(agent.description || '')}${agent.version ? ` · ${escapeHTML(agent.version)}` : ''}</span>
          <span class="local-agent-state"><span class="local-agent-dot ${isReady ? 'is-ready' : ''}"></span>${escapeHTML(statusLabel)}</span>
        ${expandable ? '</button>' : '</div>'}
        ${agent.status === 'login_required' && ['codex', 'claude'].includes(agent.id)
    ? `<button class="import-btn import-btn-secondary settings-mini-btn local-agent-test" data-settings-action="copy-cli-agent-login" data-value="${escapeAttr(agent.id)}">Copy sign-in command</button>` : ''}
        ${agent.compatible ? `
          <button class="import-btn import-btn-secondary settings-mini-btn local-agent-test" data-settings-action="test-cli-codex" data-value="${escapeAttr(agent.id)}"${isReady ? '' : ` disabled title="${isPaused ? 'Resume the companion first' : agent.status === 'login_required' ? 'Sign in to this CLI first' : 'Start the companion first'}"`}>Test</button>
          <label class="chat-websearch-toggle-label sync-settings-toggle local-agent-toggle">
            <input type="checkbox" aria-label="Use ${escapeAttr(agent.name)} in getbased" data-settings-action="toggle-cli-codex" data-agent="${escapeAttr(agent.id)}"${selected ? ' checked' : ''}${isReady ? '' : ' disabled'}>
            <span class="chat-toggle-slider sync-settings-toggle-slider"></span>
          </label>` : ''}
      </div>
      ${expandable ? `<div id="cli-agent-options" class="local-agent-options-loading"${collapsed ? ' hidden' : ''}>Loading ${escapeHTML(agent.name)} models…</div>` : ''}
    </div>`;
}

function renderCompanionControls(agent: DiscoveredAgent) {
  const paused = agent.status === 'paused' || agent.paused === true;
  const installed = agent.runtimeMode === 'installed';
  const canControl = agent.capabilities?.includes(AGENT_HOST_CAPABILITIES.COMPANION_CONTROL) === true;
  const canRestart = agent.capabilities?.includes(AGENT_HOST_CAPABILITIES.COMPANION_RESTART) === true;
  if (!canControl || (installed && !canRestart)) {
    return `<div class="local-agent-list-kicker local-agent-companion-kicker">Companion</div>
    <div class="local-agent-controls local-agent-controls-outdated" aria-label="Companion update required">
      <div class="local-agent-controls-copy">
        <strong>Update required</strong>
        <span>This companion needs an update to support the current controls. Restarting the same file will not update it.</span>
      </div>
      <div class="local-agent-control-actions">
        <button type="button" class="import-btn import-btn-primary settings-mini-btn" data-settings-action="copy-cli-companion-update">Copy one-time update command</button>
      </div>
    </div>`;
  }
  const modeLabel = installed ? 'Starts automatically at login' : 'Connected for this terminal session';
  if (agent.controlAuthorized === false || agent.capabilities?.includes(AGENT_HOST_CAPABILITIES.COMPANION_MANAGEMENT_EMBEDDED)) {
    const managementURL = new URL(agent.endpoint || getAgentHostEndpoint());
    managementURL.hostname = '127.0.0.1';
    managementURL.pathname = '/manage';
    managementURL.search = '';
    managementURL.hash = '';
    const canEmbedHere = isAllowedCompanionManagementParent(globalThis.location.origin);
    if (canEmbedHere && agent.capabilities?.includes(AGENT_HOST_CAPABILITIES.COMPANION_MANAGEMENT_EMBEDDED)) {
      managementURL.pathname = '/manage/embed';
      managementURL.searchParams.set('parentOrigin', globalThis.location.origin);
      managementURL.searchParams.set('theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
      return `<div class="local-agent-list-kicker local-agent-companion-kicker">Companion</div>
      <iframe class="local-agent-management-frame" title="Companion controls" src="${escapeAttr(managementURL.href)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>`;
    }
    const managementLink = agent.capabilities?.includes(AGENT_HOST_CAPABILITIES.COMPANION_MANAGEMENT)
      ? `<a class="import-btn import-btn-secondary settings-mini-btn local-agent-management-link" href="${escapeAttr(managementURL.href)}" target="_blank" rel="noopener noreferrer">Manage Companion</a>` : '';
    return `<div class="local-agent-list-kicker local-agent-companion-kicker">Companion</div>
    <div class="local-agent-controls"><div class="local-agent-controls-copy"><strong>Connected for chat</strong>
    <span>${escapeHTML(modeLabel)} · ${escapeHTML(managementURL.host)}${agent.companionVersion ? ` · v${escapeHTML(agent.companionVersion)}` : ''}</span>
    <span>${managementLink ? (canEmbedHere ? 'Update Companion once to manage it directly in Settings. Until then, its controls open in local management.' : 'Open local management to control Companion from this deployment.') : 'Update Companion to enable its local management page. Until then, manage it from the terminal.'}</span></div>
    <div class="local-agent-control-actions">${managementLink}
    <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="copy-cli-companion-update">Copy update command</button></div></div>`;
  }
  return `<div class="local-agent-list-kicker local-agent-companion-kicker">Companion</div>
  <div class="local-agent-controls" aria-label="Companion controls">
    <div class="local-agent-controls-copy">
      <strong>Companion</strong>
      <span>${escapeHTML(modeLabel)}${agent.companionVersion ? ` · v${escapeHTML(agent.companionVersion)}` : ''}</span>
    </div>
    <div class="local-agent-control-actions">
      <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="${paused ? 'resume' : 'pause'}">${paused ? 'Resume' : 'Pause'}</button>
      <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="restart"${paused ? ' disabled title="Resume the companion first"' : ' title="Close and reopen the CLI agent connections without stopping the companion"'}>Reconnect CLIs</button>
      ${installed
    ? '<button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="restart-companion" title="Restart the getbased Companion service">Restart companion</button><button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="update">Check for update</button><button type="button" class="import-btn settings-mini-btn local-agent-danger" data-settings-action="control-cli-companion" data-value="uninstall">Uninstall</button>'
    : '<button type="button" class="import-btn import-btn-primary settings-mini-btn" data-settings-action="control-cli-companion" data-value="install">Start automatically</button>'}
    </div>
  </div>`;
}

export async function refreshDetectedAgentList(options: { refresh?: boolean | undefined } = {}) {
  const list = document.getElementById('local-agent-list');
  if (!list) return;
  const request = ++discoveryRequest;
  const current = () => request === discoveryRequest && list.isConnected && document.getElementById('local-agent-list') === list;
  const companionSection = document.getElementById('local-agent-companion-section');
  disposeCliAgentModels();
  ++modelRequest;
  list.innerHTML = '<div class="local-agent-scan-state"><span class="local-agent-spinner" aria-hidden="true"></span>Scanning this computer…</div>';
  if (companionSection) companionSection.innerHTML = '';
  try {
    const agents = await discoverLocalChatAgents({ refresh: options.refresh });
    if (!current()) return;
    const agentRows = agents.length ? agents.map(renderDetectedAgent).join('') : '';
    const companion = agents.find(agent => agent.id === getAgentHostAgent() && agent.compatible
      && ['available', 'paused', 'login_required'].includes(agent.status))
      || agents.find(agent => agent.compatible && ['available', 'paused', 'login_required'].includes(agent.status));
    const companionReady = Boolean(companion || agents.some(agent => agent.compatible && agent.status === 'starting'));
    list.innerHTML = `${agentRows}${companionReady ? '' : renderCompanionSetup()}`;
    if (companionSection && companion) companionSection.innerHTML = renderCompanionControls(companion);
    if (getChatBackend() === 'codex' && agents.some(agent => agent.id === getAgentHostAgent() && agent.compatible && agent.status === 'available')) {
      void hydrateAgentModelControls();
    }
  } catch (error) {
    if (!current()) return;
    list.innerHTML = '<div class="local-agent-scan-state local-agent-scan-error">CLI detection is unavailable.</div>';
    console.warn('[agent-chat] CLI detection failed', error);
  }
}

export async function controlCLICompanion(requestedAction: string): Promise<Awaited<ReturnType<typeof controlAgentHost>> | void> {
  if (!['pause', 'resume', 'install', 'restart', 'restart-companion', 'update', 'uninstall'].includes(requestedAction)) return;
  const action = (requestedAction as Parameters<typeof controlAgentHost>[0]['action']);
  if (action === 'uninstall' && !await showConfirmDialog(
    'Remove the getbased Companion from automatic startup? The current connection will remain available until this session ends.',
  )) return;
  try {
    const agents = await discoverLocalChatAgents({ refresh: true });
    const companion = agents.find(agent => agent.compatible
      && ['available', 'paused'].includes(agent.status) && agent.endpoint && agent.token);
    if (!companion) throw new Error('The getbased Companion is not running. Use the connection command first.');
    const result = await controlAgentHost({ endpoint: companion.endpoint!, token: companion.token!, action });
    if (action === 'pause') {
      if (getChatBackend() === 'codex') setChatBackend('direct');
      showNotification('Companion paused. getbased switched to direct AI.', 'success');
    } else if (action === 'resume') showNotification('Companion resumed', 'success');
    else if (action === 'restart') showNotification('CLI connections reopened', 'success');
    else if (action === 'restart-companion') showNotification('Companion is restarting. It will reconnect in a moment.', 'success', 7000);
    else if (action === 'install') showNotification('Companion will now start automatically at login', 'success', 7000);
    else if (action === 'uninstall') showNotification('Companion removed from automatic startup', 'success', 7000);
    else if (action === 'update') showNotification(result.restartRequired
      ? 'Update installed. Select Restart companion to use it now.'
      : 'Companion is up to date', 'success', 8000);
    if (action === 'restart-companion') {
      setTimeout(() => { void refreshDetectedAgentList({ refresh: true }); }, 1800);
    } else {
      await refreshDetectedAgentList({ refresh: true });
    }
    return result;
  } catch (error) {
    showNotification(error instanceof Error ? error.message : 'Could not manage the companion.', 'error', 9000);
  }
}

function captureAgentConnection() {
  const endpoint = getAgentHostEndpoint(), token = getAgentHostToken();
  return { endpoint, token, isCurrent: () => getAgentHostEndpoint() === endpoint && getAgentHostToken() === token };
}

async function hydrateAgentModelControls() {
  const options = document.getElementById('cli-agent-options');
  if (!options) return;
  const request = ++modelRequest;
  const requestedAgent = getAgentHostAgent();
  const initialTarget = getAgentHostTarget(requestedAgent), initialModel = getAgentHostModel(), initialEffort = getAgentHostEffort(), backend = getChatBackend();
  if (hydratedAgentId !== requestedAgent) {
    hydratedAgentId = requestedAgent; agentProviderFilter = ''; agentTargets = [];
  }
  const owned = showAgentModelControls(options, [], '', 'Loading CLI model options…');
  const current = () => request === modelRequest && owned.isCurrent() && getAgentHostAgent() === requestedAgent && getChatBackend() === backend;
  const unchanged = () => current() && getAgentHostTarget(requestedAgent) === initialTarget && getAgentHostModel() === initialModel && getAgentHostEffort() === initialEffort;
  let requestedTarget = '';
  let connection: ReturnType<typeof captureAgentConnection> | null = null;
  try {
    const agent = requestedAgent;
    await connectDetectedAgent(agent);
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
    if (!current() || (connection && !connection.isCurrent()) || getAgentHostAgent() !== requestedAgent
      || (requestedTarget && getAgentHostTarget(requestedAgent) !== requestedTarget)) return;
    agentModels = []; agentModelsAgentId = ''; agentModelsTargetId = '';
    showAgentModelControls(options, [], error instanceof Error ? error.message : 'Could not load this execution target. Check its connection, then try again.');
    console.warn('[agent-chat] CLI model discovery failed', error);
  }
}

export async function testLocalCodex(agentId = getAgentHostAgent()) {
  agentId ||= getAgentHostAgent();
  const status = document.getElementById('local-agent-status');
  if (status) status.textContent = 'Testing CLI agent…';
  try {
    await connectDetectedAgent(agentId);
    await listAgentModels({
      endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), agent: agentId,
      target: agentId === getAgentHostAgent() ? getAgentHostTarget(agentId) : 'local',
    });
    if (status) status.textContent = 'CLI agent is ready.';
    showNotification('CLI agent is ready', 'success');
    await refreshDetectedAgentList();
  } catch (error) {
    if (status) status.textContent = 'CLI agent could not connect.';
    showNotification(error instanceof Error ? error.message : 'CLI agent could not connect.', 'error', 9000);
  }
}

export async function toggleLocalCodex(enabled: boolean, agentId = getAgentHostAgent()) {
  agentId ||= getAgentHostAgent();
  if (!enabled) {
    setChatBackend('direct');
    showNotification('API or Local AI selected for chat', 'success');
    await refreshDetectedAgentList();
    return;
  }
  try {
    await connectDetectedAgent(agentId);
    await saveAgentChatSettings({ agent: agentId });
    agentModels = [];
    agentTargets = [];
    agentModelsAgentId = '';
    agentModelsTargetId = '';
    hydratedAgentId = '';
    agentProviderFilter = '';
    setChatBackend('codex');
    showNotification('CLI agent selected for chat', 'success');
  } catch (error) {
    setChatBackend('direct');
    showNotification(error instanceof Error ? error.message : 'CLI agent could not connect.', 'error', 9000);
  }
  await refreshDetectedAgentList();
}

function captureModelSelection() {
  const request = ++selectionRequest;
  ++modelRequest;
  const owner = getCliAgentModelsView();
  const panel = document.getElementById('ai-provider-panel');
  const viewCurrent = () => owner ? owner.isCurrent() : !panel || (panel.isConnected && document.getElementById('ai-provider-panel') === panel);
  const agent = getAgentHostAgent(), target = getAgentHostTarget(agent), model = getAgentHostModel(), effort = getAgentHostEffort(), backend = getChatBackend();
  const current = () => request === selectionRequest && viewCurrent() && getAgentHostAgent() === agent && getAgentHostTarget(agent) === target && getChatBackend() === backend;
  const unchanged = () => current() && getAgentHostModel() === model && getAgentHostEffort() === effort;
  const currentAfterTarget = (nextTarget: string) => request === selectionRequest && viewCurrent() && getAgentHostAgent() === agent && getAgentHostTarget(agent) === nextTarget && getChatBackend() === backend;
  return { current, unchanged, currentAfterTarget };
}

export async function setCLIAgentModel(model: string) {
  const operation = captureModelSelection();
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  let connection: ReturnType<typeof captureAgentConnection> | null = null;
  try {
    await connectDetectedAgent(agent);
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
    if (!operation.current()) return;
    const selected = selectedModelEntry(agentModels, model);
    const provider = getCLIAgentModelProvider(agent, selected);
    if (provider) agentProviderFilter = provider;
    showNotification(model ? 'CLI model updated for getbased' : 'getbased will use the CLI default model', 'success');
    const options = document.getElementById('cli-agent-options');
    if (options?.isConnected) showAgentModelControls(options, agentModels);
  } catch (error) {
    if (!operation.unchanged() || (connection && !connection.isCurrent())) return;
    showNotification(error instanceof Error ? error.message : 'Could not select this CLI model.', 'error', 9000);
  }
}

export async function setCLIAgentTarget(target: string) {
  const operation = captureModelSelection();
  const agent = getAgentHostAgent();
  let connection: ReturnType<typeof captureAgentConnection> | null = null;
  try {
    await connectDetectedAgent(agent);
    if (!operation.unchanged()) return;
    connection = captureAgentConnection();
    const targets = await listAgentExecutionTargets({
      endpoint: connection.endpoint, token: connection.token, agent,
    });
    if (!operation.unchanged() || !connection.isCurrent()) return;
    const selected = targets.find(item => item.id === target);
    if (!selected) throw new Error('This execution target is no longer available.');
    await saveAgentChatSettings({ target });
    if (!operation.currentAfterTarget(target)) return;
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
    if (!operation.unchanged() || (connection && !connection.isCurrent())) return;
    showNotification(error instanceof Error ? error.message : 'Could not select this execution target.', 'error', 9000);
  }
}

export async function setCLIAgentEffort(effort: string) {
  const operation = captureModelSelection();
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  if (!operation.unchanged()) return;
  await saveAgentChatSettings({ effort });
  if (!operation.current()) return;
  showNotification(effort ? `Reasoning set to ${effort}` : 'The agent will use its default reasoning effort', 'success');
  const options = document.getElementById('cli-agent-options');
  if (options?.isConnected && agentModelsAgentId === agent && agentModelsTargetId === target) showAgentModelControls(options, agentModels);
  else if (options?.isConnected) {
    showAgentModelControls(options, [], '', 'Refreshing CLI model options…');
    void hydrateAgentModelControls();
  }
}

export function resizeCLICompanionPanel(event: Pick<MessageEvent<{ type?: unknown; height?: unknown } | null | undefined>, 'data' | 'origin' | 'source'>) {
  if (event.data?.type !== 'getbased-companion-panel-size' || !Number.isFinite(event.data.height)) return;
  const frame = (document.querySelector('.local-agent-management-frame') as HTMLIFrameElement | null);
  if (!frame || event.source !== frame.contentWindow || event.origin !== new URL(frame.src).origin) return;
  frame.style.height = `${Math.max(64, Math.min(800, Math.ceil(event.data.height as number)))}px`;
  const styles = getComputedStyle(frame);
  frame.contentWindow?.postMessage({
    type: 'getbased-companion-panel-theme',
    colors: Object.fromEntries(Object.entries({ bg: '--bg-card', text: '--text-primary', muted: '--text-muted', border: '--border', button: '--bg-card', accent: '--accent' })
      .map(([name, variable]) => [name, styles.getPropertyValue(variable).trim()])),
  }, event.origin);
}

if (typeof document !== 'undefined') {
  document.defaultView?.addEventListener('message', resizeCLICompanionPanel);
}
