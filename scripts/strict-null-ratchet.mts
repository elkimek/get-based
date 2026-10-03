#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-api';

// These unchecked views retain the original raw JSON/property/comparison behavior.
type BaselineReader = { totalDiagnostics: unknown; files: Record<string, unknown> };
type CurrentReader = { total: unknown; files: Iterable<readonly [string, unknown]> };
type ProgramOptionsReader = Omit<ts.CreateProgramOptions, 'projectReferences'> & { projectReferences: ts.CreateProgramOptions['projectReferences'] };
type StrictNullDiagnostics = { configErrors: readonly ts.Diagnostic[]; files: Map<string, number>; total: number; unscoped: ts.Diagnostic[] };

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'strict-null-baseline.json');
const CONFIG_PATH = path.join(ROOT, 'tsconfig.json');

function validateBaseline(baseline: unknown) {
  if (!Number.isInteger((baseline as BaselineReader).totalDiagnostics) || ((baseline as BaselineReader).totalDiagnostics as number) < 0) {
    return 'totalDiagnostics must be a non-negative integer';
  }
  if (!(baseline as BaselineReader).files || typeof (baseline as BaselineReader).files !== 'object' || Array.isArray((baseline as BaselineReader).files)) {
    return 'files must be an object keyed by repository-relative path';
  }
  const fileTotal = Object.values((baseline as BaselineReader).files)
    .reduce<number>((sum, count) => sum + (Number.isInteger(count) ? count as number : Number.NaN), 0);
  if (!Number.isFinite(fileTotal) || fileTotal !== (baseline as BaselineReader).totalDiagnostics) {
    return `per-file total ${fileTotal} does not match totalDiagnostics ${(baseline as BaselineReader).totalDiagnostics}`;
  }
  return '';
}

function findRegressions(current: unknown, baseline: unknown) {
  const regressions: string[] = [];
  if (((current as CurrentReader).total as number) > ((baseline as BaselineReader).totalDiagnostics as number)) {
    regressions.push(`total diagnostics ${(current as CurrentReader).total} exceed baseline ${(baseline as BaselineReader).totalDiagnostics}`);
  }
  for (const [file, count] of (current as CurrentReader).files) {
    const limit = (baseline as BaselineReader).files[file];
    if (limit === undefined) regressions.push(`${file}: ${count} new diagnostic${count === 1 ? '' : 's'}`);
    else if ((count as number) > (limit as number)) regressions.push(`${file}: ${count} diagnostics exceed baseline ${limit}`);
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

  const program = (ts.createProgram as (options: ProgramOptionsReader) => ts.Program)({
    rootNames: config.fileNames,
    options: config.options,
    projectReferences: config.projectReferences,
  });
  const errors = ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  const files = new Map<string, number>();
  const unscoped: ts.Diagnostic[] = [];
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
    total: [...files.values()].reduce<number>((sum, count) => sum + count, 0),
    unscoped,
  };
}

function main() {
  let baseline: unknown;
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
  if ((diagnostics as StrictNullDiagnostics).unscoped.length > 0) {
    console.error('Strict-null TypeScript run produced unscoped errors:');
    console.error(ts.formatDiagnostics((diagnostics as StrictNullDiagnostics).unscoped, {
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

  const fileCount = (diagnostics as StrictNullDiagnostics).files.size;
  const improvement = ((baseline as BaselineReader).totalDiagnostics as number) - (diagnostics as StrictNullDiagnostics).total;
  console.log(
    `Strict-null ratchet passed: ${(diagnostics as StrictNullDiagnostics).total} diagnostics across ${fileCount} files `
      + `<= ${(baseline as BaselineReader).totalDiagnostics} baseline${improvement ? ` (-${improvement})` : ''}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();

export { findRegressions, validateBaseline };
