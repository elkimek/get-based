#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'quality-baseline.json');
// tests/ is intentionally omitted; this check covers app JS only, not test helpers.
const SYNTAX_DIRS = ['js', 'api', 'lib', 'scripts'];
const APP_JS_DIR = path.join(ROOT, 'js');
const SERVER_JS_DIRS = [path.join(ROOT, 'api'), path.join(ROOT, 'lib')];
const ROOT_PRODUCTION_JS_FILES = [
  path.join(ROOT, 'dev-server.js'),
  path.join(ROOT, 'service-worker.js'),
  path.join(ROOT, 'service-worker-runtime.js'),
  path.join(ROOT, 'version.js'),
];
const TEST_JS_DIR = path.join(ROOT, 'tests');
const INLINE_EVENT_RE = /\bon(?:click|keydown|change|input|submit)=["']/g;
const WINDOW_REF_RE = /\bwindow(?:\.|\s*\[)/g;
const WINDOW_GLOBAL_ASSIGN_RE = /Object\.assign\(\s*window\b/g;
const VIEW_RUNTIME_LOOKUP_RE = /\bgetViewRuntimeFunction\s*\(/g;
const LAB_STATE_RE = /\b_labState\b/g;
const VIEW_RUNTIME_BRIDGE_FILE = 'js/views-runtime-bridge.js';
const LAB_STATE_GUARDRAIL_TEST_FILE = 'tests/test-quality-guardrails.js';
// Keep this value in sync with the baseline key name largeJsFilesOver800Lines.
const LARGE_FILE_LINE_LIMIT = 800;

let passed = 0;
let failed = 0;

function pass(message) {
  passed++;
  console.log(`  PASS: ${message}`);
}

function fail(message, detail = '') {
  failed++;
  console.log(`  FAIL: ${message}${detail ? ` — ${detail}` : ''}`);
}

function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function walkFiles(dir, extensions = new Set(['.js'])) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, extensions));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function repoRel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

function countMatches(source, re) {
  return (source.match(re) || []).length;
}

function collectAppMetrics() {
  const files = walkFiles(APP_JS_DIR, new Set(['.js']));
  let inlineEventAttributes = 0;
  let windowReferences = 0;
  let windowGlobalAssignments = 0;
  let legacyWindowGlobalAssignments = 0;
  let viewRuntimeBridgeConsumers = 0;
  let viewRuntimeBridgeLookups = 0;
  let labStateAppFiles = 0;
  const largeFiles = [];
  let largestFile = { file: '', lines: 0 };

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split('\n').length;
    const windowAssignmentCount = countMatches(source, WINDOW_GLOBAL_ASSIGN_RE);
    const viewRuntimeLookupCount = repoRel(file) === VIEW_RUNTIME_BRIDGE_FILE
      ? 0
      : countMatches(source, VIEW_RUNTIME_LOOKUP_RE);
    const labStateCount = countMatches(source, LAB_STATE_RE);
    inlineEventAttributes += countMatches(source, INLINE_EVENT_RE);
    windowReferences += countMatches(source, WINDOW_REF_RE);
    windowGlobalAssignments += windowAssignmentCount;
    if (!file.endsWith('-window-bindings.js')) legacyWindowGlobalAssignments += windowAssignmentCount;
    viewRuntimeBridgeLookups += viewRuntimeLookupCount;
    if (viewRuntimeLookupCount > 0) viewRuntimeBridgeConsumers++;
    if (labStateCount > 0) labStateAppFiles++;
    if (lines >= LARGE_FILE_LINE_LIMIT) largeFiles.push({ file: repoRel(file), lines });
    if (lines > largestFile.lines) largestFile = { file: repoRel(file), lines };
  }

  largeFiles.sort((a, b) => b.lines - a.lines);
  return {
    inlineEventAttributes,
    windowReferences,
    windowGlobalAssignments,
    legacyWindowGlobalAssignments,
    viewRuntimeBridgeConsumers,
    viewRuntimeBridgeLookups,
    labStateAppFiles,
    largeJsFilesOver800Lines: largeFiles.length,
    largestFile,
    largeFiles,
  };
}

function collectTestMetrics() {
  const files = walkFiles(TEST_JS_DIR, new Set(['.js']));
  let labStateTestFiles = 0;
  for (const file of files) {
    if (repoRel(file) === LAB_STATE_GUARDRAIL_TEST_FILE) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (countMatches(source, LAB_STATE_RE) > 0) labStateTestFiles++;
  }
  return { labStateTestFiles };
}

function collectOversizedProductionFiles() {
  const files = [
    ...walkFiles(APP_JS_DIR, new Set(['.js'])),
    ...SERVER_JS_DIRS.flatMap(dir => walkFiles(dir, new Set(['.js']))),
    ...ROOT_PRODUCTION_JS_FILES.filter(file => fs.existsSync(file)),
  ];
  return files
    .map(file => ({ file: repoRel(file), lines: fs.readFileSync(file, 'utf8').split('\n').length }))
    .filter(entry => entry.lines >= LARGE_FILE_LINE_LIMIT)
    .sort((a, b) => b.lines - a.lines);
}

function collectSyntaxFiles() {
  const files = [];
  const exts = new Set(['.js', '.mjs']);
  for (const dir of SYNTAX_DIRS) files.push(...walkFiles(path.join(ROOT, dir), exts));
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && exts.has(path.extname(entry.name))) files.push(path.join(ROOT, entry.name));
  }
  return [...new Set(files)].sort();
}

