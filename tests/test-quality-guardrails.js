#!/usr/bin/env node
// test-quality-guardrails.js — pin dependency-free quality guardrails.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('=== Quality Guardrails Tests ===\n');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const guardrailSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'quality-guardrails.mjs'), 'utf8');
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'quality-baseline.json'), 'utf8'));
const runTestsSrc = fs.readFileSync(path.join(ROOT, 'run-tests.sh'), 'utf8');
const testWorkflowSrc = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
const checkJsConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.checkjs.json'), 'utf8'));
const appEventListenersSrc = fs.readFileSync(path.join(ROOT, 'js', 'app-event-listeners.js'), 'utf8');

assert('package.json exposes npm run quality',
  pkg.scripts?.quality === 'node scripts/quality-guardrails.mjs');
assert('quality guardrail syntax-checks JS/MJS files',
  guardrailSrc.includes("execFileSync(process.execPath, ['--check', file]"));
assert('quality guardrail tracks inline event attribute budget',
  guardrailSrc.includes('INLINE_EVENT_RE') && Object.hasOwn(baseline, 'inlineEventAttributes'));
assert('quality guardrail tracks window global coupling budget',
  guardrailSrc.includes('WINDOW_REF_RE') &&
    guardrailSrc.includes('window(?:\\.|\\s*\\[)') &&
    Object.hasOwn(baseline, 'windowReferences'));
const forbiddenAppEventWindowGlobals = [
  'closeModal',
  'toggleChatPanel',
  'closeChatPanel',
  'closeSettingsModal',
  'closeSummaryModal',
  'closeSyncSetup',
  'closeRestoreMnemonicDialog',
  'navigate',
  'updateChatNudge',
];
const appEventWindowGlobalHits = forbiddenAppEventWindowGlobals.filter(name => {
  const pattern = new RegExp(`\\bwindow\\s*(?:\\.\\s*${name}\\b|\\[\\s*['"]${name}['"]\\s*\\])`);
  return pattern.test(appEventListenersSrc);
});
assert('app-event-listeners uses configured deps instead of delegated shell window globals',
  appEventWindowGlobalHits.length === 0,
  appEventWindowGlobalHits.length ? `found: ${appEventWindowGlobalHits.join(', ')}` : '');
assert('quality guardrail tracks large-module budget',
  guardrailSrc.includes('LARGE_FILE_LINE_LIMIT') &&
    Object.hasOwn(baseline, 'largeJsFilesOver800Lines') &&
    Object.hasOwn(baseline, 'maxJsFileLines'));
assert('quality guardrail exits non-zero on failures',
  guardrailSrc.includes('process.exit(failed > 0 ? 1 : 0)'));
assert('full local test suite runs typecheck',
  runTestsSrc.includes('npm run typecheck || exit 1') &&
    runTestsSrc.includes('SKIP_TYPECHECK'));
assert('full local test suite runs static module verification',
  runTestsSrc.includes('node "$DIR/tests/verify-modules.js" || exit 1'));
assert('CI keeps a dedicated typecheck step and skips duplicate script typecheck',
  testWorkflowSrc.includes('name: Run typecheck') &&
    testWorkflowSrc.includes('run: npm run typecheck') &&
    testWorkflowSrc.includes('SKIP_TYPECHECK=1 ./run-tests.sh'));
assert('CI enforces quality guardrails',
  testWorkflowSrc.includes('name: Run quality guardrails') &&
    testWorkflowSrc.includes('run: npm run quality'));
