// wearables-settings-panel.js — Settings → Wearables integrations panel.
// Keeps provider rows, connection actions, Apple Health import controls, and
// manual-source management out of the dashboard strip renderer.

import { escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { state } from './state.js';
import { adapterById, visibleAdapters, getOAuthClientId } from './wearable-adapters.js';
import { brandMarkMono } from './brand-assets.js';
import {
  beginConnectOAuth,
  backfillWearable,
  disconnectWearable,
  syncNow,
  listConnectedSources,
  getConnection,
} from './wearables-connect.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';

function formatAgo(ts) {
  if (!ts) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
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
  if (window.navigate) window.navigate('dashboard');
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
  const rows = visibleAdapters(Object.keys(connected))
    .map(a => renderAdapterRow(a, !!connected[a.id])).join('');
  const hidden = isWearableStripHidden();
  // BETA badge moves out of every row to a single section-level note. Every
  // wearable adapter is currently beta — the per-row chip was redundant.
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;color:var(--text-secondary)">Wearable integrations</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Show data from connected wearables (Oura, Withings, Fitbit, etc.) on the dashboard. Off keeps the strip as a Biometrics strip — your manual weight, BP, and pulse entries still appear.</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="wearables-strip-hidden-toggle" ${hidden ? '' : 'checked'} onchange="window.setWearableStripHidden(!this.checked)">
      <span class="toggle-slider"></span>
    </label>
  </div>
  <div class="settings-section-header" style="display:block">
    <div class="settings-section-title" style="display:block;margin-bottom:4px">Connected devices</div>
    <div class="settings-section-hint" style="display:block">Data stays on this device; a compact summary + anomaly events sync to your other devices. All integrations are <em>beta</em> — please report issues.</div>
  </div>
  <div class="wearables-adapter-list">${rows}</div>`;
}

// Each adapter renders as a single horizontal row:
//   [icon] [name] [status]                   [right-aligned action]
// Connected adapters expand a details drawer below the row (identity, last
// sync, manage actions). Apple Health expands its export instructions.
function renderAdapterRow(adapter, isConnected) {
  const conn = isConnected ? getConnection(adapter.id) : null;
  const isOAuth = adapter.authType === 'oauth2';
  const isPendingClient = isOAuth && (getOAuthClientId(adapter) || '').startsWith('REPLACE_WITH_');
  const isFileImport = adapter.authType === 'file-import' && adapter.id === 'apple_health';

  // Status text — only when there's something meaningful to say.
  let status = '';
  if (isConnected && conn?.needsReauth) {
    status = `<span class="wearable-row-status wearable-row-status-bad">needs reconnection</span>`;
  } else if (isConnected) {
    const ago = conn?.lastSyncAt ? formatAgo(conn.lastSyncAt) : 'never synced';
    status = `<span class="wearable-row-status wearable-row-status-ok">connected · ${escapeHTML(ago)}</span>`;
  } else if (isPendingClient) {
    status = `<span class="wearable-row-status wearable-row-status-pending">waiting on partner credentials</span>`;
  } else if (isFileImport && !conn) {
    status = `<span class="wearable-row-status wearable-row-status-muted">file import only</span>`;
  } else if (isFileImport && conn) {
    status = `<span class="wearable-row-status wearable-row-status-ok">imported · ${escapeHTML(conn.coverageDays ?? '?')} days</span>`;
  }

  // Right-aligned action — Connect button, expand chevron, or Import.
  const action = renderRowAction(adapter, conn, { isPendingClient, isFileImport });

  // Expandable body (only for connected adapters + Apple Health when wanting help).
  const detail = renderRowDetail(adapter, conn, { isPendingClient, isFileImport });

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
function renderRowAction(adapter, conn, { isPendingClient, isFileImport }) {
  if (conn && !conn.needsReauth) {
    return `<span class="wearable-row-chevron" aria-hidden="true">▾</span>`;
  }
  if (conn && conn.needsReauth) {
    return `<button type="button" class="wearable-action-row-btn" onclick="event.stopPropagation();handleWearableConnect('${escapeHTML(adapter.id)}')" aria-label="Reconnect ${escapeHTML(adapter.displayName)}">Reconnect</button>`;
  }
  if (isPendingClient) {
    const docs = adapter.authDocsUrl
      ? `<a class="wearable-row-link" href="${escapeHTML(adapter.authDocsUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">docs&nbsp;↗</a>`
      : '';
    return docs;
  }
  if (isFileImport) {
    return `<button type="button" class="wearable-action-row-btn" onclick="event.stopPropagation();document.getElementById('apple-health-file-input').click()">Import</button>`;
  }
  if (adapter.authType === 'oauth2') {
    return `<button type="button" class="wearable-action-row-btn" onclick="event.stopPropagation();handleWearableConnect('${escapeHTML(adapter.id)}')" aria-label="Connect ${escapeHTML(adapter.displayName)}">Connect</button>`;
  }
  return '';
}

function renderRowDetail(adapter, conn, { isPendingClient, isFileImport }) {
  // Connected OAuth — identity + manage actions
  if (conn && !conn.needsReauth && adapter.authType === 'oauth2') {
    const acct = conn.account || {};
    const when = conn.lastSyncAt ? formatAgo(conn.lastSyncAt) : 'never';
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
      || '(account verified)'
    );
    return `<div class="wearable-adapter-identity">${identity}</div>
      <div class="wearable-adapter-meta">Last sync: ${escapeHTML(when)}</div>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" title="Refetches the last 7 days — catches today's reading even if you synced earlier." onclick="handleWearableSyncNow('${escapeHTML(adapter.id)}', this)" aria-label="Sync ${escapeHTML(adapter.displayName)} now">
          <svg class="wearable-action-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
          <span>Sync now <span class="wearable-action-hint">(catches today)</span></span>
        </button>
        <button class="wearable-action wearable-action-secondary" title="Refetches 90 days of history — useful after a long absence or to recover missing days. May take 30s+." onclick="handleWearableBackfill('${escapeHTML(adapter.id)}')">Backfill 90 days <span class="wearable-action-hint">(slower, fills gaps)</span></button>
        <button class="wearable-action wearable-action-danger" onclick="handleWearableDisconnect('${escapeHTML(adapter.id)}')">Disconnect</button>
      </div>`;
  }
  // Apple Health connected — different actions
  if (conn && isFileImport) {
    const when = formatAgo(conn.lastSyncAt);
    const fileName = conn.fileName ? escapeHTML(conn.fileName) : 'export';
    return `<div class="wearable-adapter-identity">Imported from ${fileName}</div>
      <div class="wearable-adapter-meta">Last import: ${escapeHTML(when)} · ${conn.coverageDays ?? '?'} days</div>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" onclick="document.getElementById('apple-health-file-input').click()">Re-import new export</button>
        <button class="wearable-action wearable-action-danger" onclick="handleWearableDisconnect('${escapeHTML(adapter.id)}')">Remove data</button>
      </div>
      <div id="apple-health-progress" class="apple-health-progress" style="display:none">
        <div class="apple-health-progress-bar"><div class="apple-health-progress-fill"></div></div>
        <div class="apple-health-progress-text"></div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" style="display:none" onchange="handleAppleHealthFilePick(this)">`;
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
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="event.preventDefault();this.classList.remove('drag-over');handleAppleHealthDrop(event)"
           onclick="document.getElementById('apple-health-file-input').click()">
        <div class="apple-health-dropzone-icon">📂</div>
        <div class="apple-health-dropzone-text">Drop <code>export.zip</code> or <code>export.xml</code> here — or click to pick a file</div>
      </div>
      <div id="apple-health-progress" class="apple-health-progress" style="display:none">
        <div class="apple-health-progress-bar"><div class="apple-health-progress-fill"></div></div>
        <div class="apple-health-progress-text"></div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" style="display:none" onchange="handleAppleHealthFilePick(this)">`;
  }
  // Pending OAuth client — explanation
  if (isPendingClient) {
    return `<p class="wearable-adapter-hint">${escapeHTML(adapter.displayName)} support is in progress — still waiting on partner credentials. Check back soon or watch the changelog.</p>`;
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
        <button class="wearable-action wearable-action-primary" onclick="handleManualOpenDashboard()">Open dashboard</button>
        <button class="wearable-action wearable-action-danger" onclick="handleManualDisconnect()">Delete all manual entries</button>
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
  if (window.closeSettings) window.closeSettings();
  if (window.navigate) window.navigate('dashboard');
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function handleManualDisconnect() {
  if (typeof window.showConfirmDialog !== 'function') return;
  if (await window.showConfirmDialog(
    'Delete all manual entries? This removes every weight / BP / pulse entry you\'ve logged manually. Data from connected wearables (Oura, Withings, etc.) is untouched. Can\'t be undone.'
  )) {
    try {
      const { clearSource } = await import('./wearables-store.js');
      const { refreshManualSummary } = await import('./wearables-manual.js');
      const profileId = getActiveProfileId();
      await clearSource(profileId, 'manual');
      // Drop the connection record too — the row disappears from the strip
      // source header and the Settings integrations list.
      if (state.importedData.wearableConnections) {
        delete state.importedData.wearableConnections.manual;
        const { saveImportedData } = await import('./data.js');
        await saveImportedData();
      }
      await refreshManualSummary(profileId);
      showNotification?.('All manual entries deleted', 'success');
      refreshSettingsWearables();
      if (window.navigate) window.navigate('dashboard');
    } catch (e) {
      showNotification?.(`Couldn't delete: ${e.message}`, 'error', 4000);
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
    const { getDailyRange } = await import('./wearables-store.js');
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

// Fire when the details element opens (delegated — the Settings section is
// re-rendered on demand so we can't bind once at module load).
document.addEventListener('toggle', (e) => {
  if (e.target?.matches?.('details.wearable-row[data-adapter="manual"]') && e.target.open) {
    _updateManualCounts();
  }
}, true);

// Also fire on initial paint so the row populates whether or not the user
// toggles it. The Settings section re-renders on every open so a microtask
// kick is enough — no observer needed.
document.addEventListener('settings:wearables-rendered', () => {
  // Slightly defer so the [data-role="manual-counts"] element is in the DOM.
  queueMicrotask(_updateManualCounts);
});

function handleWearableConnect(adapterId) {
  try {
    beginConnectOAuth(adapterId);
    // beginOAuth navigates away — nothing else to do here.
  } catch (e) {
    showNotification?.(`Connect failed: ${e.message}`, 'error', 5000);
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
      if (bar) bar.style.width = (pct ?? 0) + '%';
      if (text) text.textContent = stage === 'done'
        ? `${rows} days imported (${startDate} – ${endDate})`
        : `${stage}… ${pct ?? 0}%`;
    });
    showNotification?.(`Apple Health imported — ${res.rows} days`, 'success', 3000);
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  } catch (e) {
    showNotification?.(`Apple Health import failed: ${e.message}`, 'error', 6000);
    if (text) text.textContent = `Failed: ${e.message}`;
  }
}

async function handleWearableSyncNow(adapterId, triggerEl) {
  const btn = triggerEl;
  btn?.classList.add('is-syncing');
  if (btn) btn.disabled = true;
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Syncing ${name}…`, 'info', 1500);
    const res = await syncNow(adapterId, { force: true });
    showNotification?.(`${name} synced (${res.rows ?? 0} new)`, 'success', 2500);
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  } catch { /* syncNow already notified */ }
  finally {
    btn?.classList.remove('is-syncing');
    if (btn) btn.disabled = false;
  }
}

async function handleWearableBackfill(adapterId) {
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Backfilling ${name}…`, 'info', 2000);
    const bf = await backfillWearable(adapterId);
    await syncWearableSummary(getActiveProfileId(), listConnectedSources());
    showNotification?.(`${name} backfilled ${bf.rows} days`, 'success');
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  } catch (e) {
    showNotification?.(`Backfill failed: ${e.message}`, 'error', 4000);
  }
}

async function handleWearableDisconnect(adapterId) {
  const name = adapterById(adapterId)?.displayName || adapterId;
  if (await showConfirmDialog(`Disconnect ${name} and delete its local data?`)) {
    await disconnectWearable(adapterId, { deleteData: true });
    showNotification?.(`${name} disconnected`, 'success');
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  }
}

function refreshSettingsWearables() {
  const section = document.getElementById('wearables-section');
  if (section) section.innerHTML = renderWearablesSettingsSection();
}

Object.assign(window, {
  setWearableStripHidden,
  isWearableStripHidden,
  renderWearablesSettingsSection,
  handleManualOpenDashboard,
  handleManualDisconnect,
  handleWearableConnect,
  handleWearableSyncNow,
  handleWearableBackfill,
  handleWearableDisconnect,
  handleAppleHealthDrop,
  handleAppleHealthFilePick,
});
