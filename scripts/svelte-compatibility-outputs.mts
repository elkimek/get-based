// Compatibility entries keep their public URLs. Only internal chunks use a
// content-derived name. Keep this reader free of dependencies for CI restore.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export const MOBILE_DASHBOARD_PAGE = 'js/components/MobileDashboardPage.svelte';
export const MOBILE_DASHBOARD_STACK = 'js/components/MobileDashboardWidgetStack.svelte';
export const SVELTE_COMPATIBILITY_MANIFEST = 'js/svelte-compatibility.generated.json';
export const SVELTE_COMPATIBILITY_ROOT = 'js/components/AppShell.svelte';
const chunkPath = /(?:^|\/)js\/(?:components|kit)(?:\/[a-zA-Z0-9_-]+)*\/svelte-compat-(?:client|html)-[a-zA-Z0-9_-]{8}\.js$/;

export function isSvelteCompatibilityChunk(file: string): boolean {
  return chunkPath.test(file.replaceAll('\\', '/'));
}

export function isMappedSvelteOutput(file: string): boolean {
  return /\.svelte\.(?:native|html)\.js$/.test(file) || isSvelteCompatibilityChunk(file);
}

export function parseSvelteCompatibilityManifest(body: string): string[] {
  const entries: unknown = JSON.parse(body);
  assert(Array.isArray(entries) && entries.length > 0, 'Nonempty Svelte compatibility manifest');
  for (const file of entries) {
    assert(typeof file === 'string' && file.startsWith('js/') && !file.includes('\\')
      && !file.split('/').some(segment => !segment || segment === '.' || segment === '..') && isSvelteCompatibilityChunk(file),
    'Invalid shared Svelte compatibility chunk');
  }
  const paths = entries as string[];
  assert.deepEqual(paths, [...new Set(paths)].sort(), 'Unique ordered Svelte compatibility chunks');
  return paths;
}

export function readSvelteCompatibilityManifest(root: string): string[] {
  return parseSvelteCompatibilityManifest(fs.readFileSync(path.join(root, SVELTE_COMPATIBILITY_MANIFEST), 'utf8'));
}
