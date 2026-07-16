#!/usr/bin/env node
// Static shell delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appEventsSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const shellSrc = fs.readFileSync(path.join(root, 'js/shell-actions.js'), 'utf8');

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
  'open-ai-settings',
  'open-feedback',
].forEach(action => {
  assert(`Shell action ${action} is rendered`, html.includes(`data-shell-action="${action}"`));
  assert(`Shell action ${action} is handled`, shellSrc.includes(`action === '${action}'`));
});

assert('Shell action import-status is handled for compatibility but not rendered as a floating button',
  shellSrc.includes("action === 'import-status'")
    && !html.includes('data-shell-action="import-status"'));

assert('Feedback shell action uses its module dependency instead of a window lookup',
  shellSrc.includes("import { openFeedbackModal } from './feedback.js'")
    && shellSrc.includes('shellFeedbackDeps.openFeedbackModal()')
    && !shellSrc.includes("callShellRuntime('openFeedbackModal')"));

assert('Chat HD shell action uses its module dependency instead of a window lookup',
  shellSrc.includes('shellChatImageDeps.toggleHDMode()')
    && !shellSrc.includes("callShellRuntime('toggleHDMode')"));

assert('App shell wires module-only chat image consumers',
  appShellHooksSrc.includes("from './chat-images.js'")
    && appShellHooksSrc.includes('configureChatMessageActionDeps({')
    && appShellHooksSrc.includes('openImageLightbox,')
    && appShellHooksSrc.includes('removeImageAttachment,')
    && appShellHooksSrc.includes('configureShellChatImageDeps({ toggleHDMode });')
    && appShellHooksSrc.includes('configureStartupUIDeps({ initChatImageHandlers, openChatPanel, updateAttachButtonVisibility });'));

assert('App shell wires module-only chat message actions',
  ['closeSummaryModal', 'continueDiscussion', 'copySummary', 'deleteSavedSummary',
    'downloadSummary', 'endDiscussion', 'jumpToSearchResult', 'printSummary',
    'startDiscussionFromPicker', 'viewSavedSummary']
    .every(name => appShellHooksSrc.includes(`${name},`)));

assert('Chat thread shell actions use module dependencies instead of window lookups',
  shellSrc.includes('shellChatThreadDeps.toggleThreadRail()')
    && shellSrc.includes('shellChatThreadDeps.createNewThread()')
    && shellSrc.includes('shellChatThreadDeps.filterThreadList(input.value)')
    && !shellSrc.includes("callShellRuntime('toggleThreadRail')")
    && !shellSrc.includes("callShellRuntime('createNewThread')")
    && !shellSrc.includes("callShellRuntime('filterThreadList'"));

assert('App shell wires module-only chat thread consumers',
  appShellHooksSrc.includes("from './chat-threads.js'")
    && appShellHooksSrc.includes('configureShellChatThreadDeps({ createNewThread, filterThreadList, toggleThreadRail });')
    && appShellHooksSrc.includes('configureOnboardingViewRuntimeDeps({ buildSidebar, createNewThread, navigate, openChatPanel, toggleChatPanel });')
    && appShellHooksSrc.includes('configureSyncPullActiveRefreshDeps({ buildSidebar, ensureActiveThread, loadChatHistory, loadChatThreads, navigate, renderThreadList });'));

assert('App shell wires Context hub status refresh without a window lookup',
  appShellHooksSrc.includes("import { configureDashboardAIContextStatus } from './context-card-dashboard-ai-runtime.js'")
    && appShellHooksSrc.includes("from './chat-personalities.js'")
    && appShellHooksSrc.includes('updateChatContextStatus')
    && appShellHooksSrc.includes('configureDashboardAIContextStatus(updateChatContextStatus);'));

assert('App shell wires Chat UI refreshes without window globals',
  appShellHooksSrc.includes("import { configureChatRuntimeCallbacks } from './chat-runtime.js'")
    && appShellHooksSrc.includes('configureChatRuntimeCallbacks({')
    && appShellHooksSrc.includes('refreshWebSearchToggle,')
    && appShellHooksSrc.includes('resumeAI,')
    && appShellHooksSrc.includes('sendChatMessage,'));

