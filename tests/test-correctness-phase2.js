#!/usr/bin/env node
// test-correctness-phase2.js — regression tests for v1.5.1 correctness pass.
// Covers: per-profile sync debouncer, lab-context fingerprint, lens LRU,
// SW precache list, Polar OAuth callback, profile-swap guard, cycle clamp,
// SSE trailing buffer + parse error filter, PhenoAge CRP, profile recovery.
//
// Static source inspection only — switched from HTTP `fetch()` to direct
// `fs.readFileSync` so the test runs node-side without a dev server.
//
// Run: node tests/test-correctness-phase2.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let passed = 0, failed = 0;
const fails = [];
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Phase 2 Correctness Tests ===\n');

// ─── 1. Per-profile sync debouncer ───
console.log('1. Per-profile sync debouncer');
const syncSrc = read('js/sync.js');
const syncSaveHooksSrc = read('js/sync-save-hooks.js');
const syncLifecycleSrc = read('js/sync-lifecycle.js');
assert('sync-save-hooks.js declares per-profile timer Map',
  syncSaveHooksSrc.includes('const _debounceTimers = new Map()'),
  'shared single timer dropped pending push when user swapped profile mid-debounce');
assert('sync-save-hooks.js no longer has single _debounceTimer',
  !/\blet _debounceTimer\b/.test(syncSaveHooksSrc));
assert('sync-save-hooks.js looks up timer by profileId',
  syncSaveHooksSrc.includes('_debounceTimers.get(profileId)') && syncSaveHooksSrc.includes('_debounceTimers.set(profileId'));
assert('sync-lifecycle.js clears save and pull timers on disable',
  syncLifecycleSrc.includes('clearSyncSaveTimers()')
    && syncLifecycleSrc.includes('clearSyncPullTimers()')
    && syncSaveHooksSrc.includes('for (const t of _debounceTimers.values()) clearTimeout(t)'));

// ─── 2. Lab-context fingerprint includes wearableSummary ───
console.log('\n2. Lab-context cache fingerprint');
const lcSrc = read('js/lab-context.js');
const lcSettingsSrc = read('js/lab-context-settings.js');
assert('lab-context fingerprint covers wearableSummary',
  lcSettingsSrc.includes("'wearableSummary'") && lcSettingsSrc.match(/cardPart\s*=.*wearableSummary/s),
  'AI context replayed stale wearable data after sync without this');

// ─── 3. Lens LRU cache bumps on hit ───
console.log('\n3. Lens LRU cache');
const lensCacheSrc = read('js/lens-cache.js');
const cacheGetMatch = lensCacheSrc.match(/function cacheGet\(k\) \{([\s\S]*?)\n\}/);
assert('cacheGet re-inserts on hit',
  cacheGetMatch && cacheGetMatch[1].includes('_cache.delete(k)') && cacheGetMatch[1].includes('_cache.set(k, row)'),
  'Map iterates in insertion order — without re-insert, hot entries are evicted by FIFO');

