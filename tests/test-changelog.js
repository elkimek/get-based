#!/usr/bin/env node
// test-changelog.js — Changelog modal source structure + hasCardContent auto-gating.
//
// Run: node tests/test-changelog.js  (or via npm test)
//
// DOM-runtime assertions (modal open/close, classList toggling, innerHTML
// rendering, forceShow behavior) live in tests/test-changelog-dom.js and
// stay on the puppeteer runner — they need a real browser DOM.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
function fetchWithRetry(rel) { return Promise.resolve(read(rel)); }

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log("=== What's New + Auto-Gating Tests ===\n");

// utils.js exposes hasCardContent via Object.assign(window, ...).
// changelog.js exposes openChangelog / closeChangelog / maybeShowChangelog.
await import('../js/state.js');
await import('../js/utils.js');
await import('../js/changelog.js');

const changelogSrc = await fetchWithRetry('js/changelog.js');
const utilsSrc = await fetchWithRetry('js/utils.js');
const mainSrc = await fetchWithRetry('js/main.js');
const settingsSrc = await fetchWithRetry('js/settings.js');
const swSrc = await fetchWithRetry('service-worker.js');
// Original test fetched '/app' (dev-server alias for index.html); read
// index.html directly in Node.
const indexSrc = await fetchWithRetry('index.html');
const versionSrc = await fetchWithRetry('version.js');

// ═══════════════════════════════════════
// 1. changelog.js module structure
// ═══════════════════════════════════════
console.log('1. Changelog Module Structure');

