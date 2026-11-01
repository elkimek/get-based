import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {RolldownMagicString, type Plugin, type OutputChunk} from 'rolldown';
import {retryBodyDigest as digest, retryChunkIdentity as identity, retryArraysEqual as same,
  retryReferenceTarget as target, retryChunkSyntax as syntax} from './native-retry-chunks.mjs';

const RETRY = '?lazy-retry=1';
const HASH_SALT = 'getbased-kit-hidden-map-retry-transport-v1';
interface Pair {canonicalId: string; retryId: string}
interface Plan {version: 1; raw: Record<string, string>; pairs: Pair[]}
export interface KitRetrySummary {
  canonicalBodyHashes: Readonly<Record<string, string>>;
  removedPhysicalFiles: number;
  removedPhysicalBodyBytes: number;
}
type Hooks = Pick<Plugin, 'name' | 'buildStart' | 'augmentChunkHash' | 'renderChunk' | 'generateBundle'>;
type KitRetryPlugin = Hooks & {enforce: 'post'; applyToEnvironment(environment: {name: string}): boolean};
interface KitRetryPlugins {
  plugin: KitRetryPlugin; finalizePlugin: KitRetryPlugin;
  resolveDependencies(filename: string, dependencies: string[], context?: {hostId: string}): string[];
}

function readPlan(value: unknown): Plan {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === 'pairs,raw,version'
    && 'version' in value && value.version === 1 && 'raw' in value && value.raw
    && typeof value.raw === 'object' && !Array.isArray(value.raw)
    && Object.values(value.raw).every(code => typeof code === 'string')
    && 'pairs' in value && Array.isArray(value.pairs), 'Exact Kit retry plan required');
  const seen = new Set<string>();
  for (const pair of value.pairs as unknown[]) {
    assert(pair && typeof pair === 'object' && !Array.isArray(pair)
      && Object.keys(pair).sort().join(',') === 'canonicalId,retryId'
      && 'canonicalId' in pair && typeof pair.canonicalId === 'string' && !pair.canonicalId.endsWith(RETRY)
      && 'retryId' in pair && pair.retryId === pair.canonicalId + RETRY
      && Object.hasOwn(value.raw, pair.canonicalId) && Object.hasOwn(value.raw, pair.retryId)
      && !seen.has(pair.canonicalId), 'Invalid Kit retry pair in plan');
    seen.add(pair.canonicalId);
  }
  return value as Plan;
}

export async function readKitRetrySummary(file: string, directory: string): Promise<KitRetrySummary> {
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === 'canonicalBodyHashes,removedPhysicalBodyBytes,removedPhysicalFiles'
    && 'canonicalBodyHashes' in value && value.canonicalBodyHashes && typeof value.canonicalBodyHashes === 'object' && !Array.isArray(value.canonicalBodyHashes)
    && 'removedPhysicalFiles' in value && Number.isSafeInteger(value.removedPhysicalFiles) && Number(value.removedPhysicalFiles) >= 0
    && 'removedPhysicalBodyBytes' in value && Number.isSafeInteger(value.removedPhysicalBodyBytes) && Number(value.removedPhysicalBodyBytes) >= 0,
    'Exact Kit retry summary required');
  const aliases = Object.entries(value.canonicalBodyHashes); let bytes = 0;
  assert.equal(aliases.length, value.removedPhysicalFiles, 'Kit retry alias count differs');
  for (const [url, hash] of aliases) {
    assert(/^\/_app\/immutable\/chunks\/[A-Za-z0-9_-]{8,}\.js$/.test(url)
      && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash), 'Invalid Kit retry proof namespace/hash');
    const body = await fs.readFile(path.join(directory, url.slice(1))); bytes += body.length;
    assert.equal(createHash('sha256').update(body).digest('hex'), hash, 'Kit retry file changed after hashing');
  }
  assert.equal(bytes, value.removedPhysicalBodyBytes, 'Kit retry physical byte count differs');
  return value as KitRetrySummary;
}

