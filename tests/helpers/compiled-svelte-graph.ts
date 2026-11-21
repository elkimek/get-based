import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseAst} from 'rolldown/parseAst';
import {isSvelteCompatibilityChunk, readSvelteCompatibilityManifest} from '../../scripts/svelte-compatibility-outputs.mjs';

interface CompiledOutput {
  file: string;
  source: string;
  map: {sources: string[]; sourcesContent: string[]};
}

/** Follow emitted static Svelte imports without traversing the app's other runtime dependencies. */
export function readCompiledSvelteGraph(entries: readonly string[], root = process.cwd()): CompiledOutput[] {
  const registered = new Set(readSvelteCompatibilityManifest(root));
  const pending = [...entries];
  const seen = new Set<string>();
  const outputs: CompiledOutput[] = [];
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const absolute = path.join(root, file);
    const source = readFileSync(absolute, 'utf8');
    const map = JSON.parse(readFileSync(absolute + '.map', 'utf8')) as CompiledOutput['map'];
    outputs.push({file, source, map});
    for (const declaration of parseAst(source).body) {
      if (declaration.type !== 'ImportDeclaration' && declaration.type !== 'ExportNamedDeclaration' && declaration.type !== 'ExportAllDeclaration') continue;
      const specifier = declaration.source?.value;
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) continue;
      const dependency = path.posix.join(path.posix.dirname(file), specifier);
      if (!isSvelteCompatibilityChunk(dependency)) continue;
      assert(registered.has(dependency), 'Unregistered emitted Svelte dependency: ' + dependency);
      pending.push(dependency);
    }
  }
  return outputs;
}

export function assertCompiledSvelteOwner(owner: string, entry: string, root = process.cwd()): void {
  const authored = path.resolve(root, owner);
  const matches = readCompiledSvelteGraph([entry], root).flatMap(({file, map}) => map.sources.flatMap((name, index) =>
    path.resolve(root, path.dirname(file), name) === authored ? [map.sourcesContent[index]] : []));
  assert.deepEqual(matches, [readFileSync(authored, 'utf8')], 'Actual SDK facade owns exact authored component: ' + owner);
}
