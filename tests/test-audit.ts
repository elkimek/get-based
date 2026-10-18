#!/usr/bin/env node
import { sourceFunctionHasInitializer } from './helpers/native-source-contracts.js';
import { deviceLibraryClasses } from '../js/light-device-library-classes.js';
import { deviceSetupClasses } from '../js/light-device-setup-classes.js';
import { dataModuleSource } from './helpers/data-module-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-audit.ts — Pre-release audit fixes. Source-inspection across data.js,
// views.js, chat.js, markdown.js, utils.js, schema.js, api.js, export.js,
// pdf-import.js, nav.js, main.js, cycle.js, context-cards.js, charts.js,
// lab-context.js, chat-system-prompt.js, CSS bundle, index.html, vercel.json,
// service-worker.js — plus the innerHTML sanitizer sweep.
//
// Run: node tests/test-audit.ts  (or via npm test)
//
// The section-3b *functional* block (proving safeMarkerId guards no-op on
// adversarial input at runtime) needs a live DOM + populated state — it
// lives in tests/playwright/audit-dom.spec.js on the Playwright runner. The section-3b
// *source-inspection* asserts (guard wiring present) stay here.

import './_node-shim.js';
import { auditMigrationWitnesses } from './helpers/audit-migration-contracts.js';
import { walkSourceFiles } from '../scripts/source-files.js';
import { auditDomSinks } from '../scripts/dom-sink-audit.mjs';
import { parse as parseSvelte } from 'svelte/compiler';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
const CSS_FILES = ['styles.css', 'css/app-shell.css', 'css/import.css', 'css/emf.css', 'css/modal-shared.css', 'css/dashboard-core.css', 'css/dashboard-widgets.css', 'css/dashboard-welcome.css', 'css/dashboard-data.css', 'css/category-views.css', 'css/context-profile.css', 'css/context-editor.css', 'css/genetics.css', 'css/data-protection.css', 'css/settings.css', 'css/mobile-dashboard.css', 'css/cycle.css', 'css/marker-detail-modal.css', 'css/recommendations.css', 'css/client-list.css', 'css/wearables.css', 'css/light-sun.css', 'css/light-channels.css', 'css/light-devices.css', 'css/light-conditions-now.css', 'css/light-setup.css', 'css/light-tools.css', 'css/light-env.css', 'css/chat-panel.css', 'css/chat-panel-open.css', 'css/chat-personality.css', 'css/chat-messages.css', 'css/chat-composer.css', 'css/chat-onboarding.css', 'css/chat-responsive.css', 'css/chat-actions.css', 'css/chat-mobile.css', 'css/redesign-shell.css', 'css/chat-redesign.css', 'css/chat-redesign-open.css'];
const readCssBundle = () => CSS_FILES.map(read).join('\n');


const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Pre-Release Audit Tests ===\n');

// ═══════════════════════════════════════
// 1. PhenoAge SI coefficients (CRITICAL)
// ═══════════════════════════════════════
console.log('1. PhenoAge SI Coefficients');

const dataSrc = dataModuleSource(read('js/data.js'), read('js/data-core.js'));
const calculatedMarkersSrc = read('js/data-calculated-markers.js');
assert('PhenoAge uses SI albumin directly', calculatedMarkersSrc.includes('0.0336 * albumin_si'));
assert('PhenoAge uses SI creatinine directly', calculatedMarkersSrc.includes('0.0095 * creatinine_si'));
assert('PhenoAge uses SI glucose directly', calculatedMarkersSrc.includes('0.1953 * glucose_si'));
assert('PhenoAge converts lymphocyte fraction to the published percent input',
  calculatedMarkersSrc.includes('const lymphPct = lymphPct_si * 100') && calculatedMarkersSrc.includes('0.0120 * lymphPct'));
assert('PhenoAge converts ALP from µkat/L to the published U/L input',
  calculatedMarkersSrc.includes('const alp_ul = alp_si * 60') && calculatedMarkersSrc.includes('0.00188 * alp_ul'));

// ═══════════════════════════════════════
// 2. Service Worker registration (CRITICAL)
// ═══════════════════════════════════════
console.log('2. Service Worker Registration');

// Original test fetched '/app' (dev-server alias for index.html).
const indexSrc = read('index.html');
const serviceWorkerUpdateSrc = read('js/service-worker-update.js').replace(/}\s+catch\s*{/g, '} catch {');
assert('index loads service worker update module', indexSrc.includes('src="js/service-worker-update.js"'));
assert('SW registration uses absolute path', serviceWorkerUpdateSrc.includes("'/service-worker.js'") || serviceWorkerUpdateSrc.includes('"/service-worker.js"'));
assert('SW registration failures are handled',
  serviceWorkerUpdateSrc.includes("serviceWorkerContainer.register('/service-worker.js'")
    && serviceWorkerUpdateSrc.includes('} catch {'));
assert('SW registration bypasses cached import scripts for version detection',
  serviceWorkerUpdateSrc.includes("updateViaCache: 'none'"));
assert('SW has explicit dev-host offline test opt-in',
  serviceWorkerUpdateSrc.includes('dev-sw=1') && serviceWorkerUpdateSrc.includes('shouldRegisterServiceWorker'));
const swAuditSrc = readServiceWorkerSource(relative => read(relative));
assert('SW uses importScripts for version', swAuditSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses semver', swAuditSrc.includes('`labcharts-v${self.APP_VERSION}`'));
assert('SW treats app.getbased.health as production host', swAuditSrc.includes("'app.getbased.health'"));
assert('SW APP_SHELL includes API models module', swAuditSrc.includes("'/js/api-models.js'"));
assert('SW APP_SHELL includes API provider storage module', swAuditSrc.includes("'/js/api-provider-storage.js'"));
assert('SW APP_SHELL includes provider model controls runtime module', swAuditSrc.includes("'/js/provider-model-controls-runtime.js'"));
assert('SW APP_SHELL includes provider model controls module', swAuditSrc.includes("'/js/provider-model-controls.js'"));
assert('SW APP_SHELL includes provider local AI controls module', swAuditSrc.includes("'/js/provider-local-ai-controls.js'"));
assert('SW APP_SHELL includes provider PPQ panels module', swAuditSrc.includes("'/js/provider-ppq-panels.js'"));
assert('SW APP_SHELL includes API transport module', swAuditSrc.includes("'/js/api-transport.js'"));
assert('SW APP_SHELL includes API OpenAI-compatible transport module', swAuditSrc.includes("'/js/api-openai-compatible.js'"));
assert('SW APP_SHELL includes API local provider module', swAuditSrc.includes("'/js/api-local.js'"));
assert('SW APP_SHELL includes Local AI provider registry', swAuditSrc.includes("'/js/local-ai-provider-registry.js'"));
assert('SW APP_SHELL includes Local AI lifecycle coordinator', swAuditSrc.includes("'/js/local-ai-lifecycle.js'"));
assert('SW APP_SHELL includes native local provider adapters',
  swAuditSrc.includes("'/js/local-ai-provider-lmstudio.js'") &&
  swAuditSrc.includes("'/js/local-ai-provider-ollama.js'"));
assert('SW APP_SHELL includes API Venice provider module', swAuditSrc.includes("'/js/api-venice.js'"));
assert('SW APP_SHELL includes API OpenRouter provider module', swAuditSrc.includes("'/js/api-openrouter.js'"));
assert('SW APP_SHELL includes API OpenRouter OAuth module', swAuditSrc.includes("'/js/api-openrouter-oauth.js'"));
assert('SW APP_SHELL includes API Routstr provider module', swAuditSrc.includes("'/js/api-routstr.js'"));
assert('SW APP_SHELL includes API PPQ provider module', swAuditSrc.includes("'/js/api-ppq.js'"));
assert('SW APP_SHELL includes API Custom provider module', swAuditSrc.includes("'/js/api-custom.js'"));
assert('SW APP_SHELL includes settings privacy module', swAuditSrc.includes("'/js/settings-privacy.js'"));
assert('SW APP_SHELL includes settings data module', swAuditSrc.includes("'/js/settings-data.js'"));
assert('SW APP_SHELL includes settings provider bridge module', swAuditSrc.includes("'/js/settings-provider-bridge.js'"));
assert('SW APP_SHELL includes PDF import review module', swAuditSrc.includes("'/js/pdf-import-review.js'"));
assert('SW APP_SHELL includes PDF import review runtime module', swAuditSrc.includes("'/js/pdf-import-review-runtime.js'"));
assert('SW APP_SHELL includes PDF import commit module', swAuditSrc.includes("'/js/pdf-import-commit.js'"));
assert('SW APP_SHELL includes lab date range module', swAuditSrc.includes("'/js/lab-date-range.js'"));
assert('SW APP_SHELL includes fatty-acid profile migration module', swAuditSrc.includes("'/js/profile-fatty-acid-migrations.js'"));
assert('SW APP_SHELL includes modal lifecycle module', swAuditSrc.includes("'/js/modal-lifecycle.js'"));
assert('SW APP_SHELL includes marker analysis module', swAuditSrc.includes("'/js/marker-analysis.js'"));
assert('SW APP_SHELL includes cycle import modules',
  swAuditSrc.includes("'/js/cycle-import-adapters.js'")
  && swAuditSrc.includes("'/js/cycle-import-file.js'")
  && swAuditSrc.includes("'/js/cycle-import-loader.js'")
  && swAuditSrc.includes("'/js/cycle-import.js'")
  && swAuditSrc.includes("'/js/cycle-store.js'")
  && swAuditSrc.includes("'/js/cycle-summary.js'"));
assert('SW APP_SHELL includes backup support modules',
  swAuditSrc.includes("'/js/backup-cycle.js'")
  && swAuditSrc.includes("'/js/backup-serialization.js'"));
assert('SW APP_SHELL includes PDF import support modules',
  swAuditSrc.includes("'/js/pdf-import-file-utils.js'")
  && swAuditSrc.includes("'/js/pdf-import-spreadsheet.js'")
  && swAuditSrc.includes("'/js/pdf-import-preflight.js'")
  && swAuditSrc.includes("'/js/pdf-import-progress.js'")
  && swAuditSrc.includes("'/js/pdf-import-ai-utils.js'")
  && swAuditSrc.includes("'/js/pdf-import-commit.js'")
  && swAuditSrc.includes("'/js/pdf-import-marker-normalization.js'")
  && swAuditSrc.includes("'/js/pdf-import-persistence.js'"));
assert('SW APP_SHELL includes context card summary module', swAuditSrc.includes("'/js/context-card-summaries.js'"));
assert('SW APP_SHELL includes context card editor UI module', swAuditSrc.includes("'/js/context-card-editor-ui.js'"));
assert('SW APP_SHELL includes context card medical history modules',
  swAuditSrc.includes("'/js/context-card-medical-history-editor.js'")
  && swAuditSrc.includes("'/js/context-card-medical-history-editor-impl.js'"));
assert('SW APP_SHELL includes EMF interpretation module', swAuditSrc.includes("'/js/emf-interpretation.js'"));
assert('SW APP_SHELL includes lens action delegates module', swAuditSrc.includes("'/js/lens-actions.js'"));
assert('SW APP_SHELL includes lens Knowledge Base UI module', swAuditSrc.includes("'/js/lens-knowledge-base-ui.js'"));
assert('SW APP_SHELL includes lens library handlers module', swAuditSrc.includes("'/js/lens-library.js'"));
assert('SW APP_SHELL includes lens cache helper module', swAuditSrc.includes("'/js/lens-cache.js'"));
assert('SW APP_SHELL includes lens URL helper module', swAuditSrc.includes("'/js/lens-url.js'"));
assert('SW APP_SHELL includes lens local store helper module', swAuditSrc.includes("'/js/lens-local-store.js'"));
assert('SW APP_SHELL includes unified chat context status module', swAuditSrc.includes("'/js/chat-context-status.js'"));
assert('SW APP_SHELL includes DNA action delegates module', swAuditSrc.includes("'/js/dna-actions.js'"));
assert('SW APP_SHELL includes DNA genotype helper module', swAuditSrc.includes("'/js/dna-genotype.js'"));
assert('SW APP_SHELL includes DNA UI owner module', swAuditSrc.includes("'/js/dna-ui.js'"));
assert('SW APP_SHELL includes DNA mtDNA helper module', swAuditSrc.includes("'/js/dna-mtdna.js'"));
assert('SW APP_SHELL includes service worker update module', swAuditSrc.includes("'/js/service-worker-update.js'"));
assert('index loads app shell CSS bundle', indexSrc.includes('href="css/app-shell.css"'));
assert('SW APP_SHELL includes app shell CSS bundle', swAuditSrc.includes("'/css/app-shell.css'"));
assert('SW APP_SHELL includes theme runtime module', swAuditSrc.includes("'/js/theme-runtime.js'"));
const appShellCssAuditSrc = read('css/app-shell.css');
const importLoaderAuditSrc = read('js/import-loader.js');
assert('app shell CSS loads after core CSS and before feature CSS',
  indexSrc.indexOf('href="styles.css"') < indexSrc.indexOf('href="css/app-shell.css"') &&
  indexSrc.indexOf('href="css/app-shell.css"') < indexSrc.indexOf('data-import-stylesheet-anchor') &&
  swAuditSrc.indexOf("'/styles.css'") < swAuditSrc.indexOf("'/css/app-shell.css'") &&
  swAuditSrc.indexOf("'/css/app-shell.css'") < swAuditSrc.indexOf("'/css/import.css'"));
assert('index defers import CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/import.css"') &&
  indexSrc.includes('data-import-stylesheet-anchor') &&
  importLoaderAuditSrc.includes("new URL('../css/import.css', import.meta.url)") &&
  importLoaderAuditSrc.includes('data-import-stylesheet-anchor'));
