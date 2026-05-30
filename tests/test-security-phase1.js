#!/usr/bin/env node
// test-security-phase1.js — regression tests for the v1.5.0 security pass.
// Covers: pdf.js vendor file presence, isEvalSupported defense-in-depth,
// AI-supplied marker key sanitization, OAuth state param + expiry checks.
//
// Static source inspection only — switched from HTTP `fetch()` to direct
// `fs.readFileSync` so the test runs node-side without a dev server.
//
// Run: node tests/test-security-phase1.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0, failed = 0;
const fails = [];
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Phase 1 Security Tests ===\n');

// ─── 1. pdf.js vendor file present at the new ESM path ───
console.log('1. pdf.js ESM bundle');
assert('vendor/pdf.min.mjs exists', exists('vendor/pdf.min.mjs'));
assert('vendor/pdf.min.js (old UMD) is gone', !exists('vendor/pdf.min.js'));

const loaderSrc = read('js/pdfjs-loader.js');
assert('pdfjs-loader pins isEvalSupported: false', loaderSrc.includes("isEvalSupported: false"),
  'CVE-2024-4367 defense-in-depth — every getDocument call must disable eval');
assert('isEvalSupported wins over extraOpts (via spread order)',
  loaderSrc.includes('...extraOpts, isEvalSupported: false }') &&
  !loaderSrc.includes('isEvalSupported: false, ...extraOpts'),
  'pin must apply after spread or a caller passing { isEvalSupported: true } reopens the CVE');

const importSrc = read('js/pdf-import.js');
const importMappingSrc = read('js/pdf-import-marker-mapping.js');
const importNormalizationSrc = read('js/pdf-import-marker-normalization.js');
assert('pdf-import.js routes through getPdfDocument',
  importSrc.includes('getPdfDocument') && !importSrc.includes('pdfjsLib.getDocument'),
  'no direct pdfjsLib.getDocument calls — they bypass the eval guard');
const lensParsersSrc = read('js/lens-local-parsers.js');
assert('lens-local-parsers.js routes through getPdfDocument',
  lensParsersSrc.includes('getPdfDocument') && !lensParsersSrc.includes('pdfjs.getDocument'));

// ─── 2. AI suggestedKey / mappedKey sanitization ───
console.log('\n2. AI key sanitization');
assert('pdf-import-marker-mapping.js defines _SAFE_MARKER_KEY pattern',
  importMappingSrc.includes('_SAFE_MARKER_KEY') && importMappingSrc.includes('/^[a-zA-Z][a-zA-Z0-9]*\\.[a-zA-Z][a-zA-Z0-9_]*$/'));
assert('_sanitizeAIMarker called before adapter runs',
  importNormalizationSrc.includes('parsed.markers.forEach(_sanitizeAIMarker)'),
  'must run before normalizeWithAdapter to prevent adapter-derived keys from inheriting unsafe halves');
const exposedSanitizer = importMappingSrc.match(/function _sanitizeAIMarker\(m\) \{([^}]+)\}/);
assert('_sanitizeAIMarker drops both mappedKey and suggestedKey on bad input',
  exposedSanitizer && exposedSanitizer[1].includes('m.mappedKey = null') && exposedSanitizer[1].includes('m.suggestedKey = null'));

// ─── 3. OpenRouter OAuth state param ───
console.log('\n3. OAuth state hardening');
const apiSrc = read('js/api.js');
assert('startOpenRouterOAuth sends state param',
  apiSrc.includes("&state=' + encodeURIComponent(state)"),
  'login-CSRF needs state, PKCE alone is insufficient');
assert('startOpenRouterOAuth stores state in sessionStorage',
  apiSrc.includes("sessionStorage.setItem('or_oauth_state', state)"));
assert('exchangeOpenRouterCode verifies returned state',
  apiSrc.includes('returnedState !== expectedState'));
assert('exchangeOpenRouterCode clears state on success and on mismatch',
  (apiSrc.match(/sessionStorage\.removeItem\('or_oauth_state'\)/g) || []).length >= 2);
const startupOAuthSrc = read('js/startup-oauth-callbacks.js');
assert('startup-oauth-callbacks.js forwards state to exchangeOpenRouterCode',
  startupOAuthSrc.includes('exchangeOpenRouterCode(oauthCode, oauthState)'));

// ─── 4. Wearable OAuth pending-state expiry ───
console.log('\n4. Wearable OAuth expiry');
const adapters = ['oura', 'polar', 'ultrahuman', 'whoop', 'withings', 'fitbit'];
for (const id of adapters) {
  const src = read(`js/wearables-${id}-auth.js`);
  assert(`${id}-auth: expiry check present`,
    src.includes("Date.now() - pending.startedAt > 10 * 60 * 1000"),
    'reject any pending state older than 10 minutes');
  assert(`${id}-auth: expiry returns ok:false`,
    src.includes("error: 'OAuth flow expired"));
}

// ─── 5. dev-server CORS reflection helper ───
console.log('\n5. dev-server CORS reflection');
if (exists('dev-server.js')) {
  const devSrc = read('dev-server.js');
  assert('dev-server.js defines corsHeaders helper',
    devSrc.includes('function corsHeaders(req)') && devSrc.includes("'Vary': 'Origin'"));
  assert('dev-server.js no longer emits wildcard ACAO',
    !devSrc.includes("'Access-Control-Allow-Origin': '*'"),
    'must reflect allowlisted origin, not wildcard');
  assert('dev-server.js gates SSRF-prone /api endpoints',
    devSrc.match(/_isAllowedProxyUrl\(target\)/g)?.length >= 3,
    '/api/check-url, /api/fetch-page, /api/fetch-page-rendered all gated');
  assert('dev-server.js re-checks redirect destinations',
    devSrc.match(/_isAllowedProxyUrl\(loc\)|_isAllowedProxyUrl\(redirect\)/g)?.length >= 3,
    '/api/check-url + /api/fetch-page + /proxy redirect-follow paths each need their own guard');
} else {
  console.log('  (dev-server.js not present — production build, skipping CORS source asserts)');
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) console.log('Failures:', fails);
process.exit(failed > 0 ? 1 : 0);
