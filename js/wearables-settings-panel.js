// @ts-check
// wearables-settings-panel.js — Settings → Wearables integrations panel.
// Keeps provider rows, connection actions, Apple Health import controls, and
// manual-source management out of the dashboard strip renderer.

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog } from './utils.js';
import { state } from './state.js';
import {
  adapterById,
  visibleAdapters,
  getOAuthClientId,
  isOAuthAdapterConfigured,
  isWearableRelayUnavailable,
} from './wearable-adapters.js';
import { SELF_HOSTED_WEARABLE_MESSAGE, isOfficialGetbasedHost } from './url-safety.js';
import { brandMarkMono } from './brand-assets.js';
import { groupWearableAdapters } from './wearables-settings-groups.js';
import {
  beginConnectOAuth,
  backfillWearable,
  disconnectWearable,
  syncNow,
  listConnectedSources,
  getConnection,
  loadWearableRuntimeConfig,
} from './wearables-connect.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';
import { getDailyRange } from './wearables-store.js';
import { deleteAllManualMetrics, refreshManualSummary } from './wearables-manual.js';
import {
  closeWearableSettingsModal,
  confirmWearableSettingsAction,
  navigateWearablesDashboard,
} from './wearables-settings-runtime.js';
import {
  requestHostedWearableRelayConsent,
  withdrawHostedWearableRelayConsent,
} from './wearable-relay-consent.js';

let wearableSettingsDelegatesInstalled = false;

export const GOOGLE_HEALTH_CONNECT_DISCLOSURE = `Google Health will let getbased read three categories from your Google account: activity and fitness; health metrics and measurements; and sleep. No write access is requested.

getbased uses this data to show daily Body metrics, personal baselines, trends, and comparisons. OAuth tokens and imported daily rows are AES-GCM encrypted on this device. Google Health is self-host only: OAuth exchanges and Google API requests use infrastructure controlled by that deployment.

If you enable cross-device sync, a compact derived summary is sent through the end-to-end-encrypted relay. If you use a cloud AI or agent while Wearables context is enabled, that summary may be sent to the provider you selected. You can disable Wearables context before using those features.

Disconnecting deletes this device's Google Health credentials, imported rows, and derived source data. Revoke getbased in your Google Account to stop access on every device.`;

const HOSTED_WEARABLE_RELAY_ADAPTERS = new Set(['oura', 'withings', 'polar', 'fitbit']);

export function requiresHostedWearableRelayConsent(adapterId, locationLike = globalThis.location) {
  return isOfficialGetbasedHost(locationLike) && HOSTED_WEARABLE_RELAY_ADAPTERS.has(adapterId);
}

export function hostedWearableRelayDisclosure(providerName) {
  return `getbased s.r.o. uses its secure relay to connect ${providerName} and import the health readings you request. The relay can read those values while forwarding them, but does not intentionally store request or response contents.

You can withdraw at any time by disconnecting ${providerName}, which stops future imports and removes this device's connection and imported ${providerName} data. Encrypted sync and cloud AI are separate choices.`;
}

