#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isSourceFile } from './source-files.js';
import { projectOwnedVendorFiles, readVendorManifest } from './project-owned-vendor.mjs';

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
  const ownedVendor = projectOwnedVendorFiles(readVendorManifest(root), inventory);
  return [...new Set(inventory)].filter(file => {
    const absolute = path.join(root, file);
    return file && !/^(docs|dist-docs)\//.test(file)
      && (!file.startsWith('vendor/') || ownedVendor.has(file))
      && extensions.has(path.extname(file))
      && fs.existsSync(absolute);
  });
}

function countSourceLines(root: string, files: readonly string[]): Counts {
  return files.reduce((sum, file) => {
    const counts = countLines(fs.readFileSync(path.join(root, file), 'utf8'));
    return { lines: sum.lines + counts.lines, nonblank: sum.nonblank + counts.nonblank };
  }, { lines: 0, nonblank: 0 });
}

/** The fixed LOC baseline excludes vendor; first-party vendor counts are explicit and separate. */
export function buildMigrationProgress(root: string, inventory: readonly string[], baseline: Baseline) {
  const files = migrationSourceFiles(root, inventory);
  const ownedVendorFiles = files.filter(file => file.startsWith('vendor/'));
  const totals = countSourceLines(root, files.filter(file => !file.startsWith('vendor/')));
  const ownedVendorTotals = countSourceLines(root, ownedVendorFiles);
  const javascript = files.filter(file => /\.[cm]?js$/.test(file));
  const typescript = files.filter(file => /\.[cm]?ts$/.test(file) && !/\.d\.[cm]?ts$/.test(file));
  const reduction = {
    lines: 1 - totals.lines / baseline.totals.lines,
    nonblank: 1 - totals.nonblank / baseline.totals.nonblank,
  };
  return { baselineCommit: baseline.commit, baseline: baseline.totals, current: totals,
    projectOwnedVendor: { files: ownedVendorFiles, ...ownedVendorTotals },
    reduction,
    authoredJavaScriptFiles: javascript.length, authoredTypeScriptFiles: typescript.length,
    migrated: javascript.length === 0,
    remainingRuntimeJavaScriptFiles: javascript.filter(file => isSourceFile(file) && /^(js|api|lib|server|shared|bin|vendor)\//.test(file)),
  };
}

export function migrationProgress() {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/typescript-migration-baseline.json'), 'utf8')) as Baseline;
  const inventory = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
  return buildMigrationProgress(root, inventory, baseline);
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const report = migrationProgress();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--check') && !report.migrated) process.exitCode = 1;
}
