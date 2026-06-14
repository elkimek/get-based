#!/usr/bin/env node
// Static source guards for modules migrated to shared modal overlay helpers.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const appEventsSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const chatImagesSrc = fs.readFileSync(path.join(root, 'js/chat-images.js'), 'utf8');
const chatSummariesSrc = fs.readFileSync(path.join(root, 'js/chat-summaries.js'), 'utf8');
const contextCardsSrc = fs.readFileSync(path.join(root, 'js/context-cards.js'), 'utf8');
const contextLifestyleSrc = fs.readFileSync(path.join(root, 'js/context-card-lifestyle-editors.js'), 'utf8');
const contextMedicalSrc = fs.readFileSync(path.join(root, 'js/context-card-medical-history-editor.js'), 'utf8');
const dashboardAiSrc = fs.readFileSync(path.join(root, 'js/context-card-dashboard-ai.js'), 'utf8');
const dashboardWidgetControlsSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-controls.js'), 'utf8');
const cycleSrc = fs.readFileSync(path.join(root, 'js/cycle.js'), 'utf8');
const emfSrc = fs.readFileSync(path.join(root, 'js/emf.js'), 'utf8');
const exportReportBuilderSrc = fs.readFileSync(path.join(root, 'js/export-report-builder.js'), 'utf8');
const lensSrc = fs.readFileSync(path.join(root, 'js/lens.js'), 'utf8');
const lightConditionsNowSrc = fs.readFileSync(path.join(root, 'js/light-conditions-now.js'), 'utf8');
const lightDeviceSessionModalSrc = fs.readFileSync(path.join(root, 'js/light-device-session-modal.js'), 'utf8');
const lightDeviceSetupModalSrc = fs.readFileSync(path.join(root, 'js/light-device-setup-modal.js'), 'utf8');
const lightDevicesSrc = fs.readFileSync(path.join(root, 'js/light-devices.js'), 'utf8');
const lightEnvSrc = fs.readFileSync(path.join(root, 'js/light-env.js'), 'utf8');
const lightSessionsViewSrc = fs.readFileSync(path.join(root, 'js/light-sessions-view.js'), 'utf8');
const lightToolCameraModalsSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera-modals.js'), 'utf8');
const lightToolsSrc = fs.readFileSync(path.join(root, 'js/light-tools.js'), 'utf8');
const modalLifecycleSrc = fs.readFileSync(path.join(root, 'js/modal-lifecycle.js'), 'utf8');
const markerDetailSrc = fs.readFileSync(path.join(root, 'js/marker-detail-modal.js'), 'utf8');
const pdfImportSrc = fs.readFileSync(path.join(root, 'js/pdf-import.js'), 'utf8');
const pdfImportPreflightSrc = fs.readFileSync(path.join(root, 'js/pdf-import-preflight.js'), 'utf8');
const pdfImportReviewSrc = fs.readFileSync(path.join(root, 'js/pdf-import-review.js'), 'utf8');
const piiSrc = fs.readFileSync(path.join(root, 'js/pii.js'), 'utf8');
const profileShareSrc = fs.readFileSync(path.join(root, 'js/profile-share.js'), 'utf8');
const providerPanelsSrc = fs.readFileSync(path.join(root, 'js/provider-panels.js'), 'utf8');
const recommendationActionsSrc = fs.readFileSync(path.join(root, 'js/recommendation-actions.js'), 'utf8');
const recommendationsSrc = fs.readFileSync(path.join(root, 'js/recommendations.js'), 'utf8');
const settingsSrc = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
const settingsSyncPanelSrc = fs.readFileSync(path.join(root, 'js/settings-sync-panel.js'), 'utf8');
const supplementsSrc = fs.readFileSync(path.join(root, 'js/supplements.js'), 'utf8');
const sunSrc = fs.readFileSync(path.join(root, 'js/sun.js'), 'utf8');
const sunActiveSessionSrc = fs.readFileSync(path.join(root, 'js/sun-active-session.js'), 'utf8');
const sunDefaultsSrc = fs.readFileSync(path.join(root, 'js/sun-defaults.js'), 'utf8');
const sunSessionActionsSrc = fs.readFileSync(path.join(root, 'js/sun-session-actions.js'), 'utf8');
const sunSessionUiSrc = fs.readFileSync(path.join(root, 'js/sun-session-ui.js'), 'utf8');
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

