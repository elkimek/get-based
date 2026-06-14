#!/usr/bin/env node
// Static source guards for modules migrated to shared modal overlay helpers.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const appEventsSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const chatSummariesSrc = fs.readFileSync(path.join(root, 'js/chat-summaries.js'), 'utf8');
const contextCardsSrc = fs.readFileSync(path.join(root, 'js/context-cards.js'), 'utf8');
const contextLifestyleSrc = fs.readFileSync(path.join(root, 'js/context-card-lifestyle-editors.js'), 'utf8');
const contextMedicalSrc = fs.readFileSync(path.join(root, 'js/context-card-medical-history-editor.js'), 'utf8');
const dashboardAiSrc = fs.readFileSync(path.join(root, 'js/context-card-dashboard-ai.js'), 'utf8');
const cycleSrc = fs.readFileSync(path.join(root, 'js/cycle.js'), 'utf8');
const lensSrc = fs.readFileSync(path.join(root, 'js/lens.js'), 'utf8');
const lightEnvSrc = fs.readFileSync(path.join(root, 'js/light-env.js'), 'utf8');
const lightToolCameraModalsSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera-modals.js'), 'utf8');
const lightToolsSrc = fs.readFileSync(path.join(root, 'js/light-tools.js'), 'utf8');
const markerDetailSrc = fs.readFileSync(path.join(root, 'js/marker-detail-modal.js'), 'utf8');
const pdfImportPreflightSrc = fs.readFileSync(path.join(root, 'js/pdf-import-preflight.js'), 'utf8');
const providerPanelsSrc = fs.readFileSync(path.join(root, 'js/provider-panels.js'), 'utf8');
const recommendationActionsSrc = fs.readFileSync(path.join(root, 'js/recommendation-actions.js'), 'utf8');
const recommendationsSrc = fs.readFileSync(path.join(root, 'js/recommendations.js'), 'utf8');
const settingsSrc = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
const settingsSyncPanelSrc = fs.readFileSync(path.join(root, 'js/settings-sync-panel.js'), 'utf8');
const supplementsSrc = fs.readFileSync(path.join(root, 'js/supplements.js'), 'utf8');
const syncDiagnoseIdentitySrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-identity-actions.js'), 'utf8');
const syncDiagnoseRenderSrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-render.js'), 'utf8');
const syncDiagnoseUiSrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-ui.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
const knowledgeBaseModalSrc = lensSrc.slice(
  lensSrc.indexOf('export function openKnowledgeBaseModal'),
  lensSrc.indexOf('function _kbModalKeydown')
);

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Modal Lifecycle Integrations ===');

assert('cycle editor opens through shared overlay lifecycle helper',
  cycleSrc.includes("from './modal-lifecycle.js'") &&
    cycleSrc.includes('openModalOverlay(overlay)') &&
    !cycleSrc.includes('overlay.classList.add("show")'));

assert('supplements editor opens through shared overlay lifecycle helper',
  supplementsSrc.includes("from './modal-lifecycle.js'") &&
    supplementsSrc.includes('openModalOverlay(overlay)') &&
    !supplementsSrc.includes('overlay.classList.add("show")'));

assert('dashboard AI pickers use shared overlay lifecycle helpers',
  dashboardAiSrc.includes("from './modal-lifecycle.js'") &&
    dashboardAiSrc.includes('openModalOverlay(overlay, {') &&
    dashboardAiSrc.includes('closeModalOverlay(overlay)') &&
    !dashboardAiSrc.includes("overlay.classList.add('show')") &&
    !dashboardAiSrc.includes("overlay.classList.remove('show')"));

assert('context medical history and card tips open through shared overlay lifecycle helper',
  contextMedicalSrc.includes("from './modal-lifecycle.js'") &&
    contextCardsSrc.includes("from './modal-lifecycle.js'") &&
    contextMedicalSrc.includes('openModalOverlay(overlay)') &&
    contextCardsSrc.includes('openModalOverlay(overlay)') &&
    !contextMedicalSrc.includes('overlay.classList.add("show")') &&
    !contextCardsSrc.includes("overlay.classList.add('show')"));

assert('lifestyle context editors open through shared overlay lifecycle helper',
  contextLifestyleSrc.includes("from './modal-lifecycle.js'") &&
    (contextLifestyleSrc.match(/openModalOverlay\(overlay\)/g) || []).length >= 10 &&
    !contextLifestyleSrc.includes('overlay.classList.add("show")') &&
    !contextLifestyleSrc.includes("overlay.classList.add('show')"));

assert('chat summary modal uses shared overlay lifecycle helpers',
  chatSummariesSrc.includes("from './modal-lifecycle.js'") &&
    chatSummariesSrc.includes("overlay.className = 'modal-overlay'") &&
    chatSummariesSrc.includes('openModalOverlay(overlay)') &&
    chatSummariesSrc.includes('closeModalOverlay(overlay)') &&
    !chatSummariesSrc.includes("overlay.className = 'modal-overlay show'") &&
    !chatSummariesSrc.includes("overlay.classList.remove('show')"));