function mapIdentity(chunk: OutputChunk): string {
  if (!chunk.map) return '';
  const value: unknown = JSON.parse(chunk.map.toString());
  assert(value && typeof value === 'object' && !Array.isArray(value) && 'sources' in value
    && Array.isArray(value.sources) && value.sources.every(source => typeof source === 'string'), 'Exact source-map sources required');
  const normalized = {...value, sources: value.sources.map((source: string) => source.endsWith(RETRY) ? source.slice(0, -RETRY.length) : source)};
  // Each sidecar names its own physical entry; every mapping, name, source body,
  // source root and extension remains part of the comparison.
  if ('file' in normalized) delete normalized.file;
  return JSON.stringify(normalized);
}
function viteResources(chunk: OutputChunk): {css: string[]; assets: string[]} {
  const metadata: unknown = 'viteMetadata' in chunk ? chunk.viteMetadata : null;
  if (!metadata) return {css: [], assets: []};
  assert(typeof metadata === 'object' && 'importedCss' in metadata && metadata.importedCss instanceof Set
    && 'importedAssets' in metadata && metadata.importedAssets instanceof Set, 'Known Vite resource metadata required');
  const css: unknown[] = [...metadata.importedCss], assets: unknown[] = [...metadata.importedAssets];
  assert(css.every((file): file is string => typeof file === 'string') && assets.every((file): file is string => typeof file === 'string'), 'Exact ordered Vite asset names required');
  return {css, assets};
}
function equalChunks(canonical: OutputChunk, retry: OutputChunk): boolean {
  return canonical.code === retry.code && same(canonical.exports, retry.exports)
    && same(canonical.imports, retry.imports) && same(canonical.dynamicImports, retry.dynamicImports)
    && mapIdentity(canonical) === mapIdentity(retry) && JSON.stringify(viteResources(canonical)) === JSON.stringify(viteResources(retry));
}
function qualify(chunks: OutputChunk[], raw: Record<string, string>): Pair[] {
  const facades = new Map(chunks.filter(chunk => chunk.facadeModuleId).map(chunk => [chunk.facadeModuleId!, chunk]));
  const result: Pair[] = [];
  for (const retry of chunks) {
    const retryId = retry.facadeModuleId;
    if (!retryId?.endsWith(RETRY)) continue;
    const canonicalId = retryId.slice(0, -RETRY.length), canonical = facades.get(canonicalId);
    if (!canonical || canonical.isEntry || retry.isEntry || !equalChunks(canonical, retry)
      || path.posix.dirname(canonical.fileName) !== path.posix.dirname(retry.fileName)
      || chunks.some(chunk => chunk.imports.includes(retry.fileName))
      || [...canonical.imports, ...canonical.dynamicImports].some(file => file === canonical.fileName || file === retry.fileName)) continue;
    const before = raw[identity(canonical)], retryBefore = raw[identity(retry)];
    assert(typeof before === 'string' && typeof retryBefore === 'string', 'Missing Kit prehash source');
    if (syntax(canonical.code).hasImportMeta || syntax(before).hasImportMeta || syntax(retryBefore).hasImportMeta) continue;
    result.push({canonicalId, retryId});
  }
  return result.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}

/** Two independent Vite builds use this same prehash hook; no emitted JS body is
 * edited after hashing. Hidden maps remain published and exact, independently
 * qualified sidecars. The native producer's map/entry rules are unchanged. */