assert('shared import controls remain in the eager app shell',
  appShellCssAuditSrc.includes('.import-btn:not(:where([data-chat-empty-view] *)) {') &&
  appShellCssAuditSrc.includes('.header-icon-btn.header-import-btn {') &&
  appShellCssAuditSrc.includes('.drop-zone {'));
assert('SW APP_SHELL includes import CSS bundle', swAuditSrc.includes("'/css/import.css'"));
const emfRuntimeSrc = read('js/emf-runtime.js');
assert('index defers EMF CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/emf.css"') &&
  indexSrc.includes('data-emf-stylesheet-anchor') &&
  emfRuntimeSrc.includes("new URL('../css/emf.css', import.meta.url)") &&
  emfRuntimeSrc.includes('data-emf-stylesheet-anchor'));
assert('SW APP_SHELL includes EMF CSS bundle', swAuditSrc.includes("'/css/emf.css'"));
assert('import and EMF CSS lazy-load anchors preserve their original order',
  indexSrc.indexOf('data-import-stylesheet-anchor') < indexSrc.indexOf('data-emf-stylesheet-anchor') &&
  swAuditSrc.indexOf("'/css/import.css'") < swAuditSrc.indexOf("'/css/emf.css'"));
assert('EMF CSS lazy-load anchor preserves its position before modal shell CSS',
  indexSrc.indexOf('data-emf-stylesheet-anchor') < indexSrc.indexOf('href="css/modal-shared.css"') &&
  swAuditSrc.indexOf("'/css/import.css'") < swAuditSrc.indexOf("'/css/modal-shared.css'"));
assert('index loads dashboard core CSS bundle', indexSrc.includes('href="css/dashboard-core.css"'));
assert('SW APP_SHELL includes dashboard core CSS bundle', swAuditSrc.includes("'/css/dashboard-core.css'"));
const DASHBOARD_CSS_BUNDLES = [
  'css/dashboard-widgets.css',
  'css/dashboard-welcome.css',
  'css/dashboard-data.css',
];
for (const dashboardCss of DASHBOARD_CSS_BUNDLES) {
  assert(`index loads ${dashboardCss}`, indexSrc.includes(`href="${dashboardCss}"`));
  assert(`SW APP_SHELL includes ${dashboardCss}`, swAuditSrc.includes(`'/${dashboardCss}'`));
}
assert('dashboard CSS split loads before category views',
  indexSrc.indexOf('href="css/dashboard-core.css"') < indexSrc.indexOf('href="css/dashboard-widgets.css"') &&
  indexSrc.indexOf('href="css/dashboard-widgets.css"') < indexSrc.indexOf('href="css/dashboard-welcome.css"') &&
  indexSrc.indexOf('href="css/dashboard-welcome.css"') < indexSrc.indexOf('href="css/dashboard-data.css"') &&
  indexSrc.indexOf('href="css/dashboard-data.css"') < indexSrc.indexOf('data-category-views-stylesheet-anchor') &&
  swAuditSrc.indexOf("'/css/dashboard-core.css'") < swAuditSrc.indexOf("'/css/dashboard-widgets.css'") &&
  swAuditSrc.indexOf("'/css/dashboard-widgets.css'") < swAuditSrc.indexOf("'/css/dashboard-welcome.css'") &&
  swAuditSrc.indexOf("'/css/dashboard-welcome.css'") < swAuditSrc.indexOf("'/css/dashboard-data.css'") &&
  swAuditSrc.indexOf("'/css/dashboard-data.css'") < swAuditSrc.indexOf("'/css/category-views.css'"));
const categoryPageRuntimeAuditSrc = read('js/category-page-runtime.js');
const viewsRuntimeAuditSrc = read('js/views-runtime.js');
const viewsCompatibilityAuditSrc = read('js/views.js');
const viewsRuntimePublicExport = /export\s*\{([^}]+)\}\s*from\s*['"]\.\/views-runtime\.js['"]/.exec(viewsCompatibilityAuditSrc);
const viewsRuntimePublicNames = new Set(
  (viewsRuntimePublicExport?.[1] || '').split(',').map(name => name.trim()),
);
const categoryViewsRouteAuditSrc = viewsRuntimeAuditSrc.replace(/(correlations: data => showCategoryPresentationRoute\()\s*'correlations',\s*'Correlations',/, "$1\n      'correlations',\n      'Correlations',");
const dashboardCoreAuditSrc = read('css/dashboard-core.css');
const dashboardDataAuditSrc = read('css/dashboard-data.css');
const sharedControlsAuditSrc = read('styles.css');
assert('index defers category views CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/category-views.css"') &&
  indexSrc.includes('data-category-views-stylesheet-anchor') &&
  categoryPageRuntimeAuditSrc.includes("new URL('../css/category-views.css', import.meta.url)") &&
  categoryPageRuntimeAuditSrc.includes('data-category-views-stylesheet-anchor'));
assert('category views CSS lazy-load anchor preserves the original cascade position',
  indexSrc.indexOf('href="css/dashboard-data.css"') <
    indexSrc.indexOf('data-category-views-stylesheet-anchor') &&
  indexSrc.indexOf('data-category-views-stylesheet-anchor') <
    indexSrc.indexOf('href="css/context-profile.css"'));
assert('category, compare, and correlations routes wait for category presentation',
  categoryViewsRouteAuditSrc.includes("category: (category, data) => showCategoryPresentationRoute(") &&
  categoryViewsRouteAuditSrc.includes("showCategoryPresentationRoute('compare'") &&
  categoryViewsRouteAuditSrc.includes("'correlations',\n      'Correlations',") &&
  categoryViewsRouteAuditSrc.includes('() => isCategoryViewsStylesheetLoaded() && (!needsCharts || isChartsModuleLoaded())') &&
  categoryViewsRouteAuditSrc.includes('loadCategoryViewsStylesheet(),') &&
  /function showPreparedRoute[^\n]*\{[\s\S]{0,800}return prepare\(\)\s*\.then\(async[^\n]*\{[\s\S]{0,300}await render\(\.\.\.args\)/.test(viewsRuntimeAuditSrc) &&
  ['navigate', 'showCategory', 'showCompare', 'showCorrelations'].every(name => viewsRuntimePublicNames.has(name)));
assert('dashboard-owned category primitives remain eager',
  dashboardCoreAuditSrc.includes('.category-header { margin-bottom: 24px; }') &&
  dashboardDataAuditSrc.includes('.alerts-section') &&
  dashboardDataAuditSrc.includes('.alert-card') &&
  sharedControlsAuditSrc.includes('.date-range-filter {') &&
  sharedControlsAuditSrc.includes('.range-btn {') &&
  indexSrc.includes('href="styles.css"') &&
  indexSrc.indexOf('href="styles.css"') < indexSrc.indexOf('data-category-views-stylesheet-anchor'));
assert('SW APP_SHELL includes category views CSS bundle', swAuditSrc.includes("'/css/category-views.css'"));
assert('index loads shared modal CSS bundle', indexSrc.includes('href="css/modal-shared.css"'));
assert('SW APP_SHELL includes shared modal CSS bundle', swAuditSrc.includes("'/css/modal-shared.css'"));
assert('shared modal CSS loads before feature modal overrides',
  indexSrc.indexOf('href="css/modal-shared.css"') < indexSrc.indexOf('href="css/context-profile.css"') &&
  swAuditSrc.indexOf("'/css/modal-shared.css'") < swAuditSrc.indexOf("'/css/context-profile.css'"));
assert('index loads context/profile CSS bundle', indexSrc.includes('href="css/context-profile.css"'));
assert('SW APP_SHELL includes context/profile CSS bundle', swAuditSrc.includes("'/css/context-profile.css'"));
const contextEditorAuditSrc = read('js/context-card-editor-ui.js');
assert('index defers context editor CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/context-editor.css"') &&
  indexSrc.includes('data-context-editor-stylesheet-anchor') &&
  contextEditorAuditSrc.includes("new URL('../css/context-editor.css', import.meta.url)") &&
  contextEditorAuditSrc.includes('data-context-editor-stylesheet-anchor'));
assert('context editor and tips actions wait for their presentation',
  read('js/context-card-medical-history-editor-impl.js').includes('openDiagnosesEditor as openMedicalHistory') &&
  read('js/context-medical-history-view.js').includes('runWithContextEditorStylesheet(() =>') &&
  read('js/context-card-lifestyle-editors-impl.js').includes("openLifestyleForm('diet')") &&
  read('js/context-lifestyle-form-view.js').includes('runWithContextEditorStylesheet(() =>') &&
  read('js/context-cards.js').includes('runWithContextEditorStylesheet(() => openCardTipsModal(cardKey, ticket, owner))'));
assert('context editor split preserves shared context controls eagerly',
  read('css/context-profile.css').includes('.ctx-btn-option') &&
  read('css/context-profile.css').includes('.ctx-tag') &&
  read('js/components/ContextCardCatalog.svelte').includes('context-info-icon {CONTEXT_INFO}') &&
  read('js/components/ContextNotes.svelte').includes('ctx-notes-textarea gb:context-catalog:'));
assert('SW APP_SHELL includes context editor CSS bundle', swAuditSrc.includes("'/css/context-editor.css'"));
const dnaRuntimeAuditSrc = read('js/dna-runtime.js');
assert('index defers genetics CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/genetics.css"') &&
  indexSrc.includes('data-genetics-stylesheet-anchor') &&
  dnaRuntimeAuditSrc.includes("new URL('../css/genetics.css', import.meta.url)") &&
  dnaRuntimeAuditSrc.includes('data-genetics-stylesheet-anchor'));
assert('genetics CSS lazy-load anchor preserves the original cascade position',
  indexSrc.indexOf('href="css/context-profile.css"') <
    indexSrc.indexOf('data-context-editor-stylesheet-anchor') &&
  indexSrc.indexOf('data-context-editor-stylesheet-anchor') <
    indexSrc.indexOf('data-genetics-stylesheet-anchor') &&
  indexSrc.indexOf('data-genetics-stylesheet-anchor') <
    indexSrc.indexOf('data-data-protection-stylesheet-anchor'));
assert('SW APP_SHELL includes genetics CSS bundle', swAuditSrc.includes("'/css/genetics.css'"));
const dataProtectionLifecycleAuditSrc = read('js/modal-lifecycle.js');
const settingsLoaderAuditSrc = read('js/settings-loader.js');
const cryptoUiAuditSrc = read('js/crypto-ui.js');
const piiReviewAuditSrc = read('js/pii-review.js');
assert('index defers data protection CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/data-protection.css"') &&
  indexSrc.includes('data-data-protection-stylesheet-anchor') &&
  dataProtectionLifecycleAuditSrc.includes("new URL('../css/data-protection.css', import.meta.url)") &&
  dataProtectionLifecycleAuditSrc.includes('data-data-protection-stylesheet-anchor'));
assert('data protection presentation joins every owning first-open boundary',
  importLoaderAuditSrc.includes('loadDataProtectionStylesheet()') &&
  settingsLoaderAuditSrc.includes('loadDataProtectionStylesheet()') &&
  cryptoUiAuditSrc.includes('runWithDataProtectionStylesheet') &&
  piiReviewAuditSrc.includes('loadDataProtectionStylesheetForAction'));
assert('SW APP_SHELL includes data protection CSS bundle', swAuditSrc.includes("'/css/data-protection.css'"));
assert('index defers settings CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/settings.css"') &&
  indexSrc.includes('data-settings-stylesheet-anchor'));
assert('data protection and settings lazy-load anchors preserve cascade order',
  indexSrc.indexOf('data-genetics-stylesheet-anchor') <
    indexSrc.indexOf('data-data-protection-stylesheet-anchor') &&
  indexSrc.indexOf('data-data-protection-stylesheet-anchor') <
    indexSrc.indexOf('data-settings-stylesheet-anchor') &&
  indexSrc.indexOf('data-settings-stylesheet-anchor') <
    indexSrc.indexOf('href="css/mobile-dashboard.css"'));
assert('SW APP_SHELL includes settings CSS bundle', swAuditSrc.includes("'/css/settings.css'"));
const clientListEntrySrc = read('js/client-list.js');
const clientListSrc = read('js/client-list-impl.js');
const appUiShellModulesSrc = read('js/app-ui-shell-modules.js');
const wearablesRuntimeAuditSrc = read('js/wearables-runtime.js');
const cycleRuntimeAuditSrc = read('js/cycle-runtime.js');
const cycleViewsAuditSrc = viewsRuntimeAuditSrc;
const themeAuditSrc = read('js/theme.js');
const extraThemeBootstrapSrc = read('js/extra-theme-bootstrap.js');
const extraThemesAuditSrc = read('themes-extra.css');
assert('index defers client list CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/client-list.css"') &&
  indexSrc.includes('data-client-list-stylesheet-anchor') &&
  clientListSrc.includes("new URL('../css/client-list.css', import.meta.url)") &&
  clientListSrc.includes('data-client-list-stylesheet-anchor'));
assert('client list CSS lazy-load anchor preserves the original cascade position',
  indexSrc.indexOf('href="css/recommendations.css"') <
    indexSrc.indexOf('data-client-list-stylesheet-anchor') &&
  indexSrc.indexOf('data-client-list-stylesheet-anchor') <
    indexSrc.indexOf('data-wearables-stylesheet-anchor'));
assert('SW APP_SHELL includes client list CSS bundle', swAuditSrc.includes("'/css/client-list.css'"));
assert('client list implementation stays behind its public lazy entry',
  clientListEntrySrc.includes("import('./client-list-impl.js')") &&
  clientListEntrySrc.includes("import('./client-list-impl.js?lazy-retry=1')") &&
  !appUiShellModulesSrc.includes("import './client-list.js'"));
assert('SW APP_SHELL includes offline client list implementation',
  swAuditSrc.includes("'/js/client-list-impl.js'"));
assert('SW APP_SHELL includes offline client list form owner',
  swAuditSrc.includes("'/js/client-list-form.js'"));