const highValueCheckJsModules = [
  'js/api.js',
  'js/client-list-runtime.js',
  'js/client-list.js',
  'js/dashboard-widget-renderers.js',
  'js/dna.js',
  'js/dna-runtime.js',
  'js/export.js',
  'js/export-runtime.js',
  'js/lens.js',
  'js/light-devices-runtime.js',
  'js/light-tool-camera-modals.js',
  'js/pdf-import.js',
  'js/profile.js',
  'js/profile-runtime.js',
  'js/recommendations.js',
  'js/settings.js',
  'js/settings-runtime.js',
  'js/sun.js',
  'js/wearables.js',
];
const missingHighValueCheckJsModules = highValueCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes high-coupling browser modules',
  missingHighValueCheckJsModules.length === 0,
  missingHighValueCheckJsModules.length ? `missing: ${missingHighValueCheckJsModules.join(', ')}` : '');
const domainUiCheckJsModules = [
  'js/crypto.js',
  'js/data.js',
  'js/emf.js',
  'js/lab-context.js',
  'js/light-conditions-now.js',
  'js/light-env.js',
  'js/marker-detail-modal.js',
  'js/pdf-import-review.js',
  'js/provider-panels.js',
  'js/sun-context.js',
  'js/sun-defaults.js',
  'js/sun-spectrum.js',
  'js/sun-uvdata.js',
];
const missingDomainUiCheckJsModules = domainUiCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes domain and UI modules',
  missingDomainUiCheckJsModules.length === 0,
  missingDomainUiCheckJsModules.length ? `missing: ${missingDomainUiCheckJsModules.join(', ')}` : '');
const broadSurfaceCheckJsModules = [
  'js/app-light-sun-modules.js',
  'js/biology-score-engine.js',
  'js/biology-scores.js',
  'js/chat-onboarding.js',
  'js/chat-personalities.js',
  'js/chat-send.js',
  'js/chat-threads.js',
  'js/constants.js',
  'js/context-card-lifestyle-editors.js',
  'js/context-card-medical-history-editor.js',
  'js/context-cards.js',
  'js/export-report.js',
  'js/light-devices.js',
  'js/light-tools.js',
  'js/mobile-dashboard.js',
  'js/pii.js',
  'js/profile-share.js',
  'js/views.js',
  'js/wearables-connect.js',
  'js/wearables-detail-modal.js',
];
const missingBroadSurfaceCheckJsModules = broadSurfaceCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes broad UI surface modules',
  missingBroadSurfaceCheckJsModules.length === 0,
  missingBroadSurfaceCheckJsModules.length ? `missing: ${missingBroadSurfaceCheckJsModules.join(', ')}` : '');
const healthDomainCheckJsModules = [
  'js/biology-score-ai-context.js',
  'js/biology-score-ai.js',
  'js/biology-score-blood-flow.js',
  'js/biology-score-coherence.js',
  'js/biology-score-context-ai.js',
  'js/biology-score-copy.js',
  'js/biology-score-coverage-planner.js',
  'js/biology-score-iron.js',
  'js/biology-score-mappings.js',
  'js/biology-score-profile-modifiers.js',
  'js/biology-score-render.js',
  'js/biology-score-sections.js',
  'js/biology-score-thyroid.js',
  'js/biology-score-tier1-definitions.js',
  'js/biology-score-tier2-definitions.js',
  'js/sun-active-session.js',
  'js/sun-ai-analysis.js',
  'js/sun-body-silhouette.js',
  'js/sun-channel-metrics.js',
  'js/sun-context-hooks.js',
  'js/sun-correlations.js',
  'js/sun-onboarding-ai.js',
  'js/sun-session-actions.js',
  'js/sun-session-ai-render-hooks.js',
  'js/sun-session-model.js',
  'js/sun-session-ui-hooks.js',
  'js/sun-session-ui.js',
  'js/sun-sessions-store.js',
];
const missingHealthDomainCheckJsModules = healthDomainCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes health domain modules',
  missingHealthDomainCheckJsModules.length === 0,
  missingHealthDomainCheckJsModules.length ? `missing: ${missingHealthDomainCheckJsModules.join(', ')}` : '');