assert('chat summary modal participates in global keyboard modal handling',
  appEventsSrc.includes('"summary-modal-overlay"') &&
    appEventsSrc.includes('window.closeSummaryModal?.()'));

assert('card tips modal closes through shared detail modal close path',
  recommendationsSrc.includes('onclick="window.closeModal()"') &&
    recommendationsSrc.includes('event.preventDefault();window.closeModal();setTimeout(()=>window.openEMFAssessmentEditor(),100);') &&
    !recommendationsSrc.includes("document.getElementById('modal-overlay').classList.remove('show')"));

assert('recommendation detail modal opens through shared overlay lifecycle helper',
  recommendationActionsSrc.includes("from './modal-lifecycle.js'") &&
    recommendationActionsSrc.includes('openModalOverlay(overlay)') &&
    !recommendationActionsSrc.includes('overlay.classList.add("show")'));

assert('OpenRouter balance dialog uses shared overlay lifecycle helpers',
  providerPanelsSrc.includes("from './modal-lifecycle.js'") &&
    providerPanelsSrc.includes("openModalOverlay(overlay, { initialFocus: '#or-add-credits', focusDelay: 50 })") &&
    providerPanelsSrc.includes('closeModalOverlay(overlay)') &&
    !providerPanelsSrc.includes("overlay.classList.add('show')") &&
    !providerPanelsSrc.includes("overlay.classList.remove('show')"));

assert('settings modal opens and closes through shared overlay lifecycle helpers',
  settingsSrc.includes("from './modal-lifecycle.js'") &&
    settingsSrc.includes('openModalOverlay(overlay)') &&
    settingsSrc.includes("closeModalOverlay('settings-modal-overlay')") &&
    !settingsSrc.includes("overlay.classList.add('show')") &&
    !settingsSrc.includes("document.getElementById('settings-modal-overlay').classList.remove('show')"));

assert('sync setup and restore dialogs use shared lifecycle helpers',
  settingsSyncPanelSrc.includes("from './modal-lifecycle.js'") &&
    settingsSyncPanelSrc.includes("openModalOverlay(overlay, { initialFocus: '[data-sync-setup-action=\"setup-new\"]', focusDelay: 50 })") &&
    settingsSyncPanelSrc.includes("openModalOverlay(overlay, { initialFocus: '#sync-restore-dialog-input', focusDelay: 50 })") &&
    (settingsSyncPanelSrc.match(/closeModalOverlay\('sync-setup-overlay'\)/g) || []).length >= 2 &&
    settingsSyncPanelSrc.includes("closeModalOverlay('sync-restore-overlay')") &&
    !settingsSyncPanelSrc.includes("overlay.classList.add('show')") &&
    !settingsSyncPanelSrc.includes("overlay.classList.remove('show')"));

assert('global focus trap top-overlay check includes confirm overlays',
  appEventsSrc.includes("'.modal-overlay.show, .confirm-overlay.show'"));

assert('knowledge base modal uses shared lifecycle helpers',
  lensSrc.includes("from './modal-lifecycle.js'") &&
    knowledgeBaseModalSrc.includes('wireBackdropClose(overlay, closeKnowledgeBaseModal)') &&
    knowledgeBaseModalSrc.includes('openModalOverlay(overlay, {') &&
    knowledgeBaseModalSrc.includes("closeModalOverlay('kb-modal-overlay')") &&
    !knowledgeBaseModalSrc.includes("overlay.classList.add('show')") &&
    !knowledgeBaseModalSrc.includes("overlay.classList.remove('show')"));

assert('lens library create dialog uses shared lifecycle helpers',
  lensSrc.includes("from './modal-lifecycle.js'") &&
    lensSrc.includes("openModalOverlay(overlay, { initialFocus: '#lens-create-name', focusDelay: 0 })") &&
    lensSrc.includes('closeModalOverlay(overlay)') &&
    !lensSrc.includes("overlay.classList.add('show')") &&
    !lensSrc.includes("overlay.classList.remove('show')"));

assert('PDF import preflight dialogs use shared lifecycle helpers',
  pdfImportPreflightSrc.includes("from './modal-lifecycle.js'") &&
    pdfImportPreflightSrc.includes("openModalOverlay(overlay, { initialFocus: '#confirm-cancel', focusDelay: 30 })") &&
    (pdfImportPreflightSrc.match(/closeModalOverlay\(overlay\)/g) || []).length >= 3 &&
    pdfImportPreflightSrc.includes("overlay.dataset.escapeOwner = 'preflight'") &&
    pdfImportPreflightSrc.includes('overlay.onclick = previousOnclick') &&
    pdfImportPreflightSrc.includes('delete overlay.dataset.escapeOwner') &&
    appEventsSrc.includes('confirmOverlay.dataset.escapeOwner') &&
    pdfImportPreflightSrc.includes('document.addEventListener(\'keydown\', onKey)') &&
    pdfImportPreflightSrc.includes("cleanup = openPreflightOverlay(overlay, () => close('cancel'))") &&
    !pdfImportPreflightSrc.includes("overlay.classList.add('show')") &&
    !pdfImportPreflightSrc.includes("overlay.classList.remove('show')"));

