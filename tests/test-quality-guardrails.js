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
assert('quality guardrail tracks large-module budget',
  guardrailSrc.includes('LARGE_FILE_LINE_LIMIT') &&
    Object.hasOwn(baseline, 'largeJsFilesOver800Lines') &&
    Object.hasOwn(baseline, 'maxJsFileLines'));
assert('quality guardrail exits non-zero on failures',
  guardrailSrc.includes('process.exit(failed > 0 ? 1 : 0)'));
assert('full local test suite runs typecheck',
  runTestsSrc.includes('npm run typecheck || exit 1') &&
    runTestsSrc.includes('SKIP_TYPECHECK'));
assert('CI keeps a dedicated typecheck step and skips duplicate script typecheck',
  testWorkflowSrc.includes('name: Run typecheck') &&
    testWorkflowSrc.includes('run: npm run typecheck') &&
    testWorkflowSrc.includes('SKIP_TYPECHECK=1 ./run-tests.sh'));
const highValueCheckJsModules = [
  'js/api.js',
  'js/client-list.js',
  'js/dashboard-widget-renderers.js',
  'js/dna.js',
  'js/export.js',
  'js/lens.js',
  'js/light-tool-camera-modals.js',
  'js/pdf-import.js',
  'js/profile.js',
  'js/recommendations.js',
  'js/settings.js',
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

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
