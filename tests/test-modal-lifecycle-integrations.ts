#!/usr/bin/env node
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static source guards for modules migrated to shared modal overlay helpers.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const appLightSunModulesSrc = fs.readFileSync(path.join(root, 'js/app-light-sun-modules.js'), 'utf8');
const appEventsSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const chatImagesSrc = fs.readFileSync(path.join(root, 'js/chat-images.js'), 'utf8');
const chatSummariesSrc = fs.readFileSync(path.join(root, 'js/chat-summaries.js'), 'utf8');
const contextCardsSrc = fs.readFileSync(path.join(root, 'js/context-cards.js'), 'utf8');
const contextLifestyleSrc = [
  'context-card-lifestyle-editors-impl.js',
  'context-card-lifestyle-special-editors.js',
].map(file => fs.readFileSync(path.join(root, 'js', file), 'utf8')).join('\n');
const contextMedicalSrc = fs.readFileSync(path.join(root, 'js/context-card-medical-history-editor-impl.js'), 'utf8');
const dashboardAiSrc = fs.readFileSync(path.join(root, 'js/context-card-dashboard-ai-impl.js'), 'utf8');
const contextHubViewSrc = fs.readFileSync(path.join(root, 'js/context-hub-view.ts'), 'utf8');
const protectionViewSrc = fs.readFileSync(path.join(root, 'js/data-protection-picker-view.ts'), 'utf8');
const medicalViewSrc = fs.readFileSync(path.join(root, 'js/context-medical-history-view.ts'), 'utf8');
const lifestyleViewSrc = fs.readFileSync(path.join(root, 'js/context-lifestyle-form-view.ts'), 'utf8');
const cardTipsSrc = fs.readFileSync(path.join(root, 'js/components/ContextCardTips.svelte'), 'utf8');
const dashboardWidgetControlsSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-controls.js'), 'utf8');
const cycleSrc = fs.readFileSync(path.join(root, 'js/cycle.ts'), 'utf8');
const emfSrc = fs.readFileSync(path.join(root, 'js/emf.js'), 'utf8');
const emfEditorSrc = fs.readFileSync(path.join(root, 'js/emf-editor.js'), 'utf8');
const emfInterpretationSrc = fs.readFileSync(path.join(root, 'js/emf-interpretation.js'), 'utf8').replace(/if \(!wasConnected\)\s+try\s*\{\s*trapModalFocus\(overlay, \{ closeOnEscape: false \}\);\s*\}\s*catch \(_\)\s*\{\s*\}/g, 'if (!wasConnected) try { trapModalFocus(overlay, { closeOnEscape: false }); } catch (_) {}').replace(/if \(!wasConnected\)\s+document\.body\.appendChild\(overlay\);/g, 'if (!wasConnected) document.body.appendChild(overlay);');
const exportReportBuilderSrc = fs.readFileSync(path.join(root, 'js/export-report-builder.js'), 'utf8');
fs.readFileSync(path.join(root, 'js/lens.js'), 'utf8');
const lensKnowledgeBaseUiSrc = fs.readFileSync(path.join(root, 'js/lens-knowledge-base-ui.js'), 'utf8');
const lensLibrarySrc = fs.readFileSync(path.join(root, 'js/lens-library.js'), 'utf8');
const lightConditionsNowSrc = fs.readFileSync(path.join(root, 'js/light-conditions-now.js'), 'utf8');
const lightDeviceAiSrc = fs.readFileSync(path.join(root, 'js/light-device-ai-analysis.js'), 'utf8');
const lightDeviceSessionModalSrc = fs.readFileSync(path.join(root, 'js/light-device-session-modal.ts'), 'utf8');
const lightDeviceSetupModalSrc = fs.readFileSync(path.join(root, 'js/light-device-setup-modal.ts'), 'utf8');
const lightDevicesSrc = fs.readFileSync(path.join(root, 'js/light-devices.js'), 'utf8');
const lightEnvSrc = fs.readFileSync(path.join(root, 'js/light-env.ts'), 'utf8');
const lightSessionsViewHooksSrc = fs.readFileSync(path.join(root, 'js/light-sessions-view-hooks.js'), 'utf8');
const lightSessionsViewSrc = fs.readFileSync(path.join(root, 'js/light-sessions-view.js'), 'utf8');
const lightToolCameraModalsSrc = [
  'light-tool-camera-modal-runtime.js',
  'light-tool-lux-meter.js',
  'light-tool-flicker-detector.js',
  'light-tool-darkness-meter.js',
  'light-tool-cct-meter.js',
  'light-tool-spectrum-classifier.js',
  'light-tool-glass-transmission.js',
].map(file => fs.readFileSync(path.join(root, 'js', file), 'utf8')).join('\n');
const lightToolsSrc = fs.readFileSync(path.join(root, 'js/light-tools.js'), 'utf8');
const modalLifecycleSrc = fs.readFileSync(path.join(root, 'js/modal-lifecycle.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'js/nav.js'), 'utf8');
const markerDetailSrc = [
  'marker-detail-modal.js',
  'marker-detail-modal-impl.js',
  'marker-detail-manual-entry.js',
  'marker-detail-custom-markers.js',
].map(file => fs.readFileSync(path.join(root, 'js', file), 'utf8')).join('\n');
const aiDialogSrc = fs.readFileSync(path.join(root, 'js/ai-action-dialog-component.js'), 'utf8');
const aiDialogLifecycleSrc = fs.readFileSync(path.join(root, 'js/ai-action-dialog-component.ts'), 'utf8');
const pdfImportSrc = fs.readFileSync(path.join(root, 'js/pdf-import.ts'), 'utf8');
const pdfImportFileHandlersSrc = fs.readFileSync(path.join(root, 'js/pdf-import-file-handlers.ts'), 'utf8');
const pdfImportPreflightSrc = fs.readFileSync(path.join(root, 'js/pdf-import-preflight.js'), 'utf8');
const pdfImportReviewSrc = fs.readFileSync(path.join(root, 'js/pdf-import-review.ts'), 'utf8');
const piiReviewSrc = fs.readFileSync(path.join(root, 'js/pii-review.js'), 'utf8');
const profileShareSrc = fs.readFileSync(path.join(root, 'js/profile-share.js'), 'utf8');
const providerPanelsSrc = fs.readFileSync(path.join(root, 'js/provider-panels.js'), 'utf8');
const recommendationActionsSrc = fs.readFileSync(path.join(root, 'js/recommendation-actions.ts'), 'utf8');
const recommendationsSrc = fs.readFileSync(path.join(root, 'js/recommendations.ts'), 'utf8');
const settingsSrc = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
const settingsTweaksSrc = fs.readFileSync(path.join(root, 'js/settings-tweaks.js'), 'utf8');
const settingsSyncPanelSrc = fs.readFileSync(path.join(root, 'js/settings-sync-panel-impl.js'), 'utf8');
const syncDialogSrc = fs.readFileSync(path.join(root, 'js/sync-dialog-component.js'), 'utf8');
const settingsSyncRestoreUiSrc = fs.readFileSync(path.join(root, 'js/settings-sync-restore-ui.js'), 'utf8');
const serviceWorkerSrc = readServiceWorkerSource(relative => fs.readFileSync(path.join(root, relative), 'utf8'));
const supplementsSrc = fs.readFileSync(path.join(root, 'js/supplements.js'), 'utf8');
const sunSrc = fs.readFileSync(path.join(root, 'js/sun.js'), 'utf8');
const sunActiveSessionSrc = fs.readFileSync(path.join(root, 'js/sun-active-session.js'), 'utf8');
fs.readFileSync(path.join(root, 'js/sun-defaults.js'), 'utf8');
const sunDefaultsSetupUiSrc = fs.readFileSync(path.join(root, 'js/sun-defaults-setup-ui.js'), 'utf8');
const sunSessionActionsSrc = fs.readFileSync(path.join(root, 'js/sun-session-actions.js'), 'utf8');
const sunSessionUiSrc = fs.readFileSync(path.join(root, 'js/sun-session-ui.js'), 'utf8');
const syncDiagnoseIdentitySrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-identity-actions.js'), 'utf8');
// Diagnose close-control markup belongs to its authored Svelte owner.
const syncDiagnoseRenderSrc = [
  fs.readFileSync(path.join(root, 'js/sync-diagnose-render.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'js/components/SyncDiagnoseModal.svelte'), 'utf8'),
].join('\n');
const syncDiagnoseUiSrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-ui-impl.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
const knowledgeBaseModalSrc = lensKnowledgeBaseUiSrc.slice(
  lensKnowledgeBaseUiSrc.indexOf('function openKnowledgeBaseModal'),
  lensKnowledgeBaseUiSrc.indexOf('function _kbModalKeydown')
);




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Modal Lifecycle Integrations ===');

assert('cycle editor opens through shared overlay lifecycle helper',
  cycleSrc.includes("from './modal-lifecycle.js'") &&
    cycleSrc.includes('openModalOverlay(overlay)') &&
    !cycleSrc.includes('overlay.classList.add("show")'));

assert('supplements editor opens through shared overlay lifecycle helper',
  supplementsSrc.includes("from './modal-lifecycle.js'") &&
    supplementsSrc.includes('openModalOverlay(overlay)') &&
    !supplementsSrc.includes('overlay.classList.add("show")'));

assert('dashboard AI pickers delegate to owned views using shared overlay lifecycle helpers',
  dashboardAiSrc.includes("from './data-protection-picker-view.js'") &&
    dashboardAiSrc.includes('return openDataProtectionView({') &&
    dashboardAiSrc.includes("openContextHub as openContextModal, openContextHub as openPersonalizeAIPicker } from './context-hub-view.js'") &&
    [contextHubViewSrc, protectionViewSrc].every(source =>
      source.includes("from './modal-lifecycle.js'") &&
      source.includes('openModalOverlay(overlay, {') &&
      source.includes('closeModalOverlay(owned.overlay)') &&
      !/overlay\.classList\.(?:add|remove)\(['"]show['"]\)/.test(source)) &&
    contextHubViewSrc.includes('owned.session.retire()') &&
    protectionViewSrc.includes('trapModalFocus(overlay, { autoFocus: false, onEscape: () => close(owned) })') &&
    protectionViewSrc.includes('owned.releaseFocus(false)'));

assert('context medical history and card tips open through shared overlay lifecycle helper',
  contextMedicalSrc.includes("from './context-medical-history-view.js'") &&
    contextMedicalSrc.includes('return openMedicalHistory()') &&
    medicalViewSrc.includes("from './modal-lifecycle.js'") &&
    contextCardsSrc.includes("from './modal-lifecycle.js'") &&
    medicalViewSrc.includes('openModalOverlay(overlay)') &&
    contextCardsSrc.includes('openModalOverlay(overlay)') &&
    medicalViewSrc.includes('closeModalOverlay(owned.overlay); dispose(owned)') &&
    medicalViewSrc.includes('owned.afterClose()') &&
    medicalViewSrc.includes('owned.session.retire()') &&
    contextCardsSrc.includes('close: closeContextCardModal') &&
    !contextMedicalSrc.includes('callUtilsRuntimeFunction') &&
    !/overlay\.classList\.add\(['"]show['"]\)/.test(medicalViewSrc + contextCardsSrc));

assert('all eight lifestyle context editors delegate to one shared overlay lifecycle owner',
  contextLifestyleSrc.includes("from './context-lifestyle-form-view.js'") &&
    ['diet', 'sleepRest', 'exercise', 'stress', 'loveLife', 'environment', 'lightCircadian', 'interpretiveLens']
      .every(key => contextLifestyleSrc.includes(`return openLifestyleForm('${key}')`)) &&
    lifestyleViewSrc.includes("from './modal-lifecycle.js'") &&
    lifestyleViewSrc.includes('openModalOverlay(overlay)') &&
    lifestyleViewSrc.includes('closeModalOverlay(owned.overlay)') &&
    lifestyleViewSrc.includes('owned.session.retire()') &&
    lifestyleViewSrc.includes('releaseContextFormDialog(owned.modal, owned.root') &&
    !/overlay\.classList\.add\(['"]show['"]\)/.test(contextLifestyleSrc + lifestyleViewSrc));

assert('chat summary modal uses shared overlay lifecycle helpers',
  chatSummariesSrc.includes("from './modal-lifecycle.js'") &&
    chatSummariesSrc.includes("overlay.className = 'modal-overlay'") &&
    chatSummariesSrc.includes('openModalOverlay(overlay)') &&
    chatSummariesSrc.includes('closeModalOverlay(overlay)') &&
    !chatSummariesSrc.includes("overlay.className = 'modal-overlay show'") &&
    !chatSummariesSrc.includes("overlay.classList.remove('show')"));

assert('chat summary modal participates in global keyboard modal handling',
  appEventsSrc.includes("['summary-modal-overlay', 'closeSummaryModal']") &&
    appEventsSrc.includes('runAppEventListener(actionName, action)'));

const lightboxComponentSrc = fs.readFileSync(path.join(root, 'js/chat-image-lightbox-component.ts'), 'utf8');
assert('chat image lightbox uses shared overlay lifecycle helpers',
  chatImagesSrc.includes("import { openChatImageLightbox }") &&
    lightboxComponentSrc.includes('openModalOverlay(overlay,') &&
    lightboxComponentSrc.includes('closeModalOverlay(overlay,') &&
    lightboxComponentSrc.includes('trapModalFocus(overlay,') &&
    lightboxComponentSrc.includes('releaseFocus?.(restoreFocus)'));


assert('authored card tips actions close through the shared detail modal path before opening EMF',
  cardTipsSrc.includes('data-rec-action="close-modal"') &&
    cardTipsSrc.includes('data-rec-action="open-emf-assessment"') &&
    /action === 'close-modal'[\s\S]*?event\.preventDefault\(\);\s*closeRecommendationsModal\(\);/.test(recommendationsSrc) &&
    /action === 'open-emf-assessment'[\s\S]*?event\.preventDefault\(\);\s*closeRecommendationsModal\(\);\s*scheduleRecommendationsTask\(openRecommendationsEmfAssessment, 100\);/.test(recommendationsSrc) &&
    !recommendationsSrc.includes("document.getElementById('modal-overlay').classList.remove('show')"));

assert('recommendation detail modal opens through shared overlay lifecycle helper',
  recommendationActionsSrc.includes("from './modal-lifecycle.js'") &&
    recommendationActionsSrc.includes('openModalOverlay(overlay)') &&
    !recommendationActionsSrc.includes('overlay.classList.add("show")'));

assert('OpenRouter balance dialog uses owned presentation and shared overlay lifecycle helpers',
  providerPanelsSrc.includes("from './ai-action-dialog-component.js'") &&
    providerPanelsSrc.includes('showAiActionDialog({') &&
    providerPanelsSrc.includes("overlayId: 'or-no-balance-overlay'") &&
    aiDialogSrc.includes("from './modal-lifecycle.js'") &&
    aiDialogSrc.includes('openModalOverlay(host, { autoFocus: false })') &&
    aiDialogSrc.includes('trapModalFocus(host, { autoFocus: false, onEscape: () => close() })') &&
    aiDialogSrc.includes('closeModalOverlay(host, { restoreFocus })') &&
    /if \(focusTimer !== undefined\)\s+clearTimeout\(focusTimer\)/.test(aiDialogSrc) &&
    !providerPanelsSrc.includes("overlay.classList.add('show')") &&
    !providerPanelsSrc.includes("overlay.classList.remove('show')"));

assert('settings modal opens and closes through shared overlay lifecycle helpers',
  settingsSrc.includes("from './modal-lifecycle.js'") &&
    settingsSrc.includes('openModalOverlay(overlay)') &&
    settingsSrc.includes("closeModalOverlay('settings-modal-overlay')") &&
    !settingsSrc.includes("overlay.classList.add('show')") &&
    !settingsSrc.includes("document.getElementById('settings-modal-overlay').classList.remove('show')"));

assert('settings tweaks panel uses shared overlay lifecycle helpers',
  settingsTweaksSrc.includes("from './modal-lifecycle.js'") &&
    settingsTweaksSrc.includes("from './settings-runtime.js'") &&
    settingsTweaksSrc.includes('removeModalOverlay(overlay)') &&
    /openModalOverlay\s*\(\s*overlay\s*,\s*\{[\s\S]*initialFocus:\s*['"]#tweaks-panel button['"][\s\S]*scrollLock:\s*settingsMediaMatches\(['"]\(max-width: 768px\)['"]\)[\s\S]*\}\s*\)/.test(settingsTweaksSrc) &&
    !settingsTweaksSrc.includes('_tweaksPriorBodyOverflow') &&
    !settingsTweaksSrc.includes("document.body.style.overflow = 'hidden'"));

assert('mobile sidebar uses shared scroll lock lifecycle helpers',
  navSrc.includes("from './modal-lifecycle.js'") &&
    navSrc.includes('openModalOverlay(backdrop, { scrollLock: true })') &&
    navSrc.includes("closeModalOverlay('sidebar-backdrop', { restoreFocus: false })") &&
    !navSrc.includes("document.body.style.overflow = 'hidden'") &&
    !navSrc.includes("document.body.style.overflow = ''"));

assert('sync setup and restore dialogs use owned presentation and shared lifecycle helpers',
  settingsSyncPanelSrc.includes("from './settings-sync-restore-ui.js'") &&
    settingsSyncRestoreUiSrc.includes("from './sync-dialog-component.js'") &&
    settingsSyncRestoreUiSrc.includes("from './sync-dialog-controller.js'") &&
    syncDialogSrc.includes("from './modal-lifecycle.js'") &&
    syncDialogSrc.includes('openModalOverlay(overlay, { autoFocus: false, scrollLock: true })') &&
    syncDialogSrc.includes('closeModalOverlay(host, { restoreFocus: false })') &&
    syncDialogSrc.includes('owner.focusFirst()') &&
    syncDialogSrc.includes('view?.clearSecrets()') &&
    !`${settingsSyncPanelSrc}\n${settingsSyncRestoreUiSrc}\n${syncDialogSrc}`.includes("overlay.classList.add('show')") &&
    !`${settingsSyncPanelSrc}\n${settingsSyncRestoreUiSrc}\n${syncDialogSrc}`.includes("overlay.classList.remove('show')"));

assert('global focus trap top-overlay check includes confirm overlays',
  appEventsSrc.includes("const APP_MODAL_OVERLAY_SELECTOR = '.modal-overlay.show,.confirm-overlay.show,.tweaks-overlay.show,[data-modal-focus-trap]'") &&
    appEventsSrc.includes('const ov = topmostModalOverlay()'));

assert('knowledge base modal uses shared lifecycle helpers',
  lensKnowledgeBaseUiSrc.includes("from './modal-lifecycle.js'") &&
    knowledgeBaseModalSrc.includes('wireBackdropClose(overlay, closeKnowledgeBaseModal)') &&
    knowledgeBaseModalSrc.includes('openModalOverlay(overlay, {') &&
    knowledgeBaseModalSrc.includes("closeModalOverlay('kb-modal-overlay')") &&
    !knowledgeBaseModalSrc.includes("overlay.classList.add('show')") &&
    !knowledgeBaseModalSrc.includes("overlay.classList.remove('show')"));

assert('lens library create dialog uses shared lifecycle helpers',
  lensLibrarySrc.includes("from './modal-lifecycle.js'") &&
    lensLibrarySrc.includes("openModalOverlay(overlay, { initialFocus: '#lens-create-name', focusDelay: 0 })") &&
    lensLibrarySrc.includes('closeModalOverlay(overlay)') &&
    !lensLibrarySrc.includes("overlay.classList.add('show')") &&
    !lensLibrarySrc.includes("overlay.classList.remove('show')"));

assert('PDF import preflight dialogs use shared lifecycle helpers',
  pdfImportPreflightSrc.includes("from './modal-lifecycle.js'") &&
    pdfImportPreflightSrc.includes("openModalOverlay(overlay, { initialFocus: '#confirm-cancel', focusDelay: 30 })") &&
    (pdfImportPreflightSrc.match(/const close = openPreflightResult\(overlay, resolve, false\)/g) || []).length === 2 &&
    pdfImportPreflightSrc.includes("const close = openPreflightResult(overlay, resolve, 'cancel')") &&
    /if \(settled\)\s*return;\s*settled = true;\s*closeModalOverlay\(overlay\);\s*cleanup\(\);\s*resolve\(result\);/.test(pdfImportPreflightSrc) &&
    pdfImportPreflightSrc.includes("overlay.dataset.escapeOwner = 'preflight'") &&
    pdfImportPreflightSrc.includes('overlay.onclick = previousOnclick') &&
    pdfImportPreflightSrc.includes('delete overlay.dataset.escapeOwner') &&
    appEventsSrc.includes('confirmOverlay.dataset.escapeOwner') &&
    pdfImportPreflightSrc.includes('document.addEventListener(\'keydown\', onKey)') &&
    pdfImportPreflightSrc.includes("cleanup = openPreflightOverlay(overlay, () => close(cancelResult))") &&
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
    lightEnvSrc.includes("import { environmentRoomClasses } from './light-environment-room-classes.js'") &&
    lightEnvSrc.includes("const wasOpen = overlay?.classList?.contains('show') === true;") &&
    lightEnvSrc.includes("overlay.className = environmentRoomClasses('modal-overlay light-env-assessment-overlay')") &&
    /if \(!wasOpen\)\s+openModalOverlay\(overlay, \{ initialFocus: '\.modal-close', focusDelay: 50 \}\)/.test(lightEnvSrc) &&
    /export function closeLightEnvironmentAssessment\(\) \{\s*const overlay = getLightEnvironmentAssessmentOverlay\(\);\s*if \(!overlay\) return;\s*closeModalOverlay\(overlay\);\s*lightEnvironmentModalOwners\.delete\(overlay\);\s*overlay\.remove\(\);\s*\}/.test(lightEnvSrc) &&
    !lightEnvSrc.includes('modal-overlay show light-env-assessment-overlay') &&
    !/overlay\.classList\.(?:add|remove)\(['"]show['"]\)/.test(lightEnvSrc));

assert('EMF editor, interpretation, and photo overlays use shared lifecycle helpers',
  emfSrc.includes("import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';") &&
    emfEditorSrc.includes("import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    emfInterpretationSrc.includes("import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';") &&
    ((emfSrc.match(/openModalOverlay\(overlay\)/g) || []).length + (emfEditorSrc.match(/openModalOverlay\(overlay\)/g) || []).length + (emfInterpretationSrc.match(/openModalOverlay\(overlay\)/g) || []).length) >= 4 &&
    ((emfSrc.match(/removeModalOverlay\(overlay\)/g) || []).length + (emfEditorSrc.match(/removeModalOverlay\(overlay\)/g) || []).length + (emfInterpretationSrc.match(/removeModalOverlay\(overlay\)/g) || []).length) >= 2 &&
    emfInterpretationSrc.includes('const wasConnected = overlay.isConnected;') &&
    emfInterpretationSrc.includes('if (!wasConnected) document.body.appendChild(overlay);') &&
    emfInterpretationSrc.includes("if (!wasConnected) try { trapModalFocus(overlay, { closeOnEscape: false }); } catch (_) {}") &&
    emfInterpretationSrc.includes("trapModalFocus(overlay, { closeOnEscape: false })") &&
    emfSrc.includes('trapModalFocus(overlay)') &&
    emfEditorSrc.includes("document.querySelectorAll('.emf-lightbox').forEach(element => removeModalOverlay(element))") &&
    !emfSrc.includes("overlay.classList.add('show')") &&
    !emfEditorSrc.includes("overlay.classList.add('show')") &&
    !emfInterpretationSrc.includes("overlay.classList.add('show')") &&
    !emfSrc.includes("overlay.classList.remove('show')") &&
    !emfEditorSrc.includes("overlay.classList.remove('show')") &&
    !emfInterpretationSrc.includes("overlay.classList.remove('show')") &&
    !emfSrc.includes('overlay.onclick = () => overlay.remove()') &&
    !emfEditorSrc.includes('overlay.onclick = () => overlay.remove()') &&
    !emfInterpretationSrc.includes('overlay.onclick = () => overlay.remove()'));

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
    lightToolCameraModalsSrc.includes('const fn = deps.saveMeasurement;') &&
    !lightToolCameraModalsSrc.includes('getUtilsRuntimeFunction') &&
    !lightToolsSrc.includes('function openLightToolOverlay') &&
    !lightToolCameraModalsSrc.includes("overlay.className = 'modal-overlay show light-tool-overlay'") &&
    !lightToolsSrc.includes("overlay.className = 'modal-overlay show light-tool-overlay'") &&
    !lightToolsSrc.includes("this.closest('.modal-overlay').remove()"));

assert('light device and session modals use shared overlay lifecycle helpers',
  lightDeviceSessionModalSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    lightDeviceSessionModalSrc.includes("import { validateModeCoupling } from './sun-spectrum.js';") &&
    !lightDeviceSessionModalSrc.includes('getUtilsRuntimeFunction') &&
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

assert('light sessions view runtime dependencies are startup-wired',
  lightSessionsViewSrc.includes('export function configureLightSessionsView') &&
    !lightSessionsViewSrc.includes('window.') &&
    lightDevicesSrc.includes('export function configureLightDevices') &&
    !lightDevicesSrc.includes('window.renderDeviceSessionAIDetail') &&
    lightDeviceAiSrc.includes('registerAIActionHandler') &&
    !lightDeviceAiSrc.includes('Object.assign(window, {') &&
    !lightDeviceAiSrc.includes('window.renderDeviceSessionAIDetail') &&
    !lightDeviceAiSrc.includes('window.renderDeviceSessionAIInline') &&
    lightDevicesSrc.includes('export async function deleteDeviceSessionWithConfirm') &&
    lightSessionsViewHooksSrc.includes("import { getSessions } from './sun.js';") &&
    lightSessionsViewHooksSrc.includes("import { configureLightDevices, openDeviceSessionDetail } from './light-devices.js';") &&
    lightSessionsViewHooksSrc.includes("import { getDeviceSessionAIView } from './light-device-ai-analysis.js';") &&
    lightSessionsViewHooksSrc.includes("configureLightDevices({ getDeviceSessionAIDetailView: (session) => getDeviceSessionAIView(session, 'detail') });") &&
    lightSessionsViewHooksSrc.includes('configureLightSessionsView({') &&
    appLightSunModulesSrc.includes("import './light-sessions-view-hooks.js';") &&
    serviceWorkerSrc.includes("'/js/light-sessions-view-hooks.js'"));

assert('sun session and setup modals use shared overlay lifecycle helpers',
  sunSrc.includes('openAppendedModalOverlay') &&
    sunSrc.includes('removeModalOverlay') &&
    sunActiveSessionSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    sunDefaultsSetupUiSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    sunSessionActionsSrc.includes("import { removeModalOverlay } from './modal-lifecycle.js';") &&
    sunSessionUiSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
    (sunSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (sunActiveSessionSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (sunDefaultsSetupUiSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 1 &&
    (sunSessionUiSrc.match(/openAppendedModalOverlay\(overlay/g) || []).length >= 2 &&
    sunSessionActionsSrc.includes('removeModalOverlay(overlay)') &&
    !sunSessionActionsSrc.includes("closest('.modal-overlay')?.remove()") &&
    [sunSrc, sunActiveSessionSrc, sunDefaultsSetupUiSrc, sunSessionUiSrc].every(src =>
      !src.includes('modal-overlay show') &&
        !src.includes("this.closest('.modal-overlay').remove()") &&
        !src.includes('overlay.remove()')) &&
    [sunActiveSessionSrc, sunDefaultsSetupUiSrc, sunSessionUiSrc].every(src =>
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
  pdfImportSrc.includes("import { showAiActionDialog } from './ai-action-dialog-component.js';") &&
    pdfImportFileHandlersSrc.includes("import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';") &&
    pdfImportReviewSrc.includes("import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';") &&
    pdfImportSrc.includes("overlayId: 'ai-needed-overlay'") &&
    aiDialogLifecycleSrc.includes("from './modal-lifecycle.js'") &&
    aiDialogLifecycleSrc.includes('openModalOverlay(host, { autoFocus: false })') &&
    aiDialogLifecycleSrc.includes('trapModalFocus(host, { autoFocus: false, onEscape: () => close() })') &&
    /focusTimer = setTimeout\(\(\) => \{\s*if \(isCurrent\(\) && !root\.contains\(document\.activeElement\)\)\s+root\.querySelector<HTMLButtonElement>\('button'\)\?\.focus\(\);\s*\}, 50\)/.test(aiDialogLifecycleSrc) &&
    /if \(focusTimer !== undefined\)\s+clearTimeout\(focusTimer\)/.test(aiDialogLifecycleSrc) &&
    pdfImportFileHandlersSrc.includes("openModalOverlay(overlay, { initialFocus: 'button', focusDelay: 50 })") &&
    aiDialogLifecycleSrc.includes('releaseFocus?.(restoreFocus)') &&
    aiDialogLifecycleSrc.includes('closeModalOverlay(host, { restoreFocus })') &&
    pdfImportFileHandlersSrc.includes('closeModalOverlay(overlay)') &&
    /function hideImportOverlay\(\) \{\s*closeModalOverlay\('import-modal-overlay'\);\s*\}/.test(pdfImportReviewSrc) &&
    pdfImportReviewSrc.includes('export function showImportPreview(parseResult: PendingImport) {') &&
    pdfImportReviewSrc.slice(
      pdfImportReviewSrc.indexOf('export function showImportPreview('),
      pdfImportReviewSrc.indexOf('\nexport function mapUnmatchedMarker('),
    ).includes('openModalOverlay(overlay, { scrollLock: true })') &&
    [pdfImportSrc, pdfImportFileHandlersSrc, pdfImportReviewSrc, aiDialogLifecycleSrc].every(src =>
      !/overlay\.classList\.(?:add|remove)\(['"]show['"]\)/.test(src) &&
        !src.includes("document.getElementById('import-modal-overlay')?.classList.remove('show')")) &&
    !pdfImportSrc.includes("document.getElementById('ai-needed-or').focus()"));

assert('PII diff and review overlays use shared overlay lifecycle helpers',
  piiReviewSrc.includes("from './modal-lifecycle.js';") &&
    piiReviewSrc.includes('openModalOverlay,') &&
    piiReviewSrc.includes('removeModalOverlay,') &&
    piiReviewSrc.includes('trapModalFocus,') &&
    piiReviewSrc.includes('function openPIIOverlay(overlay, options = {})') &&
    piiReviewSrc.includes('requestAnimationFrame(() => {') &&
    /if \(!overlay\.isConnected\)\s+return;/.test(piiReviewSrc) &&
    piiReviewSrc.includes('openModalOverlay(overlay, options)') &&
    piiReviewSrc.includes('trapModalFocus(overlay, { closeOnEscape: false })') &&
    piiReviewSrc.includes('function closePIIOverlay(overlay)') &&
    (piiReviewSrc.match(/closePIIOverlay\(overlay\)/g) || []).length >= 5 &&
    !piiReviewSrc.includes("document.body.style.overflow = 'hidden'") &&
    !piiReviewSrc.includes("document.body.style.overflow = ''") &&
    !piiReviewSrc.includes("overlay.classList.add('show')") &&
    !piiReviewSrc.includes('overlay.remove()') &&
    !piiReviewSrc.includes("this.closest('.pii-warning-overlay').remove()"));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
