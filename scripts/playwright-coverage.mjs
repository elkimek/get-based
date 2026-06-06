#!/usr/bin/env node
// Playwright coverage sampler for Get Based.
//
// This intentionally runs after the normal test suite when COVERAGE=1 is set.
// It samples high-surface browser-script fixtures under Chromium coverage and
// reports loaded app-source JS function and byte coverage.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { runBrowserScript } from '../tests/playwright/browser-script-runner.js';

const PORT = process.env.PORT || '8000';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const COVERAGE_FIXTURES = [
  ['export/import browser fixture', 'tests/test-export-import.js'],
  ['UI flows browser fixture', 'tests/test-ui-flows.js'],
  ['mobile browser regression fixture', 'tests/test-mobile.js'],
  ['chat panel UX browser fixture', 'tests/test-chat-panel-ux.js'],
  ['Lens local worker browser fixture', 'tests/test-lens-local-worker.js'],
  ['audit-fix browser fixture', 'tests/test-audit-fixes.js'],
  ['AI verdict engine browser contract', 'tests/test-ai-verdict-engine.js', { settleMs: 500 }],
  ['Light and Sun UI flow browser fixture', 'tests/test-sun-ui-flow.js'],
  ['silhouette picker browser fixture', 'tests/test-silhouette-picker.js'],
  ['silhouette region-map browser fixture', 'tests/test-silhouette-region-map.js'],
  ['wearables detail modal and browser DOM islands', 'tests/test-wearables-dom.js'],
  ['wearables click-driven UI flows', 'tests/test-wearables-ui-flows.js'],
  ['axe accessibility browser scan', 'tests/test-a11y-axe.js', {
    viewport: { width: 800, height: 600 },
    readyTimeout: 20_000,
    settleMs: 250,
  }],
];

function unionLength(ranges) {
  if (!ranges.length) return 0;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let covered = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start <= curEnd) {
      curEnd = Math.max(curEnd, sorted[i].end);
    } else {
      covered += curEnd - curStart;
      curStart = sorted[i].start;
      curEnd = sorted[i].end;
    }
  }
  return covered + (curEnd - curStart);
}

function cleanUrl(url) {
  return (url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];
}

function isAppSource(url) {
  const rel = cleanUrl(url);
  return /\/js\/.*\.m?js$/.test(rel) ||
    /\/api\/.*\.js$/.test(rel) ||
    rel === '/service-worker.js' ||
    rel === '/version.js';
}