// ─── 4. Service worker precaches dynamic modules ───
console.log('\n4. SW precache');
const swSrc = `${read('service-worker.js')}\n${read('service-worker-runtime.js')}`;
const indexSrc = read('index.html');
const startupUiSrc = read('js/startup-ui.js');
const legalConsentBootstrapSrc = read('js/legal-consent-bootstrap.js');
const legalConsentSrc = read('js/legal-consent.js');
const changelogSrc = read('js/changelog.js');
const tourSrc = read('js/tour.js');
const appShellCss = read('css/app-shell.css');
const playwrightFixtureSrc = read('tests/playwright/coverage-fixture.js');
const viewsSrc = read('js/views.js');
const appShellHooksSrc = read('js/app-shell-hooks.js');
const dashboardCompositionSrc = read('js/dashboard-view-composition.js');
const importLoaderSrc = read('js/import-loader.js');
const importFileInputSrc = read('js/import-file-input.js');
const importDropZoneSrc = read('js/import-drop-zone.js');
const importDropZoneRuntimeSrc = read('js/import-drop-zone-runtime.js');
const commitHashSrc = read('js/commit-hash.js');
const pwaAppShellAssets = [
  '/app',
  '/js/legal-consent-bootstrap.js',
  '/vendor/qrcode-generator.js',
  '/vendor/jszip.min.js',
  '/vendor/mammoth.browser.min.js',
  '/vendor/venice-e2ee.js',
  '/vendor/venice-dcap.js',
  '/vendor/venice-nvidia.js',
  '/vendor/evolu/evolu-bundle.js',
  '/vendor/evolu/Db.worker.js',
  '/vendor/evolu/sqlite3-bundler-friendly.mjs',
  '/vendor/evolu/sqlite3-opfs-async-proxy.js',
  '/vendor/evolu/sqlite3-worker1-bundler-friendly.mjs',
  '/vendor/evolu/sqlite3.wasm',
  '/js/service-worker-update.js',
  '/js/app-feature-modules.js',
  '/js/app-foundation-modules.js',
  '/js/app-health-data-modules.js',
  '/js/app-light-sun-modules.js',
  '/js/profile-share-loader.js',
  '/js/app-ai-interaction-modules.js',
  '/js/app-ui-shell-modules.js',
  '/js/client-list-form.js',
  '/js/app-event-listeners.js',
  '/js/crypto-key-cache.js',
  '/js/startup-orchestrator.js',
  '/js/startup-foundation.js',
  '/js/startup-profile.js',
  '/js/startup-oauth-callbacks.js',
  '/js/startup-maintenance.js',
  '/js/startup-ui.js',
  '/js/ai-verdict-engine.js',
  '/js/profile-data-migrations.js',
  '/js/settings-provider-bridge.js',
  '/js/import-loader.js',
  '/js/import-file-input.js',
  '/js/import-drop-zone.js',
  '/js/pdf-import.js',
  '/js/pdf-import-commit.js',
  '/js/pdf-import-file-handlers.js',
  '/js/pdf-import-file-utils.js',
  '/js/pdf-import-spreadsheet.js',
  '/js/pdf-import-preflight.js',
  '/js/pdf-import-progress.js',
  '/js/pdf-import-review.js',
  '/js/pdf-import-marker-mapping.js',
  '/js/pdf-import-marker-normalization.js',
  '/js/pdf-import-persistence.js',
  '/js/blob-storage.js',
  '/js/data-merge-lab-entries.js',
  '/js/data-merge.js',
  '/js/data-view-controls.js',
  '/js/cashu-wallet-transfers.js',
  '/js/views-router.js',
  '/js/dashboard-view-composition.js',
  '/js/dashboard-page-view.js',
  '/js/lens-pages.js',
  '/js/lens-page-shell.js',
  '/js/dashboard-widgets.js',
  '/js/dashboard-widget-controls.js',
  '/js/dashboard-lab-widget-renderers.js',
  '/js/dashboard-widget-renderers.js',
  '/js/dashboard-recommendation-widget.js',
  '/js/recommendation-actions.js',
  '/js/chart-card-recs.js',
  '/js/category-glyphs.js',
  '/js/category-page-view.js',
  '/js/category-view-renderers.js',
  '/js/category-customization.js',
  '/js/context-cards.js',
  '/js/context-card-summaries.js',
  '/js/context-card-editor-ui.js',
  '/js/context-card-medical-history-editor.js',
  '/js/context-card-medical-history-editor-impl.js',
  '/js/context-card-lifestyle-editors.js',
  '/js/context-card-lifestyle-editors-impl.js',
  '/js/supplement-import-draft.js',
  '/js/supplement-medication-domain.js',
  '/js/supplement-impact.js',
  '/js/commit-hash.js',
  '/js/focus-card.js',
  '/js/lab-context-output.js',
  '/js/lab-context-settings.js',
  '/js/onboarding-view.js',
  '/js/emf-runtime.js',
  '/js/pii-review.js',
  '/js/light-conditions-interpretation.js',
  '/js/light-conditions-renderer.js',
  '/js/light-conditions-now.js',
  '/js/light-page-view.js',
  '/js/light-channel-view.js',
  '/js/light-sessions-view.js',
  '/js/compare-correlations.js',
  '/js/mobile-dashboard.js',
  '/js/light-devices.js',
  '/js/light-device-session-engine.js',
  '/js/light-device-setup-modal.js',
  '/js/light-env.js',
  '/js/light-env-editor.js',
  '/js/light-env-screen-ui.js',
  '/js/light-env-audits.js',
  '/js/light-env-evening.js',
  '/js/light-env-model.js',
  '/js/light-tool-camera-modal-runtime.js',
  '/js/light-tool-camera.js',
  '/js/light-tool-camera-modals.js',
  '/js/light-tool-cct-meter.js',
  '/js/light-tool-darkness-meter.js',
  '/js/light-tool-flicker-detector.js',
  '/js/light-tool-glass-transmission.js',
  '/js/light-tool-lux-meter.js',
  '/js/light-tool-spectrum-classifier.js',
  '/js/light-tools.js',
  '/js/modal-lifecycle.js',
  '/js/marker-analysis.js',
  '/js/marker-detail-content.js',
  '/js/marker-detail-custom-markers.js',
  '/js/marker-detail-manual-entry.js',
  '/js/sun.js',
  '/js/sun-location.js',
  '/js/sun-active-session.js',
  '/js/sun-session-model.js',
  '/js/sun-sessions-store.js',
  '/js/sun-session-ui.js',
  '/js/sun-session-actions.js',
  '/js/sun-defaults-model.js',
  '/js/sun-defaults-setup-renderer.js',
  '/js/sun-defaults-setup-ui.js',
  '/js/sun-spectrum-actions.js',
  '/js/sun-spectrum-device.js',
  '/js/sun-spectrum.js',
  '/js/sun-uvdata-atmosphere.js',
  '/js/sun-uvdata-config.js',
  '/js/sun-uvdata.js',
  '/js/chat-window-bindings.js',
  '/js/chat-images.js',
  '/js/chat-threads.js',
  '/js/chat-thread-search.js',
  '/js/chat-marker-prompts.js',
  '/js/chat-attestation.js',
  '/js/chat-actions.js',
  '/js/chat-nudge.js',
  '/js/chat-panel.js',
  '/js/chat-discussion.js',
  '/js/chat-discussion-callbacks.js',
  '/js/chat-discussion-flow.js',
  '/js/chat-discussion-lifecycle.js',
  '/js/chat-discussion-turns.js',
  '/js/chat-discussion-round-runner.js',
  '/js/chat-discussion-round-prompts.js',
  '/js/chat-discussion-round-request.js',
  '/js/chat-discussion-round-state.js',
  '/js/chat-discussion-round-view.js',
  '/js/chat-discussion-state.js',
  '/js/chat-discussion-picker.js',
  '/js/chat-discussion-ui.js',
  '/js/chat-onboarding.js',
  '/js/chat-empty-state.js',
  '/js/chat-render.js',
  '/js/chat-send.js',
  '/js/chat-icons.js',
  '/js/chat-personalities.js',
  '/js/chat-history.js',
  '/js/chat-continuation.js',
  '/js/chat-prompt-context.js',
  '/js/chat-summaries.js',
  '/js/lens.js',
  '/js/lens-knowledge-base-ui.js',
  '/js/lens-library.js',
  '/js/dna-mtdna.js',
  '/js/lens-local.js',
  '/js/lens-local-embedder-config.js',
  '/js/lens-local-library-registry.js',
  '/js/lens-local-store.js',
  '/js/lens-local-worker.js',
  '/js/lens-local-utils.js',
  '/js/lens-local-parsers.js',
  '/data/light-device-presets.json',
  '/data/mito-compounds.json',
  '/data/snp-health.json',
  '/data/haplogroups.json',
  '/data/sun-action-spectra.json',
  '/data/demo-male.json',
  '/data/demo-female.json',
  '/data/emf-assessment-template.html',
];
for (const asset of pwaAppShellAssets) {
  assert(`SW precaches ${asset}`, swSrc.includes(`'${asset}'`),
    'first-launch-offline (PWA install + go-offline) needs the full app shell cached');
}
assert('SW has offline navigation fallback for /app',
  swSrc.includes("event.request.mode === 'navigate'") &&
  swSrc.includes("matchCurrentCache('/app')") &&
  swSrc.includes("matchCurrentCache('/index.html')"),
  'installed PWA start_url=/app needs a cached document while offline');
