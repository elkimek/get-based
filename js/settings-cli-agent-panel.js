// @ts-check
// settings-cli-agent-panel.js — Settings → AI → CLI agents rendering/actions.

import { controlAgentHost, listAgentModels } from './agent-chat-client.js';
import { cacheAgentModelCatalog } from './agent-model-catalog.js';
import {
  connectDetectedCodex,
  discoverLocalChatAgents,
  getAgentHostEffort,
  getAgentHostEndpoint,
  getAgentHostModel,
  getAgentHostToken,
  getChatBackend,
  saveAgentChatSettings,
  setChatBackend,
} from './agent-chat-settings.js';
import { escapeAttr, escapeHTML, showConfirmDialog, showNotification } from './utils.js';

/** @typedef {{reasoningEffort: string, description: string}} AgentReasoningEffort */
/** @typedef {{id: string, model: string, displayName: string, isDefault: boolean, defaultReasoningEffort: string, supportedReasoningEfforts: AgentReasoningEffort[], inputModalities?: string[]}} AgentModel */

/** @type {AgentModel[]} */
let codexModels = [];
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
    <small>Already installed but stopped? <button type="button" class="settings-link-btn" data-settings-action="copy-cli-companion-start" data-command="${escapeAttr(startCommand)}">Copy the start command</button>. Requires Node.js 20+ and <code>codex login</code>. No port or pairing token is needed. <a href="https://github.com/elkimek/get-based/blob/main/bin/getbased-companion.js" target="_blank" rel="noopener">Review the source on GitHub</a>.</small>
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

