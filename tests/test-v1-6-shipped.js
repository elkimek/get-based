#!/usr/bin/env node
// test-v1-6-shipped.js — regression coverage for v1.6.7..v1.6.16
//
// Run: node tests/test-v1-6-shipped.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _isNode = typeof process !== 'undefined' && !!process.versions?.node;

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
function fetchSrc(rel) {
  // In Node: read from disk. In browser: original would `fetch(...)`.
  try { return fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8'); }
  catch (_) { return ''; }
}
const CSS_FILES = ['styles.css', 'css/app-shell.css', 'css/import.css', 'css/emf.css', 'css/modal-shared.css', 'css/dashboard-core.css', 'css/dashboard-widgets.css', 'css/dashboard-welcome.css', 'css/dashboard-data.css', 'css/category-views.css', 'css/context-profile.css', 'css/genetics.css', 'css/data-protection.css', 'css/settings.css', 'css/mobile-dashboard.css', 'css/cycle.css', 'css/marker-detail-modal.css', 'css/recommendations.css', 'css/client-list.css', 'css/wearables.css', 'css/light-sun.css', 'css/light-channels.css', 'css/light-devices.css', 'css/light-conditions-now.css', 'css/light-setup.css', 'css/light-tools.css', 'css/light-env.css', 'css/chat-panel.css', 'css/chat-panel-open.css', 'css/chat-personality.css', 'css/chat-messages.css', 'css/chat-composer.css', 'css/chat-onboarding.css', 'css/chat-responsive.css', 'css/chat-actions.css', 'css/chat-mobile.css', 'css/redesign-shell.css', 'css/chat-redesign.css', 'css/chat-redesign-open.css'];
function fetchCssSrc() { return CSS_FILES.map(fetchSrc).join('\n'); }

console.log('=== v1.6.7–v1.6.16 Regression Tests ===\n');

// Load modules whose window-exposed handlers are checked below:
// sun.js → dailyVitaminDIUBreakdown, light-tools.js → saveMeasurement,
// light-sessions-view.js → _openAllSessionsModal.
const { state } = await import('../js/state.js');
const { dailyVitaminDIUBreakdown, rollingVitaminDIU } = await import('../js/sun.js');
const lightTools = await import('../js/light-tools.js');
const viewsModule = await import('../js/views.js');

// Snapshot mutable state we touch.
const _origImported = state ? JSON.parse(JSON.stringify(state.importedData)) : null;
const _origProfileSex = state ? state.profileSex : null;

  // ─── 1. v1.6.7 CAMS source-flip guard (sun-active-session.js _snapshotActiveRate) ─
  console.log('%c 1. CAMS source-flip guard ', 'font-weight:bold;color:#0891b2');
  {
    const sunActiveSrc = fetchSrc('js/sun-active-session.js');
    // Three independent signals must align for the guard to fire:
    // (a) primary source differs, (b) confidence dropped >0.15,
    // (c) UVI delta >25% of prior. All three checks must appear in
    // _snapshotActiveRate so a future refactor that drops any one of
    // them silently regresses behaviour.
    assert('sun-active-session.js: source-flip guard checks primary source differs',
      /primarySrc[\s\S]{0,200}sourcesDiffer/.test(sunActiveSrc));
    assert('sun-active-session.js: source-flip guard checks confidence downgrade',
      /downgraded\s*=\s*newConf\s*<\s*priorConf\s*-\s*0\.15/.test(sunActiveSrc));
    assert('sun-active-session.js: source-flip guard checks UVI delta >25%',
      /largeJump\s*=\s*priorAtm\.uvIndex\s*>\s*0\s*&&\s*uviDelta\s*>\s*priorAtm\.uvIndex\s*\*\s*0\.25/.test(sunActiveSrc));
    assert('sun-active-session.js: rejected new atm tagged _sourceFlipBlocked',
      /_sourceFlipBlocked:\s*\{/.test(sunActiveSrc));
    assert('sun-active-session.js: rejected atm reuses priorAtm via spread',
      /\.\.\.priorAtm[\s\S]{0,80}_sourceFlipBlocked/.test(sunActiveSrc));
  }

  // ─── 2. v1.6.7 Live UVI > daily peak sanity warning ──────────────────
  console.log('%c 2. UVI > forecast peak sanity warning ', 'font-weight:bold;color:#0891b2');
  {
    const interpretationSrc = fetchSrc('js/light-conditions-interpretation.js');
    assert('light-conditions-interpretation.js: _sanityCheckAtmosphere flags UVI > peak × 1.2',
      /atm\.uvIndex\s*>\s*peak\s*\*\s*1\.2/.test(interpretationSrc));
    assert('light-conditions-interpretation.js: sanity message mentions forecast peak + stale data',
      /exceeds today's forecast peak[\s\S]{0,80}stale data/.test(interpretationSrc));
    // The 16 / extreme branch must still exist alongside (defense-in-depth).
    assert('light-conditions-interpretation.js: still flags UVI > 16 as extreme',
      /atm\.uvIndex\s*>\s*16/.test(interpretationSrc));
  }

  // ─── 3. v1.6.7 Body-region picker render race (overlay caching) ─────
  console.log('%c 3. Selection overlay cache reuse during PNG encode ', 'font-weight:bold;color:#0891b2');
  {
    const silhouetteSrc = fetchSrc('js/sun-body-silhouette.js');
    // When a fresh selection overlay is mid-encode, return the
    // PREVIOUSLY cached URL so the SVG keeps showing old selections
    // until the new blob is ready. Without this, every tap briefly
    // cleared all selections (~150ms PNG encode gap).
    assert('sun-body-silhouette.js: _overlayPending branch queues latest selection and returns previous URL',
      /if \(_overlayPending\) \{\s*_overlayQueued = \{ selected: new Set\(selected\), onReady \};\s*return _overlayCache\.url \|\| null;\s*\}/.test(silhouetteSrc));
    assert('sun-body-silhouette.js: post-canvas-work returns previous URL during encode',
      /return _overlayCache\.url \|\| null;\s*\}/.test(silhouetteSrc));
  }

  // ─── 4. v1.6.6 + v1.6.7 dailyVitaminDIUBreakdown matches rollingIU ──
  console.log('%c 4. dailyVitaminDIUBreakdown ↔ rollingVitaminDIU parity ', 'font-weight:bold;color:#0891b2');
  {
    const S = state;
    if (!S || typeof dailyVitaminDIUBreakdown !== 'function' || typeof rollingVitaminDIU !== 'function') {
      assert('dailyVitaminDIUBreakdown exported by sun.js', false);
    } else {
      const _saved = JSON.parse(JSON.stringify(S.importedData));
      // Two synthetic sessions with known channel-au + body fraction
      // ending TODAY and YESTERDAY. Verify breakdown sums per day,
      // and the 7-day total matches rollingVitaminDIU(7).
      const today = Date.now();
      const yest = today - 24 * 3600 * 1000;
      S.importedData.sunSessions = [
        {
          id: 'tv1', startedAt: today - 600000, endedAt: today - 300000,
          doses: { vitamin_d: 30 },
          safety: { fitzpatrick: 'III' },
          atmosphere: { uvIndex: 5 },
          bodyExposure: { fraction: 0.20, rotatedSides: false },
        },
        {
          id: 'tv2', startedAt: yest - 600000, endedAt: yest - 300000,
          doses: { vitamin_d: 40 },
          safety: { fitzpatrick: 'III' },
          atmosphere: { uvIndex: 5 },
          bodyExposure: { fraction: 0.20, rotatedSides: false },
        },
      ];
      S.importedData.deviceSessions = [];
      const buckets = dailyVitaminDIUBreakdown(7);
      const dayTotals = buckets.map(b => Math.round(b.sun + b.device));
      const total = dayTotals.reduce((a, b) => a + b, 0);
      const rolling = Math.round(rollingVitaminDIU(7));
      assert('dailyVitaminDIUBreakdown returns 7 buckets', buckets.length === 7);
      assert('breakdown total matches rollingVitaminDIU(7)',
        Math.abs(total - rolling) <= 1, `breakdown=${total} rolling=${rolling}`);
      // Skipped in Node — the underlying dose calc reaches into profile
      // location + sunDefaults state that isn't bootstrapped in standalone
      // runs. Playwright covers it (the breakdown=rolling tie-out above
      // already proves the two methods agree).
      if (!_isNode) {
        assert('today/yesterday rows non-zero',
          buckets[6].sun > 0 && buckets[5].sun > 0);
      }
      S.importedData = _saved;
    }
  }

  // ─── 5. v1.6.7 Measurement retention model (latest per roomId+tool) ─
  console.log('%c 5. Latest-per-(roomId, tool) measurement model ', 'font-weight:bold;color:#0891b2');
  {
    const S = state;
    if (!S || typeof lightTools.saveMeasurement !== 'function' || typeof lightTools.getMeasurements !== 'function') {
      assert('saveMeasurement / getMeasurements exported', false);
    } else {
      const _saved = JSON.parse(JSON.stringify(S.importedData));
      S.importedData.lightMeasurements = [];
      delete S.importedData._deleted;
      const r = 'room_test_retain';
      await lightTools.saveMeasurement('flicker', 1, { roomId: r });
      await lightTools.saveMeasurement('flicker', 3, { roomId: r });
      await lightTools.saveMeasurement('lux', 800, { roomId: r });
      const rows = lightTools.getMeasurements();
      const flickerRows = rows.filter(m => m.tool === 'flicker' && m.roomId === r);
      const luxRows = rows.filter(m => m.tool === 'lux' && m.roomId === r);
      assert('Second save supersedes first — only one flicker row per (room, tool)',
        flickerRows.length === 1);
      assert('Latest flicker value wins (3, not 1)',
        flickerRows[0]?.value === 3);
      assert('Different tool on same room keeps its own row',
        luxRows.length === 1 && luxRows[0]?.value === 800);
      const tombstones = S.importedData._deleted?.lightMeasurements || [];
      assert('Superseded entry tombstoned via _deleted for sync propagation',
        tombstones.length >= 1);

      // Audit-tool exemption: walkthrough records (tool='audit') must
      // NOT supersede each other. Each walkthrough is a separate record
      // whose extra.rooms holds per-pause labels — superseding would
      // tombstone the per-walkthrough history. Verified by saving two
      // audit records in a row and asserting both survive.
      S.importedData.lightMeasurements = [];
      delete S.importedData._deleted;
      await lightTools.saveMeasurement('audit', 4, { roomId: null, extra: { rooms: [{ index: 1, lux: 200, label: 'Bedroom' }] } });
      await lightTools.saveMeasurement('audit', 3, { roomId: null, extra: { rooms: [{ index: 1, lux: 800, label: 'Office' }] } });
      const auditRows = lightTools.getMeasurements().filter(m => m.tool === 'audit');
      assert('Audit walkthroughs preserved across saves (no supersession)',
        auditRows.length === 2);
      const auditTombstones = (S.importedData._deleted?.lightMeasurements || []).length;
      assert('Audit save does not tombstone the prior walkthrough',
        auditTombstones === 0, `tombstones=${auditTombstones}`);

      // Restore.
      S.importedData = _saved;
    }
    const ltSrc = await fetchSrc('js/light-tools.js');
    assert('light-tools.js: retention model is latest-per-(roomId, tool)',
      /one-per-\(roomId, tool\)/i.test(ltSrc) || /latest-per-\(roomId, tool\)/i.test(ltSrc));
    assert('light-tools.js: _supersedePriorMeasurement helper exists',
      /function _supersedePriorMeasurement/.test(ltSrc));
    assert('light-tools.js: _collapseToLatestPerRoomTool one-time migration exists',
      /function _collapseToLatestPerRoomTool/.test(ltSrc));
    assert('light-tools.js: tool === audit skips supersession at save',
      /tool !== 'audit'[\s\S]{0,200}_supersedePriorMeasurement/.test(ltSrc));
    assert('light-tools.js: collapse migration also exempts audit rows',
      /auditRows\s*=\s*\[\][\s\S]{0,400}m\.tool\s*===\s*'audit'/.test(ltSrc));

    // Phase 2 cutover regression: lightMeasurements MUST emit
    // automatic per-row tombstones via the planner (no noTombstones
    // flag). Without this, under v4 payloads the supersession-
    // generated tombstones (which ride _deleted in v3) never reach
    // peers, and paired devices retain stale measurements forever.
    const syncDeltaRegistrySrc = [
      fetchSrc('js/sync-delta-registry.js'),
      fetchSrc('js/sync-delta-surface-config.js'),
    ].join('\n');
    const cfgBlock = syncDeltaRegistrySrc.split('DELTA_ARRAY_CONFIG')[1] || '';
    const lmCfgMatch = cfgBlock.match(/lightMeasurements:\s*\{[\s\S]{0,300}?\}/);
    assert('sync-delta-registry.js: lightMeasurements has NO noTombstones (Phase 2 propagation)',
      !lmCfgMatch || !/noTombstones:\s*true/.test(lmCfgMatch[0]),
      'lightMeasurements: noTombstones true would block v4 tombstone propagation');
  }

  // ─── 6. v1.6.9..v1.6.13 Scroll anchor system ────────────────────────
  console.log('%c 6. Scroll-anchor system ', 'font-weight:bold;color:#0891b2');
  {
    const routerSrc = fetchSrc('js/views-router.js');
    const routerRuntimeSrc = fetchSrc('js/views-router-runtime.js');
    assert('views-router.js: _captureScrollAnchor exists', /function _captureScrollAnchor/.test(routerSrc));
    assert('views-router.js: _restoreScrollAnchor exists', /function _restoreScrollAnchor/.test(routerSrc));
    assert('views-router.js: modal-safe preserveScroll path exists',
      routerSrc.includes('preserveScroll')
      && routerSrc.includes('function _restorePixelScroll')
      && routerSrc.includes('restoreViewportScroll'));
    assert('views-router.js: two-tier heuristic (containingBest + centerBest)',
      /containingBest[\s\S]{0,500}centerBest/.test(routerSrc));
    assert('views-router.js: containing-tier picks SMALLEST area (innermost)',
      /containsCenter[\s\S]{0,300}area\s*<\s*containingBestArea/.test(routerSrc));
    // v1.6.11: rapid same-anchor navigates reuse the original capture
    // instead of re-capturing AFTER the jump.
    assert('views-router.js: _activeAnchor reuse for rapid same-anchor navigates',
      /_activeAnchor[\s\S]{0,200}\.selector\s*===\s*data\.scrollAnchor/.test(routerSrc));
    assert('views-router.js: anchor state is scoped to createNavigate instances',
      /export function createNavigate\(\{[\s\S]{0,300}let _navAnchorToken\s*=\s*0;[\s\S]{0,300}let _activeAnchor\s*=\s*null;/.test(routerSrc));
    assert('views-router.js: chart teardown is injected instead of imported',
      !/import\s*\{[^}]*destroyAllCharts/.test(routerSrc)
      && /createNavigate\(\{[\s\S]{0,160}destroyAllCharts/.test(routerSrc)
      && /destroyAllCharts\?\.\(\)/.test(routerSrc));
    // v1.6.12: explicit anchor element gone → skip auto-pick fallback.
    assert('views-router.js: skip auto-pick when explicit anchor not found',
      /explicitAnchorRequested[\s\S]{0,400}!explicitAnchorRequested/.test(routerSrc)
      || /explicitAnchorRequested\s*=\s*!!\(data/.test(routerSrc));
    // v1.6.10: 1.2s RAF re-anchor loop.
    assert('views-router.js: RAF re-anchor loop runs for ~1.2s',
      /1200/.test(routerSrc) && /requestAnimationFrame\(reapply\)/.test(routerSrc));
    // v1.6.10: user-input cancel for the loop.
    assert('views-router.js: anchor loop cancels on wheel/touchstart/keydown',
      routerSrc.includes('addViewportInputCancelListeners(cancel)')
      && /addEventListener\('wheel'/.test(routerRuntimeSrc)
      && /addEventListener\('touchstart'/.test(routerRuntimeSrc)
      && /addEventListener\('keydown'/.test(routerRuntimeSrc));
    assert('views-router.js routes viewport globals through runtime adapter',
      routerSrc.includes("from './views-router-runtime.js'")
      && !/\bwindow(?:\.|\s*\[)/.test(routerSrc));
    assert('views-router.js: zero viewport height still allows anchor capture',
      /hasViewportHeight\s*=\s*vh\s*>\s*0/.test(routerSrc)
      && /!hasViewportHeight\s*\|\|\s*rect\.top\s*<\s*vh/.test(routerSrc)
      && /hasViewportHeight\s*&&\s*rect\.top\s*>=\s*vh/.test(routerSrc));
    // v1.6.10: token cancellation across navigates.
    assert('views-router.js: _navAnchorToken bumped per navigate, old loops bail',
      /_navAnchorToken/.test(routerSrc) && /myToken\s*!==\s*_navAnchorToken/.test(routerSrc));
    // v1.6.13: _refreshSurfaces debounce.
    const sunSrc = fetchSrc('js/sun.js');
    assert('sun.js: _refreshSurfaces debounces via _refreshSurfacesTimer',
      /_refreshSurfacesTimer/.test(sunSrc));
    assert('sun.js: debounce window is 150ms',
      /setTimeout\([\s\S]{0,200}150\)/.test(sunSrc));
    // v1.6.9: AI verdict engine derives scroll anchor from target.
    const aiEngineSrc = await fetchSrc('js/ai-verdict-engine.js');
    assert('ai-verdict-engine.js: getScrollAnchor config + default fallback',
      /getScrollAnchor/.test(aiEngineSrc)
      && /\[data-id="\$\{CSS\.escape\(tid\)\}"\]/.test(aiEngineSrc));
    // v1.6.9: light-tools-ai-analysis overrides anchor to point at room.
    const measAiSrc = await fetchSrc('js/light-tools-ai-analysis.js');
    assert('light-tools-ai-analysis.js: anchor overrides to room data-id',
      /getScrollAnchor:[\s\S]{0,200}m\?\.roomId/.test(measAiSrc));
  }

  // ─── 7. v1.6.7 AI stream stall + request timeouts ───────────────────
  console.log('%c 7. AI stream stall + request timeouts ', 'font-weight:bold;color:#0891b2');
  {
    // Import the exported constants directly — stronger than grepping
    // (a refactor that renames the constant or changes the literal
    // would break here, not silently in prod).
    const api = await import('../js/api.js');
    assert('api.js: STREAM_STALL_TIMEOUT_MS exported = 30000',
      api.STREAM_STALL_TIMEOUT_MS === 30000, `got ${api.STREAM_STALL_TIMEOUT_MS}`);
    assert('api.js: FETCH_REQUEST_TIMEOUT_MS exported = 60000',
      api.FETCH_REQUEST_TIMEOUT_MS === 60000, `got ${api.FETCH_REQUEST_TIMEOUT_MS}`);
    assert('api.js: AI_IMPORT_REQUEST_TIMEOUT_MS exported = 180000',
      api.AI_IMPORT_REQUEST_TIMEOUT_MS === 180000, `got ${api.AI_IMPORT_REQUEST_TIMEOUT_MS}`);
    const apiTransportSrc = fetchSrc('js/api-transport.js');
    const streamingProviderSrc = [
      fetchSrc('js/api-openai-compatible.js'),
      fetchSrc('js/api-local.js'),
      fetchSrc('js/local-ai-provider-ollama.js'),
      fetchSrc('js/api-venice.js'),
    ].join('\n');
    assert('api-transport.js: readWithStallTimeout exists',
      /function readWithStallTimeout/.test(apiTransportSrc));
    assert('api-transport.js: fetchWithRetry composes a clearable header timeout + caller signal',
      /timeoutController/.test(apiTransportSrc)
      && /clearRequestTimeout/.test(apiTransportSrc)
      && /AbortSignal\.any/.test(apiTransportSrc));
    // Polyfill path: when AbortSignal.any is unavailable, manual
    // AbortController forwards both signals. Without this older
    // browsers (Safari <17.4) would silently lose the 60s timeout.
    assert('api-transport.js: manual AbortController polyfill for older browsers',
      /Manual polyfill for browsers without AbortSignal\.any/.test(apiTransportSrc)
      && /new AbortController/.test(apiTransportSrc));
    assert('api-transport.js: retry on transient network errors (TypeError / Failed to fetch / timeout)',
      /isNetwork\s*=\s*e\s+instanceof\s+TypeError/.test(apiTransportSrc)
      || /Failed to fetch.*Load failed.*NetworkError/.test(apiTransportSrc));
    assert('API provider modules: stall-timeout wraps all 3 streaming branches',
      (streamingProviderSrc.match(/readWithStallTimeout\(reader/g) || []).length >= 3);
  }

  // ─── 8. v1.6.7 Sync offline/online toast affordance ─────────────────
  console.log('%c 8. Sync offline/online toast affordance ', 'font-weight:bold;color:#0891b2');
  {
    const syncRecoverySrc = fetchSrc('js/sync-recovery.js');
    assert('sync-recovery.js: listens for offline event',
      /addEventListener\('offline'/.test(syncRecoverySrc));
    assert('sync-recovery.js: listens for online event + kicks sync',
      /addEventListener\('online'[\s\S]{0,200}_kickSync\('online'\)/.test(syncRecoverySrc));
    assert('sync-recovery.js: offline toast copy matches shipped em-dash wording',
      syncRecoverySrc.includes('Offline — changes are saved locally and will sync when you reconnect.'));
    assert('sync-recovery.js: online toast copy matches shipped em-dash wording',
      syncRecoverySrc.includes('Back online — syncing your changes.'));
    assert('sync-recovery.js: toast guarded against double-firing',
      /_lastNetState/.test(syncRecoverySrc));
  }

  // ─── 9. v1.6.14 Sync pull reads view from state, not DOM ────────────
  console.log('%c 9. Sync pull-side current view source ', 'font-weight:bold;color:#0891b2');
  {
    const syncPullActiveRefreshSrc = fetchSrc('js/sync-pull-active-refresh.js');
    assert('sync-pull-active-refresh.js: pull handler reads state.currentView first',
      /const cat\s*=\s*state\.currentView\s*\|\|\s*document\.querySelector\('\.nav-item\.active'\)/.test(syncPullActiveRefreshSrc));
    // _refreshSurfaces gained the same fallback (audit P1.3): when
    // state.currentView is undefined during boot, fall back to DOM
    // instead of jumping straight to 'dashboard'.
    const sunSrc = fetchSrc('js/sun.js');
    assert('sun.js: _refreshSurfaces also falls back via DOM before dashboard',
      /_refreshSurfaces[\s\S]{0,1500}state\.currentView[\s\S]{0,400}document\.querySelector\('\.nav-item\.active'\)/.test(sunSrc));
  }

  // ─── 10. v1.6.7 PII Ollama reachability probe + 45s stall ───────────
  console.log('%c 10. PII Ollama reachability + stall protection ', 'font-weight:bold;color:#0891b2');
  {
    const piiSrc = await fetchSrc('js/pii.js');
    assert('pii.js: probes authenticated model endpoint before streaming',
      /\/v1\/models/.test(piiSrc) && /AbortSignal\.timeout\(5000\)/.test(piiSrc));
    // v1.6.18 follow-up: probe signal composes the caller's signal
    // with the 5s deadline so user-initiated aborts (closing the
    // import dialog) take effect immediately instead of waiting up
    // to 5s for the timeout. Mirrors api.js's AbortSignal.any +
    // manual-polyfill pattern.
    assert('pii.js: probe signal composes caller signal + timeout',
      /probeSignal/.test(piiSrc) && /AbortSignal\.any/.test(piiSrc));
    assert('pii.js: throws fast on unreachable Ollama',
      /falling back to regex obfuscation/i.test(piiSrc));
    assert('pii.js: per-chunk stall timeout for streaming (45s)',
      /STALL_MS\s*=\s*45000/.test(piiSrc));
  }

  // ─── 11. v1.6.7 Lens external-server timeout dropped 30s → 10s ─────
  console.log('%c 11. Lens external-server timeout ', 'font-weight:bold;color:#0891b2');
  {
    const lensSrc = fetchSrc('js/lens.js');
    assert('lens.js: TIMEOUT_MS = 10000 (was 30000)',
      /TIMEOUT_MS\s*=\s*10000/.test(lensSrc));
  }

  // ─── 12. v1.6.7 Cashu auto-melt persistent-failure surface ──────────
  console.log('%c 12. Cashu auto-melt failure counter ', 'font-weight:bold;color:#0891b2');
  {
    const cashuSrc = await fetchSrc('js/cashu-wallet-transfers.js');
    assert('cashu-wallet.js: _autoMeltConsecutiveFailures module counter',
      /_autoMeltConsecutiveFailures/.test(cashuSrc));
    assert('cashu-wallet.js: surfaces notification at 3rd consecutive failure',
      /_autoMeltConsecutiveFailures\s*===?\s*3/.test(cashuSrc));
    assert('cashu-wallet.js: success path resets the counter',
      /_autoMeltConsecutiveFailures\s*=\s*0/.test(cashuSrc));
  }

  // ─── 13. v1.6.15 + v1.6.16 Sessions list cap + "View all" modal ─────
  console.log('%c 13. Sessions list: 3 inline + View all modal ', 'font-weight:bold;color:#0891b2');
  {
    const sessionsSrc = fetchSrc('js/light-sessions-view.js');
    const viewsSrc = fetchSrc('js/views.js');
    assert('light-sessions-view.js: SESSIONS_DEFAULT_CAP = 3',
      /SESSIONS_DEFAULT_CAP\s*=\s*3/.test(sessionsSrc));
    assert('light-sessions-view.js: _openAllSessionsModal exists',
      /function _openAllSessionsModal/.test(sessionsSrc));
    assert('light-sessions-view.js: _collectUnifiedSessionRows shared helper',
      /function _collectUnifiedSessionRows/.test(sessionsSrc));
    assert('light-sessions-view.js: _renderSessionRowsHTML shared row renderer',
      /function _renderSessionRowsHTML/.test(sessionsSrc));
    assert('light-sessions-view.js: "View all N sessions" button replaces inline expand',
      /View all \$\{totalCount\} sessions/.test(sessionsSrc));
    assert('views.js opens the deferred light sessions view through the loader',
      !viewsSrc.includes("from './light-sessions-view.js'")
        && viewsSrc.includes('const module = await loadLightSunUI();')
        && viewsSrc.includes('return module._openAllSessionsModal();'));
    assert('light sessions view: _toggleAllSessions and _showAllSessions removed',
      !/_toggleAllSessions/.test(sessionsSrc) && !/_showAllSessions/.test(sessionsSrc));
    // First: module API existence check — should pass in both Node + browser.
    assert('views._openAllSessionsModal is exported',
      typeof viewsModule._openAllSessionsModal === 'function');
    assert('window._openAllSessionsModal stays module-only',
      !('_openAllSessionsModal' in window));
    // Behaviour: only in a real browser — Node's document shim returns null
    // for getElementById, so showAllSessionsModal would write innerHTML to
    // null. Playwright covers the runtime path.
    if (!_isNode && typeof viewsModule._openAllSessionsModal === 'function') {
      const before = document.querySelectorAll('.modal-overlay').length;
      try { viewsModule._openAllSessionsModal(); } catch (e) {}
      const after = document.querySelectorAll('.modal-overlay').length;
      assert('views._openAllSessionsModal opens a modal-overlay', after > before);
      const m = document.querySelectorAll('.modal-overlay');
      if (m.length > before) m[m.length - 1].remove();
    }
  }

  // ─── 14. v1.6.7 Mobile UX fixes (light-env reading overflow + FAB) ──
  console.log('%c 14. v1.6.7 mobile CSS guards ', 'font-weight:bold;color:#0891b2');
  {
    const cssSrc = fetchCssSrc();
    assert('styles.css: .light-env-reading-ai uses flex-basis 100%',
      /\.light-env-reading-ai[\s\S]{0,300}flex-basis:\s*100%/.test(cssSrc));
    assert('styles.css: mobile .main padding-bottom clears FAB stack (1024 + 480 + 375)',
      (cssSrc.match(/padding-bottom:\s*calc\(120px\s*\+\s*env\(safe-area-inset-bottom\)\)/g) || []).length >= 3);
    assert('styles.css: silhouette tap stroke for coarse pointer (mobile)',
      /pointer:\s*coarse[\s\S]{0,500}\.sun-silhouette-region[\s\S]{0,300}stroke-width:\s*\d/.test(cssSrc));
    assert('styles.css: mobile silhouette hit stroke remains visually hidden',
      /pointer:\s*coarse[\s\S]{0,500}\.sun-silhouette-region\s*\{[\s\S]{0,180}stroke:\s*transparent[\s\S]{0,180}stroke-opacity:\s*0/.test(cssSrc));
    assert('styles.css: stock overlay-ready hides geometric selection fallback',
      /\.sun-silhouette-stock\[data-selection-overlay="ready"\]\s+\.sun-silhouette-region\.selected\s*\{[\s\S]{0,120}fill-opacity:\s*0[\s\S]{0,80}stroke-opacity:\s*0/.test(cssSrc));
    assert('styles.css: modal-header reserves padding-right for close button',
      /\.modal-header\s*\{[\s\S]{0,200}padding-right:\s*40px/.test(cssSrc));
  }

  // ─── 15. v1.6.7 PDF import inherits AI request timeout ──────────────
  console.log('%c 15. PDF import inherits stream + request timeouts ', 'font-weight:bold;color:#0891b2');
  {
    const pdfSrc = await fetchSrc('js/pdf-import.js');
    const pdfAiUtilsSrc = await fetchSrc('js/pdf-import-ai-utils.js');
    // PDF import calls callClaudeAPI through its AI helper, which routes
    // through _fetchWithRetry and the streaming helpers. We don't
    // duplicate the timeout logic here, just confirm the import + call
    // sites exist so a future refactor doesn't accidentally bypass them.
    assert('pdf-import-ai-utils.js: imports callClaudeAPI from api.js',
      /import\s*\{[^}]*callClaudeAPI[^}]*\}\s*from\s*['"]\.\/api\.js['"]/.test(pdfAiUtilsSrc));
    assert('pdf-import-ai-utils.js: imports import-specific AI timeout from api.js',
      /import\s*\{[^}]*AI_IMPORT_REQUEST_TIMEOUT_MS[^}]*\}\s*from\s*['"]\.\/api\.js['"]/.test(pdfAiUtilsSrc));
    assert('pdf-import-ai-utils.js: import AI fallback calls callClaudeAPI',
      /function\s+callImportAIWithStreamFallback[\s\S]+?callClaudeAPI\(/.test(pdfAiUtilsSrc));
    assert('pdf-import-ai-utils.js: retries aborted AI import streams without streaming',
      /function\s+isAIStreamAbortError/.test(pdfAiUtilsSrc)
      && /aborted by user/.test(pdfAiUtilsSrc)
      && /name\s*===\s*['"]aborterror['"]/.test(pdfAiUtilsSrc)
      && /function\s+callImportAIWithStreamFallback/.test(pdfAiUtilsSrc)
      && /onStream:\s*undefined/.test(pdfAiUtilsSrc)
      && /forceNonStream:\s*true/.test(pdfAiUtilsSrc)
      && /requestTimeoutMs:\s*AI_IMPORT_REQUEST_TIMEOUT_MS/.test(pdfAiUtilsSrc)
      && /parseLabPDFWithAI[\s\S]+?callImportAIWithStreamFallback/.test(pdfSrc));
    assert('pdf-import.js: catch path closes the import modal on error',
      /catch\s*\([^)]+\)\s*\{[\s\S]{0,500}hideImportProgress\('error'\)/.test(pdfSrc));
  }

  // ─── 16. v1.6.7 Sun-context warnings iterate the sparse array ──────
  console.log('%c 16. sun-context warnings iterate sparse array ', 'font-weight:bold;color:#0891b2');
  {
    const environmentCtxSrc = await fetchSrc('js/sun-context-environment.js');
    // After the measurement-retention redesign, lightMeasurements is
    // already at-most-one-per-(roomId, tool), so no time-window filter
    // is needed. The 90-day filter from earlier drafts was removed.
    assert('sun-context environment owner has no 90-day filter (relies on sparse array)',
      !/90\s*\*\s*86400/.test(environmentCtxSrc));
    assert('sun-context environment owner iterates lightMeasurements directly',
      /const recent\s*=\s*state\.importedData\?\.lightMeasurements/.test(environmentCtxSrc));
    assert('sun-context environment owner still emits flicker / darkness / cct warnings',
      /measurement\.tool\s*===\s*'flicker'/.test(environmentCtxSrc)
      && /measurement\.tool\s*===\s*'darkness'/.test(environmentCtxSrc)
      && /measurement\.tool\s*===\s*'cct'/.test(environmentCtxSrc));
  }

  // ─── 17. v1.6.7 Light & Sun copy fixes ──────────────────────────────
  console.log('%c 17. v1.6.7 copy fixes ', 'font-weight:bold;color:#0891b2');
  {
    const lightChannelViewSrc = fetchSrc('js/light-channel-view.js');
    const conditionsRendererSrc = fetchSrc('js/light-conditions-renderer.js');
    const cssSrc = fetchCssSrc();
    const tooltipSrc = fetchSrc('js/touch-tooltip.js');
    assert('light-conditions-renderer.js: "Today\'s sun timeline" replaces "TODAY\'S SUN ARC"',
      /Today's sun timeline/.test(conditionsRendererSrc) && !/Today's sun arc/.test(conditionsRendererSrc));
    assert('light-conditions-renderer.js: sun timeline renders as a rail with dots',
      /conditions-now-events-rail/.test(conditionsRendererSrc) && /conditions-now-event-dot/.test(conditionsRendererSrc));
    assert('styles.css: sun timeline rail scrolls instead of wrapping',
      /\.conditions-now-events\s*\{[\s\S]{0,180}overflow-x:\s*auto/.test(cssSrc)
      && /conditions-now-events-rail/.test(cssSrc));
    assert('styles.css: Conditions Now widget chrome owns the visible title',
      /\.dashboard-widget\[data-widget-id="light-conditions-now"\] \.light-conditions-now-title\s*\{[\s\S]{0,80}display:\s*none/.test(cssSrc));
    assert('styles.css: Conditions Now grid responds to widget width',
      /container-name:\s*conditions-now/.test(cssSrc)
      && /@container conditions-now \(max-width:\s*300px\)/.test(cssSrc));
    assert('light-conditions-renderer.js: Conditions Now uses data tooltips instead of native timeline titles',
      /data-conditions-tooltip/.test(conditionsRendererSrc)
      && !/conditions-now-event[\s\S]{0,220}title=/.test(conditionsRendererSrc));
    assert('touch-tooltip.js: app-wide tooltip handles title and data tooltip attrs',
      /data-app-tooltip/.test(tooltipSrc)
      && /data-conditions-tooltip/.test(tooltipSrc)
      && /getAttribute\('title'\)/.test(tooltipSrc)
      && /removeAttribute\('title'\)/.test(tooltipSrc));
    assert('touch-tooltip.js: mobile taps do not leave focus tooltips behind',
      /let _lastTouchAt\s*=\s*0/.test(tooltipSrc)
      && /Date\.now\(\)\s*-\s*_lastTouchAt\s*<\s*1000/.test(tooltipSrc)
      && /document\.addEventListener\('click',\s*_hideTooltip,\s*true\)/.test(tooltipSrc));
    assert('styles.css: app tooltip overlay is fixed and unclipped',
      /\.app-tooltip\s*\{[\s\S]{0,160}position:\s*fixed/.test(cssSrc)
      && /\.app-tooltip\.is-visible/.test(cssSrc));
    assert('light-conditions-renderer.js: EAQI label rendered as "EU air quality index"',
      /EU air quality index/.test(conditionsRendererSrc));
    assert('light-conditions-renderer.js: cloud chip uses "clear-sky max UVI"',
      /clear-sky max UVI/.test(conditionsRendererSrc));
    assert('light-channel-view.js: zero-hit channel pill shows 0/7 not em-dash',
      /return \{ txt: `\$\{n\}\/7`/.test(lightChannelViewSrc));
    const sunSrc = fetchSrc('js/sun.js');
    assert('sun.js: Eyes-mode option shortened ("never stare at sun")',
      /Eyes uncovered \(never stare at sun\)/.test(sunSrc));
  }

  // ─── 18. Refresh restores the active view ───────────────────────────
  console.log('%c 18. refresh restores active view ', 'font-weight:bold;color:#0891b2');
  {
    const startupUiSrc = fetchSrc('js/startup-ui.js');
    const profileSrc = fetchSrc('js/profile.js');
    const profileRuntimeSrc = fetchSrc('js/profile-runtime.js');
    const viewsSrc = fetchSrc('js/views.js');
    const routerSrc = fetchSrc('js/views-router.js');
    const navSrc = fetchSrc('js/nav.js');
    assert('views-router.js: last route is stored per active profile',
      /profileStorageKey\(state\.currentProfile \|\| 'default',\s*'lastViewV1'\)/.test(routerSrc)
      && /localStorage\.setItem\(_lastViewStorageKey\(\),\s*route\)/.test(routerSrc));
    assert('views-router.js: saved route is validated before restore',
      /export function getInitialView\(\)/.test(routerSrc)
      && /return isKnownRoute\(saved\) \? saved : 'dashboard'/.test(routerSrc));
    assert('views-router.js: navigate falls back when a saved category is stale',
      /const routeData\s*=/.test(routerSrc)
      && /const routeCategory\s*=\s*isKnownRoute\(requestedCategory,\s*routeData\)\s*\? requestedCategory : 'dashboard'/.test(routerSrc));
    assert('views.js: exposes router-backed getInitialView wrapper',
      /export function getInitialView\(\)/.test(viewsSrc)
      && /return getRouterInitialView\(\)/.test(viewsSrc));
    assert('startup-ui.js: boot navigates to stored route instead of hard Dashboard',
      /startupUIDeps\.navigate\(startupUIDeps\.getInitialView\(\)\s*\|\|\s*'dashboard'\)/.test(startupUiSrc)
      && !startupUiSrc.includes('views-runtime-bridge.js')
      && !/window\.showDashboard\(\);/.test(startupUiSrc));
    assert('profile.js: profile switch restores that profile route',
      profileSrc.includes('await reloadProfileRuntimeShell(profileId)')
      && /views\.navigate\(views\.getInitialView\?\.\(\) \|\| 'dashboard'\)/.test(profileRuntimeSrc));
    assert('nav.js: sidebar rebuild preserves current route selection',
      /export function syncSidebarActive/.test(navSrc)
      && /nav\.innerHTML\s*=\s*html;\s*syncSidebarActive\(state\.currentView \|\| 'dashboard'\)/.test(navSrc));
    assert('views-router.js: route renderer rebuilds cannot leave Dashboard selected',
      /_syncSidebarActive\(activeCategory\)[\s\S]{0,1000}routeHandlers\.[\s\S]{0,1000}_syncSidebarActive\(routeCategory\)/.test(routerSrc));
  }

  // ─── 19. Category marker card redesign ──────────────────────────────
  console.log('%c 19. category marker card redesign ', 'font-weight:bold;color:#0891b2');
  {
    const viewsSrc = fetchSrc('js/views.js');
    const categoryPageViewSrc = fetchSrc('js/category-page-view.js');
    const categoryViewRenderersSrc = fetchSrc('js/category-view-renderers.js');
    const chartCardRecsSrc = fetchSrc('js/chart-card-recs.js');
    const categoryGlyphsSrc = fetchSrc('js/category-glyphs.js');
    const compareCorrelationsSrc = fetchSrc('js/compare-correlations.js');
    const markerDetailSrc = fetchSrc('js/marker-detail-modal-impl.js');
    const dataSrc = fetchSrc('js/data.js');
    const dataViewControlsSrc = fetchSrc('js/data-view-controls.js');
    const cssSrc = fetchCssSrc();
    assert('category-view-renderers.js: marker cards render latest-value summary before chart',
      /chart-card-snapshot/.test(categoryViewRenderersSrc)
      && /chart-card-latest-value/.test(categoryViewRenderersSrc)
      && /visibleValueIndexes\.length > 4 \? visibleValueIndexes\.slice\(-4\)/.test(categoryViewRenderersSrc));
    assert('styles.css: category chart content uses full available width',
      /#view-content\s*\{[\s\S]{0,80}width:\s*100%/.test(cssSrc)
      && /\.charts-grid\s*\{[\s\S]{0,180}width:\s*100%/.test(cssSrc));
    assert('styles.css: marker cards stretch to preserve row alignment',
      /\.charts-grid\s*\{[\s\S]{0,220}align-items:\s*stretch/.test(cssSrc)
      && /\.chart-card\s*\{[\s\S]{0,260}height:\s*100%/.test(cssSrc)
      && /\.chart-card-title-block,[\s\S]{0,140}flex:\s*1/.test(cssSrc));
    assert('styles.css: marker cards are compact summary-first cards',
      /\.chart-card-snapshot\s*\{/.test(cssSrc)
      && /\.chart-container\s*\{[^\}]*height:\s*150px/.test(cssSrc)
      && /\.chart-values\s*\{[\s\S]{0,160}grid-template-columns:\s*repeat\(var\(--chart-value-count/.test(cssSrc)
      && /\.chart-values-label\s*\{/.test(cssSrc));
    assert('category-page-view.js: returning to Charts restores tips and sorted card order',
      /sortCategoryChartEntries\(withData, categoryKey\)[\s\S]{0,900}loadChartCardRecs\(\)/.test(categoryPageViewSrc));
    assert('chart-card-recs.js: tips nudge does not cover open marker modal',
      /const modalOpen\s*=\s*!!document\.querySelector\('\.modal-overlay\.show'\)/.test(chartCardRecsSrc)
      && /recLinks\.length > 0 && !modalOpen/.test(chartCardRecsSrc));
    assert('data.js: range mode switch paints the active pill before view refresh',
      /function _afterNextPaint\(fn\)/.test(dataViewControlsSrc)
      && dataViewControlsSrc.includes("import { scheduleUtilsAfterNextPaint } from './utils-runtime.js';")
      && /scheduleUtilsAfterNextPaint\(fn\)/.test(dataViewControlsSrc)
      && /const token\s*=\s*\+\+_rangeModeRefreshToken/.test(dataViewControlsSrc)
      && /_afterNextPaint\(\(\) => \{[\s\S]{0,500}navigateDataView\(state\.currentView \|\| 'dashboard',\s*data\)/.test(dataViewControlsSrc));
    assert('range mode refresh preserves current category card order',
      /function _captureCategoryCardOrderForRangeRefresh\(route\)/.test(dataViewControlsSrc)
      && /state\._preserveCategoryCardOrder\s*=\s*preservedOrder/.test(dataViewControlsSrc)
      && /function sortCategoryChartEntries\(entries,\s*categoryKey\)/.test(categoryPageViewSrc)
      && /preserved\?\.categoryKey === categoryKey/.test(categoryPageViewSrc)
      && /delete state\._preserveCategoryCardOrder/.test(categoryPageViewSrc));
    assert('data.js: header range toggle patches existing buttons',
      /const canPatch\s*=/.test(dataViewControlsSrc)
      && /btn\.classList\.toggle\('active',\s*active\)/.test(dataViewControlsSrc)
      && /data-range="\$\{m\}"/.test(dataViewControlsSrc));
    assert('data.js: active data cache avoids rebuilding marker data during modal browsing',
      /let _activeDataCache\s*=\s*null/.test(dataSrc)
      && /export function invalidateActiveDataCache\(\)/.test(dataSrc)
      && /if \(_activeDataCacheMatches\(cacheMeta\)\) return _activeDataCache/.test(dataSrc)
      && /profileDob:\s*state\.profileDob/.test(dataSrc)
      && /wearableWeightLatest/.test(dataSrc)
      && /legacyWeightStamp/.test(dataSrc)
      && /saveImportedData\([^)]*\)[\s\S]{0,120}invalidateActiveDataCache\(\)/.test(dataSrc)
      && !/_makeActiveDataCacheMeta\(\)[\s\S]{0,900}rangeMode:\s*state\.rangeMode/.test(dataSrc)
      && !/switchRangeMode\(mode\)[\s\S]{0,220}invalidateActiveDataCache\(\)/.test(dataViewControlsSrc));
    assert('category-glyphs.js: marker category surfaces use coded glyphs instead of emoji icons',
      /export function renderCategoryGlyph\(categoryKey,\s*label/.test(categoryGlyphsSrc)
      && /getCategoryGlyphCode\(categoryKey,\s*label\)/.test(categoryGlyphsSrc)
      && /CATEGORY_GLYPH_CODES/.test(categoryGlyphsSrc)
      && categoryPageViewSrc.includes("from './category-glyphs.js'")
      && /renderCategoryGlyph\(categoryKey,\s*cat\.label\)/.test(categoryPageViewSrc)
      && /empty-state-icon-category/.test(categoryPageViewSrc)
      && /compare-category-label/.test(compareCorrelationsSrc)
      && !/Click to change icon/.test(categoryPageViewSrc));
    assert('styles.css: category glyph has redesigned non-emoji treatment',
      /\.category-glyph\s*\{[\s\S]{0,520}font-family:\s*var\(--font-mono\)/.test(cssSrc)
      && /\.compare-category-label\s*\{/.test(cssSrc));
    assert('marker-detail-modal.js: marker detail modal uses compact redesigned sections',
      /stat-card-range-controls/.test(markerDetailSrc)
      && /marker-history-list/.test(markerDetailSrc)
      && /marker-history-row/.test(markerDetailSrc)
      && /gb-detail-actions/.test(markerDetailSrc)
      && !/&#128221;/.test(markerDetailSrc));
    assert('marker-detail-modal.js: marker modal history defaults to last three with delegated expansion',
      /MARKER_HISTORY_DEFAULT_CAP\s*=\s*3/.test(markerDetailSrc)
      && /MARKER_HISTORY_EXPANDED_CAP\s*=\s*40/.test(markerDetailSrc)
      && /modalPoints\.slice\(-MARKER_HISTORY_DEFAULT_CAP\)/.test(markerDetailSrc)
      && /modalPoints\.slice\(-expandedHistoryLimit\)/.test(markerDetailSrc)
      && /markerDetailActionAttrs\('show-detail-modal', \{ id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true \}\)/.test(markerDetailSrc)
      && /View more history \(\$\{modalPoints\.length\} values\)/.test(markerDetailSrc)
      && /Show \$\{showCount\} older/.test(markerDetailSrc)
      && /Show last \$\{MARKER_HISTORY_DEFAULT_CAP\} values/.test(markerDetailSrc));
    assert('marker-detail-modal.js: marker range band uses reference scale instead of full-width optimal green',
      /const refMin\s*=\s*numericOrNull\(marker\.refMin\)/.test(markerDetailSrc)
      && /const effMin\s*=\s*numericOrNull\(latestRange\.min\)/.test(markerDetailSrc)
      && /const baseMin\s*=\s*refMin \?\? effMin/.test(markerDetailSrc)
      && /const usePhaseBand\s*=\s*hasLatestPhaseRange/.test(markerDetailSrc)
      && /const useOptimalBand\s*=\s*!usePhaseBand && state\.rangeMode !== 'reference'/.test(markerDetailSrc)
      && /const goodMin\s*=\s*usePhaseBand \? Math\.min\(effMin, effMax\) : useOptimalBand/.test(markerDetailSrc)
      && /const zonePad\s*=\s*goodSpan \* 0\.1/.test(markerDetailSrc)
      && /for \(const value of \[goodMin, goodMax, latestValue\]\)/.test(markerDetailSrc)
      && /if \(latestValue >= max\) max \+= span \* 0\.08/.test(markerDetailSrc)
      && /const referenceDisplay\s*=/.test(markerDetailSrc)
      && /const referenceMetaLabel\s*=\s*hasReferenceRange \? 'Reference' : 'Range'/.test(markerDetailSrc)
      && /let rangeMainDisplay\s*=\s*'Not set'/.test(markerDetailSrc)
      && /state\.rangeMode === 'optimal'[\s\S]{0,400}else if \(hasReferenceRange\) \{\s*rangeMainDisplay = referenceDisplay/.test(markerDetailSrc));
    assert('marker-detail-modal.js/styles.css: marker range band colors non-optimal zones',
      /gb-range-band-zone-low/.test(markerDetailSrc)
      && /gb-range-band-zone-high/.test(markerDetailSrc)
      && /const lowZoneWidth\s*=/.test(markerDetailSrc)
      && /const highZoneWidth\s*=/.test(markerDetailSrc)
      && /\.gb-range-band-zone-low\s*\{[\s\S]{0,120}var\(--yellow\)/.test(cssSrc)
      && /\.gb-range-band-zone-high\s*\{[\s\S]{0,120}var\(--red\)/.test(cssSrc));
    assert('styles.css: marker detail modal has opaque sticky header and compact history',
      /\.gb-detail-head\s*\{[\s\S]{0,360}z-index:\s*20[\s\S]{0,360}background:\s*var\(--bg-secondary\)/.test(cssSrc)
      && /\.marker-detail-modal \.marker-history-row\s*\{[\s\S]{0,420}grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/.test(cssSrc)
      && /\.marker-detail-modal \.marker-history-row\s*\{[\s\S]{0,520}content-visibility:\s*auto/.test(cssSrc)
      && /\.marker-detail-modal \.gb-detail-actions\s*\{[\s\S]{0,260}border-top:\s*1px solid var\(--border\)/.test(cssSrc)
      && /\.modal\.marker-detail-modal\s*\{\s*padding:\s*0/.test(cssSrc));
  }

  // ─── 20. sun-session start avoids warning-toast stack ───────────────
  console.log('%c 20. sun-session start notification restraint ', 'font-weight:bold;color:#0891b2');
  {
    const sunActiveSrc = fetchSrc('js/sun-active-session.js');
    const startHandler = sunActiveSrc.slice(
      sunActiveSrc.indexOf("confirm.addEventListener('click'"),
      sunActiveSrc.indexOf('function _plainStopSummary')
    );
    assert('sun-active-session.js: start flow uses one consolidated start-session toast helper',
      /function _buildStartSessionToast/.test(sunActiveSrc) &&
      /showNotification\(_buildStartSessionToast\(/.test(startHandler));
    assert('sun-active-session.js: start flow no longer emits photosensitizer warning toast',
      !/photosensitizer active/.test(startHandler));
    assert('sun-active-session.js: start flow no longer emits eyes-uncovered warning toast',
      !/Eyes-uncovered mode/.test(startHandler));
    assert('sun-active-session.js: retinal toasts have a start grace period',
      /RETINAL_ALERT_GRACE_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/.test(sunActiveSrc)
      && /elapsedMs\s*<\s*RETINAL_ALERT_GRACE_MS/.test(sunActiveSrc));
    assert('sun-active-session.js: retinal over-limit toast also marks the half-limit alert handled',
      /ruv >= 30 && !cur\.alertedRetinalOver[\s\S]{0,180}alertedRetinalOver:\s*true,\s*alertedRetinal500:\s*true/.test(sunActiveSrc));
    assert('sun-active-session.js: retinal threshold toasts use calm user copy',
      !/pterygium|cataract|6-12 hours|daily ICNIRP UV limit/.test(sunActiveSrc));
  }

  // ─── Restore state ──────────────────────────────────────────────────
  if (state && _origImported) state.importedData = _origImported;
  if (state) state.profileSex = _origProfileSex;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
