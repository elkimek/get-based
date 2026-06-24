// @ts-check
// context-card-dashboard-ai.js - AI context and data protection CTAs

import { getFolderBackupState } from './backup.js';
import { getEncryptionEnabled } from './crypto.js';
import { getLensSummary } from './lens.js';
import { state } from './state.js';
import { isSyncEnabled } from './sync.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

const dashboardAIActionDelegateRoots = new WeakSet();
const DASHBOARD_AI_ACTION_ATTR = 'data-dashboard-ai-action';
const DASHBOARD_AI_ACTION_SELECTOR = `[${DASHBOARD_AI_ACTION_ATTR}]`;
const appWindow = /** @type {Window & typeof globalThis & {
  openInterpretiveLensEditor?: () => void,
  openKnowledgeBaseModal?: () => void,
  showEnableEncryptionModal?: () => void,
  showSyncSetupModal?: () => void,
  pickFolderForBackup?: () => void,
  handleDNAFile?: (file: File) => void,
}} */ (typeof window !== 'undefined' ? window : {});

function dashboardAIActionAttrs(action) {
  return `${DASHBOARD_AI_ACTION_ATTR}="${escapeAttr(action)}"`;
}

function closestDashboardAIAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(DASHBOARD_AI_ACTION_SELECTOR)
      : null
  );
}

function runDashboardAIAction(action) {
  if (action === 'open-interpretive-lens') appWindow.openInterpretiveLensEditor?.();
  else if (action === 'open-knowledge-base') appWindow.openKnowledgeBaseModal?.();
  else if (action === 'open-personalize-ai-picker') openContextModal();
  else if (action === 'enable-encryption') appWindow.showEnableEncryptionModal?.();
  else if (action === 'setup-sync') appWindow.showSyncSetupModal?.();
  else if (action === 'setup-backup') appWindow.pickFolderForBackup?.();
  else if (action === 'open-data-protection-picker') openDataProtectionPicker();
  else return false;
  return true;
}

function handleDashboardAIActionClick(event) {
  const actionEl = closestDashboardAIAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(DASHBOARD_AI_ACTION_ATTR);
  if (!runDashboardAIAction(action)) return;
  event.preventDefault();
  event.stopPropagation();
}

function handleDashboardAIActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestDashboardAIAction(event.target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  handleDashboardAIActionClick(event);
}

export function installDashboardAIActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || dashboardAIActionDelegateRoots.has(root)) return;
  dashboardAIActionDelegateRoots.add(root);
  root.addEventListener('click', handleDashboardAIActionClick);
  root.addEventListener('keydown', handleDashboardAIActionKeydown);
}

if (typeof document !== 'undefined') installDashboardAIActionDelegates();

// Dashboard "AI personalization" zone:
//   - Full-width row for the Interpretive Lens, only if it is set.
//   - Full-width row for the Knowledge Base, only if a library is set.
//   - Inline pill CTA when Lens or KB is unset.
//
// DNA was briefly bundled here because all three influence AI
// interpretations, but that is a secondary effect. DNA is biological data
// about the user, not a personalization preference. Empty-state DNA discovery
// is handled by renderGeneticsSection().
export function renderInterpretiveLensSection() {
  const lens = (state.importedData.interpretiveLens || '').trim();
  let summary; try { summary = getLensSummary(); } catch { summary = null; }
  const kbConfigured = !!(summary && summary.configured);
  const kbEnabled = !!(summary && summary.enabled);

  const lensRow = lens
    ? `<div class="lens-section" role="button" tabindex="0" aria-label="Edit Interpretive Lens" ${dashboardAIActionAttrs('open-interpretive-lens')} title="Interpretive Lens - click to edit"><span class="lens-section-icon">&#129694;</span><span class="lens-section-body"><span class="lens-section-label">Interpretive Lens</span><span class="lens-section-text">${escapeHTML(lens)}</span></span><span class="lens-section-edit">&#9998;</span></div>`
    : '';
  const kbRow = (kbConfigured || kbEnabled) ? renderKnowledgeBaseRow(summary) : '';
  const aiCta = renderPersonalizeAICta(!!lens, kbConfigured);
  return lensRow + kbRow + aiCta + renderDataProtectionCta();
}

// Programmatic DNA file picker. Mirrors the chat onboarding hidden-file-input
// pattern so the same handleDNAFile parser runs.
export function triggerDNAFilePicker() {
  let input = /** @type {HTMLInputElement | null} */ (document.getElementById('dna-dashboard-input'));
  if (!input) {
    const newInput = document.createElement('input');
    newInput.type = 'file';
    newInput.id = 'dna-dashboard-input';
    newInput.accept = '.txt,.csv';
    newInput.style.display = 'none';
    newInput.addEventListener('change', () => {
      const f = newInput.files && newInput.files[0];
      if (f && typeof appWindow.handleDNAFile === 'function') {
        appWindow.handleDNAFile(f);
      }
      newInput.value = '';
    });
    document.body.appendChild(newInput);
    input = newInput;
  }
  input.click();
}

