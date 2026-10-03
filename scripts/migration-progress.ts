#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isSourceFile } from './source-files.js';

type Counts = { lines: number; nonblank: number };
type Baseline = { commit: string; totals: Counts };
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.css', '.html', '.py', '.sh']);

export function countLines(source: string): Counts {
  const lines = source ? source.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
  return { lines: lines.length, nonblank: lines.filter(line => line.trim()).length };
}

/** Count every Git-inventoried authored file; ignored compiler output never enters this inventory. */
export function migrationSourceFiles(root: string, inventory: readonly string[]): string[] {
  return [...new Set(inventory)].filter(file => {
    const absolute = path.join(root, file);
    return file && !/^(vendor|docs|dist-docs)\//.test(file)
      && extensions.has(path.extname(file))
      && fs.existsSync(absolute);
  });
}

export function migrationProgress() {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/typescript-migration-baseline.json'), 'utf8')) as Baseline;
  const inventory = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
  const files = migrationSourceFiles(root, inventory);
  const totals = files.reduce((sum, file) => {
    const counts = countLines(fs.readFileSync(path.join(root, file), 'utf8'));
    return { lines: sum.lines + counts.lines, nonblank: sum.nonblank + counts.nonblank };
  }, { lines: 0, nonblank: 0 });
  const javascript = files.filter(file => /\.[cm]?js$/.test(file));
  const typescript = files.filter(file => /\.[cm]?ts$/.test(file) && !/\.d\.[cm]?ts$/.test(file));
  const reduction = {
    lines: 1 - totals.lines / baseline.totals.lines,
    nonblank: 1 - totals.nonblank / baseline.totals.nonblank,
  };
  return { baselineCommit: baseline.commit, baseline: baseline.totals, current: totals,
    reduction,
    authoredJavaScriptFiles: javascript.length, authoredTypeScriptFiles: typescript.length,
    migrated: javascript.length === 0,
    remainingRuntimeJavaScriptFiles: javascript.filter(file => isSourceFile(file) && /^(js|api|lib|server|shared|bin)\//.test(file)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const report = migrationProgress();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--check') && !report.migrated) process.exitCode = 1;
}
