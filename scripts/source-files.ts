import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
const TYPESCRIPT_EXTENSION: Record<string, string> = { '.js': '.ts', '.mjs': '.mts', '.cjs': '.cts' };
const JAVASCRIPT_EXTENSION: Record<string, string> = { '.ts': '.js', '.mts': '.mjs', '.cts': '.cjs' };

/** Resolve an existing runtime URL to its authored source, preferring TS. */
export function sourcePath(file: string): string {
  const extension = path.extname(file);
  const replacement = TYPESCRIPT_EXTENSION[extension];
  const candidate = replacement ? file.slice(0, -extension.length) + replacement : file;
  return fs.existsSync(candidate) ? candidate : file;
}

export function runtimePath(file: string): string {
  const extension = path.extname(file);
  return JAVASCRIPT_EXTENSION[extension]
    ? file.slice(0, -extension.length) + JAVASCRIPT_EXTENSION[extension] : file;
}

export function isSourceFile(file: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(file)) && !/\.d\.[cm]?ts$/.test(file);
}

/** Generated JS siblings never count as additional source modules. */
export function walkSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const authored = sourcePath(directory);
  if (fs.statSync(authored).isFile()) return isSourceFile(authored) ? [authored] : [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(file);
    return entry.isFile() && isSourceFile(file) && sourcePath(file) === file ? [file] : [];
  }).sort();
}