function wearableSettingsActionAttrs(action, data = {}, opts = {}) {
  const attrs = [`data-wearable-settings-action="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') attrs.push(`data-wearable-settings-${key}="${escapeAttr(String(value))}"`);
  }
  if (opts.stopPropagation) attrs.push('data-wearable-settings-stop-propagation="true"');
  return attrs.join(' ');
}

function wearableSettingsInputAttrs(input) {
  return `data-wearable-settings-input="${escapeAttr(input)}"`;
}

function clickAppleHealthFileInput() {
  document.getElementById('apple-health-file-input')?.click();
}

function handleWearableSettingsClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-wearable-settings-action]'));
  if (!actionEl?.dataset) return;

  const action = actionEl.dataset.wearableSettingsAction || '';
  if (actionEl.dataset.wearableSettingsStopPropagation === 'true') {
    event.stopPropagation();
  }

  const adapterId = actionEl.dataset.wearableSettingsAdapter || '';
  switch (action) {
    case 'connect':
      event.preventDefault();
      handleWearableConnect(adapterId);
      break;
    case 'pick-apple-health-file':
      event.preventDefault();
      clickAppleHealthFileInput();
      break;
    case 'sync-now':
      event.preventDefault();
      handleWearableSyncNow(adapterId, /** @type {HTMLButtonElement} */ (actionEl));
      break;
    case 'backfill':
      event.preventDefault();
      handleWearableBackfill(adapterId);
      break;
    case 'disconnect':
      event.preventDefault();
      handleWearableDisconnect(adapterId);
      break;
    case 'manual-dashboard':
      event.preventDefault();
      handleManualOpenDashboard();
      break;
    case 'manual-disconnect':
      event.preventDefault();
      handleManualDisconnect();
      break;
  }
}

function handleWearableSettingsChange(event) {
  const target = event.target;
  const inputEl = /** @type {HTMLInputElement | null} */ (target);
  if (!inputEl?.dataset?.wearableSettingsInput) return;

  switch (inputEl.dataset.wearableSettingsInput) {
    case 'strip-hidden':
      setWearableStripHidden(!inputEl.checked);
      break;
    case 'apple-health-file':
      handleAppleHealthFilePick(inputEl);
      break;
  }
}

function appleHealthDropzoneFromEvent(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  return /** @type {HTMLElement | null} */ (target.closest('[data-wearable-settings-dropzone="apple-health"]'));
}

function handleWearableSettingsDragOver(event) {
  const dropzone = appleHealthDropzoneFromEvent(event);
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.add('drag-over');
}

function handleWearableSettingsDragLeave(event) {
  const dropzone = appleHealthDropzoneFromEvent(event);
  if (!dropzone) return;
  dropzone.classList.remove('drag-over');
}

function handleWearableSettingsDrop(event) {
  const dropzone = appleHealthDropzoneFromEvent(event);
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  handleAppleHealthDrop(/** @type {DragEvent} */ (event));
}

export function installWearableSettingsDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || wearableSettingsDelegatesInstalled) return;
  wearableSettingsDelegatesInstalled = true;
  // Capture is required for action buttons nested inside <summary>; stopping
  // at document capture prevents the summary disclosure from toggling.
  root.addEventListener('click', handleWearableSettingsClick, true);
  root.addEventListener('change', handleWearableSettingsChange);
  root.addEventListener('dragover', handleWearableSettingsDragOver);
  root.addEventListener('dragleave', handleWearableSettingsDragLeave);
  root.addEventListener('drop', handleWearableSettingsDrop);
}

function formatAgo(ts) {
  if (!ts) return 'Not synced yet';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return '1 hour ago';
  if (hrs < 48) return `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

// Per-profile so a practitioner can disable wearables for a labs-only client
// without affecting their own profile. Mirrors the per-profile pattern used
// by `labcharts-wearable-stub-dismissed-${profile}` in wearables.js.
function _wearableStripHiddenKey() {
  return `wearables-strip-hidden-${state.currentProfile || 'default'}`;
}

export function isWearableStripHidden() {
  return localStorage.getItem(_wearableStripHiddenKey()) === '1';
}

export function setWearableStripHidden(hidden) {
  const key = _wearableStripHiddenKey();
  if (hidden) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
  navigateWearablesDashboard();
}

// Vendor logo / mark beside the adapter name. Backed by brands/<vendor>/
// and the registry in js/brand-assets.js. Phase 1 ships monochrome
// placeholder marks (form-factor only, no trademarks); Phase 2b drops
// official kits in per vendor and the render code picks them up
// automatically via brandHasSignIn / brandSignInUrl.
function vendorIcon(adapterId, opts = {}) {
  const mark = brandMarkMono(adapterId, opts);
  if (!mark) return '';
  return `<span class="wearable-vendor-icon" aria-hidden="true">${mark}</span>`;
}

export function renderWearablesSettingsSection() {
  const connected = listConnectedSources();
  const groups = groupWearableAdapters(
    visibleAdapters(Object.keys(connected)),
    connected,
    connectedAdapterNeedsAttention,
  );
  const groupMarkup = groups.map(group => renderAdapterGroup(group, connected)).join('');
  const hidden = isWearableStripHidden();
  return `<div class="settings-action-row wearable-visibility-row">
    <div class="settings-copy"><div class="settings-copy-title">Show wearable data on the dashboard</div>
      <div class="settings-copy-desc">Turn this off to hide readings from connected services. Manual weight, blood pressure, and pulse entries stay visible.</div></div>
    <label class="toggle-switch"><input type="checkbox" id="wearables-strip-hidden-toggle" ${hidden ? '' : 'checked'} ${wearableSettingsInputAttrs('strip-hidden')}><span class="toggle-slider"></span></label>
  </div>
  <div class="wearable-sources-intro" aria-labelledby="wearable-sources-title">
    <div class="wearable-sources-heading"><div class="settings-section-title" id="wearable-sources-title">Health data sources <span class="wearable-beta-label">Beta</span></div>
      <p>Connect a service to bring its readings into this profile. Connections and imported history stay on this device unless you turn on encrypted sync.</p></div>
    <details class="wearable-sources-privacy">
      <summary>How your data is protected</summary>
      <p>Connection keys and Google Health imports are always encrypted on this device. Other imported history is encrypted when you protect the profile with a passphrase.</p>
      <p>On getbased.health, the secure getbased relay forwards supported service requests without intentionally storing their contents. Self-hosted connections use the deployment owner's server.</p>
      <p>Encrypted sync and cloud AI are separate choices with their own controls.</p></details>
  </div>
  <div class="wearables-adapter-groups">${groupMarkup}</div>`;
}

function connectedAdapterNeedsAttention(adapter) {
  const connection = getConnection(adapter.id);
  return adapter.legacyMigrationOnly
    || connection?.needsReauth
    || isWearableRelayUnavailable(adapter)
    || (adapter.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter));
}

function renderAdapterGroup(group, connected) {
  const headingId = `wearables-group-${group.id}`;
  const rows = group.items.map(adapter => renderAdapterRow(adapter, !!connected[adapter.id])).join('');
  return `<section class="wearables-adapter-group" data-wearable-group="${escapeAttr(group.id)}" aria-labelledby="${headingId}">
    <div class="wearables-adapter-group-heading">
      <h3 class="wearables-adapter-group-title" id="${headingId}">${escapeHTML(group.title)}</h3>
      <p class="wearables-adapter-group-hint">${escapeHTML(group.hint)}</p>
    </div>
    <div class="wearables-adapter-list">${rows}</div>
  </section>`;
}

// Each adapter renders as a single horizontal row:
//   [icon] [name] [status]                   [right-aligned action]
// Connected adapters expand a details drawer below the row (identity, last
// sync, manage actions). Apple Health expands its export instructions.
function renderAdapterRow(adapter, isConnected) {
  const conn = isConnected ? getConnection(adapter.id) : null;
  const isOAuth = adapter.authType === 'oauth2';
  const isRelayUnavailable = isWearableRelayUnavailable(adapter);
  const isHostUnavailable = isRelayUnavailable || (adapter.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter));
  const isPendingClient = isOAuth
    && !isHostUnavailable
    && (getOAuthClientId(adapter) || '').startsWith('REPLACE_WITH_');
  const isFileImport = adapter.authType === 'file-import' && adapter.id === 'apple_health';

  // Status text — only when there's something meaningful to say.
  let status = '';
  if (isConnected && adapter.legacyMigrationOnly) {
    status = `<span class="wearable-row-status wearable-row-status-bad">Move this connection</span>`;
  } else if (isConnected && isHostUnavailable) {
    status = `<span class="wearable-row-status wearable-row-status-bad">Sync paused</span>`;
  } else if (isHostUnavailable) {
    const label = adapter.experimentalSelfHost ? 'Set up on your server' : 'Available when self-hosted';
    status = `<span class="wearable-row-status wearable-row-status-muted">${label}</span>`;
  } else if (isConnected && conn?.needsReauth) {
    status = `<span class="wearable-row-status wearable-row-status-bad">Reconnect to resume</span>`;
  } else if (isConnected) {
    const updated = conn?.lastSyncAt ? `Updated ${formatAgo(conn.lastSyncAt).toLowerCase()}` : 'Waiting for first update';
    status = `<span class="wearable-row-status wearable-row-status-ok"><span>Connected</span><span class="wearable-row-status-separator" aria-hidden="true">·</span><span class="wearable-row-status-detail">${escapeHTML(updated)}</span></span>`;
  } else if (isPendingClient) {
    status = `<span class="wearable-row-status wearable-row-status-pending">Not available yet</span>`;
  } else if (adapter.experimentalSelfHost) {
    status = `<span class="wearable-row-status wearable-row-status-muted">Available when self-hosted</span>`;
  } else if (adapter.integrationKind === 'aggregator') {
    status = `<span class="wearable-row-status wearable-row-status-muted">Connect through Google Health</span>`;
  } else if (isFileImport && !conn) {
    status = `<span class="wearable-row-status wearable-row-status-muted">Import from a file</span>`;
  } else if (isFileImport && conn) {
    status = `<span class="wearable-row-status wearable-row-status-ok">Imported ${escapeHTML(conn.coverageDays ?? '?')} days of data</span>`;
  }

  // Right-aligned action — Connect button, expand chevron, or Import.
  const action = renderRowAction(adapter, conn, { isPendingClient, isFileImport, isHostUnavailable });

  // Expandable body (only for connected adapters + Apple Health when wanting help).
  const detail = renderRowDetail(adapter, conn, { isPendingClient, isFileImport, isHostUnavailable });

  // Use <details>/<summary> for free keyboard-accessible disclosure when
  // there's something to expand. Otherwise render a flat row.
  const hasDetail = !!detail;
  const expandable = hasDetail;

  // When the logo already contains the vendor wordmark (Oura, Ultrahuman,
  // Withings, Polar) we hide the duplicate text label — visually the logo
  // IS the name. Vendors with symbol-only marks (WHOOP circular, Fitbit
  // dot-grid, Apple Health file glyph) still get the text label.
  const isWordmark = brandIconIsWordmark(adapter.id);
  const nameSpan = isWordmark
    ? `<span class="wearable-row-name sr-only">${escapeHTML(adapter.displayName)}</span>`
    : `<span class="wearable-row-name">${escapeHTML(adapter.displayName)}</span>`;

  if (expandable) {
    // Apple Health disconnected starts open by default — the dropzone +
    // export instructions are the whole reason a user lands on that row.
    // Other rows start collapsed.
    const startOpen = isFileImport && !conn;
    return `<details class="wearable-row${isConnected ? ' is-connected' : ''}" data-adapter="${escapeHTML(adapter.id)}"${startOpen ? ' open' : ''}>
      <summary class="wearable-row-summary">
        ${vendorIcon(adapter.id, { size: 20 })}
        ${nameSpan}
        ${status}
        <span class="wearable-row-action">${action}</span>
      </summary>
      <div class="wearable-row-detail">${detail}</div>
    </details>`;
  }

  return `<div class="wearable-row" data-adapter="${escapeHTML(adapter.id)}">
    <div class="wearable-row-summary wearable-row-summary-flat">
      ${vendorIcon(adapter.id, { size: 20 })}
      ${nameSpan}
      ${status}
      <span class="wearable-row-action">${action}</span>
    </div>
  </div>`;
}

