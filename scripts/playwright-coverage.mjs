#!/usr/bin/env node
// Playwright coverage reporter for Get Based.
//
// This intentionally runs after the normal test suite when COVERAGE=1 is set.
// It prefers coverage shards emitted by the Playwright suite and falls back to
// high-surface browser-script fixtures when no suite shards are available.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { runBrowserScript } from '../tests/playwright/browser-script-runner.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || '8000';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const jsonPath = path.join(repoRoot, 'tests', '.coverage.json');
const playwrightCoverageDir = process.env.PLAYWRIGHT_COVERAGE_DIR ||
  path.join(repoRoot, 'tests', '.playwright-coverage');
const vitestCoveragePath = process.env.VITEST_COVERAGE_JSON ||
  path.join(repoRoot, 'tests', '.vitest-coverage', 'coverage-final.json');
const includeVitestCoverage = process.env.INCLUDE_VITEST_COVERAGE === '1' ||
  process.env.INCLUDE_VITEST_COVERAGE === 'true';
const requirePlaywrightCoverageShards = process.env.REQUIRE_PLAYWRIGHT_COVERAGE_SHARDS === '1' ||
  process.env.REQUIRE_PLAYWRIGHT_COVERAGE_SHARDS === 'true';
const sourceCache = new Map();

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

