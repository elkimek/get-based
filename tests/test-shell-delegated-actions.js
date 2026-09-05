#!/usr/bin/env node
// Static shell delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appChatHooksSrc = fs.readFileSync(path.join(root, 'js/app-chat-hooks.js'), 'utf8');
const appEventsSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
const biologyScoreContextAISrc = fs.readFileSync(path.join(root, 'js/biology-score-context-ai.js'), 'utf8');
const categoryPageViewSrc = fs.readFileSync(path.join(root, 'js/category-page-view.js'), 'utf8');
const chatEmptyStateSrc = fs.readFileSync(path.join(root, 'js/chat-empty-state.js'), 'utf8');
const chatLoaderSrc = fs.readFileSync(path.join(root, 'js/chat-loader.js'), 'utf8');
const chatRuntimeSrc = fs.readFileSync(path.join(root, 'js/chat-runtime.js'), 'utf8');
const cycleImportLoaderSrc = fs.readFileSync(path.join(root, 'js/cycle-import-loader.js'), 'utf8');
const cycleSrc = fs.readFileSync(path.join(root, 'js/cycle.js'), 'utf8');
const dashboardRecommendationWidgetSrc = fs.readFileSync(path.join(root, 'js/dashboard-recommendation-widget.js'), 'utf8');
const emfRuntimeSrc = fs.readFileSync(path.join(root, 'js/emf-runtime.js'), 'utf8');
const emfSrc = fs.readFileSync(path.join(root, 'js/emf.js'), 'utf8');
const exportLoaderSrc = fs.readFileSync(path.join(root, 'js/export-loader.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(root, 'js/export.js'), 'utf8');
const lensPageShellSrc = fs.readFileSync(path.join(root, 'js/lens-page-shell.js'), 'utf8');
const appLightSunSrc = fs.readFileSync(path.join(root, 'js/app-light-sun-modules.js'), 'utf8');
const lightSunLoaderSrc = fs.readFileSync(path.join(root, 'js/light-sun-loader.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const notesRuntimeSrc = fs.readFileSync(path.join(root, 'js/notes-runtime.js'), 'utf8');
const shellSrc = fs.readFileSync(path.join(root, 'js/shell-actions.js'), 'utf8');
const syncPullSrc = fs.readFileSync(path.join(root, 'js/sync-pull.js'), 'utf8');
const wearableDetailRuntimeSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-runtime.js'), 'utf8');
const wearablesRuntimeSrc = fs.readFileSync(path.join(root, 'js/wearables-runtime.js'), 'utf8');

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

console.log('=== Static Shell Delegated Actions ===');

const body = (html.match(/<body>[\s\S]*?<script src="version\.js"/) || [''])[0];
const inlineHandlerRe = /\bon(?:click|change|input|search|keydown|keyup|submit)=/;

assert('Static body shell has no inline event attributes',
  body && !inlineHandlerRe.test(body));
assert('main installs shell action delegates',
  mainSrc.includes("import { installShellActionDelegates } from './shell-actions.js'")
    && mainSrc.includes('installShellActionDelegates();'));

[
  'toggle-mobile-sidebar',
  'close-mobile-sidebar',
  'trigger-import',
  'share-profile',
  'open-tweaks',
  'open-settings',
  'open-feedback',
].forEach(action => {
  assert(`Shell action ${action} is rendered`, html.includes(`data-shell-action="${action}"`));
  assert(`Shell action ${action} is handled`, shellSrc.includes(`action === '${action}'`));
});

assert('Legacy KB pill AI-settings shell action is fully removed',
  !html.includes('data-shell-action="open-ai-settings"') &&
    !shellSrc.includes("action === 'open-ai-settings'"));

assert('Shell action import-status is handled for compatibility but not rendered as a floating button',
  shellSrc.includes("action === 'import-status'")
    && !html.includes('data-shell-action="import-status"'));

assert('Feedback shell action uses its module dependency instead of a window lookup',
  shellSrc.includes("import { openFeedbackModal } from './feedback.js'")
    && shellSrc.includes('shellFeedbackDeps.openFeedbackModal()')
    && !shellSrc.includes("callShellRuntime('openFeedbackModal')"));

assert('Share Profile shell action uses its wired module dependency instead of a window lookup',
  shellSrc.includes('shellProfileShareDeps.openProfileShareModal()')
    && !shellSrc.includes("callShellRuntime('openProfileShareModal')")
    && appShellHooksSrc.includes('configureShellProfileShareDeps({ openProfileShareModal });'));

assert('Legacy Chat HD action is removed',
  !shellSrc.includes("action === 'toggle-hd'") && !html.includes('chat-hd-btn'));

assert('Mobile sidebar shell actions use injected nav dependencies',
  shellSrc.includes('shellNavDeps.toggleMobileSidebar()')
    && shellSrc.includes('shellNavDeps.closeMobileSidebar()')
    && !shellSrc.includes("from './views-runtime-bridge.js'")
    && appShellHooksSrc.includes('configureShellNavDeps({ closeMobileSidebar, toggleMobileSidebar });'));

assert('App shell wires module-only chat image consumers',
  appShellHooksSrc.includes("from './chat-loader.js'")
    && appChatHooksSrc.includes("from './chat-images.js'")
    && appChatHooksSrc.includes('configureChatMessageActionDeps({')
    && appChatHooksSrc.includes('openImageLightbox,')
    && appChatHooksSrc.includes('removeImageAttachment,')
    && appChatHooksSrc.includes('initChatImageHandlers();')
    && appChatHooksSrc.includes('updateAttachButtonVisibility();'));

assert('App shell wires module-only chat message actions',
  ['closeSummaryModal', 'continueDiscussion', 'copySummary', 'deleteSavedSummary',
    'downloadSummary', 'endDiscussion', 'jumpToSearchResult', 'printSummary',
    'startDiscussionFromPicker', 'viewSavedSummary']
    .every(name => appChatHooksSrc.includes(`${name},`)));

assert('Chat thread shell actions use module dependencies instead of window lookups',
  shellSrc.includes('shellChatThreadDeps.toggleThreadRail()')
    && shellSrc.includes('shellChatThreadDeps.createNewThread()')
    && shellSrc.includes('shellChatThreadDeps.createThreadProject()')
    && shellSrc.includes('shellChatThreadDeps.filterThreadList(input.value)')
    && shellSrc.includes('shellChatThreadDeps.setChatThreadSort(input.value)')
    && !shellSrc.includes("callShellRuntime('toggleThreadRail')")
    && !shellSrc.includes("callShellRuntime('createNewThread')")
    && !shellSrc.includes("callShellRuntime('filterThreadList'"));

assert('App shell wires module-only chat thread consumers',
  appShellHooksSrc.includes("from './chat-loader.js'")
    && chatLoaderSrc.includes("import('./app-ai-interaction-modules.js')")
    && appShellHooksSrc.includes('configureShellChatThreadDeps({ createNewThread, createThreadProject, filterThreadList, setChatThreadSort, toggleThreadRail });')
    && appShellHooksSrc.includes('configureOnboardingViewRuntimeDeps({ buildSidebar, createNewThread, navigate, openChatPanel, toggleChatPanel });')
    && appShellHooksSrc.includes('ensureActiveThread: ensureActiveThreadIfLoaded,')
    && appShellHooksSrc.includes('loadChatHistory: loadChatHistoryIfLoaded,')
    && appShellHooksSrc.includes('loadChatThreads: loadChatThreadsIfLoaded,')
    && appShellHooksSrc.includes('renderThreadList: renderThreadListIfLoaded,'));

assert('App shell wires Context hub status refresh without a window lookup',
  appShellHooksSrc.includes("import { configureDashboardAIContextStatus } from './context-card-dashboard-ai-runtime.js'")
    && appShellHooksSrc.includes('updateChatContextStatusIfLoaded')
    && chatLoaderSrc.includes("callLoadedChatModule('updateChatContextStatus'")
    && appShellHooksSrc.includes('configureDashboardAIContextStatus(updateChatContextStatusIfLoaded);'));

assert('App shell injects core Context Cards view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureContextCardsRuntimeCallbacks({ closeModal, navigate, onContextCardSaved: onContextCardSavedIfLoaded });'));

assert('App shell wires Chat UI refreshes without window globals',
  appShellHooksSrc.includes('configureChatRuntimeCallbacks({')
    && appShellHooksSrc.includes('updateChatHeaderModel: updateChatHeaderModelIfLoaded,')
    && appShellHooksSrc.includes('updateChatNudge,')
    && appChatHooksSrc.includes("import { configureChatRuntimeCallbacks } from './chat-runtime.js'")
    && appChatHooksSrc.includes('configureChatRuntimeCallbacks({')
    && appChatHooksSrc.includes('closeModal: deps.closeModal,')
    && appChatHooksSrc.includes('refreshWebSearchToggle: () => {')
    && appChatHooksSrc.includes('updateAttachButtonVisibility();')
    && appChatHooksSrc.includes('updateChatInputState();')
    && appChatHooksSrc.includes('resumeAI,')
    && appChatHooksSrc.includes('sendChatMessage,'));

assert('App shell injects Chat modal close without a view bridge lookup',
  !chatRuntimeSrc.includes("from './views-runtime-bridge.js'")
    && !chatRuntimeSrc.includes('getViewRuntimeFunction')
    && chatRuntimeSrc.includes("callChatRuntimeCallback('closeModal');"));

assert('App shell wires Chat prompt consumers without window globals',
  appShellHooksSrc.includes("import { configureBiologyScoresRuntimeDeps } from './biology-scores-runtime.js'")
    && appShellHooksSrc.includes("import { configureContextCardLifestyleRuntimeDeps } from './context-card-lifestyle-runtime.js'")
    && appShellHooksSrc.includes('configureBiologyScoresRuntimeDeps({ navigate, openChatPanel, showDetailModal, useChatPrompt });')
    && appShellHooksSrc.includes('configureContextCardLifestyleRuntimeDeps({ closeModal, navigate, openChatPanel, useChatPrompt });'));

assert('App shell injects Biology Score context navigation without bridge or window fallbacks',
  !biologyScoreContextAISrc.includes("from './views-runtime-bridge.js'")
    && !biologyScoreContextAISrc.includes('window.showNotification')
    && biologyScoreContextAISrc.includes("biologyScoreContextAIDeps.navigate?.('biology-scores')")
    && biologyScoreContextAISrc.includes("showNotification('Context flag applied', 'success')")
    && appShellHooksSrc.includes("import { configureBiologyScoreContextAIDeps } from './biology-score-context-ai.js';")
    && appShellHooksSrc.includes('configureBiologyScoreContextAIDeps({ navigate });'));

assert('App shell wires Chat close consumers without window globals',
  appChatHooksSrc.includes("from './chat-empty-state.js'")
    && appShellHooksSrc.includes("import { configureDashboardPageRuntimeDeps } from './dashboard-page-view.js'")
    && appChatHooksSrc.includes('configureChatEmptyStateDeps({')
    && appShellHooksSrc.includes('configureDashboardPageRuntimeDeps({ closeChatPanel, openChatPanel });'));

assert('App shell injects Chat empty-state view callbacks without bridge or global fallbacks',
  !chatEmptyStateSrc.includes("from './views-runtime-bridge.js'")
    && !chatEmptyStateSrc.includes('chatEmptyRuntime()')
    && chatEmptyStateSrc.includes('chatEmptyStateDeps.openChatProviderQuiz();')
    && chatEmptyStateSrc.includes("chatEmptyStateDeps.setOnboardingFocus(actionEl.dataset.focus || '');")
    && appChatHooksSrc.includes('openChatProviderQuiz: deps.openChatProviderQuiz,')
    && appChatHooksSrc.includes('setOnboardingFocus: deps.setOnboardingFocus,'));

assert('App shell wires remaining Chat open consumers without window globals',
  appShellHooksSrc.includes('configureEMFInterpretationRuntimeDeps({ closeModal, openChatPanel });')
    && appShellHooksSrc.includes('configureRecommendationsRuntime({ closeModal, openChatPanel, openProfileLocationEditor, openSettingsModal });')
    && appShellHooksSrc.includes('configureTourRuntimeDeps({ openChatPanel });'));

assert('App shell injects the lazy EMF editor close callback without bridge lookups',
  !emfSrc.includes("from './views-runtime-bridge.js'")
    && !emfSrc.includes('getViewRuntimeFunction')
    && emfSrc.includes('closeModal: () => emfRuntimeDeps.closeModal?.()')
    && emfRuntimeSrc.includes('mod.configureEMFRuntimeDeps(emfRuntimeDeps);')
    && !emfRuntimeSrc.includes("import('./emf.js')")
    && emfRuntimeSrc.includes('emfRuntimeDeps.loadModule()')
    && appShellHooksSrc.includes("import { configureEMFRuntimeDeps } from './emf-runtime.js';")
    && appShellHooksSrc.includes("loadModule: () => import('./emf.js')"));

assert('App shell injects wearable navigation without view bridge lookups',
  appShellHooksSrc.includes('configureWearablesConnectRuntimeDeps({ navigate });')
    && appShellHooksSrc.includes('configureWearableSettingsRuntimeDeps({ navigate });'));

assert('App shell injects wearable detail actions without view bridge lookups',
  !wearableDetailRuntimeSrc.includes("from './views-runtime-bridge.js'")
    && !wearableDetailRuntimeSrc.includes('getViewRuntimeFunction')
    && wearableDetailRuntimeSrc.includes('wearableDetailRuntimeDeps.rememberModalTrigger?.();')
    && wearableDetailRuntimeSrc.includes("wearableDetailRuntimeDeps.navigate?.(route || 'dashboard');")
    && wearableDetailRuntimeSrc.includes('wearableDetailRuntimeDeps.closeModal?.();')
    && appShellHooksSrc.includes("import { configureWearableDetailRuntimeDeps } from './wearables-detail-runtime.js';")
    && appShellHooksSrc.includes('configureWearableDetailRuntimeDeps({ closeModal, navigate, rememberModalTrigger });'));

assert('App shell injects wearable dashboard actions without view bridge lookups',
  !wearablesRuntimeSrc.includes("from './views-runtime-bridge.js'")
    && !wearablesRuntimeSrc.includes('getViewRuntimeFunction')
    && wearablesRuntimeSrc.includes("wearablesRuntimeDeps.navigate?.(route || 'dashboard');")
    && wearablesRuntimeSrc.includes('wearablesRuntimeDeps.closeModal?.();')
    && appShellHooksSrc.includes("import { configureWearablesRuntime } from './wearables-runtime.js';")
    && appShellHooksSrc.includes('configureWearablesRuntime({')
    && appShellHooksSrc.includes("import('./wearables.js?lazy-retry=1')")
    && appShellHooksSrc.includes("import('./wearables.js')"));

assert('App shell injects wearable summary persistence',
  /import\s*\{[^}]*\bconfigureWearableSummary\b[^}]*\bsyncWearableSummary\b[^}]*}\s*from '\.\/wearables-summary\.js';/s.test(appShellHooksSrc)
    && appShellHooksSrc.includes('configureWearableSummary({ saveImportedData });'));