export function renderCLIAgentProviderPanel() {
  queueMicrotask(() => { void refreshDetectedAgentList(); });
  return `
    <div class="ai-provider-panel cli-agent-provider-panel" data-ai-provider-mode="cli">
      <div class="local-agent-chat-head">
        <div class="settings-copy">
          <div id="local-agent-chat-title" class="settings-copy-title">CLI agents <span class="settings-beta-badge">Experimental</span></div>
          <div class="settings-copy-desc">Use an installed agent and its existing subscription across getbased. A small local companion connects the browser to CLI programs on this computer.</div>
        </div>
        <button class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="rescan-cli-agents">Check connection</button>
      </div>
      <div class="local-agent-capability-note"><strong>One assistant across getbased.</strong> The selected CLI agent powers chat, supported image and document imports, summaries, explanations, and other AI features. It can read enabled active-profile context through constrained tools; any proposed data change stays a draft until you apply it.</div>
      <div class="local-agent-list-kicker">Installed CLIs</div>
      <div id="local-agent-list" class="local-agent-list" aria-live="polite">
        <div class="local-agent-scan-state"><span class="local-agent-spinner" aria-hidden="true"></span>Scanning this computer…</div>
      </div>
      <div id="local-agent-status" class="sr-only" role="status" aria-live="polite"></div>
      <details class="local-agent-details">
        <summary>How CLI agents work</summary>
        <p>getbased uses a local companion and the agent&rsquo;s existing sign-in. Connection details stay hidden. Agents receive health data only through getbased&rsquo;s approved tools. Codex may combine those tools with hosted web research in chat; shell, files, browser control, plugins, and other local capabilities stay off. Focused feature jobs such as imports run without tools or web search.</p>
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
 * @param {{id: string, label: string, value: string, options: {value: string, label: string}[], action: string, disabled?: boolean}} config
 */
function renderAgentPicker(config) {
  const selected = config.options.find(option => option.value === config.value) || config.options[0];
  return `<label class="local-agent-option-label" for="${escapeAttr(config.id)}-summary"><span>${escapeHTML(config.label)}</span></label>
    <details class="cli-agent-picker"${config.disabled ? ' data-disabled="true"' : ''}>
      <summary id="${escapeAttr(config.id)}-summary" class="cli-agent-picker-summary"${config.disabled ? ' aria-disabled="true" tabindex="-1"' : ''}>
        <span>${escapeHTML(selected?.label || '')}</span><span class="cli-agent-picker-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="cli-agent-picker-options" role="listbox" aria-label="${escapeAttr(config.label)}">
        ${config.options.map(option => `<button type="button" role="option" aria-selected="${option.value === config.value}" data-settings-action="${escapeAttr(config.action)}" data-value="${escapeAttr(option.value)}"><span>${escapeHTML(option.label)}</span>${option.value === config.value ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}
      </div>
    </details>`;
}

/** @param {AgentModel[]} models */
function renderCodexModelControls(models) {
  const selectedModel = getAgentHostModel();
  const selectedEffort = getAgentHostEffort();
  const current = selectedModelEntry(models, selectedModel);
  const defaultModel = models.find(model => model.isDefault) || models[0] || null;
  const modelOptions = [
    { value: '', label: `CLI default${defaultModel?.displayName ? ` · ${defaultModel.displayName}` : ''}` },
    ...models.map(model => {
      const value = model.id || model.model;
      return { value, label: model.displayName || value };
    }),
  ];
  if (selectedModel && !models.some(model => model.id === selectedModel || model.model === selectedModel)) {
    modelOptions.splice(1, 0, { value: selectedModel, label: `${selectedModel} · unavailable` });
  }
  const efforts = current?.supportedReasoningEfforts || [];
  const defaultEffort = current?.defaultReasoningEffort || '';
  const effortOptions = [
    { value: '', label: `Default${defaultEffort ? ` · ${defaultEffort}` : ''}` },
    ...efforts.map(item => ({ value: item.reasoningEffort, label: item.reasoningEffort })),
  ];
  if (selectedEffort && !efforts.some(item => item.reasoningEffort === selectedEffort)) {
    effortOptions.push({ value: selectedEffort, label: `${selectedEffort} · unavailable` });
  }
  return `<div class="local-agent-options">
    <div class="local-agent-option-field">${renderAgentPicker({ id: 'cli-agent-model', label: 'Model', value: selectedModel, options: modelOptions, action: 'set-cli-agent-model' })}</div>
    <div class="local-agent-option-field">${renderAgentPicker({ id: 'cli-agent-effort', label: 'Reasoning effort', value: selectedEffort, options: effortOptions, action: 'set-cli-agent-effort', disabled: !efforts.length })}</div>
    <small>Synced from the Codex CLI model catalog.</small>
  </div>`;
}

/** @param {{id: string, name: string, description: string, version: string, status: string, compatible: boolean, message: string, paused?: boolean, runtimeMode?: string, companionVersion?: string}} agent */
function renderDetectedAgent(agent) {
  const isCodex = agent.id === 'codex';
  const selected = isCodex && getChatBackend() === 'codex';
  const isReady = agent.status === 'available';
  const isPaused = agent.status === 'paused' || agent.paused === true;
  const isReachable = isReady || isPaused;
  const statusLabel = isCodex
    ? (isReady ? 'Connected · companion running' : isPaused ? 'Connected · companion paused' : agent.status === 'starting' ? 'Companion starting…' : 'Installed · companion not running')
    : 'Installed · adapter not supported yet';
  const initials = agent.id === 'opencode' ? 'OC' : agent.id === 'hermes' ? 'H' : agent.id === 'grok' ? 'G' : '✦';
  return `
    <div class="local-agent-row${isCodex ? ' local-agent-row-compatible' : ''}">
      <div class="local-agent-row-main">
        <div class="local-agent-icon local-agent-icon-${escapeHTML(agent.id)}" aria-hidden="true">${initials}</div>
        <div class="local-agent-copy">
          <div class="local-agent-name">${escapeHTML(agent.name || agent.id)}</div>
          <div class="local-agent-meta">${escapeHTML(agent.description || '')}${agent.version ? ` · ${escapeHTML(agent.version)}` : ''}</div>
          <div class="local-agent-state"><span class="local-agent-dot ${isReady ? 'is-ready' : ''}"></span>${escapeHTML(statusLabel)}</div>
        </div>
        ${isCodex ? `
          <button class="import-btn import-btn-secondary settings-mini-btn local-agent-test" data-settings-action="test-cli-codex"${isReady ? '' : ` disabled title="${isPaused ? 'Resume the companion first' : 'Start the companion first'}"`}>Test</button>
          <label class="chat-websearch-toggle-label sync-settings-toggle local-agent-toggle" aria-label="Use Codex in getbased">
            <input type="checkbox" data-settings-action="toggle-cli-codex"${selected ? ' checked' : ''}${isReady ? '' : ' disabled'}>
            <span class="chat-toggle-slider sync-settings-toggle-slider"></span>
          </label>` : ''}
      </div>
      ${isCodex && isReachable ? renderCompanionControls(agent) : ''}
      ${selected && isReady ? '<div id="cli-agent-options" class="local-agent-options-loading">Loading Codex models…</div>' : ''}
    </div>`;
}

/** @param {{status: string, paused?: boolean, runtimeMode?: string, companionVersion?: string}} agent */
function renderCompanionControls(agent) {
  const paused = agent.status === 'paused' || agent.paused === true;
  const installed = agent.runtimeMode === 'installed';
  const modeLabel = installed ? 'Starts automatically at login' : 'Connected for this terminal session';
  return `<div class="local-agent-controls" aria-label="Companion controls">
    <div class="local-agent-controls-copy">
      <strong>Companion</strong>
      <span>${escapeHTML(modeLabel)}${agent.companionVersion ? ` · v${escapeHTML(agent.companionVersion)}` : ''}</span>
    </div>
    <div class="local-agent-control-actions">
      <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="${paused ? 'resume' : 'pause'}">${paused ? 'Resume' : 'Pause'}</button>
      <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="restart"${paused ? ' disabled title="Resume the companion first"' : ''}>Restart Codex</button>
      ${installed
    ? '<button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="control-cli-companion" data-value="update">Update</button><button type="button" class="import-btn settings-mini-btn local-agent-danger" data-settings-action="control-cli-companion" data-value="uninstall">Uninstall</button>'
    : '<button type="button" class="import-btn import-btn-primary settings-mini-btn" data-settings-action="control-cli-companion" data-value="install">Start automatically</button>'}
    </div>
  </div>`;
}

/** @param {{refresh?: boolean}} [options] */
export async function refreshDetectedAgentList(options = {}) {
  const list = document.getElementById('local-agent-list');
  if (!list) return;
  list.innerHTML = '<div class="local-agent-scan-state"><span class="local-agent-spinner" aria-hidden="true"></span>Scanning this computer…</div>';
  try {
    const agents = await discoverLocalChatAgents({ refresh: options.refresh });
    const agentRows = agents.length ? agents.map(renderDetectedAgent).join('') : '';
    const companionReady = agents.some(agent => agent.id === 'codex'
      && agent.compatible && ['available', 'starting', 'paused'].includes(agent.status));
    list.innerHTML = `${agentRows}${companionReady ? '' : renderCompanionSetup()}`;
    if (getChatBackend() === 'codex' && agents.some(agent => agent.id === 'codex' && agent.compatible && agent.status === 'available')) {
      void hydrateCodexModelControls();
    }
  } catch (error) {
    list.innerHTML = '<div class="local-agent-scan-state local-agent-scan-error">CLI detection is unavailable.</div>';
    console.warn('[agent-chat] CLI detection failed', error);
  }
}

/** @param {string} requestedAction */
export async function controlCLICompanion(requestedAction) {
  if (!['pause', 'resume', 'install', 'restart', 'update', 'uninstall'].includes(requestedAction)) return;
  const action = /** @type {'pause'|'resume'|'install'|'restart'|'update'|'uninstall'} */ (requestedAction);
  if (action === 'uninstall' && !await showConfirmDialog(
    'Remove the getbased Companion from automatic startup? The current connection will remain available until this session ends.',
  )) return;
  try {
    const agents = await discoverLocalChatAgents({ refresh: true });
    const companion = agents.find(agent => agent.id === 'codex' && agent.compatible
      && ['available', 'paused'].includes(agent.status) && agent.endpoint && agent.token);
    if (!companion) throw new Error('The getbased Companion is not running. Use the connection command first.');
    const result = await controlAgentHost({ endpoint: companion.endpoint, token: companion.token, action });
    if (action === 'pause') {
      if (getChatBackend() === 'codex') setChatBackend('direct');
      showNotification('Companion paused. getbased switched to direct AI.', 'success');
    } else if (action === 'resume') showNotification('Companion resumed', 'success');
    else if (action === 'restart') showNotification('Codex connection restarted', 'success');
    else if (action === 'install') showNotification('Companion will now start automatically at login', 'success', 7000);
    else if (action === 'uninstall') showNotification('Companion removed from automatic startup', 'success', 7000);
    else if (action === 'update') showNotification(result.restartRequired
      ? 'Update installed. It will take effect the next time the companion starts.'
      : 'Companion is up to date', 'success', 8000);
    await refreshDetectedAgentList({ refresh: true });
    return result;
  } catch (error) {
    showNotification(error instanceof Error ? error.message : 'Could not manage the companion.', 'error', 9000);
  }
}

async function hydrateCodexModelControls() {
  const options = document.getElementById('cli-agent-options');
  if (!options) return;
  try {
    await connectDetectedCodex();
    codexModels = cacheAgentModelCatalog(await listAgentModels({
      endpoint: getAgentHostEndpoint(),
      token: getAgentHostToken(),
    }));
    if (options.isConnected) options.innerHTML = renderCodexModelControls(codexModels);
  } catch (error) {
    if (options.isConnected) options.innerHTML = '<div class="local-agent-scan-state local-agent-scan-error">Could not load the Codex model catalog.</div>';
    console.warn('[agent-chat] Codex model discovery failed', error);
  }
}

export async function testLocalCodex() {
  const status = document.getElementById('local-agent-status');
  if (status) status.textContent = 'Testing Codex…';
  try {
    await connectDetectedCodex();
    await listAgentModels({ endpoint: getAgentHostEndpoint(), token: getAgentHostToken() });
    if (status) status.textContent = 'Codex is ready.';
    showNotification('Codex is ready', 'success');
    await refreshDetectedAgentList();
  } catch (error) {
    if (status) status.textContent = 'Codex could not connect.';
    showNotification(error instanceof Error ? error.message : 'Codex could not connect.', 'error', 9000);
  }
}

/** @param {boolean} enabled */
export async function toggleLocalCodex(enabled) {
  if (!enabled) {
    setChatBackend('direct');
    showNotification('API or Local AI selected for chat', 'success');
    await refreshDetectedAgentList();
    return;
  }
  try {
    await connectDetectedCodex();
    setChatBackend('codex');
    showNotification('Codex selected for chat', 'success');
  } catch (error) {
    setChatBackend('direct');
    showNotification(error instanceof Error ? error.message : 'Codex could not connect.', 'error', 9000);
  }
  await refreshDetectedAgentList();
}

/** @param {string} model */
export async function setCLIAgentModel(model) {
  await saveAgentChatSettings({ model, effort: '' });
  showNotification(model ? 'Codex model updated' : 'Codex will use its CLI default model', 'success');
  const options = document.getElementById('cli-agent-options');
  if (options?.isConnected) options.innerHTML = renderCodexModelControls(codexModels);
}

/** @param {string} effort */
export async function setCLIAgentEffort(effort) {
  await saveAgentChatSettings({ effort });
  showNotification(effort ? `Codex reasoning set to ${effort}` : 'Codex will use its default reasoning effort', 'success');
  const options = document.getElementById('cli-agent-options');
  if (options?.isConnected) options.innerHTML = renderCodexModelControls(codexModels);
}
