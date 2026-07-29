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
const architectureSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'architecture-map.mjs'), 'utf8');
const architectureRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'architecture-rules.json'), 'utf8'));
const architectureBaseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'architecture-cycle-baseline.json'), 'utf8'));
const architectureDoc = fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');
const moduleMap = fs.readFileSync(path.join(ROOT, 'MODULE_MAP.md'), 'utf8');
const runTestsSrc = fs.readFileSync(path.join(ROOT, 'run-tests.sh'), 'utf8');
const playwrightConfigSrc = fs.readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
const testWorkflowSrc = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
function collectYamlFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectYamlFiles(full));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) files.push(full);
  }
  return files;
}
const workflowFiles = collectYamlFiles(path.join(ROOT, '.github'));
const tsConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8'));
const checkJsConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.checkjs.json'), 'utf8'));
const serverCheckJsConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.server.json'), 'utf8'));
const serviceWorkerCheckJsConfig = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tsconfig.service-worker.json'), 'utf8'),
);
const strictNullRatchetSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'strict-null-ratchet.mjs'), 'utf8');
const strictNullBaseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'strict-null-baseline.json'), 'utf8'));
const appEventListenersSrc = fs.readFileSync(path.join(ROOT, 'js', 'app-event-listeners.js'), 'utf8');

assert('package.json exposes npm run quality',
  pkg.scripts?.quality === 'node scripts/quality-guardrails.mjs');
assert('package.json exposes architecture build and check commands',
  pkg.scripts?.['architecture:build'] === 'node scripts/architecture-map.mjs --write' &&
    pkg.scripts?.['architecture:check'] === 'node scripts/architecture-map.mjs --check');
assert('architecture tooling parses ESM with TypeScript and enforces cycle growth',
  architectureSrc.includes("from 'typescript'") &&
    architectureSrc.includes('stronglyConnectedComponents') &&
    architectureSrc.includes('new modules entered dependency cycles') &&
    architectureSrc.includes('new computed dynamic import cannot be checked statically'));
assert('architecture source groups preserve browser/server separation',
  architectureRules.groups?.find(group => group.name === 'browser')?.mayImport?.join(',') === 'browser' &&
    architectureRules.groups?.find(group => group.name === 'serverless')?.mayImport?.includes('server-shared') &&
    architectureRules.groups?.find(group => group.name === 'server-shared')?.mayImport?.join(',') === 'server-shared' &&
    architectureRules.groups?.find(group => group.name === 'local-server')?.mayImport?.join(',') === 'server-shared' &&
    architectureRules.groups?.find(group => group.name === 'service-worker')?.mayImport?.join(',') === 'service-worker' &&
    architectureRules.entryPoints?.includes('dev-server.js') &&
    architectureRules.entryPoints?.includes('service-worker.js') &&
    architectureRules.forbiddenRepositoryImportRoots?.includes('tests') &&
    architectureRules.forbiddenRepositoryImportRoots?.includes('scripts'));
assert('architecture cycle baseline records existing debt without admitting new modules',
  architectureBaseline.maxCyclicModules >= 0 &&
    Array.isArray(architectureBaseline.allowedCyclicModules) &&
    Array.isArray(architectureBaseline.allowedComputedDynamicImports));
assert('architecture contract and generated module map are present',
  architectureDoc.includes('## Update contract') &&
    architectureDoc.includes('## Target dependency direction inside `js/`') &&
    moduleMap.includes('Generated by `npm run architecture:build`'));
assert('quality guardrail syntax-checks JS/MJS files',
  guardrailSrc.includes("execFileSync(process.execPath, ['--check', file]") &&
    guardrailSrc.includes("const SYNTAX_DIRS = ['js', 'api', 'lib', 'scripts']"));
assert('quality guardrail tracks inline event attribute budget',
  guardrailSrc.includes('INLINE_EVENT_RE') && Object.hasOwn(baseline, 'inlineEventAttributes'));
assert('quality guardrail tracks window global coupling budget',
  guardrailSrc.includes('WINDOW_REF_RE') &&
    guardrailSrc.includes('window(?:\\.|\\s*\\[)') &&
    Object.hasOwn(baseline, 'windowReferences') &&
    baseline.windowReferences === 0);