assert('utility confirm and prompt dialogs use shared lifecycle helpers',
  utilsSrc.includes("from './modal-lifecycle.js'") &&
    utilsSrc.includes("overlay.dataset.escapeOwner = 'utils-confirm'") &&
    (utilsSrc.match(/openModalOverlay\(overlay/g) || []).length >= 2 &&
    (utilsSrc.match(/closeModalOverlay\(overlay\)/g) || []).length >= 2 &&
    utilsSrc.includes('overlay.onclick = previousOnclick') &&
    utilsSrc.includes('delete overlay.dataset.escapeOwner') &&
    !utilsSrc.includes('overlay.classList.add("show")') &&
    !utilsSrc.includes("overlay.classList.add('show')") &&
    !utilsSrc.includes('overlay.classList.remove("show")') &&
    !utilsSrc.includes("overlay.classList.remove('show')"));

assert('marker detail modals open and close through shared lifecycle helpers',
  markerDetailSrc.includes("from './modal-lifecycle.js'") &&
    (markerDetailSrc.match(/openModalOverlay\(overlay/g) || []).length >= 3 &&
    markerDetailSrc.includes("openModalOverlay(overlay, { initialFocus: '#me-value', focusDelay: 50 })") &&
    markerDetailSrc.includes("openModalOverlay(overlay, { initialFocus: '#cm-name', focusDelay: 50 })") &&
    markerDetailSrc.includes("closeModalOverlay('modal-overlay')") &&
    !markerDetailSrc.includes('overlay.classList.add("show")') &&
    !markerDetailSrc.includes("overlay.classList.add('show')"));

assert('sync diagnose overlays use shared lifecycle helpers',
  syncDiagnoseUiSrc.includes("from './modal-lifecycle.js'") &&
    syncDiagnoseUiSrc.includes("overlay.className = 'modal-overlay'") &&
    syncDiagnoseUiSrc.includes('openModalOverlay(overlay)') &&
    syncDiagnoseUiSrc.includes('closeModalOverlay(overlay)') &&
    syncDiagnoseIdentitySrc.includes("from './modal-lifecycle.js'") &&
    syncDiagnoseIdentitySrc.includes("overlay.className = 'modal-overlay'") &&
    syncDiagnoseIdentitySrc.includes('openModalOverlay(overlay)') &&
    (syncDiagnoseIdentitySrc.match(/closeModalOverlay\(/g) || []).length >= 2 &&
    (syncDiagnoseRenderSrc.match(/data-sync-diagnose-close/g) || []).length >= 2 &&
    !syncDiagnoseRenderSrc.includes("this.closest('.modal-overlay').remove()") &&
    !syncDiagnoseUiSrc.includes("overlay.className = 'modal-overlay show'") &&
    !syncDiagnoseIdentitySrc.includes("overlay.className = 'modal-overlay show'"));

assert('light environment assessment uses shared overlay lifecycle before removal',
  lightEnvSrc.includes("from './modal-lifecycle.js'") &&
    lightEnvSrc.includes("const wasOpen = overlay?.classList?.contains('show') === true;") &&
    lightEnvSrc.includes("overlay.className = 'modal-overlay light-env-assessment-overlay'") &&
    lightEnvSrc.includes("openModalOverlay(overlay, wasOpen ? {} : { initialFocus: '.modal-close', focusDelay: 50 })") &&
    lightEnvSrc.includes('closeModalOverlay(overlay)') &&
    lightEnvSrc.includes('overlay.remove()') &&
    !lightEnvSrc.includes("overlay.className = 'modal-overlay show light-env-assessment-overlay'") &&
    !lightEnvSrc.includes("overlay.classList.add('show')"));

assert('light tool modals use shared overlay lifecycle helpers',
  lightToolCameraModalsSrc.includes("from './modal-lifecycle.js'") &&
    lightToolCameraModalsSrc.includes('openModalOverlay(overlay)') &&
    lightToolCameraModalsSrc.includes('closeModalOverlay(overlay)') &&
    (lightToolCameraModalsSrc.match(/openLightToolOverlay\(overlay/g) || []).length >= 6 &&
    (lightToolCameraModalsSrc.match(/removeLightToolOverlay\(overlay\)/g) || []).length >= 6 &&
    lightToolsSrc.includes("from './modal-lifecycle.js'") &&
    lightToolsSrc.includes('openModalOverlay(overlay)') &&
    lightToolsSrc.includes('closeModalOverlay(overlay)') &&
    (lightToolsSrc.match(/openLightToolOverlay\(overlay/g) || []).length >= 2 &&
    (lightToolsSrc.match(/removeLightToolOverlay\(overlay\)/g) || []).length >= 2 &&
    !lightToolCameraModalsSrc.includes("overlay.className = 'modal-overlay show light-tool-overlay'") &&
    !lightToolsSrc.includes("overlay.className = 'modal-overlay show light-tool-overlay'") &&
    !lightToolsSrc.includes("this.closest('.modal-overlay').remove()"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
