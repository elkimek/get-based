#!/usr/bin/env node
// Emit JavaScript at the existing runtime URLs. TypeScript is the only authored
// source for migrated modules; generated siblings are ignored by Git.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');

export function buildTypeScript(): void {
  for (const config of ['tsconfig.migration.json', 'tsconfig.worker-migration.json']) {
    execFileSync(process.execPath, [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p', path.join(root, config),
    ], { cwd: root, stdio: 'inherit' });
  }
  // TS7 always emits strict mode. Classic workers retain their original execution
  // mode; this affects emission only, and every source still passes strict checks.
  for (const name of ['service-worker', 'service-worker-runtime', 'service-worker-assets', 'version']) {
    const output = path.join(root, name + '.js');
    writeFileSync(output, readFileSync(output, 'utf8').replace(/^"use strict";\r?\n/, ''));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) buildTypeScript();