assert('App shell injects category customization view callbacks',
  appShellHooksSrc.includes('configureCategoryCustomizationRuntimeDeps({ buildSidebar, navigate });'));

assert('App shell injects category page actions without bridge or window fallbacks',
  !categoryPageViewSrc.includes("from './views-runtime-bridge.js'")
    && !categoryPageViewSrc.includes('appWindow.renameCategory')
    && categoryPageViewSrc.includes('categoryPageViewDeps.renameCategory?.(categoryKey);')
    && appShellHooksSrc.includes("import { configureCategoryPageViewDeps } from './category-page-view.js';")
    && appShellHooksSrc.includes('configureCategoryPageViewDeps({ renameCategory });'));

assert('App shell injects Lens page navigation without bridge or window fallbacks',
  !lensPageShellSrc.includes("from './views-runtime-bridge.js'")
    && lensPageShellSrc.includes("const fn = name === 'navigate'")
    && lensPageShellSrc.includes('? _shellDeps.navigate')
    && appShellHooksSrc.includes("import { configureLensPageShell } from './lens-page-shell.js';")
    && appShellHooksSrc.includes('configureLensPageShell({ navigate });'));

assert('App shell injects crypto cross-tab refresh callbacks without bridge lookups',
  appShellHooksSrc.includes('configureCryptoProfileDeps,')
    && appShellHooksSrc.includes("from './crypto.js';")
    && appShellHooksSrc.includes('configureCryptoProfileDeps({ buildSidebar, navigate });'));