// Vendors whose icon asset already contains their name (wordmark-style logo).
// We keep the text in the DOM for screen readers but hide it visually so the
// row doesn't read "Oura Oura connected · 5h ago". Polar is excluded —
// currently using the monochrome fallback glyph, not the wordmark, until the
// AccessLink written-consent ticket lands. See brands/polar/LICENSE.md.
function brandIconIsWordmark(adapterId) {
  return new Set(['oura', 'ultrahuman', 'withings']).has(adapterId);
}

// Right-side action — plain accent buttons across all vendors. Vendor brand
// identity sits on the LEFT side of the row (via vendorIcon's monochrome
// mark using each vendor's actual logo silhouette). The right side is
// uniform action language: Connect / Reconnect / Import / docs link / chevron.
function renderRowAction(adapter, conn, { isPendingClient, isFileImport, isHostUnavailable }) {
  if (conn && adapter.legacyMigrationOnly) {
    return `<span class="wearable-row-chevron" aria-hidden="true">▾</span>`;
  }
  if (isHostUnavailable) {
    return `<span class="wearable-row-chevron" aria-hidden="true">▾</span>`;
  }
  if (conn && !conn.needsReauth) {
    return `<span class="wearable-row-chevron" aria-hidden="true">▾</span>`;
  }
  if (conn && conn.needsReauth) {
    return `<button type="button" class="wearable-action-row-btn" ${wearableSettingsActionAttrs('connect', { adapter: adapter.id }, { stopPropagation: true })} aria-label="Reconnect ${escapeHTML(adapter.displayName)}">Reconnect</button>`;
  }
  if (isPendingClient) {
    return `<span class="wearable-row-chevron" aria-hidden="true">▾</span>`;
  }
  if (isFileImport) {
    return `<button type="button" class="wearable-action-row-btn" ${wearableSettingsActionAttrs('pick-apple-health-file', {}, { stopPropagation: true })}>Import</button>`;
  }
  if (adapter.authType === 'oauth2') {
    return `<button type="button" class="wearable-action-row-btn" ${wearableSettingsActionAttrs('connect', { adapter: adapter.id }, { stopPropagation: true })} aria-label="Connect ${escapeHTML(adapter.displayName)}">Connect</button>`;
  }
  return '';
}

