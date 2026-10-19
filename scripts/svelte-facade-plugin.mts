// Optimized builds retain native facade import URLs while sharing installed
// runtime modules. Standalone development/coverage outputs are unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import type {PluginContext, ResolveIdResult, LoadResult} from 'rolldown';
import {HTML_COMPONENTS, HYDRATABLE_COMPONENTS, compileAuthoredComponent} from './build-svelte.mjs';

// NUL-prefixed IDs suppress authored maps in Rolldown. This closed namespace
// remains private to the resolver while retaining genuine source coordinates.
const PREFIX = 'getbased:svelte:';
const RETRY = '?lazy-retry=1';
const SUFFIX = '.compiled.js';

// Kit's rune-module pass must not recompile these already compiled modules.
// The loader still validates containment/mode before providing their code.
export function compiledSvelteModulePattern(root: string): RegExp {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escape(PREFIX) + '(?:client|html):'
    + escape(path.join(path.resolve(root), 'js') + path.sep) + '.+\\.svelte' + escape(SUFFIX) + '$');
}
type Mode = 'client' | 'html';
type Options = {root: string; client: 'compile' | 'kit'; facadeRoot?: string};
// Only these two hooks cross the Rolldown/Vite boundary. Exposing every optional
// Plugin hook made TypeScript recursively compare unrelated bundler APIs.
type FacadePlugin = {
  name: string;
  resolveId(this: Pick<PluginContext, 'resolve'>, source: string, importer: string | undefined): Promise<ResolveIdResult>;
  load(id: string): Promise<LoadResult>;
};

export function createSvelteFacadePlugin({root, client, facadeRoot}: Options): FacadePlugin {
  if (facadeRoot !== undefined && (!path.isAbsolute(facadeRoot) || path.resolve(facadeRoot) !== facadeRoot)) throw new Error('Canonical facade producer root required');
  // Only expected wrapper text may use a transported producer namespace.
  // Resolution, filesystem reads and compilation remain owned by the local root.
  const facadeFile = (file: string) => facadeRoot === undefined ? file : path.join(facadeRoot, path.relative(path.resolve(root), file));
  const js = path.join(path.resolve(root), 'js') + path.sep;
  const sveltePackage = createRequire(path.join(path.resolve(root), 'package.json')).resolve('svelte/package.json');
  // HTML compatibility entries used neutral resolution. Preserve its public
  // server lifecycle/store exports when the enclosing build targets browsers.
  const serverDefaults = new Map([
    ['svelte', './src/index-server.js'], ['svelte/store', './src/store/index-server.js'],
    ['svelte/legacy', './src/legacy/legacy-server.js'], ['svelte/reactivity', './src/reactivity/index-server.js'],
  ]);
  let packageDefaults: Promise<Record<string, {default?: unknown}>> | undefined;
  async function serverExport(specifier: string): Promise<string | null> {
    const expected = serverDefaults.get(specifier);
    if (!expected) return null;
    packageDefaults ??= fs.readFile(sveltePackage, 'utf8').then(text => {
      const value: {exports: Record<string, {default?: unknown}>} = JSON.parse(text);
      return value.exports;
    });
    const key = specifier === 'svelte' ? '.' : './' + specifier.slice(7);
    if ((await packageDefaults)[key]?.default !== expected) throw new Error('Installed Svelte server export changed');
    return path.resolve(path.dirname(sveltePackage), expected);
  }
  const owned = (file: string) => file.startsWith(js) && path.resolve(file) === file && file.endsWith('.svelte');
  const virtual = (file: string, mode: Mode) => PREFIX + mode + ':' + facadeFile(file) + SUFFIX;
  function component(id: string): {file: string; mode: Mode} | null {
    if (!id.startsWith(PREFIX)) return null;
    const rest = id.slice(PREFIX.length), separator = rest.indexOf(':');
    const mode = rest.slice(0, separator), file = rest.slice(separator + 1, -SUFFIX.length);
    if ((mode !== 'client' && mode !== 'html') || !id.endsWith(SUFFIX) || !owned(file)) {
      throw new Error('Invalid authored Svelte virtual module');
    }
    return {file, mode};
  }
  return {
    name: 'getbased-shared-svelte-facades',
    async resolveId(source, importer) {
      if (source.startsWith(PREFIX)) {component(source); return source;}
      const parent = importer ? component(importer) : null;
      if (parent) {
        const server = parent.mode === 'html' ? await serverExport(source) : null;
        if (server) return server;
        // Resolve from the authored filename, not the virtual module name.
        // Child components compile in the parent's mode; ordinary JS edges
        // retain the existing resolver/retry/asset behavior.
        const resolved = await this.resolve(source, parent.file, {skipSelf: true});
        if (!resolved) return null;
        if (resolved.id.endsWith('.svelte')) {
          if (resolved.external || !owned(resolved.id)) throw new Error('Unowned authored Svelte child');
          return virtual(resolved.id, parent.mode);
        }
        return resolved;
      }
      // The installed synchronous server renderer retains this unused optional
      // async dependency, exactly as the standalone compatibility builder does.
      if (source === 'node:async_hooks' && importer
        && importer.replaceAll('\\', '/').endsWith('/node_modules/svelte/src/internal/server/render-context.js')) {
        return {id: source, external: true};
      }
      return null;
    },
    async load(id) {
      const source = component(id);
      if (source) {
        const authored = await fs.readFile(source.file, 'utf8');
        const compiled = compileAuthoredComponent(authored, source.file, source.mode);
        // Svelte names this sole source by basename. Resolve it against the
        // authored file, never our private virtual ID; retain every mapping.
        if (compiled.map.sources.length !== 1 || compiled.map.sources[0] !== path.basename(source.file)
          || compiled.map.sourcesContent?.length !== 1 || compiled.map.sourcesContent[0] !== authored) {
          throw new Error('Unqualified authored Svelte source map');
        }
        return {code: compiled.code, map: {...compiled.map, sources: [source.file]}};
      }
      const file = id.endsWith(RETRY) ? id.slice(0, -RETRY.length) : id;
      if (!file.startsWith(js)) return null;
      const match = file.match(/\.svelte\.(native|html)\.js$/);
      if (!match) return null;
      const authored = file.slice(0, -(match[1]!.length + 4));
      if (!owned(authored)) throw new Error('Invalid native Svelte facade');
      if (match[1] === 'html') {
        if (path.dirname(authored) !== path.join(path.resolve(root), 'js/components')
          || !HTML_COMPONENTS.has(path.basename(authored, '.svelte'))) throw new Error('Unregistered HTML facade');
        return `import Component from ${JSON.stringify(virtual(authored, 'html'))}; import {render} from 'svelte/server'; export const renderHTML = props => render(Component, {props}).body;`;
      }
      if (client === 'kit') {
        // This is the existing Kit adapter, now owned in one shared place.
        return `export {default} from ${JSON.stringify(facadeFile(authored))}; export {mount, unmount, flushSync, hydrate} from 'svelte';`;
      }
      return `export {default} from ${JSON.stringify(virtual(authored, 'client'))}; export {mount, unmount, flushSync${HYDRATABLE_COMPONENTS.has(path.basename(authored, '.svelte')) ? ', hydrate' : ''}} from 'svelte';`;
    },
  };
}
