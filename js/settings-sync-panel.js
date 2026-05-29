// settings-sync-panel.js — Cross-device sync and Agent Access settings panels

import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import {
  isSyncEnabled,
  enableSync,
  disableSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncBlocker,
  restoreFromMnemonic,
  getSyncRelay,
  setSyncRelay,
  checkRelayConnection,
  isMessengerEnabled,
  getMessengerToken,
  generateMessengerToken,
  revokeMessengerToken,
  pushContextToGateway,
} from './sync.js';

function renderPendingTombstones() {
  const pending = window.listPendingTombstones?.() || [];
  if (pending.length === 0) return '';
  const rows = pending.map(p => `
    <div class="sync-tombstone-row" data-tomb-id="${escapeAttr(p.id)}">
      <span class="sync-tombstone-name">${escapeHTML(p.name)}</span>
      <span class="sync-tombstone-meta">${p.at ? `flagged ${new Date(p.at).toLocaleDateString()}` : ''}</span>
      <button class="sync-tombstone-btn sync-tombstone-apply" onclick="window.applyPendingTombstone('${escapeAttr(p.id)}').then(() => window.openSettingsModal('data'))">Apply delete</button>
      <button class="sync-tombstone-btn sync-tombstone-reject" onclick="window.rejectPendingTombstone('${escapeAttr(p.id)}').then(() => window.openSettingsModal('data'))">Restore</button>
    </div>`).join('');
  return `
    <div class="sync-tombstone-banner">
      <div class="sync-tombstone-head">
        <strong>${pending.length} profile${pending.length === 1 ? '' : 's'} flagged for deletion on another device</strong>
        <span class="sync-tombstone-help">Confirm each — Apply wipes locally, Restore re-publishes.</span>
      </div>
      ${rows}
    </div>`;
}

export function renderSyncSection() {
  const enabled = isSyncEnabled();
  const relay = getSyncRelay();
  const blocker = getSyncBlocker();
  // Banner appears in place of the toggle when the browser is missing a
  // primitive Evolu needs (Web Locks, StorageManager, OPFS, or WebCrypto).
  // Lets the user see "this is broken and here's why" instead of clicking
  // a dead toggle and waiting 30s for a cryptic timeout toast.
  const blockerBanner = blocker ? `
    <div style="margin-bottom:16px;padding:10px 12px;border:1px solid #fbbf24;background:rgba(251,191,36,0.08);border-radius:6px;color:#fbbf24;font-size:12px;line-height:1.45">
      <strong>Sync unavailable in this browser.</strong><br>
      ${escapeHTML(blocker)}
    </div>` : '';
  return `
    ${blockerBanner}
    ${renderPendingTombstones()}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${enabled ? '16' : '8'}px;${blocker ? 'opacity:0.5;pointer-events:none' : ''}">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Cross-device sync</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">E2E encrypted via Evolu CRDT</div>
      </div>
      <label class="chat-websearch-toggle-label" style="display:flex" aria-label="Toggle cross-device sync">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSync(this.checked)" style="display:none" ${blocker ? 'disabled' : ''}>
        <span class="chat-toggle-slider"></span>
      </label>
    </div>
    ${enabled ? `
      <div id="sync-relay-status" style="display:flex;align-items:center;gap:6px;margin-bottom:16px">
        <span id="sync-status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block"></span>
        <span id="sync-status-text" style="font-size:12px;color:var(--text-muted)">Checking relay...</span>
      </div>

      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Your mnemonic</label>
          <div style="display:flex;gap:6px">
            <button id="sync-mnemonic-toggle" class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" onclick="toggleMnemonicVisibility()" aria-label="Show mnemonic">Show</button>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" onclick="copyMnemonic()" aria-label="Copy mnemonic">Copy</button>
          </div>
        </div>
        <div id="sync-mnemonic" data-masked="true" style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;min-height:20px;user-select:none" aria-label="Mnemonic phrase">Loading...</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">These words are your encryption key. Store them offline. Never share them.</div>
      </div>

      <div style="margin-bottom:16px">
        <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px;width:100%" onclick="openRestoreMnemonicDialog()">Restore from a different mnemonic…</button>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.4">Replace this device's identity with a 24-word seed from another device. Your current data is overwritten.</div>
      </div>

      <details style="margin-bottom:8px">
        <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none">Advanced</summary>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Relay server</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="sync-relay-input" value="${escapeAttr(relay)}" style="flex:1;font-size:12px;border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:6px 10px;font-family:var(--font-mono, monospace)" placeholder="wss://...">
            <button class="import-btn import-btn-secondary" style="font-size:12px;padding:4px 12px" onclick="saveSyncRelay()">Save</button>
          </div>
        </div>
      </details>
    ` : `
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5">
        Sync profiles, lab data, and AI settings across your devices. Data is encrypted with a key derived from a 24-word mnemonic — the relay server only sees ciphertext.
      </div>
    `}
  `;
}

