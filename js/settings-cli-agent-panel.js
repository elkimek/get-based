// @ts-check
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

/** @typedef {{reasoningEffort: string, description: string}} AgentReasoningEffort */
/** @typedef {{id: string, model: string, displayName: string, description?: string, isDefault: boolean, defaultReasoningEffort: string, supportedReasoningEfforts: AgentReasoningEffort[], inputModalities?: string[]}} AgentModel */

/** @type {AgentModel[]} */
let agentModels = [];
/** @type {Array<{id: string, label: string, description?: string, kind?: string, status?: string, message?: string, supportsLocalTools?: boolean}>} */
let agentTargets = [];
let agentModelsAgentId = '';
let agentModelsTargetId = '';
let agentProviderFilter = '';
let hydratedAgentId = '';
const collapsedAgentOptions = new Set();

export function toggleCLIAgentOptions() {
  const button = document.querySelector('[data-settings-action="toggle-cli-agent-options"]');
  const options = document.getElementById('cli-agent-options');
  if (!button || !options) return;
  options.hidden = !options.hidden;
  button.setAttribute('aria-expanded', String(!options.hidden));
  if (options.hidden) collapsedAgentOptions.add(getAgentHostAgent());
  else collapsedAgentOptions.delete(getAgentHostAgent());
}
/** @type {'linux'|'macos'|'windows'|''} */
let companionPlatformOverride = '';

/** @param {{userAgentData?: {platform?: string}, platform?: string, userAgent?: string}} [navigatorLike] */
export function detectCompanionPlatform(navigatorLike = globalThis.navigator || {}) {
  const value = String(navigatorLike.userAgentData?.platform || navigatorLike.platform || navigatorLike.userAgent || '').toLowerCase();
  if (value.includes('win')) return /** @type {const} */ ('windows');
  if (value.includes('mac')) return /** @type {const} */ ('macos');
  return /** @type {const} */ ('linux');
}

function getCompanionDownloadOrigin(location = {}) {
  return String(location.origin ?? globalThis.location?.origin ?? 'https://app.getbased.health').replace(/\/$/, '');
}

/** @param {'linux'|'macos'|'windows'} platform @param {'run'|'install'|'start'} action @param {{origin?: string}} [location] */
export function getCompanionCommand(platform, action, location = {}) {
  const url = `${getCompanionDownloadOrigin(location)}/getbased-companion.mjs`;
  if (platform === 'windows') {
    return `$ErrorActionPreference='Stop'; $p=Join-Path $env:TEMP 'getbased-companion.mjs'; Invoke-WebRequest '${url}' -OutFile $p; node $p ${action}`;
  }
  return `curl -fsSL '${url}' -o "\${TMPDIR:-/tmp}/getbased-companion.mjs" && node "\${TMPDIR:-/tmp}/getbased-companion.mjs" ${action}`;
}

/**
 * @param {{hostname?: string, origin?: string}} [location]
 */
export function getLinuxCompanionInstallCommand(location = {}) {
  return getCompanionCommand('linux', 'install', location);
}

/**
 * Run the same auditable bundle only for the lifetime of the terminal. Hosted
 * pages download it to the operating system's temporary directory.
 * @param {{hostname?: string, origin?: string}} [location]
 */