assert('App shell injects Cycle view callbacks without bridge lookups',
  appShellHooksSrc.includes("import { configureCycleRuntimeDeps } from './cycle-runtime.js'")
    && appShellHooksSrc.includes("from './health-data-loader.js'")
    && appShellHooksSrc.includes('openMenstrualCycleEditor')
    && appShellHooksSrc.includes('openEditor: openMenstrualCycleEditor,'));

assert('App shell injects Apple Health cycle import callbacks',
  appShellHooksSrc.includes("import { parseAppleHealthCycleBlob, showCycleImportPreview } from './cycle-import-loader.js'")
    && appShellHooksSrc.includes("import { configureAppleHealthRuntimeDeps } from './wearables-apple-health-runtime.js'")
    && appShellHooksSrc.includes('parseCycleBlob: parseAppleHealthCycleBlob,')
    && appShellHooksSrc.includes('showCyclePreview: showCycleImportPreview,')
    && !appShellHooksSrc.includes("from './cycle-import.js'"));

assert('Cycle import implementation stays behind a retryable cold facade',
  cycleSrc.includes('clearCycleProfileData')
    && cycleSrc.includes('renderCycleImportPickerControls')
    && cycleSrc.includes('renderCycleImportSummarySection')
    && cycleSrc.includes("from './cycle-import-loader.js'")
    && !cycleSrc.includes("from './cycle-import.js'")
    && cycleImportLoaderSrc.includes("import('./cycle-import.js')")
    && cycleImportLoaderSrc.includes("import('./cycle-import.js?lazy-retry=1')")
    && cycleImportLoaderSrc.includes("document.addEventListener('click', handleDeferredCycleImportAction)")
    && cycleImportLoaderSrc.includes("document.addEventListener('change', handleDeferredCycleImportAction)"));

