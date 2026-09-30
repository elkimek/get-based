#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isSourceFile, sourcePath } from './source-files.js';

type Counts = { lines: number; nonblank: number };
type Baseline = { commit: string; minimumReduction: number; totals: Counts; files: Record<string, Counts> };
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.css', '.html', '.py', '.sh']);

export function countLines(source: string): Counts {
  const lines = source ? source.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
  return { lines: lines.length, nonblank: lines.filter(line => line.trim()).length };
}

export function migrationProgress() {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/typescript-migration-baseline.json'), 'utf8')) as Baseline;
  const inventory = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
  const files = [...new Set(inventory)].filter(file => {
    const absolute = path.join(root, file);
    return file && !/^(vendor|docs|dist-docs)\//.test(file)
      && extensions.has(path.extname(file))
      && fs.existsSync(absolute) && sourcePath(absolute) === absolute;
  });
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
    reduction, minimumReduction: baseline.minimumReduction,
    authoredJavaScriptFiles: javascript.length, authoredTypeScriptFiles: typescript.length,
    migrated: javascript.length === 0,
    locTargetMet: Object.values(reduction).every(value => value >= baseline.minimumReduction),
    remainingRuntimeJavaScriptFiles: javascript.filter(file => isSourceFile(file) && /^(js|api|lib|server|shared|bin)\//.test(file)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const report = migrationProgress();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--check') && (!report.migrated || !report.locTargetMet)) process.exitCode = 1;
}