assert('chat image lightbox uses shared overlay lifecycle helpers',
  chatImagesSrc.includes("import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    chatImagesSrc.includes("overlay.className = 'chat-lightbox'") &&
    chatImagesSrc.includes('openModalOverlay(overlay)') &&
    chatImagesSrc.includes('removeModalOverlay(overlay)') &&
    !chatImagesSrc.includes('overlay.remove()'));

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

assert('settings tweaks panel uses shared overlay lifecycle helpers',
  settingsSrc.includes("from './modal-lifecycle.js'") &&
    settingsSrc.includes('removeModalOverlay(overlay)') &&
    /openModalOverlay\s*\(\s*overlay\s*,\s*\{[\s\S]*initialFocus:\s*['"]#tweaks-panel button['"][\s\S]*scrollLock:\s*window\.matchMedia\?\.\(['"]\(max-width: 768px\)['"]\)\.matches === true[\s\S]*\}\s*\)/.test(settingsSrc) &&
    !settingsSrc.includes('_tweaksPriorBodyOverflow') &&
    !settingsSrc.includes("document.body.style.overflow = 'hidden'"));

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

assert('EMF editor, interpretation, and photo overlays use shared lifecycle helpers',
  emfSrc.includes("import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';") &&
    (emfSrc.match(/openModalOverlay\(overlay\)/g) || []).length >= 4 &&
    (emfSrc.match(/removeModalOverlay\(overlay\)/g) || []).length >= 2 &&
    emfSrc.includes('const wasConnected = overlay.isConnected;') &&
    emfSrc.includes('if (!wasConnected) document.body.appendChild(overlay);') &&
    emfSrc.includes("if (!wasConnected) try { trapModalFocus(overlay, { closeOnEscape: false }); } catch (_) {}") &&
    emfSrc.includes("trapModalFocus(overlay, { closeOnEscape: false })") &&
    emfSrc.includes('trapModalFocus(overlay)') &&
    emfSrc.includes("document.querySelectorAll('.emf-lightbox').forEach(el => removeModalOverlay(el))") &&
    !emfSrc.includes("overlay.classList.add('show')") &&
    !emfSrc.includes("overlay.classList.remove('show')") &&
    !emfSrc.includes('overlay.onclick = () => overlay.remove()'));

assert('light tool modals use shared overlay lifecycle helpers',
  modalLifecycleSrc.includes('export function openAppendedModalOverlay') &&
    modalLifecycleSrc.includes('export function removeModalOverlay') &&
    modalLifecycleSrc.includes('const closeOnEscape = options.closeOnEscape !== false;') &&
    modalLifecycleSrc.includes("if (closeOnEscape && e.key === 'Escape'") &&
    lightToolCameraModalsSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    (lightToolCameraModalsSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 6 &&
    (lightToolCameraModalsSrc.match(/removeModalOverlay\(overlay\)/g) || []).length >= 6 &&
    lightToolsSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    (lightToolsSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 2 &&
    (lightToolsSrc.match(/removeModalOverlay\(overlay\)/g) || []).length >= 2 &&
    !lightToolCameraModalsSrc.includes('function openLightToolOverlay') &&
    !lightToolsSrc.includes('function openLightToolOverlay') &&
    !lightToolCameraModalsSrc.includes("overlay.className = 'modal-overlay show light-tool-overlay'") &&
    !lightToolsSrc.includes("overlay.className = 'modal-overlay show light-tool-overlay'") &&
    !lightToolsSrc.includes("this.closest('.modal-overlay').remove()"));

assert('light device and session modals use shared overlay lifecycle helpers',
  lightDeviceSessionModalSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    lightDeviceSetupModalSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    lightDevicesSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    lightConditionsNowSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    lightSessionsViewSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    (lightDeviceSessionModalSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (lightDeviceSetupModalSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (lightDevicesSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (lightConditionsNowSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (lightSessionsViewSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    [lightDeviceSessionModalSrc, lightDeviceSetupModalSrc, lightDevicesSrc, lightConditionsNowSrc, lightSessionsViewSrc]
      .every(src => !src.includes('modal-overlay show') &&
        !src.includes("this.closest('.modal-overlay').remove()") &&
        !src.includes('overlay.remove()') &&
        !src.includes('wireBackdropClose') &&
        !src.includes('trapModalFocus')));

assert('sun session and setup modals use shared overlay lifecycle helpers',
  sunSrc.includes('openAppendedModalOverlay') &&
    sunSrc.includes('removeModalOverlay') &&
    sunActiveSessionSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    sunDefaultsSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    sunSessionActionsSrc.includes("import { removeModalOverlay } from './modal-lifecycle.js';") &&
    sunSessionUiSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    (sunSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (sunActiveSessionSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (sunDefaultsSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (sunSessionUiSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 2 &&
    sunSessionActionsSrc.includes('removeModalOverlay(overlay)') &&
    !sunSessionActionsSrc.includes("closest('.modal-overlay')?.remove()") &&
    [sunSrc, sunActiveSessionSrc, sunDefaultsSrc, sunSessionUiSrc].every(src =>
      !src.includes('modal-overlay show') &&
        !src.includes("this.closest('.modal-overlay').remove()") &&
        !src.includes('overlay.remove()')) &&
    [sunActiveSessionSrc, sunDefaultsSrc, sunSessionUiSrc].every(src =>
      !src.includes('wireBackdropClose') &&
        !src.includes('trapModalFocus')));

assert('report builder, profile share, and dashboard widget picker use shared overlay lifecycle helpers',
  exportReportBuilderSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    profileShareSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    dashboardWidgetControlsSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    exportReportBuilderSrc.includes("openAppendedModalOverlay(overlay, closeReportBuilder, { initialFocus: '.report-preset-btn.active', focusDelay: 50 })") &&
    profileShareSrc.includes('openAppendedModalOverlay(overlay, closeProfileShareModal)') &&
    dashboardWidgetControlsSrc.includes('openAppendedModalOverlay(overlay, closeDashboardWidgetPicker, options)') &&
    dashboardWidgetControlsSrc.includes("initialFocus: '#dashboard-biometric-widget-search', focusDelay: 50") &&
    [exportReportBuilderSrc, profileShareSrc, dashboardWidgetControlsSrc].every(src =>
      !src.includes('modal-overlay show') &&
        !src.includes('modal show') &&
        !src.includes('insertAdjacentHTML') &&
        !src.includes('?.remove()')));

assert('PDF import dialogs and review modal use shared overlay lifecycle helpers',
  pdfImportSrc.includes("import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';") &&
    pdfImportReviewSrc.includes("import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';") &&
    pdfImportSrc.includes("openModalOverlay(overlay, { initialFocus: '#ai-needed-or', focusDelay: 50 })") &&
    pdfImportSrc.includes("openModalOverlay(overlay, { initialFocus: 'button', focusDelay: 50 })") &&
    (pdfImportSrc.match(/closeModalOverlay\(overlay\)/g) || []).length >= 2 &&
    pdfImportReviewSrc.includes("closeModalOverlay('import-modal-overlay')") &&
    pdfImportReviewSrc.includes('openModalOverlay(overlay)') &&
    [pdfImportSrc, pdfImportReviewSrc].every(src =>
      !src.includes("overlay.classList.add('show')") &&
        !src.includes("overlay.classList.remove('show')") &&
        !src.includes("document.getElementById('import-modal-overlay')?.classList.remove('show')")) &&
    !pdfImportSrc.includes("document.getElementById('ai-needed-or').focus()"));

assert('PII diff and review overlays use shared overlay lifecycle helpers',
  piiSrc.includes("import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';") &&
    piiSrc.includes('function openPIIOverlay(overlay, options = {})') &&
    piiSrc.includes('requestAnimationFrame(() => {') &&
    piiSrc.includes('if (!overlay.isConnected) return;') &&
    piiSrc.includes('openModalOverlay(overlay, options)') &&
    piiSrc.includes('trapModalFocus(overlay, { closeOnEscape: false })') &&
    piiSrc.includes('function closePIIOverlay(overlay)') &&
    (piiSrc.match(/closePIIOverlay\(overlay\)/g) || []).length >= 5 &&
    !piiSrc.includes("document.body.style.overflow = 'hidden'") &&
    !piiSrc.includes("document.body.style.overflow = ''") &&
    !piiSrc.includes("overlay.classList.add('show')") &&
    !piiSrc.includes('overlay.remove()') &&
    !piiSrc.includes("this.closest('.pii-warning-overlay').remove()"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