function renderRowDetail(adapter, conn, { isPendingClient, isFileImport, isHostUnavailable }) {
  const privacyNotice = adapter.privacyNotice
    ? `<p class="wearable-adapter-hint wearable-adapter-privacy">${escapeHTML(adapter.privacyNotice)}</p>`
    : '';
  const migrationNotice = adapter.legacyMigrationOnly
    ? `<p class="wearable-adapter-hint wearable-adapter-privacy">${escapeHTML(adapter.deprecationNotice || 'This connection must be migrated.')}</p>`
    : '';
  if (conn && adapter.legacyMigrationOnly) {
    const acct = conn.account || {};
    const identity = escapeHTML(acct.email || acct.identity || 'Legacy Fitbit account');
    const replacementId = adapter.replacementAdapterId || 'google_health';
    const replacement = adapterById(replacementId);
    const replacementAvailable = isOAuthAdapterConfigured(replacement);
    const migrationAction = replacementAvailable
      ? `<button class="wearable-action wearable-action-primary" ${wearableSettingsActionAttrs('connect', { adapter: replacementId })}>Connect Google Health</button>`
      : `<p class="wearable-adapter-hint">Google Health connection is self-host only on this deployment. Configure your own Google Cloud OAuth project to migrate.${replacement?.authDocsUrl ? ` <a class="wearable-row-link" href="${escapeAttr(replacement.authDocsUrl)}" target="_blank" rel="noopener">Setup docs&nbsp;↗</a>` : ''}</p>`;
    return `<div class="wearable-adapter-identity">${identity}</div>
      ${migrationNotice}
      ${replacementAvailable ? '' : migrationAction}
      <div class="wearable-adapter-actions">
        ${replacementAvailable ? migrationAction : ''}
        <button class="wearable-action wearable-action-danger" ${wearableSettingsActionAttrs('disconnect', { adapter: adapter.id })}>Disconnect legacy Fitbit</button>
      </div>`;
  }
  // A connection created before the host disabled its integration remains
  // removable/revocable, but it must not offer sync, backfill, or reconnect.
  if (conn && isHostUnavailable) {
    const acct = conn.account || {};
    const identity = escapeHTML(acct.identity || acct.email || `${adapter.displayName} account`);
    const manageAccess = adapter.manageAccessUrl
      ? `<a class="wearable-action" href="${escapeAttr(adapter.manageAccessUrl)}" target="_blank" rel="noopener">Revoke access everywhere&nbsp;↗</a>`
      : '';
    return `<div class="wearable-adapter-identity">${identity}</div>
      ${privacyNotice}
      <p class="wearable-adapter-hint">This deployment no longer provides ${escapeHTML(adapter.displayName)} access. Automatic and manual sync are paused. You can remove this device's stored connection below.</p>
      <div class="wearable-adapter-actions">
        ${manageAccess}
        <button class="wearable-action wearable-action-danger" ${wearableSettingsActionAttrs('disconnect', { adapter: adapter.id })}>Disconnect</button>
      </div>`;
  }
  // Connected OAuth — identity + manage actions
  if (conn && !conn.needsReauth && adapter.authType === 'oauth2') {
    const acct = conn.account || {};
    const updated = conn.lastSyncAt
      ? `Last updated ${formatAgo(conn.lastSyncAt).toLowerCase()}`
      : 'Waiting for the first update';
    // Vendor identity priority: vendor-supplied identity string → email →
    // full name → user-id → generic fallback. Withings supplies a
    // last-measure timestamp string; Polar exposes first/last name + userId;
    // Oura/Fitbit/WHOOP supply email.
    const fullName = [acct.firstName, acct.lastName].filter(Boolean).join(' ').trim();
    const identity = escapeHTML(
      acct.identity
      || acct.email
      || fullName
      || (acct.userId ? `User ${acct.userId}` : '')
      || (acct['polar-user-id'] ? `User ${acct['polar-user-id']}` : '')
      || 'Connected account'
    );
    const replacement = adapter.replacementAdapterId ? adapterById(adapter.replacementAdapterId) : null;
    const migrateAction = replacement && isOAuthAdapterConfigured(replacement)
      ? `<button class="wearable-action wearable-action-primary" ${wearableSettingsActionAttrs('connect', { adapter: replacement.id })}>Connect Google Health</button>`
      : '';
    return `<div class="wearable-adapter-identity">${identity}</div>
      <div class="wearable-adapter-meta">${escapeHTML(updated)}</div>
      ${migrationNotice}
      <div class="wearable-adapter-actions">
        ${migrateAction}
        <button class="wearable-action wearable-action-primary" title="Checks the last 7 days, including today, for new or changed readings." ${wearableSettingsActionAttrs('sync-now', { adapter: adapter.id })} aria-label="Update ${escapeHTML(adapter.displayName)} now">
          <svg class="wearable-action-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
          <span>Update now <span class="wearable-action-hint">checks the last 7 days</span></span>
        </button>
        <button class="wearable-action wearable-action-secondary" title="Imports the last 90 days again to recover any missing readings. This can take a little longer." ${wearableSettingsActionAttrs('backfill', { adapter: adapter.id })}>Import last 90 days <span class="wearable-action-hint">fills missing days</span></button>
        <button class="wearable-action wearable-action-danger" ${wearableSettingsActionAttrs('disconnect', { adapter: adapter.id })}>Disconnect and remove data</button>
      </div>`;
  }
  // Apple Health connected — different actions
  if (conn && isFileImport) {
    const when = formatAgo(conn.lastSyncAt);
    const fileName = conn.fileName ? escapeHTML(conn.fileName) : 'export';
    return `<div class="wearable-adapter-identity">Imported from ${fileName}</div>
      <div class="wearable-adapter-meta">Last import: ${escapeHTML(when)} · ${conn.coverageDays ?? '?'} days</div>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" ${wearableSettingsActionAttrs('pick-apple-health-file')}>Re-import new export</button>
        <button class="wearable-action wearable-action-danger" ${wearableSettingsActionAttrs('disconnect', { adapter: adapter.id })}>Remove data</button>
      </div>
      <div id="apple-health-progress" class="apple-health-progress" style="display:none">
        <div class="apple-health-progress-bar"><div class="apple-health-progress-fill"></div></div>
        <div class="apple-health-progress-text"></div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" style="display:none" ${wearableSettingsInputAttrs('apple-health-file')}>`;
  }
  // Apple Health disconnected — full how-to-export + dropzone
  if (isFileImport) {
    return `<details class="wearable-adapter-hint apple-health-howto" style="font-size:12px">
        <summary>How to export from your iPhone</summary>
        <ol>
          <li>Open the <b>Health</b> app on your iPhone.</li>
          <li>Tap your profile photo (top-right corner).</li>
          <li>Scroll down → tap <b>Export All Health Data</b>.</li>
          <li>AirDrop or email the resulting <code>export.zip</code> to your computer.</li>
          <li>Drop it below (or unzip and drop the <code>export.xml</code> inside).</li>
        </ol>
        <p class="apple-health-privacy">Parsing runs entirely in your browser — the file never leaves this device.</p>
      </details>
      <div class="apple-health-dropzone"
           data-wearable-settings-dropzone="apple-health"
           ${wearableSettingsActionAttrs('pick-apple-health-file')}>
        <div class="apple-health-dropzone-icon">📂</div>
        <div class="apple-health-dropzone-text">Drop <code>export.zip</code> or <code>export.xml</code> here — or click to pick a file</div>
      </div>
      <div id="apple-health-progress" class="apple-health-progress" style="display:none">
        <div class="apple-health-progress-bar"><div class="apple-health-progress-fill"></div></div>
        <div class="apple-health-progress-text"></div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" style="display:none" ${wearableSettingsInputAttrs('apple-health-file')}>`;
  }
  if (isHostUnavailable) {
    const setupDocsUrl = adapter.selfHostDocsUrl || adapter.authDocsUrl;
    const docs = setupDocsUrl
      ? ` <a class="wearable-row-link" href="${escapeAttr(setupDocsUrl)}" target="_blank" rel="noopener">Setup docs&nbsp;↗</a>`
      : '';
    const explanation = isWearableRelayUnavailable(adapter)
      ? `${SELF_HOSTED_WEARABLE_MESSAGE} ${adapter.displayName} remains available when you run getbased on infrastructure you control.`
      : adapter.id === 'google_health'
      ? 'Google Health is not offered by this hosted deployment. Self-host getbased and configure your own Google Cloud OAuth client ID and secret to enable it.'
      : `${adapter.displayName} is an experimental self-host integration. Enable it with this deployment's own developer client ID and secret; it is hidden on unconfigured hosted deployments.`;
    return `<p class="wearable-adapter-hint">${escapeHTML(explanation)}${docs}</p>`;
  }
  // Pending OAuth client — explanation
  if (isPendingClient) {
    const docs = adapter.authDocsUrl
      ? ` <a class="wearable-row-link" href="${escapeAttr(adapter.authDocsUrl)}" target="_blank" rel="noopener">docs&nbsp;↗</a>`
      : '';
    const explanation = adapter.id === 'google_health'
      ? 'Google Health requires this deployment to configure an approved OAuth client before Connect can be enabled.'
      : `${adapter.displayName} support is in progress — still waiting on partner credentials. Check back soon or watch the changelog.`;
    return `<p class="wearable-adapter-hint">${escapeHTML(explanation)}${docs}</p>`;
  }
  // Manual source — entry counts + entry points + disconnect. Unlike OAuth,
  // manual has no credential to reconnect; "disconnect" means wipe all rows.
  if (conn && adapter.authType === 'manual') {
    return `<div class="wearable-adapter-identity">Entered manually on this device</div>
      <div class="wearable-adapter-meta" id="wearable-manual-counts" data-role="manual-counts">
        <span class="muted">Counting readings…</span>
      </div>
      <p class="wearable-adapter-hint" style="margin-top:4px;font-size:12px">
        Log, edit, or delete individual entries from the dashboard — tap any
        weight / BP / resting HR card to open its detail view.
      </p>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" ${wearableSettingsActionAttrs('manual-dashboard')}>Open dashboard</button>
        <button class="wearable-action wearable-action-danger" ${wearableSettingsActionAttrs('manual-disconnect')}>Delete all manual entries</button>
      </div>`;
  }
  // Disconnected OAuth (default) — no detail to expand. The Connect button
  // in the row action is enough; row stays flat.
  return null;
}