assert('App shell injects Supplements view callbacks without bridge lookups',
  appShellHooksSrc.includes("import { configureSupplementsRuntimeDeps } from './supplements-runtime.js'")
    && appShellHooksSrc.includes('configureSupplementsRuntimeDeps({ closeModal, navigate });'));

assert('App shell injects Notes view callbacks without bridge or window fallbacks',
  !notesRuntimeSrc.includes("from './views-runtime-bridge.js'")
    && !notesRuntimeSrc.includes('getViewRuntimeFunction')
    && !/\bwindow(?:\.|\s*\[)/.test(notesRuntimeSrc)
    && notesRuntimeSrc.includes('export function configureNotesRuntimeDeps(deps = {})')
    && appShellHooksSrc.includes("import { configureNotesRuntimeDeps } from './notes-runtime.js';")
    && appShellHooksSrc.includes('configureNotesRuntimeDeps({ closeModal, navigate, rememberModalTrigger });'));

assert('App shell defers sun defaults navigation wiring behind the Light loader',
  appShellHooksSrc.includes('configureLightSunShellLoaderDeps({')
    && lightSunLoaderSrc.includes('module.configureLightSunShell(_lightSunShellLoaderDeps)')
    && appLightSunSrc.includes('configureSunDefaultsRuntimeDeps({ navigate, openClientList, openProfileLocationEditor });'));

assert('App shell defers Sun session UI callbacks behind the Light loader',
  !appShellHooksSrc.includes("from './sun-runtime.js'")
    && appLightSunSrc.includes('configureSunRuntimeDeps({')
    && appLightSunSrc.includes('openChannelOnLightPage: _openChannelOnLightPage,')
    && appLightSunSrc.includes('renderLightChannelsLive,')
    && appLightSunSrc.includes('renderLightTodayStrip,'));

assert('App shell injects client list view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureClientListRuntimeDeps({ navigate, renderProfileButton });'));

