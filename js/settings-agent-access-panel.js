// @ts-check
// settings-agent-access-panel.js — Settings → Agent Access rendering/actions.

import { showNotification, bindSyncAppliedRefresh } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { state } from './state.js';
import {
  clearAgentAccessMigrationDirty,
  clearLegacyAgentAccessSecrets,
  disableMessengerTokenLocal,
  getAgentAccessState,
  getSyncRelay,
  isSyncEnabled,
  isMessengerEnabled,
  getMessengerToken,
  getMessengerContextKey,
  hasMessengerSyncIdentity,
  isAgentAccessMigrationDirty,
  migrateLocalAgentAccessToProfile,
  generateMessengerToken,
  generateMessengerContextKey,
  revokeMessengerTokenRemote,
  pushContextToGateway,
} from './sync.js';
import { saveImportedData } from './data.js';

let _tokenClipboardClearTimer = null;
let _contextKeyClipboardClearTimer = null;
let _setupCommandClipboardClearTimer = null;

const AGENT_ACCESS_CLIENTS = [
  { id: 'hermes', label: 'Hermes Agent', terminal: 'Hermes' },
  { id: 'openclaw', label: 'OpenClaw', terminal: 'OpenClaw' },
  { id: 'claude-code', label: 'Claude Agent', terminal: 'Claude' },
  { id: 'claude-desktop', label: 'Claude Desktop', terminal: 'Claude Desktop' },
  { id: 'cursor', label: 'Cursor', terminal: 'Cursor' },
  { id: 'cline', label: 'Cline', terminal: 'Cline' },
  { id: 'codex', label: 'Codex CLI', terminal: 'Codex' },
];

function renderAgentAccessClientChoices() {
  return AGENT_ACCESS_CLIENTS.map(client => `
    <label class="agent-access-client-chip">
      <input type="radio" name="agent-access-client" value="${client.id}"${client.id === 'hermes' ? ' checked' : ''}>
      <span>${client.label}</span>
    </label>
  `).join('');
}

function normalizeAgentAccessClient(client) {
  const id = String(client || 'hermes').trim();
  return AGENT_ACCESS_CLIENTS.some(c => c.id === id) ? id : 'hermes';
}

function agentAccessClientMeta(client) {
  const id = normalizeAgentAccessClient(client);
  return AGENT_ACCESS_CLIENTS.find(c => c.id === id) || AGENT_ACCESS_CLIENTS[0];
}

function snapshotImportedData() {
  try { return JSON.stringify(state.importedData || {}); } catch { return null; }
}

function restoreImportedDataSnapshot(snapshot) {
  if (!snapshot) return;
  try { state.importedData = JSON.parse(snapshot); } catch {}
}

function syncRelayHttpUrl() {
  let relay = 'https://sync.getbased.health';
  try { relay = getSyncRelay?.() || relay; } catch {}
  return String(relay).replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export function buildAgentAccessSetupCommand(client = 'hermes') {
  const token = getMessengerToken();
  const contextKey = getMessengerContextKey();
  if (!token || !contextKey) return null;
  const targetClient = normalizeAgentAccessClient(client);
  const payload = {
    version: 1,
    token: token,
    contextKey: contextKey,
    gateway: syncRelayHttpUrl(),
    client: targetClient,
    createdAt: new Date().toISOString(),
  };
  const setup = 'gbsetup_v1_' + btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  // Private bootstrap command shape: install/upgrade the stack, then connect the selected MCP client with this setup payload.
  return `curl -fsSL https://getbased.health/install.sh | bash -s -- connect ${targetClient} --setup '${setup}'`;
}

async function writePrivateClipboard(text, onSuccess) {
  await navigator.clipboard.writeText(text);
  onSuccess?.();
}

function clearClipboardLater(timer, delay = 60000) {
  clearTimeout(timer);
  return setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); }, delay);
}

async function persistMigratedAgentAccessIfNeeded() {
  if (!isAgentAccessMigrationDirty()) return;
  const saved = await saveImportedData({ reason: 'agent-access-migration' });
  if (saved === false) {
    console.warn('[agent-access] migrated legacy Agent Access but could not persist it yet');
    return;
  }
  clearAgentAccessMigrationDirty();
  clearLegacyAgentAccessSecrets();
}