// Manual source — UI handlers. Settings → Integrations → Manual exposes a
// single-click path to (a) go log/manage on the dashboard and (b) nuke all
// manual data. Per-reading delete lives on the dashboard detail modal.
function handleManualOpenDashboard() {
  // Settings modal is an overlay; let the caller close it by dispatching the
  // same Escape path the close button uses. We just navigate the underlying
  // dashboard — the user hits Escape / closes Settings manually.
  closeWearableSettingsModal();
  navigateWearablesDashboard();
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function handleManualDisconnect() {
  if (await confirmWearableSettingsAction(
    'Delete all manual entries? This removes every weight / BP / pulse entry you\'ve logged manually. Data from connected wearables (Oura, Withings, etc.) is untouched. Can\'t be undone.'
  )) {
    try {
      const profileId = getActiveProfileId();
      // Records synced per-field/date deletion markers before clearing L1,
      // including dates that only survive in the legacy biometrics payload.
      // A peer can therefore no longer rebuild and republish these readings.
      await deleteAllManualMetrics(profileId);
      await refreshManualSummary(profileId);
      showNotification?.('All manual entries deleted', 'success');
      refreshSettingsWearables();
      navigateWearablesDashboard();
    } catch (e) {
      showNotification?.(`Couldn't delete: ${getErrorMessage(e)}`, 'error', 4000);
    }
  }
}

// Populate the "X weight, Y BP, Z pulse" counts line in the manual
// detail-drawer — async because it reads from IndexedDB. Called when the
// Settings section is rendered and whenever the drawer opens.
async function _updateManualCounts() {
  const el = document.querySelector('[data-role="manual-counts"]');
  if (!el) return;
  try {
    const profileId = getActiveProfileId();
    const rows = await getDailyRange(profileId, 'manual', '2000-01-01', '2099-12-31');
    let weightN = 0, bpN = 0, rhrN = 0;
    for (const r of rows) {
      if (typeof r.weight === 'number') weightN++;
      if (typeof r.bp_systolic === 'number' || typeof r.bp_diastolic === 'number') bpN++;
      if (typeof r.rhr === 'number') rhrN++;
    }
    const parts = [];
    if (weightN) parts.push(`${weightN} weight`);
    if (bpN) parts.push(`${bpN} blood pressure`);
    if (rhrN) parts.push(`${rhrN} pulse`);
    el.textContent = parts.length ? parts.join(' · ') + ' readings' : 'No manual entries yet';
  } catch { /* non-fatal */ }
}

function _oauthClientConfigFingerprint() {
  return visibleAdapters(Object.keys(listConnectedSources()))
    .filter(adapter => adapter.authType === 'oauth2')
    .map(adapter => `${adapter.id}:${getOAuthClientId(adapter) || ''}:${isOAuthAdapterConfigured(adapter)}`)
    .join('|');
}

async function _refreshAfterWearableRuntimeConfig() {
  const before = _oauthClientConfigFingerprint();
  await loadWearableRuntimeConfig({ waitForFetch: true });
  if (before !== _oauthClientConfigFingerprint()) refreshSettingsWearables();
}

// Fire when the details element opens (delegated — the Settings section is
// re-rendered on demand so we can't bind once at module load).
document.addEventListener('toggle', (e) => {
  if (e.target instanceof HTMLDetailsElement
      && e.target.matches('details.wearable-row[data-adapter="manual"]')
      && e.target.open) {
    _updateManualCounts();
  }
}, true);

// Also fire on initial paint so the row populates whether or not the user
// toggles it. The Settings section re-renders on every open so a microtask
// kick is enough — no observer needed.
document.addEventListener('settings:wearables-rendered', () => {
  // Slightly defer so the [data-role="manual-counts"] element is in the DOM.
  queueMicrotask(_updateManualCounts);
  // A fresh profile has no connected OAuth source, so startup maintenance
  // does not load the public client-id map. Start it when Settings opens and
  // re-render only if the returned configuration changed an adapter row.
  void _refreshAfterWearableRuntimeConfig();
});

async function handleWearableConnect(adapterId) {
  try {
    await loadWearableRuntimeConfig({ waitForFetch: true });
    const adapter = adapterById(adapterId);
    if (!adapter) throw new Error('Unknown wearable provider.');
    if (isWearableRelayUnavailable(adapter)) {
      showNotification?.(SELF_HOSTED_WEARABLE_MESSAGE, 'info', 7000);
      return;
    }
    if (adapter?.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter)) {
      const message = adapter.id === 'google_health'
        ? 'Google Health is self-host only on this deployment. Configure your own Google Cloud OAuth project to enable it.'
        : `${adapter.displayName} is an experimental self-host integration. Configure and enable this deployment's own OAuth client first.`;
      showNotification?.(message, 'info', 6000);
      return;
    }
    if (adapterId === 'google_health') {
      const consented = await confirmWearableSettingsAction(GOOGLE_HEALTH_CONNECT_DISCLOSURE, {
        confirmLabel: 'Continue to Google',
        tone: 'primary',
        ariaLabel: 'Google Health data access consent',
      });
      if (!consented) return;
    } else if (requiresHostedWearableRelayConsent(adapterId)) {
      const consented = await requestHostedWearableRelayConsent(adapterId, adapter.displayName);
      if (!consented) return;
    } else if (adapter?.experimentalSelfHost) {
      const consented = await confirmWearableSettingsAction(
        `${adapter.displayName} is an experimental self-hosted integration and uses this deployment's own developer app. Continue to ${adapter.displayName}?`,
        { confirmLabel: `Continue to ${adapter.displayName}`, tone: 'primary' },
      );
      if (!consented) return;
    }
    beginConnectOAuth(adapterId);
    // beginOAuth navigates away — nothing else to do here.
  } catch (e) {
    showNotification?.(`Connect failed: ${getErrorMessage(e)}`, 'error', 5000);
  }
}

