#!/usr/bin/env node
// test-changelog.js — Changelog modal source structure + hasCardContent auto-gating.
//
// Run: node tests/test-changelog.js  (or via npm test)
//
// DOM-runtime assertions (modal open/close, classList toggling, innerHTML
// rendering, forceShow behavior) live in tests/playwright/changelog.spec.js.

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

// Changelog actions are module-only.
await import('../js/state.js');
const { hasCardContent } = await import('../js/utils.js');
const changelogModule = await import('../js/changelog.js');

const changelogFacadeSrc = await fetchWithRetry('js/changelog.js');
const changelogImplSrc = await fetchWithRetry('js/changelog-impl.js');
const changelogSrc = `${changelogFacadeSrc}\n${changelogImplSrc}`;
const utilsSrc = await fetchWithRetry('js/utils.js');
const startupUiSrc = await fetchWithRetry('js/startup-ui.js');
const appEventsSrc = await fetchWithRetry('js/app-event-listeners.js');
const settingsSrc = await fetchWithRetry('js/settings.js');
const settingsDisplaySrc = await fetchWithRetry('js/settings-display-panel.js');
const swSrc = await fetchWithRetry('service-worker.js');
const modalLifecycleSrc = await fetchWithRetry('js/modal-lifecycle.js');
// Original test fetched '/app' (dev-server alias for index.html); read
// index.html directly in Node.
const indexSrc = await fetchWithRetry('index.html');
const versionSrc = await fetchWithRetry('version.js');

// ═══════════════════════════════════════
// 1. changelog.js module structure
// ═══════════════════════════════════════
console.log('1. Changelog Module Structure');

assert('changelog.js delegates APP_VERSION through utils runtime',
  changelogSrc.includes("from './utils-runtime.js'")
    && changelogSrc.includes('getAppVersionRuntime')
    && !changelogSrc.includes('window.APP_VERSION'));
assert('Startup footer delegates APP_VERSION through utils runtime',
  startupUiSrc.includes("import { getAppVersionRuntime } from './utils-runtime.js';")
    && startupUiSrc.includes('vTextEl.textContent = getAppVersionRuntime()')
    && !startupUiSrc.includes("getStartupRuntimeValue('APP_VERSION')"));
assert('changelog.js has CHANGELOG array', changelogSrc.includes('const CHANGELOG'));
assert('changelog.js exports openChangelog', changelogSrc.includes('export function openChangelog'));
assert('changelog.js exports closeChangelog', changelogSrc.includes('export function closeChangelog'));
assert('changelog.js exports maybeShowChangelog', changelogSrc.includes('export function maybeShowChangelog'));
assert('changelog.js uses shared modal overlay lifecycle helpers',
  changelogSrc.includes("from './modal-lifecycle.js'")
    && changelogSrc.includes('openModalOverlay(')
    && changelogSrc.includes('closeModalOverlay('));
assert('changelog.js delegates modal close button without inline handlers',
  changelogSrc.includes('data-changelog-action') &&
    changelogSrc.includes('installChangelogDelegates(modal)') &&
    !/\bon(?:click|change|input|submit|keydown|keyup)=/.test(changelogSrc));