assert('quality guardrail tracks window facade assignment budget',
  guardrailSrc.includes('WINDOW_GLOBAL_ASSIGN_RE') &&
    guardrailSrc.includes('Object\\.assign\\(\\s*window') &&
    guardrailSrc.includes('legacyWindowGlobalAssignments') &&
    Object.hasOwn(baseline, 'windowGlobalAssignments') &&
    baseline.windowGlobalAssignments === 0 &&
    Object.hasOwn(baseline, 'legacyWindowGlobalAssignments') &&
    baseline.legacyWindowGlobalAssignments === 0);
assert('quality guardrail ratchets view runtime bridge coupling',
  guardrailSrc.includes('VIEW_RUNTIME_LOOKUP_RE') &&
    guardrailSrc.includes('viewRuntimeBridgeConsumers') &&
    guardrailSrc.includes('viewRuntimeBridgeLookups') &&
    baseline.viewRuntimeBridgeConsumers === 0 &&
    baseline.viewRuntimeBridgeLookups === 0);
assert('quality guardrail ratchets _labState retirement by file',
  guardrailSrc.includes('LAB_STATE_RE') &&
    guardrailSrc.includes('labStateAppFiles') &&
    guardrailSrc.includes('labStateTestFiles') &&
    baseline.labStateAppFiles === 0 &&
    baseline.labStateTestFiles === 0);
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
    guardrailSrc.includes('SERVER_JS_DIRS') &&
    guardrailSrc.includes('ROOT_PRODUCTION_JS_FILES') &&
    guardrailSrc.includes('all first-party production JS files stay below 800 lines') &&
    Object.hasOwn(baseline, 'largeJsFilesOver800Lines') &&
    Object.hasOwn(baseline, 'maxJsFileLines'));
assert('quality guardrail blocks direct console logging in privacy-critical workflows',
  guardrailSrc.includes('PRIVACY_CRITICAL_LOG_FILES') &&
    guardrailSrc.includes('CONSOLE_REFERENCE_RE') &&
    guardrailSrc.includes('privacy-critical workflows avoid direct console logging') &&
    guardrailSrc.includes("'js/pdf-import.js'") &&
    guardrailSrc.includes("'js/pdf-import-file-handlers.js'") &&
    guardrailSrc.includes("'js/pii.js'") &&
    guardrailSrc.includes("'js/pii-review.js'") &&
    guardrailSrc.includes("'js/sync-diagnostics-snapshot.js'"));
assert('quality guardrail blocks recovery-phrase fragments in support diagnostics',
  guardrailSrc.includes('SYNC_DIAGNOSTIC_FILES') &&
    guardrailSrc.includes('RECOVERY_PHRASE_FRAGMENT_RE') &&
    guardrailSrc.includes('support diagnostics never expose recovery-phrase fragments') &&
    guardrailSrc.includes("'js/sync-diagnostics-text.js'") &&
    guardrailSrc.includes("'js/sync-diagnose-render.js'"));
assert('quality guardrail blocks free-form sync errors in support diagnostics',
  guardrailSrc.includes('UNBOUNDED_SYNC_DIAGNOSTIC_ERROR_RE') &&
    guardrailSrc.includes('support diagnostics use bounded sync-error status'));
const mutableWorkflowActions = [];
for (const file of workflowFiles) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const uses = line.match(/^\s*(?:-\s*)?uses:\s*["']?([^"'#\s]+)["']?/)?.[1] || '';
    if (!uses || uses.startsWith('./')) return;
    const ref = uses.slice(uses.lastIndexOf('@') + 1);
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      mutableWorkflowActions.push(`${path.basename(file)}:${index + 1} ${uses}`);
    }
  });
}
assert('all third-party GitHub Actions are pinned to immutable commit SHAs',
  guardrailSrc.includes('collectMutableWorkflowActionRefs') &&
    guardrailSrc.includes('third-party GitHub Actions use immutable commit SHAs') &&
    mutableWorkflowActions.length === 0,
  mutableWorkflowActions.join(', '));
assert('quality guardrail exits non-zero on failures',
  guardrailSrc.includes('process.exit(failed > 0 ? 1 : 0)'));
assert('full local test suite runs typecheck',
  runTestsSrc.includes('npm run typecheck || exit 1') &&
    runTestsSrc.includes('npm run typecheck:checkjs || exit 1') &&
    runTestsSrc.includes('npm run typecheck:server || exit 1') &&
    runTestsSrc.includes('npm run typecheck:service-worker || exit 1') &&
    runTestsSrc.includes('npm run typecheck:strict-null || exit 1') &&
    runTestsSrc.includes('SKIP_TYPECHECK'));