assert('changelog.js uses window.APP_VERSION', changelogSrc.includes('window.APP_VERSION'));
assert('changelog.js has CHANGELOG array', changelogSrc.includes('const CHANGELOG'));
assert('changelog.js exports openChangelog', changelogSrc.includes('export function openChangelog'));
assert('changelog.js exports closeChangelog', changelogSrc.includes('export function closeChangelog'));
assert('changelog.js exports maybeShowChangelog', changelogSrc.includes('export function maybeShowChangelog'));
assert('changelog.js has getMajorMinor helper', changelogSrc.includes('function getMajorMinor'));
assert('maybeShowChangelog compares major.minor only', changelogSrc.includes('getMajorMinor(seen) !== getMajorMinor('));
// forceShow patch-bump escape hatch — when a maintainer flags an entry as
// critical (e.g. v1.7.1 "re-export your encrypted backup"), the modal
// must auto-fire even on a same-major.minor patch bump. Logic must scan
// ALL entries (not just CHANGELOG[0]) — otherwise a later non-forceShow
// patch silently shadows an earlier critical entry.
assert('changelog.js has _semverGt helper for forceShow gate',
  /function\s+_semverGt\s*\(/.test(changelogSrc));
assert('maybeShowChangelog scans all entries for forceShow (not just [0])',
  /CHANGELOG\.some\s*\(\s*e\s*=>\s*e[\s\S]{0,80}forceShow[\s\S]{0,80}_semverGt\(e\.version,\s*seen\)/.test(changelogSrc));
// The v1.7.1 entry itself must carry forceShow — its body asks users to
// re-export their encrypted backup. Lock this in so a future copy edit
// doesn't silently drop the flag and break the call-to-action.
assert("v1.7.1 entry carries forceShow: true",
  /version:\s*'1\.7\.1'[\s\S]{0,400}forceShow:\s*true/.test(changelogSrc));

// ═══════════════════════════════════════
// 2. Unified semver versioning
// ═══════════════════════════════════════
console.log('2. Unified Semver Versioning');

const versionMatch = versionSrc.match(/APP_VERSION\s*=\s*'([^']+)'/);
assert('version.js sets APP_VERSION', versionMatch !== null, versionMatch ? `'${versionMatch[1]}'` : 'not found');
assert('APP_VERSION is semver', versionMatch && /^\d+\.\d+\.\d+/.test(versionMatch[1]), versionMatch ? versionMatch[1] : '');
assert('SW imports version.js', swSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses template literal', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));
assert('SW APP_SHELL includes version.js', swSrc.includes("'/version.js'"));
assert('index.html loads version.js', indexSrc.includes('src="version.js"'));

// ═══════════════════════════════════════
// 3. HTML: changelog modal exists in source
// ═══════════════════════════════════════
// (Source-string checks here. The live-DOM verification — that the
// elements are actually present after page load — runs in
// test-changelog-dom.js on the puppeteer side.)
console.log('3. HTML Modal Structure');

assert('changelog-modal-overlay defined in index.html', indexSrc.includes('id="changelog-modal-overlay"'));
assert('changelog-modal defined in index.html', indexSrc.includes('id="changelog-modal"'));
assert('changelog modal has role=dialog', indexSrc.includes('changelog-modal') && indexSrc.includes('role="dialog"'));
assert('changelog modal has aria-label', indexSrc.includes('aria-label="What\'s New"'));

// ═══════════════════════════════════════
// 4. main.js wiring
// ═══════════════════════════════════════
console.log('4. main.js Wiring');

assert('main.js imports maybeShowChangelog', mainSrc.includes("import { maybeShowChangelog } from './changelog.js'"));
assert('main.js calls maybeShowChangelog', mainSrc.includes('maybeShowChangelog()'));
assert('main.js has changelog overlay click handler', mainSrc.includes('changelog-modal-overlay') && mainSrc.includes('closeChangelog'));
assert('main.js has changelog Escape handler', mainSrc.includes('changelogOverlay'));
assert('main.js focus trap includes changelog', mainSrc.includes('"changelog-modal-overlay"'));

// ═══════════════════════════════════════
// 5. Settings: What's New button
// ═══════════════════════════════════════
console.log('5. Settings Integration');

assert('Settings references openChangelog', settingsSrc.includes('openChangelog'));
assert("Settings has What's New button", settingsSrc.includes("What's New"));

// ═══════════════════════════════════════
// 6. hasCardContent utility
// ═══════════════════════════════════════
console.log('6. hasCardContent Utility');

assert('hasCardContent exported from utils.js', utilsSrc.includes('export function hasCardContent'));
assert('hasCardContent on window', typeof window.hasCardContent === 'function');

// Behavioral tests — pure-logic, run anywhere. Guard the call site so
// that if `hasCardContent` ever fails to attach to window the rest of
// the file still runs (the existence assertion above already records
// the failure — without the guard, hcc(null) throws TypeError and
// sections 7–12 silently skip).
const hcc = window.hasCardContent;
if (typeof hcc === 'function') {
  assert('hasCardContent(null) => false', hcc(null) === false);
  assert('hasCardContent(undefined) => false', hcc(undefined) === false);
  assert('hasCardContent({}) => false', hcc({}) === false);
  assert('hasCardContent({note: ""}) => false', hcc({ note: '' }) === false);
  assert('hasCardContent({note: "  "}) => false', hcc({ note: '  ' }) === false);
  assert('hasCardContent({note: "hi"}) => true', hcc({ note: 'hi' }) === true);
  assert('hasCardContent({type: ""}) => false', hcc({ type: '' }) === false);
  assert('hasCardContent({type: null}) => false', hcc({ type: null }) === false);
  assert('hasCardContent({type: "vegan"}) => true', hcc({ type: 'vegan' }) === true);
  assert('hasCardContent({items: []}) => false', hcc({ items: [] }) === false);
  assert('hasCardContent({items: ["x"]}) => true', hcc({ items: ['x'] }) === true);
  assert('hasCardContent({a: null, b: "", note: ""}) => false', hcc({ a: null, b: '', note: '' }) === false);
  assert('hasCardContent({a: null, b: "val"}) => true', hcc({ a: null, b: 'val' }) === true);
}

// ═══════════════════════════════════════
// 7. lab-context.js uses hasCardContent for 7 gates
// ═══════════════════════════════════════
console.log('7. Auto-Gating in lab-context.js');

const labCtxSrc = await fetchWithRetry('js/lab-context.js');
const hccMatches = (labCtxSrc.match(/hasCardContent\(/g) || []).length;
assert('lab-context.js has 7+ hasCardContent calls', hccMatches >= 7, `found ${hccMatches}`);
assert('lab-context.js imports hasCardContent', labCtxSrc.includes('hasCardContent'));
assert('Diagnoses gate: hasCardContent(diag)', labCtxSrc.includes('hasCardContent(diag)'));
assert('Diet gate: hasCardContent(diet)', labCtxSrc.includes('hasCardContent(diet)'));
assert('Exercise gate: hasCardContent(ex)', labCtxSrc.includes('hasCardContent(ex)'));
assert('Sleep gate: hasCardContent(sl)', labCtxSrc.includes('hasCardContent(sl)'));
assert('Stress gate: hasCardContent(st)', labCtxSrc.includes('hasCardContent(st)'));
assert('LoveLife gate: hasCardContent(ll)', labCtxSrc.includes('hasCardContent(ll)'));
assert('Environment gate: hasCardContent(env)', labCtxSrc.includes('hasCardContent(env)'));

// ═══════════════════════════════════════
// 8. Light & Circadian still uses custom gate
// ═══════════════════════════════════════
console.log('8. Custom Gates Preserved');

assert('Light & Circadian uses lc || autoLat', labCtxSrc.includes('lc || autoLat'));
assert('No hasCardContent(lc)', !labCtxSrc.includes('hasCardContent(lc)'));

// ═══════════════════════════════════════
// 9. SW includes changelog.js
// ═══════════════════════════════════════
console.log('9. Service Worker');

assert('APP_SHELL includes /js/changelog.js', swSrc.includes('/js/changelog.js'));

// ═══════════════════════════════════════
// 10. Changelog data integrity
// ═══════════════════════════════════════
console.log('10. Changelog Data');

assert('CHANGELOG has version field', changelogSrc.includes('version:'));
assert('CHANGELOG has date field', changelogSrc.includes('date:'));
assert('CHANGELOG has title field', changelogSrc.includes('title:'));
assert('CHANGELOG has items array', changelogSrc.includes('items:'));

// ═══════════════════════════════════════
// 11. Window exports
// ═══════════════════════════════════════
console.log('11. Window Exports');

assert('closeChangelog on window', typeof window.closeChangelog === 'function');
assert('openChangelog on window', typeof window.openChangelog === 'function');
assert('maybeShowChangelog on window', typeof window.maybeShowChangelog === 'function');

// ═══════════════════════════════════════
// 12. Source-code regex defenses (inline-tag whitelist + href safety)
// ═══════════════════════════════════════
// Live-DOM verification of the rendered output lives in test-changelog-dom.js;
// here we lock in the source-code regex that enforces the whitelist.
console.log('12. Renderer Source-Code Defenses');

assert('renderChangelogItem inline-tag whitelist limited to b/i/em/strong/code',
  /\(b\|i\|em\|strong\|code\)/.test(changelogSrc));
assert('renderChangelogItem rejects non-http(s)/mailto hrefs',
  /\^\(https\?:\|mailto:\)/.test(changelogSrc));
assert('renderChangelogItem adds target="_blank" rel="noopener noreferrer" to external links',
  /target="_blank" rel="noopener noreferrer"/.test(changelogSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