const uiWorkflowCheckJsModules = [
  'js/context-card-dashboard-ai-actions.js',
  'js/context-card-dashboard-ai.js',
  'js/context-card-editor-ui.js',
  'js/context-card-health-dots.js',
  'js/context-card-summaries.js',
  'js/dashboard-page-view.js',
  'js/dashboard-recommendation-widget.js',
  'js/dashboard-view-composition.js',
  'js/dashboard-widget-controls.js',
  'js/dashboard-widgets.js',
  'js/import-drop-zone.js',
  'js/import-file-input.js',
  'js/import-loader.js',
  'js/import-marker-map-modal.js',
  'js/import-review-draft.js',
  'js/import-review-row-actions.js',
  'js/lens-actions.js',
  'js/lens-cache.js',
  'js/lens-library.js',
  'js/lens-local-worker.js',
  'js/lens-local.js',
  'js/lens-page-shell.js',
  'js/lens-pages.js',
  'js/lens-url.js',
];
const missingUiWorkflowCheckJsModules = uiWorkflowCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes UI workflow modules',
  missingUiWorkflowCheckJsModules.length === 0,
  missingUiWorkflowCheckJsModules.length ? `missing: ${missingUiWorkflowCheckJsModules.join(', ')}` : '');
const lightWorkflowCheckJsModules = [
  'js/light-ai-save-hooks.js',
  'js/light-audit-ai-analysis.js',
  'js/light-burden-ai-analysis.js',
  'js/light-channel-view-hooks.js',
  'js/light-channel-view-ui-hooks.js',
  'js/light-channel-view.js',
  'js/light-channels-ai-analysis.js',
  'js/light-conditions-now-hooks.js',
  'js/light-device-ai-analysis.js',
  'js/light-device-session-engine.js',
  'js/light-device-session-modal.js',
  'js/light-device-setup-modal.js',
  'js/light-devices-store.js',
  'js/light-env-actions.js',
  'js/light-env-ai-analysis.js',
  'js/light-env-audits.js',
  'js/light-env-evening.js',
  'js/light-env-model.js',
  'js/light-env-screen-ui.js',
  'js/light-env-shell-hooks.js',
  'js/light-env-store.js',
  'js/light-page-view-hooks.js',
  'js/light-page-view-ui-hooks.js',
  'js/light-page-view.js',
  'js/light-screen-ai-analysis.js',
  'js/light-sessions-view-hooks.js',
  'js/light-sessions-view.js',
  'js/light-sun-ai-hooks.js',
  'js/light-today-ai.js',
  'js/light-tool-camera.js',
  'js/light-tools-ai-analysis.js',
  'js/light-tools-ui-hooks.js',
];
const missingLightWorkflowCheckJsModules = lightWorkflowCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes light workflow modules',
  missingLightWorkflowCheckJsModules.length === 0,
  missingLightWorkflowCheckJsModules.length ? `missing: ${missingLightWorkflowCheckJsModules.join(', ')}` : '');
const wearablesWorkflowCheckJsModules = [
  'js/wearable-adapters.js',
  'js/wearables-apple-health.js',
  'js/wearables-fitbit-auth.js',
  'js/wearables-fitbit.js',
  'js/wearables-formatters.js',
  'js/wearables-manual-form-ui.js',
  'js/wearables-manual.js',
  'js/wearables-oura-auth.js',
  'js/wearables-oura.js',
  'js/wearables-polar-auth.js',
  'js/wearables-polar.js',
  'js/wearables-settings-panel.js',
  'js/wearables-store.js',
  'js/wearables-summary.js',
  'js/wearables-ultrahuman-auth.js',
  'js/wearables-ultrahuman.js',
  'js/wearables-whoop-auth.js',
  'js/wearables-whoop.js',
  'js/wearables-withings-auth.js',
  'js/wearables-withings.js',
];
const missingWearablesWorkflowCheckJsModules = wearablesWorkflowCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes wearables workflow modules',
  missingWearablesWorkflowCheckJsModules.length === 0,
  missingWearablesWorkflowCheckJsModules.length ? `missing: ${missingWearablesWorkflowCheckJsModules.join(', ')}` : '');
