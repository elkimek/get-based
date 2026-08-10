// @ts-check
// dna-actions.js - delegated actions for DNA and genetics UI

import { escapeAttr } from './utils.js';

let dnaDelegatesInstalled = false;
let dnaActionHandlers = {};

export function dnaActionAttrs(action, attrs = {}) {
  return [
    `data-dna-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-dna-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function isDnaActionScope(actionEl) {
  return !!actionEl.closest('.genetics-empty-stub, .genetics-section, #dna-modal-overlay');
}

function handleDnaActionClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-dna-action]'));
  if (!actionEl || !isDnaActionScope(actionEl)) return;

  const action = actionEl.dataset.dnaAction || '';
  if (action === 'import-file') {
    event.preventDefault();
    dnaActionHandlers.triggerDNAFilePicker?.();
  } else if (action === 'add-manual-snp') {
    event.preventDefault();
    dnaActionHandlers.openManualSnpModal?.();
  } else if (action === 'save-manual-snp') {
    event.preventDefault();
    dnaActionHandlers.saveManualSnpFromModal?.();
  } else if (action === 'import-snp-report') {
    event.preventDefault();
    dnaActionHandlers.importSnpReport?.();
  } else if (action === 'toggle-genetics-collapse') {
    event.preventDefault();
    dnaActionHandlers.toggleGeneticsCollapse?.();
  } else if (action === 'delete-mtdna') {
    event.preventDefault();
    dnaActionHandlers.deleteMtDNAData?.();
  } else if (action === 'toggle-genetics-expand') {
    event.preventDefault();
    dnaActionHandlers.toggleGeneticsExpand?.(actionEl);
  } else if (action === 'ask-ai-snp') {
    event.preventDefault();
    dnaActionHandlers.askAIAboutSnp?.(actionEl.dataset.dnaRsid || '');
  } else if (action === 'reimport-dna') {
    event.preventDefault();
    dnaActionHandlers.reimportDNA?.();
  } else if (action === 'delete-dna') {
    event.preventDefault();
    dnaActionHandlers.confirmDeleteDNA?.();
  } else if (action === 'toggle-preview-group') {
    event.preventDefault();
    actionEl.parentElement?.classList.toggle('expanded');
  } else if (action === 'close-preview') {
    event.preventDefault();
    dnaActionHandlers.closeDNAImportPreview?.();
  } else if (action === 'confirm-import') {
    event.preventDefault();
    dnaActionHandlers.confirmDNAImport?.();
  } else if (action === 'close-mtdna-preview') {
    event.preventDefault();
    dnaActionHandlers.closeMtDNAPreview?.();
  } else if (action === 'confirm-mtdna-import') {
    event.preventDefault();
    dnaActionHandlers.confirmMtDNAImport?.();
  }
}

function handleDnaActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-dna-action][role="button"]'));
  if (!actionEl || !isDnaActionScope(actionEl)) return;
  event.preventDefault();
  actionEl.click();
}

export function initDnaActionDelegates(handlers = {}) {
  dnaActionHandlers = { ...dnaActionHandlers, ...handlers };
  if (dnaDelegatesInstalled || typeof document === 'undefined') return;
  dnaDelegatesInstalled = true;
  document.addEventListener('click', handleDnaActionClick);
  document.addEventListener('keydown', handleDnaActionKeydown);
}
