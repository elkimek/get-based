#!/usr/bin/env node
// Playwright coverage reporter for Get Based.
//
// This intentionally runs after the normal test suite when COVERAGE=1 is set.
// It prefers coverage shards emitted by the Playwright suite and falls back to
// high-surface browser-script fixtures when no suite shards are available.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { runBrowserScript } from '../tests/playwright/browser-script-runner.js';
import { enforceFunctionCoverage, enforceFeatureCoverage, resolveCoverageMinimum } from './coverage-gate.mjs';
import { isProductionSource, productionSources, productionFunctionIndex, matchSourceFunction, summarizeFeatures } from './coverage-source.mjs';
import { renderCoverageMarkdown, renderCoverageHtml } from './coverage-report.mjs';
import {
  coverageEntryMatchesSource,
  coverageFunctionRange,
  isTopLevelScriptFunction,
} from './coverage-model-helpers.mjs';

import type { Browser, Page } from 'playwright';
import type { CoverageSourceFunction } from './coverage-source.mjs';
import type { CoverageMinimumReader, FeatureBaselineReader } from './coverage-gate.mjs';

// Private operation readers for unvalidated collector JSON; no validation is implied.
interface RawRange { start?: unknown; end?: unknown; startOffset?: unknown; endOffset?: unknown; count?: unknown; }
interface RawFunction { functionName?: unknown; ranges?: RawRange[] | null; }
interface RawEntry { url: unknown; text?: unknown; source?: unknown; ranges?: RawRange[]; functions?: RawFunction[]; rawScriptCoverage?: { functions?: RawFunction[] } | null; sourceHash?: unknown; sourceLength?: unknown; }
interface RawLoc { line?: unknown; column?: unknown; }
interface RawSpan { start?: RawLoc | null; end?: RawLoc | null; }
interface RawVitestFile { path?: unknown; statementMap?: Record<string, RawSpan>; s?: Record<string, unknown>; fnMap?: Record<string, { name?: unknown; loc?: RawSpan; decl?: RawSpan }>; f?: Record<string, unknown>; }
interface RawShard { entries?: RawEntry[]; titlePath?: { slice(start: number): unknown[] } | null; title?: unknown; file?: unknown; label?: unknown; }
interface CoverageRange { start: number; end: number; }
interface FileMetrics { file: string; total: number; ranges: CoverageRange[]; functionIndex: CoverageSourceFunction[]; thirdPartyFunctionIndex: CoverageSourceFunction[]; functions: Map<string, { name: string; called: boolean }>; unmappedFunctions: Set<string>; sources: Set<string>; }
type CoverageModel = Map<string, FileMetrics>;
type CoverageSummary = ReturnType<typeof summarizeCoverageModel>;
type BrowserScriptOptions = Parameters<typeof runBrowserScript>[2];
type BrowserFixture = [string, string, BrowserScriptOptions?];
interface FixtureReader { name?: unknown; path?: unknown; label?: unknown; entryCount?: number; }

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || '8000';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const jsonPath = path.join(repoRoot, 'tests', '.coverage.json');
const coverageBaselinePath = path.join(repoRoot, 'scripts', 'coverage-baseline.json');
const playwrightCoverageDir = process.env.PLAYWRIGHT_COVERAGE_DIR ||
  path.join(repoRoot, 'tests', '.playwright-coverage');
const vitestCoveragePath = process.env.VITEST_COVERAGE_JSON ||
  path.join(repoRoot, 'tests', '.vitest-coverage', 'coverage-final.json');
const includeVitestCoverage = process.env.INCLUDE_VITEST_COVERAGE === '1' ||
  process.env.INCLUDE_VITEST_COVERAGE === 'true';
const requirePlaywrightCoverageShards = process.env.REQUIRE_PLAYWRIGHT_COVERAGE_SHARDS === '1' ||
  process.env.REQUIRE_PLAYWRIGHT_COVERAGE_SHARDS === 'true';
const sourceCache = new Map<string, string>();

const COVERAGE_FIXTURES: BrowserFixture[] = [
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

function unionLength(ranges: readonly CoverageRange[]) {
  if (!ranges.length) return 0;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let covered = 0;
  let curStart = sorted[0]!.start;
  let curEnd = sorted[0]!.end;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.start <= curEnd) {
      curEnd = Math.max(curEnd, sorted[i]!.end);
    } else {
      covered += curEnd - curStart;
      curStart = sorted[i]!.start;
      curEnd = sorted[i]!.end;
    }
  }
  return covered + (curEnd - curStart);
}