export function createKitRetryChunksPlugin({pass, planFile, summaryFile}: {
  pass: 'inventory' | 'transport'; planFile: string; summaryFile: string;
}): KitRetryPlugins {
  let plan: Plan = {version: 1, raw: {}, pairs: []};
  const raw = new Map<string, string>();
  const graph = new Map<string, {imports: string[]; css: string[]}>(), queryRoots = new Set<string>();
  const plugin: KitRetryPlugin = {
    name: 'getbased-kit-proven-retry-chunks', enforce: 'post',
    applyToEnvironment: environment => environment.name === 'client',
    async buildStart() {
      raw.clear(); graph.clear(); queryRoots.clear();
      if (pass === 'transport') {
        plan = readPlan(JSON.parse(await fs.readFile(planFile, 'utf8')));
      }
    },
    // Changing map-comment mode must never reuse an older immutable filename.
    augmentChunkHash() { return HASH_SALT; },
    renderChunk: {order: 'post', handler(code, chunk, options, metadata) {
      assert.equal(options.sourcemap, 'hidden', 'Kit retry proof requires retained hidden source maps');
      const key = identity(chunk);
      assert(!raw.has(key), 'Duplicate Kit chunk identity'); raw.set(key, code);
      if (pass === 'inventory') return null;
      assert.equal(code, plan.raw[key], 'Non-deterministic Kit prehash input between proof passes');
      const rendered = Object.values(metadata.chunks);
      const replacements = new Map<string, string>();
      for (const pair of plan.pairs) {
        const canonical = rendered.find(item => item.facadeModuleId === pair.canonicalId);
        const retry = rendered.find(item => item.facadeModuleId === pair.retryId);
        assert(canonical && retry, 'Missing second-pass Kit facade');
        replacements.set(retry.fileName, canonical.fileName);
      }
      const transformed = new RolldownMagicString(code); let changed = false;
      for (const reference of syntax(code).references) {
        const canonical = replacements.get(target(chunk.fileName, reference.value));
        if (!canonical) continue;
        assert.equal(reference.kind, 'dynamic', 'Kit retry cannot replace a static dependency');
        const relative = path.posix.relative(path.posix.dirname(chunk.fileName), canonical);
        transformed.overwrite(reference.start, reference.end, JSON.stringify((relative.startsWith('.') ? relative : './' + relative) + RETRY));
        changed = true;
      }
      return changed ? transformed : null;
    }},
    generateBundle(_options, bundle) {
      if (pass !== 'transport') return;
      // Vite's CSS pass precedes post plugins, and its preload pass follows them.
      // Snapshot ordinary data, not binding-backed chunk proxies across hooks.
      const values = Object.values(bundle);
      for (const item of values) graph.set(item.fileName, item.type === 'chunk'
        ? {imports: [...item.imports], css: viteResources(item).css} : {imports: [], css: []});
      for (const pair of plan.pairs) {
        const canonical = values.find(item => item.type === 'chunk' && item.facadeModuleId === pair.canonicalId);
        assert(canonical, 'Missing Kit preload root'); queryRoots.add(canonical.fileName + RETRY);
      }
    },
  };
  const finalizePlugin: KitRetryPlugin = {
    name: 'getbased-kit-retry-final-proof', enforce: 'post',
    applyToEnvironment: environment => environment.name === 'client',
    generateBundle: {order: 'post', async handler(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
      if (pass === 'inventory') {
        const firstRaw = Object.fromEntries(raw);
        await fs.writeFile(planFile, JSON.stringify({version: 1, raw: firstRaw, pairs: qualify(chunks, firstRaw)} satisfies Plan));
        return;
      }
      assert.equal(raw.size, Object.keys(plan.raw).length, 'Kit chunk inventory changed between proof passes');
      const facades = new Map(chunks.filter(chunk => chunk.facadeModuleId).map(chunk => [chunk.facadeModuleId!, chunk]));
      const removed = new Map<string, string>(), aliases: Record<string, string> = {};
      let removedPhysicalBodyBytes = 0;
      for (const pair of plan.pairs) {
        const canonical = facades.get(pair.canonicalId), retry = facades.get(pair.retryId);
        assert(canonical && retry && !canonical.isEntry && !retry.isEntry && equalChunks(canonical, retry)
          && path.posix.dirname(canonical.fileName) === path.posix.dirname(retry.fileName)
          && ![...canonical.imports, ...canonical.dynamicImports].some(file => file === canonical.fileName || file === retry.fileName),
          'Final Kit retry body, mappings or resources differ');
        assert(!syntax(canonical.code).hasImportMeta, 'Final Kit retry gained import.meta');
        const url = '/' + canonical.fileName;
        assert(/^\/_app\/immutable\/chunks\/[A-Za-z0-9_-]{8,}\.js$/.test(url), 'Closed Kit retry namespace required');
        aliases[url] = digest(canonical.code); removed.set(retry.fileName, canonical.fileName);
        removedPhysicalBodyBytes += Buffer.byteLength(retry.code);
      }
      for (const chunk of chunks) {
        for (const reference of syntax(chunk.code).references) assert(!removed.has(target(chunk.fileName, reference.value)), 'Emitted Kit code references a removed retry');
        assert(chunk.imports.every(file => !removed.has(file)), 'Static Kit graph references a removed retry');
        chunk.dynamicImports = chunk.dynamicImports.map(file => removed.has(file) ? removed.get(file)! + RETRY : file);
      }
      // These unhashed metadata assets describe logical module URLs. Keep their
      // source keys and resource lists; only a removed physical target changes.
      const manifest = bundle['.vite/manifest.json'];
      if (manifest?.type === 'asset') {
        const value: unknown = JSON.parse(typeof manifest.source === 'string' ? manifest.source : Buffer.from(manifest.source).toString('utf8'));
        assert(value && typeof value === 'object' && !Array.isArray(value), 'Known Vite manifest required');
        for (const record of Object.values(value)) if (record && typeof record === 'object' && 'file' in record && typeof record.file === 'string') {
          const canonical = removed.get(record.file); if (canonical) record.file = canonical + RETRY;
        }
        manifest.source = JSON.stringify(value, null, 2);
      }
      const ssrManifest = bundle['.vite/ssr-manifest.json'];
      if (ssrManifest?.type === 'asset') {
        const value: unknown = JSON.parse(typeof ssrManifest.source === 'string' ? ssrManifest.source : Buffer.from(ssrManifest.source).toString('utf8'));
        assert(value && typeof value === 'object' && !Array.isArray(value), 'Known Vite SSR manifest required');
        for (const entries of Object.values(value)) if (Array.isArray(entries)) for (let index = 0; index < entries.length; index++) {
          const file: unknown = entries[index]; if (typeof file !== 'string') continue;
          const canonical = removed.get(file.startsWith('/') ? file.slice(1) : file);
          if (canonical) entries[index] = (file.startsWith('/') ? '/' : '') + canonical + RETRY;
        }
        ssrManifest.source = JSON.stringify(value, null, 2);
      }
      for (const file of removed.keys()) { delete bundle[file]; delete bundle[file + '.map']; }
      await fs.writeFile(summaryFile, JSON.stringify({canonicalBodyHashes: aliases,
        removedPhysicalFiles: removed.size, removedPhysicalBodyBytes} satisfies KitRetrySummary));
    }},
  };
  return {plugin, finalizePlugin,
    resolveDependencies(filename, dependencies, context) {
      if (!queryRoots.has(filename)) return dependencies;
      const canonical = filename.slice(0, -RETRY.length), seen = new Set<string>(), result = new Set<string>();
      const visit = (file: string) => {
        if (file === context?.hostId || seen.has(file)) return;
        seen.add(file); const node = graph.get(file); if (!node) return;
        result.add(file === canonical ? filename : file);
        node.imports.forEach(visit); node.css.forEach(css => result.add(css));
      };
      visit(canonical);
      return result.size > 1 ? [...result] : [];
    },
  };
}