function syntaxCheck(files) {
  const errors = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
      errors.push(`${repoRel(file)}${output ? `\n${output}` : ''}`);
    }
  }
  if (errors.length) fail('all JS/MJS files parse with node --check', errors.slice(0, 5).join('\n\n'));
  else pass(`all JS/MJS files parse with node --check (${files.length} files)`);
}

function compareBudget(name, actual, baseline) {
  if (actual <= baseline) pass(`${name} stays within baseline (${actual}/${baseline})`);
  else fail(`${name} stays within baseline`, `${actual} > ${baseline}`);
}

function main() {
  console.log('=== Quality Guardrails ===\n');
  const baseline = readBaseline();
  const metrics = collectAppMetrics();
  const testMetrics = collectTestMetrics();
  const oversizedProductionFiles = collectOversizedProductionFiles();

  compareBudget('inline event attributes in js/', metrics.inlineEventAttributes, baseline.inlineEventAttributes);
  compareBudget('window global references in js/', metrics.windowReferences, baseline.windowReferences);
  compareBudget('window global assignments in js/', metrics.windowGlobalAssignments, baseline.windowGlobalAssignments);
  compareBudget('legacy window global assignments in js/', metrics.legacyWindowGlobalAssignments, baseline.legacyWindowGlobalAssignments);
  compareBudget('view runtime bridge consumer modules in js/', metrics.viewRuntimeBridgeConsumers, baseline.viewRuntimeBridgeConsumers);
  compareBudget('view runtime bridge lookups in js/', metrics.viewRuntimeBridgeLookups, baseline.viewRuntimeBridgeLookups);
  compareBudget('_labState files in js/', metrics.labStateAppFiles, baseline.labStateAppFiles);
  compareBudget('_labState files in tests/', testMetrics.labStateTestFiles, baseline.labStateTestFiles);
  compareBudget('large JS files (>=800 lines)', metrics.largeJsFilesOver800Lines, baseline.largeJsFilesOver800Lines);
  if (oversizedProductionFiles.length === 0) {
    pass('all first-party production JS files stay below 800 lines');
  } else {
    fail('all first-party production JS files stay below 800 lines',
      oversizedProductionFiles.map(entry => `${entry.file}: ${entry.lines}`).join(', '));
  }

  if (metrics.largestFile.lines <= baseline.maxJsFileLines) {
    pass(`largest JS file stays below hard cap (${metrics.largestFile.lines}/${baseline.maxJsFileLines}: ${metrics.largestFile.file})`);
  } else {
    fail('largest JS file stays below hard cap',
      `${metrics.largestFile.file} has ${metrics.largestFile.lines} lines > ${baseline.maxJsFileLines}`);
  }

  syntaxCheck(collectSyntaxFiles());

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