function canonicalFile(url) {
  let rel = cleanUrl(url);
  if (rel.startsWith('file://')) rel = fileURLToPath(rel);
  if (path.isAbsolute(rel)) {
    const fromRepo = path.relative(repoRoot, rel);
    if (!fromRepo.startsWith('..') && !path.isAbsolute(fromRepo)) {
      return fromRepo.split(path.sep).join('/');
    }
  }
  return rel.replace(/^\//, '');
}

function isAppSource(url) {
  const rel = canonicalFile(url);
  return /^js\/.*\.m?js$/.test(rel) ||
    /^api\/.*\.js$/.test(rel) ||
    rel === 'dev-server.js' ||
    rel === 'service-worker.js' ||
    rel === 'version.js';
}

function entrySource(entry) {
  return entry.text || entry.source || '';
}

function coverageFunctions(entry) {
  return entry.rawScriptCoverage?.functions || entry.functions || [];
}

function calledRanges(entry) {
  if (Array.isArray(entry.ranges)) {
    return entry.ranges.map(range => ({
      start: range.start ?? range.startOffset ?? 0,
      end: range.end ?? range.endOffset ?? 0,
    }));
  }
  return coverageFunctions(entry)
    .filter(fn => fn.functionName)
    .flatMap(fn => (fn.ranges || [])
      .filter(range => (range.count || 0) > 0)
      .map(range => ({
        start: range.start ?? range.startOffset ?? 0,
        end: range.end ?? range.endOffset ?? 0,
      })));
}

function sourceForFile(file) {
  if (sourceCache.has(file)) return sourceCache.get(file);
  let source = '';
  try {
    source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  } catch (_) {
    source = '';
  }
  sourceCache.set(file, source);
  return source;
}

function lineOffsets(source) {
  const offsets = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function locToOffset(source, loc, offsets = lineOffsets(source)) {
  if (!loc || !Number.isFinite(loc.line)) return 0;
  const lineIndex = Math.max(0, loc.line - 1);
  const lineStart = offsets[lineIndex] ?? source.length;
  return Math.min(source.length, Math.max(0, lineStart + (loc.column || 0)));
}

function locToRange(source, loc, offsets = lineOffsets(source)) {
  const start = locToOffset(source, loc?.start, offsets);
  const end = locToOffset(source, loc?.end, offsets);
  return end > start ? { start, end } : null;
}

function getFileMetrics(model, file, total = 0, source = null) {
  const metrics = model.get(file) || {
    file,
    total: 0,
    ranges: [],
    functions: new Map(),
    sources: new Set(),
  };
  metrics.total = Math.max(metrics.total, total);
  if (source) metrics.sources.add(source);
  model.set(file, metrics);
  return metrics;
}

function addCoveredRanges(metrics, ranges) {
  for (const range of ranges) {
    const start = Math.max(0, range.start ?? 0);
    const end = Math.max(start, range.end ?? 0);
    if (end > start) metrics.ranges.push({ start, end });
  }
}

function addFunction(metrics, key, name, called, matchByName = false) {
  let targetKey = key;
  if (!metrics.functions.has(targetKey) && matchByName) {
    const match = [...metrics.functions.entries()]
      .find(([, fn]) => fn.name === name);
    if (match) targetKey = match[0];
  }

  const existing = metrics.functions.get(targetKey);
  if (existing) {
    existing.called = existing.called || called;
    return;
  }

  metrics.functions.set(targetKey, { name, called: Boolean(called) });
}

function addBrowserEntriesToModel(model, entries) {
  const canonical = new Map();

  for (const entry of entries) {
    if (!isAppSource(entry.url)) continue;
    const file = canonicalFile(entry.url);
    const total = entrySource(entry).length || sourceForFile(file).length;
    if (!total) continue;

    const metrics = getFileMetrics(model, file, total, 'playwright');
    addCoveredRanges(metrics, calledRanges(entry));

    const prevCanonical = canonical.get(file);
    if (!prevCanonical || total > (entrySource(prevCanonical).length || sourceForFile(file).length)) {
      canonical.set(file, entry);
    }
  }

  for (const [file, entry] of canonical) {
    const metrics = getFileMetrics(model, file, entrySource(entry).length || sourceForFile(file).length, 'playwright');
    coverageFunctions(entry)
      .filter(fn => fn.functionName)
      .forEach((fn, index) => {
        const called = (fn.ranges || []).some(fnRange => (fnRange.count || 0) > 0);
        addFunction(metrics, `${fn.functionName}:${index}`, fn.functionName, called);
      });
  }

  for (const entry of entries) {
    if (!isAppSource(entry.url)) continue;
    const file = canonicalFile(entry.url);
    if (entry === canonical.get(file)) continue;
    const metrics = model.get(file);
    if (!metrics) continue;

    for (const fn of coverageFunctions(entry)) {
      const called = fn.functionName && (fn.ranges || []).some(fnRange => (fnRange.count || 0) > 0);
      if (!called) continue;
      const target = [...metrics.functions.values()]
        .find(candidate => candidate.name === fn.functionName && !candidate.called);
      if (target) target.called = true;
    }
  }
}

function readVitestCoverageModel() {
  if (!includeVitestCoverage) return null;
  if (!fs.existsSync(vitestCoveragePath)) return null;

  const coverage = JSON.parse(fs.readFileSync(vitestCoveragePath, 'utf8'));
  const model = new Map();

  for (const [coveragePath, fileCoverage] of Object.entries(coverage)) {
    const file = canonicalFile(fileCoverage.path || coveragePath);
    if (!isAppSource(file)) continue;

    const source = sourceForFile(file);
    if (!source) continue;
    const offsets = lineOffsets(source);
    const metrics = getFileMetrics(model, file, source.length, 'vitest');

    for (const [id, loc] of Object.entries(fileCoverage.statementMap || {})) {
      if (!((fileCoverage.s?.[id] || 0) > 0)) continue;
      const range = locToRange(source, loc, offsets);
      if (range) addCoveredRanges(metrics, [range]);
    }

    for (const [id, fn] of Object.entries(fileCoverage.fnMap || {})) {
      if (!fn.name) continue;
      const range = locToRange(source, fn.loc, offsets) || locToRange(source, fn.decl, offsets) || { start: 0, end: 0 };
      addFunction(metrics, `${fn.name}:${range.start}:${range.end}`, fn.name, (fileCoverage.f?.[id] || 0) > 0);
    }
  }

  return model;
}

function mergeCoverageModels(...models) {
  const combined = new Map();

  for (const model of models) {
    if (!model) continue;
    for (const [file, metrics] of model) {
      const target = getFileMetrics(combined, file, metrics.total);
      for (const source of metrics.sources) target.sources.add(source);
      addCoveredRanges(target, metrics.ranges);
      for (const [key, fn] of metrics.functions) {
        addFunction(target, key, fn.name, fn.called, true);
      }
    }
  }

  return combined;
}

function summarizeCoverageModel(model) {
  const rows = [...model.entries()].map(([file, metrics]) => {
    const fns = [...metrics.functions.values()];
    const fnCalled = fns.filter(fn => fn.called).length;
    const covered = Math.min(metrics.total, unionLength(metrics.ranges));
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
      sources: [...metrics.sources].sort(),
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

  return { globalFnPct, globalPct, totals, rows };
}

function printableTotals(label, report) {
  if (!report) return null;
  return [
    `  ${label} FUNCTIONS: ${report.totals.fnCalled.toLocaleString()} / ${report.totals.fnTotal.toLocaleString()} = ${report.globalFnPct.toFixed(2)}%`,
    `  ${label} BYTES:     ${report.totals.covered.toLocaleString()} / ${report.totals.total.toLocaleString()} = ${report.globalPct.toFixed(2)}%`,
  ];
}

function normalizeFixture(fixture) {
  if (Array.isArray(fixture)) return { name: fixture[0], path: fixture[1] };
  return fixture;
}

function readPlaywrightCoverageShards() {
  if (!fs.existsSync(playwrightCoverageDir)) return { entries: [], fixtures: [], files: [] };

  const files = fs.readdirSync(playwrightCoverageDir)
    .filter(file => file.endsWith('.json'))
    .sort();
  const entries = [];
  const fixtures = [];

  for (const file of files) {
    const shardPath = path.join(playwrightCoverageDir, file);
    const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
    const shardEntries = Array.isArray(shard.entries) ? shard.entries : [];
    entries.push(...shardEntries);
    fixtures.push({
      name: shard.titlePath?.slice(-1)[0] || shard.title || path.basename(file, '.json'),
      path: shard.file || path.relative(repoRoot, shardPath).split(path.sep).join('/'),
      label: shard.label || null,
      entryCount: shardEntries.length,
    });
  }

  return { entries, fixtures, files };
}

function enforceCoverageGate(report) {
  const minPct = Number.parseFloat(process.env.COVERAGE_MIN || '0');
  if (Number.isFinite(minPct) && minPct > 0 && report.globalFnPct < minPct) {
    throw new Error(`Coverage gate failed: function coverage ${report.globalFnPct.toFixed(2)}% is below COVERAGE_MIN=${minPct}.`);
  }
}

function writeCoverageReport(entries, fixtures, options = {}) {
  const playwrightModel = new Map();
  addBrowserEntriesToModel(playwrightModel, entries);
  const playwright = summarizeCoverageModel(playwrightModel);

  const vitestModel = readVitestCoverageModel();
  const vitest = vitestModel ? summarizeCoverageModel(vitestModel) : null;
  const combined = vitest
    ? summarizeCoverageModel(mergeCoverageModels(vitestModel, playwrightModel))
    : playwright;
  const runner = vitest ? 'vitest-playwright' : 'playwright';

  let priorFnPct = null;
  try {
    const prior = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (prior.runner === runner && Number.isFinite(prior.globalFnPct)) priorFnPct = prior.globalFnPct;
  } catch (_) {
    // First coverage run on this checkout.
  }

  fs.writeFileSync(jsonPath, JSON.stringify({
    runner,
    scope: vitest
      ? `app-source JavaScript covered by Vitest/Node V8 coverage plus ${options.playwrightScope || 'sampled Playwright Chromium fixtures'}`
      : `loaded app-source JavaScript from ${options.playwrightScope || 'sampled Playwright Chromium fixtures'}`,
    globalPct: combined.globalPct,
    globalFnPct: combined.globalFnPct,
    totals: combined.totals,
    fixtures: fixtures.map(normalizeFixture),
    rows: combined.rows,
    reports: {
      combined,
      playwright,
      vitest,
    },
    generatedAt: new Date().toISOString(),
  }, null, 2));

  console.log('\n' + '='.repeat(92));
  console.log(vitest
    ? '  COMBINED COVERAGE REPORT (Vitest/Node + Playwright; function coverage primary)'
    : '  PLAYWRIGHT COVERAGE REPORT (function coverage primary; byte coverage secondary)');
  console.log('='.repeat(92));
  console.log(['File'.padEnd(50), 'Fns'.padStart(6), 'Called'.padStart(8), 'Fn%'.padStart(8), 'Byte%'.padStart(10)].join(''));
  console.log('-'.repeat(92));
  for (const row of combined.rows.slice(0, 30)) {
    console.log([
      row.file.padEnd(50).slice(0, 50),
      String(row.fnTotal).padStart(6),
      String(row.fnCalled).padStart(8),
      `${row.fnPct.toFixed(1)}%`.padStart(8),
      `${row.pct.toFixed(1)}%`.padStart(10),
    ].join(''));
  }
  if (combined.rows.length > 30) console.log(`  ... ${combined.rows.length - 30} more files (full data in tests/.coverage.json)`);
  console.log('-'.repeat(92));
  if (vitest) {
    for (const line of printableTotals('PLAYWRIGHT', playwright)) console.log(line);
    for (const line of printableTotals('VITEST/NODE', vitest)) console.log(line);
  }
  for (const line of printableTotals('GLOBAL', combined)) console.log(line);
  if (priorFnPct != null) {
    const drift = combined.globalFnPct - priorFnPct;
    if (drift <= -0.5) console.log(`  DRIFT WARNING: function coverage dropped ${drift.toFixed(2)}pt vs prior run (${priorFnPct.toFixed(2)}% -> ${combined.globalFnPct.toFixed(2)}%)`);
    else if (drift >= 0.5) console.log(`  DELTA: +${drift.toFixed(2)}pt vs prior run (${priorFnPct.toFixed(2)}% -> ${combined.globalFnPct.toFixed(2)}%)`);
  }
  console.log('='.repeat(92));

  return combined;
}

async function main() {
  const suiteCoverage = readPlaywrightCoverageShards();
  if (suiteCoverage.files.length) {
    console.log(`Reading ${suiteCoverage.files.length} Playwright coverage shard(s) from ${path.relative(repoRoot, playwrightCoverageDir)}`);
    const report = writeCoverageReport(suiteCoverage.entries, suiteCoverage.fixtures, {
      playwrightScope: 'Playwright suite coverage shards',
    });
    enforceCoverageGate(report);
    return;
  }

  if (requirePlaywrightCoverageShards) {
    throw new Error(`No Playwright coverage shards found in ${playwrightCoverageDir}.`);
  }

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

    const report = writeCoverageReport(entries, COVERAGE_FIXTURES, {
      playwrightScope: 'sampled Playwright Chromium fixtures',
    });
    if (firstFailure) throw firstFailure;

    enforceCoverageGate(report);
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