export function renderMessengerSection() {
  migrateLocalAgentAccessToProfile();
  void persistMigratedAgentAccessIfNeeded();
  const enabled = isMessengerEnabled();
  const token = getMessengerToken();
  const agentAccess = getAgentAccessState();
  const syncReady = isSyncEnabled();
  const ownerReady = hasMessengerSyncIdentity();
  const canEnable = syncReady && ownerReady;
  const toggleDisabled = !enabled && !canEnable;
  const ownerActionDisabled = !ownerReady ? ' disabled aria-disabled="true"' : '';
  return `
    <div class="settings-action-row" style="margin-bottom:${enabled ? '16' : '8'}px;${toggleDisabled ? 'opacity:0.75' : ''}">
      <div class="settings-copy">
        <div class="settings-copy-title">Agent Access</div>
        <div class="settings-copy-desc">Let AI agents query your labs and context via MCP, Hermes Agent, or OpenClaw</div>
      </div>
      <label class="chat-websearch-toggle-label sync-settings-toggle" aria-label="Toggle Agent Access">
        <input type="checkbox" ${enabled ? 'checked' : ''} data-sync-action="toggle-messenger" ${toggleDisabled ? 'disabled' : ''}>
        <span class="chat-toggle-slider sync-settings-toggle-slider"></span>
      </label>
    </div>
    ${enabled && token ? `
      <div class="agent-access-connect-card">
        <div class="settings-copy">
          <div class="settings-copy-title">Connect an agent</div>
          <div class="settings-copy-desc">Pick where this machine should connect, then paste one private setup command into that agent's terminal.</div>
          <div class="agent-access-client-kicker">Setup target</div>
          <div class="agent-access-client-grid" role="radiogroup" aria-label="Agent Access setup target">
            ${renderAgentAccessClientChoices()}
          </div>
        </div>
        <button class="import-btn import-btn-primary agent-access-copy-btn" data-sync-action="copy-agent-access-setup-command" aria-label="Copy selected agent setup command">Copy setup command</button>
      </div>
      <div style="margin-bottom:16px">
        <div class="settings-token-head">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Read-only token</label>
          <div class="settings-token-actions">
            <button id="messenger-token-toggle" class="import-btn import-btn-secondary settings-mini-btn" data-sync-action="toggle-messenger-token" aria-label="Show token">Show</button>
            <button class="import-btn import-btn-secondary settings-mini-btn" data-sync-action="copy-messenger-token" aria-label="Copy token">Copy</button>
          </div>
        </div>
        <div id="messenger-token" class="settings-token-box" data-masked="true" aria-label="Agent Access token">${'\u2022'.repeat(64)}</div>
        <div class="settings-copy-desc" style="margin-top:6px">Use <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" style="color:var(--accent)">getbased-mcp</a> to connect <a href="https://github.com/hermes-agent/hermes-agent" target="_blank" rel="noopener" style="color:var(--accent)">Hermes Agent</a>, <a href="https://openclaw.ai" target="_blank" rel="noopener" style="color:var(--accent)">OpenClaw</a>, or any MCP-compatible agent. Set this as <code>GETBASED_TOKEN</code>; it authorizes relay access only. Manage → Context controls which profile sources enter the encrypted payload.</div>
      </div>
      <div style="margin-bottom:16px">
        <div class="settings-token-head">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Context encryption key</label>
          <div class="settings-token-actions">
            <button id="messenger-context-key-toggle" class="import-btn import-btn-secondary settings-mini-btn" data-sync-action="toggle-messenger-context-key" aria-label="Show context encryption key">Show</button>
            <button class="import-btn import-btn-secondary settings-mini-btn" data-sync-action="copy-messenger-context-key" aria-label="Copy context encryption key">Copy</button>
          </div>
        </div>
        <div id="messenger-context-key" class="settings-token-box" data-masked="true" aria-label="Agent Context encryption key">${'\u2022'.repeat(48)}</div>
        <div class="settings-copy-desc" style="margin-top:6px">Set this as <code>GETBASED_AGENT_CONTEXT_KEY</code>. It decrypts context locally inside your self-hosted MCP. The hosted relay never receives this key.</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <button class="import-btn import-btn-secondary settings-full-btn" data-sync-action="regenerate-messenger-token"${ownerActionDisabled}>Regenerate token</button>
        <button class="import-btn import-btn-secondary settings-full-btn" data-sync-action="regenerate-messenger-context-key"${ownerActionDisabled}>Regenerate context key</button>
      </div>
      <div class="settings-divider">
        <div class="settings-action-row">
          <div class="settings-copy">
            <div class="settings-copy-title">Push wearable daily series</div>
            <div class="settings-copy-desc">Adds a pivoted daily-values matrix (HRV, RHR, sleep…) so agents can spot trends. ~100 / 400 / 1200 extra tokens for 7 / 30 / 90 days respectively (real-measured at 13 metrics); cached cleanly so the marginal cost per turn is small. Off by default — pick 7 days for cheap follow-ups, 30 for monthly reasoning, 90 for season-spanning analysis.</div>
          </div>
          <select id="agent-wearable-series-select"
            data-sync-action="set-agent-wearable-series-days"
            aria-label="Wearable series window pushed to agent"
            class="settings-select"${ownerActionDisabled}>
            <option value="off"${(agentAccess.wearableSeriesDays || 0) === 0 ? ' selected' : ''}>Off</option>
            <option value="7"${agentAccess.wearableSeriesDays === 7 ? ' selected' : ''}>7 days</option>
            <option value="30"${agentAccess.wearableSeriesDays === 30 ? ' selected' : ''}>30 days</option>
            <option value="90"${agentAccess.wearableSeriesDays === 90 ? ' selected' : ''}>90 days</option>
          </select>
        </div>
      </div>
    ` : !syncReady ? `
      <div class="settings-copy-desc">
        Agent Access uses your Cross-device Sync identity for relay storage and quota. Enable or restore Cross-device Sync first, then turn this on.
      </div>
    ` : !ownerReady ? `
      <div class="settings-copy-desc">
        Sync is enabled, but this device is still resolving its Sync owner. Wait for the mnemonic to finish loading, or restore Cross-device Sync again before enabling Agent Access.
      </div>
    ` : `
      <div class="settings-copy-desc">
        Let AI agents query your labs — coding agents, messenger bots, or any <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" style="color:var(--accent)">MCP-compatible tool</a>. The relay receives only end-to-end encrypted context; your Agent Access token authorizes relay fetches and your Agent Context key decrypts locally in your self-hosted MCP.
      </div>
    `}
  `;
}