function canonicalFile(url) {
  return cleanUrl(url).replace(/^\//, '');
}

function entrySource(entry) {
  return entry.text || entry.source || '';
}

function coverageFunctions(entry) {
  return entry.rawScriptCoverage?.functions || entry.functions || [];
}

function calledRanges(entry) {
  if (Array.isArray(entry.ranges)) return entry.ranges;
  return coverageFunctions(entry)
    .filter(fn => fn.functionName)
    .flatMap(fn => (fn.ranges || [])
      .filter(range => (range.count || 0) > 0)
      .map(range => ({
        start: range.start ?? range.startOffset ?? 0,
        end: range.end ?? range.endOffset ?? 0,
      })));
}

function writeCoverageReport(entries, fixtures) {
  const perFile = new Map();
  const canonical = new Map();

  for (const entry of entries) {
    if (!isAppSource(entry.url)) continue;
    const file = canonicalFile(entry.url);
    const total = entrySource(entry).length;
    if (!total) continue;
    const prev = perFile.get(file) || { total: 0, ranges: [] };
    prev.total = Math.max(prev.total, total);
    prev.ranges.push(...calledRanges(entry));
    perFile.set(file, prev);

    const prevCanonical = canonical.get(file);
    if (!prevCanonical || total > entrySource(prevCanonical).length) {
      canonical.set(file, entry);
    }
  }

  const fnPerFile = new Map();
  for (const [file, entry] of canonical) {
    const fns = coverageFunctions(entry)
      .filter(fn => fn.functionName)
      .map(fn => ({
        name: fn.functionName,
        called: (fn.ranges?.[0]?.count || 0) > 0,
      }));
    fnPerFile.set(file, fns);
  }

  for (const entry of entries) {
    if (!isAppSource(entry.url)) continue;
    const file = canonicalFile(entry.url);
    if (entry === canonical.get(file)) continue;
    const fns = fnPerFile.get(file);
    if (!fns) continue;
    for (const fn of coverageFunctions(entry)) {
      if (!fn.functionName || !((fn.ranges?.[0]?.count || 0) > 0)) continue;
      const target = fns.find(candidate => candidate.name === fn.functionName && !candidate.called);
      if (target) target.called = true;
    }
  }

  const rows = [...perFile.entries()].map(([file, metrics]) => {
    const fns = fnPerFile.get(file) || [];
    const fnCalled = fns.filter(fn => fn.called).length;
    const covered = unionLength(metrics.ranges);
    return {
      file,
      total: metrics.total,
      covered,
      pct: metrics.total > 0 ? (covered / metrics.total) * 100 : 0,
      uncovered: metrics.total - covered,
      fnTotal: fns.length,
      fnCalled,
      fnPct: fns.length > 0 ? (fnCalled / fns.length) * 100 : 100,
      uncalledFns: fns.filter(fn => !fn.called).map(fn => fn.name),
    };
  });
  rows.sort((a, b) => a.fnPct - b.fnPct || b.fnTotal - a.fnTotal);

  const totals = rows.reduce((acc, row) => ({
    total: acc.total + row.total,
    covered: acc.covered + row.covered,
    fnTotal: acc.fnTotal + row.fnTotal,
    fnCalled: acc.fnCalled + row.fnCalled,
  }), { total: 0, covered: 0, fnTotal: 0, fnCalled: 0 });

  const globalPct = totals.total > 0 ? (totals.covered / totals.total) * 100 : 0;
  const globalFnPct = totals.fnTotal > 0 ? (totals.fnCalled / totals.fnTotal) * 100 : 0;
  const jsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', '.coverage.json');

  let priorFnPct = null;
  try {
    const prior = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (Number.isFinite(prior.globalFnPct)) priorFnPct = prior.globalFnPct;
    else if (prior?.totals?.fnTotal > 0) priorFnPct = (prior.totals.fnCalled / prior.totals.fnTotal) * 100;
  } catch (_) {
    // First coverage run on this checkout.
  }

  fs.writeFileSync(jsonPath, JSON.stringify({
    runner: 'playwright',
    scope: 'loaded app-source JavaScript from sampled browser fixtures',
    globalPct,
    globalFnPct,
    totals,
    fixtures: fixtures.map(([name, testPath]) => ({ name, path: testPath })),
    rows,
    generatedAt: new Date().toISOString(),
  }, null, 2));

  console.log('\n' + '='.repeat(92));
  console.log('  PLAYWRIGHT COVERAGE REPORT (function coverage primary; byte coverage secondary)');
  console.log('='.repeat(92));
  console.log(['File'.padEnd(50), 'Fns'.padStart(6), 'Called'.padStart(8), 'Fn%'.padStart(8), 'Byte%'.padStart(10)].join(''));
  console.log('-'.repeat(92));
  for (const row of rows.slice(0, 30)) {
    console.log([
      row.file.padEnd(50).slice(0, 50),
      String(row.fnTotal).padStart(6),
      String(row.fnCalled).padStart(8),
      `${row.fnPct.toFixed(1)}%`.padStart(8),
      `${row.pct.toFixed(1)}%`.padStart(10),
    ].join(''));
  }
  if (rows.length > 30) console.log(`  ... ${rows.length - 30} more files (full data in tests/.coverage.json)`);
  console.log('-'.repeat(92));
  console.log(`  GLOBAL FUNCTIONS: ${totals.fnCalled.toLocaleString()} / ${totals.fnTotal.toLocaleString()} = ${globalFnPct.toFixed(2)}%`);
  console.log(`  GLOBAL BYTES:     ${totals.covered.toLocaleString()} / ${totals.total.toLocaleString()} = ${globalPct.toFixed(2)}%`);
  if (priorFnPct != null) {
    const drift = globalFnPct - priorFnPct;
    if (drift <= -0.5) console.log(`  DRIFT WARNING: function coverage dropped ${drift.toFixed(2)}pt vs prior run (${priorFnPct.toFixed(2)}% -> ${globalFnPct.toFixed(2)}%)`);
    else if (drift >= 0.5) console.log(`  DELTA: +${drift.toFixed(2)}pt vs prior run (${priorFnPct.toFixed(2)}% -> ${globalFnPct.toFixed(2)}%)`);
  }
  console.log('='.repeat(92));

  return { globalFnPct, globalPct, totals, rows };
}

async function main() {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromiumExecutable || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    await smokeTestApp(browser);

    const entries = [];
    let firstFailure = null;
    console.log(`Running Playwright coverage sampler against ${BASE_URL}`);
    for (const [name, testPath, options = {}] of COVERAGE_FIXTURES) {
      console.log(`  - ${name}`);
      const result = await runCoverageFixture(browser, testPath, options);
      entries.push(...result.entries);
      if (result.failure) {
        firstFailure = result.failure;
        break;
      }
    }

    const report = writeCoverageReport(entries, COVERAGE_FIXTURES);
    if (firstFailure) throw firstFailure;

    const minPct = Number.parseFloat(process.env.COVERAGE_MIN || '0');
    if (Number.isFinite(minPct) && minPct > 0 && report.globalFnPct < minPct) {
      throw new Error(`Coverage gate failed: function coverage ${report.globalFnPct.toFixed(2)}% is below COVERAGE_MIN=${minPct}.`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function smokeTestApp(browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    const response = await page.goto('/app', { waitUntil: 'load', timeout: 15_000 });
    if (!response?.ok()) throw new Error(`GET /app returned ${response?.status() || 'no response'}`);
  } catch (error) {
    console.error(`Cannot connect to ${BASE_URL}/app: ${error.message}`);
    console.error(`Start it with: node dev-server.js ${PORT}`);
    error.exitCode = 2;
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function runCoverageFixture(browser, testPath, options) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  let entries = [];
  let failure = null;

  page.on('pageerror', error => {
    pageErrors.push(error?.message || String(error));
  });

  try {
    await page.coverage.startJSCoverage({
      resetOnNavigation: false,
      reportAnonymousScripts: false,
      includeRawScriptCoverage: true,
    });
    try {
      await runBrowserScript(page, testPath, options);
      await page.waitForTimeout(250);
    } catch (error) {
      failure = error;
    } finally {
      try {
        entries = await page.coverage.stopJSCoverage();
      } catch (error) {
        if (!failure) failure = error;
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  if (pageErrors.length && !failure) {
    failure = new Error(`Page errors observed during ${testPath}:\n${pageErrors.map(error => `  - ${error}`).join('\n')}`);
  }

  return { entries, failure };
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(error?.exitCode || 1);
});