assert('index defers wearables CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/wearables.css"') &&
  indexSrc.includes('data-wearables-stylesheet-anchor') &&
  wearablesRuntimeAuditSrc.includes("new URL('../css/wearables.css', import.meta.url)") &&
  wearablesRuntimeAuditSrc.includes('data-wearables-stylesheet-anchor'));
assert('wearables CSS lazy-load anchor preserves the original cascade position',
  indexSrc.indexOf('data-client-list-stylesheet-anchor') <
    indexSrc.indexOf('data-wearables-stylesheet-anchor') &&
  indexSrc.indexOf('data-wearables-stylesheet-anchor') <
    indexSrc.indexOf('data-light-sun-stylesheet-anchor'));
assert('SW APP_SHELL includes wearables CSS bundle', swAuditSrc.includes("'/css/wearables.css'"));
assert('index loads mobile dashboard CSS bundle', indexSrc.includes('href="css/mobile-dashboard.css"'));
assert('SW APP_SHELL includes mobile dashboard CSS bundle', swAuditSrc.includes("'/css/mobile-dashboard.css'"));
assert('index defers cycle CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/cycle.css"') &&
  indexSrc.includes('data-cycle-stylesheet-anchor') &&
  cycleRuntimeAuditSrc.includes("new URL('../css/cycle.css', import.meta.url)") &&
  cycleRuntimeAuditSrc.includes('data-cycle-stylesheet-anchor'));
assert('cycle CSS lazy-load anchor preserves the original cascade position',
  indexSrc.indexOf('href="css/mobile-dashboard.css"') <
    indexSrc.indexOf('data-cycle-stylesheet-anchor') &&
  indexSrc.indexOf('data-cycle-stylesheet-anchor') <
    indexSrc.indexOf('data-marker-detail-stylesheet-anchor'));
assert('female Dashboard and Body routes wait for Cycle presentation',
  cycleViewsAuditSrc.includes('loadDashboardHealthDataModules') &&
  cycleViewsAuditSrc.includes('loadBodyHealthDataModules') &&
  cycleViewsAuditSrc.includes("state.profileSex === 'female'") &&
  cycleViewsAuditSrc.includes('needsCyclePresentation') &&
  cycleViewsAuditSrc.includes('loadCycleStylesheet()') &&
  cycleViewsAuditSrc.includes('dashboard: showDashboardRoute') &&
  cycleViewsAuditSrc.includes('body: showBodyRoute') &&
  ['navigate', 'showDashboard', 'showBodyLens'].every(name => viewsRuntimePublicNames.has(name)));
assert('SW APP_SHELL includes cycle CSS bundle', swAuditSrc.includes("'/css/cycle.css'"));
assert('index conditionally loads optional theme presentation',
  !indexSrc.includes('<link rel="stylesheet" href="themes-extra.css">') &&
  indexSrc.includes('data-extra-themes-stylesheet-anchor') &&
  indexSrc.includes('src="js/extra-theme-bootstrap.js"') &&
  extraThemeBootstrapSrc.includes("selectedTheme === 'light'") &&
  extraThemeBootstrapSrc.includes('data-extra-themes-stylesheet-anchor') &&
  themeAuditSrc.includes("new URL('../themes-extra.css', import.meta.url)") &&
  themeAuditSrc.includes('data-extra-themes-stylesheet-anchor'));
assert('optional theme CSS anchor preserves the final cascade position',
  indexSrc.indexOf('href="css/chat-redesign.css"') <
    indexSrc.indexOf('data-extra-themes-stylesheet-anchor'));
assert('cross-theme shell and sunset rules remain eager after the optional split',
  indexSrc.includes('<style data-shared-theme-modes>') &&
  indexSrc.includes(':root[data-sunset-mode="on"]') &&
  indexSrc.includes('[data-theme] .sidebar') &&
  !extraThemesAuditSrc.includes(':root[data-sunset-mode="on"]') &&
  !extraThemesAuditSrc.includes('[data-theme] .sidebar'));