assert('server checkJs covers every production API, shared server module, and the dev entry point',
  pkg.scripts?.['typecheck:server'] === 'tsc -p tsconfig.server.json' &&
    serverCheckJsConfig.compilerOptions?.checkJs === true &&
    serverCheckJsConfig.include?.includes('api/**/*.js') &&
    serverCheckJsConfig.include?.includes('lib/**/*.js') &&
    serverCheckJsConfig.include?.includes('dev-server.js'));
assert('service-worker checkJs uses WebWorker types and covers both classic scripts',
  pkg.scripts?.['typecheck:service-worker'] === 'tsc -p tsconfig.service-worker.json' &&
    serviceWorkerCheckJsConfig.compilerOptions?.checkJs === true &&
    serviceWorkerCheckJsConfig.compilerOptions?.lib?.includes('WebWorker') &&
    serviceWorkerCheckJsConfig.include?.includes('service-worker.js') &&
    serviceWorkerCheckJsConfig.include?.includes('service-worker-runtime.js'));
assert('strict-null debt is ratcheted globally and per file',
  pkg.scripts?.['typecheck:strict-null'] === 'node scripts/strict-null-ratchet.mjs' &&
    strictNullRatchetSrc.includes('strictNullChecks: true') &&
    strictNullRatchetSrc.includes('findRegressions') &&
    strictNullBaseline.totalDiagnostics === Object.values(strictNullBaseline.files)
      .reduce((sum, count) => sum + count, 0));
const requiredCompilerSafetyOptions = {
  allowUnreachableCode: false,
  allowUnusedLabels: false,
  forceConsistentCasingInFileNames: true,
  isolatedModules: true,
  noFallthroughCasesInSwitch: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noImplicitThis: true,
  noUncheckedSideEffectImports: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  strictBindCallApply: true,
  strictBuiltinIteratorReturn: true,
  strictFunctionTypes: true,
  useUnknownInCatchVariables: true,
};
const missingCompilerSafetyOptions = Object.entries(requiredCompilerSafetyOptions)
  .filter(([option, expected]) => tsConfig.compilerOptions?.[option] !== expected)
  .map(([option]) => option);
assert('TypeScript keeps incremental compiler safety checks enabled',
  missingCompilerSafetyOptions.length === 0,
  missingCompilerSafetyOptions.length
    ? `missing or disabled: ${missingCompilerSafetyOptions.join(', ')}`
    : '');
assert('full local test suite runs static module verification',
  runTestsSrc.includes('node "$DIR/tests/verify-modules.js" || exit 1'));
assert('full local test suite verifies architecture freshness and boundaries',
  runTestsSrc.includes('npm run architecture:check || exit 1'));
assert('full local test suite isolates itself from an occupied default port',
  runTestsSrc.includes('REUSE_TEST_SERVER=${REUSE_TEST_SERVER:-0}') &&
    runTestsSrc.includes('Port :$REQUESTED_PORT is already serving; using isolated test port :$PORT') &&
    runTestsSrc.includes('PLAYWRIGHT_REUSE_SERVER=1'));
assert('direct Playwright runs do not silently reuse an unrelated server',
  playwrightConfigSrc.includes("process.env.PLAYWRIGHT_REUSE_SERVER === '1'") &&
    playwrightConfigSrc.includes('reuseExistingServer,'));
assert('CI keeps dedicated typecheck steps and skips duplicate script typecheck',
  testWorkflowSrc.includes('name: Run typecheck') &&
    testWorkflowSrc.includes('run: npm run typecheck') &&
    testWorkflowSrc.includes('name: Run server checkJs') &&
    testWorkflowSrc.includes('run: npm run typecheck:server') &&
    testWorkflowSrc.includes('name: Run service-worker checkJs') &&
    testWorkflowSrc.includes('run: npm run typecheck:service-worker') &&
    testWorkflowSrc.includes('name: Enforce strict-null debt ratchet') &&
    testWorkflowSrc.includes('run: npm run typecheck:strict-null') &&
    testWorkflowSrc.includes('SKIP_TYPECHECK=1 ./run-tests.sh'));
assert('CI enforces quality guardrails',
  testWorkflowSrc.includes('name: Run quality guardrails') &&
    testWorkflowSrc.includes('run: npm run quality'));
assert('CI verifies architecture map and boundaries',
  testWorkflowSrc.includes('name: Verify architecture map and boundaries') &&
    testWorkflowSrc.includes('run: npm run architecture:check'));