assert('App shell wires Chat prompt consumers without window globals',
  appShellHooksSrc.includes("import { configureBiologyScoresRuntimeDeps } from './biology-scores-runtime.js'")
    && appShellHooksSrc.includes("import { configureContextCardLifestyleRuntimeDeps } from './context-card-lifestyle-runtime.js'")
    && appShellHooksSrc.includes('configureBiologyScoresRuntimeDeps({ navigate, openChatPanel, showDetailModal, useChatPrompt });')
    && appShellHooksSrc.includes('configureContextCardLifestyleRuntimeDeps({ closeModal, navigate, openChatPanel, useChatPrompt });'));

assert('App shell wires Chat close consumers without window globals',
  appShellHooksSrc.includes("import { configureChatEmptyStateDeps } from './chat-empty-state.js'")
    && appShellHooksSrc.includes("import { configureDashboardPageRuntimeDeps } from './dashboard-page-view.js'")
    && appShellHooksSrc.includes('configureChatEmptyStateDeps({ closeChatPanel });')
    && appShellHooksSrc.includes('configureDashboardPageRuntimeDeps({ closeChatPanel, openChatPanel });'));

assert('App shell wires remaining Chat open consumers without window globals',
  appShellHooksSrc.includes('configureEMFInterpretationRuntimeDeps({ openChatPanel });')
    && appShellHooksSrc.includes('configureRecommendationsRuntime({ openChatPanel, openProfileLocationEditor });')
    && appShellHooksSrc.includes('configureTourRuntimeDeps({ openChatPanel });'));

assert('App shell injects wearable navigation without view bridge lookups',
  appShellHooksSrc.includes('configureWearablesConnectRuntimeDeps({ navigate });')
    && appShellHooksSrc.includes('configureWearableSettingsRuntimeDeps({ navigate });'));

assert('App shell injects category customization view callbacks',
  appShellHooksSrc.includes('configureCategoryCustomizationRuntimeDeps({ buildSidebar, navigate });'));

assert('App shell injects sun defaults navigation without a view bridge lookup',
  appShellHooksSrc.includes('configureSunDefaultsRuntimeDeps({ navigate, openClientList, openProfileLocationEditor });'));

assert('App shell injects client list view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureClientListRuntimeDeps({ navigate, renderProfileButton });'));

assert('App shell injects DNA view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureDnaRuntimeDeps({ buildSidebar, navigate });'));

assert('App shell injects PDF import review view callbacks without bridge lookups',
  appShellHooksSrc.includes('configurePdfImportReviewRuntimeDeps({ buildSidebar, navigate });'));

assert('App shell injects views router callbacks without bridge lookups',
  appShellHooksSrc.includes('configureViewsRouterRuntimeDeps({ closeMobileSidebar, navigate });'));

assert('App shell injects dashboard widget view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureDashboardWidgetRuntimeDeps({ navigate, showDetailModal });'));

assert('App shell injects Light Devices view callbacks without bridge lookups',
  appShellHooksSrc.includes('configureLightDevicesRuntimeDeps({ navigate, openChannelOnLightPage: _openChannelOnLightPage });'));

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
  'summarize-thread',
  'clear-history',
  'toggle-fullscreen',
  'toggle-personality',
  'set-personality',
  'attach-image',
  'toggle-hd',
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
assert('Chat key handlers are delegated',
  html.includes('data-chat-key-action="message-input"')
    && html.includes('data-chat-key-action="toggle-personality"')
    && shellSrc.includes("document.addEventListener('keydown', handleShellKeydown)")
    && shellSrc.includes('shellChatActionDeps.handleChatKeydown(event)')
    && shellSrc.includes('shellChatActionDeps.togglePersonalityBar()'));
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
    && appEventsSrc.includes("runAppEventListener('closeSyncSetup', appEventListenerDeps.closeSyncSetup)"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
