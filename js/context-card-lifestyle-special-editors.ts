import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// Light, goals, interpretive-lens, and diet-contaminant lifestyle editors.

import { state } from './state.js';
import { openLifestyleForm, saveLifestyleForm } from './context-lifestyle-form-view.js';
import {
  escapeHTML,
  showNotification,
} from './utils.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { scanDietForContaminants } from './food-contaminants.js';
import {
  getTextInput,
  getInputValue,
  lifestyleActionAttrs,
  isContextEditorStylesheetLoaded,
  runWithContextEditorStylesheet,
  renderContextEditorModal,
} from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalAndNavigateRuntime,
  updateLifestyleChatHeaderModelRuntime,
} from './context-card-lifestyle-runtime.js';

let recordContextChange: (field: string) => void = () => {};

export function configureLifestyleSpecialEditors({ recordChange }: LifestyleEditorDependencies = {}) {
  if (typeof recordChange === 'function') recordContextChange = recordChange;
}

function getActiveNavCategory() {
  const activeNav = (document.querySelector('.nav-item.active') as HTMLElement | null);
  return activeNav?.dataset.category || 'dashboard';
}

// ── Light & Circadian ──
export function openLightCircadianEditor() { return openLifestyleForm('lightCircadian'); }
export function saveLightCircadian() { return saveLifestyleForm('lightCircadian'); }
export function clearLightCircadian() { return saveLifestyleForm('lightCircadian', true); }

// ── Health Goals ──
export { openHealthGoalsEditor, renderHealthGoalsModal, addHealthGoal, deleteHealthGoal, closeHealthGoals, clearHealthGoals } from './context-health-goals-view.js';

// ── Interpretive Lens ──

export function openInterpretiveLensEditor(): void | Promise<unknown> {
  if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openInterpretiveLensEditor);
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  const current = state.importedData.interpretiveLens || '';
  renderContextEditorModal(modal, 'Interpretive Lens', 'List researchers, clinicians, or scientific paradigms whose frameworks you follow. The AI will consider their perspectives when interpreting your results.', `
    <textarea class="note-editor" id="interpretive-lens-textarea" placeholder="e.g. Longevity medicine, quantum biology, functional endocrinology framework...">${escapeHTML(current)}</textarea>
    <div class="ctx-editor-actions"><button class="import-btn import-btn-primary" ${lifestyleActionAttrs('save-interpretive-lens')}>Save</button><button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-modal')}>Cancel</button>${current ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${lifestyleActionAttrs('clear-interpretive-lens')}>Clear</button>` : ''}</div>`);
  modal.querySelector('.gb-modal-head')?.insertAdjacentHTML('afterbegin', `<button type="button" class="context-back-btn" ${lifestyleActionAttrs('back-to-context')} aria-label="Back to Context" title="Back to Context"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>`);
  openModalOverlay(overlay);
  setTimeout(() => getTextInput('interpretive-lens-textarea')?.focus(), 50);
}

export function saveInterpretiveLens() {
  const text = getInputValue('interpretive-lens-textarea').trim();
  state.importedData.interpretiveLens = text;
  updateLifestyleChatHeaderModelRuntime();
  recordContextChange('interpretiveLens');
  saveImportedData();
  closeLifestyleContextModalAndNavigateRuntime(getActiveNavCategory());
  showNotification(text ? 'Interpretive lens saved' : 'Interpretive lens cleared', 'success');
}

export function clearInterpretiveLens() {
  state.importedData.interpretiveLens = '';
  updateLifestyleChatHeaderModelRuntime();
  recordContextChange('interpretiveLens');
  saveImportedData();
  closeLifestyleContextModalAndNavigateRuntime(getActiveNavCategory());
  showNotification('Interpretive lens cleared', 'info');
}

// ── Diet contaminant detail modal ──

export function showDietContaminantsModal() {
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return;
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  let html = `<button class="modal-close" ${lifestyleActionAttrs('close-modal')}>&times;</button><h3>Food Contaminant Signals</h3><div class="modal-unit">Based on foods mentioned in your diet card, cross-referenced against public contaminant databases.</div>`;
  const sections = [
    ['pesticide', '🥬 Pesticide Residues', true],
    ['plastic', '🧴 Plastic Chemicals', true],
    ['clean', '✅ Low Contamination', false],
  ];
  for (const [type, title, warn] of sections) {
    const matches = warnings.filter(item => item.type === type);
    if (matches.length === 0) continue;
    html += `<div class="contaminant-section"><div class="contaminant-section-title">${title}</div>`;
    for (const item of matches) html += `<div class="contaminant-detail-item">${warn ? '⚠️ ' : ''}${escapeHTML(item.warning)} <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">${escapeHTML(item.source)}</a></div>`;
    html += '</div>';
  }
  html += `<div class="contaminant-actions"><button class="import-btn import-btn-primary" ${lifestyleActionAttrs('discuss-diet-contaminants')}>Discuss with AI</button><button class="import-btn import-btn-secondary" ${lifestyleActionAttrs('close-modal')}>Close</button></div><div class="contaminant-attribution">Sources: <a href="https://www.ewg.org/foodnews/" target="_blank" rel="noopener">EWG Shopper's Guide 2025</a> · <a href="https://www.plasticlist.org/report" target="_blank" rel="noopener">PlasticList</a></div>`;
  modal.className = 'modal';
  modal.setAttribute('aria-label', 'Food Contaminant Signals');
  modal.removeAttribute('aria-labelledby');
  modal.innerHTML = html;
  openModalOverlay(overlay);
}