assert('SW does not cache HTTP error responses',
  /if \(response\.status === 206 \|\| !response\.ok\) return Promise\.resolve\(\);/.test(swSrc),
  'transient 4xx/5xx responses must not overwrite a valid cached app shell');
assert('SW handles same-origin localhost app shell while bypassing cross-origin Local AI',
  /const sameOrigin\s*=\s*url\.origin === scope\.location\.origin/.test(swSrc) &&
  /NETWORK_ONLY_HOSTS\.has\(h\)\s*\|\|\s*\(!sameOrigin && isLocalOrPrivateHost\(h\)\)/.test(swSrc) &&
  /event\.request\.method !== 'GET' \|\| !sameOrigin/.test(swSrc),
  'local offline testing should not bypass the SW just because the app origin is localhost');
assert('PDF import lazy loader is shared by file input and import-drop-zone.js',
  startupUiSrc.includes("from './import-file-input.js'") &&
  importFileInputSrc.includes("from './import-loader.js'") &&
  importDropZoneSrc.includes("from './import-loader.js'") &&
  importLoaderSrc.includes("import('./pdf-import.js')") &&
  importLoaderSrc.includes('export async function loadImportUI()') &&
  importFileInputSrc.includes('await loadImportUI()') &&
  importDropZoneSrc.includes('await loadImportUI()'),
  'separate per-module promise caches can issue duplicate first-use imports');
