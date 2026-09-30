#!/usr/bin/env node
// Emit JavaScript at the existing runtime URLs. TypeScript is the only authored
// source for migrated modules; generated siblings are ignored by Git.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');

export function buildTypeScript(): void {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p', path.join(root, 'tsconfig.migration.json'),
  ], { cwd: root, stdio: 'inherit' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) buildTypeScript();
