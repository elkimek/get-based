import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {beforeAll, afterAll, expect, it, vi} from 'vitest';
import type {BuildOptions, OutputChunk, Plugin} from 'rolldown';

const observed = vi.hoisted(() => ({
  options: null as BuildOptions | null,
  stop: Error('controlled native config capture'),
}));

vi.mock('rolldown', async original => {
  const actual = await original<typeof import('rolldown')>();
  return {
    ...actual,
    build: async (options: BuildOptions) => {
      if (typeof options.input === 'string' && options.input.endsWith('/js/main.js')) {
        observed.options = options;
        throw observed.stop;
      }
      return actual.build(options);
    },
  };
});

// The unrelated companion bundle is not part of browser conditional resolution.
vi.mock('../scripts/build-companion-bundle.mjs', () => ({
  buildCompanionBundle: async () => {},
}));

import {buildProduction} from '../scripts/build-production.mjs';
import {buildSvelte} from '../scripts/build-svelte.mjs';
import {createSvelteFacadePlugin} from '../scripts/svelte-facade-plugin.mjs';

const real = await vi.importActual<typeof import('rolldown')>('rolldown');
const root = process.cwd();
let directory: string;
let sequence = 0;

const captured = () => {
  if (!observed.options) throw Error('Native builder did not pass options');
  return observed.options;
};

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-production-conditions-'));
  await expect(buildProduction({outputRoot: path.join(directory, 'captured')}))
    .rejects.toBe(observed.stop);
});

afterAll(async () => {
  if (directory) await fs.rm(directory, {recursive: true, force: true});
});

interface Parsed {
  id: string;
  imports: readonly string[];
}

async function bundle(source: string, {
  repository = root,
  forceDEV = null,
  resolve = captured().resolve,
  facades = false,
}: {
  repository?: string;
  forceDEV?: 'true.js' | 'dev-fallback.js' | null;
  resolve?: BuildOptions['resolve'];
  facades?: boolean;
} = {}) {
  const input = 'getbased:production-conditions:' + ++sequence;
  const parsed: Parsed[] = [];
  const output = path.join(directory, 'bundle-' + sequence);
  const plugins: Plugin[] = [{
    name: 'controlled-installed-package-entry',
    resolveId(id) {
      if (id === input) return id;
      if (forceDEV && id === 'esm-env/development') {
        return path.join(root, 'node_modules/esm-env', forceDEV);
      }
      return null;
    },
    load: id => id === input ? source : null,
    moduleParsed(info) {
      parsed.push({id: info.id, imports: [...info.importedIds]});
    },
  }];
  if (facades) {
    plugins.push(createSvelteFacadePlugin({root: repository, client: 'compile'}));
  }
  const native = captured();
  if (native.platform === undefined || native.onLog === undefined) {
    throw Error('Missing actual native platform/log ownership');
  }
  const options: BuildOptions = {
    input,
    cwd: repository,
    platform: native.platform,
    ...(resolve ? {resolve} : {}),
    onLog: native.onLog,
    plugins,
    output: {
      dir: output,
      format: 'es',
      entryFileNames: 'entry.mjs',
      chunkFileNames: '[name]-[hash].mjs',
      minify: true,
      sourcemap: true,
    },
  };
  const result = await real.build(options);
  const chunks = result.output.filter((item): item is OutputChunk => item.type === 'chunk');
  return {
    chunks,
    parsed,
    load: async () => (await import(
      pathToFileURL(path.join(output, 'entry.mjs')).href
    )) as Record<string, unknown>,
  };
}

function qualifyDEV(result: Awaited<ReturnType<typeof bundle>>, values: Record<string, unknown>) {
  expect({DEV: values.DEV, BROWSER: values.BROWSER, NODE: values.NODE})
    .toEqual({DEV: false, BROWSER: true, NODE: false});
  const env = result.parsed.find(row => row.id.endsWith('/esm-env/index.js'));
  expect(env).toBeDefined();
  expect(env!.imports.some(id => id.endsWith('/esm-env/false.js'))).toBe(true);
  expect(result.parsed.some(row => /\/esm-env\/(?:dev|browser)-fallback\.js$/.test(row.id)))
    .toBe(false);
  expect(result.parsed.some(row => row.id.endsWith('/esm-env/true.js'))).toBe(true);
}

const flags = "export {DEV,BROWSER,NODE} from 'esm-env';";

it('uses the actual native builder browser/production resolver while retaining existing pipeline ownership and logs', async () => {
  const options = captured();
  expect(options.input).toBe(path.join(root, 'js/main.js'));
  expect(options.platform).toBe('browser');
  expect(options.resolve?.conditionNames).toEqual(['import', 'browser', 'default', 'production']);
  expect(options.transform?.define).toBeUndefined();
  const actualPlugins: unknown = options.plugins;
  if (!Array.isArray(actualPlugins)) throw Error('Actual native plugins are not an array');
  expect(actualPlugins).toHaveLength(5);
  const names = actualPlugins.map((plugin: unknown) => {
    if (!plugin || typeof plugin !== 'object' || !('name' in plugin)
      || typeof plugin.name !== 'string') throw Error('Missing actual native plugin owner');
    return plugin.name;
  });
  expect(names).toEqual([
    'getbased-exact-native-vendor-externals',
    'getbased-shared-svelte-facades',
    'getbased-lazy-retry-imports',
    'getbased-initial-module-graph',
    'getbased-native-retry-inventory',
  ]);
  const result = await bundle(flags);
  qualifyDEV(result, await result.load());
});