// The full-width Knowledge Base status row. Only emitted when a library is
// configured. Shows library name, document count when cached, and
// query-rewriting status.
export function renderKnowledgeBaseSection() {
  let s; try { s = getLensSummary(); } catch { return ''; }
  if (!s || (!s.configured && !s.enabled)) return '';
  return renderKnowledgeBaseRow(s);
}

function renderKnowledgeBaseRow(s) {
  const docFragment = (s.docCount != null && s.docCount > 0)
    ? ` &middot; ${s.docCount} document${s.docCount !== 1 ? 's' : ''}`
    : '';
  const rewriteFragment = s.aiAvailable
    ? ` &middot; query rewriting ${s.multiQueryOn ? 'on' : 'off'}`
    : '';
  const emptyEnabledFragment = (!s.configured && s.enabled) ? ' &middot; enabled, no documents indexed yet' : '';
  const detail = `${escapeHTML(s.displayName)}${emptyEnabledFragment}${docFragment}${rewriteFragment}`;
  return `<div class="lens-section" role="button" tabindex="0" aria-label="Manage Knowledge Base" ${dashboardAIActionAttrs('open-knowledge-base')} title="Knowledge Base - click to manage"><span class="lens-section-icon">&#128218;</span><span class="lens-section-body"><span class="lens-section-label">Knowledge Base</span><span class="lens-section-text">${detail}</span></span><span class="lens-section-edit">&#9998;</span></div>`;
}

// Inline CTA pill that adapts to which feature is missing. Both missing opens
// the picker; exactly one missing opens that feature directly. Hidden once both
// are configured.
function renderPersonalizeAICta(lensSet, kbSet) {
  if (lensSet && kbSet) return '';
  let icon, label, action;
  if (!lensSet && !kbSet) {
    icon = '&#10024;';
    label = 'Personalize how AI answers';
    action = 'open-personalize-ai-picker';
  } else if (!kbSet) {
    icon = '&#128218;';
    label = 'Connect a knowledge base';
    action = 'open-knowledge-base';
  } else {
    icon = '&#129694;';
    label = 'Set an interpretive lens';
    action = 'open-interpretive-lens';
  }
  return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs(action)} aria-label="${escapeHTML(label)}">
    <span class="dashboard-cta-icon" aria-hidden="true">${icon}</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>${escapeHTML(label)}</span>
  </button>`;
}

function getDataProtectionStatus() {
  let backupConfigured = false;
  let backupSupported = true;
  try {
    const s = getFolderBackupState();
    backupSupported = !!s?.supported;
    backupConfigured = !!s?.folderName;
  } catch { /* backup not initialised yet */ }
  return {
    encryption: !!getEncryptionEnabled(),
    sync: !!isSyncEnabled(),
    backup: backupConfigured,
    backupSupported,
  };
}

// Pure render: tests pass explicit state to avoid monkey-patching module-level
// imports, while production reads the current feature status.
export function renderDataProtectionCta(stateOverride) {
  const s = stateOverride || getDataProtectionStatus();
  const backupOk = s.backup || !s.backupSupported;
  const missing = [
    !s.encryption ? 'encryption' : null,
    !s.sync ? 'sync' : null,
    !backupOk ? 'backup' : null,
  ].filter(Boolean);
  if (missing.length === 0) return '';

  if (missing.length === 1) {
    const only = missing[0];
    if (only === 'encryption') {
      return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('enable-encryption')} aria-label="Enable encryption">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128274;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Enable encryption</span>
      </button>`;
    }
    if (only === 'sync') {
      return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('setup-sync')} aria-label="Set up cross-device sync">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128225;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Sync to other devices</span>
      </button>`;
    }
    return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('setup-backup')} aria-label="Set up auto-backup">
      <span class="dashboard-cta-icon" aria-hidden="true">&#128190;</span>
      <span class="dashboard-cta-plus" aria-hidden="true">+</span>
      <span>Set up auto-backup</span>
    </button>`;
  }

  return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('open-data-protection-picker')} aria-label="Protect your data">
    <span class="dashboard-cta-icon" aria-hidden="true">&#128737;</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>Protect your data</span>
  </button>`;
}

export function openDataProtectionPicker() {
  const appWindow = /** @type {any} */ (window);
  let overlay = document.getElementById('data-protection-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'data-protection-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    closeModalOverlay(overlay);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const s = getDataProtectionStatus();
  const card = (key, icon, title, sub, configured) => `
    <button type="button" class="dashboard-picker-card" data-pick="${key}" ${configured ? 'data-configured="true"' : ''}>
      <span class="dashboard-picker-icon" aria-hidden="true">${icon}</span>
      <span class="dashboard-picker-title">${title} ${configured ? '<span class="dashboard-picker-check" aria-hidden="true">&#10003;</span>' : ''}</span>
      <span class="dashboard-picker-sub">${sub}</span>
      <span class="dashboard-picker-action">${configured ? 'Configured' : 'Set up &rarr;'}</span>
    </button>`;
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Protect your data" style="max-width:560px">
    <p class="confirm-message" style="margin-bottom:14px">Protect your data</p>
    <div class="dashboard-picker-grid">
      ${card('encryption', '&#128274;', 'Encryption', 'Encrypt your data at rest with a passphrase. Browser extensions and anyone with disk access cannot read it without the passphrase.', s.encryption)}
      ${card('sync', '&#128225;', 'Cross-device Sync', 'End-to-end encrypted sync to your other devices. A 24-word mnemonic is your only key; the relay sees ciphertext.', s.sync)}
      ${s.backupSupported
        ? card('backup', '&#128190;', 'Auto-backup', 'Save daily snapshots to a local folder (Proton Drive, Dropbox, NAS, USB drive). Survives browser crashes and reinstalls.', s.backup)
        : ''}
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="data-protection-picker-cancel">Close</button>
    </div>
  </div>`;
  openModalOverlay(overlay, {
    initialFocus: '.dashboard-picker-card:not([data-configured="true"]),.dashboard-picker-card,#data-protection-picker-cancel',
    focusDelay: 50,
  });
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const cancelButton = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#data-protection-picker-cancel'));
  if (cancelButton) cancelButton.onclick = close;
  overlay.querySelectorAll('.dashboard-picker-card').forEach(btn => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.onclick = () => {
      const pick = button.getAttribute('data-pick');
      const isConfigured = button.getAttribute('data-configured') === 'true';
      if (isConfigured) { close(); return; }
      close();
      if (pick === 'encryption' && typeof appWindow.showEnableEncryptionModal === 'function') appWindow.showEnableEncryptionModal();
      else if (pick === 'sync' && typeof appWindow.showSyncSetupModal === 'function') appWindow.showSyncSetupModal();
      else if (pick === 'backup' && typeof appWindow.pickFolderForBackup === 'function') appWindow.pickFolderForBackup();
    };
  });
}

