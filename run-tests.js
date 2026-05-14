#!/usr/bin/env node
// Headless browser test runner for Get Based
// Usage: node run-tests.js (requires http server on :8000)
// Or:    ./run-tests.sh (starts server automatically)
//
// Coverage: COVERAGE=1 node run-tests.js — collects per-script byte coverage
// via Puppeteer's CDP-backed JSCoverage API, writes tests/.coverage.json plus
// a sorted report. Off by default (~3s slower per run when enabled).

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TEST_FILES = [
  'tests/test-crypto.js',
  'tests/test-chat-threads.js',
  'tests/test-chat-actions.js',
  'tests/test-mobile.js',
  // test-openrouter.js source-inspection + behavioral ported to Vitest
  // (batch 21). DOM-runtime section (Settings modal openSettingsModal,
  // querySelectorAll on rendered provider cards) lives in
  // test-openrouter-dom.js below.
  'tests/test-openrouter-dom.js',
  'tests/test-tour.js',
  // test-custom-personality.js source-inspection + behavioral ported to
  // Vitest (batch 23). DOM-runtime sections (11/12/17/21 — updatePersonalityBar
  // rendering, styleSheets CSS scan, dirty-state, Discuss button) live in
  // test-custom-personality-dom.js below.
  'tests/test-custom-personality-dom.js',
  // test-changelog.js source-inspection + hasCardContent behavioral ported
  // to Vitest (batch 20). DOM-runtime sections (modal open/close, forceShow
  // behavior, inline-tag rendering) live in test-changelog-dom.js below.
  'tests/test-changelog-dom.js',
  // test-audit.js source-inspection (sections 1-16 + innerHTML sweep) ported
  // to Vitest (batch 22). The section-3b functional safeMarkerId-guard probes
  // (need live DOM + populated state) live in test-audit-dom.js below.
  'tests/test-audit-dom.js',
  // test-image-utils.js source-inspection + module-export checks ported to
  // Vitest (PR for batch 19). DOM-runtime assertions (sections 6 + 7) live
  // in test-image-utils-dom.js below.
  'tests/test-image-utils-dom.js',
  'tests/test-emf.js',
  'tests/test-emf-flow.js',
  'tests/test-dna.js',
  'tests/test-dna-illumina-and-valence.js',
  'tests/test-wearables.js',
  'tests/test-wearables-manual.js',
  'tests/test-wearables-sync-flow.js',
  'tests/test-wearables-ui-flows.js',
  'tests/test-dashboard-knowledge-base.js',
  'tests/test-dashboard-data-protection.js',
  'tests/test-chat-panel-ux.js',
  'tests/test-cashu-wallet.js',
  // test-custom-api.js source-inspection + behavioral ported to Vitest
  // (batch 24). DOM-runtime sections (13/14 — Settings modal rendering,
  // Custom panel form fields, connected-state model dropdown) live in
  // test-custom-api-dom.js below.
  'tests/test-custom-api-dom.js',
  // test-custom-lens.js source-inspection + behavioral ported to Vitest
  // (batch 25). DOM-runtime sections (15/16 — chat-header lens indicator,
  // Knowledge Base modal rendering) live in test-custom-lens-dom.js below.
  'tests/test-custom-lens-dom.js',
  'tests/test-export-import.js',
  'tests/test-ui-flows.js',
  'tests/test-lens-local-worker.js',
  'tests/test-ai-verdict-engine.js',
  'tests/test-coverage-stragglers.js',
  'tests/test-silhouette-picker.js',
  'tests/test-silhouette-region-map.js',
  'tests/test-sun-ui-flow.js',
  'tests/test-blob-storage.js',
  'tests/test-audit-fixes.js',
  'tests/test-family-history.js',
  // Extracted from test-v1-6-shipped.js (PR #204) — the live-DOM
  // assertion can't run in Node + ES modules can't run via the
  // puppeteer `Function(s)()` evaluator, so the modal-render check
  // needed its own thin file that stays in the puppeteer runner.
  'tests/test-all-sessions-modal.js',
  'tests/test-wearables-bp-merge.js',
  // axe-core runtime scan runs LAST. It rebuilds the DOM extensively and
  // mutates state in ways that are expensive to fully reverse (creates a
  // demo profile, swaps currentProfile, opens/closes 8 modals), so anything
  // depending on a specific upstream state would have been observed by now.
  'tests/test-a11y-axe.js',
];