function handleAppleHealthDrop(e) {
  const file = e.dataTransfer?.files?.[0];
  if (file) importAppleHealthFlow(file);
}

function handleAppleHealthFilePick(input) {
  const file = input.files?.[0];
  if (file) importAppleHealthFlow(file);
  input.value = ''; // so picking the same file twice re-triggers
}

async function importAppleHealthFlow(file) {
  const { importAppleHealthFile } = await import('./wearables-apple-health.js');
  const bar = document.querySelector('.apple-health-progress-fill');
  const wrap = document.getElementById('apple-health-progress');
  const text = document.querySelector('.apple-health-progress-text');
  if (wrap) wrap.style.display = 'block';
  try {
    const res = await importAppleHealthFile(file, ({ stage, pct, rows, startDate, endDate }) => {
      if (bar instanceof HTMLElement) bar.style.width = (pct ?? 0) + '%';
      if (text) text.textContent = stage === 'done'
        ? `${rows} days imported (${startDate} – ${endDate})`
        : `${stage}… ${pct ?? 0}%`;
    }, {
      beforeCycleReview: () => closeWearableSettingsModal(),
    });
    const cycleSuffix = res.cycleImport ? ` + ${res.cycleImport.periods} cycle periods` : '';
    showNotification?.(`Apple Health imported - ${res.rows} days${cycleSuffix}`, 'success', 3000);
    if (res.cycleError) showNotification?.(`Cycle import skipped: ${res.cycleError}`, 'info', 5000);
    refreshSettingsWearables();
    navigateWearablesDashboard();
  } catch (e) {
    showNotification?.(`Apple Health import failed: ${getErrorMessage(e)}`, 'error', 6000);
    if (text) text.textContent = `Failed: ${getErrorMessage(e)}`;
  }
}