export function getLinuxCompanionRunCommand(location = {}) {
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

/** @param {string} platform */
export function setCLICompanionPlatform(platform) {
  if (!['linux', 'macos', 'windows'].includes(platform)) return;
  companionPlatformOverride = /** @type {'linux'|'macos'|'windows'} */ (platform);
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

/** @param {string} agentId */
export async function copyCLIAgentLoginCommand(agentId) {
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

/** @param {AgentModel[]} models @param {string} selectedModel */
function selectedModelEntry(models, selectedModel) {
  return models.find(model => model.id === selectedModel || model.model === selectedModel)
    || models.find(model => model.isDefault)
    || models[0]
    || null;
}

/**
 * Render an in-page picker instead of a native select. Some Linux/Chromium
 * combinations open a native select beneath the pointer on mouse-down, then
 * immediately choose that option on mouse-up.
 * @param {{id: string, label: string, value: string, options: {value: string, label: string}[], action: string, disabled?: boolean, searchable?: boolean, placeholder?: string}} config
 */
function renderAgentPicker(config) {
  const selected = config.options.find(option => option.value === config.value)
    || (!config.value && !config.placeholder ? config.options[0] : null);
  const selectedLabel = selected?.label || config.placeholder || '';
  return `<label class="local-agent-option-label" for="${escapeAttr(config.id)}-summary"><span>${escapeHTML(config.label)}</span></label>
    <details class="cli-agent-picker"${config.disabled ? ' data-disabled="true"' : ''}>
      <summary id="${escapeAttr(config.id)}-summary" class="cli-agent-picker-summary"${config.disabled ? ' aria-disabled="true" tabindex="-1"' : ''}>
        <span title="${escapeAttr(selectedLabel)}">${escapeHTML(selectedLabel)}</span><span class="cli-agent-picker-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="cli-agent-picker-options"${config.searchable ? ' id="cli-agent-model-options"' : ''} role="listbox" aria-label="${escapeAttr(config.label)}">
        ${config.searchable ? `<div class="cli-agent-picker-search"><input type="search" data-cli-agent-model-search aria-label="Search models" placeholder="Search ${config.options.length} models"><span id="cli-agent-model-result-count">${config.options.length} models</span></div>` : ''}
        ${config.options.map(option => `<button type="button" role="option" aria-selected="${option.value === config.value}" data-settings-action="${escapeAttr(config.action)}" data-value="${escapeAttr(option.value)}"${config.searchable ? ` data-model-search="${escapeAttr(`${option.label} ${option.value}`.toLowerCase())}"` : ''}><span title="${escapeAttr(option.label)}">${escapeHTML(option.label)}</span>${option.value === config.value ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}
      </div>
    </details>`;
}

/** @param {string} agentId @param {AgentModel | null} model */
export function getCLIAgentModelProvider(agentId, model) {
  const id = String(model?.id || model?.model || '');
  if (agentId === 'opencode' || agentId === 'openclaw') return id.includes('/') ? id.slice(0, id.indexOf('/')) : '';
  if (agentId === 'hermes') {
    if (id.startsWith('custom:')) {
      const parts = id.split(':');
      return parts.length > 2 ? parts.slice(0, 2).join(':') : 'custom';
    }
    return id.includes(':') ? id.slice(0, id.indexOf(':')) : '';
  }
  return '';
}

/** @param {string} provider */
function agentProviderLabel(provider) {
  const known = {
    opencode: 'OpenCode', openrouter: 'OpenRouter', anthropic: 'Anthropic',
    'openai-codex': 'OpenAI Codex', openai: 'OpenAI', 'custom:ollama': 'Ollama',
    openclaw: 'OpenClaw', 'opencode-free': 'OpenCode Free', 'opencode-zen': 'OpenCode Zen',
    ollama: 'Ollama', 'ollama-cloud': 'Ollama Cloud', venice: 'Venice', xai: 'xAI',
    'custom:openrouter': 'OpenRouter (custom)',
  };
  return known[provider] || provider.split(/[-_]/).filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

/** @param {string} agentId @param {AgentModel} model */
function agentModelLabel(agentId, model) {
  const provider = getCLIAgentModelProvider(agentId, model);
  let label = model.displayName || model.id || model.model;
  if (provider && label.includes('/')) label = label.slice(label.indexOf('/') + 1);
  if (provider && label.includes(' · ')) label = label.slice(label.indexOf(' · ') + 3);
  const id = String(model.id || model.model || '').toLowerCase();
  const isFree = id === 'opencode/big-pickle' || id.endsWith(':free') || /(?:^|[-/])free(?:$|[-/])/.test(id);
  return `${label}${isFree && !label.toLowerCase().includes('free') ? ' · Free' : ''}`;
}

export function filterCLIAgentModelOptions(query) {
  const root = document.getElementById('cli-agent-model-options');
  if (!root) return;
  const normalized = String(query || '').trim().toLowerCase();
  const options = [...root.querySelectorAll('[data-model-search]')];
  let visible = 0;
  for (const option of options) {
    const matches = !normalized || String(option.getAttribute('data-model-search') || '').includes(normalized);
    option.toggleAttribute('hidden', !matches);
    if (matches) visible += 1;
  }
  const count = document.getElementById('cli-agent-model-result-count');
  if (count) count.textContent = `${visible} ${visible === 1 ? 'model' : 'models'}`;
}

export function setCLIAgentProviderFilter(provider) {
  agentProviderFilter = String(provider || '').slice(0, 80);
  const options = document.getElementById('cli-agent-options');
  if (options?.isConnected) showAgentModelControls(options, agentModels);
}

/** @param {AgentModel[]} models */
function renderAgentModelControls(models) {
  const agentId = getAgentHostAgent();
  const selectedTarget = getAgentHostTarget(agentId);
  const selectedModel = getAgentHostModel();
  const selectedEffort = getAgentHostEffort();
  const current = selectedModelEntry(models, selectedModel);
  const defaultModel = models.find(model => model.isDefault) || models[0] || null;
  const providers = [...new Set(models.map(model => getCLIAgentModelProvider(agentId, model)).filter(Boolean))];
  const selectedProvider = getCLIAgentModelProvider(agentId, current || defaultModel);
  if (!providers.includes(agentProviderFilter)) agentProviderFilter = selectedProvider || providers[0] || '';
  const visibleModels = agentProviderFilter
    ? models.filter(model => getCLIAgentModelProvider(agentId, model) === agentProviderFilter)
    : models;
  const modelOptions = [
    ...(!providers.length || getCLIAgentModelProvider(agentId, defaultModel) === agentProviderFilter
      ? [{ value: '', label: `CLI default${defaultModel ? ` · ${agentModelLabel(agentId, defaultModel)}` : ''}` }]
      : []),
    ...visibleModels.map(model => {
      const value = model.id || model.model;
      return { value, label: agentModelLabel(agentId, model) || value };
    }),
  ];
  if (selectedModel && !models.some(model => model.id === selectedModel || model.model === selectedModel)) {
    modelOptions.splice(1, 0, { value: selectedModel, label: `${selectedModel} · unavailable` });
  }
  const efforts = current?.supportedReasoningEfforts || [];
  const defaultEffort = current?.defaultReasoningEffort || '';
  const effortOptions = [
    { value: '', label: efforts.length ? `Default${defaultEffort ? ` · ${defaultEffort}` : ''}`
      : agentId === 'hermes' ? 'Uses Hermes setting' : 'Not offered by this model' },
    ...efforts.map(item => ({ value: item.reasoningEffort, label: item.reasoningEffort })),
  ];
  if (selectedEffort && !efforts.some(item => item.reasoningEffort === selectedEffort)) {
    effortOptions.push({ value: selectedEffort, label: `${selectedEffort} · unavailable` });
  }
  const agentName = ({ codex: 'Codex CLI', claude: 'Claude Agent', opencode: 'OpenCode', hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw' })[agentId] || 'the selected CLI';
  const reasoningNote = !efforts.length && agentId === 'hermes'
    ? ' Hermes ACP does not expose a separate reasoning control yet, so getbased uses your Hermes setting.' : '';
  const targetOptions = agentTargets.map(target => ({
    value: target.id,
    label: `${target.label}${target.status === 'unavailable' ? ' · offline' : ''}`,
  }));
  const selectedTargetEntry = agentTargets.find(target => target.id === selectedTarget);
  const personalTarget = selectedTargetEntry?.kind === 'gateway';
  return `<div class="local-agent-options${providers.length > 1 ? ' has-provider' : ''}${targetOptions.length > 1 ? ' has-target' : ''}">
    ${targetOptions.length > 1 ? `<div class="local-agent-option-field">${renderAgentPicker({ id: 'cli-agent-target', label: 'Execution', value: selectedTarget, options: targetOptions, action: 'set-cli-agent-target' })}</div>` : ''}
    ${providers.length > 1 ? `<div class="local-agent-option-field">${renderAgentPicker({ id: 'cli-agent-provider', label: 'Provider catalog', value: agentProviderFilter, options: providers.map(provider => ({ value: provider, label: agentProviderLabel(provider) })), action: 'set-cli-agent-provider-filter' })}</div>` : ''}
    <div class="local-agent-option-field">${renderAgentPicker({
      id: 'cli-agent-model', label: 'Model', value: selectedModel, options: modelOptions,
      action: 'set-cli-agent-model', searchable: modelOptions.length > 12,
      placeholder: agentProviderFilter ? `Choose ${agentProviderLabel(agentProviderFilter)} model` : 'Choose a model',
    })}</div>
    <div class="local-agent-option-field">${renderAgentPicker({ id: 'cli-agent-effort', label: 'Reasoning effort', value: selectedEffort, options: effortOptions, action: 'set-cli-agent-effort', disabled: !efforts.length })}</div>
    <small>${personalTarget
    ? 'Personal gateway uses that profile&rsquo;s identity, memory, sessions, and configured tools. getbased sends the approved chat context, but its local health-data tools and background feature jobs are not available on this route.'
    : `Catalog supplied by ${escapeHTML(agentName)}. Your choices apply only to getbased sessions and do not change the CLI&rsquo;s own default settings.${escapeHTML(reasoningNote)}`}</small>
  </div>`;
}

/** @param {HTMLElement} host @param {AgentModel[]} models */
function showAgentModelControls(host, models) {
  host.classList.remove('local-agent-options-loading');
  host.innerHTML = renderAgentModelControls(models);
}

/** @param {{id: string, name: string, description: string, version: string, status: string, compatible: boolean, message: string, paused?: boolean, runtimeMode?: string, companionVersion?: string}} agent */
function renderDetectedAgent(agent) {
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

/** @param {{status: string, endpoint?: string, paused?: boolean, runtimeMode?: string, companionVersion?: string, capabilities?: string[], controlAuthorized?: boolean}} agent */
function renderCompanionControls(agent) {
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

/** @param {{refresh?: boolean}} [options] */
export async function refreshDetectedAgentList(options = {}) {
  const list = document.getElementById('local-agent-list');
  if (!list) return;
  const companionSection = document.getElementById('local-agent-companion-section');
  list.innerHTML = '<div class="local-agent-scan-state"><span class="local-agent-spinner" aria-hidden="true"></span>Scanning this computer…</div>';
  if (companionSection) companionSection.innerHTML = '';
  try {
    const agents = await discoverLocalChatAgents({ refresh: options.refresh });
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
    list.innerHTML = '<div class="local-agent-scan-state local-agent-scan-error">CLI detection is unavailable.</div>';
    console.warn('[agent-chat] CLI detection failed', error);
  }
}

/** @param {string} requestedAction */
export async function controlCLICompanion(requestedAction) {
  if (!['pause', 'resume', 'install', 'restart', 'restart-companion', 'update', 'uninstall'].includes(requestedAction)) return;
  const action = /** @type {'pause'|'resume'|'install'|'restart'|'restart-companion'|'update'|'uninstall'} */ (requestedAction);
  if (action === 'uninstall' && !await showConfirmDialog(
    'Remove the getbased Companion from automatic startup? The current connection will remain available until this session ends.',
  )) return;
  try {
    const agents = await discoverLocalChatAgents({ refresh: true });
    const companion = agents.find(agent => agent.compatible
      && ['available', 'paused'].includes(agent.status) && agent.endpoint && agent.token);
    if (!companion) throw new Error('The getbased Companion is not running. Use the connection command first.');
    const result = await controlAgentHost({ endpoint: companion.endpoint, token: companion.token, action });
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

async function hydrateAgentModelControls() {
  const options = document.getElementById('cli-agent-options');
  if (!options) return;
  const requestedAgent = getAgentHostAgent();
  let requestedTarget = '';
  try {
    const agent = requestedAgent;
    if (hydratedAgentId !== agent) {
      hydratedAgentId = agent;
      agentProviderFilter = '';
      agentTargets = [];
    }
    await connectDetectedAgent(agent);
    if (getAgentHostAgent() !== agent) return;
    const targets = await listAgentExecutionTargets({
      endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), agent,
    });
    if (getAgentHostAgent() !== agent) return;
    agentTargets = targets;
    if (!agentTargets.some(target => target.id === getAgentHostTarget(agent))) {
      await saveAgentChatSettings({ target: 'local' });
    }
    const activeTarget = agentTargets.find(target => target.id === getAgentHostTarget(agent));
    if (activeTarget?.status === 'unavailable') {
      throw new Error(activeTarget.message || 'This personal gateway is currently offline.');
    }
    const selectedModel = getAgentHostModel();
    const target = getAgentHostTarget(agent);
    requestedTarget = target;
    const models = await listAgentModels({
      endpoint: getAgentHostEndpoint(),
      token: getAgentHostToken(),
      agent,
      target,
      model: selectedModel || undefined,
    });
    if (!options.isConnected || getAgentHostAgent() !== agent || getAgentHostTarget(agent) !== target) return;
    agentModels = cacheAgentModelCatalog(models, agent, target);
    agentModelsAgentId = agent;
    agentModelsTargetId = target;
    showAgentModelControls(options, agentModels);
  } catch (error) {
    if (getAgentHostAgent() !== requestedAgent
      || (requestedTarget && getAgentHostTarget(requestedAgent) !== requestedTarget)) return;
    if (options.isConnected) {
      agentModels = [];
      agentModelsAgentId = '';
      agentModelsTargetId = '';
      const message = escapeHTML(error instanceof Error ? error.message : 'Could not load this execution target. Check its connection, then try again.');
      if (agentTargets.length > 1) {
        showAgentModelControls(options, []);
        options.insertAdjacentHTML('beforeend', `<div class="local-agent-scan-state local-agent-scan-error">${message}</div>`);
      } else options.innerHTML = `<div class="local-agent-scan-state local-agent-scan-error">${message}</div>`;
    }
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

/** @param {boolean} enabled */
export async function toggleLocalCodex(enabled, agentId = getAgentHostAgent()) {
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

/** @param {string} model */
export async function setCLIAgentModel(model) {
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  try {
    await connectDetectedAgent(agent);
    if (getAgentHostAgent() !== agent || getAgentHostTarget(agent) !== target) return;
    const models = await listAgentModels({
      endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), agent,
      target, model: model || undefined,
    });
    if (getAgentHostAgent() !== agent || getAgentHostTarget(agent) !== target) return;
    agentModels = cacheAgentModelCatalog(models, agent, target);
    agentModelsAgentId = agent;
    agentModelsTargetId = target;
    await saveAgentChatSettings({ model });
    const selected = selectedModelEntry(agentModels, model);
    const provider = getCLIAgentModelProvider(agent, selected);
    if (provider) agentProviderFilter = provider;
    showNotification(model ? 'CLI model updated for getbased' : 'getbased will use the CLI default model', 'success');
    const options = document.getElementById('cli-agent-options');
    if (options?.isConnected) showAgentModelControls(options, agentModels);
  } catch (error) {
    if (getAgentHostAgent() !== agent || getAgentHostTarget(agent) !== target) return;
    showNotification(error instanceof Error ? error.message : 'Could not select this CLI model.', 'error', 9000);
  }
}

/** @param {string} target */
export async function setCLIAgentTarget(target) {
  const agent = getAgentHostAgent();
  try {
    await connectDetectedAgent(agent);
    if (getAgentHostAgent() !== agent) return;
    const targets = await listAgentExecutionTargets({
      endpoint: getAgentHostEndpoint(), token: getAgentHostToken(), agent,
    });
    if (getAgentHostAgent() !== agent) return;
    const selected = targets.find(item => item.id === target);
    if (!selected) throw new Error('This execution target is no longer available.');
    await saveAgentChatSettings({ target });
    agentTargets = targets;
    agentModels = [];
    agentModelsAgentId = '';
    agentModelsTargetId = '';
    agentProviderFilter = '';
    const options = document.getElementById('cli-agent-options');
    if (options?.isConnected) {
      options.className = 'local-agent-options-loading';
      options.textContent = selected.status === 'unavailable'
        ? (selected.message || 'This gateway is currently offline. Start it, then check the connection again.')
        : 'Loading models for this execution target…';
      if (selected.status !== 'unavailable') void hydrateAgentModelControls();
      else {
        showAgentModelControls(options, []);
        options.insertAdjacentHTML('beforeend', `<div class="local-agent-scan-state local-agent-scan-error">${escapeHTML(selected.message || 'This gateway is currently offline. Start it, then check the connection again.')}</div>`);
      }
    }
    showNotification(selected.kind === 'gateway'
      ? `Personal agent selected: ${selected.label}` : 'Local CLI execution selected', 'success', 7000);
  } catch (error) {
    if (getAgentHostAgent() !== agent) return;
    showNotification(error instanceof Error ? error.message : 'Could not select this execution target.', 'error', 9000);
  }
}

/** @param {string} effort */
export async function setCLIAgentEffort(effort) {
  const agent = getAgentHostAgent();
  const target = getAgentHostTarget(agent);
  await saveAgentChatSettings({ effort });
  showNotification(effort ? `Reasoning set to ${effort}` : 'The agent will use its default reasoning effort', 'success');
  const options = document.getElementById('cli-agent-options');
  if (options?.isConnected && agentModelsAgentId === agent && agentModelsTargetId === target) showAgentModelControls(options, agentModels);
  else if (options?.isConnected) {
    options.className = 'local-agent-options-loading';
    options.textContent = 'Refreshing CLI model options…';
    void hydrateAgentModelControls();
  }
}

/** @param {MessageEvent} event */
export function resizeCLICompanionPanel(event) {
  if (event.data?.type !== 'getbased-companion-panel-size' || !Number.isFinite(event.data.height)) return;
  const frame = /** @type {HTMLIFrameElement | null} */ (document.querySelector('.local-agent-management-frame'));
  if (!frame || event.source !== frame.contentWindow || event.origin !== new URL(frame.src).origin) return;
  frame.style.height = `${Math.max(64, Math.min(800, Math.ceil(event.data.height)))}px`;
  const styles = getComputedStyle(frame);
  frame.contentWindow?.postMessage({
    type: 'getbased-companion-panel-theme',
    colors: Object.fromEntries(Object.entries({ bg: '--bg-card', text: '--text-primary', muted: '--text-muted', border: '--border', button: '--bg-card', accent: '--accent' })
      .map(([name, variable]) => [name, styles.getPropertyValue(variable).trim()])),
  }, event.origin);
}

if (typeof document !== 'undefined') {
  document.defaultView?.addEventListener('message', resizeCLICompanionPanel);
  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-cli-agent-model-search]')) {
      filterCLIAgentModelOptions(target.value);
    }
  });
}
