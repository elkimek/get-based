#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'quality-baseline.json');
const GITHUB_AUTOMATION_DIR = path.join(ROOT, '.github');
// tests/ is intentionally omitted; this check covers app JS only, not test helpers.
const SYNTAX_DIRS = ['js', 'api', 'lib', 'server', 'scripts'];
const APP_JS_DIR = path.join(ROOT, 'js');
const SERVER_JS_DIRS = [path.join(ROOT, 'api'), path.join(ROOT, 'lib'), path.join(ROOT, 'server')];
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
const PRIVACY_CRITICAL_LOG_FILES = [
  'js/pdf-import.js',
  'js/pdf-import-file-handlers.js',
  'js/pii.js',
  'js/pii-review.js',
  'js/sync-diagnostics-snapshot.js',
];
const CONSOLE_REFERENCE_RE = /\bconsole\b/g;
const SYNC_DIAGNOSTIC_FILES = [
  'js/sync-diagnostics-snapshot.js',
  'js/sync-diagnostics-text.js',
  'js/sync-diagnose-render.js',
];
const RECOVERY_PHRASE_FRAGMENT_RE = /\bmnemonicPrefix\b|\bmnemonic\s*(?:\?\.|\.)\s*split\s*\(/g;
const UNBOUNDED_SYNC_DIAGNOSTIC_ERROR_RE = /\b(?:getErrorMessage|rowsError)\b/g;
const WORKFLOW_USES_RE = /^\s*(?:-\s*)?uses:\s*["']?([^"'#\s]+)["']?/;
const IMMUTABLE_ACTION_SHA_RE = /^[0-9a-f]{40}$/;
// Keep this value in sync with the baseline key name largeJsFilesOver800Lines.
const LARGE_FILE_LINE_LIMIT = 800;
// Track files that crowd the hard cap so splitting one cannot be offset by
// quietly growing another module to the same boundary.
const NEAR_CAP_FILE_LINE_LIMIT = 790;

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

function countSourceLines(source) {
  if (!source) return 0;
  const lines = source.split('\n').length;
  return source.endsWith('\n') ? lines - 1 : lines;
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
  const nearCapFiles = [];
  let largestFile = { file: '', lines: 0 };

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const lines = countSourceLines(source);
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
    if (lines >= NEAR_CAP_FILE_LINE_LIMIT) nearCapFiles.push({ file: repoRel(file), lines });
    if (lines > largestFile.lines) largestFile = { file: repoRel(file), lines };
  }

  largeFiles.sort((a, b) => b.lines - a.lines);
  nearCapFiles.sort((a, b) => b.lines - a.lines);
  return {
    inlineEventAttributes,
    windowReferences,
    windowGlobalAssignments,
    legacyWindowGlobalAssignments,
    viewRuntimeBridgeConsumers,
    viewRuntimeBridgeLookups,
    labStateAppFiles,
    largeJsFilesOver800Lines: largeFiles.length,
    nearCapJsFilesAtLeast790Lines: nearCapFiles.length,
    largestFile,
    largeFiles,
    nearCapFiles,
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
    .map(file => ({ file: repoRel(file), lines: countSourceLines(fs.readFileSync(file, 'utf8')) }))
    .filter(entry => entry.lines >= LARGE_FILE_LINE_LIMIT)
    .sort((a, b) => b.lines - a.lines);
}

function collectPrivacyConsoleViolations() {
  const violations = [];
  for (const relativeFile of PRIVACY_CRITICAL_LOG_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    const matches = [...source.matchAll(CONSOLE_REFERENCE_RE)];
    if (matches.length > 0) {
      violations.push({ file: relativeFile, count: matches.length });
    }
  }
  return violations;
}

function collectRecoveryPhraseDiagnosticViolations() {
  const violations = [];
  for (const relativeFile of SYNC_DIAGNOSTIC_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    const matches = [...source.matchAll(RECOVERY_PHRASE_FRAGMENT_RE)];
    if (matches.length > 0) {
      violations.push({ file: relativeFile, count: matches.length });
    }
  }
  return violations;
}

function collectUnboundedSyncDiagnosticErrors() {
  const violations = [];
  for (const relativeFile of SYNC_DIAGNOSTIC_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    const matches = [...source.matchAll(UNBOUNDED_SYNC_DIAGNOSTIC_ERROR_RE)];
    if (matches.length > 0) {
      violations.push({ file: relativeFile, count: matches.length });
    }
  }
  return violations;
}

function collectMutableWorkflowActionRefs() {
  const violations = [];
  const workflowFiles = walkFiles(GITHUB_AUTOMATION_DIR, new Set(['.yml', '.yaml']));
  for (const file of workflowFiles) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const uses = line.match(WORKFLOW_USES_RE)?.[1] || '';
      if (!uses || uses.startsWith('./')) return;
      const separator = uses.lastIndexOf('@');
      const ref = separator >= 0 ? uses.slice(separator + 1) : '';
      if (!IMMUTABLE_ACTION_SHA_RE.test(ref)) {
        violations.push({ file: repoRel(file), line: index + 1, uses });
      }
    });
  }
  return violations;
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
  const privacyConsoleViolations = collectPrivacyConsoleViolations();
  const recoveryPhraseDiagnosticViolations = collectRecoveryPhraseDiagnosticViolations();
  const unboundedSyncDiagnosticErrors = collectUnboundedSyncDiagnosticErrors();
  const mutableWorkflowActionRefs = collectMutableWorkflowActionRefs();

  compareBudget('inline event attributes in js/', metrics.inlineEventAttributes, baseline.inlineEventAttributes);
  compareBudget('window global references in js/', metrics.windowReferences, baseline.windowReferences);
  compareBudget('window global assignments in js/', metrics.windowGlobalAssignments, baseline.windowGlobalAssignments);
  compareBudget('legacy window global assignments in js/', metrics.legacyWindowGlobalAssignments, baseline.legacyWindowGlobalAssignments);
  compareBudget('view runtime bridge consumer modules in js/', metrics.viewRuntimeBridgeConsumers, baseline.viewRuntimeBridgeConsumers);
  compareBudget('view runtime bridge lookups in js/', metrics.viewRuntimeBridgeLookups, baseline.viewRuntimeBridgeLookups);
  compareBudget('_labState files in js/', metrics.labStateAppFiles, baseline.labStateAppFiles);
  compareBudget('_labState files in tests/', testMetrics.labStateTestFiles, baseline.labStateTestFiles);
  compareBudget('large JS files (>=800 lines)', metrics.largeJsFilesOver800Lines, baseline.largeJsFilesOver800Lines);
  compareBudget(
    'near-cap JS files (>=790 lines)',
    metrics.nearCapJsFilesAtLeast790Lines,
    baseline.nearCapJsFilesAtLeast790Lines,
  );
  if (oversizedProductionFiles.length === 0) {
    pass('all first-party production JS files stay below 800 lines');
  } else {
    fail('all first-party production JS files stay below 800 lines',
      oversizedProductionFiles.map(entry => `${entry.file}: ${entry.lines}`).join(', '));
  }
  if (privacyConsoleViolations.length === 0) {
    pass('privacy-critical workflows avoid direct console logging');
  } else {
    fail('privacy-critical workflows avoid direct console logging',
      privacyConsoleViolations.map(entry => `${entry.file}: ${entry.count}`).join(', '));
  }
  if (recoveryPhraseDiagnosticViolations.length === 0) {
    pass('support diagnostics never expose recovery-phrase fragments');
  } else {
    fail('support diagnostics never expose recovery-phrase fragments',
      recoveryPhraseDiagnosticViolations.map(entry => `${entry.file}: ${entry.count}`).join(', '));
  }
  if (unboundedSyncDiagnosticErrors.length === 0) {
    pass('support diagnostics use bounded sync-error status');
  } else {
    fail('support diagnostics use bounded sync-error status',
      unboundedSyncDiagnosticErrors.map(entry => `${entry.file}: ${entry.count}`).join(', '));
  }
  if (mutableWorkflowActionRefs.length === 0) {
    pass('third-party GitHub Actions use immutable commit SHAs');
  } else {
    fail('third-party GitHub Actions use immutable commit SHAs',
      mutableWorkflowActionRefs.map(entry => `${entry.file}:${entry.line} ${entry.uses}`).join(', '));
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
