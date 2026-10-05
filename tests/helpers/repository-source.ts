import fs from 'node:fs';
import { sourcePath } from '../../scripts/source-files.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Read test fixture sources from this checkout with the caller's existing UTF-8 encoding. */
export function readRepositorySource(relative: string, encoding: 'utf8' | 'utf-8' = 'utf8'): string {
  return fs.readFileSync(path.join(repositoryRoot, relative), encoding);
}

/** Read authored code for source guards; emitted formatting is not part of the source contract. */
export function readAuthoredRepositorySource(relative: string, encoding: 'utf8' | 'utf-8' = 'utf8'): string {
  return fs.readFileSync(sourcePath(path.join(repositoryRoot, relative)), encoding);
}