assert('file input shares import browser-runtime adapter with drop zone',
  importFileInputSrc.includes("from './import-drop-zone-runtime.js'") &&
  importFileInputSrc.includes('detectImportDNAFileRuntime') &&
  importFileInputSrc.includes('handleImportDNAFileRuntime') &&
  !/\bwindow(?:\.|\s*\[)/.test(importFileInputSrc) &&
  importDropZoneRuntimeSrc.includes('export function isDropZoneImportRunning'),
  'file-picker import path should not keep a parallel set of window global lookups');
assert('Import UI lazy-load failure notifies from file input and clears selection',
  /try\s*{\s*importMod\s*=\s*await loadImportUI\(\);[\s\S]{0,320}catch\s*\(err\)\s*{[\s\S]{0,320}Could not load import UI\. Reload the app to finish updating, then try again\.[\s\S]{0,120}e\.target\.value\s*=\s*''/.test(importFileInputSrc),
  'file-picker import path should fail loudly and clear stale selection');
assert('Import UI lazy-load failure notifies from drop zone',
  /try\s*{\s*importMod\s*=\s*await loadImportUI\(\);[\s\S]{0,320}catch\s*\(err\)\s*{[\s\S]{0,320}Could not load import UI\. Reload the app to finish updating, then try again\./.test(importDropZoneSrc),
  'drop-zone import path should fail loudly');
assert('analytics consent remains deferred after first paint and behind legal gate',
  /const showAnalyticsConsent = \(\) => \{\s*startupUIDeps\.maybeShowAnalyticsConsent\?\.\(\);\s*\};/.test(startupUiSrc)
  && /if \(legalGateShown\) \{\s*startupRuntime\(\)\.addEventListener\('legal-consent-accepted', \(\) => setTimeout\(showAnalyticsConsent, 800\), \{ once: true \}\);\s*\} else \{\s*setTimeout\(showAnalyticsConsent, 800\);\s*\}/.test(startupUiSrc),
  'first-run banner should stay deferred and must resume after Terms/Privacy acceptance');
assert('legal gate runs before changelog and resumes changelog only after accept',
  startupUiSrc.indexOf('const legalGateShown = maybeShowLegalConsentGate()') >= 0
  && startupUiSrc.indexOf('const legalGateShown = maybeShowLegalConsentGate()') < startupUiSrc.indexOf('maybeShowChangelog()')
  && startupUiSrc.includes("startupRuntime().addEventListener('legal-consent-accepted'")
  && startupUiSrc.includes('return legalGateShown')
  && startupUiSrc.includes("startupRuntime().addEventListener('legal-consent-accepted', () => maybeShowChangelog(), { once: true })")
  && legalConsentSrc.includes("from './utils-runtime.js'")
  && legalConsentSrc.includes("dispatchUtilsRuntimeEvent('legal-consent-accepted')"));
assert('legal gate is prerendered and interactive before the main module',
  indexSrc.indexOf('id="legal-consent-overlay"') >= 0
  && indexSrc.indexOf('id="legal-consent-overlay"') < indexSrc.indexOf('src="js/main.js"')
  && indexSrc.indexOf('src="js/legal-consent-bootstrap.js"') < indexSrc.indexOf('src="js/main.js"')
  && legalConsentBootstrapSrc.includes("overlay.dataset.legalConsentBootstrapBound = 'true'")
  && legalConsentBootstrapSrc.includes("globalThis.dispatchEvent(new Event('legal-consent-accepted'))"));
assert('prerendered and module legal versions remain synchronized',
  indexSrc.includes('data-terms-version="2026-06-22"')
  && indexSrc.includes('data-privacy-version="2026-06-22"')
  && /const TERMS_VERSION = '2026-06-22';/.test(legalConsentSrc)
  && /const PRIVACY_VERSION = '2026-06-22';/.test(legalConsentSrc));
assert('legal consent notifications use the module dependency instead of a global callback',
  legalConsentSrc.includes("import { showNotification } from './utils.js';")
  && legalConsentSrc.includes("showNotification('Terms and Privacy accepted.'")
  && !legalConsentSrc.includes('globalThis.showNotification'));
assert('legal consent version metadata uses the shared runtime adapter',
  legalConsentSrc.includes('getAppVersionRuntime')
  && legalConsentSrc.includes('appVersion: getAppVersionRuntime() || null')
  && !legalConsentSrc.includes('globalThis.APP_VERSION'));
assert('legal accept does not deadlock when localStorage persistence throws',
  /try\s*\{\s*storeLegalAcceptance\(\);\s*\}\s*catch\s*\(err\)\s*\{[\s\S]{0,220}\[legal-consent\] Failed to persist acceptance/.test(legalConsentSrc)
  && /catch\s*\(err\)[\s\S]{0,260}\}\s*closeLegalConsentGate\(\);\s*dispatchUtilsRuntimeEvent\('legal-consent-accepted'\)/.test(legalConsentSrc));
assert('deferred startup destinations wait behind legal gate',
  /const legalGateShown = scheduleStartupNudges\(\);[\s\S]{0,240}addEventListener\('legal-consent-accepted', openDeferredStartupDestinations[\s\S]{0,120}else \{\s*openDeferredStartupDestinations\(\);\s*\}/.test(startupUiSrc));
assert('analytics consent and backup nudge resume after legal gate acceptance',
  /addEventListener\('legal-consent-accepted', \(\) => setTimeout\(showAnalyticsConsent, 800\), \{ once: true \}\)/.test(startupUiSrc)
  && /addEventListener\('legal-consent-accepted', \(\) => setTimeout\(showBackupNudge, 1500\), \{ once: true \}\)/.test(startupUiSrc)
  && /const showBackupNudge = \(\) => \{[\s\S]{0,180}maybeShowBackupNudge\(\);\s*\};/.test(startupUiSrc));
assert('changelog and tour refuse to open over legal consent',
  /export function maybeShowChangelog\(\) \{\s*if \(document\.getElementById\('legal-consent-overlay'\)\) return;/.test(changelogSrc)
  && /function runTour\(steps, storageKey, auto\) \{\s*if \(document\.getElementById\('legal-consent-overlay'\)\) return false;/.test(tourSrc));
assert('legal gate z-index selector beats generic modal overlay',
  /\.modal-overlay\.legal-consent-overlay\s*\{[\s\S]{0,80}z-index:\s*4200;/.test(appShellCss)
  && /\.modal-overlay\.legal-consent-overlay\s*\{[\s\S]{0,180}-webkit-backdrop-filter:\s*blur\(8px\);[\s\S]{0,60}backdrop-filter:\s*blur\(8px\);/.test(appShellCss));
assert('Playwright feature tests seed the current legal acceptance version',
  /TEST_LEGAL_ACCEPTANCE\s*=\s*\{[\s\S]{0,120}termsVersion:\s*'2026-06-22',[\s\S]{0,80}privacyVersion:\s*'2026-06-22'/.test(playwrightFixtureSrc)
  && /const TERMS_VERSION = '2026-06-22';/.test(legalConsentSrc)
  && /const PRIVACY_VERSION = '2026-06-22';/.test(legalConsentSrc)
  && /await seedCurrentLegalAcceptance\(page\);/.test(playwrightFixtureSrc));
assert('footer commit hash loader lives in its own module and remains wired',
  /export function loadCommitHash\(\)/.test(commitHashSrc)
  && /_cachedCommitHash/.test(commitHashSrc)
  && /app-commit-hash/.test(commitHashSrc)
  && /import \{ escapeHTML \} from '\.\/utils\.js'/.test(commitHashSrc)
  && /fetch\('\/api\/commit'\)/.test(commitHashSrc)
  && /https:\/\/api\.github\.com\/repos\/elkimek\/get-based\/commits\/main/.test(commitHashSrc)
  && /escapeHTML\(full\)/.test(commitHashSrc)
  && /escapeHTML\(short\)/.test(commitHashSrc)
  && !/_cachedCommitRef|escapeHTML\(ref\)|app-commit-hash[\s\S]{0,360}<span/.test(commitHashSrc)
  && dashboardCompositionSrc.includes("from './commit-hash.js'"));
assert('app shell injects dashboard composition into the views facade',
  !viewsSrc.includes("from './dashboard-view-composition.js'") &&
  viewsSrc.includes('export function configureDashboardViewFactory') &&
  appShellHooksSrc.includes("from './dashboard-view-composition.js'") &&
  appShellHooksSrc.includes('configureDashboardViewFactory(createDashboardViewComposition)') &&
  dashboardCompositionSrc.includes('export function createDashboardViewComposition') &&
  dashboardCompositionSrc.includes('createDashboardWidgetRenderers') &&
  dashboardCompositionSrc.includes('createDashboardWidgetControls'));
assert('app shell injects Biology Score AI context into lab context',
  !lcSrc.includes("from './biology-score-ai-context.js'") &&
  lcSrc.includes('labContextDeps.buildBiologyScoresAIContext?.(data, { limit: 7, ignoreContextToggles })') &&
  appShellHooksSrc.includes("from './biology-score-ai-context.js'") &&
  appShellHooksSrc.includes("from './lab-context.js'") &&
  appShellHooksSrc.includes('configureLabContext({ buildBiologyScoresAIContext })'));

// ─── 5. Polar OAuth callback returns true + clears connection ───
console.log('\n5. Polar OAuth callback');
const wcSrc = read('js/wearables-connect.js');
const headIdx = wcSrc.indexOf('if (!result.tokens.userId)');
const window30 = headIdx >= 0 ? wcSrc.slice(headIdx, headIdx + 1200) : '';
assert('userId-missing branch removes connection cleanly',
  headIdx >= 0 && window30.includes('removeConnection(adapterId)'),
  'previously left a needsReauth-flagged record that re-broke on every sync');
assert('userId-missing branch returns true',
  headIdx >= 0 && window30.match(/removeConnection\(adapterId\)[\s\S]{0,400}return true/));

// ─── 6. Profile-swap guard around fetchAccountInfo + postConnect ───
console.log('\n6. Profile-swap guard');
const swapGuardCount = (wcSrc.match(/getActiveProfileId\(\) !== activeProfile/g) || []).length;
assert('two profile-swap guards present (post-await)',
  swapGuardCount >= 2,
  `expected ≥2 guards, found ${swapGuardCount}`);
assert('guard message references aborted connect',
  wcSrc.includes('connect aborted — profile changed'));

// ─── 7. Cycle perimenopause clamp ───
console.log('\n7. Cycle clamp relax');
const cycleSummarySrc = read('js/cycle-summary.js');
assert('cycle stats no longer hard-clamp to 45',
  !cycleSummarySrc.includes('Math.max(20, Math.min(45, avgCycle))'),
  'old clamp truncated 60–90 day perimenopause cycles to 45');
assert('cycle stats use a 90-day ceiling',
  cycleSummarySrc.includes('clamp(avgCycle, 20, 90)'),
  'regular-and-long perimenopause cycles need to land at their real average, not 45');

// ─── 8. SSE trailing buffer flush + parse error filter ───
console.log('\n8. SSE robustness');
const apiOpenAICompatibleSrc = read('js/api-openai-compatible.js');
const apiVeniceSrc = read('js/api-venice.js');
assert('SSE handler flushes trailing buffer after done',
  apiOpenAICompatibleSrc.match(/buffer\.startsWith\('data: '\)\) handleSSELine/),
  'final data: event without newline was silently dropped on truncation');
assert('SSE parse-error filter checks SyntaxError + boundary, not string prefix',
  apiOpenAICompatibleSrc.includes('parseErr instanceof SyntaxError') &&
  !apiOpenAICompatibleSrc.includes("!parseErr.message.startsWith('Unexpected')"),
  'old "Unexpected" prefix check confused chunk boundaries with malformed events');
assert('Venice E2EE stream also flushes trailing buffer',
  apiVeniceSrc.match(/buffer\.startsWith\('data: '\)\) await handleVeniceLine/));

// ─── 9. PhenoAge requires hs-CRP only ───
console.log('\n9. PhenoAge CRP strictness');
const dataSrc = read('js/data.js');
assert('PhenoAge no longer falls back to standard CRP',
  !dataSrc.match(/_getCRP[\s\S]{0,200}getVals\('proteins', 'crp'\)/),
  'standard CRP and hs-CRP differ in detection range — silent substitution corrupted estimates');
assert('_getCRP reads only hsCRP',
  dataSrc.includes("getVals('proteins', 'hsCRP')?.[i] ?? null"));

// ─── 10. Profile load preserves corrupted bytes ───
console.log('\n10. Profile parse recovery');
const profSrc = read('js/profile.js');
assert('loadProfile backs up corrupted JSON',
  profSrc.includes('imported-corrupt')
    && profSrc.includes('await encryptedSetItem(corruptKey, savedImported)')
    && !profSrc.includes('localStorage.setItem(corruptKey'),
  'previously discarded corrupted raw — user lost recovery path');
assert('loadProfile surfaces a recovery toast',
  profSrc.includes('Profile data was corrupted'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) console.log('Failures:', fails);
process.exit(failed > 0 ? 1 : 0);