const highValueCheckJsModules = [
  'js/api.js',
  'js/api-custom.js',
  'js/api-local.js',
  'js/local-ai-provider-shared.js',
  'js/local-ai-provider-openai-compatible.js',
  'js/local-ai-provider-lmstudio.js',
  'js/local-ai-provider-ollama.js',
  'js/local-ai-provider-registry.js',
  'js/api-openai-compatible.js',
  'js/api-openrouter-oauth.js',
  'js/api-openrouter.js',
  'js/api-ppq.js',
  'js/api-routstr.js',
  'js/api-venice.js',
  'js/client-list-runtime.js',
  'js/client-list.js',
  'js/client-list-impl.js',
  'js/client-list-form.js',
  'js/dashboard-lab-widget-renderers.js',
  'js/dashboard-widget-renderers.js',
  'js/dna.js',
  'js/dna-ui.js',
  'js/dna-runtime.js',
  'js/export-import.js',
  'js/export.js',
  'js/export-runtime.js',
  'js/lens.js',
  'js/lens-knowledge-base-ui.js',
  'js/light-devices-runtime.js',
  'js/light-tool-camera-modal-runtime.js',
  'js/light-tool-camera-modals.js',
  'js/light-tool-cct-meter.js',
  'js/light-tool-darkness-meter.js',
  'js/light-tool-flicker-detector.js',
  'js/light-tool-glass-transmission.js',
  'js/light-tool-lux-meter.js',
  'js/light-tool-spectrum-classifier.js',
  'js/marker-detail-content.js',
  'js/marker-detail-custom-markers.js',
  'js/marker-detail-manual-entry.js',
  'js/pdf-import-commit.js',
  'js/pdf-import-file-handlers.js',
  'js/pdf-import.js',
  'js/profile-data-migrations.js',
  'js/profile.js',
  'js/profile-runtime.js',
  'js/recommendations-products.js',
  'js/recommendations.js',
  'js/settings.js',
  'js/settings-runtime.js',
  'js/settings-sync-panel.js',
  'js/settings-sync-panel-impl.js',
  'js/sun.js',
  'js/sun-location.js',
  'js/sun-uvdata-config.js',
  'js/wearables.js',
  'js/wearables-strip-actions.js',
];
const missingHighValueCheckJsModules = highValueCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs includes high-coupling browser modules',
  missingHighValueCheckJsModules.length === 0,
  missingHighValueCheckJsModules.length ? `missing: ${missingHighValueCheckJsModules.join(', ')}` : '');
const domainUiCheckJsModules = [
  'js/crypto.js',
  'js/crypto-ui.js',
  'js/data-merge-lab-entries.js',
  'js/data.js',
  'js/data-view-controls.js',
  'js/emf.js',
  'js/emf-editor.js',
  'js/emf-model.js',
  'js/lab-context.js',
  'js/lab-context-output.js',
  'js/lab-context-settings.js',
  'js/light-conditions-interpretation.js',
  'js/light-conditions-renderer.js',
  'js/light-conditions-now.js',
  'js/light-env.js',
  'js/light-env-editor.js',
  'js/marker-detail-modal.js',
  'js/marker-detail-runtime.js',
  'js/pdf-import-review.js',
  'js/provider-panels.js',
  'js/sun-context.js',
  'js/sun-context-environment.js',
  'js/sun-context-runtime.js',
  'js/sun-context-session-tools.js',
  'js/sun-defaults.js',
  'js/sun-defaults-model.js',
  'js/sun-defaults-runtime.js',
  'js/sun-defaults-setup-renderer.js',
  'js/sun-defaults-setup-ui.js',
  'js/sun-location.js',
  'js/sun-runtime.js',
  'js/sun-spectrum-actions.js',
  'js/sun-spectrum-device.js',
  'js/sun-spectrum.js',
  'js/sun-uvdata-atmosphere.js',
  'js/sun-uvdata.js',
];
const missingDomainUiCheckJsModules = domainUiCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs includes domain and UI modules',
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
  'js/context-card-lifestyle-editors-impl.js',
  'js/context-card-medical-history-editor.js',
  'js/context-card-medical-history-editor-impl.js',
  'js/context-cards.js',
  'js/export-report.js',
  'js/light-devices.js',
  'js/light-tools.js',
  'js/mobile-dashboard.js',
  'js/mobile-dashboard-runtime.js',
  'js/pii-review.js',
  'js/pii.js',
  'js/profile-share.js',
  'js/views.js',
  'js/wearables-connect.js',
  'js/wearables-detail-modal.js',
];
const missingBroadSurfaceCheckJsModules = broadSurfaceCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs includes broad UI surface modules',
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
assert('checkJs includes health domain modules',
  missingHealthDomainCheckJsModules.length === 0,
  missingHealthDomainCheckJsModules.length ? `missing: ${missingHealthDomainCheckJsModules.join(', ')}` : '');
