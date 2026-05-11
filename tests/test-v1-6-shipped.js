// test-v1-6-shipped.js — regression coverage for v1.6.7..v1.6.16
//
// All the work that landed between v1.6.6 and v1.6.16 had only manual
// browser verification. This file pins every behavioural change so a
// future refactor that reverts one fails loudly with a one-liner
// pointing at the affected version.
//
// Mix of source-substring checks (fast, deterministic) and live
// behaviour checks (drive exports, observe results). Substring checks
// are used where the runtime path has side effects (network, sync
// push, AI streams) too messy to exercise in a Puppeteer page.
//
// Run: fetch('tests/test-v1-6-shipped.js').then(r=>r.text()).then(s=>Function(s)())

return (async function () {
  let pass = 0, fail = 0;
  function assert(name, cond, detail) {
    if (cond) {
      pass++;
      console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || '');
    } else {
      fail++;
      console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || '');
    }
  }
  async function fetchSrc(path) {
    try { return await fetch('/' + path + '?bust=' + Date.now()).then(r => r.text()); }
    catch (e) { return ''; }
  }

  console.log('%c v1.6.7–v1.6.16 Regression Tests ', 'background:#0891b2;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Snapshot mutable state we touch.
  const _origImported = window._labState ? JSON.parse(JSON.stringify(window._labState.importedData)) : null;
  const _origProfileSex = window._labState ? window._labState.profileSex : null;

  // ─── 1. v1.6.7 CAMS source-flip guard (sun.js _snapshotActiveRate) ─
  console.log('%c 1. CAMS source-flip guard ', 'font-weight:bold;color:#0891b2');
  {
    const sunSrc = await fetchSrc('js/sun.js');
    // Three independent signals must align for the guard to fire:
    // (a) primary source differs, (b) confidence dropped >0.15,
    // (c) UVI delta >25% of prior. All three checks must appear in
    // _snapshotActiveRate so a future refactor that drops any one of
    // them silently regresses behaviour.
    assert('sun.js: source-flip guard checks primary source differs',
      /primarySrc[\s\S]{0,200}sourcesDiffer/.test(sunSrc));
    assert('sun.js: source-flip guard checks confidence downgrade',
      /downgraded\s*=\s*newConf\s*<\s*priorConf\s*-\s*0\.15/.test(sunSrc));
    assert('sun.js: source-flip guard checks UVI delta >25%',
      /largeJump\s*=\s*priorAtm\.uvIndex\s*>\s*0\s*&&\s*uviDelta\s*>\s*priorAtm\.uvIndex\s*\*\s*0\.25/.test(sunSrc));
    assert('sun.js: rejected new atm tagged _sourceFlipBlocked',
      /_sourceFlipBlocked:\s*\{/.test(sunSrc));
    assert('sun.js: rejected atm reuses priorAtm via spread',
      /\.\.\.priorAtm[\s\S]{0,80}_sourceFlipBlocked/.test(sunSrc));
  }

  // ─── 2. v1.6.7 Live UVI > daily peak sanity warning ──────────────────
  console.log('%c 2. UVI > forecast peak sanity warning ', 'font-weight:bold;color:#0891b2');
  {
    const viewsSrc = await fetchSrc('js/views.js');
    assert('views.js: _sanityCheckAtmosphere flags UVI > peak × 1.2',
      /atm\.uvIndex\s*>\s*peak\s*\*\s*1\.2/.test(viewsSrc));
    assert('views.js: sanity message mentions forecast peak + stale data',
      /exceeds today's forecast peak[\s\S]{0,80}stale data/.test(viewsSrc));
    // The 16 / extreme branch must still exist alongside (defense-in-depth).
    assert('views.js: still flags UVI > 16 as extreme',
      /atm\.uvIndex\s*>\s*16/.test(viewsSrc));
  }

  // ─── 3. v1.6.7 Body-region picker render race (overlay caching) ─────
  console.log('%c 3. Selection overlay cache reuse during PNG encode ', 'font-weight:bold;color:#0891b2');
  {
    const sunSrc = await fetchSrc('js/sun.js');
    // When a fresh selection overlay is mid-encode, return the
    // PREVIOUSLY cached URL so the SVG keeps showing old selections
    // until the new blob is ready. Without this, every tap briefly
    // cleared all selections (~150ms PNG encode gap).
    assert('sun.js: _overlayPending branch returns previous URL (not null)',
      /if \(_overlayPending\) return _overlayCache\.url \|\| null/.test(sunSrc));
    assert('sun.js: post-canvas-work returns previous URL during encode',
      /return _overlayCache\.url \|\| null;\s*\}/.test(sunSrc));
  }

  // ─── 4. v1.6.6 + v1.6.7 dailyVitaminDIUBreakdown matches rollingIU ──
  console.log('%c 4. dailyVitaminDIUBreakdown ↔ rollingVitaminDIU parity ', 'font-weight:bold;color:#0891b2');
  {
    const S = window._labState;
    if (!S || !window.dailyVitaminDIUBreakdown || !window.rollingVitaminDIU) {
      assert('dailyVitaminDIUBreakdown exposed on window', !!window.dailyVitaminDIUBreakdown);
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
      const buckets = window.dailyVitaminDIUBreakdown(7);
      const dayTotals = buckets.map(b => Math.round(b.sun + b.device));
      const total = dayTotals.reduce((a, b) => a + b, 0);
      const rolling = Math.round(window.rollingVitaminDIU(7));
      assert('dailyVitaminDIUBreakdown returns 7 buckets', buckets.length === 7);
      assert('breakdown total matches rollingVitaminDIU(7)',
        Math.abs(total - rolling) <= 1, `breakdown=${total} rolling=${rolling}`);
      assert('today/yesterday rows non-zero',
        buckets[6].sun > 0 && buckets[5].sun > 0);
      S.importedData = _saved;
    }
  }

  // ─── 5. v1.6.7 Measurement retention model (latest per roomId+tool) ─
  console.log('%c 5. Latest-per-(roomId, tool) measurement model ', 'font-weight:bold;color:#0891b2');
  {
    const S = window._labState;
    if (!S || !window.saveMeasurement || !window.getMeasurements) {
      assert('saveMeasurement / getMeasurements exposed', false);
    } else {
      const _saved = JSON.parse(JSON.stringify(S.importedData));
      S.importedData.lightMeasurements = [];
      delete S.importedData._deleted;
      const r = 'room_test_retain';
      await window.saveMeasurement('flicker', 1, { roomId: r });
      await window.saveMeasurement('flicker', 3, { roomId: r });
      await window.saveMeasurement('lux', 800, { roomId: r });
      const rows = window.getMeasurements();
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
      await window.saveMeasurement('audit', 4, { roomId: null, extra: { rooms: [{ index: 1, lux: 200, label: 'Bedroom' }] } });
      await window.saveMeasurement('audit', 3, { roomId: null, extra: { rooms: [{ index: 1, lux: 800, label: 'Office' }] } });
      const auditRows = window.getMeasurements().filter(m => m.tool === 'audit');
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
    const syncSrc = await fetchSrc('js/sync.js');
    const cfgBlock = syncSrc.split('DELTA_ARRAY_CONFIG')[1] || '';
    const lmCfgMatch = cfgBlock.match(/lightMeasurements:\s*\{[\s\S]{0,300}?\}/);
    assert('sync.js: lightMeasurements has NO noTombstones (Phase 2 propagation)',
      !lmCfgMatch || !/noTombstones:\s*true/.test(lmCfgMatch[0]),
      'lightMeasurements: noTombstones true would block v4 tombstone propagation');
  }

  // ─── 6. v1.6.9..v1.6.13 Scroll anchor system ────────────────────────
  console.log('%c 6. Scroll-anchor system ', 'font-weight:bold;color:#0891b2');
  {
    const viewsSrc = await fetchSrc('js/views.js');
    assert('views.js: _captureScrollAnchor exists', /function _captureScrollAnchor/.test(viewsSrc));
    assert('views.js: _restoreScrollAnchor exists', /function _restoreScrollAnchor/.test(viewsSrc));
    assert('views.js: two-tier heuristic (containingBest + centerBest)',
      /containingBest[\s\S]{0,500}centerBest/.test(viewsSrc));
    assert('views.js: containing-tier picks SMALLEST area (innermost)',
      /containsCenter[\s\S]{0,300}area\s*<\s*containingBestArea/.test(viewsSrc));
    // v1.6.11: rapid same-anchor navigates reuse the original capture
    // instead of re-capturing AFTER the jump.
    assert('views.js: _activeAnchor reuse for rapid same-anchor navigates',
      /_activeAnchor[\s\S]{0,200}\.selector\s*===\s*data\.scrollAnchor/.test(viewsSrc));
    // v1.6.12: explicit anchor element gone → skip auto-pick fallback.
    assert('views.js: skip auto-pick when explicit anchor not found',
      /explicitAnchorRequested[\s\S]{0,400}!explicitAnchorRequested/.test(viewsSrc)
      || /explicitAnchorRequested\s*=\s*!!\(data/.test(viewsSrc));
    // v1.6.10: 1.2s RAF re-anchor loop.
    assert('views.js: RAF re-anchor loop runs for ~1.2s',
      /1200/.test(viewsSrc) && /requestAnimationFrame\(reapply\)/.test(viewsSrc));
    // v1.6.10: user-input cancel for the loop.
    assert('views.js: anchor loop cancels on wheel/touchstart/keydown',
      /addEventListener\('wheel'/.test(viewsSrc)
      && /addEventListener\('touchstart'/.test(viewsSrc)
      && /addEventListener\('keydown'/.test(viewsSrc));
    // v1.6.10: token cancellation across navigates.
    assert('views.js: _navAnchorToken bumped per navigate, old loops bail',
      /_navAnchorToken/.test(viewsSrc) && /myToken\s*!==\s*_navAnchorToken/.test(viewsSrc));
    // v1.6.13: _refreshSurfaces debounce.
    const sunSrc = await fetchSrc('js/sun.js');
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
    const api = await import('/js/api.js?bust=' + Date.now());
    assert('api.js: STREAM_STALL_TIMEOUT_MS exported = 30000',
      api.STREAM_STALL_TIMEOUT_MS === 30000, `got ${api.STREAM_STALL_TIMEOUT_MS}`);
    assert('api.js: FETCH_REQUEST_TIMEOUT_MS exported = 60000',
      api.FETCH_REQUEST_TIMEOUT_MS === 60000, `got ${api.FETCH_REQUEST_TIMEOUT_MS}`);
    const apiSrc = await fetchSrc('js/api.js');
    assert('api.js: readWithStallTimeout exists',
      /function readWithStallTimeout/.test(apiSrc));
    assert('api.js: _fetchWithRetry composes AbortSignal.timeout + caller signal',
      /AbortSignal\.timeout\(FETCH_REQUEST_TIMEOUT_MS\)/.test(apiSrc)
      && /AbortSignal\.any/.test(apiSrc));
    // Polyfill path: when AbortSignal.any is unavailable, manual
    // AbortController forwards both signals. Without this older
    // browsers (Safari <17.4) would silently lose the 60s timeout.
    assert('api.js: manual AbortController polyfill for older browsers',
      /Manual polyfill for browsers without AbortSignal\.any/.test(apiSrc)
      && /new AbortController/.test(apiSrc.split('_fetchWithRetry')[1] || ''));
    assert('api.js: retry on transient network errors (TypeError / Failed to fetch / timeout)',
      /isNetwork\s*=\s*e\s+instanceof\s+TypeError/.test(apiSrc)
      || /Failed to fetch.*Load failed.*NetworkError/.test(apiSrc));
    assert('api.js: stall-timeout wraps all 3 streaming branches',
      (apiSrc.match(/readWithStallTimeout\(reader/g) || []).length >= 3);
  }

  // ─── 8. v1.6.7 Sync offline/online toast affordance ─────────────────
  console.log('%c 8. Sync offline/online toast affordance ', 'font-weight:bold;color:#0891b2');
  {
    const syncSrc = await fetchSrc('js/sync.js');
    assert('sync.js: listens for offline event',
      /addEventListener\('offline'/.test(syncSrc));
    assert('sync.js: listens for online event + kicks sync',
      /addEventListener\('online'[\s\S]{0,200}_kickSync\('online'\)/.test(syncSrc));
    assert('sync.js: offline toast mentions "saved locally"',
      /saved locally and will sync when you reconnect/.test(syncSrc));
    assert('sync.js: online toast mentions "syncing"',
      /Back online[\s\S]{0,80}syncing your changes/i.test(syncSrc));
    assert('sync.js: toast guarded against double-firing',
      /_lastNetState/.test(syncSrc));
  }

  // ─── 9. v1.6.14 Sync pull reads view from state, not DOM ────────────
  console.log('%c 9. Sync pull-side current view source ', 'font-weight:bold;color:#0891b2');
  {
    const syncSrc = await fetchSrc('js/sync.js');
    assert('sync.js: pull handler reads state.currentView first',
      /const cat\s*=\s*state\.currentView\s*\|\|\s*document\.querySelector\('\.nav-item\.active'\)/.test(syncSrc));
    // _refreshSurfaces gained the same fallback (audit P1.3): when
    // state.currentView is undefined during boot, fall back to DOM
    // instead of jumping straight to 'dashboard'.
    const sunSrc = await fetchSrc('js/sun.js');
    assert('sun.js: _refreshSurfaces also falls back via DOM before dashboard',
      /_refreshSurfaces[\s\S]{0,1500}state\.currentView[\s\S]{0,400}document\.querySelector\('\.nav-item\.active'\)/.test(sunSrc));
  }

  // ─── 10. v1.6.7 PII Ollama reachability probe + 45s stall ───────────
  console.log('%c 10. PII Ollama reachability + stall protection ', 'font-weight:bold;color:#0891b2');
  {
    const piiSrc = await fetchSrc('js/pii.js');
    assert('pii.js: probes /api/version before streaming',
      /\/api\/version/.test(piiSrc) && /AbortSignal\.timeout\(5000\)/.test(piiSrc));
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
    const lensSrc = await fetchSrc('js/lens.js');
    assert('lens.js: TIMEOUT_MS = 10000 (was 30000)',
      /TIMEOUT_MS\s*=\s*10000/.test(lensSrc));
  }

  // ─── 12. v1.6.7 Cashu auto-melt persistent-failure surface ──────────
  console.log('%c 12. Cashu auto-melt failure counter ', 'font-weight:bold;color:#0891b2');
  {
    const cashuSrc = await fetchSrc('js/cashu-wallet.js');
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
    const viewsSrc = await fetchSrc('js/views.js');
    assert('views.js: SESSIONS_DEFAULT_CAP = 3',
      /SESSIONS_DEFAULT_CAP\s*=\s*3/.test(viewsSrc));
    assert('views.js: _openAllSessionsModal exists',
      /function _openAllSessionsModal/.test(viewsSrc));
    assert('views.js: _collectUnifiedSessionRows shared helper',
      /function _collectUnifiedSessionRows/.test(viewsSrc));
    assert('views.js: _renderSessionRowsHTML shared row renderer',
      /function _renderSessionRowsHTML/.test(viewsSrc));
    assert('views.js: "View all N sessions" button replaces inline expand',
      /View all \$\{totalCount\} sessions/.test(viewsSrc));
    assert('views.js: _toggleAllSessions and _showAllSessions removed',
      !/_toggleAllSessions/.test(viewsSrc) && !/_showAllSessions/.test(viewsSrc));
    // Behaviour: ensure window._openAllSessionsModal is wired and renders a modal.
    if (typeof window._openAllSessionsModal === 'function') {
      const before = document.querySelectorAll('.modal-overlay').length;
      try { window._openAllSessionsModal(); } catch (e) {}
      const after = document.querySelectorAll('.modal-overlay').length;
      assert('window._openAllSessionsModal opens a modal-overlay', after > before);
      const m = document.querySelectorAll('.modal-overlay');
      if (m.length > before) m[m.length - 1].remove();
    } else {
      assert('window._openAllSessionsModal exposed on window', false);
    }
  }

  // ─── 14. v1.6.7 Mobile UX fixes (light-env reading overflow + FAB) ──
  console.log('%c 14. v1.6.7 mobile CSS guards ', 'font-weight:bold;color:#0891b2');
  {
    const cssSrc = await fetchSrc('styles.css');
    assert('styles.css: .light-env-reading-ai uses flex-basis 100%',
      /\.light-env-reading-ai[\s\S]{0,300}flex-basis:\s*100%/.test(cssSrc));
    assert('styles.css: mobile .main padding-bottom clears FAB stack (1024 + 480 + 375)',
      (cssSrc.match(/padding-bottom:\s*calc\(120px\s*\+\s*env\(safe-area-inset-bottom\)\)/g) || []).length >= 3);
    assert('styles.css: silhouette tap stroke for coarse pointer (mobile)',
      /pointer:\s*coarse[\s\S]{0,500}\.sun-silhouette-region[\s\S]{0,300}stroke-width:\s*\d/.test(cssSrc));
    assert('styles.css: modal-header reserves padding-right for close button',
      /\.modal-header\s*\{[\s\S]{0,200}padding-right:\s*40px/.test(cssSrc));
  }

  // ─── 15. v1.6.7 PDF import inherits AI request timeout ──────────────
  console.log('%c 15. PDF import inherits stream + request timeouts ', 'font-weight:bold;color:#0891b2');
  {
    const pdfSrc = await fetchSrc('js/pdf-import.js');
    // PDF import calls callClaudeAPI (imported from api.js) which routes
    // through _fetchWithRetry and the streaming helpers. We don't
    // duplicate the timeout logic here, just confirm the import + call
    // sites exist so a future refactor doesn't accidentally bypass them.
    assert('pdf-import.js: imports callClaudeAPI from api.js',
      /import\s*\{[^}]*callClaudeAPI[^}]*\}\s*from\s*['"]\.\/api\.js['"]/.test(pdfSrc));
    assert('pdf-import.js: parseLabPDFWithAI calls callClaudeAPI',
      /export\s+async\s+function\s+parseLabPDFWithAI[\s\S]+?callClaudeAPI\(/.test(pdfSrc));
    assert('pdf-import.js: catch path closes the import modal on error',
      /catch\s*\([^)]+\)\s*\{[\s\S]{0,500}hideImportProgress\('error'\)/.test(pdfSrc));
  }

  // ─── 16. v1.6.7 Sun-context warnings iterate the sparse array ──────
  console.log('%c 16. sun-context warnings iterate sparse array ', 'font-weight:bold;color:#0891b2');
  {
    const ctxSrc = await fetchSrc('js/sun-context.js');
    // After the measurement-retention redesign, lightMeasurements is
    // already at-most-one-per-(roomId, tool), so no time-window filter
    // is needed. The 90-day filter from earlier drafts was removed.
    assert('sun-context.js: no 90-day filter (relies on sparse array)',
      !/90\s*\*\s*86400/.test(ctxSrc));
    assert('sun-context.js: iterates lightMeasurements directly',
      /const recent\s*=\s*state\.importedData\?\.lightMeasurements/.test(ctxSrc));
    assert('sun-context.js: still emits flicker / darkness / cct warnings',
      /m\.tool\s*===\s*'flicker'/.test(ctxSrc)
      && /m\.tool\s*===\s*'darkness'/.test(ctxSrc)
      && /m\.tool\s*===\s*'cct'/.test(ctxSrc));
  }

  // ─── 17. v1.6.7 Light & Sun copy fixes ──────────────────────────────
  console.log('%c 17. v1.6.7 copy fixes ', 'font-weight:bold;color:#0891b2');
  {
    const viewsSrc = await fetchSrc('js/views.js');
    assert('views.js: "Today\'s sun timeline" replaces "TODAY\'S SUN ARC"',
      /Today's sun timeline/.test(viewsSrc) && !/Today's sun arc/.test(viewsSrc));
    assert('views.js: EAQI label rendered as "EU air quality index"',
      /EU air quality index/.test(viewsSrc));
    assert('views.js: cloud chip uses "clear-sky max UVI"',
      /clear-sky max UVI/.test(viewsSrc));
    assert('views.js: zero-hit channel pill shows 0/7 not em-dash',
      /return \{ txt: `\$\{n\}\/7`/.test(viewsSrc));
    const sunSrc = await fetchSrc('js/sun.js');
    assert('sun.js: Eyes-mode option shortened ("never stare at sun")',
      /Eyes uncovered \(never stare at sun\)/.test(sunSrc));
  }

  // ─── Restore state ──────────────────────────────────────────────────
  if (window._labState && _origImported) window._labState.importedData = _origImported;
  if (window._labState) window._labState.profileSex = _origProfileSex;

  console.log(`%c v1.6.7..v1.6.16: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);
})();