assert('App shell injects DNA view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureDnaRuntimeDeps({ buildSidebar, navigate, openChatPanel });'));

assert('App shell injects export demo refresh callbacks without bridge lookups',
  !exportSrc.includes("from './views-runtime-bridge.js'")
    && exportSrc.includes('export function configureExportRuntimeDeps(deps = {})')
    && exportSrc.includes('exportRuntimeDeps.buildSidebar?.();')
    && exportSrc.includes("exportRuntimeDeps.navigate?.('biology-scores')")
    && exportLoaderSrc.includes("import('./export.js')")
    && exportLoaderSrc.includes('module.configureExportRuntimeDeps(exportFacadeLoaderDeps);')
    && appShellHooksSrc.includes("} from './export-loader.js';")
    && appShellHooksSrc.includes('configureExportFacadeLoaderDeps({ buildSidebar, navigate });')
    && !appShellHooksSrc.includes("from './export.js'"));

assert('App shell injects sync pull profile refresh without bridge lookups',
  !syncPullSrc.includes("from './views-runtime-bridge.js'")
    && syncPullSrc.includes("if (typeof renderProfileButton === 'function') _renderProfileButton = renderProfileButton;")
    && syncPullSrc.includes('_renderProfileButton();')
    && appShellHooksSrc.includes("import { configureSyncPull } from './sync-pull.js';")
    && appShellHooksSrc.includes('reconcilePulledManualWearables,')
    && appShellHooksSrc.includes('configureSyncPull({ renderProfileButton, reconcilePulledManualWearables });'));

