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
assert('sync.js declares per-profile timer Map',
  syncSrc.includes('const _debounceTimers = new Map()'),
  'shared single timer dropped pending push when user swapped profile mid-debounce');
assert('sync.js no longer has single _debounceTimer',
  !/\blet _debounceTimer\b/.test(syncSrc));
assert('sync.js looks up timer by profileId',
  syncSrc.includes('_debounceTimers.get(profileId)') && syncSrc.includes('_debounceTimers.set(profileId'));
assert('sync.js clears all timers on disable',
  syncSrc.includes('for (const t of _debounceTimers.values()) clearTimeout(t)'));

// ─── 2. Lab-context fingerprint includes wearableSummary ───
console.log('\n2. Lab-context cache fingerprint');
const lcSrc = read('js/lab-context.js');
assert('lab-context fingerprint covers wearableSummary',
  lcSrc.includes("'wearableSummary'") && lcSrc.match(/cardPart\s*=.*wearableSummary/s),
  'AI context replayed stale wearable data after sync without this');

// ─── 3. Lens LRU cache bumps on hit ───
console.log('\n3. Lens LRU cache');
const lensSrc = read('js/lens.js');
const cacheGetMatch = lensSrc.match(/function cacheGet\(k\) \{([\s\S]*?)\n\}/);
assert('cacheGet re-inserts on hit',
  cacheGetMatch && cacheGetMatch[1].includes('_cache.delete(k)') && cacheGetMatch[1].includes('_cache.set(k, row)'),
  'Map iterates in insertion order — without re-insert, hot entries are evicted by FIFO');

// ─── 4. Service worker precaches dynamic modules ───
console.log('\n4. SW precache');
const swSrc = read('service-worker.js');
const mainSrc = read('js/main.js');
const viewsSrc = read('js/views.js');
const importLoaderSrc = read('js/import-loader.js');
const commitHashSrc = read('js/commit-hash.js');
const pwaAppShellAssets = [
  '/app',
  '/vendor/qrcode-generator.js',
  '/vendor/jszip.min.js',
  '/vendor/mammoth.browser.min.js',
  '/vendor/venice-e2ee.js',
  '/vendor/evolu/evolu-bundle.js',
  '/vendor/evolu/Db.worker.js',
  '/vendor/evolu/sqlite3-bundler-friendly.mjs',
  '/vendor/evolu/sqlite3-opfs-async-proxy.js',
  '/vendor/evolu/sqlite3-worker1-bundler-friendly.mjs',
  '/vendor/evolu/sqlite3.wasm',
  '/js/ai-verdict-engine.js',
  '/js/import-loader.js',
  '/js/blob-storage.js',
  '/js/data-merge.js',
  '/js/views-router.js',
  '/js/lens-pages.js',
  '/js/lens-page-shell.js',
  '/js/dashboard-widgets.js',
  '/js/dashboard-widget-controls.js',
  '/js/dashboard-widget-renderers.js',
  '/js/chart-card-recs.js',
  '/js/category-glyphs.js',
  '/js/category-view-renderers.js',
  '/js/category-customization.js',
  '/js/commit-hash.js',
  '/js/focus-card.js',
  '/js/onboarding-view.js',
  '/js/light-conditions-now.js',
  '/js/light-page-view.js',
  '/js/light-channel-view.js',
  '/js/light-sessions-view.js',
  '/js/compare-correlations.js',
  '/js/mobile-dashboard.js',
  '/js/light-devices.js',
  '/js/light-env.js',
  '/js/light-tools.js',
  '/js/sun.js',
  '/js/sun-spectrum.js',
  '/js/sun-uvdata.js',
  '/js/chat-images.js',
  '/js/chat-threads.js',
  '/js/lens.js',
  '/js/lens-local.js',
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
  swSrc.includes("caches.match('/app')") &&
  swSrc.includes("caches.match('/index.html')"),
  'installed PWA start_url=/app needs a cached document while offline');
assert('SW does not cache HTTP error responses',
  /if \(!response \|\| response\.status === 206 \|\| !response\.ok\) return Promise\.resolve\(\);/.test(swSrc),
  'transient 4xx/5xx responses must not overwrite a valid cached app shell');
assert('PDF import lazy loader is shared by main.js and views.js',
  mainSrc.includes("from './import-loader.js'") &&
  viewsSrc.includes("from './import-loader.js'") &&
  importLoaderSrc.includes("import('./pdf-import.js')"),
  'separate per-module promise caches can issue duplicate first-use imports');
assert('PDF lazy import failure notifies from file input and clears selection',
  /try\s*{\s*importMod\s*=\s*await loadPdfImport\(\);[\s\S]{0,220}catch\s*\(err\)\s*{[\s\S]{0,220}Could not load import module - check your connection and try again\.[\s\S]{0,120}e\.target\.value\s*=\s*''/.test(mainSrc),
  'file-picker import path should fail loudly and clear stale selection');
assert('PDF lazy import failure notifies from drop zone',
  /try\s*{\s*importMod\s*=\s*await loadPdfImport\(\);[\s\S]{0,220}catch\s*\(err\)\s*{[\s\S]{0,220}Could not load import module - check your connection and try again\./.test(viewsSrc),
  'drop-zone import path should fail loudly');
assert('analytics consent remains deferred after first paint',
  /setTimeout\(\(\)\s*=>\s*window\.maybeShowAnalyticsConsent\?\.\(\),\s*800\)/.test(mainSrc),
  'first-run banner should not stack into the same tick as tour/startup work');
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
  && viewsSrc.includes("from './commit-hash.js'"));

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
const cycleSrc = read('js/cycle.js');
assert('cycle.js no longer hard-clamps to 45 unconditionally',
  !cycleSrc.includes('Math.max(20, Math.min(45, avgCycle))'),
  'old clamp truncated 60–90 day perimenopause cycles to 45');
assert('cycle.js uses a 90-day ceiling',
  cycleSrc.includes('Math.max(20, Math.min(90, avgCycle))'),
  'regular-and-long perimenopause cycles need to land at their real average, not 45');

// ─── 8. SSE trailing buffer flush + parse error filter ───
console.log('\n8. SSE robustness');
const apiSrc = read('js/api.js');
assert('SSE handler flushes trailing buffer after done',
  apiSrc.match(/buffer\.startsWith\('data: '\)\) handleSSELine/),
  'final data: event without newline was silently dropped on truncation');
assert('SSE parse-error filter checks SyntaxError + boundary, not string prefix',
  apiSrc.includes('parseErr instanceof SyntaxError') &&
  !apiSrc.includes("!parseErr.message.startsWith('Unexpected')"),
  'old "Unexpected" prefix check confused chunk boundaries with malformed events');
assert('Venice E2EE stream also flushes trailing buffer',
  apiSrc.match(/buffer\.startsWith\('data: '\)\) await handleVeniceLine/));

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
  profSrc.includes('imported-corrupt') && profSrc.includes('localStorage.setItem(corruptKey'),
  'previously discarded corrupted raw — user lost recovery path');
assert('loadProfile surfaces a recovery toast',
  profSrc.includes('Profile data was corrupted'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) console.log('Failures:', fails);
process.exit(failed > 0 ? 1 : 0);