let _messengerToggling = false;
export async function toggleMessenger(enabled) {
  if (_messengerToggling) return;
  _messengerToggling = true;
  const rollback = snapshotImportedData();
  try {
    if (enabled) {
      if (!isSyncEnabled()) {
        showNotification('Enable or restore Cross-device Sync first — Agent Access storage is bound to that Sync identity.', 'error');
        refreshMessengerSectionForOwnerChange();
        return;
      }
      if (!hasMessengerSyncIdentity()) {
        showNotification('Sync owner is still resolving — wait for Cross-device Sync to finish loading before enabling Agent Access.', 'error');
        refreshMessengerSectionForOwnerChange();
        return;
      }
      const { previousToken } = generateMessengerToken();
      const saved = await saveImportedData({ reason: 'agent-access-enable' });
      if (saved === false) throw new Error('saveImportedData returned false while enabling Agent Access');
      clearLegacyAgentAccessSecrets();
      if (previousToken) revokeMessengerTokenRemote(previousToken);
      pushContextToGateway();
      showNotification('Agent Access enabled', 'success');
    } else {
      const previousToken = disableMessengerTokenLocal();
      const saved = await saveImportedData({ reason: 'agent-access-disable' });
      if (saved === false) throw new Error('saveImportedData returned false while disabling Agent Access');
      clearLegacyAgentAccessSecrets();
      revokeMessengerTokenRemote(previousToken);
      showNotification('Agent Access disabled', 'success');
    }
    refreshMessengerSectionForOwnerChange();
  } catch (err) {
    restoreImportedDataSnapshot(rollback);
    console.warn('[agent-access] failed to persist Agent Access toggle', err);
    showNotification(enabled
      ? 'Could not save Agent Access token — try enabling again before updating your agent config.'
      : 'Could not save Agent Access disable — try again before removing your agent config.', 'error');
    refreshMessengerSectionForOwnerChange();
  } finally {
    _messengerToggling = false;
  }
}

export function toggleMessengerToken() {
  const el = document.getElementById('messenger-token');
  const btn = document.getElementById('messenger-token-toggle');
  if (!el || !btn) return;
  const token = getMessengerToken();
  if (!token) return;
  const masked = el.dataset.masked === 'true';
  el.textContent = masked ? token : '\u2022'.repeat(64);
  el.dataset.masked = masked ? 'false' : 'true';
  el.style.userSelect = masked ? 'all' : 'none';
  btn.textContent = masked ? 'Hide' : 'Show';
}

export function toggleMessengerContextKey() {
  const el = document.getElementById('messenger-context-key');
  const btn = document.getElementById('messenger-context-key-toggle');
  if (!el || !btn) return;
  const contextKey = getMessengerContextKey();
  if (!contextKey) return;
  const masked = el.dataset.masked === 'true';
  el.textContent = masked ? contextKey : '\u2022'.repeat(48);
  el.dataset.masked = masked ? 'false' : 'true';
  el.style.userSelect = masked ? 'all' : 'none';
  btn.textContent = masked ? 'Hide' : 'Show';
}