async function handleWearableSyncNow(adapterId, triggerEl) {
  const btn = triggerEl;
  btn?.classList.add('is-syncing');
  if (btn) btn.disabled = true;
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Checking ${name} for new readings…`, 'info', 1500);
    const res = await syncNow(adapterId, { force: true });
    showNotification?.(`${name} is up to date. ${res.rows ?? 0} days checked.`, 'success', 2500);
    refreshSettingsWearables();
    navigateWearablesDashboard();
  } catch { /* syncNow already notified */ }
  finally {
    btn?.classList.remove('is-syncing');
    if (btn) btn.disabled = false;
  }
}

async function handleWearableBackfill(adapterId) {
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Importing the last 90 days from ${name}…`, 'info', 2000);
    const bf = await backfillWearable(adapterId);
    await syncWearableSummary(getActiveProfileId(), listConnectedSources());
    showNotification?.(`Imported ${bf.rows} days from ${name}.`, 'success');
    refreshSettingsWearables();
    navigateWearablesDashboard();
  } catch (e) {
    showNotification?.(`Couldn't import ${name} history: ${getErrorMessage(e)}`, 'error', 4000);
  }
}

async function handleWearableDisconnect(adapterId) {
  const name = adapterById(adapterId)?.displayName || adapterId;
  if (await showConfirmDialog(`Disconnect ${name}? This stops future imports and removes this device's connection and imported ${name} data.`)) {
    try {
      await disconnectWearable(adapterId, { deleteData: true });
      withdrawHostedWearableRelayConsent(adapterId);
      showNotification?.(`${name} disconnected`, 'success');
      refreshSettingsWearables();
      navigateWearablesDashboard();
    } catch (e) {
      showNotification?.(`Disconnect failed: ${getErrorMessage(e)}`, 'error', 5000);
      refreshSettingsWearables();
    }
  }
}

function refreshSettingsWearables() {
  const section = document.getElementById('wearables-section');
  if (!section) return;
  section.innerHTML = renderWearablesSettingsSection();
  // Runtime OAuth configuration can arrive after the initial counts read and
  // replace the whole section. Rehydrate the async manual counts on the new
  // DOM instead of leaving the row stuck at "Counting readings…".
  queueMicrotask(_updateManualCounts);
}

export const wearableSettingsActionHandlers = Object.freeze({
  handleManualOpenDashboard,
  handleManualDisconnect,
  handleWearableConnect,
  handleWearableSyncNow,
  handleWearableBackfill,
  handleWearableDisconnect,
  handleAppleHealthDrop,
  handleAppleHealthFilePick,
});

installWearableSettingsDelegates();
