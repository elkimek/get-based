import { parseModuleSpecifiers } from './architecture-map.mjs';

/** Raw workers are outside the app bundle; retain their emitted import graph. */
export async function collectRawModuleAssets(
  roots: ReadonlySet<string>,
  readModule: (url: string) => Promise<string>,
): Promise<Set<string>> {
  const assets = new Set<string>();
  const pending = [...roots];
  const origin = 'https://raw-module-build.invalid';
  while (pending.length) {
    const url = pending.pop()!;
    if (assets.has(url)) continue;
    assets.add(url);
    const source = await readModule(url);
    const { dependencies } = parseModuleSpecifiers(source, url);
    for (const { specifier } of dependencies) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
      const target = new URL(specifier, origin + url);
      if (target.origin !== origin) continue;
      if (!/\.[cm]?js$/.test(target.pathname)) {
        throw new Error(`Raw module dependency is not JavaScript: ${url} -> ${specifier}`);
      }
      pending.push(target.pathname);
    }
  }
  return assets;
}