const PORT = process.env.PORT || 8000;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const fails = [];
  let listening = false;

  page.on('console', msg => {
    if (!listening) return;
    const text = msg.text();

    // Strip %c style args for clean terminal output
    const clean = text.replace(/%c/g, '').replace(/(?:color|background|font-weight|font-size|font-family|padding|border-radius|margin|display)\s*:[^;]+;?/g, '').trim();
    if (!clean) return;

    // Per-assert failure line (both "FAIL " and "FAIL:" formats)
    if (clean.startsWith('FAIL ') || clean.startsWith('FAIL:') || clean.startsWith('PAGE ERROR') || clean.includes('\u274C')) {
      fails.push(clean);
      console.log('\x1b[31m' + clean + '\x1b[0m');
      return;
    }
    // Summary lines like "115 passed, 25 failed, 140 total" — flag if any failed
    const summaryMatch = clean.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i);
    if (summaryMatch && parseInt(summaryMatch[2], 10) > 0) {
      const failedCount = parseInt(summaryMatch[2], 10);
      fails.push(`SUMMARY: ${failedCount} failed — ${clean}`);
      console.log('\x1b[31m' + clean + '\x1b[0m');
      return;
    }
    if (clean.includes('passed') || clean.includes('Results')) {
      console.log('\x1b[36m' + clean + '\x1b[0m');
    } else if (clean.startsWith('\u25B6')) {
      console.log('\x1b[1m' + clean + '\x1b[0m');
    }
  });

  page.on('pageerror', err => {
    if (!listening) return;
    const msg = 'PAGE ERROR: ' + err.message;
    fails.push(msg);
    console.log('\x1b[31m' + msg + '\x1b[0m');
  });

  // Pipe selected env vars into the page context BEFORE the first
  // navigation so test-side code (e.g. test-a11y-axe.js) can read them as
  // `window.X`. Earlier the a11y test's docs claimed `A11Y_REBASELINE=1`
  // would refresh the baseline, but nothing was wiring the env var
  // through — the only working path was deleting the JSON by hand.
  const A11Y_REBASELINE = process.env.A11Y_REBASELINE === '1' || process.env.A11Y_REBASELINE === 'true';
  if (A11Y_REBASELINE) {
    await page.evaluateOnNewDocument(() => { window.A11Y_REBASELINE = true; });
  }

  try {
    await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle2', timeout: 15000 });
  } catch (e) {
    console.error(`\x1b[31mCannot connect to http://localhost:${PORT}/ — is the server running?\x1b[0m`);
    console.error('Start it with: node dev-server.js ' + PORT);
    await browser.close();
    process.exit(2);
  }

  // Disable service worker to prevent context-destroying reloads during test execution
  await page.setBypassServiceWorker(true);
  // Also unregister any existing SW registrations
  try {
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    });
  } catch (e) { /* context destroyed by SW — harmless, we bypass it anyway */ }

  // Reload clean (no SW interference)
  await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle2', timeout: 15000 });

  const COVERAGE = process.env.COVERAGE === '1' || process.env.COVERAGE === 'true';
  if (COVERAGE) {
    // resetOnNavigation: false keeps the accumulator alive across the page
    // reloads we do on context destruction below — otherwise we'd lose
    // everything collected before each reload. includeRawScriptCoverage: true
    // exposes V8's per-function block-level data so we can report function
    // coverage (each defined function called ≥ once) — the metric the team
    // is targeting, separate from raw byte coverage.
    await page.coverage.startJSCoverage({ resetOnNavigation: false, includeRawScriptCoverage: true });
    console.log('\x1b[35m[coverage] JS coverage collection enabled\x1b[0m');
  }

  console.log(`Running ${TEST_FILES.length} test files...\n`);
  listening = true;

  // Run each test file individually to survive context destruction
  for (const testFile of TEST_FILES) {
    try {
      await page.evaluate(async (t) => {
        // Inject fetchWithRetry before each test (page context can be lost between runs)
        if (!window.fetchWithRetry) {
          window.fetchWithRetry = async function(url, retries = 3) {
            for (let i = 0; i < retries; i++) {
              try { return await fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }); }
              catch (e) { if (i === retries - 1) throw new Error(`Failed to fetch ${url} after ${retries} attempts`); }
            }
          };
        }
        console.log(`\u25B6 Running ${t}`);
        try {
          const src = await fetch(t).then(r => r.text());
          await Function(src)();
        } catch (e) {
          console.log(`FAIL ${t}: ${e.message}`);
        }
      }, testFile);
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log(`\x1b[33mWARN: ${testFile} destroyed context — reloading\x1b[0m`);
        await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle2', timeout: 15000 });
      } else {
        fails.push(`CRASH ${testFile}: ${e.message}`);
        console.log(`\x1b[31mCRASH ${testFile}: ${e.message}\x1b[0m`);
      }
    }
  }

  // Wait for async console logs to flush
  await new Promise(r => setTimeout(r, 3000));
  listening = false;

  let coverageGateFailure = null;
  if (COVERAGE) {
    const entries = await page.coverage.stopJSCoverage();
    // Debug dump for one file to verify v8 format assumptions.
    if (process.env.COVERAGE_DEBUG) {
      const allEmf = entries.filter(e => e.url.includes('/js/emf.js'));
      for (const e of allEmf) {
        const called = (e.rawScriptCoverage?.functions || [])
          .filter(f => f.functionName && (f.ranges?.[0]?.count || 0) > 0)
          .map(f => f.functionName);
        console.log(`[DEBUG] ${e.url} — text.length=${e.text?.length} called=${called.length}`);
        if (called.length) console.log('       called:', called.slice(0, 10).join(', '), called.length > 10 ? '...' : '');
      }
    }
    const reportResult = writeCoverageReport(entries);
    // CI gate: fail the suite if function coverage drops below the floor.
    // COVERAGE_MIN defaults to 0 (off); set to e.g. 90 to enforce.
    const minPct = parseFloat(process.env.COVERAGE_MIN || '0');
    if (minPct > 0 && reportResult.globalFnPct < minPct) {
      coverageGateFailure = `Function coverage ${reportResult.globalFnPct.toFixed(2)}% is below the ${minPct}% floor (COVERAGE_MIN). Add tests or lower the floor.`;
      console.log('\n\x1b[31m\x1b[1m✘ ' + coverageGateFailure + '\x1b[0m');
    }
  }

  await browser.close();

  // Final summary
  console.log('\n' + '='.repeat(50));
  if (fails.length === 0 && !coverageGateFailure) {
    console.log('\x1b[32m\x1b[1m  ALL TESTS PASSED\x1b[0m');
  } else if (fails.length > 0) {
    console.log(`\x1b[31m\x1b[1m  ${fails.length} FAILURE(S):\x1b[0m`);
    fails.forEach(f => console.log('  \x1b[31m' + f + '\x1b[0m'));
    if (coverageGateFailure) console.log('  \x1b[31m' + coverageGateFailure + '\x1b[0m');
  } else {
    // Tests passed but coverage gate tripped — surface that as the failure
    // reason rather than the misleading "ALL TESTS PASSED" banner.
    console.log('\x1b[31m\x1b[1m  TESTS PASSED BUT COVERAGE GATE FAILED\x1b[0m');
    console.log('  \x1b[31m' + coverageGateFailure + '\x1b[0m');
  }
  console.log('='.repeat(50));

  process.exit((fails.length > 0 || coverageGateFailure) ? 1 : 0);
})();