assert('App shell injects PDF import review callbacks without a runtime back-import',
  appShellHooksSrc.includes("const confirmPdfImport = () => import('./pdf-import-commit.js')")
    && appShellHooksSrc.includes('configurePdfImportReviewRuntimeDeps({ buildSidebar, confirmImport: confirmPdfImport, navigate });'));

assert('App shell lazy-loads the PDF import review close handler',
  !appShellHooksSrc.includes("from './pdf-import-review.js'")
    && /const closeImportModal = \(\) => \{\s*import\('\.\/pdf-import-review\.js'\)/.test(appShellHooksSrc)
    && appShellHooksSrc.includes('closeImportModal,'));

assert('App shell injects views router callbacks without bridge lookups',
  appShellHooksSrc.includes('configureViewsRouterRuntimeDeps({ closeMobileSidebar, navigate });'));

assert('App shell injects dashboard widget view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureDashboardWidgetRuntimeDeps({ navigate, openChatPanel, showDetailModal });'));

assert('App shell injects dashboard recommendation actions without dynamic runtime fallbacks',
  !dashboardRecommendationWidgetSrc.includes("from './views-runtime-bridge.js'")
    && !dashboardRecommendationWidgetSrc.includes("from './settings-runtime-bridge.js'")
    && !dashboardRecommendationWidgetSrc.includes('globalThis')
    && dashboardRecommendationWidgetSrc.includes('dashboardRecommendationRuntimeDeps[name]?.(...args)')
    && appShellHooksSrc.includes("import { configureDashboardRecommendationRuntimeDeps } from './dashboard-recommendation-widget.js';")
    && appShellHooksSrc.includes('configureDashboardRecommendationRuntimeDeps({')
    && appShellHooksSrc.includes('detectWearableTrendSlots,')
    && appShellHooksSrc.includes('openRecommendationDetail,'));

assert('App shell defers Light Devices view callbacks behind the Light loader',
  !appShellHooksSrc.includes("from './light-devices-runtime.js'")
    && appLightSunSrc.includes('configureLightDevicesRuntimeDeps({')
    && appLightSunSrc.includes('openChannelOnLightPage: _openChannelOnLightPage,'));

