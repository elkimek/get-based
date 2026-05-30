// context-card-dashboard-ai.js - dashboard AI personalization and data protection CTAs

import { getFolderBackupState } from './backup.js';
import { getEncryptionEnabled } from './crypto.js';
import { getLensSummary } from './lens.js';
import { state } from './state.js';
import { isSyncEnabled } from './sync.js';
import { escapeHTML } from './utils.js';

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

  const lensRow = lens
    ? `<div class="lens-section" role="button" tabindex="0" aria-label="Edit Interpretive Lens" onclick="openInterpretiveLensEditor()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" title="Interpretive Lens - click to edit"><span class="lens-section-icon">&#129694;</span><span class="lens-section-body"><span class="lens-section-label">Interpretive Lens</span><span class="lens-section-text">${escapeHTML(lens)}</span></span><span class="lens-section-edit">&#9998;</span></div>`
    : '';
  const kbRow = kbConfigured ? renderKnowledgeBaseRow(summary) : '';
  const aiCta = renderPersonalizeAICta(!!lens, kbConfigured);
  const dataCta = renderDataProtectionCta();
  return lensRow + kbRow + aiCta + dataCta;
}

// Programmatic DNA file picker. Mirrors the chat onboarding hidden-file-input
// pattern so the same handleDNAFile parser runs.
export function triggerDNAFilePicker() {
  let input = document.getElementById('dna-dashboard-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'dna-dashboard-input';
    input.accept = '.txt,.csv';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (f && typeof window.handleDNAFile === 'function') {
        window.handleDNAFile(f);
      }
      input.value = '';
    });
    document.body.appendChild(input);
  }
  input.click();
}

// The full-width Knowledge Base status row. Only emitted when a library is
// configured. Shows library name, document count when cached, and
// query-rewriting status.
export function renderKnowledgeBaseSection() {
  let s; try { s = getLensSummary(); } catch { return ''; }
  if (!s || !s.configured) return '';
  return renderKnowledgeBaseRow(s);
}

function renderKnowledgeBaseRow(s) {
  const docFragment = (s.docCount != null && s.docCount > 0)
    ? ` &middot; ${s.docCount} document${s.docCount !== 1 ? 's' : ''}`
    : '';
  const rewriteFragment = s.aiAvailable
    ? ` &middot; query rewriting ${s.multiQueryOn ? 'on' : 'off'}`
    : '';
  const detail = `${escapeHTML(s.displayName)}${docFragment}${rewriteFragment}`;
  return `<div class="lens-section" role="button" tabindex="0" aria-label="Manage Knowledge Base" onclick="openKnowledgeBaseModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" title="Knowledge Base - click to manage"><span class="lens-section-icon">&#128218;</span><span class="lens-section-body"><span class="lens-section-label">Knowledge Base</span><span class="lens-section-text">${detail}</span></span><span class="lens-section-edit">&#9998;</span></div>`;
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
    action = 'openPersonalizeAIPicker()';
  } else if (!kbSet) {
    icon = '&#128218;';
    label = 'Connect a knowledge base';
    action = 'openKnowledgeBaseModal()';
  } else {
    icon = '&#129694;';
    label = 'Set an interpretive lens';
    action = 'openInterpretiveLensEditor()';
  }
  return `<button type="button" class="dashboard-cta" onclick="${action}" aria-label="${escapeHTML(label)}">
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
      return `<button type="button" class="dashboard-cta" onclick="showEnableEncryptionModal()" aria-label="Enable encryption">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128274;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Enable encryption</span>
      </button>`;
    }
    if (only === 'sync') {
      return `<button type="button" class="dashboard-cta" onclick="showSyncSetupModal()" aria-label="Set up cross-device sync">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128225;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Sync to other devices</span>
      </button>`;
    }
    return `<button type="button" class="dashboard-cta" onclick="pickFolderForBackup()" aria-label="Set up auto-backup">
      <span class="dashboard-cta-icon" aria-hidden="true">&#128190;</span>
      <span class="dashboard-cta-plus" aria-hidden="true">+</span>
      <span>Set up auto-backup</span>
    </button>`;
  }

  return `<button type="button" class="dashboard-cta" onclick="openDataProtectionPicker()" aria-label="Protect your data">
    <span class="dashboard-cta-icon" aria-hidden="true">&#128737;</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>Protect your data</span>
  </button>`;
}

export function openDataProtectionPicker() {
  let overlay = document.getElementById('data-protection-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'data-protection-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    overlay.classList.remove('show');
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
  overlay.classList.add('show');
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#data-protection-picker-cancel').onclick = close;
  setTimeout(() => overlay.querySelector('.dashboard-picker-card:not([data-configured="true"]),.dashboard-picker-card,#data-protection-picker-cancel')?.focus(), 50);
  overlay.querySelectorAll('.dashboard-picker-card').forEach(btn => {
    btn.onclick = () => {
      const pick = btn.getAttribute('data-pick');
      const isConfigured = btn.getAttribute('data-configured') === 'true';
      if (isConfigured) { close(); return; }
      close();
      if (pick === 'encryption' && typeof window.showEnableEncryptionModal === 'function') window.showEnableEncryptionModal();
      else if (pick === 'sync' && typeof window.showSyncSetupModal === 'function') window.showSyncSetupModal();
      else if (pick === 'backup' && typeof window.pickFolderForBackup === 'function') window.pickFolderForBackup();
    };
  });
}

export function openPersonalizeAIPicker() {
  let overlay = document.getElementById('ai-personalize-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-personalize-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Personalize how AI answers" style="max-width:520px">
    <p class="confirm-message" style="margin-bottom:14px">Personalize how AI answers</p>
    <div class="ai-picker-grid">
      <button type="button" class="ai-picker-card" data-pick="lens">
        <span class="ai-picker-icon" aria-hidden="true">&#129694;</span>
        <span class="ai-picker-title">Interpretive Lens</span>
        <span class="ai-picker-sub">Frame answers around researchers, paradigms, or schools of thought.</span>
      </button>
      <button type="button" class="ai-picker-card" data-pick="kb">
        <span class="ai-picker-icon" aria-hidden="true">&#128218;</span>
        <span class="ai-picker-title">Knowledge Base</span>
        <span class="ai-picker-sub">Ground answers in your own documents - research papers, notes, references.</span>
      </button>
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="ai-personalize-picker-cancel">Cancel</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#ai-personalize-picker-cancel').onclick = close;
  setTimeout(() => overlay.querySelector('.ai-picker-card,#ai-personalize-picker-cancel')?.focus(), 50);
  overlay.querySelectorAll('.ai-picker-card').forEach(btn => {
    btn.onclick = () => {
      const pick = btn.getAttribute('data-pick');
      close();
      if (pick === 'lens' && typeof window.openInterpretiveLensEditor === 'function') {
        window.openInterpretiveLensEditor();
      } else if (pick === 'kb' && typeof window.openKnowledgeBaseModal === 'function') {
        window.openKnowledgeBaseModal();
      }
    };
  });
}