let _syncToggling = false;
let _syncToggleWatchdog = null;
function _releaseSyncToggle() {
  _syncToggling = false;
  if (_syncToggleWatchdog) { clearTimeout(_syncToggleWatchdog); _syncToggleWatchdog = null; }
}

async function toggleSync(enabled) {
  if (_syncToggling) {
    // Don't silently swallow — tell the user their click registered but is
    // already mid-flight. (If they're hitting this repeatedly, the watchdog
    // below will release the lock so the next click works.)
    showNotification('Sync change already in progress…', 'info');
    return;
  }
  _syncToggling = true;
  // Watchdog: if the modal closes by some path that doesn't run our
  // cleanup (e.g. ESC key, page nav, browser back, JS error), release
  // the toggle lock after 60s so the next click isn't dead. 60s is
  // generous — long enough to write down 24 words, short enough to
  // recover from a wedge before the user gives up.
  _syncToggleWatchdog = setTimeout(_releaseSyncToggle, 60000);
  if (enabled) {
    showSyncSetupModal();
    // _syncToggling cleared by closeSyncSetup, syncSetupDone, or watchdog
  } else {
    try {
      _mnemonicCache = null;
      _mnemonicRetries = 0;
      clearTimeout(_mnemonicRetryTimer);
      await disableSync();
      // disableSync triggers a page reload, but if we're still here render
      // the disabled state immediately for visual feedback.
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } catch (e) {
      console.error('[sync] disable failed:', e);
      showNotification(`Disable failed: ${e?.message || e}`, 'error');
      // Visually un-stick the toggle by re-rendering — the underlying
      // localStorage flag is already false (set early in disableSync) so
      // the toggle will show as off.
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } finally {
      _releaseSyncToggle();
    }
  }
}

export function showSyncSetupModal() {
  let overlay = document.getElementById('sync-setup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sync-setup-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Sync setup" style="max-width:480px">
    <h3 style="margin:0 0 6px;font-size:16px;color:var(--text-primary)">Set up sync</h3>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 20px;line-height:1.5">Your data is encrypted with a 24-word mnemonic. The relay server only sees ciphertext.</p>
    <div id="sync-setup-choices">
      <button class="import-btn import-btn-primary" style="width:100%;padding:12px 16px;font-size:13px;margin-bottom:10px;text-align:left" onclick="syncSetupNew()">
        <div style="font-weight:600">New setup</div>
        <div style="font-weight:400;opacity:0.8;margin-top:2px;font-size:12px">First time syncing — generate a new mnemonic</div>
      </button>
      <button class="import-btn import-btn-secondary" style="width:100%;padding:12px 16px;font-size:13px;text-align:left" onclick="syncSetupRestore()">
        <div style="font-weight:600">Join existing</div>
        <div style="font-weight:400;opacity:0.8;margin-top:2px;font-size:12px">I have a mnemonic from another device</div>
      </button>
    </div>
    <div id="sync-setup-new" style="display:none"></div>
    <div id="sync-setup-restore" style="display:none">
      <textarea id="sync-setup-restore-input" style="font-size:12px;width:100%;height:70px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:10px 12px;font-family:var(--font-mono, monospace);box-sizing:border-box;margin-bottom:10px" placeholder="Paste your 24-word mnemonic here..."></textarea>
      <div style="display:flex;gap:8px">
        <button class="import-btn import-btn-primary" style="flex:1;padding:8px 16px;font-size:13px" onclick="syncSetupDoRestore()">Restore</button>
        <button class="import-btn import-btn-secondary" style="padding:8px 16px;font-size:13px" onclick="syncSetupBack()">Back</button>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      <button class="confirm-btn confirm-btn-cancel" onclick="closeSyncSetup()">Cancel</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  overlay.onclick = (e) => { if (e.target === overlay) { const d = overlay.querySelector('.confirm-dialog'); if (d) { d.classList.add('modal-nudge'); d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true }); } } };
}