assert('SW APP_SHELL includes optional theme presentation', swAuditSrc.includes("'/themes-extra.css'"));
const markerDetailFacadeSrc = read('js/marker-detail-modal.js');
const markerDetailImplSrc = read('js/marker-detail-modal-impl.js');
const markerDetailSrc = `${markerDetailFacadeSrc}\n${markerDetailImplSrc}`;
const markerDetailRuntimeSrc = read('js/marker-detail-runtime.js');
assert('marker detail implementation loads only through the public lazy facade',
  markerDetailFacadeSrc.includes("import('./marker-detail-modal-impl.js')") &&
  markerDetailFacadeSrc.includes("import('./marker-detail-modal-impl.js?lazy-retry=1')") &&
  markerDetailFacadeSrc.includes('const markerDetailModuleLoader = createRetryingModuleLoader(')
    && read('js/retrying-module-loader.js').includes('let promise = null;') &&
  !/from ['"]\.\/marker-detail-modal-impl\.js['"]/.test(markerDetailFacadeSrc));
assert('index defers marker detail CSS behind its ordered lazy-load anchor',
  !indexSrc.includes('href="css/marker-detail-modal.css"') &&
  indexSrc.includes('data-marker-detail-stylesheet-anchor') &&
  markerDetailSrc.includes('loadMarkerDetailStylesheet') &&
  markerDetailRuntimeSrc.includes("new URL('../css/marker-detail-modal.css', import.meta.url)") &&
  markerDetailRuntimeSrc.includes('data-marker-detail-stylesheet-anchor'));
assert('marker detail CSS lazy-load anchor preserves the original cascade position',
  indexSrc.indexOf('data-cycle-stylesheet-anchor') <
    indexSrc.indexOf('data-marker-detail-stylesheet-anchor') &&
    indexSrc.indexOf('data-marker-detail-stylesheet-anchor') <
    indexSrc.indexOf('href="css/recommendations.css"'));
assert('SW APP_SHELL includes marker detail modal CSS bundle', swAuditSrc.includes("'/css/marker-detail-modal.css'"));
assert('SW APP_SHELL includes marker detail lazy implementation and focus memory',
  swAuditSrc.includes("'/js/marker-detail-modal-impl.js'") &&
  swAuditSrc.includes("'/js/modal-trigger-memory.js'"));
assert('SW APP_SHELL includes marker detail subflow owners',
  swAuditSrc.includes("'/js/marker-detail-content.js'") &&
  swAuditSrc.includes("'/js/marker-detail-manual-entry.js'") &&
  swAuditSrc.includes("'/js/marker-detail-custom-markers.js'"));
assert('index loads recommendations CSS bundle', indexSrc.includes('href="css/recommendations.css"'));
assert('SW APP_SHELL includes recommendations CSS bundle', swAuditSrc.includes("'/css/recommendations.css'"));
assert('SW APP_SHELL includes recommendations product module', swAuditSrc.includes("'/js/recommendations-products.js'"));
const LIGHT_CSS_BUNDLES = [
  'css/light-sun.css',
  'css/light-channels.css',
  'css/light-devices.css',
  'css/light-conditions-now.css',
  'css/light-setup.css',
  'css/light-tools.css',
  'css/light-env.css',
];
const lightSunLoaderSrc = read('js/light-sun-loader.js');
for (const lightCss of LIGHT_CSS_BUNDLES) {
  assert(`index defers ${lightCss}`, !indexSrc.includes(`href="${lightCss}"`));
  assert(`Light UI loader owns ${lightCss}`, lightSunLoaderSrc.includes(`'../${lightCss}'`));
  assert(`SW APP_SHELL includes ${lightCss}`, swAuditSrc.includes(`'/${lightCss}'`));
}
assert('index keeps an ordered Light stylesheet anchor at the original cascade position',
  indexSrc.includes('data-light-sun-stylesheet-anchor') &&
  indexSrc.indexOf('data-wearables-stylesheet-anchor') <
    indexSrc.indexOf('data-light-sun-stylesheet-anchor') &&
  indexSrc.indexOf('data-light-sun-stylesheet-anchor') <
    indexSrc.indexOf('href="css/chat-panel.css"'));
assert('light CSS split preserves override order',
  lightSunLoaderSrc.indexOf("'../css/light-sun.css'") < lightSunLoaderSrc.indexOf("'../css/light-channels.css'") &&
  lightSunLoaderSrc.indexOf("'../css/light-channels.css'") < lightSunLoaderSrc.indexOf("'../css/light-devices.css'") &&
  lightSunLoaderSrc.indexOf("'../css/light-devices.css'") < lightSunLoaderSrc.indexOf("'../css/light-conditions-now.css'") &&
  lightSunLoaderSrc.indexOf("'../css/light-conditions-now.css'") < lightSunLoaderSrc.indexOf("'../css/light-setup.css'") &&
  lightSunLoaderSrc.indexOf("'../css/light-setup.css'") < lightSunLoaderSrc.indexOf("'../css/light-tools.css'") &&
  lightSunLoaderSrc.indexOf("'../css/light-tools.css'") < lightSunLoaderSrc.indexOf("'../css/light-env.css'") &&
  swAuditSrc.indexOf("'/css/light-sun.css'") < swAuditSrc.indexOf("'/css/light-channels.css'") &&
  swAuditSrc.indexOf("'/css/light-channels.css'") < swAuditSrc.indexOf("'/css/light-devices.css'") &&
  swAuditSrc.indexOf("'/css/light-devices.css'") < swAuditSrc.indexOf("'/css/light-conditions-now.css'") &&
  swAuditSrc.indexOf("'/css/light-conditions-now.css'") < swAuditSrc.indexOf("'/css/light-setup.css'") &&
  swAuditSrc.indexOf("'/css/light-setup.css'") < swAuditSrc.indexOf("'/css/light-tools.css'") &&
  swAuditSrc.indexOf("'/css/light-tools.css'") < swAuditSrc.indexOf("'/css/light-env.css'"));
assert('index loads chat panel CSS bundle', indexSrc.includes('href="css/chat-panel.css"'));
assert('SW APP_SHELL includes chat panel CSS bundle', swAuditSrc.includes("'/css/chat-panel.css'"));
assert('index keeps cold-visible Chat redesign shell overrides eager',
  indexSrc.includes('href="css/chat-redesign.css"') &&
  swAuditSrc.includes("'/css/chat-redesign.css'"));
const DEFERRED_CHAT_PRESENTATION_BUNDLES = [
  'css/chat-panel-open.css',
  'css/chat-personality.css',
  'css/chat-messages.css',
  'css/chat-composer.css',
  'css/chat-onboarding.css',
  'css/chat-responsive.css',
  'css/chat-actions.css',
  'css/chat-mobile.css',
  'css/chat-redesign-open.css',
];
const chatPanelAuditSrc = read('js/chat-panel.js');
for (const chatCss of DEFERRED_CHAT_PRESENTATION_BUNDLES) {
  assert(`index defers ${chatCss} through the Chat presentation boundary`,
    !indexSrc.includes(`href="${chatCss}"`) &&
    chatPanelAuditSrc.includes(`new URL('../${chatCss}', import.meta.url)`) &&
    swAuditSrc.includes(`'/${chatCss}'`));
}
assert('index defers Chat presentation behind its ordered lazy-load anchor',
  indexSrc.includes('data-chat-presentation-stylesheet-anchor') &&
  chatPanelAuditSrc.includes('loadChatPresentationStylesheetsForAction'));
assert('Chat panel waits for complete presentation before opening',
  chatPanelAuditSrc.includes('await loadChatPresentationStylesheetsForAction()') &&
  chatPanelAuditSrc.indexOf('await loadChatPresentationStylesheetsForAction()') <
    chatPanelAuditSrc.indexOf("panel.classList.add('open')"));
assert('Chat presentation loader and service worker preserve stylesheet cascade order',
  DEFERRED_CHAT_PRESENTATION_BUNDLES.every((chatCss, index) => (
    index === 0 ||
    chatPanelAuditSrc.indexOf(`new URL('../${DEFERRED_CHAT_PRESENTATION_BUNDLES[index - 1]}'`) <
      chatPanelAuditSrc.indexOf(`new URL('../${chatCss}'`)
  )) &&
  DEFERRED_CHAT_PRESENTATION_BUNDLES.every((chatCss, index) => (
    index === 0 ||
    swAuditSrc.indexOf(`'/${DEFERRED_CHAT_PRESENTATION_BUNDLES[index - 1]}'`) <
      swAuditSrc.indexOf(`'/${chatCss}'`)
  )));
assert('Chat presentation split anchors preserve redesign and optional-theme cascade order',
  indexSrc.indexOf('data-chat-presentation-stylesheet-anchor') <
    indexSrc.indexOf('href="css/redesign-shell.css"') &&
  indexSrc.indexOf('href="css/redesign-shell.css"') < indexSrc.indexOf('href="css/chat-redesign.css"') &&
  indexSrc.indexOf('href="css/chat-redesign.css"') <
    indexSrc.indexOf('data-chat-redesign-open-stylesheet-anchor') &&
  indexSrc.indexOf('data-chat-redesign-open-stylesheet-anchor') <
    indexSrc.indexOf('data-extra-themes-stylesheet-anchor') &&
  chatPanelAuditSrc.includes("anchorSelector: '[data-chat-redesign-open-stylesheet-anchor]'") &&
  swAuditSrc.indexOf("'/css/chat-mobile.css'") < swAuditSrc.indexOf("'/css/redesign-shell.css'") &&
  swAuditSrc.indexOf("'/css/redesign-shell.css'") < swAuditSrc.indexOf("'/css/chat-redesign.css'") &&
  swAuditSrc.indexOf("'/css/chat-redesign.css'") < swAuditSrc.indexOf("'/css/chat-redesign-open.css'"));
const chatComposerCssSrc = read('css/chat-composer.css');
const chatPanelCssSrc = read('css/chat-panel.css');
const chatPanelOpenCssSrc = read('css/chat-panel-open.css');
const chatMobileCssSrc = read('css/chat-mobile.css');
const chatRedesignCssSrc = read('css/chat-redesign.css');
const chatRedesignOpenCssSrc = read('css/chat-redesign-open.css');
const markerDetailCssSrc = read('css/marker-detail-modal.css');
const analyticsBootstrapSrc = read('js/analytics-bootstrap.js');
assert('cold-visible mobile Chat launcher sizing remains in the eager panel bundle',
  chatPanelCssSrc.includes('@media (max-width: 480px)') &&
  chatPanelCssSrc.includes('.chat-fab { width: 48px; height: 48px;') &&
  !chatMobileCssSrc.includes('.chat-fab'));
assert('Chat panel interior presentation is deferred while the closed shell stays eager',
  chatPanelCssSrc.includes('transform: translateX(100%)') &&
  chatPanelCssSrc.includes('.chat-rail-back { display: none; }') &&
  !chatPanelCssSrc.includes('.chat-thread-rail') &&
  chatPanelOpenCssSrc.includes('.chat-panel.open') &&
  chatPanelOpenCssSrc.includes('.chat-thread-rail'));
assert('Chat redesign interior is deferred while cold shell and reservation rules stay eager',
  chatRedesignCssSrc.includes('.chat-fab') &&
  chatRedesignCssSrc.includes('body.chat-autostart-reserved .main') &&
  chatRedesignCssSrc.includes('@media (prefers-reduced-motion: reduce)') &&
  !chatRedesignCssSrc.includes('.chat-panel-conversation') &&
  chatRedesignOpenCssSrc.includes('.chat-panel-conversation') &&
  chatRedesignOpenCssSrc.includes('body.chat-open .main') &&
  !chatRedesignOpenCssSrc.includes('body.chat-autostart-reserved .main'));
assert('marker detail presentation no longer depends on deferred Chat composer CSS',
  markerDetailCssSrc.includes('.calc-missing-inputs') &&
  markerDetailCssSrc.includes('.ask-ai-btn') &&
  !chatComposerCssSrc.includes('.calc-missing-inputs') &&
  !chatComposerCssSrc.includes('.ask-ai-btn'));
assert('Umami analytics bootstrap is external and self-hosted',
  indexSrc.includes('src="js/analytics-bootstrap.js"')
  && analyticsBootstrapSrc.includes('umami-iota-olive.vercel.app/script.js'));
assert('Umami analytics executable is integrity-pinned and anonymous-CORS fetched',
  analyticsBootstrapSrc.includes("script.integrity = 'sha384-")
  && analyticsBootstrapSrc.includes("script.crossOrigin = 'anonymous'"));
assert('Umami blocked on file:// protocol',
  /location\.protocol\s*!==\s*['"]file:['"]/.test(analyticsBootstrapSrc));
assert('Umami waits for offline PWA relaunches to reconnect',
  analyticsBootstrapSrc.includes("globalThis.addEventListener('online', loadUmami, { once: true })"));

// ═══════════════════════════════════════
// 3. XSS: escapeHTML in views/dashboard renderer surfaces
// ═══════════════════════════════════════
console.log('3. XSS Prevention');

const viewsSrc = read('js/views.js');
read('js/dashboard-page-view.js');
const lensPageShellSrc = read('js/lens-page-shell-core.js');
read('js/lens.js');
const lensActionsSrc = read('js/lens-actions.js');
const lensKnowledgeBaseUiSrc = read('js/lens-knowledge-base-ui.js');
const lensPagesSrc = read('js/lens-pages.js');
const lensContentViewSrc = read('js/components/LensPageContent.svelte');
const lensDataPageSrc = read('js/components/LensDataPage.svelte');
const lensDataWidgetBodySrc = read('js/components/LensDataWidgetBody.svelte');
const lensActionButtonsSrc = read('js/components/LensActionButtons.svelte');
const lensBodySourcesSrc = read('js/components/BodySources.svelte');
const lensContentProjectorSrc = read('js/lens-content-presentation.ts');
// Cover authored quoted/braced handlers and legacy directive modifiers/forwarding.
const authoredEventAttributePattern = /(?:\s|\{)(?:on[a-z]+|on:[a-z]+(?:\|[a-z]+)*)(?:\s*=|\s*}|[\s/>])/;
const dnaActionsSrc = read('js/dna-actions.js');
const categoryPageViewSrc = read('js/category-page-view.js');
const categoryViewRenderersSrc = read('js/category-view-renderers.js');
const categoryCustomizationSrc = read('js/category-customization.js');
const focusCardSrc = read('js/focus-card.js');
const compareCorrelationsSrc = read('js/compare-correlations.js');
const lightSessionsViewSrc = read('js/light-sessions-view.js');
const lightPageViewSrc = read('js/light-page-view.js');
const lightChannelViewSrc = read('js/light-channel-view.js');
const dashboardWidgetsSrc = read('js/dashboard-widgets.js');
const dashboardRenderersSrc = read('js/dashboard-widget-renderers.js');
const dashboardLabRenderersSrc = read('js/dashboard-lab-widget-renderers.js');
const dashboardViewCompositionSrc = read('js/dashboard-view-composition.js');
const geneticsCssAuditSrc = read('css/genetics.css');
const markerDetailCssAuditSrc = read('css/marker-detail-modal.css');
read('css/context-profile.css');
const contextEditorCssAuditSrc = read('css/context-editor.css');
const dnaSrc = read('js/dna.js');
const dnaUiSrc = read('js/dna-ui.js');
const dnaSurfaceSrc = `${dnaSrc}\n${dnaUiSrc}`;
const migratedAudit = await auditMigrationWitnesses();
const dashboardAlertsViewSrc = read('js/components/DashboardAlerts.svelte');
const categoryPageChromeSrc = read('js/components/CategoryPageChrome.svelte');
const markerDetailChromeSrc = read('js/components/MarkerDetailChrome.svelte');
const markerDetailHistorySrc = read('js/components/MarkerDetailHistory.svelte');
const correlationOptionsSrc = read('js/components/CorrelationsSelectionOptions.svelte');
assert('Trend alert name escaped',
  dashboardLabRenderersSrc.includes('summaryText(alert.name)')
    && dashboardAlertsViewSrc.includes('{alert.name}') && migratedAudit.contracts.trendName);
assert('Trend alert category escaped',
  dashboardLabRenderersSrc.includes('summaryText(alert.category)')
    && dashboardAlertsViewSrc.includes('{alert.category}') && migratedAudit.contracts.trendCategory);
assert('Flagged marker name escaped',
  dashboardLabRenderersSrc.includes('summaryText(flag.name)')
    && dashboardAlertsViewSrc.includes('{flag.name}') && migratedAudit.contracts.flaggedName);
assert('Category label escaped in header',
  categoryPageViewSrc.includes('categoryLiteral(cat.label)')
    && categoryPageChromeSrc.includes('{view.label}') && migratedAudit.contracts.categoryLabel);
assert('marker.unit escaped in detail modal',
  markerDetailImplSrc.includes('captureMarkerDetailText(marker.unit)')
    && markerDetailChromeSrc.includes('<div class="modal-unit">{node.unit}</div>')
    && migratedAudit.contracts.markerUnit);
assert('marker history controls keep their styling in the lazy marker-detail bundle',
  markerDetailHistorySrc.includes('class="marker-history-show-more"') &&
  !markerDetailHistorySrc.includes('light-sessions-show-more marker-history-show-more') &&
  markerDetailCssAuditSrc.includes('.marker-detail-modal .marker-history-show-more:hover'));
assert('Correlation option names escaped',
  compareCorrelationsSrc.includes('projectCorrelationMarkerOption(selected, fullKey, marker, cat, count)')
    && correlationOptionsSrc.includes('data-name={option.name}')
    && correlationOptionsSrc.includes('{option.label}') && migratedAudit.contracts.correlationName);
assert('Light channel next-move HTML does not render dynamic device names',
  read('js/components/LightChannelDetail.svelte').includes('view.takeaway.matchingDevice') &&
    read('js/light-channel-presentation.ts').includes('matchingDevice: input.matchingDevice') &&
    !lightChannelViewSrc.includes('matchingDevice.brand') &&
    !lightChannelViewSrc.includes('matchingDevice.model'));
assert('Genome genetics refs keep shared unscoped CSS',
  dnaUiSrc.includes('renderGeneticsSectionView(')
    && read('js/genetics-section-presentation.js').includes("'./components/GeneticsSection.svelte.html.js'")
    && read('js/components/GeneticsSection.svelte').includes('class="detail-genetics-ref"')
    && /\.detail-genetics-ref\s*\{/.test(geneticsCssAuditSrc));
assert('Marker detail bundle does not own shared genetics refs',
  !/\.marker-detail-modal\s+\.detail-genetics(?:-ref)?/.test(markerDetailCssAuditSrc));

read('js/chat.js');
const chatMarkerPromptsSrc = read('js/chat-marker-prompts.js');
const chatSendSrc = read('js/chat-send.js');
const chatActionsSrc = read('js/chat-actions.js');
const chatPromptContextSrc = read('js/chat-prompt-context.js');
const markdownSrc = read('js/markdown.js');
assert('Markdown URL has quote escaping', markdownSrc.includes('.replace(/"/g, \'&quot;\')'));
assert('Clipboard has navigator.clipboard guard', chatActionsSrc.includes('if (!navigator.clipboard)'));

// ═══════════════════════════════════════
// 3b. Marker-key allowlist guards (source-inspection)
// ═══════════════════════════════════════
// PDF AI extraction is sanitized at the parse boundary by _sanitizeAIMarker,
// but legacy data and sync pulls can still feed unsafe keys into category
// views — category marker ids flow into delegated data attributes.
// safeMarkerId in utils.js gates each one. The *functional* proof that the
// guards no-op on adversarial input lives in tests/playwright/audit-dom.spec.js (needs a
// live DOM); here we pin the guard *wiring*.
console.log('3b. Marker-key allowlist guards');

const utilsXssSrc = read('js/utils.js');
assert('utils.js exports safeMarkerId',
  /export\s+function\s+safeMarkerId\s*\(/.test(utilsXssSrc));
assert('safeMarkerId proto-pollution guard set covers __proto__/constructor/prototype',
  /_PROTO_PARTS\s*=\s*new\s+Set\s*\(\s*\[\s*['"]__proto__['"]\s*,\s*['"]constructor['"]\s*,\s*['"]prototype['"]\s*\]\s*\)/.test(utilsXssSrc));
assert('category-page-view.js imports safeMarkerId from utils',
  /import\s*\{[^}]*\bsafeMarkerId\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(categoryPageViewSrc));
assert('category-view-renderers.js imports safeMarkerId from utils',
  /import\s*\{[^}]*\bsafeMarkerId\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(categoryViewRenderersSrc));
assert('showCategory guards on safeMarkerId(categoryKey) at function entry',
  /export function showCategory[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return/.test(categoryPageViewSrc));
assert('switchView guards on safeMarkerId(categoryKey) at function entry',
  /export function switchView[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return/.test(categoryPageViewSrc));
assert('showDetailModal guards on safeMarkerId(id) at function entry',
  /export function showDetailModal[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(id\)\s*\)\s*return/.test(markerDetailSrc));
assert('renderChartCard returns "" on unsafe id (chokepoint for dashboard + category)',
  /export function projectCategoryChartCard[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(id\)\s*\)\s*return\s*null/.test(categoryViewRenderersSrc)
    && /renderCategoryChartCard\(projectCategoryChartCard\(id,\s*marker,\s*dateLabels,\s*chartDates\)\)/.test(categoryViewRenderersSrc)
    && migratedAudit.chartGuard);
assert('renderFattyAcidsView returns "" on unsafe categoryKey',
  /export function projectCategoryFattyAcids[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return\s*null/.test(categoryViewRenderersSrc)
    && /renderCategoryFatty\(projectCategoryFattyAcids\(cat,\s*categoryKey\)\)/.test(categoryViewRenderersSrc)
    && migratedAudit.fattyGuard);
assert('showCategory chart-cards loop skips legacy customMarkers with unsafe keys',
  /for\s*\(\s*const\s*\[\s*key\s*,\s*marker\s*\]\s+of\s+withData\s*\)\s*\{\s*[\s\S]{0,200}if\s*\(\s*!safeMarkerId\(key\)\s*\)\s*continue/.test(categoryPageViewSrc));
assert('category-customization.js owns rename/icon helpers',
  /export async function renameCategory/.test(categoryCustomizationSrc) &&
  /export async function renameMarker/.test(categoryCustomizationSrc) &&
  /export function changeCategoryIcon/.test(categoryCustomizationSrc) &&
  /export function showEmojiPicker/.test(categoryCustomizationSrc));
assert('category rename rejects whitespace-only labels after trim',
  /export async function renameCategory[^{]*\{[\s\S]{0,700}const trimmed = newLabel\.trim\(\);\s*if\s*\(\s*!trimmed\s*\)\s*return/.test(categoryCustomizationSrc));
assert('marker rename rejects whitespace-only labels after trim',
  /export async function renameMarker[^{]*\{[\s\S]{0,700}const trimmed = newName\.trim\(\);\s*if\s*\(\s*!trimmed\s*\)\s*return/.test(categoryCustomizationSrc));
assert('category customization refreshes the active view with fresh data',
  /function _refreshActiveView[^{]*\{[\s\S]{0,300}const data = getActiveData\(\);[\s\S]{0,200}const buildSidebar = _buildSidebar \|\| getFallbackBuildSidebar\(\);[\s\S]{0,200}buildSidebar\?\.\(data\);[\s\S]{0,200}_navigate\(opts\.forceRoute \|\| state\.currentView \|\| fallbackRoute, data\)/.test(categoryCustomizationSrc) &&
  viewsRuntimeAuditSrc.includes('configureCategoryCustomization({ navigate, buildSidebar });') &&
  viewsRuntimePublicNames.has('navigate'));
assert('marker rename refreshes the backing view before reopening modal',
  /export async function renameMarker[^{]*\{[\s\S]{0,900}await saveImportedData\(\);\s*_refreshActiveView\(catKey\);\s*showDetailModal\(id\)/.test(categoryCustomizationSrc));

// ═══════════════════════════════════════
// 3c. Exhaustive HTML sink review ratchet
// ═══════════════════════════════════════
// CodeQL's js/xss-through-dom runs in CI. This complementary local gate uses
// the TypeScript AST to discover every production module and every supported
// HTML-writing API. Fingerprints make additions and modifications fail until
// the changed sink is reviewed and the policy is intentionally refreshed.
console.log('3c. exhaustive HTML sink review ratchet');

const contextCardEditorSrc = read('js/context-card-editor-ui.js');
const contextCardLifestyleSrc = [read('js/context-card-lifestyle-editors-impl.js'), read('js/context-card-lifestyle-special-editors.js')].join('\n');
const contextLightMirrorSrc = read('js/components/ContextLightSetupMirror.svelte');
assert('context Light setup mirror owns its deferred editor styling',
  contextLightMirrorSrc.includes('data-context-light-setup') &&
  contextLightMirrorSrc.includes('data-light-burden-tier') &&
  contextLightMirrorSrc.includes('gb:context-form:border-danger') &&
  read('css/context-editor.tailwind.css').includes('@source "../js/components/ContextLightSetupMirror.svelte"') &&
  !contextEditorCssAuditSrc.includes('.ctx-lightsetup-ott-badge'));
assert('Context select field escapes label text',
  /function renderSelectField[\s\S]{0,1800}<label class="ctx-field-label"[^>]*>\$\{escapeHTML\(label\)\}<\/label>/.test(contextCardEditorSrc));
assert('Context tags field escapes label text',
  /function renderTagsField[\s\S]{0,1800}<label class="ctx-field-label"[^>]*>\$\{escapeHTML\(label\)\}<\/label>/.test(contextCardEditorSrc));
assert('Context editor controls use delegated data actions',
  contextCardEditorSrc.includes('initContextEditorDelegates')
    && contextCardEditorSrc.includes('contextEditorActionAttrs')
    && !/\son(?:click|keydown|input|change)\s*=/.test(contextCardEditorSrc));
assert('Lifestyle context actions use delegated badge handlers and authored dialog callbacks',
  contextCardLifestyleSrc.includes('initLifestyleContextDelegates')
    && read('js/components/ContextFoodContaminantsBadge.svelte').includes('data-lifestyle-action="show-diet-contaminants"')
    && read('js/components/ContextFoodContaminants.svelte').includes('if (current()) discuss()')
    && read('js/components/ContextFoodContaminants.svelte').includes('if (current()) close()')
    && !/\son(?:click|keydown)\s*=/.test(contextCardLifestyleSrc));
assert('Lens settings controls use delegated handlers',
  lensKnowledgeBaseUiSrc.includes("from './lens-actions.js'")
    && lensActionsSrc.includes('function handleLensActionClick')
    && lensActionsSrc.includes('function handleLensActionChange')
    && lensActionsSrc.includes('export function lensActionAttrs')
    && !/\son(?:click|change|input)\s*=/.test(lensKnowledgeBaseUiSrc));
assert('Lens page controls use delegated shell actions',
  lensPagesSrc.includes("from './components/LensDataPage.svelte.html.js'")
    && lensPagesSrc.includes("projectLensActions('body')")
    && lensPagesSrc.includes("projectLensActions('tips',")
    && lensDataPageSrc.includes('<LensActionButtons view={view.actions}/>')
    && /<BodySources\s+view=\{content.view\}/.test(lensDataWidgetBodySrc)
    && /<button\b[^>]*type="button"[^>]*data-lens-page-action=\{button.action\}/s.test(lensActionButtonsSrc)
    && /<button\b[^>]*data-lens-page-action="open-wearables-settings"/s.test(lensBodySourcesSrc)
    && lensContentProjectorSrc.includes("action: 'open-wearables-settings'")
    && lensContentProjectorSrc.includes("action: 'open-privacy-settings'")
    && lensPageShellSrc.includes("callLensPageRuntime('openSettingsModal', 'wearables')")
    && lensPageShellSrc.includes("callLensPageRuntime('openSettingsModal', 'privacy')")
    && lensPageShellSrc.includes("document.addEventListener('click', handleLensPageShellClick)")
    && !/\son(?:click|change|input)\s*=/.test(lensPagesSrc)
    && [lensContentViewSrc, lensDataPageSrc, lensDataWidgetBodySrc, lensActionButtonsSrc, lensBodySourcesSrc].every(source => !authoredEventAttributePattern.test(source)));
// Parse only authored attributes: prose such as "one SNP" is not an event handler.
function hasAuthoredEventAttributes(source: string): boolean {
  function visit(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    if ('type' in value) {
      if (value.type === 'OnDirective' || value.type === 'SpreadAttribute') return true;
      if (value.type === 'Attribute' && 'name' in value && typeof value.name === 'string'
        && /^on[a-z]+$/.test(value.name)) return true;
    }
    return Object.values(value).some(visit);
  }
  return visit(parseSvelte(source, {modern: true}).fragment);
}
assert('authored event audit accepts ordinary prose', !hasAuthoredEventAttributes('<p>Use one SNP, only once.</p>'));
for (const [label, markup] of [
  ['quoted event', '<button onclick="handler()">Save</button>'],
  ['braced event', '<button onclick={handler}>Save</button>'],
  ['shorthand event', '<button {onclick}>Save</button>'],
  ['legacy directive', '<button on:click|preventDefault={handler}>Save</button>'],
  ['forwarded event', '<button on:click>Save</button>'],
  ['unknown spread', '<button {...props}>Save</button>'],
]) assert('authored event audit rejects ' + label, hasAuthoredEventAttributes(markup!));
const manualSnpViewSrc = read('js/components/ManualSnpDialog.svelte');
assert('DNA controls use delegated actions',
  dnaSurfaceSrc.includes("from './dna-actions.js'")
    && dnaActionsSrc.includes('function handleDnaActionClick')
    && dnaActionsSrc.includes('function handleDnaActionKeydown')
    && dnaActionsSrc.includes('export function dnaActionAttrs')
    && !/\son(?:click|keydown|change|input)\s*=/.test(dnaSurfaceSrc)
    && !hasAuthoredEventAttributes(manualSnpViewSrc));

const _domSinkAuditSource = read('scripts/dom-sink-audit.mjs');
const _domSinkPolicy = JSON.parse(read('scripts/dom-sink-policy.json'));
assert(
  `all ${_domSinkPolicy.scannedFiles} production JS/TS modules are included in DOM sink discovery`,
  _domSinkPolicy.scannedFiles > 100
    && _domSinkAuditSource.includes("const SOURCE_ROOT = path.join(ROOT, 'js')")
    && walkSourceFiles(path.join(ROOT, 'js')).length === _domSinkPolicy.scannedFiles,
);
assert(
  `${_domSinkPolicy.sinkCount} HTML-writing sinks retain committed reviewed fingerprints`,
  auditDomSinks(_domSinkPolicy).ok
    && _domSinkAuditSource.includes('export function auditDomSinks')
    && _domSinkAuditSource.includes('expected.count !== actual.count || expected.digest !== actual.digest'),
);

// ═══════════════════════════════════════
// 4. Division by zero guards (utils.js)
// ═══════════════════════════════════════
console.log('4. Division by Zero Guards');

const utilsSrc = read('js/utils.js');
assert('getRangePosition guards refMax === refMin', utilsSrc.includes('refMax === refMin'));
assert('getTrend guards prev === 0', utilsSrc.includes('prev === 0'));

// ═══════════════════════════════════════
// 5. CSS variable fixes
// ═══════════════════════════════════════
console.log('5. CSS Variable Fixes');

const cssSrc = readCssBundle();
const lightSunCss = read('css/light-sun.css');
const lightChannelsCss = read('css/light-channels.css');
const lightPageComponent = read('js/components/LightPagePresentation.svelte');
const lightActionsComponent = read('js/components/LightSessionActions.svelte');
const lightLiveReadoutsComponent = read('js/components/LightLiveReadouts.svelte');
const lightActiveProjection = read('js/light-active-session-presentation.ts');
const lightSetupClasses = read('js/light-setup-classes.ts');
const lightSetupRecipeCatalog = read('scripts/style-recipes/light-setup.mts');
const lightOnboardingClasses = read('js/light-onboarding-ai-classes.ts');
const lightRowComponent = read('js/components/LightSessionRow.svelte');
const lightDetailComponent = read('js/components/LightSessionDetail.svelte');
const lightMethodsComponent = read('js/components/LightMethods.svelte');
const channelPillClasses = read('js/light-channel-pill-classes.ts');
const channelDetailClasses = read('js/light-channel-classes.ts');
const channelPillsComponent = read('js/components/LightChannelPills.svelte');
const channelDetailComponent = read('js/components/LightChannelDetail.svelte');
const channelChartComponent = read('js/components/LightChannelChart.svelte');
const lightConditionsCss = read('css/light-conditions-now.css');
const lightConditionsClasses = read('js/light-conditions-classes.ts');
const lightConditionsTailwind = read('css/light-conditions-now.tailwind.css');
const lightSetupCss = read('css/light-setup.css');
read('js/sun.js');
const sunActiveSessionSrc = read('js/sun-active-session.js');
const sunActiveSessionFormatSrc = read('js/sun-active-session-format.js');
const modalLifecycleSrc = read('js/modal-lifecycle.js');
const markerAnalysisSrc = read('js/marker-analysis.js');
const sunSessionUiSrc = read('js/sun-session-ui.js');
const lightDevicesSrc = read('js/light-devices.js');
assert('No var(--card-bg) reference', !cssSrc.includes('var(--card-bg)'));
assert('No var(--text) without suffix', !/(var\(--text\))(?!-)/.test(cssSrc));
assert('Dead overview-grid CSS removed', !cssSrc.includes('.overview-grid'));
assert('Dead overview-card CSS removed', !cssSrc.includes('.overview-card'));
assert('Light page uses scoped layout wrapper', lightPageComponent.includes('class="light-page ') && lightPageComponent.includes('data-light-page-presentation'));
assert('Modal lifecycle helpers live outside sun-active-session.js',
  /export function wireBackdropClose/.test(modalLifecycleSrc)
    && /export function trapModalFocus/.test(modalLifecycleSrc)
    && !/export function _wireBackdropClose|export function trapModalFocus/.test(sunActiveSessionSrc));
assert('Marker analysis helpers live outside data.js',
  /export function getEffectiveRange\(/.test(markerAnalysisSrc)
    && /export function detectTrendAlerts\(/.test(markerAnalysisSrc)
    && !/export function getEffectiveRange\(|export function detectTrendAlerts\(/.test(dataSrc));
const dashboardWidgetsBlock = (dashboardWidgetsSrc.match(/const dashboardWidgets = \[([\s\S]*?)\];/) || [null, ''])[1];
const lightSessionLogStart = lightPageViewSrc.indexOf('function getLightSessionLogActionsView');
const lightSessionLogEnd = lightPageViewSrc.indexOf('function renderLightSessionLogActions', lightSessionLogStart);
const lightSessionLogBlock = lightSessionLogStart >= 0 && lightSessionLogEnd > lightSessionLogStart
  ? lightPageViewSrc.slice(lightSessionLogStart, lightSessionLogEnd)
  : '';
const dashboardFocusCardBlock = (cssSrc.match(/\.dashboard-widget\[data-widget-id="focus"\] \.focus-card\s*{([\s\S]*?)}/) || [null, ''])[1];
const dashboardFocusCardBodyBlock = (cssSrc.match(/\.dashboard-widget\[data-widget-id="focus"\] \.focus-card-body\s*{([\s\S]*?)}/) || [null, ''])[1];
const dashboardFocusCardTextBlock = (cssSrc.match(/\.dashboard-widget\[data-widget-id="focus"\] \.focus-card-text\s*{([\s\S]*?)}/) || [null, ''])[1];
assert('Dashboard focus card does not truncate AI output',
  dashboardFocusCardBlock &&
  !/max-height\s*:/.test(dashboardFocusCardBlock) &&
  !/overflow\s*:\s*hidden/.test(dashboardFocusCardBodyBlock || '') &&
  !/-webkit-line-clamp|line-clamp|overflow\s*:\s*hidden/.test(dashboardFocusCardTextBlock || ''),
  'Dashboard and Insight should show the same full focus-card text');
assert('Light page renders as a reorderable page widget route',
  lightPageViewSrc.includes("getLensContentGrid('light', widgets)") &&
  read('js/components/LightPageWidgets.svelte').includes('data-lens-route={view.route}') &&
  lightPageViewSrc.includes("id: 'light-conditions-now'") &&
  lightPageViewSrc.includes("id: 'light-session-log'") &&
  lightPageViewSrc.includes("id: 'light-setup'") &&
  lightPageViewSrc.includes("id: 'light-channels'") &&
  lightPageViewSrc.includes("id: 'light-devices'") &&
  lightPageViewSrc.includes("id: 'light-environment'") &&
  lightPageViewSrc.includes("id: 'light-tools'") &&
  lightPageViewSrc.includes("id: 'light-methods'") &&
  !lightPageViewSrc.includes("id: 'light-workbench'") &&
  !lightPageViewSrc.includes("id: 'light-now-log'"));
assert('Light page uses full workspace width',
  lightPageComponent.includes('gb:light-page:w-full') && lightPageComponent.includes('gb:light-page:max-w-none'));
assert('Light page grid uses zero-min track for mobile',
  lightPageComponent.includes('gb:light-page:grid-cols-[minmax(0,1fr)]') &&
  lightPageComponent.includes('gb:light-page:min-w-0') &&
  lightPageComponent.includes('gb:light-page:[&>*]:min-w-0') &&
  lightPageComponent.includes('gb:light-page:[&>*]:max-w-full'));
assert('Light page splits conditions, setup, and logging into separate widgets',
  !lightPageViewSrc.includes('class="light-top-grid"') &&
  lightPageViewSrc.indexOf("id: 'light-conditions-now'") < lightPageViewSrc.indexOf("id: 'light-setup'") &&
  lightPageViewSrc.indexOf("id: 'light-setup'") < lightPageViewSrc.indexOf("id: 'light-session-log'"));
assert('Light dashboard registry exposes only dashboard-safe Light widgets',
  dashboardWidgetsBlock.includes("id: 'light-today'") &&
  dashboardWidgetsBlock.includes("id: 'light-conditions-now'") &&
  dashboardWidgetsBlock.includes("id: 'light-live-session'") &&
  dashboardWidgetsBlock.includes("id: 'light-session-log'") &&
  dashboardWidgetsBlock.includes("id: 'light-channels'") &&
  !dashboardWidgetsBlock.includes("id: 'light-setup'") &&
  !dashboardWidgetsBlock.includes("id: 'light-guidance'") &&
  !dashboardWidgetsBlock.includes("id: 'light-sessions'") &&
  !dashboardWidgetsBlock.includes("id: 'light-devices'") &&
  !dashboardWidgetsBlock.includes("id: 'light-environment'") &&
  !dashboardWidgetsBlock.includes("id: 'light-tools'") &&
  !dashboardWidgetsBlock.includes("id: 'light-methods'"));
assert('Dashboard Light Today uses the same hero surface as the Light page',
  dashboardRenderersSrc.includes('function renderDashboardLightTodayWidget()') &&
  dashboardRenderersSrc.includes('const hero = renderLightTodayHero();') &&
  dashboardViewCompositionSrc.includes('renderLoadedLightTodayHero,') &&
  dashboardViewCompositionSrc.includes('renderLightTodayHero: renderLoadedLightTodayHero,') &&
  !dashboardViewCompositionSrc.includes("from './light-today-ai.js'") &&
  /id: 'light-today'[\s\S]*?render: renderers\.renderDashboardLightTodayWidget/.test(dashboardWidgetsBlock) &&
  !/id: 'light-today'[\s\S]*?render:\s*\(\)\s*=>\s*renderLightTodayStrip\(\)/.test(dashboardWidgetsBlock));
assert('Dashboard Light Today stays separate from Conditions Now',
  dashboardRenderersSrc.includes('return heroHtml;') &&
  !dashboardRenderersSrc.includes('cond-now-dashboard-light-today-widget') &&
  !cssSrc.includes('.dashboard-widget[data-widget-id="light-today"] .light-conditions-now-wrap'));
assert('Dashboard Conditions Now uses the full Light page timeline layout',
  dashboardRenderersSrc.includes("renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-dashboard-widget' })") &&
  /id: 'light-conditions-now'[\s\S]*?size: 'full'/.test(dashboardWidgetsBlock));
assert('Light page dashboard toggles are explicitly scoped',
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-today' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-conditions-now' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-live-session' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-session-log' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-channels' }") &&
  /id: 'light-setup'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-guidance'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-sessions'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-devices'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-environment'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-tools'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-methods'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  lensPageShellSrc.includes("Object.prototype.hasOwnProperty.call(opts, 'dashboardId')"));
assert('Light Conditions Now chrome is owned by split CSS',
  lightConditionsClasses.includes("[.dashboard-widget[data-widget-id='light-conditions-now']_&.light-conditions-now-wrap]:bg-transparent") &&
  lightConditionsClasses.includes("[.dashboard-widget[data-widget-id='light-conditions-now']_&.light-conditions-now-wrap]:[box-shadow:none]") &&
  lightConditionsCss.includes('data-light-conditions-presentation') &&
  lightConditionsTailwind.includes('@source "../js/light-conditions-classes.ts"') &&
  !lightSunCss.includes('.dashboard-widget[data-widget-id="light-conditions-now"] .light-conditions-now-wrap'));
assert('Light session widget keeps deframed operation surface',
  /\.dashboard-widget\[data-widget-id="light-session-log"\] \.light-quicklog-row\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/.test(lightSunCss));
assert('Live Light widget uses a shared full-width renderer with wrapping estimates',
  /id: 'light-live-session'[\s\S]*?size: 'full'[\s\S]*?render: renderers\.renderDashboardLightLiveSessionWidget/.test(dashboardWidgetsBlock) &&
  lightPageViewSrc.includes('export function renderLightLiveSession') &&
  dashboardRenderersSrc.includes('return renderLightLiveSession({ includeEmptyState: true });') &&
  lightLiveReadoutsComponent.includes('sun-session-live-readouts gb:light-active:flex gb:light-active:flex-wrap'));
assert('Active sun card keeps vitamin D visible outside the fixed header',
  lightLiveReadoutsComponent.includes('sun-session-live-readouts') &&
  lightLiveReadoutsComponent.includes('☀ Vitamin D estimate') &&
  sunActiveSessionSrc.includes("kind: 'live-readouts', readouts: liveSessionReadouts(") &&
  lightActiveProjection.includes('Number.isFinite(iu) && iu > 0') &&
  !lightActiveProjection.includes('iu >= 50') && !sunActiveSessionSrc.includes('if (iu >= 50)'));
assert('Light setup chrome is owned by split CSS',
  /\.light-page \.dashboard-widget\[data-widget-id="light-setup"\] \.light-setup-card,[\s\S]*\.light-page \.dashboard-widget\[data-widget-id="light-setup"\] \.light-setup-summary\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/.test(lightSetupCss) &&
  !/\.light-setup-card\s*\{/.test(lightSunCss) &&
  !/\.light-setup-focus-modal\s*\{/.test(lightSunCss));
assert('Conditions Now CSS owns its carriers and responsive grid styles while app shell owns the shared tooltip',
  lightConditionsClasses.includes('gb:conditions:grid-cols-[2fr_1fr_1fr_1fr]') &&
  lightConditionsCss.includes('grid-template-columns:2fr 1fr 1fr 1fr') &&
  lightConditionsClasses.includes('gb:conditions:conditions-narrow:grid-cols-[1fr]') &&
  /\.app-tooltip\s*\{[\s\S]*position:\s*fixed/.test(appShellCssAuditSrc) &&
  appShellCssAuditSrc.includes('[data-app-tooltip] {') &&
  appShellCssAuditSrc.includes('button[data-app-tooltip] {') &&
  appShellCssAuditSrc.includes('[aria-describedby="app-tooltip"]:focus-visible') &&
  /\.app-tooltip\.is-visible/.test(appShellCssAuditSrc) &&
  /@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.app-tooltip/.test(appShellCssAuditSrc) &&
  lightConditionsCss.includes('.light-conditions-now-actions [data-conditions-tooltip]') &&
  !lightConditionsCss.includes('[data-app-tooltip]') &&
  !/\.app-tooltip\s*\{/.test(lightConditionsCss) &&
  !/\.conditions-now-grid\s*\{/.test(lightSunCss) &&
  !/\.app-tooltip\s*\{/.test(lightSunCss));
assert('Light setup CSS owns onboarding editor and setup AI styles',
  lightSetupRecipeCatalog.includes('[border-top:3px_solid_var(--accent)]') &&
  lightSetupClasses.includes('"light-setup-ott-questions"') &&
  lightSetupRecipeCatalog.includes('[grid-template-columns:repeat(2,_minmax(0,_1fr))]') &&
  lightOnboardingClasses.includes('gb:onboarding-ai:p-0') &&
  lightOnboardingClasses.includes('gb:onboarding-ai:bg-transparent') &&
  lightOnboardingClasses.includes('gb:onboarding-ai:[border:0]'));
assert('Light channel presentation is owned by authored components and scoped Tailwind',
  channelPillsComponent.includes('LightChannelSparkline') &&
  channelDetailComponent.includes('LightChannelChart') &&
  channelDetailComponent.includes('LightChannelResearch') &&
  channelPillClasses.includes('gb:channel-pill:') && channelDetailClasses.includes('gb:channel-detail:') &&
  !/\.light-pill\s*\{/.test(lightChannelsCss) &&
  !/\.light-channel-detail\s*\{/.test(lightChannelsCss) &&
  !/\.light-channel-mix-ai\s*\{/.test(lightChannelsCss) &&
  !/\.light-channels-section \.light-pill\s*\{/.test(read('css/light-sun.base.css')));
assert('Light devices CSS owns device cards, picker, and distance controls',
  deviceLibraryClasses('light-devices-section').includes('[margin-top:24px]') &&
  deviceLibraryClasses('light-device-card').includes('[display:flex]') &&
  deviceLibraryClasses('light-device-card').includes('[flex-direction:column]') &&
  read('js/components/LightDeviceLibrary.svelte').includes('light-device-card') &&
  deviceSetupClasses('dev-distance-row').includes('[display:flex]') &&
  read('js/components/LightDeviceSpecFields.svelte').includes("c('dev-distance-row')") &&
  read('js/components/LightDevicePicker.svelte').includes('light-device-picker-row') &&
  deviceLibraryClasses('light-device-picker-row').includes('[cursor:pointer]') &&
  !/\.light-device-card\s*\{/.test(lightSunCss) &&
  !/\.dev-distance-row\s*\{/.test(read('css/light-sun.base.css')) &&
  !/\.light-device-picker-row\s*\{/.test(lightSunCss));
assert('Light page workbench is split into page-only redesigned widgets',
  lightPageViewSrc.includes("id: 'light-devices'") &&
  lightPageViewSrc.includes("id: 'light-environment'") &&
  lightPageViewSrc.includes("id: 'light-tools'") &&
  lightPageViewSrc.includes("id: 'light-methods'") &&
  lightPageViewSrc.includes('renderLightWidgetPrompt') &&
  read('js/components/LightWidgetPrompt.svelte').includes('light-widget-prompt gb:light-page:') &&
  lightSetupClasses.includes('light-setup-fields-grid') &&
  lightSessionLogBlock.includes("kind: 'actions'") && lightActionsComponent.includes('data-light-page-action={action.action}') && lightActionsComponent.includes('gb:light-page:bg-accent') &&
  !lightSessionLogBlock.includes('import-btn') && !lightActionsComponent.includes('import-btn') &&
  !lightPageViewSrc.includes('function renderCollapsedSubsection'));
assert('Light conditions grid stays compact on phones',
  lightConditionsClasses.includes('gb:conditions:max-[600px]:grid-cols-[repeat(3,minmax(0,1fr))]') &&
  lightConditionsClasses.includes('gb:conditions:max-[600px]:col-[1/-1]') &&
  lightConditionsClasses.includes('gb:conditions:conditions-narrow:grid-cols-[1fr]'));
assert('Light page sun data source avoids inline card styling',
  lightMethodsComponent.includes('class="light-data-source-details gb:light-page:') &&
  !/<details[^>]*class="light-data-source-details[^>]*style=/.test(lightMethodsComponent));
assert('Light channel pills use redesigned channel tile treatment',
  channelPillClasses.includes('[grid-template-columns:repeat(auto-fit,_minmax(min(174px,_100%),_1fr))]') &&
  channelPillClasses.includes("[grid-template-areas:'icon_label_count'_'icon_spark_spark']") &&
  channelPillClasses.includes('[box-shadow:inset_3px_0_0') &&
  channelPillClasses.includes('violet_eye:') && channelPillClasses.includes('[--channel-accent:var(--purple)]'));
assert('Light channel detail charts inherit activated channel accent',
  channelDetailComponent.includes('data-channel={view.channel}') &&
  channelChartComponent.includes('fill="var(--channel-accent, var(--accent))"') &&
  channelDetailClasses.includes('[--channel-accent:var(--accent)]') &&
  channelDetailClasses.includes('[border:1px_solid_color-mix(in_srgb,_var(--channel-accent)') &&
  channelDetailClasses.includes('violet_eye:') && channelDetailClasses.includes('[--channel-accent:var(--purple)]') &&
  channelDetailClasses.includes('color-mix(in_srgb,_var(--channel-accent)_8%,_transparent)'));
assert('Light recent session rows and modals use session/channel accents',
  lightRowComponent.includes('sun-session light-session-row light-session-complete light-session-${view.kind}') &&
  lightRowComponent.includes("view.kind === 'sun' ? 'gb:light-session:bg-[var(--yellow-bg)] gb:light-session:text-warning-ink' : 'gb:light-session:bg-[var(--red-bg)] gb:light-session:text-danger-ink'") &&
  !lightSessionsViewSrc.includes('_renderLightSessionChannelChips') &&
  sunSessionUiSrc.includes("kind: 'sun', id:") && lightDevicesSrc.includes("kind: 'device', id:") &&
  lightDetailComponent.includes('data-session-kind={view.kind}') &&
  lightDetailComponent.includes('sun-detail-channel-row sun-detail-channel-row-clickable gb:light-detail:grid') &&
  lightDetailComponent.includes('sun-chip-tier-${item.hasSignal ? 2 : 0}') &&
  lightDetailComponent.includes('data-channel={item.key}') &&
  lightDetailComponent.includes('gb:light-detail:grid-cols-[30px_minmax(0,1fr)_auto_auto_14px]') &&
  lightDetailComponent.includes('[--session-accent:var(--orange)]') &&
  lightDetailComponent.includes('[--session-accent:var(--red)]') &&
  lightDetailComponent.includes('[box-shadow:var(--shadow-lg),inset_0_3px_0_color-mix(in_srgb,var(--session-accent)_78%,transparent)]'));
assert('Sun session chip legacy vitamin D path applies genetics multiplier',
  sunSessionUiSrc.includes('uiDeps.vitaminDIU(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null)'));
assert('Active sun session live and stop vitamin D paths apply genetics multiplier',
  sunActiveSessionFormatSrc.includes('options.vitaminDIU(vitaminDAu, fitzpatrick, uvIndex, !!session.bodyExposure?.rotatedSides, options.genetics || null)') &&
  sunActiveSessionSrc.includes('genetics: state.importedData?.genetics') &&
  sunActiveSessionSrc.includes('activeDeps.vitaminDIU(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null)'));
assert('Light context setup mirror is not double-framed',
  !/gb:context-form:(?:border|bg-|shadow)/.test(contextLightMirrorSrc.match(/<section[^>]+>/)?.[0] || '') &&
  !cssSrc.includes('.ctx-lightsetup-mirror'));
assert('Light setup AI context wrapper is not double-framed',
  lightOnboardingClasses.includes('gb:onboarding-ai:p-0') &&
  lightOnboardingClasses.includes('gb:onboarding-ai:bg-transparent') &&
  lightOnboardingClasses.includes('gb:onboarding-ai:[border:0]') &&
  lightOnboardingClasses.includes('gb:onboarding-ai:rounded-none') &&
  !/['"]light-setup-ai-block-(green|yellow|red)['"]\s*:/.test(lightOnboardingClasses));
assert('Light page surfaces use shared card/theme tokens',
  lightPageComponent.includes('class="light-page ') &&
  read('js/light-channel-section-classes.ts').includes('[background:color-mix(in_srgb,_var(--bg-card)_94%,_transparent)]') &&
  lightSetupRecipeCatalog.includes('[border-top:3px_solid_var(--accent)]') &&
  lightSetupRecipeCatalog.includes('[background:color-mix(in_srgb,_var(--bg-card)_94%,_transparent)]'));
assert('Light page status chips use theme tokens instead of legacy blue fallbacks',
  !cssSrc.includes('var(--accent-bg, rgba(96,165,250,0.10))') &&
  cssSrc.includes('background: color-mix(in srgb, var(--accent) 10%, transparent);') &&
  lightConditionsClasses.includes('gb:conditions:[&_.conditions-now-value]:[color:var(--conditions-purple,var(--purple))]') &&
  lightConditionsClasses.includes('gb:conditions:[&_.conditions-now-label]:before:[background:var(--purple)]'));
assert('Mobile hides closed chat panel so it cannot widen pages',
  /@media \(max-width:\s*768px\)\s*\{[\s\S]*\.chat-panel:not\(\.open\)\s*\{[\s\S]*display:\s*none;/.test(cssSrc));
const quickMarkerBaseIndex = cssSrc.indexOf('.db-quick-marker-grid {\n  display: grid;');
const quickMarkerMobileIndex = cssSrc.indexOf('@media (max-width: 640px)', quickMarkerBaseIndex);
assert('Mobile quick marker grid override comes after base grid',
  quickMarkerBaseIndex !== -1 &&
  quickMarkerMobileIndex !== -1 &&
  /\.db-quick-marker-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/.test(cssSrc.slice(quickMarkerMobileIndex, quickMarkerMobileIndex + 1800)));
assert('Mobile compare tables scroll instead of clipping columns',
  /@media \(max-width:\s*768px\)\s*\{[\s\S]*\.data-table-wrapper,\s*[\s\S]*\.compare-table-wrapper,\s*[\s\S]*\.heatmap-wrapper\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*overflow-y:\s*clip;/.test(cssSrc) &&
  read('js/components/CompareDatesPage.svelte').includes('class="compare-date-field"'));
const importPreviewHeadBlock = cssSrc.match(/\.import-preview-head\s*\{([\s\S]*?)\}/)?.[1] || '';
const importReviewActionsBlock = cssSrc.match(/\.import-review-actions\s*\{([\s\S]*?)\}/)?.[1] || '';
assert('Import review modal header/footer are not sticky',
  !/position:\s*sticky/.test(importPreviewHeadBlock) &&
  !/position:\s*sticky/.test(importReviewActionsBlock));
assert('Compare and correlations headings are text-only',
  read('js/components/CompareDatesPage.svelte').includes('<h2>Compare Dates</h2>') &&
  read('js/components/CorrelationsSelectionPage.svelte').includes('<h2>Correlations</h2>') &&
  migratedAudit.contracts.compareHeading && migratedAudit.contracts.correlationsHeading &&
  !compareCorrelationsSrc.includes('<h2>\\u2194 Compare Dates</h2>') &&
  !compareCorrelationsSrc.includes('<h2>\\uD83D\\uDCC8 Correlations</h2>'));
const themesExtraSrc = read('themes-extra.css');
assert('Glass theme includes Light page surfaces',
  lightSetupRecipeCatalog.includes("[[data-theme='glass']_&]") &&
  lightConditionsClasses.includes("gb:conditions:[[data-theme='glass']_&]:[backdrop-filter:blur(8px)_saturate(140%)]") &&
  !themesExtraSrc.includes('[data-theme="glass"] .light-conditions-now-wrap'));

// ═══════════════════════════════════════
// 6. Data integrity fixes
// ═══════════════════════════════════════
console.log('6. Data Integrity');

assert('Ferritin lookup uses iron category', /'iron'\s*,\s*'ferritin'/.test(markerAnalysisSrc) && !/'hematology'\s*,\s*'ferritin'/.test(markerAnalysisSrc));
const staticRangeConversionGuard =
  dataSrc.includes("['refMin', 'refMax', 'optimalMin', 'optimalMax']")
  && dataSrc.includes('if (marker[key] != null)');
assert('Unit conversion guards null refMin', staticRangeConversionGuard);
assert('Unit conversion guards null refMax', staticRangeConversionGuard);

const schemaSrc = read('js/schema.js');
const apoMatch = schemaSrc.match(/lipids\.apoAI.*?optimalMax:\s*([\d.]+)/);
if (apoMatch) {
  const apoOptMax = parseFloat(apoMatch[1]!);
  assert('apoAI optimalMax <= refMax (1.70)', apoOptMax <= 1.70, `optimalMax = ${apoOptMax}`);
}

// ═══════════════════════════════════════
// 7. Error handling
// ═══════════════════════════════════════
console.log('7. Error Handling');

const apiModelsSrc = read('js/api-models.js');
const apiProviderStorageSrc = read('js/api-provider-storage.js');
assert('Venice models JSON.parse guarded', apiProviderStorageSrc.includes('function readStoredArray(key)'));
assert('OpenRouter models JSON.parse guarded', apiProviderStorageSrc.includes("readStoredArray('labcharts-openrouter-models')"));
assert('OpenRouter pricing JSON.parse guarded', /try\s*\{\s*cached = JSON\.parse\(localStorage\.getItem\('labcharts-openrouter-pricing'\)/.test(apiProviderStorageSrc));

const reportSrc = `${read('js/export-report.js')}\n${read('js/export-report-html.js')}`;
assert('PDF report null popup guard', reportSrc.includes('if (!win)'));
assert('PDF report context serialization', reportSrc.includes('fmtCtx'));

const pdfSrc = read('js/pdf-import.js');
const pdfReviewSrc = read('js/pdf-import-review.js');
const pdfNormalizationSrc = read('js/pdf-import-marker-normalization.js');
assert('NaN markers filtered out', pdfNormalizationSrc.includes('filter(marker => !isNaN(marker.value))'));

// ═══════════════════════════════════════
// 8. Duplicate code cleanup
// ═══════════════════════════════════════
console.log('8. Code Cleanup');

assert('pdf-import-review.js imports formatCost from schema', pdfReviewSrc.includes('formatCost') && pdfReviewSrc.includes("from './schema.js'"));
const localFormatCost = `${pdfSrc}\n${pdfReviewSrc}`.match(/^function formatCost/m);
assert('PDF import modules have no local formatCost', !localFormatCost);
assert('PDF import review modal uses delegated actions',
  pdfReviewSrc.includes('function initImportReviewDelegates()') &&
  pdfReviewSrc.includes('data-import-review-action') &&
  !/\son(?:click|change|input)\s*=/.test(pdfReviewSrc));

// ═══════════════════════════════════════
// 9. OpenRouter curated prefixes
// ═══════════════════════════════════════
console.log('9. OpenRouter Curated List');

const curatedMatch = apiModelsSrc.match(/OPENROUTER_CURATED\s*=\s*\[([\s\S]*?)\]/);
if (curatedMatch) {
  const curated = curatedMatch[1]!;
  assert('Curated uses anthropic/claude- prefix (no dots in version)', !curated.includes('claude-sonnet-4.6') && !curated.includes('claude-opus-4.6'));
  assert('Curated has anthropic prefix', curated.includes('anthropic/'));
  assert('Curated has google prefix', curated.includes('google/'));
  assert('Curated has x-ai prefix', curated.includes('x-ai/'));
}

// ═══════════════════════════════════════
// 10. Accessibility
// ═══════════════════════════════════════
console.log('10. Accessibility');

assert('Skip-to-content link exists', indexSrc.includes('class="skip-link"'));
assert('Skip link targets #main-content', indexSrc.includes('href="#main-content"'));
assert('Skip link CSS', cssSrc.includes('.skip-link'));

const navSrc = read('js/nav.js');
const appEventsSrc = read('js/app-event-listeners.js');
assert('Nav items have tabindex', navSrc.includes('renderSidebarPresentation(view)')
  && read('js/components/SidebarCategoryItem.svelte').includes('tabindex="0"') && migratedAudit.contracts.navTabindex);
assert('Nav items have role=button', navSrc.includes('renderSidebarPresentation(view)')
  && read('js/components/SidebarCategoryItem.svelte').includes('role="button"') && migratedAudit.contracts.navRole);
assert('Nav items use delegated actions instead of inline handlers',
  navSrc.includes('data-nav-action') &&
    navSrc.includes('installNavActionDelegates') &&
    !/\bon(?:click|input|keydown)=/.test(navSrc));
assert('Nav role-button keyboard activation remains delegated globally',
  appEventsSrc.includes('function handleRoleButtonKeydown') &&
    appEventsSrc.includes('t.click()'));
assert('Category labels escaped in sidebar', navSrc.includes('sidebarText(label)')
  && read('js/components/SidebarCategoryItem.svelte').includes('{view.label}') && migratedAudit.contracts.sidebarLabel);

assert('Focus trap for modals', appEventsSrc.includes('e.key === "Tab"') && appEventsSrc.includes('focusable'));

// ═══════════════════════════════════════
// 11. Event listener leak fix
// ═══════════════════════════════════════
console.log('11. Event Listener Leak Fix');

read('js/context-cards.js');
const ctxMedicalHistorySrc = read('js/context-card-medical-history-editor.js');
assert('Diagnoses editor binds suggestion closer once with delegates',
  /function initMedicalHistoryActionDelegates[\s\S]{0,500}document\.addEventListener\('click', closeSuggestionsOnClickOutside\)/.test(ctxMedicalHistorySrc) &&
    !ctxMedicalHistorySrc.includes("document.removeEventListener('click', closeSuggestionsOnClickOutside)"));

// ═══════════════════════════════════════
// 12. Cycle stats NaN guard
// ═══════════════════════════════════════
console.log('12. Cycle Stats Guard');

const cycleSrc = read('js/cycle.ts');
const cycleSummarySrc = read('js/cycle-summary.js');
const cycleEditorClassesSrc = read('js/cycle-editor-classes.ts');
const cycleOverviewViewSrc = read('js/components/CycleOverviewPresentation.svelte');
const cycleOverviewProfileSrc = read('js/components/CycleOverviewProfile.svelte');
const cycleEditorViewSrc = read('js/components/CycleEditorPresentation.svelte');
const cycleAuthoredFiles = fs.readdirSync(path.join(ROOT, 'js/components'))
  .filter(name => /^Cycle[A-Za-z]+\.svelte$/.test(name));
const cycleAuthoredSources = cycleAuthoredFiles.map(name => read(`js/components/${name}`));
assert('Cycle stats filters periods with endDate', cycleSummarySrc.includes('filter(p => p.endDate)'));
assert('Period length guards empty array', cycleSummarySrc.includes('if (periodLengths.length > 0)'));
assert('Cycle renderer no longer uses supplement UI classes',
  !/supp-(timeline-header|add-btn|form-row|form-field|list)/.test(cycleSrc));
assert('Cycle renderer avoids inline style attributes', !cycleSrc.includes('style='));
assert('Cycle editor uses dedicated modal shell',
  cycleSrc.includes("from './cycle-editor-classes.js'") &&
  cycleSrc.includes('modal.className = cycleEditorModalClasses();') &&
  cycleEditorClassesSrc.includes('export function cycleEditorModalClasses(): string') &&
  cycleEditorClassesSrc.includes("return `modal ${cycleEditorClasses('cycle-modal')}`;") &&
  cycleEditorClassesSrc.includes("[name, classes[name] || '', cycleSharedUtilities(name)]"));
assert('Cycle cards use semantic buttons',
  cycleSrc.includes("from './components/CycleOverviewPresentation.svelte.html.js'") &&
  cycleSrc.includes('return renderCycleOverviewPresentation(') &&
  cycleOverviewViewSrc.includes('<CycleOverviewProfile summary={view.summary}/>') &&
  /<button\b[^>]*type="button"[^>]*class=\{c\('cycle-prompt'\)\}[^>]*data-cycle-action="open-editor"/s.test(cycleOverviewProfileSrc) &&
  /<button\b[^>]*type="button"[^>]*class=\{c\('cycle-summary-card'\)\}[^>]*data-cycle-action="open-editor"/s.test(cycleOverviewProfileSrc));
assert('Cycle renderer delegates actions instead of inline handlers',
  cycleSrc.includes('initCycleActionDelegates') &&
    cycleSrc.includes("closestCycleElement(event.target, '[data-cycle-action]')") &&
    cycleSrc.includes("document.addEventListener('click', handleCycleClick)") &&
    cycleSrc.includes("document.addEventListener('change', handleCycleChange)") &&
    cycleSrc.includes('modal.innerHTML = renderCycleEditorPresentation(') &&
    cycleEditorViewSrc.includes('data-cycle-action="close"') &&
    cycleEditorViewSrc.includes('data-cycle-action="save"') &&
    cycleOverviewProfileSrc.includes('data-cycle-action="open-editor"') &&
    !/\son(?:click|change|keydown)\s*=/.test(cycleSrc) &&
    cycleAuthoredFiles.length > 0 &&
    cycleAuthoredFiles.includes('CycleEditorPresentation.svelte') &&
    cycleAuthoredFiles.includes('CycleOverviewProfile.svelte') &&
    cycleAuthoredSources.every(source => !authoredEventAttributePattern.test(source)));
assert('Cycle mobile modal uses full-height layout',
  cssSrc.includes('.cycle-modal') && cssSrc.includes('height: calc(100dvh - 24px)'));
const themeExtraSrc = read('themes-extra.css');
assert('Cycle glass modal has opaque readability override',
  themeExtraSrc.includes('[data-theme="glass"] .cycle-modal') && themeExtraSrc.includes('0.96'));

// ═══════════════════════════════════════
// 13. Security Headers (CSP)
// ═══════════════════════════════════════
console.log('13. Security Headers');

const vercelSrc = read('vercel.json');
assert('CSP header in vercel.json', vercelSrc.includes('Content-Security-Policy'));
assert('CSP has no external CDN beyond jsdelivr (for transformers.js)',
  !vercelSrc.includes('fonts.googleapis.com') && !vercelSrc.includes('unpkg.com'));
assert('CSP allows cdn.jsdelivr.net in script-src (transformers.js)',
  vercelSrc.includes('https://cdn.jsdelivr.net'));
assert('CSP script-src includes blob: (required by ORT proxy worker)',
  /script-src[^;]*\bblob:/.test(vercelSrc));
assert('CSP script-src rejects inline JavaScript',
  !/script-src[^;]*'unsafe-inline'/.test(vercelSrc));
assert('index contains no executable inline scripts',
  !/<script(?:\s[^>]*)?>\s*[^<\s]/.test(indexSrc));
assert('Vercel sends Cross-Origin-Opener-Policy: same-origin',
  /"Cross-Origin-Opener-Policy"\s*:\s*"same-origin"/.test(vercelSrc));
assert('Vercel sends Cross-Origin-Embedder-Policy: credentialless',
  /"Cross-Origin-Embedder-Policy"\s*:\s*"credentialless"/.test(vercelSrc));
assert('No Permissions-Policy header (matches dev-server)',
  !/"Permissions-Policy"/.test(vercelSrc));
assert('CSP connect-src allows https: (decentralized nodes)', vercelSrc.includes("connect-src 'self' https:"));
assert('CSP allows localhost for Local AI', vercelSrc.includes('localhost:*'));
assert('X-Frame-Options DENY', vercelSrc.includes('DENY'));
assert('X-Content-Type-Options nosniff', vercelSrc.includes('nosniff'));

// ═══════════════════════════════════════
// 14. Aria-live & Screen Reader
// ═══════════════════════════════════════
console.log('14. Aria-live & Screen Reader');

assert('Notification container has aria-live', indexSrc.includes('aria-live="polite"'));
assert('Notification container has role=status', indexSrc.includes('role="status"'));
const utilsSrc2 = read('js/utils.js');
assert('Error toasts get role=alert', utilsSrc2.includes("role', 'alert'"));
const utilsConfirmViewSrc = read('js/components/UtilsConfirmPresentation.svelte');
const utilsDialogRenderingSrc = read('js/utils-dialog-rendering.js');
assert('Confirm dialog has role=alertdialog',
  /<div\b[^>]*class=\{c\('confirm-dialog', 'panel'\)\}[^>]*role="alertdialog"[^>]*aria-modal="true"/s.test(utilsConfirmViewSrc) &&
    utilsDialogRenderingSrc.includes("from './components/UtilsConfirmPresentation.svelte.html.js'") &&
    utilsDialogRenderingSrc.includes('renderConfirmHTML({ view: projectUtilsConfirm(facts) })') &&
    utilsSrc2.includes("from './utils-dialog-rendering.js'") &&
    utilsSrc2.includes('overlay.innerHTML = renderUtilsConfirm('));

// ═══════════════════════════════════════
// 15. Colorblind Accessibility
// ═══════════════════════════════════════
console.log('15. Colorblind Accessibility');

assert('Chart card val-high has ::before arrow', cssSrc.includes('.chart-value-num.val-high::before'));
assert('Chart card val-low has ::before arrow', cssSrc.includes('.chart-value-num.val-low::before'));
assert('Table val-high has ::before arrow', cssSrc.includes('.data-table .value-cell.val-high::before'));
assert('Table val-low has ::before arrow', cssSrc.includes('.data-table .value-cell.val-low::before'));
assert('Heatmap high has ::before', cssSrc.includes('.heatmap-high::before'));
assert('Heatmap low has ::before', cssSrc.includes('.heatmap-low::before'));
assert('Compare improved has ::before', cssSrc.includes('.compare-improved::before'));
assert('Compare worsened has ::before', cssSrc.includes('.compare-worsened::before'));
assert('Range bar high has glow', cssSrc.includes('.range-bar-marker.marker-high') && cssSrc.includes('box-shadow'));
assert('Health dot yellow has glow', cssSrc.includes('.ctx-health-dot-yellow') && cssSrc.includes('box-shadow'));
assert('Health dot red has glow', cssSrc.includes('.ctx-health-dot-red') && cssSrc.includes('box-shadow'));

const chartsSrc = read('js/charts.js');
assert('Chart.js pointStyle per status', chartsSrc.includes('ptStyles') && chartsSrc.includes('pointStyle'));

const ctxSrc2 = read('js/context-cards.js');
const ctxHealthDotsSrc = read('js/context-card-health-dots.js').replace(/try\s*{\s*return JSON\.parse/g, 'try { return JSON.parse');
const demoAIConsentSrc = ctxHealthDotsSrc.slice(
  ctxHealthDotsSrc.indexOf('const demoLiveAIConsents'),
  ctxHealthDotsSrc.indexOf('export function applyDotColor'),
);
assert('Health dots facade stays in context-cards', ctxSrc2.includes('loadContextHealthDotsImpl'));
const contextStatusViewSrc = read('js/components/ContextCardStatus.svelte');
assert('Authored health dots have a text title', contextStatusViewSrc.includes('title={model.visible ? model.label : undefined}'));
assert('Authored health indicators expose labeled assessment text',
  contextStatusViewSrc.includes('AI assessment: ${model.label}') && contextStatusViewSrc.includes('ctx-health-label') && contextStatusViewSrc.includes('aria-hidden="true"'));
assert('AI tips expose a text severity label',
  contextStatusViewSrc.includes('data-severity={model.insight ? model.severity : undefined}')
    && contextStatusViewSrc.includes('{model.insightLabel} · {model.severity}'));
assert('AI profile summaries share the cached health-dot batch',
  ctxHealthDotsSrc.includes('cardSummaries') && ctxHealthDotsSrc.includes("summary: '...'"));
assert('AI profile summaries are constrained to reported facts',
  ctxHealthDotsSrc.includes("ONLY the person's explicitly reported information")
    && ctxHealthDotsSrc.includes('maximum 24 words and 160 characters'));
assert('Paid demo AI consent is session-only and never stored in clear text',
  demoAIConsentSrc.includes('new Map()')
    && demoAIConsentSrc.includes('demoLiveAIConsents.set')
    && !demoAIConsentSrc.includes('localStorage.'));

assert('PDF report values have status prefix', reportSrc.includes('sPrefix'));

// ═══════════════════════════════════════
// 16. Context Assembly Pipeline
// ═══════════════════════════════════════
console.log('16. Context Assembly Pipeline');

const labCtxSrc = read('js/lab-context-assembly.js');

assert('buildLabContext has age computation',
  labCtxSrc.includes('Math.floor((now - new Date(state.profileDob).getTime())'));
assert('buildLabContext uses a local calendar date key', labCtxSrc.includes('const today = localDateKey(now)'));
assert('buildLabContext cache refreshes on each local calendar day', labCtxSrc.includes(":day-${localDateKey(Date.now())}"));
assert('buildLabContext has unit system label', labCtxSrc.includes("unit system: ${unitLabel}"));
assert('buildLabContext has fmtDate helper', sourceFunctionHasInitializer(labCtxSrc, '_buildLabContextInner', 'fmtDate', "d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })"));

assert('Health Goals section before Diet section', labCtxSrc.indexOf('## Health Goals') < labCtxSrc.indexOf('## Diet'));
assert('Interpretive Lens before lab values', labCtxSrc.indexOf('Interpretive Lens') < labCtxSrc.indexOf('${cat.label}'));

assert('buildLabContext has global staleness daysSince', labCtxSrc.includes('daysSince'));
assert('buildLabContext has global staleness months ago', labCtxSrc.includes('months ago'));
assert('buildLabContext has per-category staleness', labCtxSrc.includes('catDaysSince') && labCtxSrc.includes('catMonthsAgo'));
assert('Per-category staleness uses warning marker', labCtxSrc.includes('⚠ Last tested'));
assert('buildFocusContext has last labs date', focusCardSrc.includes('last labs'));

const hccCount = (labCtxSrc.match(/hasCardContent\(/g) || []).length;
assert('lab-context.js uses hasCardContent for 7 card gates', hccCount >= 7, `found ${hccCount}`);
assert('lab-context.js imports hasCardContent', labCtxSrc.includes('hasCardContent') && labCtxSrc.includes("from './utils.js'"));
assert('Diagnoses uses hasCardContent', labCtxSrc.includes('hasCardContent(diag)'));
assert('Diet uses hasCardContent', labCtxSrc.includes('hasCardContent(diet)'));
assert('Exercise uses hasCardContent', labCtxSrc.includes('hasCardContent(ex)'));
assert('Sleep uses hasCardContent', labCtxSrc.includes('hasCardContent(sl)'));
assert('Stress uses hasCardContent', labCtxSrc.includes('hasCardContent(st)'));
assert('LoveLife uses hasCardContent', labCtxSrc.includes('hasCardContent(ll)'));
assert('Environment uses hasCardContent', labCtxSrc.includes('hasCardContent(env)'));
assert('Light still uses lc || autoLat gate', labCtxSrc.includes('lc || autoLat'));
const utilsSrc3 = read('js/utils.js');
assert('hasCardContent exported from utils.js', utilsSrc3.includes('export function hasCardContent'));

const chatSystemPromptSrc = read('js/chat-system-prompt.js');
assert('System prompt bounds repeated staleness copy', chatSystemPromptSrc.includes('Flag staleness once per dataset or section') && chatSystemPromptSrc.includes('what a retest could distinguish'));
assert('System prompt forbids invented missing context', chatSystemPromptSrc.includes('Never invent missing context'));
assert('System prompt has role boundaries', chatSystemPromptSrc.includes('## Role and Boundaries'));
assert('System prompt has response experience rules', chatSystemPromptSrc.includes('## Response Experience'));
assert('System prompt has evidence and ranges rules', chatSystemPromptSrc.includes('## Evidence and Ranges'));
assert('System prompt treats lifestyle as modifiers', chatSystemPromptSrc.includes('as modifiers or hypotheses, not automatic causes'));
assert('System prompt encourages conversational warmth', chatSystemPromptSrc.includes('conversational, warm, concise'));
assert('Health goals lead personal-context use', chatSystemPromptSrc.indexOf("Prioritize the user's question and major goals") < chatSystemPromptSrc.indexOf('Treat the interpretive lens'));

assert('chat-send.js delegates prompt assembly to chat-prompt-context', chatSendSrc.includes('buildChatSystemPrompt'));
assert('Persona is separated from and precedes health data', chatPromptContextSrc.includes('personalityPrompt + multiPersonaInstruction') && chatPromptContextSrc.includes('## Current User Health and Lab Context'));

assert('buildFocusContext exists in focus-card.js', focusCardSrc.includes('function buildFocusContext()'));
assert('views.js imports focus card module', viewsSrc.includes("from './focus-card.js'"));
assert('Focus card uses buildFocusContext', focusCardSrc.includes('buildFocusContext()'));
assert('Focus card context-aware system prompt', focusCardSrc.includes("this person's goals/conditions"));
assert('Focus card disables reasoning for its small token cap', /reasoningEffort:\s*'none'/.test(focusCardSrc));
assert('Focus card surfaces the failure reason', focusCardSrc.includes('String(reason)')
  && focusCardSrc.includes("replaceFocusCardBody(el, { kind: 'message', text: 'Could not load insight'")
  && read('js/components/FocusCardBody.svelte').includes('{current.text}') && migratedAudit.contracts.focusReason);

assert('askAIAboutMarker uses the effective dated range', chatMarkerPromptsSrc.includes('getEffectiveRangeForDate(marker, latestIdx)') && chatMarkerPromptsSrc.includes('getEffectiveRangeLabelForDate(marker, latestIdx)') && chatMarkerPromptsSrc.includes('lr.min') && chatMarkerPromptsSrc.includes('lr.max'));
assert('askAIAboutMarker has trend direction', chatMarkerPromptsSrc.includes("Trend: ${dir}"));

assert('Health dots JSON.parse has try-catch', ctxHealthDotsSrc.includes('try { return JSON.parse(jsonMatch[0])'));

assert('WBC rule at position 5 (before Skip non-numeric)', pdfSrc.indexOf('differential WBC') < pdfSrc.indexOf('Skip non-numeric'));
assert('PDF import includes filename in user message', pdfSrc.includes("(file: ' + fileName"));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