assert('App shell injects marker detail shell callbacks without bridge lookups',
  appShellHooksSrc.includes('configureMarkerDetailRuntime({ askAIAboutMarker, buildSidebar, navigate, renameMarker, revertMarkerName });'));

assert('Chat shell controls use module dependencies instead of window lookups',
  ['closeChatPanel', 'clearChatHistory', 'handleChatKeydown', 'sendChatMessage', 'setChatPersonality',
    'setChatWebSearchEnabled', 'startDiscussion', 'summarizeThread', 'toggleChatFullscreen',
    'toggleChatPanel', 'togglePersonalityBar']
    .every(name => shellSrc.includes(`shellChatActionDeps.${name}`)
      && !shellSrc.includes(`callShellRuntime('${name}'`))
    && appShellHooksSrc.includes('configureShellChatActionDeps({'));

[
  'toggle-panel',
  'close-panel',
  'toggle-thread-rail',
  'create-thread',
  'create-project',
  'summarize-thread',
  'clear-history',
  'toggle-fullscreen',
  'toggle-personality',
  'set-personality',
  'attach-image',
  'import-health-file',
  'open-chat-context',
  'start-discussion',
  'send-message',
].forEach(action => {
  assert(`Chat action ${action} is rendered`, html.includes(`data-chat-action="${action}"`));
  assert(`Chat action ${action} is handled`, shellSrc.includes(`action === '${action}'`));
});

assert('Thread search uses delegated input/search action',
  html.includes('data-chat-input-action="filter-thread-list"')
    && shellSrc.includes("document.addEventListener('input', handleShellInput)")
    && shellSrc.includes("document.addEventListener('search', handleShellInput)")
    && shellSrc.includes('shellChatThreadDeps.filterThreadList(input.value)'));
assert('Web search toggle uses delegated change action',
  html.includes('data-chat-change-action="set-websearch"')
    && shellSrc.includes("document.addEventListener('change', handleShellChange)")
    && shellSrc.includes('shellChatActionDeps.setChatWebSearchEnabled(input.checked)'));
assert('Conversation sorting uses delegated change action',
  html.includes('data-chat-change-action="sort-thread-list"')
    && shellSrc.includes('shellChatThreadDeps.setChatThreadSort(input.value)'));
assert('Chat composer key handler is delegated',
  html.includes('data-chat-key-action="message-input"')
    && shellSrc.includes("document.addEventListener('keydown', handleShellKeydown)")
    && shellSrc.includes('shellChatActionDeps.handleChatKeydown(event)'));
assert('Click delegate only prevents default for handled actions',
  shellSrc.includes('const handled = shellAction')
    && shellSrc.includes('if (handled) event.preventDefault();')
    && shellSrc.includes('return false;')
    && !shellSrc.includes('event.preventDefault();\n  if (shellAction)'));
assert('Generic role-button key shim skips delegated chat key actions',
  appEventsSrc.includes("t.hasAttribute('data-chat-key-action')"));
assert('App shell hooks configure app-event-listeners without window lookups',
  appShellHooksSrc.includes("import { configureAppEventListeners } from './app-event-listeners.js';")
    && appShellHooksSrc.includes('configureAppEventListeners({')
    && !appShellHooksSrc.includes('window.'));
assert('App event listeners use configured shell deps instead of window globals',
  appEventsSrc.includes('appEventListenerDeps.navigate(state.currentView ||')
    && appEventsSrc.includes('appEventListenerDeps.toggleChatPanel()')
    && appEventsSrc.includes('appEventListenerDeps.closeModal()')
    && !appEventsSrc.includes('window.'));
assert('Sync setup Escape close catches async cleanup failures',
  appEventsSrc.includes('function runAppEventListener(label, action)')
    && appEventsSrc.includes(".catch((err) => reportAppEventListenerError(label, err))")
    && appEventsSrc.includes("['sync-setup-overlay', 'closeSyncSetup']")
    && appEventsSrc.includes('runAppEventListener(actionName, action)'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