function cleanUrl(url: unknown) {
  return ((url || '') as string).replace(/^https?:\/\/[^/]+/, '').split('?')[0]!;
}

function canonicalFile(url: unknown) {
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

function isAppSource(url: unknown) {
  const rel = canonicalFile(url);
  return isProductionSource(rel);
}

function entrySource(entry: RawEntry) {
  return entry.text || entry.source || '';
}

function coverageFunctions(entry: RawEntry) {
  return entry.rawScriptCoverage?.functions || entry.functions || [];
}

function calledRanges(entry: RawEntry) {
  if (Array.isArray(entry.ranges)) {
    return entry.ranges.map(range => ({
      start: range.start ?? range.startOffset ?? 0,
      end: range.end ?? range.endOffset ?? 0,
    }));
  }
  return coverageFunctions(entry)
    .filter(fn => fn.functionName)
    .flatMap(fn => (fn.ranges || [])
      .filter(range => ((range.count || 0) as number) > 0)
      .map(range => ({
        start: range.start ?? range.startOffset ?? 0,
        end: range.end ?? range.endOffset ?? 0,
      })));
}

function sourceForFile(file: string) {
  if (sourceCache.has(file)) return sourceCache.get(file)!;
  let source = '';
  try {
    source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  } catch (_) {
    source = '';
  }
  sourceCache.set(file, source);
  return source;
}

function matchesRepositorySource(entry: RawEntry) {
  const file = canonicalFile(entry.url);
  return coverageEntryMatchesSource(entry, sourceForFile(file));
}

function lineOffsets(source: string) {
  const offsets = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function locToOffset(source: string, loc: RawLoc | null | undefined, offsets = lineOffsets(source)) {
  if (!loc || !Number.isFinite(loc.line)) return 0;
  const lineIndex = Math.max(0, (loc.line as number) - 1);
  const lineStart = offsets[lineIndex] ?? source.length;
  return Math.min(source.length, Math.max(0, lineStart + ((loc.column || 0) as number)));
}

function locToRange(source: string, loc: RawSpan | null | undefined, offsets = lineOffsets(source)) {
  const start = locToOffset(source, loc?.start, offsets);
  const end = locToOffset(source, loc?.end, offsets);
  return end > start ? { start, end } : null;
}

function getFileMetrics(model: CoverageModel, file: string, total: unknown = 0, source: string | null = null): FileMetrics {
  const index = model.has(file) ? null : productionFunctionIndex(sourceForFile(file), file, repoRoot);
  const metrics: FileMetrics = model.get(file) || {
    file,
    total: 0,
    ranges: [],
    functionIndex: index!.owned,
    thirdPartyFunctionIndex: index!.thirdParty,
    functions: new Map(index!.owned.map(fn => [`${fn.start}:${fn.end}`, { name: fn.name, called: false }])),
    unmappedFunctions: new Set<string>(),
    sources: new Set<string>(),
  };
  metrics.total = Math.max(metrics.total, total as number);
  if (source) metrics.sources.add(source);
  model.set(file, metrics);
  return metrics;
}

function addCoveredRanges(metrics: FileMetrics, ranges: readonly RawRange[]) {
  for (const range of ranges) {
    const start = Math.max(0, (range.start ?? 0) as number);
    const end = Math.max(start, (range.end ?? 0) as number);
    if (end > start) metrics.ranges.push({ start, end });
  }
}

function addFunction(metrics: FileMetrics, key: string, name: unknown, called: boolean, collector = 'v8') {
  const [start, end] = key.split(':').map(Number);
  if (matchSourceFunction(metrics.thirdPartyFunctionIndex, start!, end!, collector)) return;
  const sourceFunction = matchSourceFunction(metrics.functionIndex, start!, end!, collector);
  const targetKey = sourceFunction ? `${sourceFunction.start}:${sourceFunction.end}` : key;
  const existing = metrics.functions.get(targetKey);
  if (existing) {
    existing.called = existing.called || called;
    return;
  }

  // Compiler-generated functions and mismatched source ranges must not merge
  // unrelated callbacks by name. Surface unmatched executed ranges for review.
  if (called) metrics.unmappedFunctions.add(`${key} ${name}`);
}

function addBrowserEntriesToModel(model: CoverageModel, entries: readonly RawEntry[]) {
  const canonical = new Map<string, RawEntry>();

  for (const entry of entries) {
    if (!isAppSource(entry.url) || !matchesRepositorySource(entry)) continue;
    const file = canonicalFile(entry.url);
    const total = (entrySource(entry) as { length?: number }).length || sourceForFile(file).length;
    if (!total) continue;

    const metrics = getFileMetrics(model, file, total, 'playwright');
    addCoveredRanges(metrics, calledRanges(entry));

    const prevCanonical = canonical.get(file);
    if (!prevCanonical || total > ((entrySource(prevCanonical) as { length?: number }).length || sourceForFile(file).length)) {
      canonical.set(file, entry);
    }
  }

  for (const [file, entry] of canonical) {
    const metrics = getFileMetrics(model, file, (entrySource(entry) as { length?: number }).length || sourceForFile(file).length, 'playwright');
    coverageFunctions(entry)
      .forEach((fn, index) => {
        const range = (coverageFunctionRange as (fn: RawFunction) => { start: unknown; end: unknown } | null)(fn);
        if (!range || (isTopLevelScriptFunction as (fn: RawFunction, index: number, total: number) => boolean)(fn, index, metrics.total)) return;
        const called = (fn.ranges || []).some(fnRange => ((fnRange.count || 0) as number) > 0);
        addFunction(
          metrics,
          `${range.start}:${range.end}`,
          fn.functionName || `(anonymous_${index - 1})`,
          called,
        );
      });
  }

  for (const entry of entries) {
    if (!isAppSource(entry.url) || !matchesRepositorySource(entry)) continue;
    const file = canonicalFile(entry.url);
    if (entry === canonical.get(file)) continue;
    const metrics = model.get(file);
    if (!metrics) continue;

    for (const [index, fn] of coverageFunctions(entry).entries()) {
      const range = (coverageFunctionRange as (fn: RawFunction) => { start: unknown; end: unknown } | null)(fn);
      if (!range || (isTopLevelScriptFunction as (fn: RawFunction, index: number, total: number) => boolean)(fn, index, metrics.total)) continue;
      const called = (fn.ranges || []).some(fnRange => ((fnRange.count || 0) as number) > 0);
      if (!called) continue;
      addFunction(
        metrics,
        `${range.start}:${range.end}`,
        fn.functionName || `(anonymous_${index - 1})`,
        true,
      );
    }
  }
}

function readVitestCoverageModel() {
  if (!includeVitestCoverage) return null;
  if (!fs.existsSync(vitestCoveragePath)) throw new Error(`Required Vitest coverage is missing: ${vitestCoveragePath}`);

  const coverage = JSON.parse(fs.readFileSync(vitestCoveragePath, 'utf8')) as Record<string, RawVitestFile>;
  const model: CoverageModel = new Map();
  // Include never-imported runtime modules in the denominator, independently
  // of collector behavior or test discovery.
  for (const file of productionSources(repoRoot, { runtime: true })) getFileMetrics(model, file, sourceForFile(file).length);

  for (const [coveragePath, fileCoverage] of Object.entries(coverage)) {
    const file = canonicalFile(fileCoverage.path || coveragePath);
    if (!isAppSource(file)) continue;

    const source = sourceForFile(file);
    if (!source) continue;
    const offsets = lineOffsets(source);
    const metrics = getFileMetrics(model, file, source.length, 'vitest');

    for (const [id, loc] of Object.entries(fileCoverage.statementMap || {})) {
      if (!(((fileCoverage.s?.[id] || 0) as number) > 0)) continue;
      const range = locToRange(source, loc, offsets);
      if (range) addCoveredRanges(metrics, [range]);
    }

    for (const [id, fn] of Object.entries(fileCoverage.fnMap || {})) {
      if (!fn.name) continue;
      const range = locToRange(source, fn.loc, offsets) || locToRange(source, fn.decl, offsets) || { start: 0, end: 0 };
      addFunction(metrics, `${range.start}:${range.end}`, fn.name, ((fileCoverage.f?.[id] || 0) as number) > 0, 'istanbul');
    }
  }

  return model;
}

function mergeCoverageModels(...models: Array<CoverageModel | null>) {
  const combined: CoverageModel = new Map();

  for (const model of models) {
    if (!model) continue;
    for (const [file, metrics] of model) {
      const target = getFileMetrics(combined, file, metrics.total);
      for (const source of metrics.sources) target.sources.add(source);
      addCoveredRanges(target, metrics.ranges);
      for (const [key, fn] of metrics.functions) {
        addFunction(target, key, fn.name, fn.called);
      }
      for (const entry of metrics.unmappedFunctions) target.unmappedFunctions.add(entry);
    }
  }

  return combined;
}

function summarizeCoverageModel(model: CoverageModel) {
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
      unmappedCalledFunctions: [...metrics.unmappedFunctions].sort(),
      thirdPartyFunctions: metrics.thirdPartyFunctionIndex.length,
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

function printableTotals(label: string, report: CoverageSummary | null) {
  if (!report) return null;
  return [
    `  ${label} FUNCTIONS: ${report.totals.fnCalled.toLocaleString()} / ${report.totals.fnTotal.toLocaleString()} = ${report.globalFnPct.toFixed(2)}%`,
    `  ${label} BYTES:     ${report.totals.covered.toLocaleString()} / ${report.totals.total.toLocaleString()} = ${report.globalPct.toFixed(2)}%`,
  ];
}

function normalizeFixture(fixture: BrowserFixture | FixtureReader) {
  if (Array.isArray(fixture)) return { name: fixture[0], path: fixture[1] };
  return fixture;
}

function readPlaywrightCoverageShards() {
  if (!fs.existsSync(playwrightCoverageDir)) return { entries: [], fixtures: [], files: [], unreadable: [] };

  const files = fs.readdirSync(playwrightCoverageDir)
    .filter(file => file.endsWith('.json'))
    .sort();
  const entries: RawEntry[] = [];
  const fixtures: FixtureReader[] = [];
  const unreadable: Array<{ file: string; error: unknown }> = [];

  for (const file of files) {
    const shardPath = path.join(playwrightCoverageDir, file);
    let shard: RawShard;
    try {
      shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
    } catch (error) {
      unreadable.push({ file, error: (error as { message?: unknown }).message });
      continue;
    }
    const shardEntries = Array.isArray(shard.entries) ? shard.entries : [];
    entries.push(...shardEntries);
    fixtures.push({
      name: shard.titlePath?.slice(-1)[0] || shard.title || path.basename(file, '.json'),
      path: shard.file || path.relative(repoRoot, shardPath).split(path.sep).join('/'),
      label: shard.label || null,
      entryCount: shardEntries.length,
    });
  }

  return { entries, fixtures, files, unreadable };
}

function enforceCoverageGate(report: CoverageSummary) {
  const baseline = JSON.parse(fs.readFileSync(coverageBaselinePath, 'utf8')) as CoverageMinimumReader & FeatureBaselineReader;
  const gate = resolveCoverageMinimum({
    baseline,
    envValue: process.env.COVERAGE_MIN,
  });
  const result = enforceFunctionCoverage(report.globalFnPct, gate);
  const features = enforceFeatureCoverage(summarizeFeatures(report.rows), baseline);
  console.log(`Feature coverage gates passed: ${features.length} features.`);
  console.log(
    `Coverage ratchet passed: ${result.actual.toFixed(2)}% functions `
    + `>= ${result.minimum.toFixed(2)}% (${gate.source}; +${result.margin.toFixed(2)}pt).`,
  );
}

function writeCoverageReport(entries: readonly RawEntry[], fixtures: readonly (BrowserFixture | FixtureReader)[], options: { playwrightScope?: string } = {}) {
  const playwrightModel: CoverageModel = new Map();
  addBrowserEntriesToModel(playwrightModel, entries);
  const playwright = summarizeCoverageModel(playwrightModel);

  const vitestModel = readVitestCoverageModel();
  const vitest = vitestModel ? summarizeCoverageModel(vitestModel) : null;
  const combined = vitest
    ? summarizeCoverageModel(mergeCoverageModels(vitestModel, playwrightModel))
    : playwright;
  const runner = vitest ? 'vitest-playwright' : 'playwright';

  let priorFnPct: number | null = null;
  try {
    const prior = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { runner?: unknown; globalFnPct?: unknown };
    if (prior.runner === runner && Number.isFinite(prior.globalFnPct)) priorFnPct = prior.globalFnPct as number;
  } catch (_) {
    // First coverage run on this checkout.
  }

  const report = {
    schemaVersion: 2,
    functionIdentity: 'source AST ranges (includes never-loaded production modules)',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }).trim()),
    ciRunUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    runner,
    scope: vitest
      ? `app-source JavaScript covered by Vitest/Node V8 coverage plus ${options.playwrightScope || 'sampled Playwright Chromium fixtures'}`
      : `loaded app-source JavaScript from ${options.playwrightScope || 'sampled Playwright Chromium fixtures'}`,
    globalPct: combined.globalPct,
    globalFnPct: combined.globalFnPct,
    totals: combined.totals,
    fixtures: fixtures.map(normalizeFixture),
    rows: combined.rows,
    features: summarizeFeatures(combined.rows),
    reports: {
      combined,
      playwright,
      vitest,
    },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(repoRoot, 'tests', '.coverage.md'), renderCoverageMarkdown(report));
  fs.writeFileSync(path.join(repoRoot, 'tests', '.coverage.html'), renderCoverageHtml(report));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderCoverageMarkdown(report));

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
    for (const line of printableTotals('PLAYWRIGHT', playwright)!) console.log(line);
    for (const line of printableTotals('VITEST/NODE', vitest)!) console.log(line);
  }
  for (const line of printableTotals('GLOBAL', combined)!) console.log(line);
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
    for (const { file, error } of suiteCoverage.unreadable) {
      console.warn(`  Warning: skipping unreadable coverage shard ${file}: ${error}`);
    }
    if (!suiteCoverage.fixtures.length && requirePlaywrightCoverageShards) {
      throw new Error(`No readable Playwright coverage shards found in ${playwrightCoverageDir}.`);
    }
    console.log(`Reading ${suiteCoverage.fixtures.length} readable Playwright coverage shard(s) from ${path.relative(repoRoot, playwrightCoverageDir)}`);
    const report = writeCoverageReport(suiteCoverage.entries, suiteCoverage.fixtures, {
      playwrightScope: 'Playwright suite coverage shards',
    });
    enforceCoverageGate(report);
    return;
  }

  if (requirePlaywrightCoverageShards) {
    throw new Error(`No Playwright coverage shards found in ${playwrightCoverageDir}.`);
  }

  let browser: Browser | null = null;
  try {
    browser = await (chromium.launch as (options: Omit<NonNullable<Parameters<typeof chromium.launch>[0]>, 'executablePath'> & { executablePath?: string | undefined }) => ReturnType<typeof chromium.launch>)({
      headless: true,
      executablePath: chromiumExecutable || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    await smokeTestApp(browser);

    const entries: RawEntry[] = [];
    let firstFailure: unknown = null;
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

async function smokeTestApp(browser: Browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    const response = await page.goto('/app', { waitUntil: 'load', timeout: 15_000 });
    if (!response?.ok()) throw new Error(`GET /app returned ${response?.status() || 'no response'}`);
  } catch (error) {
    console.error(`Cannot connect to ${BASE_URL}/app: ${(error as { message?: unknown }).message}`);
    console.error(`Start it with: node dev-server.js ${PORT}`);
    (error as { exitCode?: number }).exitCode = 2;
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function runCoverageFixture(browser: Browser, testPath: string, options: BrowserScriptOptions) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  let entries: Awaited<ReturnType<Page['coverage']['stopJSCoverage']>> = [];
  let failure: unknown = null;

  page.on('pageerror', error => {
    pageErrors.push(error?.message || String(error));
  });

  try {
    await (page.coverage.startJSCoverage as (options: NonNullable<Parameters<Page['coverage']['startJSCoverage']>[0]> & { includeRawScriptCoverage: boolean }) => ReturnType<Page['coverage']['startJSCoverage']>)({
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
  console.error((error as { stack?: unknown } | null | undefined)?.stack || (error as { message?: unknown } | null | undefined)?.message || String(error));
  process.exit(((error as { exitCode?: unknown } | null | undefined)?.exitCode || 1) as number);
});