assert('changelog.js keeps its actions module-only',
  !changelogSrc.includes('registerUtilsRuntimeExports')
    && !/Object\.assign\(window/.test(changelogSrc)
    && typeof changelogModule.openChangelog === 'function'
    && typeof changelogModule.closeChangelog === 'function'
    && typeof changelogModule.maybeShowChangelog === 'function');
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
  /FORCE_SHOW_VERSIONS\.some\s*\(\s*version\s*=>\s*_semverGt\(version,\s*seen\)/.test(changelogFacadeSrc));
const changelogVersionMatches = [...changelogImplSrc.matchAll(/version:\s*'([^']+)'/g)];
const forceShowVersionsInArchive = changelogVersionMatches
  .filter((match, index) => {
    const nextIndex = changelogVersionMatches[index + 1]?.index ?? changelogImplSrc.length;
    return /forceShow:\s*true/.test(changelogImplSrc.slice(match.index, nextIndex));
  })
  .map(match => match[1])
  .sort();
const forceShowGateBlock = changelogFacadeSrc.match(/const FORCE_SHOW_VERSIONS = \[([\s\S]*?)\];/)?.[1] || '';
const forceShowVersionsInGate = [...forceShowGateBlock.matchAll(/'([^']+)'/g)]
  .map(match => match[1])
  .sort();
assert('cold changelog gate exactly mirrors forceShow archive metadata',
  JSON.stringify(forceShowVersionsInGate) === JSON.stringify(forceShowVersionsInArchive),
  `${forceShowVersionsInGate.join(',')} !== ${forceShowVersionsInArchive.join(',')}`);
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
const appVersion = versionMatch?.[1] || '';
function semverGte(a, b) {
  const aParts = String(a).split('.').map(Number);
  const bParts = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const aPart = Number.isFinite(aParts[i]) ? aParts[i] : 0;
    const bPart = Number.isFinite(bParts[i]) ? bParts[i] : 0;
    if (aPart !== bPart) return aPart > bPart;
  }
  return true;
}
assert('version.js sets APP_VERSION', versionMatch !== null, versionMatch ? `'${versionMatch[1]}'` : 'not found');
assert('APP_VERSION is semver', versionMatch && /^\d+\.\d+\.\d+/.test(versionMatch[1]), versionMatch ? versionMatch[1] : '');
const latestChangelogVersion = changelogSrc.match(/version:\s*'([^']+)'/)?.[1] || '';
assert('APP_VERSION is at least latest changelog entry', appVersion && latestChangelogVersion && semverGte(appVersion, latestChangelogVersion), `${appVersion} < ${latestChangelogVersion}`);
assert('latest changelog gives a readable overview of the redesigned health context release',
  /version:\s*'1\.12\.0'[\s\S]{0,500}A completely redesigned health context/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,1600}redesigned from the ground up/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,2200}questions are more useful and more complete/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,2800}stay in control of how much you add/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,3600}easier to interpret over time/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,4400}Both demo profiles have been rebuilt/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,5200}Demo AI is safer and more flexible/.test(changelogSrc)
    && /version:\s*'1\.12\.0'[\s\S]{0,5400}paid AI is only used after clear permission/.test(changelogSrc));
assert('latest changelog gives a simple cross-device sync overview',
  /version:\s*'1\.11\.7'[\s\S]{0,500}More reliable cross-device sync/.test(changelogSrc)
    && /version:\s*'1\.11\.7'[\s\S]{0,1200}Sync uses less storage/.test(changelogSrc)
    && /version:\s*'1\.11\.7'[\s\S]{0,1200}Sync is easier to manage/.test(changelogSrc)
    && /version:\s*'1\.11\.7'[\s\S]{0,1600}Update notices appear on the right device/.test(changelogSrc));
assert('Venice changelog explains encrypted checks and limits in newcomer-readable terms',
  /version:\s*'1\.11\.6'[\s\S]{0,500}Clearer, stronger encrypted Venice chats/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,2200}protected Intel environment \(called a TEE\)/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,2200}If either required check fails, the encrypted session does not start/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,2200}The lock is easier to understand/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,2200}TEE \+ GPU/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,2600}Venice can still see your API key and connection details/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,3000}without proving that they are running together/.test(changelogSrc)
    && /version:\s*'1\.11\.6'[\s\S]{0,3400}signed NVIDIA result is still verified in your browser/.test(changelogSrc));
assert('Google Health changelog explains the self-host limit and Fitbit transition in user-readable terms',
  /version:\s*'1\.11\.1'[\s\S]{0,500}Google Health support for self-hosted setups/.test(changelogSrc)
    && /version:\s*'1\.11\.1'[\s\S]{0,1800}not available in the official hosted app/.test(changelogSrc)
    && /version:\s*'1\.11\.1'[\s\S]{0,1800}Fitbit is moving to Google Health/.test(changelogSrc)
    && /version:\s*'1\.11\.1'[\s\S]{0,1800}September 2026/.test(changelogSrc)
    && /version:\s*'1\.11\.1'[\s\S]{0,2200}Fitbit devices will continue to work through Google Health/.test(changelogSrc)
    && /version:\s*'1\.11\.1'[\s\S]{0,2600}Self-hosted Google Health connections remain read-only and transparent/.test(changelogSrc)
    && !/version:\s*'1\.11\.1'[\s\S]{0,2600}Terms and Privacy document these protections/.test(changelogSrc));
assert('latest changelog launches Voice in high-level user-readable terms',
  /version:\s*'1\.11\.0'[\s\S]{0,500}Talk and listen in Chat/.test(changelogSrc)
    && /version:\s*'1\.11\.0'[\s\S]{0,1600}Chat now supports voice/.test(changelogSrc)
    && /version:\s*'1\.11\.0'[\s\S]{0,1600}You choose where speech is processed/.test(changelogSrc)
    && /version:\s*'1\.11\.0'[\s\S]{0,1600}Voice is private by default/.test(changelogSrc)
    && /version:\s*'1\.11\.0'[\s\S]{0,1600}Make it sound right for you/.test(changelogSrc));
