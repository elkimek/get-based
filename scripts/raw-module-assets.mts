import { parseModuleSpecifiersBatch } from './architecture-map.mjs';

const MODULE_BATCH_SIZE = 32;

/** Raw workers are outside the app bundle; retain their emitted import graph. */
export async function collectRawModuleAssets(
  roots: ReadonlySet<string>,
  readModule: (url: string) => Promise<string>,
): Promise<Set<string>> {
  const origin = 'https://raw-module-build.invalid';
  const pending = new Set(roots);
  const graph = new Map<string, string[]>();

  while (pending.size) {
    const batch = [...pending].slice(0, MODULE_BATCH_SIZE);
    const sources = new Map(await Promise.all(batch.map(async url => [url, await readModule(url)] as const)));
    for (const [url, { dependencies }] of parseModuleSpecifiersBatch(sources)) {
      const targets: string[] = [];
      graph.set(url, targets);
      for (const { specifier } of dependencies) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
        const target = new URL(specifier, origin + url);
        if (target.origin !== origin) continue;
        if (!/\.[cm]?js$/.test(target.pathname)) {
          throw new Error(`Raw module dependency is not JavaScript: ${url} -> ${specifier}`);
        }
        targets.push(target.pathname);
        if (!graph.has(target.pathname)) pending.add(target.pathname);
      }
    }
    for (const url of batch) pending.delete(url);
  }

  // Retain the existing depth-first asset order after the batched discovery.
  const assets = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const url = stack.pop()!;
    if (assets.has(url)) continue;
    assets.add(url);
    for (const target of graph.get(url)!) stack.push(target);
  }
  return assets;
}
