interface DnaActionHandlers {
  triggerDNAFilePicker(): unknown;
  openManualSnpModal(): unknown;
  saveManualSnpFromModal(): unknown;
  importSnpReport(): unknown;
  toggleGeneticsCollapse(): unknown;
  deleteMtDNAData(): unknown;
  toggleGeneticsExpand(element: HTMLElement): unknown;
  askAIAboutSnp(rsid: string): unknown;
  reimportDNA(): unknown;
  confirmDeleteDNA(): unknown;
  closeDNAImportPreview(): unknown;
  confirmDNAImport(): unknown;
  closeMtDNAPreview(): unknown;
  confirmMtDNAImport(): unknown;
}

// dna-actions.js - delegated actions for DNA and genetics UI

import { actionAttributes } from './action-attributes.js';

let dnaDelegatesInstalled = false;
let dnaActionHandlers: Partial<DnaActionHandlers> = {};

export function dnaActionAttrs(action: string, attrs: Record<string, unknown> = {}) {
  return actionAttributes("dna", action, attrs);
}

function isDnaActionScope(actionEl: HTMLElement) {
  return !!actionEl.closest('.genetics-empty-stub, .genetics-section, #dna-modal-overlay');
}

function handleDnaActionClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = (target.closest('[data-dna-action]') as HTMLElement | null);
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

function handleDnaActionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = (target.closest('[data-dna-action][role="button"]') as HTMLElement | null);
  if (!actionEl || !isDnaActionScope(actionEl)) return;
  event.preventDefault();
  actionEl.click();
}

export function initDnaActionDelegates(handlers: Partial<DnaActionHandlers> = {}) {
  dnaActionHandlers = { ...dnaActionHandlers, ...handlers };
  if (dnaDelegatesInstalled || typeof document === 'undefined') return;
  dnaDelegatesInstalled = true;
  document.addEventListener('click', handleDnaActionClick);
  document.addEventListener('keydown', handleDnaActionKeydown);
}