assert('mobile changelog gives a simple overview of chat, Biology Coherence contrast, and general improvements',
  /version:\s*'1\.10\.397'[\s\S]{0,500}Smoother mobile chat and clearer Biology Scores/.test(changelogSrc)
    && /version:\s*'1\.10\.397'[\s\S]{0,1200}Chat is smoother on mobile/.test(changelogSrc)
    && /version:\s*'1\.10\.397'[\s\S]{0,1200}Biology Coherence is easier to read/.test(changelogSrc)
    && /version:\s*'1\.10\.397'[\s\S]{0,1200}General fixes and improvements/.test(changelogSrc));
assert('latest changelog gives a simple high-level lab chart overview',
  /version:\s*'1\.10\.305'[\s\S]{0,500}Clearer lab trends at a glance/.test(changelogSrc)
    && /version:\s*'1\.10\.305'[\s\S]{0,1200}A consistent timeline across lab charts/.test(changelogSrc)
    && /version:\s*'1\.10\.305'[\s\S]{0,1200}Recent results in one place/.test(changelogSrc)
    && /version:\s*'1\.10\.305'[\s\S]{0,1200}Clear marker context/.test(changelogSrc));
assert('latest changelog explains private AI reliability and Venice limits in user-readable terms',
  /version:\s*'1\.10\.177'[\s\S]{0,1800}Long private replies can finish normally/.test(changelogSrc)
    && /version:\s*'1\.10\.177'[\s\S]{0,1800}Reasoning-heavy models no longer leave an empty chat/.test(changelogSrc)
    && /version:\s*'1\.10\.177'[\s\S]{0,1800}PPQ Private handles secure-server key changes/.test(changelogSrc)
    && /version:\s*'1\.10\.177'[\s\S]{0,2200}connection metadata remains visible/.test(changelogSrc)
    && /version:\s*'1\.10\.177'[\s\S]{0,2200}does not fully verify the hardware quote or running code by default/.test(changelogSrc)
    && /version:\s*'1\.10\.177'[\s\S]{0,500}forceShow:\s*true/.test(changelogSrc));
assert('latest changelog documents cycle import sources and local-data boundaries',
  /version:\s*'1\.10\.157'[\s\S]{0,1200}Apple Health, Drip, Natural Cycles[\s\S]{0,600}extracted Clue JSON/.test(changelogSrc)
  && /version:\s*'1\.10\.157'[\s\S]{0,1600}Detailed observations stay local/.test(changelogSrc)
  && /version:\s*'1\.10\.157'[\s\S]{0,1600}Remove one batch, one source, or all cycle data/.test(changelogSrc));
assert('latest changelog documents granular Context management in user-readable terms',
  /version:\s*'1\.10\.62'[\s\S]{0,1600}Control what AI uses as context/.test(changelogSrc)
    && /version:\s*'1\.10\.62'[\s\S]{0,1600}You can now choose what AI uses/.test(changelogSrc)
    && /version:\s*'1\.10\.62'[\s\S]{0,1600}Manage → Context/.test(changelogSrc)
    && /version:\s*'1\.10\.62'[\s\S]{0,1600}Turning context off does not delete data/.test(changelogSrc)
    && /version:\s*'1\.10\.62'[\s\S]{0,1600}AI answers and missing-data nudges/.test(changelogSrc)
    && /version:\s*'1\.10\.62'[\s\S]{0,1600}Genome and labs have finer controls/.test(changelogSrc)
    && /version:\s*'1\.10\.62'[\s\S]{0,500}forceShow:\s*true/.test(changelogSrc));
assert('previous changelog documents Biology Scores persistence and Profile Context cleanup in user-readable terms',
  /version:\s*'1\.10\.29'[\s\S]{0,1600}separate app updates from real context changes/.test(changelogSrc)
    && /version:\s*'1\.10\.29'[\s\S]{0,1600}without paying for another AI unlock/.test(changelogSrc)
    && /version:\s*'1\.10\.29'[\s\S]{0,1600}Changed context still requires a refresh/.test(changelogSrc)
    && /version:\s*'1\.10\.29'[\s\S]{0,1600}Profile Context is cleaner/.test(changelogSrc)
    && /version:\s*'1\.10\.29'[\s\S]{0,500}forceShow:\s*true/.test(changelogSrc));
