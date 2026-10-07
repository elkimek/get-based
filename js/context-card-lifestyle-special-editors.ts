// Light, goals, interpretive-lens, and diet-contaminant lifestyle editors.

import { state } from './state.js';
import { openLifestyleForm, saveLifestyleForm } from './context-lifestyle-form-view.js';
import {
  escapeHTML,
} from './utils.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { lifestyleActionAttrs } from './context-card-editor-ui.js';

// ── Light & Circadian ──
export function openLightCircadianEditor() { return openLifestyleForm('lightCircadian'); }
export function saveLightCircadian() { return saveLifestyleForm('lightCircadian'); }
export function clearLightCircadian() { return saveLifestyleForm('lightCircadian', true); }

// ── Health Goals ──
export { openHealthGoalsEditor, renderHealthGoalsModal, addHealthGoal, deleteHealthGoal, closeHealthGoals, clearHealthGoals } from './context-health-goals-view.js';

// ── Interpretive Lens ──

export function openInterpretiveLensEditor() { return openLifestyleForm('interpretiveLens'); }
export function saveInterpretiveLens() { return saveLifestyleForm('interpretiveLens'); }
export function clearInterpretiveLens() { return saveLifestyleForm('interpretiveLens', true); }

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