const chatWorkflowCheckJsModules = [
  'js/chat-actions.js',
  'js/chat-attestation.js',
  'js/chat-continuation.js',
  'js/chat-discussion-callbacks.js',
  'js/chat-discussion-flow.js',
  'js/chat-discussion-lifecycle.js',
  'js/chat-discussion-picker.js',
  'js/chat-discussion-round-prompts.js',
  'js/chat-discussion-round-request.js',
  'js/chat-discussion-round-runner.js',
  'js/chat-discussion-round-state.js',
  'js/chat-discussion-round-view.js',
  'js/chat-discussion-state.js',
  'js/chat-discussion-turns.js',
  'js/chat-discussion-ui.js',
  'js/chat-discussion.js',
  'js/chat-empty-state.js',
  'js/chat-history.js',
  'js/chat-icons.js',
  'js/chat-images.js',
  'js/chat-marker-prompts.js',
  'js/chat-message-action-attrs.js',
  'js/chat-nudge.js',
  'js/chat-panel.js',
  'js/chat-prompt-context.js',
  'js/chat-render.js',
  'js/chat-summaries.js',
  'js/chat-thread-search.js',
  'js/chat-window-bindings.js',
  'js/chat.js',
];
const missingChatWorkflowCheckJsModules = chatWorkflowCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes chat workflow modules',
  missingChatWorkflowCheckJsModules.length === 0,
  missingChatWorkflowCheckJsModules.length ? `missing: ${missingChatWorkflowCheckJsModules.join(', ')}` : '');
const startupAppShellCheckJsModules = [
  'js/app-ai-interaction-modules.js',
  'js/app-data-io-modules.js',
  'js/app-event-listeners.js',
  'js/app-feature-modules.js',
  'js/app-foundation-modules.js',
  'js/app-health-data-modules.js',
  'js/app-shell-hooks.js',
  'js/app-ui-shell-modules.js',
  'js/main.js',
  'js/modal-lifecycle.js',
  'js/nav.js',
  'js/onboarding-view.js',
  'js/service-worker-update.js',
  'js/shell-actions.js',
  'js/startup-foundation.js',
  'js/startup-maintenance.js',
  'js/startup-oauth-callbacks.js',
  'js/startup-orchestrator.js',
  'js/startup-profile.js',
  'js/startup-ui.js',
  'js/theme.js',
  'js/tour.js',
  'js/views-router-runtime.js',
  'js/views-router.js',
];
const missingStartupAppShellCheckJsModules = startupAppShellCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes startup and app-shell modules',
  missingStartupAppShellCheckJsModules.length === 0,
  missingStartupAppShellCheckJsModules.length ? `missing: ${missingStartupAppShellCheckJsModules.join(', ')}` : '');
const pdfReportCheckJsModules = [
  'js/export-report-builder.js',
  'js/export-report-html.js',
  'js/pdf-import-ai-utils.js',
  'js/pdf-import-marker-mapping.js',
  'js/pdf-import-marker-normalization.js',
  'js/pdf-import-persistence.js',
  'js/pdf-import-preflight.js',
  'js/pdf-import-progress.js',
  'js/pdf-import-spreadsheet.js',
  'js/pdfjs-loader.js',
];
const missingPdfReportCheckJsModules = pdfReportCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes PDF import and report modules',
  missingPdfReportCheckJsModules.length === 0,
  missingPdfReportCheckJsModules.length ? `missing: ${missingPdfReportCheckJsModules.join(', ')}` : '');
const appJsModules = fs.readdirSync(path.join(ROOT, 'js'))
  .filter(file => file.endsWith('.js'))
  .map(file => `js/${file}`)
  .sort();
const missingAppCheckJsModules = appJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs pilot includes every app JS module',
  missingAppCheckJsModules.length === 0,
  missingAppCheckJsModules.length ? `missing: ${missingAppCheckJsModules.join(', ')}` : '');

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