assert('previous changelog documents Agent Access overview in user-readable terms',
  /version:\s*'1\.10\.28'[\s\S]{0,1800}Agent Access is now a real private bridge/.test(changelogSrc)
    && /version:\s*'1\.10\.28'[\s\S]{0,1800}OpenClaw/.test(changelogSrc)
    && /version:\s*'1\.10\.28'[\s\S]{0,1800}Codex/.test(changelogSrc)
    && /version:\s*'1\.10\.28'[\s\S]{0,1800}end-to-end encrypted Sync profile/.test(changelogSrc)
    && /version:\s*'1\.10\.28'[\s\S]{0,1800}Agent Context key decrypts locally/.test(changelogSrc)
    && /version:\s*'1\.10\.28'[\s\S]{0,500}forceShow:\s*true/.test(changelogSrc));
assert('context/BP changelog documents merged AI context, KB-empty, and BP fixes in user-readable terms',
  /version:\s*'1\.10\.24'[\s\S]{0,1800}AI Context is easier to find/.test(changelogSrc)
    && /version:\s*'1\.10\.24'[\s\S]{0,1800}clickable green context chip/.test(changelogSrc)
    && /version:\s*'1\.10\.24'[\s\S]{0,1800}KB empty context chip/.test(changelogSrc)
    && /version:\s*'1\.10\.24'[\s\S]{0,1800}Blood pressure details now stay paired/.test(changelogSrc)
    && /version:\s*'1\.10\.24'[\s\S]{0,1800}Mixed-source BP data is safer/.test(changelogSrc)
    && /version:\s*'1\.10\.24'[\s\S]{0,500}forceShow:\s*true/.test(changelogSrc));
assert('previous changelog documents Routstr wallet upgrade in user-readable terms',
  /version:\s*'1\.10\.15'[\s\S]{0,1200}Routstr wallet upgrades are safer/.test(changelogSrc)
    && /version:\s*'1\.10\.15'[\s\S]{0,1200}Funding and refund recovery is better protected/.test(changelogSrc)
    && /version:\s*'1\.10\.15'[\s\S]{0,1200}wallet engine was refreshed/.test(changelogSrc)
    && /version:\s*'1\.10\.15'[\s\S]{0,400}forceShow:\s*true/.test(changelogSrc));
assert('previous changelog documents PPQ Private TEE in user-readable terms',
  /version:\s*'1\.10\.8'[\s\S]{0,900}PPQ Private TEE Mode/.test(changelogSrc)
    && /version:\s*'1\.10\.8'[\s\S]{0,900}encrypts prompts in your browser/.test(changelogSrc)
    && /version:\s*'1\.10\.8'[\s\S]{0,900}No local proxy or extra setup/.test(changelogSrc));