it('detects removing the actual production condition through installed package resolution', async () => {
  const conditions = captured().resolve?.conditionNames;
  if (!conditions) throw Error('Missing captured resolver');
  const result = await bundle(flags, {
    resolve: {
      ...captured().resolve,
      conditionNames: conditions.filter(value => value !== 'production'),
    },
  });
  expect(result.parsed.some(row => row.id.endsWith('/esm-env/dev-fallback.js'))).toBe(true);
  expect(() => qualifyDEV(result, {DEV: false, BROWSER: true, NODE: false})).toThrow();
});

it.each(['true.js', 'dev-fallback.js'] as const)('rejects a corrupt DEV package selector independently of its claimed runtime value: %s', async forceDEV => {
  const result = await bundle(flags, {forceDEV});
  const values = await result.load();
  expect(() => qualifyDEV(result, values)).toThrow();
});

function render(module: Record<string, unknown>, view: unknown): string {
  if (typeof module.renderHTML !== 'function') throw Error('Missing genuine renderHTML');
  const value: unknown = module.renderHTML({view});
  if (typeof value !== 'string') throw Error('Invalid genuine HTML');
  return value;
}

it('preserves real SSR lifecycle ownership, exact HTML/SDK, getter order and failures under production browser resolution', async () => {
  const fixture = path.join(directory, 'server-owner');
  await fs.mkdir(path.join(fixture, 'js/components'), {recursive: true});
  await fs.writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
  await fs.symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const component = path.join(fixture, 'js/components/HeaderDateSummary.svelte');
  await fs.writeFile(component, `<script lang="ts">import {onDestroy,onMount,untrack} from 'svelte';let {view}: {view:{text:string;destroyed:()=>void;mounted:()=>void}}=$props();onDestroy(()=>view.destroyed());onMount(()=>view.mounted());const text=untrack(()=>view.text);</script><svelte:options preserveWhitespace={true}/><span>{text}</span>`);
  const originalDir = path.join(fixture, 'original');
  await buildSvelte({component, output: 'html', outputDirectory: originalDir});
  await fs.copyFile(path.join(originalDir, 'HeaderDateSummary.svelte.html.js'), component + '.html.js');
  const original = (await import(
    pathToFileURL(path.join(originalDir, 'HeaderDateSummary.svelte.html.js')).href
  )) as Record<string, unknown>;
  const result = await bundle(
    `export {renderHTML} from ${JSON.stringify(component + '.html.js')};${flags}`,
    {repository: fixture, facades: true},
  );
  const current = await result.load();
  qualifyDEV(result, current);
  expect(result.parsed.some(row => row.id.endsWith('/svelte/src/index-server.js'))).toBe(true);
  expect(result.parsed.some(row => row.id.endsWith('/svelte/src/index-client.js'))).toBe(false);

  for (const fault of [false, true]) {
    const receipt = (module: Record<string, unknown>) => {
      const events: string[] = [];
      let html: string | undefined;
      let error: string | undefined;
      try {
        html = render(module, {
          get text() {
            events.push('text');
            if (fault) throw Error('synthetic text failure');
            return '<literal> & "quoted"';
          },
          destroyed() {
            events.push('destroyed');
          },
          mounted() {
            events.push('mounted');
          },
        });
      } catch (e) {
        error = (e as Error).message;
      }
      return {events, html, error};
    };
    const before = receipt(original);
    expect(receipt(current)).toEqual(before);
    if (!fault) {
      expect(before.events).toContain('destroyed');
      expect(before.events).not.toContain('mounted');
      expect(before.html).toContain('&lt;literal> &amp; "quoted"');
      expect(before.html).toBe('<!--[--><span>&lt;literal> &amp; "quoted"</span><!--]-->');
    } else {
      expect(before.error).toBe('synthetic text failure');
    }
  }

  const mapRows = result.chunks.flatMap(chunk => {
    if (!chunk.map) throw Error('Missing actual source map');
    return JSON.parse(chunk.map.toString()) as {
      sources: string[];
      sourcesContent: Array<string | null>;
    };
  });
  const authored = await fs.readFile(component, 'utf8');
  const mappedSources = mapRows.flatMap(map => map.sources.flatMap((source, index) =>
    source.endsWith('/HeaderDateSummary.svelte') ? [map.sourcesContent[index]] : []));
  expect(mappedSources).toEqual([authored]);
});

it('retains the genuine native client runtime and facade exports alongside folded production flags', async () => {
  const result = await bundle(
    `export {default,mount,unmount,flushSync} from ${JSON.stringify(path.join(root, 'js/components/HeaderRangeButtons.svelte.native.js'))};${flags}`,
    {facades: true},
  );
  expect(result.parsed.some(row => row.id.endsWith('/svelte/src/index-client.js'))).toBe(true);
  expect(result.parsed.some(row => row.id.endsWith('/svelte/src/index-server.js'))).toBe(false);
  const entry = result.chunks.find(chunk => chunk.isEntry);
  expect(entry?.exports.sort()).toEqual([
    'BROWSER', 'DEV', 'NODE', 'default', 'flushSync', 'mount', 'unmount',
  ].sort());
  expect(result.parsed.some(row => row.id.endsWith('/esm-env/dev-fallback.js'))).toBe(false);
});