export function openContextModal() {
  const appWindow = /** @type {any} */ (window);
  let overlay = document.getElementById('context-hub-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'context-hub-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    closeModalOverlay(overlay);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const lensSet = !!(state.importedData.interpretiveLens || '').trim();
  let kbSummary; try { kbSummary = getLensSummary(); } catch { kbSummary = null; }
  const kbSet = !!kbSummary?.configured;
  const kbEnabled = !!kbSummary?.enabled;
  const check = '<span class="dashboard-picker-check" aria-hidden="true">&#10003;</span>';
  const kbStatus = kbSet
    ? `${escapeHTML(kbSummary.displayName || 'Knowledge Base')} is enabled. Click to manage documents and retrieval.`
    : (kbEnabled
      ? 'Knowledge Base is enabled, but no documents are indexed yet. Add a library before it can ground answers.'
      : 'Ground answers in your own documents, research papers, notes, and references.');
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Context" style="max-width:520px">
    <p class="confirm-message" style="margin-bottom:6px">Context</p>
    <p class="confirm-subtext" style="margin:0 0 14px;color:var(--muted);font-size:0.92rem">Control how AI interprets and grounds answers. Profile facts stay in Profile Context.</p>
    <div class="ai-picker-grid">
      <button type="button" class="ai-picker-card" data-pick="lens">
        <span class="ai-picker-kicker">Interpretive Lens</span>
        <span class="ai-picker-title">Personalize how AI answers ${lensSet ? check : ''}</span>
        <span class="ai-picker-sub">${lensSet ? 'Interpretive Lens is enabled. Click to review or edit it.' : 'Set the interpretive lens: researchers, paradigms, or schools of thought.'}</span>
        <span class="ai-picker-action">${lensSet ? 'Review lens' : 'Set lens'} &rarr;</span>
      </button>
      <button type="button" class="ai-picker-card" data-pick="kb">
        <span class="ai-picker-kicker">Retrieval</span>
        <span class="ai-picker-title">Knowledge Base ${kbSet ? check : ''}</span>
        <span class="ai-picker-sub">${kbStatus}</span>
        <span class="ai-picker-action">${kbSet ? 'Manage source' : (kbEnabled ? 'Add documents' : 'Connect source')} &rarr;</span>
      </button>
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="context-hub-cancel">Close</button>
    </div>
  </div>`;
  openModalOverlay(overlay, {
    initialFocus: '.ai-picker-card,#context-hub-cancel',
    focusDelay: 50,
  });
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const cancelButton = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#context-hub-cancel'));
  if (cancelButton) cancelButton.onclick = close;
  overlay.querySelectorAll('.ai-picker-card').forEach(btn => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.onclick = () => {
      const pick = button.getAttribute('data-pick');
      close();
      if (pick === 'lens' && typeof appWindow.openInterpretiveLensEditor === 'function') {
        appWindow.openInterpretiveLensEditor();
      } else if (pick === 'kb' && typeof appWindow.openKnowledgeBaseModal === 'function') {
        appWindow.openKnowledgeBaseModal();
      }
    };
  });
}

export function openPersonalizeAIPicker() {
  openContextModal();
}
