#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'strict-null-baseline.json');
const CONFIG_PATH = path.join(ROOT, 'tsconfig.json');

function validateBaseline(baseline) {
  if (!Number.isInteger(baseline.totalDiagnostics) || baseline.totalDiagnostics < 0) {
    return 'totalDiagnostics must be a non-negative integer';
  }
  if (!baseline.files || typeof baseline.files !== 'object' || Array.isArray(baseline.files)) {
    return 'files must be an object keyed by repository-relative path';
  }
  const fileTotal = Object.values(baseline.files)
    .reduce((sum, count) => sum + (Number.isInteger(count) ? count : Number.NaN), 0);
  if (!Number.isFinite(fileTotal) || fileTotal !== baseline.totalDiagnostics) {
    return `per-file total ${fileTotal} does not match totalDiagnostics ${baseline.totalDiagnostics}`;
  }
  return '';
}

function findRegressions(current, baseline) {
  const regressions = [];
  if (current.total > baseline.totalDiagnostics) {
    regressions.push(`total diagnostics ${current.total} exceed baseline ${baseline.totalDiagnostics}`);
  }
  for (const [file, count] of current.files) {
    const limit = baseline.files[file];
    if (limit === undefined) regressions.push(`${file}: ${count} new diagnostic${count === 1 ? '' : 's'}`);
    else if (count > limit) regressions.push(`${file}: ${count} diagnostics exceed baseline ${limit}`);
  }
  return regressions;
}

function collectStrictNullDiagnostics() {
  const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);
  if (configFile.error) return { configErrors: [configFile.error] };

  const config = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    ROOT,
    { noEmit: true, strictNullChecks: true },
    CONFIG_PATH,
  );
  if (config.errors.length > 0) return { configErrors: config.errors };

  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
    projectReferences: config.projectReferences,
  });
  const errors = ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  const files = new Map();
  const unscoped = [];
  for (const diagnostic of errors) {
    if (!diagnostic.file) {
      unscoped.push(diagnostic);
      continue;
    }
    const file = path.relative(ROOT, diagnostic.file.fileName).replaceAll(path.sep, '/');
    files.set(file, (files.get(file) || 0) + 1);
  }
  return {
    configErrors: [],
    files,
    total: [...files.values()].reduce((sum, count) => sum + count, 0),
    unscoped,
  };
}

function main() {
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    console.error(`Strict-null ratchet could not read ${path.relative(ROOT, BASELINE_PATH)}:`, error);
    process.exit(1);
  }

  const baselineError = validateBaseline(baseline);
  if (baselineError) {
    console.error(`Strict-null baseline is invalid: ${baselineError}`);
    process.exit(1);
  }

  const diagnostics = collectStrictNullDiagnostics();
  if (diagnostics.configErrors.length > 0) {
    console.error('Strict-null TypeScript configuration failed:');
    console.error(ts.formatDiagnostics(diagnostics.configErrors, {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => '\n',
    }));
    process.exit(1);
  }
  if (diagnostics.unscoped.length > 0) {
    console.error('Strict-null TypeScript run produced unscoped errors:');
    console.error(ts.formatDiagnostics(diagnostics.unscoped, {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => '\n',
    }));
    process.exit(1);
  }

  const regressions = findRegressions(diagnostics, baseline);
  if (regressions.length > 0) {
    console.error('Strict-null debt ratchet failed:');
    for (const regression of regressions) console.error(`  - ${regression}`);
    process.exit(1);
  }

  const fileCount = diagnostics.files.size;
  const improvement = baseline.totalDiagnostics - diagnostics.total;
  console.log(
    `Strict-null ratchet passed: ${diagnostics.total} diagnostics across ${fileCount} files `
      + `<= ${baseline.totalDiagnostics} baseline${improvement ? ` (-${improvement})` : ''}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();

export { findRegressions, validateBaseline };