assert('SW imports version.js', swSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses template literal', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));
assert('SW APP_SHELL includes version.js', swSrc.includes("'/version.js'"));
assert('index.html loads version.js', indexSrc.includes('src="version.js"'));
assert('index.html loads service worker update module', indexSrc.includes('src="js/service-worker-update.js"'));
assert('modal-lifecycle.js exports overlay show/hide helpers',
  modalLifecycleSrc.includes('export function openModalOverlay')
    && modalLifecycleSrc.includes('export function closeModalOverlay'));

// ═══════════════════════════════════════
// 3. HTML: changelog modal exists in source
// ═══════════════════════════════════════
// (Source-string checks here. The live-DOM verification — that the
// elements are actually present after page load — runs in
// tests/playwright/changelog.spec.js.)
console.log('3. HTML Modal Structure');

assert('changelog-modal-overlay defined in index.html', indexSrc.includes('id="changelog-modal-overlay"'));
assert('changelog-modal defined in index.html', indexSrc.includes('id="changelog-modal"'));
assert('changelog modal has role=dialog', indexSrc.includes('changelog-modal') && indexSrc.includes('role="dialog"'));
assert('changelog modal has aria-label', indexSrc.includes('aria-label="What\'s New"'));

// ═══════════════════════════════════════
// 4. Startup UI wiring
// ═══════════════════════════════════════
console.log('4. Startup UI Wiring');

assert('startup-ui.js imports maybeShowChangelog', startupUiSrc.includes("import { maybeShowChangelog } from './changelog.js'"));
assert('startup-ui.js calls maybeShowChangelog', startupUiSrc.includes('maybeShowChangelog()'));
assert('app-event-listeners.js has changelog overlay click handler', appEventsSrc.includes('changelog-modal-overlay') && appEventsSrc.includes('closeChangelog'));
assert('app-event-listeners.js has changelog Escape handler', appEventsSrc.includes('changelogOverlay'));
assert('app-event-listeners.js focus trap includes changelog', appEventsSrc.includes('"changelog-modal-overlay"'));

// ═══════════════════════════════════════
// 5. Settings: What's New button
// ═══════════════════════════════════════
console.log('5. Settings Integration');

assert('Settings references openChangelog', settingsSrc.includes('openChangelog'));
assert("Settings has What's New button", settingsDisplaySrc.includes("What's New"));

// ═══════════════════════════════════════
// 6. hasCardContent utility
// ═══════════════════════════════════════
console.log('6. hasCardContent Utility');

assert('hasCardContent exported from utils.js', utilsSrc.includes('export function hasCardContent'));
assert('hasCardContent stays module-only', !('hasCardContent' in window));

// Behavioral tests — pure logic through the module export.
const hcc = hasCardContent;
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
assert('APP_SHELL includes /js/changelog-impl.js', swSrc.includes('/js/changelog-impl.js'));
assert('APP_SHELL includes /js/service-worker-update.js', swSrc.includes('/js/service-worker-update.js'));

// ═══════════════════════════════════════
// 10. Changelog data integrity
// ═══════════════════════════════════════
console.log('10. Changelog Data');

assert('CHANGELOG has version field', changelogSrc.includes('version:'));
assert('CHANGELOG has date field', changelogSrc.includes('date:'));
assert('CHANGELOG has title field', changelogSrc.includes('title:'));
assert('CHANGELOG has items array', changelogSrc.includes('items:'));
assert('CHANGELOG records report feature overhaul',
  changelogSrc.includes('Practitioner-ready report builder') &&
    changelogSrc.includes('Report feature overhaul') &&
    changelogSrc.includes('Editable Practitioner Overview') &&
    changelogSrc.includes('Smoother report workflow'));
assert('CHANGELOG records Biology Scores main release',
  changelogSrc.includes("version: '1.9.0'")
    && changelogSrc.includes('Biology Scores and Biological Coherence')
    && changelogSrc.includes('A new lens on your biology')
    && changelogSrc.includes('Biological Coherence shows the whole-body picture')
    && changelogSrc.includes('Know what to test next'));
assert('CHANGELOG records per-file lab import storage release',
  changelogSrc.includes("version: '1.10.6'")
    && changelogSrc.includes('Per-file lab import storage')
    && changelogSrc.includes('Lab imports are now stored per file')
    && changelogSrc.includes('Same-day reports are easier to manage')
    && changelogSrc.includes('import that report again')
    && /version:\s*'1\.10\.6'[\s\S]{0,180}forceShow:\s*true/.test(changelogSrc));
assert('Per-file import storage changelog is user-facing, not a technical fix log',
  !/Greptile|bugfix|bugfixes|production hardening|UI polish|tombstone|CRDT|manualValues|fixed|tightened before release/i.test(changelogSrc.slice(changelogSrc.indexOf("version: '1.10.6'"), changelogSrc.indexOf("version: '1.9.0'"))));
assert('Biology Scores changelog is announcement-style, not a technical fix log',
  !/Greptile|bugfix|bugfixes|production hardening|UI polish|stale explanation|sync|CRP\/hs-CRP|fixed|tightened before release/i.test(changelogSrc.slice(changelogSrc.indexOf("version: '1.9.0'"), changelogSrc.indexOf("version: '1.8.550'"))));
assert('APP_VERSION is at least the per-file lab import storage release',
  versionMatch && semverGte(appVersion, '1.10.6'), appVersion);
assert('APP_VERSION is at least the Biology Scores main release',
  versionMatch && semverGte(appVersion, '1.9.0'), appVersion);

// ═══════════════════════════════════════
// 11. Module boundary
// ═══════════════════════════════════════
console.log('11. Module Boundary');

assert('closeChangelog stays off window', !('closeChangelog' in window));
assert('openChangelog stays off window', !('openChangelog' in window));
assert('maybeShowChangelog stays off window', !('maybeShowChangelog' in window));

// ═══════════════════════════════════════
// 12. Source-code regex defenses (inline-tag whitelist + href safety)
// ═══════════════════════════════════════
// Live-DOM verification of the rendered output lives in tests/playwright/changelog.spec.js;
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
