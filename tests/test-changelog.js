// test-changelog.js — Verify What's New modal + hasCardContent auto-gating
// Run: fetch('tests/test-changelog.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c What\'s New + Auto-Gating Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const changelogSrc = await fetchWithRetry('js/changelog.js');
  const chatSrc = await fetchWithRetry('js/chat.js');
  const utilsSrc = await fetchWithRetry('js/utils.js');
  const mainSrc = await fetchWithRetry('js/main.js');
  const settingsSrc = await fetchWithRetry('js/settings.js');
  const swSrc = await fetchWithRetry('service-worker.js');
  const indexSrc = await fetchWithRetry('/app');

  const versionSrc = await fetchWithRetry('version.js');

  // ═══════════════════════════════════════
  // 1. changelog.js module structure
  // ═══════════════════════════════════════
  console.log('%c 1. Changelog Module Structure ', 'font-weight:bold;color:#f59e0b');

  assert('changelog.js uses window.APP_VERSION', changelogSrc.includes('window.APP_VERSION'));
  assert('changelog.js has CHANGELOG array', changelogSrc.includes('const CHANGELOG'));
  assert('changelog.js exports openChangelog', changelogSrc.includes('export function openChangelog'));
  assert('changelog.js exports closeChangelog', changelogSrc.includes('export function closeChangelog'));
  assert('changelog.js exports maybeShowChangelog', changelogSrc.includes('export function maybeShowChangelog'));
  assert('changelog.js has getMajorMinor helper', changelogSrc.includes('function getMajorMinor'));
  assert('maybeShowChangelog compares major.minor only', changelogSrc.includes('getMajorMinor(seen) !== getMajorMinor('));
  // forceShow patch-bump escape hatch — when a maintainer flags an entry as
  // critical (e.g. v1.7.1 "re-export your encrypted backup"), the modal
  // must auto-fire even on a same-major.minor patch bump.
  assert('changelog.js has _semverGt helper for forceShow gate',
    /function\s+_semverGt\s*\(/.test(changelogSrc));
  assert('maybeShowChangelog has forceShow branch on latest entry',
    /CHANGELOG\[0\][\s\S]{0,120}forceShow[\s\S]{0,120}_semverGt/.test(changelogSrc));
  assert('forceShow only fires when latest entry advances past seen version',
    /_semverGt\(latest\.version,\s*seen\)/.test(changelogSrc));
  // The v1.7.1 entry itself must carry forceShow — its body asks users to
  // re-export their encrypted backup. Lock this in so a future copy edit
  // doesn't silently drop the flag and break the call-to-action.
  assert("v1.7.1 entry carries forceShow: true",
    /version:\s*'1\.7\.1'[\s\S]{0,400}forceShow:\s*true/.test(changelogSrc));

  // ═══════════════════════════════════════
  // 2. Unified semver versioning
  // ═══════════════════════════════════════
  console.log('%c 2. Unified Semver Versioning ', 'font-weight:bold;color:#f59e0b');

  const versionMatch = versionSrc.match(/APP_VERSION\s*=\s*'([^']+)'/);
  assert('version.js sets APP_VERSION', versionMatch !== null, versionMatch ? `'${versionMatch[1]}'` : 'not found');
  assert('APP_VERSION is semver', versionMatch && /^\d+\.\d+\.\d+/.test(versionMatch[1]), versionMatch ? versionMatch[1] : '');
  assert('SW imports version.js', swSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses template literal', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));
  assert('SW APP_SHELL includes version.js', swSrc.includes("'/version.js'"));
  assert('index.html loads version.js', indexSrc.includes('src="version.js"'));

  // ═══════════════════════════════════════
  // 3. HTML: changelog modal exists
  // ═══════════════════════════════════════
  console.log('%c 3. HTML Modal Structure ', 'font-weight:bold;color:#f59e0b');

  assert('changelog-modal-overlay exists in HTML', indexSrc.includes('id="changelog-modal-overlay"'));
  assert('changelog-modal exists in HTML', indexSrc.includes('id="changelog-modal"'));
  assert('changelog modal has role=dialog', indexSrc.includes('changelog-modal') && indexSrc.includes('role="dialog"'));
  assert('changelog modal has aria-label', indexSrc.includes('aria-label="What\'s New"'));

  const overlayEl = document.getElementById('changelog-modal-overlay');
  const modalEl = document.getElementById('changelog-modal');
  assert('changelog-modal-overlay in DOM', !!overlayEl);
  assert('changelog-modal in DOM', !!modalEl);

  // ═══════════════════════════════════════
  // 4. main.js wiring
  // ═══════════════════════════════════════
  console.log('%c 4. main.js Wiring ', 'font-weight:bold;color:#f59e0b');

  assert('main.js imports maybeShowChangelog', mainSrc.includes("import { maybeShowChangelog } from './changelog.js'"));
  assert('main.js calls maybeShowChangelog', mainSrc.includes('maybeShowChangelog()'));
  assert('main.js has changelog overlay click handler', mainSrc.includes('changelog-modal-overlay') && mainSrc.includes('closeChangelog'));
  assert('main.js has changelog Escape handler', mainSrc.includes('changelogOverlay'));
  assert('main.js focus trap includes changelog', mainSrc.includes('"changelog-modal-overlay"'));

  // ═══════════════════════════════════════
  // 5. Settings: What's New button
  // ═══════════════════════════════════════
  console.log('%c 5. Settings Integration ', 'font-weight:bold;color:#f59e0b');

  assert('Settings references openChangelog', settingsSrc.includes('openChangelog'));
  assert('Settings has What\'s New button', settingsSrc.includes("What's New"));

  // ═══════════════════════════════════════
  // 6. hasCardContent utility
  // ═══════════════════════════════════════
  console.log('%c 6. hasCardContent Utility ', 'font-weight:bold;color:#f59e0b');

  assert('hasCardContent exported from utils.js', utilsSrc.includes('export function hasCardContent'));
  assert('hasCardContent on window', typeof window.hasCardContent === 'function');

  // Behavioral tests
  if (typeof window.hasCardContent === 'function') {
    const hcc = window.hasCardContent;
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
  console.log('%c 7. Auto-Gating in lab-context.js ', 'font-weight:bold;color:#f59e0b');

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
  console.log('%c 8. Custom Gates Preserved ', 'font-weight:bold;color:#f59e0b');

  assert('Light & Circadian uses lc || autoLat', labCtxSrc.includes('lc || autoLat'));
  assert('No hasCardContent(lc)', !labCtxSrc.includes('hasCardContent(lc)'));

  // ═══════════════════════════════════════
  // 9. SW includes changelog.js
  // ═══════════════════════════════════════
  console.log('%c 9. Service Worker ', 'font-weight:bold;color:#f59e0b');

  assert('APP_SHELL includes /js/changelog.js', swSrc.includes('/js/changelog.js'));

  // ═══════════════════════════════════════
  // 10. Changelog data integrity
  // ═══════════════════════════════════════
  console.log('%c 10. Changelog Data ', 'font-weight:bold;color:#f59e0b');

  assert('CHANGELOG has version field', changelogSrc.includes('version:'));
  assert('CHANGELOG has date field', changelogSrc.includes('date:'));
  assert('CHANGELOG has title field', changelogSrc.includes('title:'));
  assert('CHANGELOG has items array', changelogSrc.includes('items:'));

  // ═══════════════════════════════════════
  // 11. Window exports
  // ═══════════════════════════════════════
  console.log('%c 11. Window Exports ', 'font-weight:bold;color:#f59e0b');

  assert('closeChangelog on window', typeof window.closeChangelog === 'function');
  assert('openChangelog on window', typeof window.openChangelog === 'function');
  assert('maybeShowChangelog on window', typeof window.maybeShowChangelog === 'function');

  // ═══════════════════════════════════════
  // 12. Open/close behavior
  // ═══════════════════════════════════════
  console.log('%c 12. Open/Close Behavior ', 'font-weight:bold;color:#f59e0b');

  // Test open
  window.openChangelog(true);
  const ovAfterOpen = document.getElementById('changelog-modal-overlay');
  assert('openChangelog adds show class', ovAfterOpen && ovAfterOpen.classList.contains('show'));
  const modalContent = document.getElementById('changelog-modal');
  assert('Modal has close button', modalContent && modalContent.innerHTML.includes('modal-close'));
  assert('Modal has What\'s New heading', modalContent && modalContent.innerHTML.includes("What's New"));

  // Test close
  window.closeChangelog();
  const ovAfterClose = document.getElementById('changelog-modal-overlay');
  assert('closeChangelog removes show class', ovAfterClose && !ovAfterClose.classList.contains('show'));
  assert('closeChangelog marks version as seen', localStorage.getItem('labcharts-changelog-seen') !== null);

  // ── forceShow behavioral: seen=1.7.0 + APP_VERSION=1.7.1 must auto-open ──
  // Patch bumps normally skip auto-open; forceShow on the latest entry has
  // to override that. Stash the seen value, set it to 1.7.0, fire
  // maybeShowChangelog, assert overlay opened.
  const _origSeen = localStorage.getItem('labcharts-changelog-seen');
  try {
    localStorage.setItem('labcharts-changelog-seen', '1.7.0');
    // Prove overlay starts hidden
    ovAfterClose?.classList.remove('show');
    window.maybeShowChangelog();
    assert('maybeShowChangelog auto-opens on 1.7.0→1.7.1 patch bump (forceShow branch)',
      ovAfterClose?.classList.contains('show') === true);
    window.closeChangelog();
    // Re-fire idempotency: after closeChangelog markChangelogSeen wrote the
    // current APP_VERSION as seen, so _semverGt(latest.version, seen) is now
    // false → modal must NOT re-open on subsequent maybeShowChangelog calls.
    window.maybeShowChangelog();
    assert('maybeShowChangelog stays closed once user has seen the latest version',
      ovAfterClose?.classList.contains('show') === false);
  } finally {
    if (_origSeen !== null) localStorage.setItem('labcharts-changelog-seen', _origSeen);
    else localStorage.removeItem('labcharts-changelog-seen');
  }

  // ═══════════════════════════════════════
  // Inline-tag whitelist in changelog items
  // ═══════════════════════════════════════
  // Items use <b>/<i>/<em>/<strong>/<code> for emphasis. Verify the renderer
  // both renders those AND keeps escaping anything else.
  window.openChangelog(true);
  const tagModal = document.getElementById('changelog-modal');
  const itemsHTML = tagModal?.innerHTML || '';
  assert('changelog renders <b> as bold (not literal text)',
    itemsHTML.includes('<b>') && !itemsHTML.includes('&lt;b&gt;'));
  // Sanity that <b> rendering works on a known current-changelog bullet.
  assert('expected bold span "Medical History" present',
    /<b>The Medical Conditions card is now Medical History<\/b>/.test(itemsHTML));
  assert('changelog renders <code> as code (not literal text)',
    !itemsHTML.includes('&lt;code&gt;'));
  // Defense: source-code regex limits the inline-tag whitelist. A wildcard
  // or a direct innerHTML on the raw item would be a security regression.
  const renderSrc = await fetch('js/changelog.js').then(r => r.text());
  assert('renderChangelogItem inline-tag whitelist limited to b/i/em/strong/code',
    /\(b\|i\|em\|strong\|code\)/.test(renderSrc));
  // Anchor tags also pass through with safe-protocol enforcement. Inject a
  // few synthetic items into the live module via window.CHANGELOG isn't
  // safe (module-private const) — instead drive the renderer indirectly
  // via the whitelisted v1.3.0 entry which carries an https://getbased link.
  assert('changelog renders safe https <a> as a real link',
    /<a href="https:\/\/getbased\.health[^"]*" target="_blank" rel="noopener noreferrer">[^<]+<\/a>/.test(itemsHTML));
  // Source-code regex defenses: protocol allowlist + target/rel.
  assert('renderChangelogItem rejects non-http(s)/mailto hrefs',
    /\^\(https\?:\|mailto:\)/.test(renderSrc));
  assert('renderChangelogItem adds target="_blank" rel="noopener noreferrer" to external links',
    /target="_blank" rel="noopener noreferrer"/.test(renderSrc));
  window.closeChangelog();

  // Clean up
  localStorage.removeItem('labcharts-changelog-seen');

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Results: ${pass} passed, ${fail} failed `, `background:${fail?'#ef4444':'#22c55e'};color:#fff;font-size:14px;padding:4px 12px;border-radius:4px`);
})();