async function closeSyncSetup() {
  const overlay = document.getElementById('sync-setup-overlay');
  if (overlay) overlay.classList.remove('show');
  // If sync was started during setup but user cancelled, clean up
  if (isSyncEnabled()) {
    _mnemonicCache = null;
    _mnemonicRetries = 0;
    clearTimeout(_mnemonicRetryTimer);
    await disableSync();
  }
  const el = document.getElementById('sync-section');
  if (el) el.innerHTML = renderSyncSection();
  _releaseSyncToggle();
}

let _syncSetupInProgress = false;
async function syncSetupNew() {
  if (_syncSetupInProgress) return;
  _syncSetupInProgress = true;
  const choicesEl = document.getElementById('sync-setup-choices');
  const newEl = document.getElementById('sync-setup-new');
  if (choicesEl) choicesEl.style.display = 'none';
  if (newEl) newEl.style.display = 'block';
  newEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:13px">Generating identity...</div>';

  try {
    await enableSync({ skipPush: false });

    // Wait for mnemonic to resolve
    let mnemonic = null;
    for (let i = 0; i < 30; i++) {
      if (!isSyncEnabled()) return; // cancelled during wait
      mnemonic = getMnemonic();
      if (mnemonic) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!mnemonic) {
      newEl.innerHTML = '<div style="color:var(--red);font-size:13px;padding:8px 0">Failed to generate mnemonic. Try again.</div>';
      return;
    }

    _mnemonicCache = mnemonic;
    newEl.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Your mnemonic</div>
        <div style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;user-select:all">${escapeHTML(mnemonic)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px">
        Write these 24 words down and store them offline. You will need them to sync another device. Anyone with this mnemonic can access your synced data.
      </div>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:12px;color:var(--text-primary);margin-bottom:14px">
        <input type="checkbox" id="sync-setup-ack" style="margin-top:2px" onchange="document.getElementById('sync-setup-done-btn').disabled=!this.checked">
        I have saved my mnemonic somewhere safe
      </label>
      <button id="sync-setup-done-btn" class="import-btn import-btn-primary" style="width:100%;padding:8px 16px;font-size:13px;opacity:0.45;cursor:not-allowed" disabled onclick="syncSetupDone()">Done</button>
    `;
    // Wire up disabled style toggle on checkbox
    const ack = document.getElementById('sync-setup-ack');
    const doneBtn = document.getElementById('sync-setup-done-btn');
    if (ack && doneBtn) {
      ack.onchange = () => {
        doneBtn.disabled = !ack.checked;
        doneBtn.style.opacity = ack.checked ? '1' : '0.45';
        doneBtn.style.cursor = ack.checked ? 'pointer' : 'not-allowed';
      };
    }
  } finally {
    _syncSetupInProgress = false;
  }
}

function syncSetupDone() {
  const overlay = document.getElementById('sync-setup-overlay');
  if (overlay) overlay.classList.remove('show');
  _releaseSyncToggle();
  const el = document.getElementById('sync-section');
  if (el) el.innerHTML = renderSyncSection();
  loadMnemonic();
  updateRelayStatus();
}

function syncSetupRestore() {
  document.getElementById('sync-setup-choices').style.display = 'none';
  document.getElementById('sync-setup-restore').style.display = 'block';
  const input = document.getElementById('sync-setup-restore-input');
  if (input) input.focus();
}

function syncSetupBack() {
  document.getElementById('sync-setup-choices').style.display = '';
  document.getElementById('sync-setup-restore').style.display = 'none';
  document.getElementById('sync-setup-new').style.display = 'none';
}

async function syncSetupDoRestore() {
  if (_syncSetupInProgress) return;
  const input = document.getElementById('sync-setup-restore-input');
  if (!input) return;
  const raw = (input.value || '').trim();
  if (!raw) {
    showNotification('Paste your 24-word seed into the textarea first', 'error');
    input.focus();
    return;
  }
  const mnemonic = raw;
  const words = mnemonic.split(/\s+/);
  if (words.length !== 24) {
    showNotification(`Seed must be exactly 24 words (got ${words.length})`, 'error');
    return;
  }

  _syncSetupInProgress = true;
  try {
    // Enable sync (generates throwaway identity) then immediately restore
    await enableSync({ skipPush: true });
    const result = await restoreFromMnemonic(mnemonic);
    if (!result) {
      // Restore failed — clean up the throwaway identity
      await disableSync();
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
      _releaseSyncToggle();
      return;
    }
    // restoreFromMnemonic triggers reload, so nothing else needed
  } finally {
    _syncSetupInProgress = false;
  }
}

async function updateRelayStatus() {
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  if (!dot || !text) return;
  const connected = await checkRelayConnection();
  dot.style.background = connected ? '#22c55e' : 'var(--red)';
  text.textContent = connected ? 'Connected to relay' : 'Relay unreachable';
  // Keep header indicator in sync
  if (window.updateSyncIndicator) window.updateSyncIndicator();
}

let _mnemonicRetries = 0;
let _mnemonicCache = null;
let _mnemonicRetryTimer = null;
const MNEMONIC_MASK = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022';

function loadMnemonic() {
  clearTimeout(_mnemonicRetryTimer);
  const el = document.getElementById('sync-mnemonic');
  if (!el || !isSyncEnabled()) { _mnemonicRetries = 0; return; }
  const mnemonic = getMnemonic();
  if (mnemonic) {
    _mnemonicCache = mnemonic;
    el.dataset.masked = 'true';
    el.textContent = MNEMONIC_MASK;
    el.style.userSelect = 'none';
    el.style.color = '';
    _mnemonicRetries = 0;
    return;
  }
  // Stop polling immediately if Evolu surfaced an actual init error —
  // no point waiting 30s for a promise that already rejected.
  const initErr = getMnemonicResolutionError();
  if (initErr) {
    el.textContent = `Sync init failed: ${initErr}`;
    el.style.color = '#fbbf24';
    _mnemonicRetries = 0;
    return;
  }
  if (_mnemonicRetries < 30) {
    _mnemonicRetries++;
    el.textContent = 'Resolving…';
    _mnemonicRetryTimer = setTimeout(loadMnemonic, 1000);
  } else {
    el.textContent = 'Could not resolve mnemonic — open the dev console and check for [sync] errors, or try a hard refresh';
    el.style.color = '#fbbf24';
    _mnemonicRetries = 0;
  }
}

function toggleMnemonicVisibility() {
  const el = document.getElementById('sync-mnemonic');
  const btn = document.getElementById('sync-mnemonic-toggle');
  if (!el || !btn || !_mnemonicCache) return;
  const masked = el.dataset.masked === 'true';
  if (masked) {
    el.textContent = _mnemonicCache;
    el.dataset.masked = 'false';
    el.style.userSelect = 'all';
    btn.textContent = 'Hide';
  } else {
    el.textContent = MNEMONIC_MASK;
    el.dataset.masked = 'true';
    el.style.userSelect = 'none';
    btn.textContent = 'Show';
  }
}

let _clipboardClearTimer = null;
function copyMnemonic() {
  if (!_mnemonicCache) return;
  navigator.clipboard.writeText(_mnemonicCache).then(() => {
    showNotification('Mnemonic copied — clipboard will clear in 60s', 'success');
    clearTimeout(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, 60000);
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

/**
 * Single-step restore modal — replaces the old two-button flow that confused
 * users into clicking the outer "Restore from mnemonic" button (which only
 * revealed a textarea) and waiting for something to happen. Now the modal
 * contains the seed input + a single Restore action button + Cancel, all
 * in one place. Same pattern as the sync setup wizard so users don't have
 * to learn two different shapes.
 */
function openRestoreMnemonicDialog() {
  let overlay = document.getElementById('sync-restore-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sync-restore-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-restore-title" style="max-width:480px">
    <h3 id="sync-restore-title" style="margin:0 0 6px;font-size:16px;color:var(--text-primary)">Restore from mnemonic</h3>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;line-height:1.5">Paste your 24-word seed from another device. This replaces your current sync identity — anything synced under the old identity will no longer reach this device.</p>
    <textarea id="sync-restore-dialog-input" autofocus aria-label="24-word mnemonic" style="font-size:12px;width:100%;height:90px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:10px 12px;font-family:var(--font-mono, monospace);box-sizing:border-box" placeholder="word word word word word word word word word word word word word word word word word word word word word word word word"></textarea>
    <div id="sync-restore-dialog-msg" style="font-size:11px;color:var(--text-muted);margin-top:6px;min-height:14px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="confirm-btn confirm-btn-cancel" onclick="closeRestoreMnemonicDialog()">Cancel</button>
      <button id="sync-restore-dialog-go" class="import-btn import-btn-primary" style="padding:8px 16px;font-size:13px" onclick="confirmRestoreMnemonic()">Restore &amp; reload</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  // Live word count + button enable so the user gets immediate feedback as
  // they paste — much friendlier than only finding out on submit.
  const input = document.getElementById('sync-restore-dialog-input');
  const msg = document.getElementById('sync-restore-dialog-msg');
  const btn = document.getElementById('sync-restore-dialog-go');
  if (input) {
    input.focus();
    const update = () => {
      const raw = (input.value || '').trim();
      if (!raw) {
        if (msg) { msg.textContent = ''; msg.style.color = 'var(--text-muted)'; }
        if (btn) btn.disabled = true;
        return;
      }
      const words = raw.split(/\s+/);
      if (words.length === 24) {
        if (msg) { msg.textContent = '✓ 24 words detected'; msg.style.color = 'var(--green, #22c55e)'; }
        if (btn) btn.disabled = false;
      } else {
        if (msg) { msg.textContent = `${words.length} word${words.length === 1 ? '' : 's'} so far — need exactly 24`; msg.style.color = '#fbbf24'; }
        if (btn) btn.disabled = true;
      }
    };
    input.addEventListener('input', update);
    update();
  }
  overlay.onclick = (e) => { if (e.target === overlay) closeRestoreMnemonicDialog(); };
}

function closeRestoreMnemonicDialog() {
  const overlay = document.getElementById('sync-restore-overlay');
  if (overlay) overlay.classList.remove('show');
}

async function confirmRestoreMnemonic() {
  const input = document.getElementById('sync-restore-dialog-input');
  const btn = document.getElementById('sync-restore-dialog-go');
  if (!input) return;
  const raw = (input.value || '').trim();
  const words = raw.split(/\s+/);
  if (words.length !== 24) {
    showNotification(`Seed must be exactly 24 words (got ${words.length})`, 'error');
    input.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Restoring…'; }
  // No second confirm dialog — the modal already explains what restore
  // does, and the action button is explicit ("Restore & reload"). Adding
  // a second confirm pile-up was the friction users complained about.
  const result = await restoreFromMnemonic(raw);
  if (!result) {
    if (btn) { btn.disabled = false; btn.textContent = 'Restore & reload'; }
    if (!isSyncEnabled()) showNotification('Sync not initialized — enable sync first, then restore', 'error');
  }
  // On success: restoreFromMnemonic triggers reload (Evolu auto-reloads),
  // so we don't need to close this modal — the page replaces itself.
}

function saveSyncRelay() {
  const input = document.getElementById('sync-relay-input');
  if (!input) return;
  const url = input.value.trim();
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    showNotification('Relay URL must start with wss:// or ws://', 'error');
    return;
  }
  setSyncRelay(url);
  showNotification('Relay saved — restart sync to apply', 'success');
  updateRelayStatus();
}

export function renderMessengerSection() {
  const enabled = isMessengerEnabled();
  const token = getMessengerToken();
  return `
    <div class="settings-action-row" style="margin-bottom:${enabled ? '16' : '8'}px">
      <div class="settings-copy">
        <div class="settings-copy-title">Agent Access</div>
        <div class="settings-copy-desc">Let AI agents query your labs and context via MCP, Hermes Agent, or OpenClaw</div>
      </div>
      <label class="chat-websearch-toggle-label" style="display:flex" aria-label="Toggle Agent Access">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleMessenger(this.checked)" style="display:none">
        <span class="chat-toggle-slider"></span>
      </label>
    </div>
    ${enabled && token ? `
      <div style="margin-bottom:16px">
        <div class="settings-token-head">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Read-only token</label>
          <div class="settings-token-actions">
            <button id="messenger-token-toggle" class="import-btn import-btn-secondary settings-mini-btn" onclick="toggleMessengerToken()" aria-label="Show token">Show</button>
            <button class="import-btn import-btn-secondary settings-mini-btn" onclick="copyMessengerToken()" aria-label="Copy token">Copy</button>
          </div>
        </div>
        <div id="messenger-token" class="settings-token-box" data-masked="true" aria-label="Agent Access token">${'\u2022'.repeat(64)}</div>
        <div class="settings-copy-desc" style="margin-top:6px">Use <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" style="color:var(--accent)">getbased-mcp</a> to connect <a href="https://github.com/hermes-agent/hermes-agent" target="_blank" rel="noopener" style="color:var(--accent)">Hermes Agent</a>, <a href="https://openclaw.ai" target="_blank" rel="noopener" style="color:var(--accent)">OpenClaw</a>, or any MCP-compatible agent. Paste this token into your agent's config.</div>
      </div>
      <button class="import-btn import-btn-secondary settings-full-btn" onclick="regenerateMessengerToken()">Regenerate token</button>
      <div class="settings-divider">
        <div class="settings-action-row">
          <div class="settings-copy">
            <div class="settings-copy-title">Push wearable daily series</div>
            <div class="settings-copy-desc">Adds a pivoted daily-values matrix (HRV, RHR, sleep…) so agents can spot trends. ~100 / 400 / 1200 extra tokens for 7 / 30 / 90 days respectively (real-measured at 13 metrics); cached cleanly so the marginal cost per turn is small. Off by default — pick 7 days for cheap follow-ups, 30 for monthly reasoning, 90 for season-spanning analysis.</div>
          </div>
          <select id="agent-wearable-series-select"
            onchange="window.setAgentWearableSeriesDays(this.value === 'off' ? 0 : Number(this.value)); window.pushContextToGateway && window.pushContextToGateway()"
            aria-label="Wearable series window pushed to agent"
            class="settings-select">
            <option value="off"${(window.getAgentWearableSeriesDays?.() || 0) === 0 ? ' selected' : ''}>Off</option>
            <option value="7"${window.getAgentWearableSeriesDays?.() === 7 ? ' selected' : ''}>7 days</option>
            <option value="30"${window.getAgentWearableSeriesDays?.() === 30 ? ' selected' : ''}>30 days</option>
            <option value="90"${window.getAgentWearableSeriesDays?.() === 90 ? ' selected' : ''}>90 days</option>
          </select>
        </div>
      </div>
    ` : `
      <div class="settings-copy-desc">
        Let AI agents query your labs — coding agents, messenger bots, or any <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" style="color:var(--accent)">MCP-compatible tool</a>. Only a read-only summary is shared — your data stays encrypted.
      </div>
    `}
  `;
}

let _messengerToggling = false;
function toggleMessenger(enabled) {
  if (_messengerToggling) return;
  _messengerToggling = true;
  try {
    if (enabled) {
      generateMessengerToken();
      pushContextToGateway();
      showNotification('Agent Access enabled', 'success');
    } else {
      revokeMessengerToken();
      showNotification('Agent Access disabled', 'success');
    }
    const el = document.getElementById('messenger-section');
    if (el) el.innerHTML = renderMessengerSection();
  } finally {
    _messengerToggling = false;
  }
}

function toggleMessengerToken() {
  const el = document.getElementById('messenger-token');
  const btn = document.getElementById('messenger-token-toggle');
  if (!el || !btn) return;
  const token = getMessengerToken();
  if (!token) return;
  const masked = el.dataset.masked === 'true';
  if (masked) {
    el.textContent = token;
    el.dataset.masked = 'false';
    el.style.userSelect = 'all';
    btn.textContent = 'Hide';
  } else {
    el.textContent = '\u2022'.repeat(64);
    el.dataset.masked = 'true';
    el.style.userSelect = 'none';
    btn.textContent = 'Show';
  }
}

function copyMessengerToken() {
  const token = getMessengerToken();
  if (!token) return;
  navigator.clipboard.writeText(token).then(() => {
    showNotification('Token copied — clipboard will clear in 60s', 'success');
    clearTimeout(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, 60000);
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

function regenerateMessengerToken() {
  generateMessengerToken();
  pushContextToGateway();
  showNotification('Token regenerated — update your bot config with the new token', 'success');
  const el = document.getElementById('messenger-section');
  if (el) el.innerHTML = renderMessengerSection();
}

export function hydrateSettingsSyncPanel() {
  if (!isSyncEnabled()) return;
  loadMnemonic();
  updateRelayStatus();
}

Object.assign(window, {
  toggleSync,
  toggleMnemonicVisibility,
  copyMnemonic,
  openRestoreMnemonicDialog,
  closeRestoreMnemonicDialog,
  confirmRestoreMnemonic,
  saveSyncRelay,
  closeSyncSetup,
  syncSetupNew,
  syncSetupRestore,
  syncSetupBack,
  syncSetupDoRestore,
  syncSetupDone,
  showSyncSetupModal,
  toggleMessenger,
  toggleMessengerToken,
  copyMessengerToken,
  regenerateMessengerToken,
});