export function copyMessengerToken() {
  const token = getMessengerToken();
  if (!token) return;
  navigator.clipboard.writeText(token).then(() => {
    showNotification('Token copied — clipboard will clear in 60s', 'success');
    clearTimeout(_tokenClipboardClearTimer);
    _tokenClipboardClearTimer = setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); }, 60000);
  }).catch(() => { showNotification('Could not access clipboard', 'error'); });
}

export function copyMessengerContextKey() {
  const contextKey = getMessengerContextKey();
  if (!contextKey) return;
  navigator.clipboard.writeText(contextKey).then(() => {
    showNotification('Context encryption key copied — clipboard will clear in 60s', 'success');
    _contextKeyClipboardClearTimer = clearClipboardLater(_contextKeyClipboardClearTimer);
  }).catch(() => { showNotification('Could not access clipboard', 'error'); });
}

function selectedAgentAccessClient() {
  const input = document.querySelector('input[name="agent-access-client"]:checked');
  return normalizeAgentAccessClient(input && 'value' in input ? input.value : 'hermes');
}

export function copyAgentAccessSetupCommand() {
  const client = selectedAgentAccessClient();
  const meta = agentAccessClientMeta(client);
  const command = buildAgentAccessSetupCommand(client);
  if (!command) {
    showNotification('Agent Access credentials are not ready yet — enable Agent Access first.', 'error');
    return;
  }
  writePrivateClipboard(command, () => {
    showNotification(`${meta.label} setup command copied — paste it into the terminal where ${meta.terminal} runs`, 'success');
    _setupCommandClipboardClearTimer = clearClipboardLater(_setupCommandClipboardClearTimer);
  }).catch(() => { showNotification('Could not access clipboard', 'error'); });
}

export async function regenerateMessengerToken() {
  if (!hasMessengerSyncIdentity()) {
    showNotification('Sync owner is still resolving — wait before regenerating Agent Access credentials.', 'error');
    refreshMessengerSectionForOwnerChange();
    return;
  }
  const rollback = snapshotImportedData();
  try {
    const { previousToken } = generateMessengerToken();
    const saved = await saveImportedData({ reason: 'agent-access-regenerate-token' });
    if (saved === false) throw new Error('saveImportedData returned false while regenerating Agent Access token');
    clearLegacyAgentAccessSecrets();
    if (previousToken) revokeMessengerTokenRemote(previousToken);
    pushContextToGateway();
    showNotification('Token regenerated — update GETBASED_TOKEN in your agent config', 'success');
  } catch (err) {
    restoreImportedDataSnapshot(rollback);
    console.warn('[agent-access] failed to persist regenerated token', err);
    showNotification('Could not save regenerated token — try again before updating your agent config.', 'error');
  } finally {
    refreshMessengerSectionForOwnerChange();
  }
}

export async function regenerateMessengerContextKey() {
  if (!hasMessengerSyncIdentity()) {
    showNotification('Sync owner is still resolving — wait before regenerating Agent Access credentials.', 'error');
    refreshMessengerSectionForOwnerChange();
    return;
  }
  const rollback = snapshotImportedData();
  try {
    generateMessengerContextKey();
    const saved = await saveImportedData({ reason: 'agent-access-regenerate-context-key' });
    if (saved === false) throw new Error('saveImportedData returned false while regenerating Agent Access context key');
    clearLegacyAgentAccessSecrets();
    pushContextToGateway();
    showNotification('Context key regenerated — update GETBASED_AGENT_CONTEXT_KEY in your agent config', 'success');
  } catch (err) {
    restoreImportedDataSnapshot(rollback);
    console.warn('[agent-access] failed to persist regenerated context key', err);
    showNotification('Could not save regenerated context key — try again before updating your agent config.', 'error');
  } finally {
    refreshMessengerSectionForOwnerChange();
  }
}

export function refreshMessengerSectionForOwnerChange() {
  const el = document.getElementById('messenger-section');
  if (el) el.innerHTML = renderMessengerSection();
}

addUtilsRuntimeListener('labcharts-sync-owner-changed', refreshMessengerSectionForOwnerChange);
bindSyncAppliedRefresh(refreshMessengerSectionForOwnerChange);
addUtilsRuntimeListener('labcharts-profile-switched', refreshMessengerSectionForOwnerChange);
