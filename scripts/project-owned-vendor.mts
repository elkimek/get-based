import fs from 'node:fs';
import path from 'node:path';
import { matchingFiles } from './supply-chain.mjs';
import { isSourceFile, runtimePath, walkSourceFiles } from './source-files.js';

// Exact inventory matching preserves migration accounting for both authored
// siblings. Runtime alias matching is a separate executable-collector concern.
export function projectOwnedVendorFiles(manifest: string | undefined, inventory: readonly string[]): ReadonlySet<string> {
  if (manifest === undefined) return new Set();
  const metadata: unknown = JSON.parse(manifest);
  if (!metadata || typeof metadata !== 'object' || !('projectFiles' in metadata) || !Array.isArray(metadata.projectFiles)) {
    throw new Error('vendor/components.json must contain a projectFiles array');
  }
  const patterns: readonly unknown[] = metadata.projectFiles;
  const matched = new Set<string>();
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern.startsWith('vendor/') || pattern.endsWith('/')
      || pattern.includes('\\') || pattern.includes('\0') || path.posix.normalize(pattern) !== pattern) {
      throw new Error('vendor/components.json projectFiles must contain canonical paths inside vendor/');
    }
    for (const file of matchingFiles(pattern, inventory)) matched.add(file);
  }
  return matched;
}

// Ownership is declared by the supply-chain inventory, not vendor placement.
// A declared owned.js remains executable-owned after migration to owned.ts.
export function projectOwnedVendorSources(manifest: string | undefined, inventory: readonly string[]): string[] {
  const executable = inventory.filter(file => file.startsWith('vendor/') && isSourceFile(file));
  const aliases = [...new Set(executable.flatMap(file => [file, runtimePath(file)]))];
  const matched = projectOwnedVendorFiles(manifest, aliases);
  return [...new Set(executable.filter(file => matched.has(file) || matched.has(runtimePath(file))))].sort();
}

export function readVendorManifest(root: string): string | undefined {
  const file = path.join(root, 'vendor/components.json');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

export function ownedVendorSources(root: string): string[] {
  const inventory = walkSourceFiles(path.join(root, 'vendor')).map(file => path.relative(root, file).split(path.sep).join('/'));
  return projectOwnedVendorSources(readVendorManifest(root), inventory);
}