// Merge overlapping/adjacent [start, end) ranges and return their total length.
function unionLength(ranges) {
  if (!ranges.length) return 0;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let covered = 0;
  let curStart = sorted[0].start, curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= curEnd) curEnd = Math.max(curEnd, sorted[i].end);
    else { covered += curEnd - curStart; curStart = sorted[i].start; curEnd = sorted[i].end; }
  }
  return covered + (curEnd - curStart);
}

// Coverage report: aggregate by js/*.js + service-worker.js + version.js
// (everything in our own source tree). Skip /vendor/, /node_modules/, data:
// URLs, and the test files themselves. Print a sorted table to stdout and
// dump the raw entries to tests/.coverage.json for follow-up tooling.
function writeCoverageReport(entries) {
  const ourSourcePattern = /\/(js|service-worker|version|api)\/.*\.m?js$|\/(service-worker|version)\.js$|\/api\/.*\.js$/;
  // Pre-compute path-without-query for every entry so the regex below matches
  // bust-querystringed imports (`/js/emf.js?bust=...`) — those used to be
  // filtered out because the trailing `\.js$` didn't survive the `?bust=...`.
  const cleanUrl = (u) => (u || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const perFile = new Map();
  for (const e of entries) {
    if (!e.url || !ourSourcePattern.test(cleanUrl(e.url))) continue;
    // The runner fetches test files as text and runs them via Function(src) — those
    // show up as anonymous scripts, not /tests/*.js URLs, so the test wrapper code
    // never lands in this aggregate. Good — we only count product code coverage.
    const total = (e.text || '').length;
    if (!total) continue;
    const covered = unionLength(e.ranges || []);
    // Strip protocol+host AND query string so cache-busted imports
    // (`/js/emf.js?bust=1234`) fold into the canonical `/js/emf.js` bucket.
    // Without this, tests that use ?bust= for fresh module evaluation count
    // toward a separate URL that nothing else hits — appearing as a regression
    // when it's really the same file.
    const rel = e.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    const prev = perFile.get(rel) || { total: 0, covered: 0 };
    // Same script loaded multiple times (rare — only if page reload happened)
    // → keep the entry with the most coverage observed.
    perFile.set(rel, total > prev.total
      ? { total, covered: Math.max(covered, prev.covered) }
      : { total: prev.total, covered: Math.max(covered, prev.covered) });
  }

  // Function coverage: each file can show up under multiple URLs (cache-busted
  // dynamic imports). Naively merging every URL's function records double-
  // counts the function list. Instead:
  //   1. Pick ONE canonical entry per file as the function list ground truth
  //      (the entry with the largest text — handles fetch races where one
  //      load might be empty).
  //   2. For every OTHER entry of the same file, OR-in called status from its
  //      function records into the canonical list (matched by function name).
  //
  // Anonymous wrappers (empty functionName) are skipped — V8 emits them for
  // module top-level scope and they'd inflate the count.
  const canonical = new Map(); // rel -> entry
  for (const e of entries) {
    if (!e.url || !ourSourcePattern.test(cleanUrl(e.url))) continue;
    const rel = cleanUrl(e.url);
    const prev = canonical.get(rel);
    if (!prev || (e.text || '').length > (prev.text || '').length) canonical.set(rel, e);
  }
  const fnPerFile = new Map();
  for (const [rel, e] of canonical) {
    const fns = (e.rawScriptCoverage?.functions || [])
      .filter(f => f.functionName)
      .map(f => ({ name: f.functionName, called: (f.ranges?.[0]?.count || 0) > 0 }));
    fnPerFile.set(rel, fns);
  }
  // Pass 2: union call counts from all non-canonical entries.
  for (const e of entries) {
    if (!e.url || !ourSourcePattern.test(cleanUrl(e.url))) continue;
    const rel = cleanUrl(e.url);
    if (e === canonical.get(rel)) continue;
    const fns = fnPerFile.get(rel);
    if (!fns) continue;
    for (const fn of (e.rawScriptCoverage?.functions || [])) {
      if (!fn.functionName) continue;
      if (!((fn.ranges?.[0]?.count || 0) > 0)) continue;
      const target = fns.find(f => f.name === fn.functionName && !f.called);
      if (target) target.called = true;
    }
  }
  // Convert per-file fn list to the shape the rest of the report expects.
  const fnSummary = new Map();
  for (const [rel, fns] of fnPerFile) {
    fnSummary.set(rel, {
      total: fns.length,
      called: fns.filter(f => f.called).length,
      names: fns.filter(f => !f.called).map(f => f.name),
    });
  }

  const rows = [...perFile.entries()].map(([file, m]) => {
    // perFile keys are stripped paths like `js/emf.js`; fnSummary keys
    // come from `cleanUrl()` which keeps the leading slash. Always look
    // up with the slash form.
    const fnRow = fnSummary.get('/' + file) || { total: 0, called: 0, names: [] };
    return {
      file, total: m.total, covered: m.covered,
      pct: m.total > 0 ? (m.covered / m.total) * 100 : 0,
      uncovered: m.total - m.covered,
      fnTotal: fnRow.total, fnCalled: fnRow.called,
      fnPct: fnRow.total > 0 ? (fnRow.called / fnRow.total) * 100 : 100,
      uncalledFns: fnRow.names,
    };
  });
  rows.sort((a, b) => a.fnPct - b.fnPct);

  const totals = rows.reduce((acc, r) => ({
    total: acc.total + r.total, covered: acc.covered + r.covered,
    fnTotal: acc.fnTotal + r.fnTotal, fnCalled: acc.fnCalled + r.fnCalled,
  }), { total: 0, covered: 0, fnTotal: 0, fnCalled: 0 });
  const globalPct = totals.total > 0 ? (totals.covered / totals.total) * 100 : 0;
  const globalFnPct = totals.fnTotal > 0 ? (totals.fnCalled / totals.fnTotal) * 100 : 0;

  // fileURLToPath handles percent-encoded paths (spaces in dir name) that
  // new URL().pathname returns raw — fs.writeFile would otherwise see the
  // encoded form and fail with ENOENT.
  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.join(outDir, 'tests', '.coverage.json');

  // Drift detector: read prior snapshot before overwriting. Static
  // COVERAGE_MIN floor (90 by default) doesn't catch slow erosion across
  // many small commits — current 93.47% could drop to 90.05% silently.
  // Warn (non-fatal) when current dips >0.5pt vs prior.
  let priorFnPct = null;
  try {
    const prior = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (prior?.totals?.fnTotal > 0) {
      priorFnPct = (prior.totals.fnCalled / prior.totals.fnTotal) * 100;
    }
  } catch (_) { /* first run — no prior snapshot */ }

  fs.writeFileSync(jsonPath, JSON.stringify({ globalPct, totals, rows, generatedAt: new Date().toISOString() }, null, 2));

  console.log('\n' + '='.repeat(88));
  console.log('\x1b[35m\x1b[1m  COVERAGE REPORT (function coverage primary; byte coverage secondary)\x1b[0m');
  console.log('='.repeat(88));
  console.log(['File'.padEnd(46), 'Fns'.padStart(6), 'Called'.padStart(8), 'Fn%'.padStart(8), 'Byte%'.padStart(10)].join(''));
  console.log('-'.repeat(88));
  for (const r of rows.slice(0, 30)) {
    const color = r.fnPct < 50 ? '\x1b[31m' : r.fnPct < 90 ? '\x1b[33m' : '\x1b[32m';
    console.log(color + [
      r.file.padEnd(46).slice(0, 46),
      String(r.fnTotal).padStart(6),
      String(r.fnCalled).padStart(8),
      (r.fnPct.toFixed(1) + '%').padStart(8),
      (r.pct.toFixed(1) + '%').padStart(10),
    ].join('') + '\x1b[0m');
  }
  if (rows.length > 30) console.log(`  ... ${rows.length - 30} more files (full data in tests/.coverage.json)`);
  console.log('-'.repeat(88));
  const fnBanner = globalFnPct >= 90 ? '\x1b[32m\x1b[1m' : globalFnPct >= 75 ? '\x1b[33m\x1b[1m' : '\x1b[31m\x1b[1m';
  console.log(fnBanner + `  GLOBAL FUNCTIONS: ${totals.fnCalled.toLocaleString()} / ${totals.fnTotal.toLocaleString()} = ${globalFnPct.toFixed(2)}%\x1b[0m`);
  console.log(`  GLOBAL BYTES:     ${totals.covered.toLocaleString()} / ${totals.total.toLocaleString()} = ${globalPct.toFixed(2)}%`);
  if (priorFnPct != null) {
    const drift = globalFnPct - priorFnPct;
    if (drift <= -0.5) {
      // Yellow drift warning — non-fatal but visible. Use COVERAGE_MIN to
      // turn this into a hard gate if/when desired.
      console.log(`\x1b[33m  DRIFT WARNING: function coverage dropped ${drift.toFixed(2)}pt vs prior run (${priorFnPct.toFixed(2)}% → ${globalFnPct.toFixed(2)}%)\x1b[0m`);
    } else if (drift >= 0.5) {
      console.log(`\x1b[32m  Δ +${drift.toFixed(2)}pt vs prior run (${priorFnPct.toFixed(2)}% → ${globalFnPct.toFixed(2)}%)\x1b[0m`);
    }
  }
  console.log('='.repeat(88));
  return { globalFnPct, globalPct, totals };
}