const uiWorkflowCheckJsModules = [
  'js/changelog.js',
  'js/changelog-impl.js',
  'js/context-card-dashboard-ai-actions.js',
  'js/context-card-dashboard-ai.js',
  'js/context-card-dashboard-ai-impl.js',
  'js/context-card-editor-ui.js',
  'js/context-card-health-dots.js',
  'js/context-card-summaries.js',
  'js/dashboard-page-view.js',
  'js/dashboard-recommendation-widget.js',
  'js/dashboard-view-composition.js',
  'js/dashboard-widget-controls.js',
  'js/dashboard-widgets.js',
  'js/import-drop-zone.js',
  'js/import-drop-zone-runtime.js',
  'js/import-file-input.js',
  'js/import-loader.js',
  'js/import-marker-map-modal.js',
  'js/import-review-draft.js',
  'js/import-review-row-actions.js',
  'js/lens-actions.js',
  'js/lens-cache.js',
  'js/lens-library.js',
  'js/lens-local-embedder-config.js',
  'js/lens-local-library-registry.js',
  'js/lens-local-store.js',
  'js/lens-local-worker.js',
  'js/lens-local.js',
  'js/lens-page-shell.js',
  'js/lens-pages.js',
  'js/lens-url.js',
];
const missingUiWorkflowCheckJsModules = uiWorkflowCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs includes UI workflow modules',
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
  'js/light-env-editor.js',
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
assert('checkJs includes light workflow modules',
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
  'js/wearables-runtime.js',
  'js/wearables-settings-runtime.js',
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
assert('checkJs includes wearables workflow modules',
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
  'js/chat-render-runtime.js',
  'js/chat-send-runtime.js',
  'js/chat-summaries.js',
  'js/chat-thread-search.js',
  'js/chat-window-bindings.js',
  'js/chat.js',
];
const missingChatWorkflowCheckJsModules = chatWorkflowCheckJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs includes chat workflow modules',
  missingChatWorkflowCheckJsModules.length === 0,
  missingChatWorkflowCheckJsModules.length ? `missing: ${missingChatWorkflowCheckJsModules.join(', ')}` : '');
const startupAppShellCheckJsModules = [
  'js/app-chat-hooks.js',
  'js/app-ai-interaction-modules.js',
  'js/profile-share-loader.js',
  'js/app-event-listeners.js',
  'js/app-feature-modules.js',
  'js/app-foundation-modules.js',
  'js/app-health-data-modules.js',
  'js/health-data-loader.js',
  'js/app-shell-hooks.js',
  'js/app-ui-shell-modules.js',
  'js/chat-loader.js',
  'js/dna-file-detection.js',
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
assert('checkJs includes startup and app-shell modules',
  missingStartupAppShellCheckJsModules.length === 0,
  missingStartupAppShellCheckJsModules.length ? `missing: ${missingStartupAppShellCheckJsModules.join(', ')}` : '');
const pdfReportCheckJsModules = [
  'js/export-report-builder.js',
  'js/export-report-html.js',
  'js/pdf-import-ai-utils.js',
  'js/pdf-import-commit.js',
  'js/pdf-import-file-utils.js',
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
assert('checkJs includes PDF import and report modules',
  missingPdfReportCheckJsModules.length === 0,
  missingPdfReportCheckJsModules.length ? `missing: ${missingPdfReportCheckJsModules.join(', ')}` : '');
const appJsModules = fs.readdirSync(path.join(ROOT, 'js'))
  .filter(file => file.endsWith('.js'))
  .map(file => `js/${file}`)
  .sort();
const missingAppCheckJsModules = appJsModules
  .filter(file => !checkJsConfig.include?.includes(file));
assert('checkJs includes every app JS module',
  missingAppCheckJsModules.length === 0,
  missingAppCheckJsModules.length ? `missing: ${missingAppCheckJsModules.join(', ')}` : '');

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
