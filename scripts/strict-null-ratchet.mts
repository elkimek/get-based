#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, DiagnosticCategory, type Diagnostic } from 'typescript/unstable/sync';

// These unchecked views retain the original raw JSON/property/comparison behavior.
type BaselineReader = { totalDiagnostics: unknown; files: Record<string, unknown> };
type CurrentReader = { total: unknown; files: Iterable<readonly [string, unknown]> };
type StrictNullDiagnostics = { configErrors: readonly Diagnostic[]; files: Map<string, number>; total: number; unscoped: Diagnostic[] };

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

/** Preserve the legacy ratchet's two overrides through native config inheritance. */
function collectStrictNullDiagnostics(configPath = CONFIG_PATH): StrictNullDiagnostics {
  const config = path.resolve(configPath);
  const rootDir = path.dirname(config);
  const overlay = path.join(rootDir, '__getbased_strict_null__.json');
  const contents = JSON.stringify({ extends: config, compilerOptions: { noEmit: true, strictNullChecks: true } });
  const api = new API({ cwd: rootDir, fs: {
    readFile: file => file === overlay ? contents : undefined,
    fileExists: file => file === overlay ? true : undefined,
  } });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [overlay] });
    try {
      const project = snapshot.getProject(overlay);
      if (!project) throw new Error('Strict-null native project was not created');
      const configErrors = project.program.getConfigFileParsingDiagnostics();
      const files = new Map<string, number>();
      const unscoped: Diagnostic[] = [];
      if (configErrors.length) return { configErrors, files, total: 0, unscoped };
      const errors = [
        ...project.program.getProgramDiagnostics(),
        ...project.program.getGlobalDiagnostics(),
        ...project.program.getSyntacticDiagnostics(),
        ...project.program.getSemanticDiagnostics(),
      ].filter(diagnostic => diagnostic.category === DiagnosticCategory.Error);
      // The native API exposes overlapping diagnostic phases. Retain every
      // distinct error while counting each complete SDK diagnostic once.
      const distinct = new Map<string, Diagnostic>();
      for (const diagnostic of errors) distinct.set(JSON.stringify(diagnostic), diagnostic);
      for (const diagnostic of distinct.values()) {
        if (!diagnostic.fileName) { unscoped.push(diagnostic); continue; }
        const file = path.relative(rootDir, diagnostic.fileName).replaceAll(path.sep, '/');
        files.set(file, (files.get(file) || 0) + 1);
      }
      return { configErrors: [], files, total: [...files.values()].reduce((sum, count) => sum + count, 0), unscoped };
    } finally { snapshot.dispose(); }
  } finally { api.close(); }
}

function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  const lines: string[] = [];
  function append(diagnostic: Diagnostic, depth = 0): void {
    const location = diagnostic.fileName ? path.relative(ROOT, diagnostic.fileName) + ':' + diagnostic.pos + ': ' : '';
    lines.push('  '.repeat(depth) + location + 'error TS' + diagnostic.code + ': ' + diagnostic.text);
    for (const next of diagnostic.messageChain || []) append(next, depth + 1);
  }
  for (const diagnostic of diagnostics) append(diagnostic);
  return lines.join('\n') + '\n';
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
    console.error(formatDiagnostics(diagnostics.configErrors));
    process.exit(1);
  }
  if ((diagnostics as StrictNullDiagnostics).unscoped.length > 0) {
    console.error('Strict-null TypeScript run produced unscoped errors:');
    console.error(formatDiagnostics((diagnostics as StrictNullDiagnostics).unscoped));
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

export { collectStrictNullDiagnostics, findRegressions, validateBaseline };
